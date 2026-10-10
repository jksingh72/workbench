import { ActionDefinition, ActionContext, ActionResult } from './types'

export const batchAction: ActionDefinition = {
  id: 'batch',
  aliases: ['execute_batch', 'sequence'],
  description:
    'Executes multiple actions sequentially in order, returning a complete ordered result log for each individual action.',
  parameters: {
    actions: {
      type: 'array',
      required: true,
      description: 'Array of action objects to execute in sequential order.',
    },
    stopOnFailure: {
      type: 'boolean',
      required: false,
      description: 'Whether to halt batch execution if any individual action fails (default: true).',
      default: true,
    },
  },
  example: {
    action: 'batch',
    stopOnFailure: true,
    actions: [
      { action: 'create_folder', path: 'src' },
      { action: 'write_file', path: 'src/index.js', content: 'console.log("ready")\n' },
    ],
  },
  async execute(ctx: ActionContext, payload: any, targetPane = 'book'): Promise<ActionResult> {
    const params = payload.params || {}
    const actions = params.actions || payload.actions || (Array.isArray(payload) ? payload : [])
    const stopOnFailure = (params.stopOnFailure ?? payload.stopOnFailure) !== false

    if (!Array.isArray(actions) || actions.length === 0) {
      console.error('[batch:ERROR] No actions provided for batch execution:', payload)
      throw new Error('No actions provided for batch execution')
    }

    console.log(
      `[batch:START] Beginning execution of ${actions.length} batched action(s) (targetPane: ${targetPane}, stopOnFailure: ${stopOnFailure})`
    )

    const stepLogs: string[] = []
    const results: ActionResult[] = []
    let allSucceeded = true
    let failedIndex = -1

    for (let i = 0; i < actions.length; i++) {
      const act = actions[i]
      const stepNum = i + 1
      const actType = (act?.action || act?.type || 'unknown').toLowerCase()
      const actTarget = act?.path || act?.folder || act?.outPath || act?.file || act?.query || ''
      const targetStr = actTarget ? ` (${actTarget})` : ''

      console.log(`[batch:STEP ${stepNum}/${actions.length}] Dispatching: "${actType}"${targetStr}`)
      const res = await ctx.dispatch(act, targetPane)
      results.push(res)

      if (res.success) {
        stepLogs.push(`[${stepNum}/${actions.length}] ${actType}${targetStr} -> ✅ ${res.message}`)
        console.log(`[batch:STEP ${stepNum}/${actions.length}] "${actType}" succeeded`)
      } else {
        allSucceeded = false
        failedIndex = stepNum
        const errText = res.error || res.message || 'Failed'
        stepLogs.push(`[${stepNum}/${actions.length}] ${actType}${targetStr} -> ❌ ${errText}`)
        console.error(`[batch:FAILED] Step ${stepNum} ("${actType}") failed:`, errText)

        if (stopOnFailure) {
          const summary = `Batch halted at step ${failedIndex}/${actions.length} with failure:\n\n${stepLogs.join('\n')}`
          return {
            success: false,
            action: 'batch',
            message: summary,
            error: `Failed at step ${failedIndex}: ${errText}`,
            details: {
              total: actions.length,
              executed: results.length,
              failedStep: failedIndex,
              results,
            },
          }
        }
      }
    }

    const successCount = results.filter((r) => r.success).length
    const overallSummary = `Batch completed (${successCount}/${actions.length} succeeded):\n\n${stepLogs.join('\n')}`

    return {
      success: allSucceeded,
      action: 'batch',
      message: overallSummary,
      details: {
        total: actions.length,
        succeeded: successCount,
        failed: actions.length - successCount,
        results,
      },
    }
  },
}
