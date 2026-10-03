import { ActionDefinition, ActionContext, ActionResult } from './types'
import { ActionRegistry } from './registry'

export const listActionsAction: ActionDefinition = {
  id: 'list_actions',
  aliases: ['get_actions', 'show_actions', 'available_actions', 'help_actions'],
  description: 'Lists all currently available and registered Workbench actions along with their aliases and descriptions.',
  parameters: {
    verbose: {
      type: 'boolean',
      required: false,
      description: 'Whether to include full parameter schemas and examples for each action (default: false)',
      default: false,
    },
  },
  example: {
    action: 'list_actions',
    verbose: false,
  },
  async execute(ctx: ActionContext, payload: any): Promise<ActionResult> {
    const params = payload.params || {}
    const verbose = Boolean(params.verbose ?? payload.verbose ?? false)

    const registry = ActionRegistry.getInstance()
    const actions = registry.getAll()
    console.log(`[list_actions:STEP 1] Retrieved ${actions.length} registered actions (verbose: ${verbose})`)

    const summaryList = actions.map((a) => {
      const aliasStr = a.aliases && a.aliases.length > 0 ? ` (Aliases: ${a.aliases.map((al) => `\`${al}\``).join(', ')})` : ''
      return `- **\`${a.id}\`**${aliasStr}: ${a.description}`
    })

    const message = `Workbench has ${actions.length} registered actions:\n\n${summaryList.join('\n')}`
    ctx.notify(`📋 ${actions.length} Workbench actions available`)

    return {
      success: true,
      action: 'list_actions',
      message,
      details: {
        total: actions.length,
        actions: verbose
          ? actions
          : actions.map((a) => ({
              id: a.id,
              aliases: a.aliases,
              description: a.description,
              parameters: Object.keys(a.parameters || {}),
            })),
      },
    }
  },
}
