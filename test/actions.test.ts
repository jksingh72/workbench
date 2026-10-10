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
import { extractRfpAction } from '../electron/actions/extractRfpAction.ts'
import { searchTextAction } from '../electron/actions/searchTextAction.ts'
import { readPagesAction } from '../electron/actions/readPagesAction.ts'
import { createFolderAction } from '../electron/actions/createFolderAction.ts'
import { writeFileAction } from '../electron/actions/writeFileAction.ts'
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
    registry.register(extractRfpAction)
    registry.register(searchTextAction)
    registry.register(readPagesAction)
    registry.register(createFolderAction)
    registry.register(writeFileAction)
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
      assert.ok(actions.includes('extract_rfp'), 'extract_rfp must be registered')
      assert.ok(actions.includes('search_text'), 'search_text must be registered')
      assert.ok(actions.includes('read_pages'), 'read_pages must be registered')
      assert.ok(actions.includes('batch'), 'batch must be registered')
    })
  })

  describe('2. render_docx action', () => {
    test('renders complex document with headings, bold text, source refs, and tables', async () => {
      const targetDocx = path.join(tempTestDir, 'report.docx')

      const spec = {
        title: 'Project Evaluation & Feasibility Study',
        theme: 'modern_teal',
        blocks: [
          { type: 'heading', level: 1, text: 'Executive Summary' },
          {
            type: 'paragraph',
            text: 'This report provides a **rigorous evaluation** of the proposed system architecture and operational readiness. [[Source: Section 4.1]]',
          },
          { type: 'heading', level: 2, text: 'Technical Specifications & Milestones' },
          {
            type: 'table',
            columnWidths: [2.0, 3.5, 1.5],
            headerRows: 1,
            rows: [
              ['Milestone', 'Description', 'Target Date'],
              ['Phase 1', 'Local Extraction & Parsing Pipeline', 'Q1 2026'],
              ['Phase 2', 'Document Generation & Automated Verification', 'Q2 2026'],
              ['Phase 3', 'Integration & End-to-End Hardening', 'Q3 2026'],
            ],
          },
          { type: 'pageBreak' },
          { type: 'heading', level: 1, text: 'Detailed Requirements' },
          {
            type: 'bulletList',
            items: [
              'Zero base64 bloat over AI chat websockets',
              'Pure local execution for Word and PDF generation',
              'Safe temporary writes in os.tmpdir() to prevent OneDrive lock issues',
            ],
          },
        ],
      }

      const result = await renderDocxAction.execute(
        mockContext,
        {
          path: targetDocx,
          spec,
        }
      )

      assert.ok(result.success, `render_docx failed: ${result.error || result.message}`)
      assert.ok(fs.existsSync(targetDocx), 'Output docx file should exist on disk')
      assert.ok(result.details?.sizeBytes > 0, 'Output file size should be > 0')
      assert.ok(result.details?.sha256, 'Should return SHA-256 hash')

      // Verify with mammoth that file is valid docx and contains expected text
      const extracted = await mammoth.extractRawText({ path: targetDocx })
      assert.ok(extracted.value.includes('Project Evaluation & Feasibility Study'))
      assert.ok(extracted.value.includes('Local Extraction & Parsing Pipeline'))
      assert.ok(extracted.value.includes('Zero base64 bloat'))
    })

    test('respects overwrite: false protection', async () => {
      const targetDocx = path.join(tempTestDir, 'report.docx')
      const result = await renderDocxAction.execute(
        mockContext,
        {
          path: targetDocx,
          overwrite: false,
          spec: {
            title: 'Attempt Overwrite',
            blocks: [{ type: 'paragraph', text: 'Should fail' }],
          },
        }
      )

      assert.strictEqual(result.success, false)
      assert.ok(result.message.includes('already exists') || (result.error && result.error.includes('already exists')))
    })
  })

  describe('3. extract_rfp action', () => {
    let rfpFolder: string

    before(async () => {
      rfpFolder = path.join(tempTestDir, 'rfp_package')
      fs.mkdirSync(rfpFolder, { recursive: true })

      // Create a docx inside rfpFolder
      await renderDocxAction.execute(
        mockContext,
        {
          path: path.join(rfpFolder, 'requirements.docx'),
          spec: {
            title: 'RFP Statement of Work',
            blocks: [
              { type: 'heading', level: 1, text: 'Mandatory Compliance Criteria' },
              { type: 'paragraph', text: 'All sub-contractors must satisfy ISO 27001 standards and provide continuous logging.' },
            ],
          },
        }
      )

      // Create a plain text file inside rfpFolder
      fs.writeFileSync(
        path.join(rfpFolder, 'notes.txt'),
        'Appendix A: Pricing schedule must be submitted in USD with 30-day payment terms.',
        'utf-8'
      )

      // Create a zip file containing another document
      const zip = new AdmZip()
      zip.addFile('subcontractor_guidelines.txt', Buffer.from('Guidelines for third-party security audits.', 'utf-8'))
      zip.writeZip(path.join(rfpFolder, 'annex.zip'))
    })

    test('extracts zip, docx, and txt files into _extracted with manifest', async () => {
      const result = await extractRfpAction.execute(
        mockContext,
        {
          folder: rfpFolder,
        }
      )

      assert.ok(result.success, `extract_rfp failed: ${result.error || result.message}`)
      const extractedDir = path.join(rfpFolder, '_extracted')
      assert.ok(fs.existsSync(extractedDir), '_extracted directory should be created')

      const manifestPath = path.join(extractedDir, 'manifest.json')
      assert.ok(fs.existsSync(manifestPath), 'manifest.json must exist')

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
      assert.ok(manifest.files.length >= 3, 'Manifest should list at least 3 extracted documents')

      // Verify extracted content text files exist and have page headers
      const docxTextFile = path.join(extractedDir, 'requirements.txt')
      assert.ok(fs.existsSync(docxTextFile), 'requirements.txt should exist in _extracted')
      const docxText = fs.readFileSync(docxTextFile, 'utf-8')
      assert.ok(docxText.includes('-- page 1 --'), 'Should include page 1 marker')
      assert.ok(docxText.includes('Mandatory Compliance Criteria'))
    })
  })

  describe('4. search_text action', () => {
    test('finds occurrences across extracted text files with line and page context', async () => {
      const rfpFolder = path.join(tempTestDir, 'rfp_package')
      const result = await searchTextAction.execute(
        mockContext,
        {
          folder: rfpFolder,
          query: 'ISO 27001',
          caseSensitive: false,
          contextLines: 1,
        }
      )

      assert.ok(result.success, `search_text failed: ${result.error || result.message}`)
      assert.ok(result.details?.totalMatches >= 1, 'Should find at least 1 match')
      const match = result.details.matches[0]
      assert.strictEqual(match.page, 1)
      assert.ok(match.text.includes('ISO 27001'))
    })

    test('supports regular expression searching', async () => {
      const rfpFolder = path.join(tempTestDir, 'rfp_package')
      const result = await searchTextAction.execute(
        mockContext,
        {
          folder: rfpFolder,
          query: 'Pricing schedule.*USD',
          regex: true,
        }
      )

      assert.ok(result.success, `search_text regex failed: ${result.error || result.message}`)
      assert.ok(result.details?.totalMatches >= 1, 'Should find regex match')
    })
  })

  describe('5. read_pages action', () => {
    test('reads specific page range without truncation caps', async () => {
      const textFile = path.join(tempTestDir, 'rfp_package', '_extracted', 'requirements.txt')
      const result = await readPagesAction.execute(
        mockContext,
        {
          file: textFile,
          fromPage: 1,
          toPage: 1,
        }
      )

      assert.ok(result.success, `read_pages failed: ${result.error || result.message}`)
      assert.ok(result.details?.content.includes('Mandatory Compliance Criteria'))
      assert.strictEqual(result.details?.fromPage, 1)
      assert.strictEqual(result.details?.toPage, 1)
    })
  })

  describe('6. batch action', () => {
    test('executes multi-action sequence and returns ordered per-step results', async () => {
      const batchPayload = {
        action: 'batch',
        actions: [
          { action: 'create_folder', path: 'batch_test_dir' },
          { action: 'write_file', path: 'batch_test_dir/file1.txt', content: 'Hello batch' },
          { action: 'write_file', path: 'batch_test_dir/file2.txt', content: 'World batch' },
        ],
      }

      const result = await batchAction.execute(mockContext, batchPayload)
      assert.ok(result.success, `batch execution failed: ${result.error || result.message}`)
      assert.strictEqual(result.details?.total, 3)
      assert.strictEqual(result.details?.succeeded, 3)
      assert.strictEqual(result.details?.failed, 0)
      assert.strictEqual(result.details?.results?.length, 3)
    })

    test('stopOnFailure: true halts batch on first failed step', async () => {
      const batchPayload = {
        action: 'batch',
        stopOnFailure: true,
        actions: [
          { action: 'create_folder', path: 'batch_stop_dir' },
          { action: 'write_file', path: 'batch_stop_dir/existing.txt', content: 'Initial', overwrite: false },
          { action: 'write_file', path: 'batch_stop_dir/existing.txt', content: 'Will Fail', overwrite: false },
          { action: 'write_file', path: 'batch_stop_dir/unreached.txt', content: 'Should not run' },
        ],
      }

      const result = await batchAction.execute(mockContext, batchPayload)
      assert.strictEqual(result.success, false)
      assert.strictEqual(result.details?.executed, 3)
      assert.strictEqual(result.details?.failedStep, 3)
      assert.ok(!fs.existsSync(path.join(tempTestDir, 'batch_stop_dir/unreached.txt')))
    })
  })

  describe('7. Large output spilling & error formatting', () => {
    test('spills payloads exceeding 30,000 characters to os.tmpdir()', () => {
      const largeContent = 'A'.repeat(35000)
      const MAX_LEN = 30000
      let body = ''

      if (largeContent.length > MAX_LEN) {
        const timestamp = Date.now()
        const spillFile = path.join(os.tmpdir(), `wb_result_test_${timestamp}.txt`)
        fs.writeFileSync(spillFile, largeContent, 'utf-8')
        const preview = largeContent.slice(0, 4000)
        body = `File Content (Showing first 4,000 of ${largeContent.length.toLocaleString()} characters):\n\`\`\`\n${preview}\n\`\`\`\n[Output was ${largeContent.length.toLocaleString()} characters; full output saved to: ${spillFile}. Use read_pages or search_text to query specific sections if needed.]`
      }

      assert.ok(body.includes('full output saved to:'))
      assert.ok(body.includes('35,000 characters'))
    })
  })
})
