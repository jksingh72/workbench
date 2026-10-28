import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

import { ActionRegistry } from '../electron/actions/registry.ts'
import { ActionContext } from '../electron/actions/types.ts'
import {
  uvCreateEnvAction,
  uvInstallPackageAction,
  uvAnalyzePackageAction,
  uvRunCodeAction,
} from '../electron/actions/uvActions.ts'
import { UvPythonService } from '../electron/services/uvPythonService.ts'
import { UV_INTROSPECT_SCRIPT } from '../electron/services/uvIntrospectScript.ts'

describe('Astral uv Python Sandbox & Package Analyzer Test Suite', () => {
  let tempTestDir: string
  let registry: ActionRegistry
  let mockContext: ActionContext

  before(() => {
    tempTestDir = path.join(os.tmpdir(), `uv_test_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`)
    fs.mkdirSync(tempTestDir, { recursive: true })

    registry = ActionRegistry.getInstance()
    registry.register(uvCreateEnvAction)
    registry.register(uvInstallPackageAction)
    registry.register(uvAnalyzePackageAction)
    registry.register(uvRunCodeAction)

    mockContext = {
      resolveSafePath: (target: string) => path.join(tempTestDir, target),
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
      dispatch: async (payload: any) => {
        const id = (payload.action || '').toLowerCase()
        const def = registry.get(id)
        if (!def) return { success: false, action: id, message: `Unknown: ${id}` }
        return await def.execute(mockContext, payload)
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

  describe('1. Action Registry Discovery', () => {
    test('All uv actions are registered in ActionRegistry', () => {
      const all = registry.getAll().map((a) => a.id)
      assert.ok(all.includes('uv_create_env'), 'uv_create_env must be registered')
      assert.ok(all.includes('uv_install_package'), 'uv_install_package must be registered')
      assert.ok(all.includes('uv_analyze_package'), 'uv_analyze_package must be registered')
      assert.ok(all.includes('uv_run_code'), 'uv_run_code must be registered')
    })

    test('Aliases resolve correctly to primary action IDs', () => {
      assert.strictEqual(registry.get('create_python_env')?.id, 'uv_create_env')
      assert.strictEqual(registry.get('uv_pip_install')?.id, 'uv_install_package')
      assert.strictEqual(registry.get('analyze_python_package')?.id, 'uv_analyze_package')
      assert.strictEqual(registry.get('run_python_in_env')?.id, 'uv_run_code')
    })
  })

  describe('2. Introspection Script Architecture', () => {
    test('UV_INTROSPECT_SCRIPT defines required AST and inspect functions', () => {
      assert.ok(UV_INTROSPECT_SCRIPT.includes('def get_metadata(package_name: str)'))
      assert.ok(UV_INTROSPECT_SCRIPT.includes('def inspect_function(func: Any, name: str, mod_name: str)'))
      assert.ok(UV_INTROSPECT_SCRIPT.includes('def inspect_class(cls: Any, name: str, mod_name: str)'))
      assert.ok(UV_INTROSPECT_SCRIPT.includes('def analyze_package(package_name: str)'))
      assert.ok(UV_INTROSPECT_SCRIPT.includes('importlib.metadata'))
      assert.ok(UV_INTROSPECT_SCRIPT.includes('json.dumps'))
    })
  })

  describe('3. Action Error and Parameter Validation', () => {
    test('uv_install_package rejects missing package parameter', async () => {
      const res = await uvInstallPackageAction.execute(mockContext, {})
      assert.strictEqual(res.success, false)
      assert.ok(res.error?.includes('Missing required "package"'))
    })

    test('uv_analyze_package rejects missing package parameter', async () => {
      const res = await uvAnalyzePackageAction.execute(mockContext, {})
      assert.strictEqual(res.success, false)
      assert.ok(res.error?.includes('Missing required "package"'))
    })

    test('uv_run_code rejects missing or empty code parameter', async () => {
      const res = await uvRunCodeAction.execute(mockContext, { code: '   ' })
      assert.strictEqual(res.success, false)
      assert.ok(res.error?.includes('Missing required "code"'))
    })
  })

  describe('4. UvPythonService Singleton & Storage Layout', () => {
    test('getInstance returns a singleton instance', () => {
      const s1 = UvPythonService.getInstance()
      const s2 = UvPythonService.getInstance()
      assert.strictEqual(s1, s2)
    })

    test('getStorageDirectory returns an existing directory path', () => {
      const s = UvPythonService.getInstance()
      const dir = s.getStorageDirectory()
      assert.ok(typeof dir === 'string')
      assert.ok(dir.includes('uv_envs'))
      assert.ok(fs.existsSync(dir), 'uv_envs directory must exist on disk')
    })

    test('detectUv returns structured object with available boolean flag', async () => {
      const s = UvPythonService.getInstance()
      const det = await s.detectUv()
      assert.strictEqual(typeof det.available, 'boolean')
      if (det.available) {
        assert.ok(det.version?.toLowerCase().includes('uv'))
        assert.ok(typeof det.path === 'string')
      }
    })
  })
})
