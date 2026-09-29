import fs from 'node:fs'
import path from 'node:path'
import { ActionDefinition, ActionContext, ActionResult } from './types'

export const deleteFileAction: ActionDefinition = {
  id: 'delete_file',
  aliases: ['remove_file', 'rm', 'delete_folder', 'rmdir'],
  description: 'Deletes a file or directory on disk.',
  parameters: {
    path: { type: 'string', required: true, description: 'File or directory path to delete' },
  },
  example: {
    action: 'delete_file',
    path: '<file_or_folder_to_delete>',
  },
  async execute(ctx: ActionContext, payload: any, targetPane = 'book'): Promise<ActionResult> {
    const params = payload.params || {}
    const name = params.name ?? payload.name
    const subPath = params.path ?? payload.path
    const target = params.target ?? payload.target

    const targetInput = name || subPath || target
    if (!targetInput) {
      throw new Error('Missing file or folder path for delete_file')
    }

    const targetPath = ctx.resolveSafePath(targetInput, targetPane)
    if (!fs.existsSync(targetPath)) {
      return {
        success: true,
        action: 'delete_file',
        message: `File or folder "${targetInput}" did not exist (already clean)`,
      }
    }

    // Security Guardrail: Prompt user before deleting any file or folder across all chat sites
    const confirmed = await ctx.confirm({
      title: 'Security Warning: Confirm Deletion',
      message: `An AI action requested to delete:\n\n${targetPath}`,
      detail: 'Do you want to permanently delete this file or folder? Click Cancel if this was unexpected.',
    })

    if (!confirmed) {
      ctx.notify(`🛡️ Deletion cancelled: ${path.basename(targetPath)}`)
      return {
        success: false,
        action: 'delete_file',
        message: `Deletion of "${targetInput}" was cancelled by user`,
      }
    }

    await fs.promises.rm(targetPath, { recursive: true, force: true })

    ctx.notify(`🗑️ Deleted: ${path.basename(targetPath)}`)
    ctx.refreshExplorer(targetPane)

    return {
      success: true,
      action: 'delete_file',
      message: `Deleted "${targetInput}"`,
    }
  },
}
