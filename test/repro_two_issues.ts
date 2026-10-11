import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { ActionRegistry } from '../electron/actions/registry.ts'
import { ActionContext } from '../electron/actions/types.ts'
import { renderDocxAction } from '../electron/actions/renderDocxAction.ts'
import { runScriptAction } from '../electron/actions/runScriptAction.ts'
import { writeFileAction } from '../electron/actions/writeFileAction.ts'
import { batchAction } from '../electron/actions/batchAction.ts'
import { formatActionFeedback } from '../electron/utils/feedbackFormatter.ts'

async function main() {
  const tempDir = path.join(os.tmpdir(), `wb_repro_two_issues_${Date.now()}`)
  fs.mkdirSync(tempDir, { recursive: true })

  const registry = ActionRegistry.getInstance()
  registry.register(renderDocxAction)
  registry.register(runScriptAction)
  registry.register(writeFileAction)
  registry.register(batchAction)

  const ctx: ActionContext = {
    resolveSafePath: (p: string) => (path.isAbsolute(p) ? p : path.join(tempDir, p)),
    getActiveDirectory: () => tempDir,
    notify: () => {},
    refreshExplorer: () => {},
    openInTab: () => {},
    confirm: async () => true,
    getWorkspaceFolders: () => ({
      activeTarget: 'book',
      activeDirectory: tempDir,
      bookDirectory: tempDir,
      noteDirectory: tempDir,
    }),
    setActiveTarget: () => {},
    dispatch: async (payload: any, targetPane = 'book') => {
      const act = (payload.action || payload.type || '').toLowerCase().trim()
      const def = registry.get(act)
      if (!def) throw new Error(`Unknown action: ${act}`)
      try {
        return await def.execute(ctx, payload, targetPane as any)
      } catch (err: any) {
        return {
          success: false,
          action: act,
          message: err.message || 'Execution error',
          error: err.message || 'Execution error',
        }
      }
    },
  }

  console.log('====================================================')
  console.log('REPRODUCING ISSUES BEFORE FIX')
  console.log('====================================================\n')

  // --- Issue 1: batch output cut short when a step fails ---
  console.log('--- Issue 1: Batch output when a step fails ---')
  const batchPayload = {
    action: 'batch',
    stopOnFailure: false,
    actions: [
      {
        action: 'render_docx',
        outPath: 'bad_doc.docx',
        spec: { blocks: [{ type: 'notarealtype', text: 'fail' }] },
      },
      {
        action: 'write_file',
        path: 'step2.txt',
        content: 'step 2 content',
      },
      {
        action: 'run_script',
        language: 'javascript',
        script: 'console.log("Line 1 from step 3");\nconsole.log("Line 2 from step 3");',
      },
    ],
  }

  const batchResult = await ctx.dispatch(batchPayload)
  const formattedObservation = formatActionFeedback(batchPayload, batchResult)

  console.log('Raw batch success:', batchResult.success)
  console.log('Formatted Observation received by AI:\n' + formattedObservation)

  const hasStep3Line1 = formattedObservation.includes('Line 1 from step 3')
  const hasStep3Line2 = formattedObservation.includes('Line 2 from step 3')
  console.log(`Contains Step 3 Line 1: ${hasStep3Line1}`)
  console.log(`Contains Step 3 Line 2: ${hasStep3Line2}`)
  const issue1Passed = hasStep3Line1 && hasStep3Line2
  console.log(`>> Issue 1 Status: ${issue1Passed ? 'PASS' : 'FAIL (Bug Confirmed: Step 3 full output missing)'}\n`)

  // --- Issue 2: run_script javascript require('fs') ---
  console.log('--- Issue 2: run_script JavaScript with require("fs") ---')
  const scriptPayload = {
    action: 'run_script',
    language: 'javascript',
    script: `
      const fs = require('fs');
      console.log('fs module loaded successfully: ' + typeof fs.readFileSync);
    `,
  }

  const scriptResult = await ctx.dispatch(scriptPayload)
  console.log('Script Result Success:', scriptResult.success)
  console.log('Script Result Message:\n' + (scriptResult.message || scriptResult.error))

  const issue2Passed =
    scriptResult.success &&
    (scriptResult.message || '').includes('fs module loaded successfully: function')
  console.log(`>> Issue 2 Status: ${issue2Passed ? 'PASS' : 'FAIL (Bug Confirmed: require failed)'}\n`)

  console.log('====================================================')
  console.log('REPRODUCTION SUMMARY:')
  console.log(`Issue 1 (Batch full output on partial failure): ${issue1Passed ? 'PASS' : 'FAIL (reproduced)'}`)
  console.log(`Issue 2 (run_script require support):          ${issue2Passed ? 'PASS' : 'FAIL (reproduced)'}`)
  console.log('====================================================')
}

main().catch(console.error)
