import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import AdmZip from 'adm-zip'
import { ActionRegistry } from '../electron/actions/registry.ts'
import { ActionContext } from '../electron/actions/types.ts'
import { renderDocxAction } from '../electron/actions/renderDocxAction.ts'

function countPageBreaksInDocx(docxPath: string): number {
  if (!fs.existsSync(docxPath)) return 0
  const zip = new AdmZip(docxPath)
  const docEntry = zip.getEntry('word/document.xml')
  if (!docEntry) return 0
  const xml = zip.readAsText(docEntry)
  const matches = xml.match(/w:type="page"/g)
  return matches ? matches.length : 0
}

function countParagraphsInDocx(docxPath: string): number {
  if (!fs.existsSync(docxPath)) return 0
  const zip = new AdmZip(docxPath)
  const docEntry = zip.getEntry('word/document.xml')
  if (!docEntry) return 0
  const xml = zip.readAsText(docEntry)
  const matches = xml.match(/<w:p[\s>]/g)
  return matches ? matches.length : 0
}

async function main() {
  const tempDir = path.join(os.tmpdir(), `wb_repro_${Date.now()}`)
  fs.mkdirSync(tempDir, { recursive: true })

  const registry = ActionRegistry.getInstance()
  registry.register(renderDocxAction)

  const ctx: ActionContext = {
    resolveSafePath: (p: string) => path.isAbsolute(p) ? p : path.join(tempDir, p),
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
      return await def.execute(ctx, payload, targetPane as any)
    },
  }

  console.log('====================================================')
  console.log('STEP 1: REPRODUCING RENDER_DOCX BEHAVIOR BEFORE FIX')
  console.log('====================================================\n')

  // Test A - Unknown type:
  // Spec: a paragraph block with text "a", then a block of type "notarealtype".
  console.log('--- Test A: Unknown block type ("notarealtype") ---')
  const pathA = path.join(tempDir, 'test_a.docx')
  let resultA: any
  try {
    resultA = await ctx.dispatch({
      action: 'render_docx',
      outPath: pathA,
      spec: {
        title: '',
        blocks: [
          { type: 'paragraph', text: 'a' },
          { type: 'notarealtype', text: 'bad block' } as any,
        ],
      },
    })
  } catch (err: any) {
    resultA = { success: false, error: err.message }
  }

  const fileAExists = fs.existsSync(pathA)
  console.log(`Result A Success: ${resultA?.success}`)
  console.log(`Result A Message: ${resultA?.message || resultA?.error}`)
  console.log(`File A created: ${fileAExists}`)
  if (fileAExists) {
    console.log(`Paragraphs in File A: ${countParagraphsInDocx(pathA)}`)
    console.log(`Page breaks in File A: ${countPageBreaksInDocx(pathA)}`)
  }
  const testAPassedExpectedBehavior = !resultA.success && !fileAExists
  console.log(`>> Test A Status vs Expected: ${testAPassedExpectedBehavior ? 'PASS' : 'FAIL (Bug Confirmed: silently succeeded and wrote file)'}\n`)

  // Test B - Lowercase alias ("pagebreak"):
  console.log('--- Test B: Lowercase alias ("pagebreak") ---')
  const pathB = path.join(tempDir, 'test_b.docx')
  let resultB: any
  try {
    resultB = await ctx.dispatch({
      action: 'render_docx',
      outPath: pathB,
      spec: {
        title: '',
        blocks: [
          { type: 'paragraph', text: 'a' },
          { type: 'pagebreak' } as any,
          { type: 'paragraph', text: 'b' },
        ],
      },
    })
  } catch (err: any) {
    resultB = { success: false, error: err.message }
  }

  const pageBreaksB = countPageBreaksInDocx(pathB)
  console.log(`Result B Success: ${resultB?.success}`)
  console.log(`Page breaks in File B: ${pageBreaksB}`)
  const testBPassedExpectedBehavior = resultB.success && pageBreaksB === 1
  console.log(`>> Test B Status vs Expected: ${testBPassedExpectedBehavior ? 'PASS' : 'FAIL (Bug Confirmed: 0 page breaks rendered)'}\n`)

  // Test B-hyphen - Hyphenated alias ("page-break"):
  console.log('--- Test B-hyphen: Hyphenated alias ("page-break") ---')
  const pathBHyphen = path.join(tempDir, 'test_b_hyphen.docx')
  const resultBHyphen = await ctx.dispatch({
    action: 'render_docx',
    outPath: pathBHyphen,
    spec: {
      title: '',
      blocks: [
        { type: 'paragraph', text: 'a' },
        { type: 'page-break' } as any,
        { type: 'paragraph', text: 'b' },
      ],
    },
  })
  const pageBreaksBHyphen = countPageBreaksInDocx(pathBHyphen)
  console.log(`Result B-hyphen Success: ${resultBHyphen?.success}`)
  console.log(`Page breaks in File B-hyphen: ${pageBreaksBHyphen}`)
  const testBHyphenPassed = resultBHyphen.success && pageBreaksBHyphen === 1
  console.log(`>> Test B-hyphen Status vs Expected: ${testBHyphenPassed ? 'PASS' : 'FAIL (Bug Confirmed: 0 page breaks rendered)'}\n`)

  // Test B-underscore - Underscore alias ("page_break"):
  console.log('--- Test B-underscore: Underscore alias ("page_break") ---')
  const pathBUnderscore = path.join(tempDir, 'test_b_underscore.docx')
  const resultBUnderscore = await ctx.dispatch({
    action: 'render_docx',
    outPath: pathBUnderscore,
    spec: {
      title: '',
      blocks: [
        { type: 'paragraph', text: 'a' },
        { type: 'page_break' } as any,
        { type: 'paragraph', text: 'b' },
      ],
    },
  })
  const pageBreaksBUnderscore = countPageBreaksInDocx(pathBUnderscore)
  console.log(`Result B-underscore Success: ${resultBUnderscore?.success}`)
  console.log(`Page breaks in File B-underscore: ${pageBreaksBUnderscore}`)
  const testBUnderscorePassed = resultBUnderscore.success && pageBreaksBUnderscore === 1
  console.log(`>> Test B-underscore Status vs Expected: ${testBUnderscorePassed ? 'PASS' : 'FAIL'}\n`)

  // Test C - Control ("pageBreak"):
  console.log('--- Test C: Control ("pageBreak") ---')
  const pathC = path.join(tempDir, 'test_c.docx')
  const resultC = await ctx.dispatch({
    action: 'render_docx',
    outPath: pathC,
    spec: {
      title: '',
      blocks: [
        { type: 'paragraph', text: 'a' },
        { type: 'pageBreak' },
        { type: 'paragraph', text: 'b' },
      ],
    },
  })
  const pageBreaksC = countPageBreaksInDocx(pathC)
  console.log(`Result C Success: ${resultC?.success}`)
  console.log(`Page breaks in File C: ${pageBreaksC}`)
  const testCPassed = resultC.success && pageBreaksC === 1
  console.log(`>> Test C Status vs Expected: ${testCPassed ? 'PASS (Expected)' : 'FAIL'}\n`)

  console.log('====================================================')
  console.log('SUMMARY OF REPRODUCTION RUN:')
  console.log(`Test A (notarealtype):   ${testAPassedExpectedBehavior ? 'PASSED (unexpected)' : 'FAILED (reproduced: silently dropped)'}`)
  console.log(`Test B (pagebreak):      ${testBPassedExpectedBehavior ? 'PASSED (unexpected)' : 'FAILED (reproduced: 0 page breaks)'}`)
  console.log(`Test B-hyphen:           ${testBHyphenPassed ? 'PASSED (unexpected)' : 'FAILED (reproduced: 0 page breaks)'}`)
  console.log(`Test B-underscore:       ${testBUnderscorePassed ? 'PASSED (1 page break)' : 'FAILED'}`)
  console.log(`Test C (pageBreak):      ${testCPassed ? 'PASSED (1 page break)' : 'FAILED'}`)
  console.log('====================================================')
}

main().catch(console.error)
