import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ActionRegistry } from '../electron/actions/registry.ts'
import { fetchOfficialDocsAction } from '../electron/actions/fetchOfficialDocsAction.ts'
import { loadPromptAction } from '../electron/actions/loadPromptAction.ts'
import { readFileAction } from '../electron/actions/readFileAction.ts'
import { OfficialDocsResolver } from '../electron/services/officialDocsResolver.ts'
import { OutputFormatService } from '../electron/services/outputFormatService.ts'
import { PromptRegistryService } from '../electron/services/promptRegistryService.ts'
import { ActionContext } from '../electron/actions/types.ts'

describe('Documentation-First Package Intelligence & Modular Prompts Suite', () => {
  const mockContext: ActionContext = {
    getActiveDirectory: () => process.cwd(),
    resolveSafePath: (p: string) => path.resolve(process.cwd(), p),
    notify: () => {},
    dispatch: async () => ({ success: true, message: 'mock' }),
  }

  describe('1. Action Registration & Discovery', () => {
    test('registers fetch_official_docs and load_prompt in ActionRegistry', () => {
      const registry = ActionRegistry.getInstance()
      registry.register(fetchOfficialDocsAction)
      registry.register(loadPromptAction)
      registry.register(readFileAction)

      const fetchAct = registry.get('fetch_official_docs')
      assert.ok(fetchAct, 'fetch_official_docs should be registered')
      assert.equal(fetchAct?.id, 'fetch_official_docs')

      const promptAct = registry.get('load_prompt')
      assert.ok(promptAct, 'load_prompt should be registered')
      assert.equal(promptAct?.id, 'load_prompt')
      assert.equal(registry.get('read_prompt')?.id, 'load_prompt')
    })

    test('resolves aliases correctly', () => {
      const registry = ActionRegistry.getInstance()
      const aliasAction1 = registry.get('analyze_package_ecosystem')
      const aliasAction2 = registry.get('official_docs_lookup')
      assert.ok(aliasAction1, 'alias analyze_package_ecosystem should resolve')
      assert.ok(aliasAction2, 'alias official_docs_lookup should resolve')
      assert.equal(aliasAction1?.id, 'fetch_official_docs')
      assert.equal(aliasAction2?.id, 'fetch_official_docs')
    })
  })

  describe('2. Parameter Validation & Missing Packages', () => {
    test('rejects missing package parameter', async () => {
      const res = await fetchOfficialDocsAction.execute(mockContext, {})
      assert.equal(res.success, false)
      assert.match(res.message, /Missing required "package"/i)
    })

    test('handles nonexistent package gracefully', async () => {
      const res = await fetchOfficialDocsAction.execute(mockContext, {
        package: 'some_completely_nonexistent_package_xyz_998877',
        fetchDocs: false,
      })
      assert.equal(res.success, false)
      assert.match(res.message, /not found in the official PyPI registry/i)
    })
  })

  describe('3. PyPI Metadata Resolution & Ecosystem Discovery', () => {
    test('resolves official documentation & satellite packages for pydantic', async () => {
      const resolver = OfficialDocsResolver.getInstance()
      const eco = await resolver.resolveEcosystem('pydantic')
      assert.ok(eco, 'Should resolve pydantic ecosystem')
      assert.equal(eco.cleanName, 'pydantic')
      assert.ok(eco.version, 'Should have version')
      assert.ok(eco.officialDocsUrl, 'Should have official documentation URL')
      assert.match(eco.officialDocsUrl, /docs\.pydantic\.dev|pydantic/i)
      assert.equal(eco.importableModule, 'pydantic')
    })

    test('resolves satellite package ecosystem for langchain without installing', async () => {
      const resolver = OfficialDocsResolver.getInstance()
      const eco = await resolver.resolveEcosystem('langchain')
      assert.ok(eco, 'Should resolve langchain ecosystem')
      assert.ok(eco.officialDocsUrl, 'Should have official documentation URL')
      assert.match(eco.officialDocsUrl, /python\.langchain\.com|langchain/i)
      assert.ok(eco.satellitePackages.length > 0, 'Should detect satellite packages')
      assert.ok(
        eco.corePackages.some((p) => p.includes('core')),
        'Should identify core foundation packages (langchain-core)'
      )
    })
  })

  describe('4. HTML to Clean Markdown Conversion', () => {
    test('converts HTML headings, code blocks, lists and strips boilerplates', () => {
      const resolver = OfficialDocsResolver.getInstance()
      const sampleHtml = `
        <!DOCTYPE html>
        <html>
          <head><title>Test Docs</title><script>console.log('strip me')</script></head>
          <body>
            <nav>Navigation Header Links</nav>
            <main>
              <h1>FastStream Architecture</h1>
              <p>FastStream is a powerful framework for building event-driven services.</p>
              <h2>Quickstart</h2>
              <pre><code>from faststream import FastStream</code></pre>
              <ul>
                <li>High performance</li>
                <li>Async native</li>
              </ul>
            </main>
            <footer>Footer Copyright 2026</footer>
          </body>
        </html>
      `
      const md = (resolver as any).htmlToCleanMarkdown(sampleHtml, 'https://example.com/docs')
      assert.match(md, /# FastStream Architecture/)
      assert.match(md, /## Quickstart/)
      assert.match(md, /from faststream import FastStream/)
      assert.match(md, /- High performance/)
      assert.doesNotMatch(md, /Navigation Header Links/)
      assert.doesNotMatch(md, /Footer Copyright/)
      assert.doesNotMatch(md, /<script>/)
    })
  })

  describe('5. Code-Independent Modular PromptRegistryService', () => {
    test('discovers prompts/analysis/package-analysis.md and loads its exact disk content', () => {
      const promptRegistry = PromptRegistryService.getInstance()
      const prompt = promptRegistry.getPrompt('package-analysis')
      assert.ok(prompt, 'Should discover package-analysis prompt')
      assert.equal(prompt?.id, 'package-analysis')
      assert.equal(prompt?.category, 'analysis')
      assert.equal(prompt?.relativePath, 'prompts/analysis/package-analysis.md')

      // Verify content matches the disk file verbatim (after frontmatter) so rewriting the file never breaks tests
      const diskRaw = fs.readFileSync(prompt!.filePath, 'utf-8')
      const diskBody = diskRaw.replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n/, '').trim()
      assert.equal(prompt!.content, diskBody)
      assert.ok(prompt!.content.length > 0, 'Prompt content should be non-empty')
    })

    test('substitutes variables dynamically when rendering a prompt', () => {
      const promptRegistry = PromptRegistryService.getInstance()
      const prompt = promptRegistry.getPrompt('package-analysis')
      assert.ok(prompt)

      const rendered = promptRegistry.renderPrompt('package-analysis', { packageName: 'fastapi' })
      assert.ok(rendered)
      if (prompt!.content.includes('[PACKAGE NAME]')) {
        assert.ok(rendered!.includes('fastapi'))
        assert.ok(!rendered!.includes('[PACKAGE NAME]'))
      }
    })

    test('loads prompt via load_prompt action and via read_file fallback from arbitrary active directory', async () => {
      const externalCtx: ActionContext = {
        getActiveDirectory: () => os.tmpdir(),
        resolveSafePath: (p: string) => path.resolve(os.tmpdir(), p),
        notify: () => {},
        dispatch: async () => ({ success: true, message: 'mock' }),
      }

      const promptDef = PromptRegistryService.getInstance().getPrompt('package-analysis')
      assert.ok(promptDef)

      const loadRes = await loadPromptAction.execute(externalCtx, {
        prompt: 'package-analysis',
        package: 'pydantic',
      })
      assert.equal(loadRes.success, true)
      assert.ok(loadRes.details.content.includes(promptDef!.name))

      const readRes = await readFileAction.execute(externalCtx, {
        path: 'prompts/analysis/package-analysis.md',
      })
      assert.equal(readRes.success, true)
      assert.ok(readRes.details.content.length > 0)
    })

    test('dynamically hooks newly added or rewritten prompts in prompts/<category>/ into priming without code changes', () => {
      const tempCategoryDir = path.join(process.cwd(), 'prompts', 'workflows')
      const tempPromptFile = path.join(tempCategoryDir, 'temp-architecture-review.md')

      try {
        fs.mkdirSync(tempCategoryDir, { recursive: true })
        fs.writeFileSync(
          tempPromptFile,
          [
            '---',
            'id: temp-architecture-review',
            'category: workflows',
            'name: Architecture Review Playbook',
            'whenToUse: Load ONLY when the user asks for an architecture review.',
            '---',
            'Review the architecture of [SYSTEM].',
          ].join('\n'),
          'utf-8'
        )

        const registry = ActionRegistry.getInstance()
        const primingChatgpt = registry.generatePromptGuide('D:\\Workspace', { provider: 'chatgpt' })
        const primingClaude = registry.generatePromptGuide('D:\\Workspace', { provider: 'claude' })

        assert.match(primingChatgpt, /prompts\/analysis\/package-analysis\.md/)
        assert.match(primingChatgpt, /prompts\/workflows\/temp-architecture-review\.md/)
        assert.match(primingClaude, /package-analysis/)
        assert.match(primingClaude, /temp-architecture-review/)
      } finally {
        if (fs.existsSync(tempPromptFile)) {
          fs.unlinkSync(tempPromptFile)
        }
        if (fs.existsSync(tempCategoryDir) && fs.readdirSync(tempCategoryDir).length === 0) {
          fs.rmdirSync(tempCategoryDir)
        }
      }
    })
  })

  describe('6. Action Execution End-to-End (fetch_official_docs)', () => {
    test('fetches official docs report and attaches modular package-analysis prompt from disk', async () => {
      const res = await fetchOfficialDocsAction.execute(mockContext, {
        package: 'requests',
        fetchDocs: false,
      })
      assert.equal(res.success, true)
      assert.ok(res.details.content, 'Should contain formatted content')
      assert.match(res.details.content, /Official Ecosystem Analysis: requests/i)
      assert.match(res.details.content, /Import Module.*import requests/i)
      assert.match(res.details.content, /Loaded Modular Prompt:/i)
      assert.match(res.details.content, /prompts\/analysis\/package-analysis\.md/i)
    })
  })

  describe('7. Legacy Format Template Service Compatibility', () => {
    test('discovers and loads package-architecture.format.md when explicitly queried', () => {
      const service = OutputFormatService.getInstance()
      const format = service.getFormat('package-architecture')
      assert.ok(format, 'Should find package-architecture format')
      assert.equal(format?.id, 'package-architecture')
    })
  })

  describe('8. Optional NoteView Persistence (saveNote)', () => {
    test('saves markdown note when saveNote: true', async () => {
      const tempNotesDir = path.join(process.cwd(), 'notes')
      const expectedNotePath = path.join(tempNotesDir, 'requests-architecture.md')

      try {
        const res = await fetchOfficialDocsAction.execute(mockContext, {
          package: 'requests',
          fetchDocs: false,
          saveNote: true,
        })
        assert.equal(res.success, true)
        assert.ok(res.details.savedNotePath)
        assert.ok(fs.existsSync(expectedNotePath), 'Expected note file to be created on disk')
        const noteContent = fs.readFileSync(expectedNotePath, 'utf-8')
        assert.match(noteContent, /Official Ecosystem Analysis: requests/i)
        assert.match(noteContent, /Loaded Modular Prompt:/i)
      } finally {
        if (fs.existsSync(expectedNotePath)) {
          fs.unlinkSync(expectedNotePath)
        }
      }
    })
  })
})
