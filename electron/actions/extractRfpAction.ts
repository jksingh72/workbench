import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import AdmZip from 'adm-zip'
import mammoth from 'mammoth'
import { ActionDefinition, ActionContext, ActionResult } from './types'

export interface ExtractedFileInfo {
  name: string
  relPath: string
  type: 'pdf' | 'docx' | 'txt' | 'other'
  pages: number
  bytes: number
  sha256: string
  extractedChars: number
  hasTextLayer: boolean
  extractedTextFile: string
  warning?: string
}

export interface RfpManifest {
  extractedAt: string
  folder: string
  totalFiles: number
  totalPdfPages: number
  scannedFilesWithoutText: string[]
  files: ExtractedFileInfo[]
}

export interface ZipEntryCheck {
  name: string
  sizeBytes: number
}

function computeSha256(filePath: string): string {
  const fileBuffer = fs.readFileSync(filePath)
  return crypto.createHash('sha256').update(fileBuffer).digest('hex')
}

function sanitizeTextFileName(fileName: string): string {
  const parsed = path.parse(fileName)
  const cleanBase = parsed.name.replace(/[<>:"/\\|?*]/g, '_')
  return `${cleanBase}.txt`
}

export function isExcludedFileOrDir(nameOrRelPath: string): boolean {
  const norm = nameOrRelPath.replace(/\\/g, '/')
  const parts = norm.split('/')
  const baseName = parts[parts.length - 1]

  // Folders to exclude
  const excludedFolderPatterns = [
    /^_extracted$/i,
    /^_test$/i,
    /^Resp-format-docs$/i,
    /^old-files$/i,
    /^Old-files-.*$/i,
  ]

  for (const part of parts.slice(0, -1)) {
    if (excludedFolderPatterns.some((rx) => rx.test(part))) {
      return true
    }
  }

  if (excludedFolderPatterns.some((rx) => rx.test(baseName))) {
    return true
  }

  // File patterns to never extract:
  // *-report-v*, *-Section-Summary-v*, Layer*-Prompt-*, rfp-facts-*.json, hidden files
  const excludedFilePatterns = [
    /.*-report-v.*/i,
    /.*-Section-Summary-v.*/i,
    /^Layer.*-Prompt-.*/i,
    /^rfp-facts-.*\.json$/i,
    /^\./, // hidden files
  ]

  if (excludedFilePatterns.some((rx) => rx.test(baseName))) {
    return true
  }

  return false
}

async function extractPdfTextByPages(filePath: string): Promise<{
  formattedText: string
  totalPages: number
  hasTextLayer: boolean
  totalChars: number
}> {
  const buffer = await fs.promises.readFile(filePath)
  const pdfParseModule: any = await import('pdf-parse')

  if (pdfParseModule.PDFParse) {
    const parser = new pdfParseModule.PDFParse({ data: buffer })
    try {
      const res = await parser.getText()
      const totalPages = res.total || (res.pages ? res.pages.length : 1)
      const pageSections: string[] = []
      let totalChars = 0

      if (Array.isArray(res.pages) && res.pages.length > 0) {
        for (const p of res.pages) {
          const raw = (p.text || '').replace(/\r\n/g, '\n').trim()
          totalChars += raw.length
          pageSections.push(`-- page ${p.num || pageSections.length + 1} --\n${raw}`)
        }
      } else {
        const raw = (res.text || '').replace(/\r\n/g, '\n').trim()
        totalChars = raw.length
        pageSections.push(`-- page 1 --\n${raw}`)
      }

      const formattedText = pageSections.join('\n\n')
      const hasTextLayer = totalChars > 20 // If less than 20 chars across the entire PDF, likely an image scan
      return { formattedText, totalPages, hasTextLayer, totalChars }
    } finally {
      if (typeof parser.destroy === 'function') {
        try {
          await parser.destroy()
        } catch (_) {}
      }
    }
  } else {
    // pdf-parse v1 fallback
    const parseFn = typeof pdfParseModule.default === 'function' ? pdfParseModule.default : pdfParseModule
    const data = await parseFn(buffer)
    const raw = (data.text || '').replace(/\r\n/g, '\n').trim()
    const totalPages = data.numpages || 1
    const totalChars = raw.length
    const formattedText = `-- page 1 --\n${raw}`
    const hasTextLayer = totalChars > 20
    return { formattedText, totalPages, hasTextLayer, totalChars }
  }
}

export const extractRfpAction: ActionDefinition = {
  id: 'extract_rfp',
  aliases: ['unpack_rfp', 'process_rfp', 'extract_rfp_package', 'unzip_and_extract_rfp'],
  description:
    'Unpacks and extracts full text from RFP source documents (.pdf, .docx, .txt). If a zip archive exists, extracts only files from the zip (plus optional `include` list). Cleans stale extracted text files, excludes reports and prompts, tracks OCR text layer presence, and writes a manifest.json with hashes and page counts.',
  parameters: {
    folder: {
      type: 'string',
      required: true,
      description: 'The target folder containing the RFP documents or zip archive (relative to active directory or absolute).',
    },
    zip: {
      type: 'string',
      required: false,
      description: 'Optional name or path of a specific zip file to extract. If omitted and a .zip exists in folder, it will be automatically unpacked.',
    },
    include: {
      type: 'array',
      required: false,
      description: 'Optional list of additional specific file names to extract alongside zip contents.',
    },
    overwrite: {
      type: 'boolean',
      required: false,
      description: 'Whether to overwrite existing unzipped or extracted text files (default: false).',
      default: false,
    },
  },
  example: {
    action: 'extract_rfp',
    folder: 'RFP-3',
    overwrite: false,
  },
  async execute(ctx: ActionContext, payload: any, targetPane = 'book'): Promise<ActionResult> {
    const params = payload.params || {}
    const folderRaw = params.folder ?? payload.folder ?? params.path ?? payload.path
    if (!folderRaw) {
      throw new Error('Missing required parameter "folder"')
    }

    const resolvedFolder = ctx.resolveSafePath(folderRaw, targetPane)
    if (!fs.existsSync(resolvedFolder)) {
      throw new Error(`Target folder does not exist: "${folderRaw}"`)
    }

    const overwrite = Boolean(params.overwrite ?? payload.overwrite ?? false)
    const includeRaw = params.include ?? payload.include ?? params.includes ?? payload.includes
    const additionalIncludes: string[] = Array.isArray(includeRaw)
      ? includeRaw.map((s) => String(s).trim())
      : typeof includeRaw === 'string' && includeRaw.trim()
      ? includeRaw.split(',').map((s) => s.trim())
      : []

    console.log(`[extract_rfp:START] Processing RFP directory: "${resolvedFolder}" (overwrite: ${overwrite})`)

    // 1. Check for Zip Archive extraction
    const zipNameOrPath = params.zip ?? payload.zip
    let targetZipPath: string | null = null

    if (zipNameOrPath) {
      const explicitZip = path.isAbsolute(zipNameOrPath)
        ? zipNameOrPath
        : path.resolve(resolvedFolder, zipNameOrPath)
      if (fs.existsSync(explicitZip)) {
        targetZipPath = explicitZip
      }
    } else {
      // Auto-detect if a .zip exists in the folder
      const allFiles = await fs.promises.readdir(resolvedFolder)
      const zipCandidates = allFiles.filter(
        (f) => f.toLowerCase().endsWith('.zip') && !isExcludedFileOrDir(f)
      )
      if (zipCandidates.length >= 1) {
        // Use the first non-excluded zip file (or exact single zip)
        targetZipPath = path.join(resolvedFolder, zipCandidates[0])
      }
    }

    const zipCheckResults: ZipEntryCheck[] = []
    const unpackedFiles: string[] = []
    const skippedExistingFiles: string[] = []
    const zipExtractedFileNames = new Set<string>()

    if (targetZipPath && fs.existsSync(targetZipPath)) {
      console.log(`[extract_rfp:UNZIP] Found zip archive: "${targetZipPath}". Reading entries...`)
      try {
        const zip = new AdmZip(targetZipPath)
        const entries = zip.getEntries()

        for (const entry of entries) {
          if (entry.isDirectory) continue
          const entryName = entry.entryName

          // Check if excluded
          if (isExcludedFileOrDir(entryName)) {
            continue
          }

          const uncompressedSize = entry.header ? entry.header.size : 0
          zipCheckResults.push({
            name: entryName,
            sizeBytes: uncompressedSize,
          })
          zipExtractedFileNames.add(path.basename(entryName))

          const destPath = path.join(resolvedFolder, entryName)
          const destDir = path.dirname(destPath)

          if (!fs.existsSync(destDir)) {
            await fs.promises.mkdir(destDir, { recursive: true })
          }

          if (!fs.existsSync(destPath) || overwrite) {
            zip.extractEntryTo(entry, destDir, false, true)
            unpackedFiles.push(entryName)
          } else {
            skippedExistingFiles.push(entryName)
          }
        }
        console.log(
          `[extract_rfp:UNZIP] Archive check: ${zipCheckResults.length} entries, ${unpackedFiles.length} newly unpacked, ${skippedExistingFiles.length} skipped existing.`
        )
      } catch (zipErr: any) {
        console.warn(`[extract_rfp:UNZIP:WARN] Error unpacking zip file:`, zipErr.message)
      }
    }

    // 2. Prepare _extracted directory
    const extractedDir = path.join(resolvedFolder, '_extracted')
    if (!fs.existsSync(extractedDir)) {
      await fs.promises.mkdir(extractedDir, { recursive: true })
    }

    // 3. Determine source file candidates to extract text from
    // If a zip archive was found, extract ONLY the files that came from the zip + explicit includes.
    // If no zip was found, scan the folder and exclude any created/temporary files.
    const candidateFileNames: string[] = []

    if (targetZipPath && zipCheckResults.length > 0) {
      for (const zc of zipCheckResults) {
        if (!candidateFileNames.includes(zc.name)) {
          candidateFileNames.push(zc.name)
        }
      }
      for (const inc of additionalIncludes) {
        if (!candidateFileNames.includes(inc)) {
          candidateFileNames.push(inc)
        }
      }
    } else {
      const folderEntries = await fs.promises.readdir(resolvedFolder, { withFileTypes: true })
      for (const ent of folderEntries) {
        if (ent.isDirectory()) continue
        const fileName = ent.name
        if (isExcludedFileOrDir(fileName)) continue
        candidateFileNames.push(fileName)
      }
      for (const inc of additionalIncludes) {
        if (!candidateFileNames.includes(inc) && !isExcludedFileOrDir(inc)) {
          candidateFileNames.push(inc)
        }
      }
    }

    // 4. Extract text from candidates
    const manifestFiles: ExtractedFileInfo[] = []
    const scannedFilesWithoutText: string[] = []
    let totalPdfPages = 0

    for (const relFileName of candidateFileNames) {
      if (isExcludedFileOrDir(relFileName)) continue

      const filePath = path.isAbsolute(relFileName)
        ? relFileName
        : path.join(resolvedFolder, relFileName)

      if (!fs.existsSync(filePath)) {
        continue
      }

      const fileName = path.basename(filePath)
      const ext = path.extname(fileName).toLowerCase()
      const stats = await fs.promises.stat(filePath)
      const sha256 = computeSha256(filePath)

      const outputTextName = sanitizeTextFileName(fileName)
      const outputTextPath = path.join(extractedDir, outputTextName)
      const relExtractedPath = `_extracted/${outputTextName}`

      let formattedText = ''
      let pages = 1
      let hasTextLayer = true
      let extractedChars = 0
      let warning: string | undefined = undefined

      if (ext === '.pdf') {
        try {
          const pdfRes = await extractPdfTextByPages(filePath)
          formattedText = pdfRes.formattedText
          pages = pdfRes.totalPages
          totalPdfPages += pages
          hasTextLayer = pdfRes.hasTextLayer
          extractedChars = pdfRes.totalChars

          if (!hasTextLayer) {
            warning = 'Image-only or scanned PDF without embedded OCR text layer'
            scannedFilesWithoutText.push(fileName)
          }
        } catch (pdfErr: any) {
          warning = `PDF parsing error: ${pdfErr.message}`
          formattedText = `-- page 1 --\n[Error reading PDF text: ${pdfErr.message}]`
        }
      } else if (ext === '.docx' || ext === '.doc') {
        try {
          const docxRes = await mammoth.extractRawText({ path: filePath })
          const raw = (docxRes.value || '').replace(/\r\n/g, '\n').trim()
          formattedText = `-- page 1 --\n${raw}`
          extractedChars = raw.length
          pages = 1
        } catch (docxErr: any) {
          warning = `Word document parsing error: ${docxErr.message}`
          formattedText = `-- page 1 --\n[Error reading docx text: ${docxErr.message}]`
        }
      } else if (['.txt', '.md', '.rtf', '.json', '.xml'].includes(ext)) {
        try {
          const raw = (await fs.promises.readFile(filePath, 'utf8')).replace(/\r\n/g, '\n').trim()
          formattedText = `-- page 1 --\n${raw}`
          extractedChars = raw.length
          pages = 1
        } catch (txtErr: any) {
          warning = `Text file reading error: ${txtErr.message}`
          formattedText = `-- page 1 --\n[Error reading file: ${txtErr.message}]`
        }
      } else {
        // Unsupported format for text extraction (images, zips, spreadsheets, binaries)
        continue
      }

      // Write extracted text file if overwrite or not existing
      if (!fs.existsSync(outputTextPath) || overwrite) {
        await fs.promises.writeFile(outputTextPath, formattedText, 'utf8')
      }

      manifestFiles.push({
        name: fileName,
        relPath: relFileName,
        type: ext === '.pdf' ? 'pdf' : ext.startsWith('.doc') ? 'docx' : 'txt',
        pages,
        bytes: stats.size,
        sha256,
        extractedChars,
        hasTextLayer,
        extractedTextFile: relExtractedPath,
        warning,
      })
    }

    // 5. Clean up stale .txt files in _extracted that are not in the new manifest
    const currentExtractedTxtNames = new Set(
      manifestFiles.map((f) => path.basename(f.extractedTextFile))
    )
    const staleFilesRemoved: string[] = []

    try {
      const existingExtractedFiles = await fs.promises.readdir(extractedDir)
      for (const exFile of existingExtractedFiles) {
        if (exFile === 'manifest.json' || !exFile.endsWith('.txt')) continue
        if (!currentExtractedTxtNames.has(exFile)) {
          const stalePath = path.join(extractedDir, exFile)
          try {
            await fs.promises.unlink(stalePath)
            staleFilesRemoved.push(exFile)
          } catch (_) {}
        }
      }
    } catch (_) {}

    // 6. Generate manifest.json
    const manifest: RfpManifest = {
      extractedAt: new Date().toISOString(),
      folder: resolvedFolder,
      totalFiles: manifestFiles.length,
      totalPdfPages,
      scannedFilesWithoutText,
      files: manifestFiles,
    }

    const manifestPath = path.join(extractedDir, 'manifest.json')
    await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')

    ctx.refreshExplorer(targetPane)

    // 7. Construct rich summary message
    const folderName = path.basename(resolvedFolder)
    const summaryLines: string[] = [
      `Extracted ${manifestFiles.length} RFP document(s) in "${folderName}" (${totalPdfPages} PDF pages).`,
    ]

    if (targetZipPath) {
      const zipName = path.basename(targetZipPath)
      const totalZipBytes = zipCheckResults.reduce((sum, z) => sum + z.sizeBytes, 0)
      summaryLines.push(
        `📦 Archive Check: "${zipName}" (${zipCheckResults.length} file(s), ${(totalZipBytes / 1024 / 1024).toFixed(2)} MB total)`
      )
      summaryLines.push(`- Files unpacked: ${unpackedFiles.length}`)
      summaryLines.push(`- Files skipped (already existed): ${skippedExistingFiles.length}`)
    }

    if (staleFilesRemoved.length > 0) {
      summaryLines.push(
        `- Stale text files removed: ${staleFilesRemoved.length} (${staleFilesRemoved.join(', ')})`
      )
    }

    if (scannedFilesWithoutText.length > 0) {
      summaryLines.push(
        `⚠️ Scanned PDFs without text layer (${scannedFilesWithoutText.length}): ${scannedFilesWithoutText.join(', ')}`
      )
    }

    const message = summaryLines.join('\n')
    ctx.notify(`📦 RFP Extracted: ${manifestFiles.length} files (${totalPdfPages} pages)`)

    return {
      success: true,
      action: 'extract_rfp',
      createdPath: extractedDir,
      message,
      details: {
        folder: resolvedFolder,
        manifestPath,
        totalFiles: manifestFiles.length,
        totalPdfPages,
        zipArchive: targetZipPath ? path.basename(targetZipPath) : null,
        zipCheck: zipCheckResults,
        unpackedFiles,
        skippedExistingFiles,
        staleFilesRemoved,
        scannedWithoutText: scannedFilesWithoutText,
        files: manifestFiles.map((f) => ({
          name: f.name,
          type: f.type,
          pages: f.pages,
          sizeKb: Math.round(f.bytes / 1024),
          extractedChars: f.extractedChars,
          hasTextLayer: f.hasTextLayer,
          extractedTextFile: f.extractedTextFile,
        })),
      },
    }
  },
}

