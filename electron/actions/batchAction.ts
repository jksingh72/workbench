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
      console.error('[batch:ERROR] No actions provided for batch execution:', payload)
      throw new Error('No actions provided for batch execution')
    }

    console.log(`[batch:START] Beginning execution of ${actions.length} batched actions (targetPane: ${targetPane})`)
    const results: ActionResult[] = []
    let stepIndex = 0

    for (const act of actions) {
      stepIndex++
      const actType = act?.action || act?.type || 'unknown'
      console.log(`[batch:STEP ${stepIndex}/${actions.length}] Dispatching sub-action: "${actType}"`)
      const res = await ctx.dispatch(act, targetPane)
      results.push(res)
      if (!res.success) {
        console.error(`[batch:FAILED] Step ${stepIndex} ("${actType}") failed:`, res.message || res.error)
        return {
          success: false,
          action: 'batch',
          message: `Batch failed at step ${stepIndex} ("${actType}"): ${res.message || res.error}`,
          details: results,
        }
      }
      console.log(`[batch:STEP ${stepIndex}/${actions.length}] Sub-action "${actType}" succeeded`)
    }

    console.log(`[batch:SUCCESS] All ${actions.length} batched actions executed successfully`)
    return {
      success: true,
      action: 'batch',
      message: `Successfully executed batch of ${results.length} actions`,
      details: results,
    }
  },
}
