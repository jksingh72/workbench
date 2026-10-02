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
      throw new Error('File path is required for read_pdf')
    }

    const resolvedPath = ctx.resolveSafePath(filePath, targetPane)

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`PDF file does not exist: "${filePath}"`)
    }

    const stats = await fs.promises.stat(resolvedPath)
    if (stats.isDirectory()) {
      throw new Error(`Path is a directory, not a PDF file: "${filePath}". Use list_directory instead.`)
    }

    const buffer = await fs.promises.readFile(resolvedPath)

    // Dynamic import to handle both pdf-parse v2 (class-based) and v1 (function-based)
    const pdfParseModule: any = await import('pdf-parse')
    let rawText = ''
    let totalPages = 1
    let pagesRead = 1

    if (pdfParseModule.PDFParse) {
      // pdf-parse v2+
      const parser = new pdfParseModule.PDFParse({ data: buffer })
      const textResult = await parser.getText(maxPages > 0 ? { first: maxPages } : {})
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
      const data = await parseFn(buffer, maxPages > 0 ? { max: maxPages } : {})
      rawText = data.text || ''
      totalPages = data.numpages || 1
      pagesRead = maxPages > 0 ? Math.min(maxPages, totalPages) : totalPages
    }

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

    const fileName = path.basename(resolvedPath)
    const charCount = text.length
    const header = `Read PDF "${fileName}" (${pagesRead}/${totalPages} pages, ${charCount} chars)`
    const note =
      charCount === 0
        ? '\n\n⚠️ No extractable text found. This document may be a scanned or image-only PDF without an embedded text layer.'
        : ''

    const summary = `${header}${note}`
    ctx.notify(`📄 Read PDF: ${fileName}`)

    if (shouldOpen) {
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
