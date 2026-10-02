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
  async execute(ctx: ActionContext, payload: any, targetPane = 'book'): Promise<ActionResult> {
    const params = payload.params || {}
    const name = params.name || payload.name
    const code = params.code || payload.code
    const fileOverride = params.file || payload.file
    if (!name || !code) throw new Error('update_action requires name and code')

    const fileName = fileOverride || toFileName(name)
    if (fileName.includes('/') || fileName.includes('\\') || !fileName.endsWith('.ts')) {
      throw new Error('file must be a plain .ts file name')
    }
    if (fileName === 'index.ts' || fileName === 'types.ts') throw new Error(`Refusing to overwrite ${fileName}`)
    if (!code.includes(`'${name}'`)) throw new Error(`New code does not declare id '${name}'`)

    const dir = findActionsDir()
    const target = path.join(dir, fileName)
    if (!fs.existsSync(target)) {
      throw new Error(`No existing action module at ${target}. Use create_action for new actions.`)
    }

    await fs.promises.copyFile(target, `${target}.bak`)
    await fs.promises.writeFile(target, code, 'utf8')
    ctx.notify(`♻️ Updated action: ${name}`)
    ctx.openInTab(target)
    return {
      success: true,
      action: 'update_action',
      message: `Updated ${fileName} (backup saved as ${fileName}.bak).`
    }
  }
}