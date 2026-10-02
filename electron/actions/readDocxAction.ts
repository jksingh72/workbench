import fs from 'node:fs'
import path from 'node:path'
import { ActionDefinition, ActionContext, ActionResult } from './types'

export const readDocxAction: ActionDefinition = {
  id: 'read_docx',
  aliases: ['read_word', 'parse_docx', 'view_docx', 'get_docx_content', 'docx_to_markdown'],
  description:
    'Reads and extracts text and formatting from Microsoft Word (.docx) documents as clean Markdown, plain text, or HTML.',
  parameters: {
    path: {
      type: 'string',
      required: true,
      description: 'Relative or absolute path to the .docx Word document to read',
    },
    format: {
      type: 'string',
      required: false,
      description: 'Output format: "markdown" (default, optimal for AI comprehension), "text", or "html"',
      default: 'markdown',
    },
    maxLines: {
      type: 'number',
      required: false,
      description: 'Maximum number of lines of content to return (default 500)',
      default: 500,
    },
    openInTab: {
      type: 'boolean',
      required: false,
      description: 'Whether to also open the Word document in a Workbench tab (default false)',
      default: false,
    },
  },
  example: {
    action: 'read_docx',
    path: '<file_path>',
    format: 'markdown',
  },
  async execute(ctx: ActionContext, payload: any, targetPane = 'book'): Promise<ActionResult> {
    const params = payload.params || {}
    const filePath = params.path ?? payload.path ?? params.file ?? payload.file
    const format = String(params.format ?? payload.format ?? 'markdown').toLowerCase()
    const maxLines = Number(params.maxLines ?? payload.maxLines ?? 500)
    const shouldOpen = Boolean(params.openInTab ?? payload.openInTab ?? false)

    if (!filePath) {
      throw new Error('File path is required for read_docx')
    }

    const resolvedPath = ctx.resolveSafePath(filePath, targetPane)

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Word document does not exist: "${filePath}"`)
    }

    const stats = await fs.promises.stat(resolvedPath)
    if (stats.isDirectory()) {
      throw new Error(`Path is a directory, not a Word document: "${filePath}". Use list_directory instead.`)
    }

    // Dynamic import mammoth to convert the docx buffer into readable text / markdown
    const mammoth: any = await import('mammoth')
    const buffer = await fs.promises.readFile(resolvedPath)

    let content = ''
    let messages: any[] = []

    if (format === 'text' || format === 'raw') {
      const res = await mammoth.extractRawText({ buffer })
      content = res.value || ''
      messages = res.messages || []
    } else if (format === 'html') {
      const res = await mammoth.convertToHtml({ buffer })
      content = res.value || ''
      messages = res.messages || []
    } else {
      // Default: clean markdown conversion (preserves headings, bullet lists, bold, tables)
      const res = await mammoth.convertToMarkdown({ buffer })
      content = res.value || ''
      messages = res.messages || []
    }

    const allLines = content.split(/\r?\n/)
    const truncated = allLines.length > maxLines
    const lines = truncated ? allLines.slice(0, maxLines) : allLines
    let finalContent = lines.join('\n')

    if (truncated) {
      finalContent += `\n\n... [Truncated: showing first ${maxLines} of ${allLines.length} lines] ...`
    }

    const fileName = path.basename(resolvedPath)
    const summary = `Read Word document "${fileName}" (${lines.length} lines, ${Math.round(stats.size / 1024)} KB)`
    ctx.notify(`📄 ${summary}`)

    if (shouldOpen) {
      ctx.openInTab(resolvedPath)
    }

    return {
      success: true,
      action: 'read_docx',
      message: summary,
      details: {
        path: resolvedPath,
        fileName,
        format,
        content: finalContent,
        lineCount: allLines.length,
        sizeBytes: stats.size,
        truncated,
        warnings: messages.length > 0 ? messages.map((m: any) => m.message) : undefined,
      },
    }
  },
}
