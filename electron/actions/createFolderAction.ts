import fs from 'node:fs'
import path from 'node:path'
import { ActionDefinition, ActionContext, ActionResult } from './types'

export const createFolderAction: ActionDefinition = {
  id: 'create_folder',
  aliases: ['mkdir', 'new_folder', 'make_folder'],
  description: 'Creates a directory recursively on the local filesystem.',
  parameters: {
    path: {
      type: 'string',
      required: true,
      description: 'Folder name or path (relative to active directory or absolute)',
    },
  },
  example: {
    action: 'create_folder',
    path: '<folder_name>',
  },
  async execute(ctx: ActionContext, payload: any, targetPane = 'book'): Promise<ActionResult> {
    const params = payload.params || {}
    const name = params.name ?? payload.name
    const subPath = params.path ?? payload.path
    const folder = params.folder ?? payload.folder
    const target = params.target ?? payload.target

    const targetInput = name || subPath || folder || target
    if (!targetInput) {
      throw new Error('Missing folder name or path for create_folder')
    }

    console.log(`[create_folder:STEP 1] Resolving path for input: "${targetInput}" (TargetPane: "${targetPane}")`)
    let targetDir = ''
    if (name && subPath && !path.isAbsolute(name)) {
      targetDir = ctx.resolveSafePath(path.join(subPath, name), targetPane)
    } else {
      targetDir = ctx.resolveSafePath(targetInput, targetPane)
    }
    console.log(`[create_folder:STEP 2] Target directory resolved to: "${targetDir}"`)

    await fs.promises.mkdir(targetDir, { recursive: true })
    console.log(`[create_folder:STEP 3] Successfully created directory: "${targetDir}"`)

    const displayFolder = path.basename(targetDir) || targetInput
    ctx.notify(`📁 Created folder: ${displayFolder}`)
    ctx.refreshExplorer(targetPane)

    return {
      success: true,
      action: 'create_folder',
      message: `Created folder "${displayFolder}"`,
      createdPath: targetDir,
    }
  },
}
