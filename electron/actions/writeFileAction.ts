import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { ActionDefinition, ActionContext, ActionResult } from './types'

export const writeFileAction: ActionDefinition = {
  id: 'write_file',
  aliases: ['create_file', 'save_file', 'new_file'],
  description: 'Writes text or code content to a file, creating parent directories automatically.',
  parameters: {
    path: {
      type: 'string',
      required: true,
      description: 'File name or path (relative or absolute)',
    },
    content: {
      type: 'string',
      required: true,
      description: 'The content/code to write into the file',
    },
    openInTab: {
      type: 'boolean',
      required: false,
      default: false,
      description: 'Whether to open the newly created file in an editor tab (default: false)',
    },
  },
  example: {
    action: 'write_file',
    path: '<file_path>',
    content: '<file_content>',
  },
  async execute(ctx: ActionContext, payload: any, targetPane = 'book'): Promise<ActionResult> {
    const params = payload.params || {}
    const name = params.name ?? payload.name
    const subPath = params.path ?? payload.path
    const target = params.target ?? payload.target
    const content = params.content ?? payload.content ?? ''
    const openInTab = Boolean(params.openInTab ?? payload.openInTab ?? false)

    const fileTarget = name || subPath || target
    if (!fileTarget) {
      throw new Error('Missing file name or path for write_file')
    }

    console.log(`[write_file:STEP 1] Target input: "${fileTarget}" | Content: ${content.length} chars (TargetPane: "${targetPane}")`)
    let targetFile = ''
    if (name && subPath && !path.isAbsolute(name)) {
      targetFile = ctx.resolveSafePath(path.join(subPath, name), targetPane)
    } else {
      targetFile = ctx.resolveSafePath(fileTarget, targetPane)
    }
    console.log(`[write_file:STEP 2] Resolved file destination: "${targetFile}"`)

    const overwrite = (params.overwrite ?? payload.overwrite) !== false
    if (!overwrite && fs.existsSync(targetFile)) {
      throw new Error(`File already exists at "${targetFile}" (overwrite: false)`)
    }

    // Ensure parent directory exists
    const parentDir = path.dirname(targetFile)
    await fs.promises.mkdir(parentDir, { recursive: true })
    console.log(`[write_file:STEP 3] Parent directory ready: "${parentDir}"`)

    await fs.promises.writeFile(targetFile, content, 'utf-8')
    console.log(`[write_file:STEP 4] Successfully wrote ${content.length} characters to: "${targetFile}"`)

    const stats = await fs.promises.stat(targetFile)
    const fileBuf = await fs.promises.readFile(targetFile)
    const sha256 = crypto.createHash('sha256').update(fileBuf).digest('hex')

    // Get target folder listing
    let folders: string[] = []
    let files: string[] = []
    try {
      const entries = await fs.promises.readdir(parentDir, { withFileTypes: true })
      folders = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort()
      files = entries.filter((e) => !e.isDirectory()).map((e) => e.name).sort()
    } catch (_) {}

    const displayFile = path.basename(targetFile) || fileTarget
    ctx.notify(`📄 Created file: ${displayFile}`)
    ctx.refreshExplorer(targetPane)

    if (openInTab) {
      console.log(`[write_file:STEP 5] Opening file in Workbench tab: "${targetFile}"`)
      ctx.openInTab(targetFile)
    }

    return {
      success: true,
      action: 'write_file',
      message: `Created file "${displayFile}" (${stats.size.toLocaleString()} bytes, SHA-256: ${sha256})`,
      createdPath: targetFile,
      details: {
        filePath: targetFile,
        sizeBytes: stats.size,
        sha256,
        folderCount: folders.length,
        fileCount: files.length,
        folders,
        files,
      },
    }
  },
}
