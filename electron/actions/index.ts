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
import { readDocxAction } from './readDocxAction'
import { readPdfAction } from './readPdfAction'
import { listActionsAction } from './listActionsAction'
import { getWorkspaceFoldersAction, setActiveDirectoryAction } from './workspaceActions'
import { createActionAction } from './createActionAction'

import { summarizeFileAction } from './summarizeFileAction'
import { updateActionAction } from './updateActionAction'
import { createDocxAction } from './createDocxAction'
import { attachFileAction } from './attachFileAction'
import { addMcpServerAction } from './addMcpServerAction'
import { removeMcpServerAction } from './removeMcpServerAction'
import { configureMcpServerAction } from './configureMcpServerAction'
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
export * from './readDocxAction'
export * from './readPdfAction'
export * from './attachFileAction'
export * from './listActionsAction'
export * from './workspaceActions'
export * from './createActionAction'
export * from './summarizeFileAction'
export * from './updateActionAction'
export * from './createDocxAction'
export * from './addMcpServerAction'
export * from './removeMcpServerAction'
export * from './configureMcpServerAction'

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
  registry.register(readDocxAction)
  registry.register(readPdfAction)
  registry.register(attachFileAction)
  registry.register(listActionsAction)
  registry.register(getWorkspaceFoldersAction)
  registry.register(setActiveDirectoryAction)
  registry.register(createActionAction)

  registry.register(summarizeFileAction)
  registry.register(updateActionAction)
  registry.register(createDocxAction)
  registry.register(addMcpServerAction)
  registry.register(removeMcpServerAction)
  registry.register(configureMcpServerAction)
  return registry
}
