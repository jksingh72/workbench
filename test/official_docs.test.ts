import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { ActionRegistry } from '../electron/actions/registry.ts'
import { fetchOfficialDocsAction } from '../electron/actions/fetchOfficialDocsAction.ts'
import { OfficialDocsResolver } from '../electron/services/officialDocsResolver.ts'
import { ActionContext } from '../electron/actions/types.ts'

describe('Documentation-First Package & Ecosystem Intelligence Test Suite', () => {
  const mockContext: ActionContext = {
    getActiveDirectory: () => process.cwd(),
    resolveSafePath: (p: string) => p,
    notify: () => {},
  }

  describe('1. Action Registration & Discovery', () => {
    test('registers fetch_official_docs in ActionRegistry', () => {
      const registry = ActionRegistry.getInstance()
      registry.register(fetchOfficialDocsAction)
      const action = registry.get('fetch_official_docs')
      assert.ok(action, 'fetch_official_docs should be registered')
      assert.equal(action?.id, 'fetch_official_docs')
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
      // Access private method via any for unit testing
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

  describe('5. Action Execution End-to-End', () => {
    test('fetches official docs report with structured content', async () => {
      const res = await fetchOfficialDocsAction.execute(mockContext, {
        package: 'requests',
        fetchDocs: false, // test metadata & satellite formatting without external html fetch
      })
      assert.equal(res.success, true)
      assert.ok(res.details.content, 'Should contain formatted content')
      assert.match(res.details.content, /Official Ecosystem Analysis: requests/i)
      assert.match(res.details.content, /Official Documentation/i)
      assert.match(res.details.content, /Import Module.*import requests/i)
    })
  })
})
