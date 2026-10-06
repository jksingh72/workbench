import fs from 'node:fs'
import path from 'node:path'
import { ActionDefinition, ActionContext, ActionResult } from './types'

export const downloadFileAction: ActionDefinition = {
  id: 'download_file',
  aliases: ['fetch_file'],
  description: 'Downloads a remote file from a URL to the active directory.',
  parameters: {
    url: { type: 'string', required: true, description: 'Source URL' },
    filename: { type: 'string', required: false, description: 'Target filename' }
  },
  example: {
    action: 'download_file',
    url: 'https://example.com/data.json',
    filename: 'data.json'
  },
  async execute(ctx: ActionContext, payload: any, targetPane = 'book'): Promise<ActionResult> {
    const params = payload.params || {}
    const url = params.url || payload.url
    const filename = params.filename || payload.filename || path.basename(new URL(url).pathname) || 'downloaded_file'
    const targetPath = ctx.resolveSafePath(filename, targetPane)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Download failed with HTTP ${res.status}`)
    const arrayBuffer = await res.arrayBuffer()
    await fs.promises.writeFile(targetPath, Buffer.from(arrayBuffer))
    ctx.notify(`⬇️ Downloaded: ${filename}`)
    ctx.refreshExplorer(targetPane)
    ctx.openInTab(targetPath)
    return { success: true, action: 'download_file', message: `Downloaded ${filename}`, createdPath: targetPath }
  }
}