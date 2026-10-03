import fs from 'node:fs'
import path from 'node:path'
import { ActionDefinition, ActionContext, ActionResult } from './types'

export const readPdfAction: ActionDefinition = {
  id: 'read_pdf',
  aliases: ['parse_pdf', 'view_pdf', 'get_pdf_content', 'pdf_to_text'],
  description:
    'Extracts text content and page structure from a PDF file in the active directory. (Note: scanned image-only PDFs without an OCR layer contain no text).',
  parameters: {
    path: {
      type: 'string',
      required: true,
      description: 'Relative or absolute path to the .pdf file to read',
    },
    maxPages: {
      type: 'number',
      required: false,
      description: 'Maximum number of pages to extract (default: all pages)',
    },
    maxLines: {
      type: 'number',
      required: false,
      description: 'Maximum lines of text to return (default: 500)',
      default: 500,
    },
    maxChars: {
      type: 'number',
      required: false,
      description: 'Maximum characters of text to return (default: 100000)',
      default: 100000,
    },
    openInTab: {
      type: 'boolean',
      required: false,
      description: 'Whether to also open the PDF in a Workbench viewer tab (default: false)',
      default: false,
    },
  },
  example: {
    action: 'read_pdf',
    path: '<file_path>',
    maxPages: 10,
  },
  async execute(ctx: ActionContext, payload: any, targetPane = 'book'): Promise<ActionResult> {
    const params = payload.params || {}
    const filePath = params.path ?? payload.path ?? params.file ?? payload.file
    const maxPages = Number(params.maxPages ?? payload.maxPages ?? 0)
    const maxLines = Number(params.maxLines ?? payload.maxLines ?? 500)
    const maxChars = Number(params.maxChars ?? payload.maxChars ?? 100000)
    const shouldOpen = Boolean(params.openInTab ?? payload.openInTab ?? false)

    if (!filePath) {
      console.error('[read_pdf:ERROR] File path is required for read_pdf')
      throw new Error('File path is required for read_pdf')
    }

    console.log(`[read_pdf:STEP 1] Requested PDF read: "${filePath}" (maxPages: ${maxPages}, maxLines: ${maxLines}, targetPane: ${targetPane})`)
    const resolvedPath = ctx.resolveSafePath(filePath, targetPane)
    console.log(`[read_pdf:STEP 2] Resolved safe path: "${resolvedPath}"`)

    if (!fs.existsSync(resolvedPath)) {
      console.error(`[read_pdf:ERROR] PDF file does not exist: "${resolvedPath}"`)
      throw new Error(`PDF file does not exist: "${filePath}"`)
    }

    const stats = await fs.promises.stat(resolvedPath)
    if (stats.isDirectory()) {
      console.error(`[read_pdf:ERROR] Path is a directory, not a PDF: "${resolvedPath}"`)
      throw new Error(`Path is a directory, not a PDF file: "${filePath}". Use list_directory instead.`)
    }

    const sizeMb = (stats.size / (1024 * 1024)).toFixed(2)
    const fileName = path.basename(resolvedPath)
    console.log(`[read_pdf:STEP 2] File verified: "${fileName}" (${sizeMb} MB)`)

    // Automatic Native Attachment Optimization for Chat Context:
    if (maxPages === 0 && typeof ctx.attachToChat === 'function') {
      console.log(`[read_pdf:STEP 3:ATTACH] Optimizing: attaching PDF natively to chat session...`)
      const attachRes = await ctx.attachToChat(resolvedPath)
      if (attachRes.success) {
        console.log(`[read_pdf:STEP 3:ATTACH] PDF successfully attached to chat session`)
        ctx.notify(`📎 Attached PDF to Chat: ${fileName} (${sizeMb} MB)`)
        if (shouldOpen) {
          ctx.openInTab(resolvedPath)
        }
        return {
          success: true,
          action: 'read_pdf',
          createdPath: resolvedPath,
          message: `Attached "${fileName}" (${sizeMb} MB) directly to the active chat session. The AI can now process and analyze the entire document natively.`,
          details: {
            fileName,
            filePath: resolvedPath,
            sizeBytes: stats.size,
            sizeMb,
            attached: true,
          },
        }
      } else {
        console.warn(`[read_pdf:STEP 3:ATTACH] Native attachment did not succeed, falling back to local text extraction:`, attachRes.error)
      }
    }

    console.log(`[read_pdf:STEP 4:PARSE] Reading buffer and parsing PDF pages locally...`)
    const buffer = await fs.promises.readFile(resolvedPath)

    // Dynamic import to handle both pdf-parse v2 (class-based) and v1 (function-based)
    const pdfParseModule: any = await import('pdf-parse')
    let rawText = ''
    let totalPages = 1
    let pagesRead = 1

    if (pdfParseModule.PDFParse) {
      // pdf-parse v2+
      const parser = new pdfParseModule.PDFParse({ data: buffer })
      const textResult = await parser.getText(maxPages > 0 ? { first: maxPages } : { first: 20 })
      rawText = textResult.text || ''
      totalPages = textResult.total || 1
      pagesRead = maxPages > 0 ? Math.min(maxPages, totalPages) : totalPages
      if (typeof parser.destroy === 'function') {
        try {
          await parser.destroy()
        } catch (_) {}
      }
    } else {
      // pdf-parse v1 fallback
      const parseFn = typeof pdfParseModule.default === 'function' ? pdfParseModule.default : pdfParseModule
      const data = await parseFn(buffer, maxPages > 0 ? { max: maxPages } : { max: 20 })
      rawText = data.text || ''
      totalPages = data.numpages || 1
      pagesRead = maxPages > 0 ? Math.min(maxPages, totalPages) : totalPages
    }

    console.log(`[read_pdf:STEP 4:PARSE] Parsed ${pagesRead}/${totalPages} pages (${rawText.length} raw characters)`)
    let text = (rawText || '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()

    // Character truncation
    const charTruncated = text.length > maxChars
    if (charTruncated) {
      text = text.slice(0, maxChars)
    }

    // Line truncation
    const allLines = text.split('\n')
    const lineTruncated = allLines.length > maxLines
    const lines = lineTruncated ? allLines.slice(0, maxLines) : allLines
    let finalContent = lines.join('\n')

    const isTruncated = charTruncated || lineTruncated
    if (isTruncated) {
      finalContent += `\n\n... [Truncated: showing ${lines.length} lines (${text.length} chars)] ...`
    }

    const charCount = text.length
    console.log(`[read_pdf:STEP 5] Extraction complete. Lines: ${lines.length}, Chars: ${charCount}, Truncated: ${isTruncated}`)
    const header = `Read PDF "${fileName}" (${pagesRead}/${totalPages} pages, ${charCount} chars)`
    const note =
      charCount === 0
        ? '\n\n⚠️ No extractable text found. This document may be a scanned or image-only PDF without an embedded text layer.'
        : ''

    const summary = `${header}${note}`
    ctx.notify(`📄 Read PDF: ${fileName}`)

    if (shouldOpen) {
      console.log(`[read_pdf:STEP 6] Opening PDF in viewer tab: "${resolvedPath}"`)
      ctx.openInTab(resolvedPath)
    }

    return {
      success: true,
      action: 'read_pdf',
      message: summary,
      details: {
        path: resolvedPath,
        fileName,
        totalPages,
        pagesRead,
        content: finalContent,
        lineCount: lines.length,
        charCount,
        sizeBytes: stats.size,
        truncated: isTruncated,
      },
    }
  },
}
