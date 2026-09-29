import { ActionDefinition, ActionContext, ActionResult } from './types'

export const batchAction: ActionDefinition = {
  id: 'batch',
  aliases: ['execute_batch', 'sequence'],
  description: 'Executes multiple actions sequentially in order.',
  parameters: {
    actions: {
      type: 'array',
      required: true,
      description: 'Array of action objects to execute',
    },
  },
  example: {
    action: 'batch',
    actions: [
      { action: 'create_folder', path: 'src' },
      { action: 'write_file', path: 'src/index.js', content: 'console.log("ready")\n' },
    ],
  },
  async execute(ctx: ActionContext, payload: any, targetPane = 'book'): Promise<ActionResult> {
    const actions = payload.actions || payload.params?.actions || (Array.isArray(payload) ? payload : [])
    if (!Array.isArray(actions) || actions.length === 0) {
      throw new Error('No actions provided for batch execution')
    }

    const results: ActionResult[] = []
    for (const act of actions) {
      const res = await ctx.dispatch(act, targetPane)
      results.push(res)
      if (!res.success) {
        return {
          success: false,
          action: 'batch',
          message: `Batch failed at step "${act.action || act.type}": ${res.message || res.error}`,
          details: results,
        }
      }
    }

    return {
      success: true,
      action: 'batch',
      message: `Successfully executed batch of ${results.length} actions`,
      details: results,
    }
  },
}
