import fs from 'node:fs'
import path from 'node:path'
import { ActionDefinition, ActionContext, ActionResult } from './types'

export const attachFileAction: ActionDefinition = {
  id: 'attach_file',
  aliases: ['attach_to_chat', 'upload_file', 'upload_to_chat', 'attach_document'],
  description:
    'Attaches a local file (PDF, DOCX, XLSX, PPTX, CSV, image, or large document) directly into the active AI chat session using native browser attachment upload. This bypasses raw text dumps and leverages native cloud document processing, making it ideal for books, multi-page PDFs, spreadsheets, and visual documents.',
  parameters: {
    path: {
      type: 'string',
      required: true,
      description: 'Relative or absolute path to the file to attach to chat',
    },
    instruction: {
      type: 'string',
      required: false,
      description: 'Optional guidance or prompt to accompany the attachment in chat',
    },
  },
  example: {
    action: 'attach_file',
    path: 'books/sample.pdf',
    instruction: 'Please analyze this document',
  },
  async execute(ctx: ActionContext, payload: any, targetPane = 'book'): Promise<ActionResult> {
    const params = payload.params || {}
    const folder = params.folder ?? payload.folder
    const file = params.file ?? payload.file
    const rawPath = params.path ?? payload.path ?? (folder && file ? path.join(folder, file) : file)
    const instruction = (params.instruction ?? payload.instruction ?? '').trim()

    if (!rawPath) {
      throw new Error('File path is required for attach_file')
    }

    console.log(`[attach_file:STEP 1] Received request to attach file: "${rawPath}" (targetPane: ${targetPane})`)
    const resolvedPath = ctx.resolveSafePath(rawPath, targetPane)
    console.log(`[attach_file:STEP 2] Resolved safe path: "${resolvedPath}"`)

    if (!fs.existsSync(resolvedPath)) {
      console.error(`[attach_file:ERROR] File does not exist on disk: "${resolvedPath}"`)
      throw new Error(`File does not exist: "${rawPath}"`)
    }

    const stats = await fs.promises.stat(resolvedPath)
    if (stats.isDirectory()) {
      console.error(`[attach_file:ERROR] Path is a directory: "${resolvedPath}"`)
      throw new Error(`Path is a directory, not a file: "${rawPath}". Cannot attach directories.`)
    }

    const sizeMb = (stats.size / (1024 * 1024)).toFixed(2)
    const fileName = path.basename(resolvedPath)
    console.log(`[attach_file:STEP 3] Verified file "${fileName}" (${sizeMb} MB, ${stats.size} bytes)`)

    if (typeof ctx.attachToChat !== 'function') {
      console.error(`[attach_file:ERROR] ctx.attachToChat is unavailable in the current context`)
      throw new Error('Native chat file attachment is not supported in the current context')
    }

    console.log(`[attach_file:STEP 4] Uploading to active AI chat session with instruction: "${instruction || '(none)'}"`)
    const res = await ctx.attachToChat(resolvedPath, instruction)
    if (!res.success) {
      console.error(`[attach_file:ERROR] Upload failed:`, res.error)
      throw new Error(res.error || `Failed to attach "${fileName}" to chat`)
    }

    console.log(`[attach_file:STEP 5] Successfully attached "${fileName}" to chat session (uploaded: ${res.uploaded})`)

    return {
      success: true,
      action: 'attach_file',
      createdPath: resolvedPath,
      message: `Attached "${fileName}" (${sizeMb} MB) directly to the active chat session. The AI can now process the entire document natively.`,
      details: {
        fileName,
        filePath: resolvedPath,
        sizeBytes: stats.size,
        sizeMb,
        uploaded: res.uploaded,
      },
    }
  },
}
