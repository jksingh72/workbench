import fs from 'node:fs'
import { ActionDefinition, ActionContext, ActionResult } from './types'

export const listDirectoryAction: ActionDefinition = {
  id: 'list_directory',
  aliases: ['count_folders', 'list_folders', 'list_files', 'ls', 'dir', 'get_directory_contents'],
  description: 'Lists or counts folders and files in a local directory.',
  parameters: {
    path: {
      type: 'string',
      required: true,
      description: 'Directory path to inspect (relative or absolute)',
    },
  },
  example: {
    action: 'list_directory',
    path: '.',
  },
  async execute(ctx: ActionContext, payload: any, targetPane = 'book'): Promise<ActionResult> {
    const params = payload.params || {}
    const name = params.name ?? payload.name
    const subPath = params.path ?? payload.path
    const folder = params.folder ?? payload.folder
    const target = params.target ?? payload.target

    const targetInput = name || subPath || folder || target || '.'
    const targetDir = ctx.resolveSafePath(targetInput, targetPane)

    if (!fs.existsSync(targetDir)) {
      throw new Error(`Directory does not exist: "${targetInput}"`)
    }

    const entries = await fs.promises.readdir(targetDir, { withFileTypes: true })
    const folders = entries.filter((e) => e.isDirectory()).map((e) => e.name)
    const files = entries.filter((e) => !e.isDirectory()).map((e) => e.name)

    const folderCount = folders.length
    const fileCount = files.length
    const summary = `Directory "${targetDir}" contains ${folderCount} folder(s) (${folders.join(', ') || 'none'}) and ${fileCount} file(s)`

    ctx.notify(`📊 ${summary}`)

    return {
      success: true,
      action: payload.action || 'list_directory',
      message: summary,
      details: {
        path: targetDir,
        folderCount,
        folders,
        fileCount,
        files,
      },
    }
  },
}
