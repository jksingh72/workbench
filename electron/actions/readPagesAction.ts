import fs from 'node:fs'
import path from 'node:path'
import { ActionDefinition, ActionContext, ActionResult } from './types'

export const readPagesAction: ActionDefinition = {
  id: 'read_pages',
  aliases: ['get_pages', 'extract_pages', 'read_pdf_pages', 'view_pages'],
  description:
    'Reads and returns text from a specific range of pages (e.g. pages 40 to 45) of an extracted RFP document or PDF. Operates without artificial line caps, allowing targeted in-depth reading of specific document sections.',
  parameters: {
    file: {
      type: 'string',
      required: true,
      description: 'The file path or file name of the document to read (e.g. "RFSA 2026-5203.pdf" or "report.docx").',
    },
    fromPage: {
      type: 'number',
      required: true,
      description: 'Starting page number (1-based, inclusive).',
    },
    toPage: {
      type: 'number',
      required: true,
      description: 'Ending page number (1-based, inclusive).',
    },
  },
  example: {
    action: 'read_pages',
    file: 'RFSA 2026-5203.pdf',
    fromPage: 38,
    toPage: 43,
  },
  async execute(ctx: ActionContext, payload: any, targetPane = 'book'): Promise<ActionResult> {
    const params = payload.params || {}
    const fileRaw = params.file ?? payload.file ?? params.path ?? payload.path
    const fromPage = Number(params.fromPage ?? payload.fromPage ?? 1)
    const toPage = Number(params.toPage ?? payload.toPage ?? fromPage)

    if (!fileRaw) {
      throw new Error('Missing required parameter "file"')
    }
    if (isNaN(fromPage) || fromPage < 1) {
      throw new Error('"fromPage" must be a positive number (1-based)')
    }
    if (isNaN(toPage) || toPage < fromPage) {
      throw new Error('"toPage" must be greater than or equal to "fromPage"')
    }

    const resolvedFilePath = ctx.resolveSafePath(fileRaw, targetPane)
    const dir = path.dirname(resolvedFilePath)
    const baseName = path.basename(resolvedFilePath)

    // Check multiple candidate locations for extracted text:
    // 1. Direct path if pointed at a .txt file
    // 2. <dir>/_extracted/<baseName>.txt
    // 3. <dir>/_extracted/<baseName> (if baseName already had .txt)
    // 4. <activeDir>/_extracted/<baseName>.txt
    const candidatePaths = [
      resolvedFilePath,
      path.join(dir, '_extracted', baseName + '.txt'),
      path.join(dir, '_extracted', baseName),
      path.join(ctx.getActiveDirectory(targetPane), '_extracted', baseName + '.txt'),
      path.join(ctx.getActiveDirectory(targetPane), '_extracted', baseName),
    ]

    let foundTxtPath: string | null = null
    for (const p of candidatePaths) {
      if (fs.existsSync(p) && !fs.statSync(p).isDirectory()) {
        foundTxtPath = p
        break
      }
    }

    let fullExtractedText = ''

    if (foundTxtPath) {
      fullExtractedText = await fs.promises.readFile(foundTxtPath, 'utf8')
    } else if (fs.existsSync(resolvedFilePath)) {
      // If original PDF exists but has not been extracted yet, extract it on the fly
      const ext = path.extname(resolvedFilePath).toLowerCase()
      if (ext === '.pdf') {
        const buffer = await fs.promises.readFile(resolvedFilePath)
        const pdfParseModule: any = await import('pdf-parse')
        if (pdfParseModule.PDFParse) {
          const parser = new pdfParseModule.PDFParse({ data: buffer })
          try {
            const res = await parser.getText()
            if (Array.isArray(res.pages) && res.pages.length > 0) {
              fullExtractedText = res.pages
                .map((p: any) => `-- page ${p.num || 1} --\n${(p.text || '').trim()}`)
                .join('\n\n')
            } else {
              fullExtractedText = `-- page 1 --\n${(res.text || '').trim()}`
            }
          } finally {
            if (typeof parser.destroy === 'function') {
              try {
                await parser.destroy()
              } catch (_) {}
            }
          }
        }
      } else {
        throw new Error(
          `Document text has not been extracted yet. Please run "extract_rfp" first on the containing folder.`
        )
      }
    } else {
      throw new Error(`File not found: "${fileRaw}" (checked in "${resolvedFilePath}" and "_extracted/")`)
    }

    // Parse out text between `-- page X --` markers
    const lines = fullExtractedText.split('\n')
    const extractedLines: string[] = []
    let currentPage = 1
    let inTargetRange = false
    let foundAnyPage = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const marker = line.match(/^--\s*page\s+(\d+)\s*--/i)
      if (marker) {
        currentPage = parseInt(marker[1], 10)
        if (currentPage >= fromPage && currentPage <= toPage) {
          inTargetRange = true
          foundAnyPage = true
          extractedLines.push(line)
        } else {
          inTargetRange = false
          if (currentPage > toPage) {
            // Reached beyond target range
            break
          }
        }
        continue
      }

      if (inTargetRange) {
        extractedLines.push(line)
      }
    }

    // Fallback if document has no page markers (e.g. single page doc)
    if (!foundAnyPage && fromPage === 1) {
      extractedLines.push(...lines)
    }

    const outputText = extractedLines.join('\n').trim()

    if (!outputText) {
      return {
        success: true,
        action: 'read_pages',
        message: `No content found for pages ${fromPage} to ${toPage} in "${baseName}". (Document may have fewer pages).`,
        details: {
          file: baseName,
          fromPage,
          toPage,
          charCount: 0,
        },
      }
    }

    const header = `### Extracted Pages ${fromPage}–${toPage} from ${baseName}:\n`
    const message = `${header}\n${outputText}`

    return {
      success: true,
      action: 'read_pages',
      message,
      details: {
        file: baseName,
        fromPage,
        toPage,
        charCount: outputText.length,
        lineCount: extractedLines.length,
        content: outputText,
      },
    }
  },
}
