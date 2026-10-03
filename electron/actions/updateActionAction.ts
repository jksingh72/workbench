import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { ActionDefinition, ActionContext, ActionResult } from './types'

function findActionsDir(): string {
  const candidates = [
    path.join(app.getAppPath(), 'electron', 'actions'),
    path.join(process.cwd(), 'electron', 'actions')
  ]
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'index.ts'))) return dir
  }
  throw new Error(`Could not locate electron/actions (checked: ${candidates.join(', ')})`)
}

function toFileName(name: string): string {
  const camel = name.replace(/[-_]+([a-z0-9])/gi, (_m: string, c: string) => c.toUpperCase())
  return `${camel}Action.ts`
}

export const updateActionAction: ActionDefinition = {
  id: 'update_action',
  aliases: ['modify_action', 'edit_action', 'overwrite_action'],
  description: 'Replaces the code of an existing Workbench action module in electron/actions/. Keeps a .bak backup and does not change index.ts.',
  parameters: {
    name: { type: 'string', required: true, description: 'Existing action id, e.g. summarize_file' },
    code: { type: 'string', required: true, description: 'Complete new TypeScript module content' },
    file: { type: 'string', required: false, description: 'Module file name, only if it does not follow <camelName>Action.ts' }
  },
  example: { action: 'update_action', name: 'summarize_file', code: '<full module code>' },
  async execute(ctx: ActionContext, payload: any, _targetPane = 'book'): Promise<ActionResult> {
    const params = payload.params || {}
    const name = params.name || payload.name
    const code = params.code || payload.code
    const fileOverride = params.file || payload.file
    if (!name || !code) {
      console.error('[update_action:ERROR] Missing name or code in payload:', payload)
      throw new Error('update_action requires name and code')
    }

    console.log(`[update_action:STEP 1] Validating update request for action: "${name}"`)
    const fileName = fileOverride || toFileName(name)
    if (fileName.includes('/') || fileName.includes('\\') || !fileName.endsWith('.ts')) {
      console.error(`[update_action:ERROR] Invalid file name: "${fileName}"`)
      throw new Error('file must be a plain .ts file name')
    }
    if (fileName === 'index.ts' || fileName === 'types.ts') {
      console.error(`[update_action:ERROR] Refusing to overwrite protected core file: ${fileName}`)
      throw new Error(`Refusing to overwrite ${fileName}`)
    }
    if (!code.includes(`'${name}'`)) {
      console.error(`[update_action:ERROR] Code does not declare action id '${name}'`)
      throw new Error(`New code does not declare id '${name}'`)
    }

    const dir = findActionsDir()
    const target = path.join(dir, fileName)
    console.log(`[update_action:STEP 2] Target module path: "${target}"`)

    if (!fs.existsSync(target)) {
      console.error(`[update_action:ERROR] Target module does not exist at "${target}"`)
      throw new Error(`No existing action module at ${target}. Use create_action for new actions.`)
    }

    console.log(`[update_action:STEP 3] Creating backup at "${target}.bak" and writing new code (${code.length} chars)...`)
    await fs.promises.copyFile(target, `${target}.bak`)
    await fs.promises.writeFile(target, code, 'utf8')

    console.log(`[update_action:STEP 4] Action updated successfully. Opening in tab...`)
    ctx.notify(`♻️ Updated action: ${name}`)
    ctx.openInTab(target)
    return {
      success: true,
      action: 'update_action',
      message: `Updated ${fileName} (backup saved as ${fileName}.bak).`
    }
  }
}