import { ActionRegistry } from './registry'
import { createFolderAction } from './createFolderAction'
import { writeFileAction } from './writeFileAction'
import { createProjectAction } from './createProjectAction'
import { moveFileAction, copyFileAction, renameFileAction } from './fileOpsActions'
import { deleteFileAction } from './deleteFileAction'
import { openFileAction } from './openFileAction'
import { batchAction } from './batchAction'
import { listDirectoryAction } from './listDirectoryAction'
import { readFileAction } from './readFileAction'
import { getWorkspaceFoldersAction, setActiveDirectoryAction } from './workspaceActions'

export * from './types'
export * from './registry'
export * from './createFolderAction'
export * from './writeFileAction'
export * from './createProjectAction'
export * from './fileOpsActions'
export * from './deleteFileAction'
export * from './openFileAction'
export * from './batchAction'
export * from './listDirectoryAction'
export * from './readFileAction'
export * from './workspaceActions'

/**
 * Initializes and registers all built-in modular actions.
 */
export function registerBuiltinActions(): ActionRegistry {
  const registry = ActionRegistry.getInstance()

  registry.register(createFolderAction)
  registry.register(writeFileAction)
  registry.register(createProjectAction)
  registry.register(moveFileAction)
  registry.register(copyFileAction)
  registry.register(renameFileAction)
  registry.register(deleteFileAction)
  registry.register(openFileAction)
  registry.register(batchAction)
  registry.register(listDirectoryAction)
  registry.register(readFileAction)
  registry.register(getWorkspaceFoldersAction)
  registry.register(setActiveDirectoryAction)

  return registry
}
