import fs from 'node:fs'
import path from 'node:path'
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
      default: true,
      description: 'Whether to open the newly created file in an editor tab',
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
    const openInTab = params.openInTab ?? payload.openInTab ?? true

    const fileTarget = name || subPath || target
    if (!fileTarget) {
      throw new Error('Missing file name or path for write_file')
    }

    let targetFile = ''
    if (name && subPath && !path.isAbsolute(name)) {
      targetFile = ctx.resolveSafePath(path.join(subPath, name), targetPane)
    } else {
      targetFile = ctx.resolveSafePath(fileTarget, targetPane)
    }

    // Ensure parent directory exists
    const parentDir = path.dirname(targetFile)
    await fs.promises.mkdir(parentDir, { recursive: true })

    await fs.promises.writeFile(targetFile, content, 'utf-8')

    const displayFile = path.basename(targetFile) || fileTarget
    ctx.notify(`📄 Created file: ${displayFile}`)
    ctx.refreshExplorer(targetPane)

    if (openInTab) {
      ctx.openInTab(targetFile)
    }

    return {
      success: true,
      action: 'write_file',
      message: `Created file "${displayFile}"`,
      createdPath: targetFile,
    }
  },
}
