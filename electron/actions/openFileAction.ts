import fs from 'node:fs'
import path from 'node:path'
import { shell } from 'electron'
import { ActionDefinition, ActionContext, ActionResult } from './types'

export const openFileAction: ActionDefinition = {
  id: 'open_file',
  aliases: ['edit_file', 'view_file', 'show_file'],
  description: 'Opens a file in a Workbench editor tab or reveals it in the system file explorer.',
  parameters: {
    path: { type: 'string', required: true, description: 'File path to open' },
    revealInExplorer: {
      type: 'boolean',
      required: false,
      default: false,
      description: 'Reveal in system explorer instead of opening in editor',
    },
  },
  example: {
    action: 'open_file',
    path: '<file_path>',
  },
  async execute(ctx: ActionContext, payload: any, targetPane = 'book'): Promise<ActionResult> {
    const params = payload.params || {}
    const name = params.name ?? payload.name
    const subPath = params.path ?? payload.path
    const target = params.target ?? payload.target
    const reveal = params.revealInExplorer ?? payload.revealInExplorer ?? false

    const targetInput = name || subPath || target
    if (!targetInput) {
      throw new Error('Missing file path for open_file')
    }

    const targetPath = ctx.resolveSafePath(targetInput, targetPane)
    if (!fs.existsSync(targetPath)) {
      throw new Error(`File does not exist: "${targetInput}"`)
    }

    if (reveal) {
      shell.showItemInFolder(targetPath)
    } else {
      ctx.openInTab(targetPath)
    }

    ctx.notify(`📂 Opened: ${path.basename(targetPath)}`)

    return {
      success: true,
      action: 'open_file',
      message: `Opened "${targetInput}"`,
      createdPath: targetPath,
    }
  },
}
