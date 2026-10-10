import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import AdmZip from 'adm-zip'
import mammoth from 'mammoth'

import { ActionRegistry } from '../electron/actions/registry.ts'
import { ActionContext, ActionResult } from '../electron/actions/types.ts'
import { renderDocxAction } from '../electron/actions/renderDocxAction.ts'
import { createDocxAction } from '../electron/actions/createDocxAction.ts'
import { extractRfpAction } from '../electron/actions/extractRfpAction.ts'
import { searchTextAction } from '../electron/actions/searchTextAction.ts'
import { readPagesAction } from '../electron/actions/readPagesAction.ts'
import { createFolderAction } from '../electron/actions/createFolderAction.ts'
import { writeFileAction } from '../electron/actions/writeFileAction.ts'
import { copyFileAction } from '../electron/actions/fileOpsActions.ts'
import { batchAction } from '../electron/actions/batchAction.ts'

describe('Workbench Document & RFP Actions Test Suite', () => {
  let tempTestDir: string
  let registry: ActionRegistry
  let mockContext: ActionContext

  before(() => {
    tempTestDir = path.join(os.tmpdir(), `wb_test_suite_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`)
    fs.mkdirSync(tempTestDir, { recursive: true })

    registry = ActionRegistry.getInstance()
    registry.register(renderDocxAction)
    registry.register(createDocxAction)
    registry.register(extractRfpAction)
    registry.register(searchTextAction)
    registry.register(readPagesAction)
    registry.register(createFolderAction)
    registry.register(writeFileAction)
    registry.register(copyFileAction)
    registry.register(batchAction)

    mockContext = {
      resolveSafePath: (target: string) => {
        if (path.isAbsolute(target)) return target
        return path.join(tempTestDir, target)
      },
      getActiveDirectory: () => tempTestDir,
      notify: () => {},
      refreshExplorer: () => {},
      openInTab: () => {},
      confirm: async () => true,
      getWorkspaceFolders: () => ({
        activeTarget: 'book',
        activeDirectory: tempTestDir,
        bookDirectory: tempTestDir,
        noteDirectory: tempTestDir,
      }),
      setActiveTarget: () => {},
      dispatch: async (payload: any, targetPane = 'book'): Promise<ActionResult> => {
        const actionName = (payload.action || payload.type || '').toLowerCase().trim()
        const def = registry.get(actionName)
        if (!def) {
          return {
            success: false,
            action: actionName,
            message: `Unknown action: ${actionName}`,
            error: `Unknown action: ${actionName}`,
          }
        }
        try {
          return await def.execute(mockContext, payload, targetPane as any)
        } catch (err: any) {
          return {
            success: false,
            action: actionName,
            message: err.message || 'Execution error',
            error: err.message || 'Execution error',
          }
        }
      },
    }
  })

  after(() => {
    try {
      if (fs.existsSync(tempTestDir)) {
        fs.rmSync(tempTestDir, { recursive: true, force: true })
      }
    } catch (_) {}
  })

  describe('1. Action Registry & Discovery', () => {
    test('All new actions are registered in ActionRegistry', () => {
      const actions = registry.getAll().map((a) => a.id)
      assert.ok(actions.includes('render_docx'), 'render_docx must be registered')
      assert.ok(actions.includes('create_docx'), 'create_docx must be registered')
      assert.ok(actions.includes('extract_rfp'), 'extract_rfp must be registered')
      assert.ok(actions.includes('search_text'), 'search_text must be registered')
      assert.ok(actions.includes('read_pages'), 'read_pages must be registered')
      assert.ok(actions.includes('write_file'), 'write_file must be registered')
      assert.ok(actions.includes('copy_file'), 'copy_file must be registered')
      assert.ok(actions.includes('batch'), 'batch must be registered')
    })
  })

  describe('2. File-writing actions (render_docx, create_docx, write_file, copy_file)', () => {
    test('render_docx returns full 64-character SHA-256, byte size, and target folder listing', async () => {
      const targetDocx = path.join(tempTestDir, 'out_test', 'report.docx')

      const spec = {
        title: 'Project Evaluation & Feasibility Study',
        blocks: [
          { type: 'heading', level: 1, text: 'Executive Summary' },
          {
            type: 'paragraph',
            text: 'This report provides a **rigorous evaluation** of the proposed system architecture. [[Section 4.1]]',
          },
          {
            type: 'table',
            columns: [
              { header: 'Milestone', width: 2.0 },
              { header: 'Description', width: 3.5 },
            ],
            rows: [
              ['Phase 1', 'Local Extraction & Parsing Pipeline'],
              ['Phase 2', 'Document Generation & Automated Verification'],
            ],
          },
        ],
      }

      const result = await renderDocxAction.execute(mockContext, {
        outPath: targetDocx,
        spec,
      })

      assert.ok(result.success, `render_docx failed: ${result.error || result.message}`)
      assert.ok(fs.existsSync(targetDocx), 'Output docx file should exist on disk')
      assert.strictEqual(result.createdPath, targetDocx)
      assert.ok(result.details?.sizeBytes > 0, 'Output file size should be > 0')
      assert.strictEqual(typeof result.details?.sha256, 'string')
      assert.strictEqual(result.details?.sha256.length, 64, 'SHA-256 must be full 64 hex characters')
      assert.ok(!result.message.includes('...'), 'Message must not truncate SHA-256')
      assert.ok(Array.isArray(result.details?.files), 'Should return files in target directory')
      assert.ok(result.details?.files.includes('report.docx'))
      assert.ok(result.details?.fileCount >= 1)

      const extracted = await mammoth.extractRawText({ path: targetDocx })
      assert.ok(extracted.value.includes('Project Evaluation & Feasibility Study'))
    })

    test('create_docx returns full 64-char SHA-256 and target folder listing', async () => {
      const targetDocx = path.join(tempTestDir, 'out_test', 'simple.docx')
      const result = await createDocxAction.execute(mockContext, {
        path: targetDocx,
        title: 'Simple Doc',
        content: '# Header\n- Bullet 1\n- Bullet 2',
      })

      assert.ok(result.success, `create_docx failed: ${result.error || result.message}`)
      assert.strictEqual(result.createdPath, targetDocx)
      assert.strictEqual(result.details?.sha256.length, 64)
      assert.ok(Array.isArray(result.details?.files))
      assert.ok(result.details?.files.includes('simple.docx'))
    })

    test('write_file returns full 64-char SHA-256 and target folder listing', async () => {
      const targetFile = path.join(tempTestDir, 'out_test', 'data.json')
      const result = await writeFileAction.execute(mockContext, {
        path: targetFile,
        content: '{"status": "ok"}',
      })

      assert.ok(result.success, `write_file failed: ${result.error || result.message}`)
      assert.strictEqual(result.createdPath, targetFile)
      assert.strictEqual(result.details?.sha256.length, 64)
      assert.ok(result.details?.files.includes('data.json'))
    })

    test('copy_file returns full 64-char SHA-256 and target folder listing', async () => {
      const srcFile = path.join(tempTestDir, 'out_test', 'data.json')
      const dstFile = path.join(tempTestDir, 'out_test', 'data_copy.json')
      const result = await copyFileAction.execute(mockContext, {
        source: srcFile,
        target: dstFile,
      })

      assert.ok(result.success, `copy_file failed: ${result.error || result.message}`)
      assert.strictEqual(result.createdPath, dstFile)
      assert.strictEqual(result.details?.sha256.length, 64)
      assert.ok(result.details?.files.includes('data_copy.json'))
    })
  })

  describe('3. extract_rfp action (Zip Scoping, Exclusions & Stale File Cleanup)', () => {
    let rfpFolder: string

    before(async () => {
      rfpFolder = path.join(tempTestDir, 'RFP_Exclusion_Test')
      fs.mkdirSync(rfpFolder, { recursive: true })

      // 1. Create a zip archive with 3 valid RFP source files
      const zip = new AdmZip()
      zip.addFile('Exhibit_A_Scope.txt', Buffer.from('Scope of work document.', 'utf-8'))
      zip.addFile('Exhibit_B_Pricing.txt', Buffer.from('Pricing schedule.', 'utf-8'))
      zip.addFile('Exhibit_D_Insurance.txt', Buffer.from('-- page 1 --\nHeader\n-- page 5 --\n5.2.5 \tCyber \tLiability \tCoverage\n-- page 6 --\ncyber \tliability requirements', 'utf-8'))
      zip.writeZip(path.join(rfpFolder, 'rfp_source.zip'))

      // 2. Create created/temporary files in the folder that should be EXCLUDED
      fs.writeFileSync(path.join(rfpFolder, 'RFP-3-report-v1.docx'), 'Fake report')
      fs.writeFileSync(path.join(rfpFolder, 'Doc-Section-Summary-v2.docx'), 'Fake section summary')
      fs.writeFileSync(path.join(rfpFolder, 'Layer1-Prompt-1.txt'), 'Fake prompt')
      fs.writeFileSync(path.join(rfpFolder, 'rfp-facts-01.json'), '{"facts": []}')

      // 3. Create excluded folders with files
      const excludedDirs = ['_test', 'Resp-format-docs', 'old-files', 'Old-files-backup']
      for (const d of excludedDirs) {
        const dPath = path.join(rfpFolder, d)
        fs.mkdirSync(dPath, { recursive: true })
        fs.writeFileSync(path.join(dPath, 'should_be_ignored.txt'), 'ignore me')
      }

      // 4. Pre-populate _extracted with stale .txt files
      const extractedDir = path.join(rfpFolder, '_extracted')
      fs.mkdirSync(extractedDir, { recursive: true })
      fs.writeFileSync(path.join(extractedDir, 'stale_old_report.txt'), 'Stale report text')
      fs.writeFileSync(path.join(extractedDir, 'stale_prompt.txt'), 'Stale prompt text')
    })

    test('extracts only zip files, excludes generated files, removes stale files, and reports rich summary', async () => {
      const result = await extractRfpAction.execute(mockContext, {
        folder: rfpFolder,
      })

      assert.ok(result.success, `extract_rfp failed: ${result.error || result.message}`)
      const extractedDir = path.join(rfpFolder, '_extracted')

      // Check manifest
      const manifestPath = path.join(extractedDir, 'manifest.json')
      assert.ok(fs.existsSync(manifestPath), 'manifest.json must exist')
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))

      // Must only contain the 3 files from zip
      assert.strictEqual(manifest.files.length, 3, 'Should extract only the 3 files originating from the zip')
      const fileNames = manifest.files.map((f: any) => f.name)
      assert.ok(fileNames.includes('Exhibit_A_Scope.txt'))
      assert.ok(fileNames.includes('Exhibit_B_Pricing.txt'))
      assert.ok(fileNames.includes('Exhibit_D_Insurance.txt'))
      assert.ok(!fileNames.includes('RFP-3-report-v1.docx'))
      assert.ok(!fileNames.includes('Layer1-Prompt-1.txt'))
      assert.ok(!fileNames.includes('rfp-facts-01.json'))

      // Verify stale files were deleted from _extracted
      assert.ok(!fs.existsSync(path.join(extractedDir, 'stale_old_report.txt')), 'stale_old_report.txt should be deleted')
      assert.ok(!fs.existsSync(path.join(extractedDir, 'stale_prompt.txt')), 'stale_prompt.txt should be deleted')
      assert.ok(result.details?.staleFilesRemoved?.includes('stale_old_report.txt'))
      assert.ok(result.details?.staleFilesRemoved?.includes('stale_prompt.txt'))

      // Verify rich summary reporting
      assert.ok(result.message.includes('Extracted 3 RFP document(s)'))
      assert.ok(result.message.includes('Archive Check:'))
      assert.ok(result.message.includes('Stale text files removed: 2'))
    })
  })

  describe('4. search_text action (Whitespace normalization, cross-line phrases & case sensitivity)', () => {
    test('matches "Cyber Liability" across tabs, multi-space, and line breaks on correct pages and lines', async () => {
      const rfpFolder = path.join(tempTestDir, 'RFP_Exclusion_Test')

      // Plain search for "Cyber Liability"
      const result = await searchTextAction.execute(mockContext, {
        folder: rfpFolder,
        query: 'Cyber Liability',
        caseSensitive: false,
      })

      assert.ok(result.success, `search_text failed: ${result.error || result.message}`)
      assert.strictEqual(result.details?.totalMatches, 2, 'Should find 2 matches for Cyber Liability')

      const match1 = result.details.matches[0]
      assert.strictEqual(match1.page, 5, 'First match must be on page 5')
      assert.ok(match1.text.toLowerCase().includes('cyber liability'))

      const match2 = result.details.matches[1]
      assert.strictEqual(match2.page, 6, 'Second match must be on page 6')
      assert.ok(match2.text.toLowerCase().includes('cyber liability'))
    })

    test('respects caseSensitive: true parameter', async () => {
      const rfpFolder = path.join(tempTestDir, 'RFP_Exclusion_Test')

      const result = await searchTextAction.execute(mockContext, {
        folder: rfpFolder,
        query: 'Cyber Liability',
        caseSensitive: true,
      })

      assert.ok(result.success)
      // Exactly 1 match should have Title Case "Cyber Liability" on page 5
      assert.strictEqual(result.details?.totalMatches, 1)
      assert.strictEqual(result.details.matches[0].page, 5)
    })

    test('matches phrases wrapping onto next line across line break', async () => {
      const rfpFolder = path.join(tempTestDir, 'RFP_Exclusion_Test')
      const extractedDir = path.join(rfpFolder, '_extracted')

      // Create a test file with phrase wrapping across line break
      fs.writeFileSync(
        path.join(extractedDir, 'wrap_test.txt'),
        '-- page 1 --\nLine 1 before\nComprehensive Operational\nRisk Management framework.\nLine 4 after.',
        'utf-8'
      )

      // Update manifest to include wrap_test.txt
      const manifestPath = path.join(extractedDir, 'manifest.json')
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
      manifest.files.push({ name: 'wrap_test.txt', extractedTextFile: '_extracted/wrap_test.txt' })
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')

      const result = await searchTextAction.execute(mockContext, {
        folder: rfpFolder,
        query: 'Operational Risk Management',
      })

      assert.ok(result.success)
      assert.strictEqual(result.details?.totalMatches, 1)
      assert.strictEqual(result.details.matches[0].line, 3, 'Should report starting line 3')
      assert.strictEqual(result.details.matches[0].page, 1)
    })
  })

  describe('5. batch action (Step labeling and single output)', () => {
    test('labels steps "Step 1/3", "Step 2/3", "Step 3/3" and executes cleanly', async () => {
      const batchPayload = {
        action: 'batch',
        actions: [
          { action: 'create_folder', path: 'batch_test_clean' },
          { action: 'write_file', path: 'batch_test_clean/f1.txt', content: 'Step 2 file' },
          { action: 'write_file', path: 'batch_test_clean/f2.txt', content: 'Step 3 file' },
        ],
      }

      const result = await batchAction.execute(mockContext, batchPayload)
      assert.ok(result.success, `batch execution failed: ${result.error || result.message}`)
      assert.strictEqual(result.details?.total, 3)
      assert.strictEqual(result.details?.succeeded, 3)

      const steps = result.details.results
      assert.strictEqual(steps[0].step, '1/3')
      assert.strictEqual(steps[1].step, '2/3')
      assert.strictEqual(steps[2].step, '3/3')

      assert.ok(result.message.includes('[Step 1/3: create_folder'))
      assert.ok(result.message.includes('[Step 2/3: write_file'))
      assert.ok(result.message.includes('[Step 3/3: write_file'))
    })
  })
})

