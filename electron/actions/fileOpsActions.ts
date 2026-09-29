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
      throw new Error('Both source and target are required for move_file')
    }

    const srcPath = ctx.resolveSafePath(source, targetPane)
    const dstPath = ctx.resolveSafePath(target, targetPane)

    if (!fs.existsSync(srcPath)) {
      throw new Error(`Source does not exist: "${source}"`)
    }

    await fs.promises.mkdir(path.dirname(dstPath), { recursive: true })
    await fs.promises.rename(srcPath, dstPath)

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
      throw new Error('Both source and target are required for copy_file')
    }

    const srcPath = ctx.resolveSafePath(source, targetPane)
    const dstPath = ctx.resolveSafePath(target, targetPane)

    if (!fs.existsSync(srcPath)) {
      throw new Error(`Source does not exist: "${source}"`)
    }

    await fs.promises.mkdir(path.dirname(dstPath), { recursive: true })
    await fs.promises.cp(srcPath, dstPath, { recursive: true })

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
      throw new Error('Both source and new name/target are required for rename_file')
    }

    const srcPath = ctx.resolveSafePath(source, targetPane)
    const dstPath = path.isAbsolute(target) ? ctx.resolveSafePath(target, targetPane) : path.join(path.dirname(srcPath), target)

    if (!fs.existsSync(srcPath)) {
      throw new Error(`Item to rename does not exist: "${source}"`)
    }

    await fs.promises.rename(srcPath, dstPath)

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
