import fs from 'node:fs'
import path from 'node:path'
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
      console.error('[open_file:ERROR] Missing file path for open_file')
      throw new Error('Missing file path for open_file')
    }

    console.log(`[open_file:STEP 1] Request to open file: "${targetInput}" (reveal: ${reveal}, targetPane: ${targetPane})`)
    const targetPath = ctx.resolveSafePath(targetInput, targetPane)
    console.log(`[open_file:STEP 2] Resolved safe path: "${targetPath}"`)

    if (!fs.existsSync(targetPath)) {
      console.error(`[open_file:ERROR] File does not exist on disk: "${targetPath}"`)
      throw new Error(`File does not exist: "${targetInput}"`)
    }

    if (reveal) {
      console.log(`[open_file:STEP 3] Revealing file in system file explorer: "${targetPath}"`)
      try {
        const electron = await import('electron')
        if (electron && (electron as any).shell?.showItemInFolder) {
          (electron as any).shell.showItemInFolder(targetPath)
        }
      } catch (_) {}
    } else {
      console.log(`[open_file:STEP 3] Opening file in Workbench editor tab: "${targetPath}"`)
      ctx.openInTab(targetPath)
    }

    console.log(`[open_file:STEP 4] Successfully opened: "${path.basename(targetPath)}"`)
    ctx.notify(`📂 Opened: ${path.basename(targetPath)}`)

    return {
      success: true,
      action: 'open_file',
      message: `Opened "${targetInput}"`,
      createdPath: targetPath,
    }
  },
}
