import fs from 'node:fs'
import path from 'node:path'
import { ActionDefinition, ActionContext, ActionResult } from './types'

export const listDirectoryAction: ActionDefinition = {
  id: 'list_directory',
  aliases: ['count_folders', 'list_folders', 'list_files', 'ls', 'dir', 'get_directory_contents'],
  description: 'Lists all folders and files with sizes in a local directory.',
  parameters: {
    path: {
      type: 'string',
      required: false,
      description: 'Directory path to inspect (relative or absolute, defaults to current active folder)',
      default: '.',
    },
  },
  example: {
    action: 'list_directory',
    path: '.',
  },
  async execute(ctx: ActionContext, payload: any, targetPane = 'book'): Promise<ActionResult> {
    const params = payload.params || {}
    const subPath =
      params.path ??
      payload.path ??
      params.dir ??
      payload.dir ??
      params.directory ??
      payload.directory ??
      params.folder ??
      payload.folder ??
      params.target ??
      payload.target ??
      params.name ??
      payload.name ??
      '.'

    const targetDir = ctx.resolveSafePath(String(subPath).trim() || '.', targetPane)

    if (!fs.existsSync(targetDir)) {
      throw new Error(`Directory does not exist: "${subPath}" (resolved to: ${targetDir})`)
    }

    const stat = await fs.promises.stat(targetDir)
    if (!stat.isDirectory()) {
      throw new Error(`Path is a file, not a directory: "${targetDir}". Use read_file to view files.`)
    }

    const entries = await fs.promises.readdir(targetDir, { withFileTypes: true })
    const folders = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort((a, b) => a.localeCompare(b))
    const rawFiles = entries.filter((e) => !e.isDirectory()).map((e) => e.name).sort((a, b) => a.localeCompare(b))

    const folderCount = folders.length
    const fileCount = rawFiles.length

    // Gather file sizes safely for up to 150 files
    const fileEntries: Array<{ name: string; sizeBytes: number; sizeFormatted: string }> = []
    const sampleLimit = Math.min(rawFiles.length, 150)
    for (let i = 0; i < sampleLimit; i++) {
      const fileName = rawFiles[i]
      try {
        const fileStat = await fs.promises.stat(path.join(targetDir, fileName))
        const bytes = fileStat.size
        let sizeFormatted = `${bytes} B`
        if (bytes >= 1024 * 1024) {
          sizeFormatted = `${(bytes / (1024 * 1024)).toFixed(1)} MB`
        } else if (bytes >= 1024) {
          sizeFormatted = `${Math.round(bytes / 1024)} KB`
        }
        fileEntries.push({ name: fileName, sizeBytes: bytes, sizeFormatted })
      } catch (_) {
        fileEntries.push({ name: fileName, sizeBytes: 0, sizeFormatted: 'unknown' })
      }
    }

    const dirDisplayName = path.basename(targetDir) || targetDir
    const summary = `Found ${folderCount} folder(s) and ${fileCount} file(s) in "${dirDisplayName}"`

    // Construct clear markdown for AI & user consumption
    let message = `### 📂 Directory Listing: \`${targetDir}\`\n\n`
    message += `**Summary:** ${folderCount} folder(s), ${fileCount} file(s)\n\n`

    if (folderCount > 0) {
      const MAX_SHOWN_FOLDERS = 40
      const shownFolders = folders.slice(0, MAX_SHOWN_FOLDERS)
      message += `📁 **Folders (${folderCount}):**\n`
      message += shownFolders.map((f) => `- 📁 \`${f}\``).join('\n')
      if (folders.length > MAX_SHOWN_FOLDERS) {
        message += `\n... *(+${folders.length - MAX_SHOWN_FOLDERS} more folders)*`
      }
      message += '\n\n'
    } else {
      message += `📁 **Folders:** *(None)*\n\n`
    }

    if (fileCount > 0) {
      const MAX_SHOWN_FILES = 80
      const shownFiles = fileEntries.slice(0, MAX_SHOWN_FILES)
      message += `📄 **Files (${fileCount}):**\n`
      message += shownFiles.map((f) => `- 📄 \`${f.name}\` (${f.sizeFormatted})`).join('\n')
      if (fileCount > MAX_SHOWN_FILES) {
        message += `\n... *(+${fileCount - MAX_SHOWN_FILES} more files)*`
      }
    } else {
      message += `📄 **Files:** *(None)*`
    }

    ctx.notify(`📊 ${summary}`)

    return {
      success: true,
      action: payload.action || 'list_directory',
      message,
      details: {
        path: targetDir,
        folderCount,
        folders,
        fileCount,
        files: rawFiles,
        fileEntries,
      },
    }
  },
}

