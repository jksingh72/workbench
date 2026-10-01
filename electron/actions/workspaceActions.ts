import fs from 'node:fs'
import path from 'node:path'
import { ActionDefinition, ActionContext, ActionResult } from './types'

export const getWorkspaceFoldersAction: ActionDefinition = {
  id: 'get_workspace_folders',
  aliases: ['get_active_directory', 'get_current_directory', 'pwd', 'get_folders', 'show_folders'],
  description: 'Inspects open directories in Book View and Note View, and shows which one is the current Action Mode target.',
  parameters: {},
  example: {
    action: 'get_workspace_folders',
  },
  async execute(ctx: ActionContext): Promise<ActionResult> {
    const folders = ctx.getWorkspaceFolders()
    const targetLabel =
      folders.activeTarget === 'note'
        ? 'Note View'
        : folders.activeTarget === 'custom'
        ? 'Custom Directory'
        : 'Book View'

    const summary = `Current Target: ${targetLabel} (${folders.activeDirectory})\n- Book View Folder: ${folders.bookDirectory || 'None'}\n- Note View Folder: ${folders.noteDirectory || 'None'}`

    ctx.notify(`📁 Active Target: ${targetLabel}`)

    return {
      success: true,
      action: 'get_workspace_folders',
      message: summary,
      details: folders,
    }
  },
}

export const setActiveDirectoryAction: ActionDefinition = {
  id: 'set_active_directory',
  aliases: ['switch_folder', 'change_directory', 'cd', 'set_target_folder', 'select_folder'],
  description: "Switches the active Action Mode target working folder between 'book' view, 'note' view, or a custom directory path.",
  parameters: {
    target: {
      type: 'string',
      required: false,
      description: "Target destination: 'note', 'book', or 'custom'",
      default: 'note',
    },
    path: {
      type: 'string',
      required: false,
      description: 'Custom directory path if target is custom or a specific directory path is desired',
    },
  },
  example: {
    action: 'set_active_directory',
    target: 'note',
  },
  async execute(ctx: ActionContext, payload: any): Promise<ActionResult> {
    const params = payload.params || {}
    let target = (params.target ?? payload.target ?? '').trim().toLowerCase()
    const customPath = (params.path ?? payload.path ?? params.folder ?? payload.folder ?? '').trim()

    if (!target && customPath) {
      target = 'custom'
    }

    if (target !== 'book' && target !== 'note' && target !== 'custom') {
      if (target.includes('note')) target = 'note'
      else if (target.includes('book')) target = 'book'
      else if (customPath) target = 'custom'
      else target = 'note' // default
    }

    let resolvedCustom = ''
    if (customPath) {
      if (path.isAbsolute(customPath)) {
        resolvedCustom = path.normalize(customPath)
      } else {
        resolvedCustom = ctx.resolveSafePath(customPath)
      }

      if (!fs.existsSync(resolvedCustom)) {
        throw new Error(`Directory does not exist: "${customPath}"`)
      }
    }

    ctx.setActiveTarget(target as 'book' | 'note' | 'custom', resolvedCustom || undefined)

    const updated = ctx.getWorkspaceFolders()
    const targetLabel =
      updated.activeTarget === 'note'
        ? 'Note View'
        : updated.activeTarget === 'custom'
        ? 'Custom Directory'
        : 'Book View'

    const msg = `Switched Action Mode target to ${targetLabel}: "${updated.activeDirectory}"`
    ctx.notify(`🎯 ${msg}`)

    return {
      success: true,
      action: 'set_active_directory',
      message: msg,
      details: updated,
    }
  },
}
