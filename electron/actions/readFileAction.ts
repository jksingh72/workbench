import fs from 'node:fs'
import path from 'node:path'
import { ActionDefinition, ActionContext, ActionResult } from './types'

export const readFileAction: ActionDefinition = {
  id: 'read_file',
  aliases: ['cat', 'read', 'get_file_content', 'view_file'],
  description: 'Reads the text content of a local file in the active directory.',
  parameters: {
    path: {
      type: 'string',
      required: true,
      description: 'Relative or absolute path to the file to read',
    },
    maxLines: {
      type: 'number',
      required: false,
      description: 'Maximum number of lines to return (default 300)',
      default: 300,
    },
  },
  example: {
    action: 'read_file',
    path: '<file_path>',
  },
  async execute(ctx: ActionContext, payload: any, targetPane = 'book'): Promise<ActionResult> {
    const params = payload.params || {}
    const filePath = params.path ?? payload.path ?? params.file ?? payload.file
    const maxLines = Number(params.maxLines ?? payload.maxLines ?? 300)

    if (!filePath) {
      throw new Error('File path is required for read_file')
    }

    const resolvedPath = ctx.resolveSafePath(filePath, targetPane)

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`File does not exist: "${filePath}"`)
    }

    const stats = await fs.promises.stat(resolvedPath)
    if (stats.isDirectory()) {
      throw new Error(`Path is a directory, not a file: "${filePath}". Use list_directory instead.`)
    }

    // Transparently handle Microsoft Word documents via read_docx
    if (resolvedPath.toLowerCase().endsWith('.docx')) {
      return await ctx.dispatch(
        {
          action: 'read_docx',
          path: resolvedPath,
          maxLines,
        },
        targetPane
      )
    }

    // Transparently handle PDF documents via read_pdf
    if (resolvedPath.toLowerCase().endsWith('.pdf')) {
      return await ctx.dispatch(
        {
          action: 'read_pdf',
          path: resolvedPath,
          maxLines,
        },
        targetPane
      )
    }

    // Limit maximum size to prevent memory overload (max 1MB)
    if (stats.size > 1024 * 1024) {
      throw new Error(`File is too large to read directly (${Math.round(stats.size / 1024)} KB). Maximum readable size is 1 MB.`)
    }

    const rawContent = await fs.promises.readFile(resolvedPath, 'utf-8')
    const allLines = rawContent.split(/\r?\n/)
    const truncated = allLines.length > maxLines
    const lines = truncated ? allLines.slice(0, maxLines) : allLines
    let content = lines.join('\n')

    if (truncated) {
      content += `\n\n... [Truncated: showing first ${maxLines} of ${allLines.length} lines] ...`
    }

    const summary = `Read ${lines.length} lines (${stats.size} bytes) from "${path.basename(resolvedPath)}"`
    ctx.notify(`📖 ${summary}`)

    return {
      success: true,
      action: 'read_file',
      message: summary,
      details: {
        path: resolvedPath,
        content,
        lineCount: allLines.length,
        sizeBytes: stats.size,
        truncated,
      },
    }
  },
}
