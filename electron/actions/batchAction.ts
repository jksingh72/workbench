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
    const results: Array<ActionResult & { step: string }> = []
    let allSucceeded = true

    for (let i = 0; i < actions.length; i++) {
      const act = actions[i]
      const stepNum = i + 1
      const stepLabel = `${stepNum}/${actions.length}`
      const actType = (act?.action || act?.type || 'unknown').toLowerCase()
      const actTarget = act?.path || act?.folder || act?.outPath || act?.file || act?.query || ''
      const targetStr = actTarget ? ` (${actTarget})` : ''

      console.log(`[batch:STEP ${stepLabel}] Dispatching: "${actType}"${targetStr}`)
      const res = await ctx.dispatch(act, targetPane)
      const stepResult: ActionResult & { step: string } = {
        ...res,
        step: stepLabel,
        action: res.action || actType,
      }
      results.push(stepResult)

      if (res.success) {
        const firstLine = (res.message || 'OK').split('\n')[0]
        stepLogs.push(`- [Step ${stepLabel}: ${actType}${targetStr}] ✅ ${firstLine}`)
        console.log(`[batch:STEP ${stepLabel}] "${actType}" succeeded`)
      } else {
        allSucceeded = false
        const errText = res.error || res.message || 'Failed'
        stepLogs.push(`- [Step ${stepLabel}: ${actType}${targetStr}] ❌ ${errText}`)
        console.error(`[batch:FAILED] Step ${stepLabel} ("${actType}") failed:`, errText)

        if (stopOnFailure) {
          const summary = `Batch halted at step ${stepLabel} with failure:\n${stepLogs.join('\n')}`
          return {
            success: false,
            action: 'batch',
            message: summary,
            error: `Failed at step ${stepLabel}: ${errText}`,
            details: {
              total: actions.length,
              executed: results.length,
              failedStep: stepLabel,
              results,
            },
          }
        }
      }
    }

    const successCount = results.filter((r) => r.success).length
    const overallSummary = `Batch completed (${successCount}/${actions.length} succeeded):\n${stepLogs.join('\n')}`

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

