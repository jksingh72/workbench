import fs from 'node:fs'
import path from 'node:path'
import { ActionDefinition, ActionContext, ActionResult } from './types'

export const moveFileAction: ActionDefinition = {
  id: 'move_file',
  aliases: ['mv'],
  description: 'Moves or relocates a file or directory from source to destination.',
  parameters: {
    source: { type: 'string', required: true, description: 'Source path' },
    target: { type: 'string', required: true, description: 'Target destination path' },
  },
  example: {
    action: 'move_file',
    source: '<source_path>',
    target: '<destination_path>',
  },
  async execute(ctx: ActionContext, payload: any, targetPane = 'book'): Promise<ActionResult> {
    const params = payload.params || {}
    const source = params.source ?? payload.source
    const target = params.target ?? payload.target

    if (!source || !target) {
      console.error(`[move_file:ERROR] Missing source or target in payload:`, payload)
      throw new Error('Both source and target are required for move_file')
    }

    console.log(`[move_file:STEP 1] Moving: source="${source}" -> target="${target}" (targetPane: ${targetPane})`)
    const srcPath = ctx.resolveSafePath(source, targetPane)
    const dstPath = ctx.resolveSafePath(target, targetPane)
    console.log(`[move_file:STEP 2] Resolved paths: "${srcPath}" -> "${dstPath}"`)

    if (!fs.existsSync(srcPath)) {
      console.error(`[move_file:ERROR] Source does not exist: "${srcPath}"`)
      throw new Error(`Source does not exist: "${source}"`)
    }

    console.log(`[move_file:STEP 3] Ensuring destination directory exists: "${path.dirname(dstPath)}"`)
    await fs.promises.mkdir(path.dirname(dstPath), { recursive: true })

    console.log(`[move_file:STEP 4] Executing rename / move operation...`)
    await fs.promises.rename(srcPath, dstPath)

    console.log(`[move_file:STEP 5] Move complete. Refreshing explorer...`)
    ctx.notify(`📦 Moved "${path.basename(srcPath)}" -> "${path.basename(dstPath)}"`)
    ctx.refreshExplorer(targetPane)

    return {
      success: true,
      action: 'move_file',
      message: `Moved "${source}" to "${target}"`,
      createdPath: dstPath,
    }
  },
}

export const copyFileAction: ActionDefinition = {
  id: 'copy_file',
  aliases: ['cp'],
  description: 'Copies a file or folder to a target destination.',
  parameters: {
    source: { type: 'string', required: true, description: 'Source file or folder path' },
    target: { type: 'string', required: true, description: 'Target destination path' },
  },
  example: {
    action: 'copy_file',
    source: '<source_path>',
    target: '<destination_path>',
  },
  async execute(ctx: ActionContext, payload: any, targetPane = 'book'): Promise<ActionResult> {
    const params = payload.params || {}
    const source = params.source ?? payload.source
    const target = params.target ?? payload.target

    if (!source || !target) {
      console.error(`[copy_file:ERROR] Missing source or target in payload:`, payload)
      throw new Error('Both source and target are required for copy_file')
    }

    console.log(`[copy_file:STEP 1] Copying: source="${source}" -> target="${target}" (targetPane: ${targetPane})`)
    const srcPath = ctx.resolveSafePath(source, targetPane)
    const dstPath = ctx.resolveSafePath(target, targetPane)
    console.log(`[copy_file:STEP 2] Resolved paths: "${srcPath}" -> "${dstPath}"`)

    if (!fs.existsSync(srcPath)) {
      console.error(`[copy_file:ERROR] Source does not exist: "${srcPath}"`)
      throw new Error(`Source does not exist: "${source}"`)
    }

    console.log(`[copy_file:STEP 3] Ensuring destination directory exists: "${path.dirname(dstPath)}"`)
    await fs.promises.mkdir(path.dirname(dstPath), { recursive: true })

    console.log(`[copy_file:STEP 4] Executing recursive copy operation...`)
    await fs.promises.cp(srcPath, dstPath, { recursive: true })

    console.log(`[copy_file:STEP 5] Copy complete. Refreshing explorer...`)
    ctx.notify(`📋 Copied "${path.basename(srcPath)}" -> "${path.basename(dstPath)}"`)
    ctx.refreshExplorer(targetPane)

    return {
      success: true,
      action: 'copy_file',
      message: `Copied "${source}" to "${target}"`,
      createdPath: dstPath,
    }
  },
}

export const renameFileAction: ActionDefinition = {
  id: 'rename_file',
  aliases: ['rename'],
  description: 'Renames a file or folder in the current directory.',
  parameters: {
    source: { type: 'string', required: true, description: 'Current name or path' },
    name: { type: 'string', required: true, description: 'New name or target path' },
  },
  example: {
    action: 'rename_file',
    source: '<old_name>',
    name: '<new_name>',
  },
  async execute(ctx: ActionContext, payload: any, targetPane = 'book'): Promise<ActionResult> {
    const params = payload.params || {}
    const source = params.source ?? payload.source
    const target = params.target ?? payload.target ?? params.name ?? payload.name

    if (!source || !target) {
      console.error(`[rename_file:ERROR] Missing source or new name in payload:`, payload)
      throw new Error('Both source and new name/target are required for rename_file')
    }

    console.log(`[rename_file:STEP 1] Renaming: source="${source}" -> target="${target}" (targetPane: ${targetPane})`)
    const srcPath = ctx.resolveSafePath(source, targetPane)
    const dstPath = path.isAbsolute(target) ? ctx.resolveSafePath(target, targetPane) : path.join(path.dirname(srcPath), target)
    console.log(`[rename_file:STEP 2] Resolved paths: "${srcPath}" -> "${dstPath}"`)

    if (!fs.existsSync(srcPath)) {
      console.error(`[rename_file:ERROR] Item to rename does not exist: "${srcPath}"`)
      throw new Error(`Item to rename does not exist: "${source}"`)
    }

    console.log(`[rename_file:STEP 3] Executing rename operation...`)
    await fs.promises.rename(srcPath, dstPath)

    console.log(`[rename_file:STEP 4] Rename complete. Refreshing explorer...`)
    ctx.notify(`✏️ Renamed "${path.basename(srcPath)}" to "${path.basename(dstPath)}"`)
    ctx.refreshExplorer(targetPane)

    return {
      success: true,
      action: 'rename_file',
      message: `Renamed "${source}" to "${target}"`,
      createdPath: dstPath,
    }
  },
}
