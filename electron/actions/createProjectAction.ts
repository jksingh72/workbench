import fs from 'node:fs'
import path from 'node:path'
import { ActionDefinition, ActionContext, ActionResult } from './types'

export const createProjectAction: ActionDefinition = {
  id: 'create_project',
  aliases: ['scaffold_project', 'new_project'],
  description: 'Scaffolds an entire multi-file project directory with source files.',
  parameters: {
    folder: {
      type: 'string',
      required: true,
      description: 'Root folder name for the project',
    },
    files: {
      type: 'array',
      required: true,
      description: 'Array of file objects { name, path?, content }',
    },
  },
  example: {
    action: 'create_project',
    folder: '<project_folder>',
    files: [
      { name: '<file_name>', content: '<file_content>' },
    ],
  },
  async execute(ctx: ActionContext, payload: any, targetPane = 'book'): Promise<ActionResult> {
    const params = payload.params || {}
    const folder = params.folder ?? payload.folder
    const name = params.name ?? payload.name
    const files = params.files ?? payload.files

    const projectFolderName = folder || name || 'new-project'
    console.log(`[create_project:STEP 1] Scaffolding project: folder="${projectFolderName}" (targetPane: ${targetPane})`)
    const projectDir = ctx.resolveSafePath(projectFolderName, targetPane)
    console.log(`[create_project:STEP 2] Creating project root directory: "${projectDir}"`)
    await fs.promises.mkdir(projectDir, { recursive: true })

    const fileList = Array.isArray(files) ? files : []
    console.log(`[create_project:STEP 3] Writing ${fileList.length} project file(s)...`)
    let createdCount = 0
    let primaryFileToOpen = ''

    for (const f of fileList) {
      if (f && f.name) {
        const fSubPath = f.path ? path.join(projectFolderName, f.path, f.name) : path.join(projectFolderName, f.name)
        const filePath = ctx.resolveSafePath(fSubPath, targetPane)
        await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
        await fs.promises.writeFile(filePath, f.content || '', 'utf-8')
        createdCount++
        console.log(`[create_project:STEP 3] Wrote file ${createdCount}/${fileList.length}: "${fSubPath}" (${(f.content || '').length} chars)`)

        const base = f.name.toLowerCase()
        if (
          !primaryFileToOpen &&
          (base.includes('main') || base.includes('index') || base.includes('app') || base.endsWith('.md'))
        ) {
          primaryFileToOpen = filePath
        }
      }
    }

    console.log(`[create_project:STEP 4] Project scaffold complete. Total files written: ${createdCount}. Refreshing explorer...`)
    ctx.notify(`🚀 Project created: ${projectFolderName} (${createdCount} files)`)
    ctx.refreshExplorer(targetPane)

    if (primaryFileToOpen && Boolean(payload.openInTab || params.openInTab)) {
      console.log(`[create_project:STEP 5] Opening primary project file in tab: "${primaryFileToOpen}"`)
      ctx.openInTab(primaryFileToOpen)
    }

    return {
      success: true,
      action: 'create_project',
      message: `Created project "${projectFolderName}" with ${createdCount} files`,
      createdPath: projectDir,
      details: { fileCount: createdCount },
    }
  },
}
