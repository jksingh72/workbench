import fs from 'node:fs'
import path from 'node:path'
import {
  RekognitionClient,
  IndexFacesCommand,
  SearchFacesByImageCommand,
  ListFacesCommand,
  DetectLabelsCommand,
  DetectTextCommand,
} from '@aws-sdk/client-rekognition'

export interface RekognitionAddFaceParams {
  imagePath: string
  collectionId?: string
  externalImageId?: string
  personName?: string
  detectionAttributes?: ('DEFAULT' | 'ALL')[]
}

export interface RekognitionCheckFaceParams {
  imagePath: string
  collectionId?: string
  matchThreshold?: number
  maxFaces?: number
}

export class RekognitionService {
  private static instance: RekognitionService | null = null
  private client: RekognitionClient

  private constructor() {
    const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1'
    this.client = new RekognitionClient({ region })
  }

  public static getInstance(): RekognitionService {
    if (!RekognitionService.instance) {
      RekognitionService.instance = new RekognitionService()
    }
    return RekognitionService.instance
  }

  /**
   * Helper to resolve local file path and load image bytes.
   */
  private loadImageBytes(filePath: string): Uint8Array {
    const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath)
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Image file not found: "${resolvedPath}"`)
    }
    const buffer = fs.readFileSync(resolvedPath)
    if (buffer.length > 5 * 1024 * 1024) {
      throw new Error(`Image size (${(buffer.length / 1024 / 1024).toFixed(1)}MB) exceeds Amazon Rekognition direct upload limit (5MB). Please use a smaller image.`)
    }
    return new Uint8Array(buffer)
  }

  /**
   * Registers/indexes faces from an image into an Amazon Rekognition collection.
   */
  public async addFace(params: RekognitionAddFaceParams) {
    const collectionId = (params.collectionId || 'workbench-faces').trim()
    const imageBytes = this.loadImageBytes(params.imagePath)

    // Sanitize ExternalImageId (AWS Rekognition allows [a-zA-Z0-9_.\-:]+ up to 255 chars)
    const rawId = (params.personName || params.externalImageId || '').trim()
    const sanitizedId = rawId ? rawId.replace(/[^a-zA-Z0-9_.\-:]/g, '_').substring(0, 255) : undefined

    const command = new IndexFacesCommand({
      CollectionId: collectionId,
      Image: { Bytes: imageBytes },
      ExternalImageId: sanitizedId,
      DetectionAttributes: params.detectionAttributes || ['DEFAULT'],
      MaxFaces: 5,
      QualityFilter: 'AUTO',
    })

    const response = await this.client.send(command)
    const indexedFaces = response.FaceRecords || []

    return {
      success: indexedFaces.length > 0,
      collectionId,
      personName: params.personName || params.externalImageId || 'Unknown',
      externalImageId: sanitizedId,
      facesIndexed: indexedFaces.length,
      faceRecords: indexedFaces.map((f) => ({
        faceId: f.Face?.FaceId,
        confidence: Math.round((f.Face?.Confidence || 0) * 10) / 10,
        boundingBox: f.Face?.BoundingBox,
        externalImageId: f.Face?.ExternalImageId,
      })),
      unindexedFacesCount: response.UnindexedFaces?.length || 0,
    }
  }

  /**
   * Searches/verifies a face in an image against an Amazon Rekognition collection.
   */
  public async checkFace(params: RekognitionCheckFaceParams) {
    const collectionId = (params.collectionId || 'workbench-faces').trim()
    const matchThreshold = typeof params.matchThreshold === 'number' ? params.matchThreshold : 85
    const maxFaces = typeof params.maxFaces === 'number' ? params.maxFaces : 5
    const imageBytes = this.loadImageBytes(params.imagePath)

    const command = new SearchFacesByImageCommand({
      CollectionId: collectionId,
      Image: { Bytes: imageBytes },
      FaceMatchThreshold: matchThreshold,
      MaxFaces: maxFaces,
    })

    const response = await this.client.send(command)
    const matches = response.FaceMatches || []

    return {
      success: true,
      hasMatch: matches.length > 0,
      collectionId,
      matchThreshold,
      matchCount: matches.length,
      searchedFaceBoundingBox: response.SearchedFaceBoundingBox,
      searchedFaceConfidence: response.SearchedFaceConfidence
        ? Math.round(response.SearchedFaceConfidence * 10) / 10
        : undefined,
      matches: matches.map((m) => ({
        similarity: Math.round((m.Similarity || 0) * 10) / 10,
        faceId: m.Face?.FaceId,
        personName: m.Face?.ExternalImageId ? m.Face.ExternalImageId.replace(/_/g, ' ') : 'Unknown',
        externalImageId: m.Face?.ExternalImageId,
        confidence: Math.round((m.Face?.Confidence || 0) * 10) / 10,
      })),
    }
  }

  /**
   * Lists indexed faces in an Amazon Rekognition collection.
   */
  public async listFaces(collectionId: string = 'workbench-faces') {
    const command = new ListFacesCommand({
      CollectionId: collectionId.trim(),
      MaxResults: 50,
    })

    const response = await this.client.send(command)
    return {
      success: true,
      collectionId,
      faces: (response.Faces || []).map((f) => ({
        faceId: f.FaceId,
        personName: f.ExternalImageId ? f.ExternalImageId.replace(/_/g, ' ') : 'Unknown',
        externalImageId: f.ExternalImageId,
        confidence: Math.round((f.Confidence || 0) * 10) / 10,
      })),
    }
  }

  /**
   * Detects labels (objects, scenes, activities) in an image.
   */
  public async detectLabels(imagePath: string, maxLabels: number = 20, minConfidence: number = 70) {
    const imageBytes = this.loadImageBytes(imagePath)
    const command = new DetectLabelsCommand({
      Image: { Bytes: imageBytes },
      MaxLabels: maxLabels,
      MinConfidence: minConfidence,
    })

    const response = await this.client.send(command)
    return {
      success: true,
      labels: (response.Labels || []).map((l) => ({
        name: l.Name,
        confidence: Math.round((l.Confidence || 0) * 10) / 10,
        categories: (l.Categories || []).map((c) => c.Name),
      })),
    }
  }

  /**
   * Performs OCR text recognition in an image.
   */
  public async detectText(imagePath: string) {
    const imageBytes = this.loadImageBytes(imagePath)
    const command = new DetectTextCommand({
      Image: { Bytes: imageBytes },
    })

    const response = await this.client.send(command)
    const textDetections = response.TextDetections || []
    const lines = textDetections.filter((t) => t.Type === 'LINE').map((t) => t.DetectedText || '')

    return {
      success: true,
      fullText: lines.join('\n'),
      lines: textDetections
        .filter((t) => t.Type === 'LINE')
        .map((t) => ({
          text: t.DetectedText,
          confidence: Math.round((t.Confidence || 0) * 10) / 10,
        })),
    }
  }
}
