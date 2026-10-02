import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ActionDefinition, ActionContext, ActionResult } from './types'
import { ActionRegistry } from './registry'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function toCamelCase(str: string): string {
  return str
    .replace(/[-_]([a-z0-9])/gi, (_, g) => g.toUpperCase())
    .replace(/^([A-Z])/, (m) => m.toLowerCase())
}

function findWorkbenchActionsDir(): string | null {
  const candidates = [
    path.join(process.cwd(), 'electron', 'actions'),
    path.join(process.env.APP_ROOT || '', 'electron', 'actions'),
    path.resolve(__dirname, '..', 'actions'),
    path.resolve(__dirname),
    path.join(process.cwd(), 'Workbench', 'electron', 'actions'),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.existsSync(path.join(c, 'types.ts'))) {
      return c
    }
  }
  return null
}

export const createActionAction: ActionDefinition = {
  id: 'create_action',
  aliases: ['add_action', 'register_action', 'new_action'],
  description:
    'Creates and registers a new modular action in Workbench. Writes the TypeScript action module into electron/actions/ and registers it in electron/actions/index.ts.',
  parameters: {
    name: {
      type: 'string',
      required: true,
      description: 'Canonical action ID in snake_case (e.g. "download_file", "search_files", "archive_folder")',
    },
    code: {
      type: 'string',
      required: false,
      description: 'Complete TypeScript source code implementing ActionDefinition for this action',
    },
    description: {
      type: 'string',
      required: false,
      description: 'Brief description of what the action does',
    },
    aliases: {
      type: 'array',
      required: false,
      description: 'Optional synonyms or alternative names for the action',
    },
    example: {
      type: 'object',
      required: false,
      description: 'Sample JSON payload demonstrating the action',
    },
  },
  example: {
    action: 'create_action',
    name: 'download_file',
    aliases: ['fetch_file', 'curl'],
    description: 'Downloads a file from a URL to the local disk.',
    code: `import fs from 'node:fs'\nimport path from 'node:path'\nimport { ActionDefinition, ActionContext, ActionResult } from './types'\n\nexport const downloadFileAction: ActionDefinition = {\n  id: 'download_file',\n  aliases: ['fetch_file'],\n  description: 'Downloads a remote file from a URL to the active directory.',\n  parameters: {\n    url: { type: 'string', required: true, description: 'Source URL' },\n    filename: { type: 'string', required: false, description: 'Target filename' }\n  },\n  example: {\n    action: 'download_file',\n    url: 'https://example.com/data.json',\n    filename: 'data.json'\n  },\n  async execute(ctx: ActionContext, payload: any, targetPane = 'book'): Promise<ActionResult> {\n    const params = payload.params || {}\n    const url = params.url || payload.url\n    const filename = params.filename || payload.filename || path.basename(new URL(url).pathname) || 'downloaded_file'\n    const targetPath = ctx.resolveSafePath(filename, targetPane)\n    const res = await fetch(url)\n    if (!res.ok) throw new Error(\`Download failed with HTTP \${res.status}\`)\n    const arrayBuffer = await res.arrayBuffer()\n    await fs.promises.writeFile(targetPath, Buffer.from(arrayBuffer))\n    ctx.notify(\`⬇️ Downloaded: \${filename}\`)\n    ctx.refreshExplorer(targetPane)\n    ctx.openInTab(targetPath)\n    return { success: true, action: 'download_file', message: \`Downloaded \${filename}\`, createdPath: targetPath }\n  }\n}\n`,
  },
  async execute(ctx: ActionContext, payload: any, _targetPane = 'book'): Promise<ActionResult> {
    const params = payload.params || {}
    const rawName = (params.name ?? payload.name ?? params.id ?? payload.id ?? '').trim().toLowerCase()
    const customCode = params.code ?? payload.code ?? params.content ?? payload.content
    const actionDesc = params.description ?? payload.description ?? 'Custom Workbench Action'
    const actionAliases: string[] = params.aliases ?? payload.aliases ?? []
    const actionExample = params.example ?? payload.example ?? { action: rawName }

    if (!rawName) {
      throw new Error('Missing action "name" for create_action. Must be in snake_case (e.g. "download_file").')
    }

    const cleanId = rawName.replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
    if (!cleanId) {
      throw new Error(`Invalid action name "${rawName}". Use alphanumeric snake_case.`)
    }

    // 1. Check if an action with identical ID or aliases already exists in registry
    const registry = ActionRegistry.getInstance()
    const existingDirect = registry.get(cleanId)
    if (existingDirect) {
      const aliasInfo =
        existingDirect.aliases && existingDirect.aliases.length > 0
          ? ` (aliases: ${existingDirect.aliases.join(', ')})`
          : ''
      ctx.notify(`ℹ️ Action already exists: "${existingDirect.id}"`)
      return {
        success: false,
        action: 'create_action',
        message: `Action "${cleanId}" already exists as "${existingDirect.id}"${aliasInfo}: ${existingDirect.description}. Redirecting discussion: Please use the existing action instead of creating a duplicate.`,
        details: {
          alreadyExists: true,
          existingId: existingDirect.id,
          aliases: existingDirect.aliases,
          description: existingDirect.description,
          example: existingDirect.example,
        },
      }
    }

    // 2. Semantic and common synonym matching against existing built-in actions
    const semanticEquivalents: Array<{ triggers: string[]; existingId: string }> = [
      {
        triggers: ['mkdir', 'new_folder', 'make_folder', 'create_dir', 'make_dir', 'folder_create', 'directory_create', 'dir_create'],
        existingId: 'create_folder',
      },
      {
        triggers: ['write', 'create_file', 'save_file', 'new_file', 'edit_file', 'put_file', 'update_file', 'touch'],
        existingId: 'write_file',
      },
      {
        triggers: ['read', 'view_file', 'get_file', 'cat', 'fetch_file_content', 'file_content', 'show_file'],
        existingId: 'read_file',
      },
      {
        triggers: ['read_docx', 'parse_docx', 'read_word', 'word_reader', 'docx_to_markdown', 'view_docx', 'get_docx_content'],
        existingId: 'read_docx',
      },
      {
        triggers: ['read_pdf', 'parse_pdf', 'view_pdf', 'get_pdf_content', 'pdf_to_text'],
        existingId: 'read_pdf',
      },
      {
        triggers: ['list_actions', 'get_actions', 'show_actions', 'available_actions', 'help_actions'],
        existingId: 'list_actions',
      },
      {
        triggers: ['rm', 'remove_file', 'delete_folder', 'remove_folder', 'trash', 'unlink'],
        existingId: 'delete_file',
      },
      {
        triggers: ['ls', 'dir', 'list_files', 'show_files', 'browse_folder', 'browse_directory', 'get_files'],
        existingId: 'list_directory',
      },
      {
        triggers: ['open_tab', 'view_tab', 'show_tab', 'edit_tab', 'open_document'],
        existingId: 'open_file',
      },
      {
        triggers: ['scaffold', 'new_project', 'init_project', 'scaffold_project', 'boilerplate'],
        existingId: 'create_project',
      },
      {
        triggers: ['mv', 'move', 'rename', 'relocate_file'],
        existingId: 'move_file',
      },
      {
        triggers: ['cp', 'copy', 'duplicate', 'clone_file'],
        existingId: 'copy_file',
      },
      {
        triggers: ['cd', 'change_dir', 'switch_directory', 'set_folder', 'change_folder'],
        existingId: 'set_active_directory',
      },
      {
        triggers: ['add_action', 'register_action', 'new_action', 'create_tool'],
        existingId: 'create_action',
      },
    ]

    for (const mapping of semanticEquivalents) {
      if (
        mapping.triggers.includes(cleanId) ||
        actionAliases.some((a) => mapping.triggers.includes(a.toLowerCase().trim()))
      ) {
        const existing = registry.get(mapping.existingId)
        if (existing) {
          const aliasInfo =
            existing.aliases && existing.aliases.length > 0 ? ` (aliases: ${existing.aliases.join(', ')})` : ''
          ctx.notify(`ℹ️ Similar action exists: "${existing.id}"`)
          return {
            success: false,
            action: 'create_action',
            message: `Similar functionality already exists in action "${existing.id}"${aliasInfo}: ${existing.description}. Redirecting discussion: Please use "${existing.id}" instead of creating a duplicate action.`,
            details: {
              alreadyExists: true,
              existingId: existing.id,
              aliases: existing.aliases,
              description: existing.description,
              example: existing.example,
            },
          }
        }
      }
    }

    const actionsDir = findWorkbenchActionsDir()
    if (!actionsDir) {
      throw new Error('Could not locate Workbench "electron/actions" directory on disk.')
    }

    const camelBase = toCamelCase(cleanId)
    const varName = `${camelBase}Action`
    const fileName = `${camelBase}Action.ts`
    const filePath = path.join(actionsDir, fileName)

    let finalCode = ''
    if (customCode && customCode.trim()) {
      finalCode = customCode.trim()
    } else {
      // Generate a structured TypeScript boilerplate implementing ActionDefinition
      const aliasesArrayStr = JSON.stringify(actionAliases)
      const exampleStr = JSON.stringify(actionExample, null, 4)

      finalCode = `import fs from 'node:fs'
import path from 'node:path'
import { ActionDefinition, ActionContext, ActionResult } from './types'

export const ${varName}: ActionDefinition = {
  id: '${cleanId}',
  aliases: ${aliasesArrayStr},
  description: ${JSON.stringify(actionDesc)},
  parameters: {
    // Define parameters here
  },
  example: ${exampleStr},
  async execute(ctx: ActionContext, payload: any, targetPane = 'book'): Promise<ActionResult> {
    const params = payload.params || {}
    // Implement action logic here

    ctx.notify('⚡ Executed action: ${cleanId}')
    ctx.refreshExplorer(targetPane)

    return {
      success: true,
      action: '${cleanId}',
      message: 'Successfully executed action "${cleanId}"',
    }
  },
}
`
    }

    // 1. Write the new action file
    await fs.promises.writeFile(filePath, finalCode, 'utf8')
    console.log(`[createActionAction] Wrote action file: ${filePath}`)

    // 2. Register in electron/actions/index.ts
    const indexPath = path.join(actionsDir, 'index.ts')
    let registeredInIndex = false
    if (fs.existsSync(indexPath)) {
      let indexContent = await fs.promises.readFile(indexPath, 'utf8')
      const importStatement = `import { ${varName} } from './${camelBase}Action'`
      const exportStatement = `export * from './${camelBase}Action'`
      const registerCall = `registry.register(${varName})`

      let modified = false

      if (!indexContent.includes(importStatement)) {
        // Add import before export * from './types' or first export
        const firstExportIdx = indexContent.indexOf('export *')
        if (firstExportIdx !== -1) {
          indexContent =
            indexContent.slice(0, firstExportIdx) +
            `${importStatement}\n` +
            indexContent.slice(firstExportIdx)
          modified = true
        }
      }

      if (!indexContent.includes(exportStatement)) {
        const lastExportIdx = indexContent.lastIndexOf("export * from '")
        if (lastExportIdx !== -1) {
          const endOfLine = indexContent.indexOf('\n', lastExportIdx)
          indexContent =
            indexContent.slice(0, endOfLine + 1) +
            `${exportStatement}\n` +
            indexContent.slice(endOfLine + 1)
          modified = true
        }
      }

      if (!indexContent.includes(registerCall)) {
        const returnIdx = indexContent.indexOf('return registry')
        if (returnIdx !== -1) {
          indexContent =
            indexContent.slice(0, returnIdx) +
            `  ${registerCall}\n  ` +
            indexContent.slice(returnIdx)
          modified = true
        }
      }

      if (modified) {
        await fs.promises.writeFile(indexPath, indexContent, 'utf8')
        registeredInIndex = true
        console.log(`[createActionAction] Updated index.ts to register ${varName}`)
      }
    }

    // 3. UI feedback & tab opening
    ctx.notify(`⚡ Created new Action: "${cleanId}"`)
    ctx.openInTab(filePath)

    return {
      success: true,
      action: 'create_action',
      message: `Successfully created and registered action "${cleanId}" in electron/actions/${fileName}`,
      createdPath: filePath,
      details: {
        actionId: cleanId,
        filePath,
        registeredInIndex,
      },
    }
  },
}
