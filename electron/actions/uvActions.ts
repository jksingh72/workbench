import { ActionDefinition, ActionContext, ActionResult } from './types'
import { UvPythonService } from '../services/uvPythonService'

export const uvCreateEnvAction: ActionDefinition = {
  id: 'uv_create_env',
  aliases: ['create_python_env', 'uv_venv', 'new_python_env'],
  description:
    'Creates a brand new, 100% isolated Python virtual environment managed by Astral uv. Does not touch or pollute system Python or project files.',
  parameters: {
    name: {
      type: 'string',
      required: false,
      description: 'Name of the environment (e.g. "ml_analysis", "web_scraper", "default"). Defaults to "env".',
      default: 'env',
    },
    pythonVersion: {
      type: 'string',
      required: false,
      description: 'Optional Python version constraint (e.g. "3.12", "3.11").',
    },
  },
  example: {
    action: 'uv_create_env',
    name: 'data_analysis',
    pythonVersion: '3.12',
  },
  async execute(_ctx: ActionContext, payload: any): Promise<ActionResult> {
    const service = UvPythonService.getInstance()
    const name = payload.name || payload.envName || 'env'
    const version = payload.pythonVersion || payload.version
    const res = await service.createVenv(name, version)

    if (res.success && res.env) {
      return {
        success: true,
        action: 'uv_create_env',
        message: `Successfully created isolated Python environment "${res.env.name}" (ID: ${res.env.id}) at ${res.env.path}`,
        createdPath: res.env.path,
        details: res.env,
      }
    }
    return {
      success: false,
      action: 'uv_create_env',
      message: res.error || 'Failed to create uv environment',
      error: res.error,
    }
  },
}

export const uvInstallPackageAction: ActionDefinition = {
  id: 'uv_install_package',
  aliases: ['uv_pip_install', 'install_python_package', 'pip_install'],
  description:
    'Installs a Python package from PyPI or local disk into an isolated uv virtual environment at ultra-high speed.',
  parameters: {
    envId: {
      type: 'string',
      required: false,
      description: 'The target environment ID. If omitted, uses the latest/default environment.',
    },
    package: {
      type: 'string',
      required: true,
      description: 'Package specification to install (e.g. "fastapi", "requests>=2.28", "pydantic", or local path).',
    },
  },
  example: {
    action: 'uv_install_package',
    package: 'fastapi',
  },
  async execute(_ctx: ActionContext, payload: any): Promise<ActionResult> {
    const service = UvPythonService.getInstance()
    const pkg = payload.package || payload.packageName || payload.spec
    if (!pkg) {
      return {
        success: false,
        action: 'uv_install_package',
        message: 'Missing "package" parameter to install',
        error: 'Missing required "package"',
      }
    }

    const envs = await service.listEnvs()
    let targetEnvId = payload.envId
    if (!targetEnvId && envs.length > 0) {
      targetEnvId = envs[0].id
    }

    if (!targetEnvId) {
      // Create a default environment on the fly
      const created = await service.createVenv('default')
      if (!created.success || !created.env) {
        return {
          success: false,
          action: 'uv_install_package',
          message: 'No uv environment exists and failed to auto-create default environment',
          error: created.error,
        }
      }
      targetEnvId = created.env.id
    }

    const res = await service.installPackage(targetEnvId, pkg)
    if (res.success) {
      return {
        success: true,
        action: 'uv_install_package',
        message: `Successfully installed "${pkg}" in uv environment ${targetEnvId}`,
        details: { output: res.output, envId: targetEnvId },
      }
    }
    return {
      success: false,
      action: 'uv_install_package',
      message: res.error || `Failed to install "${pkg}"`,
      error: res.error,
      details: { output: res.output },
    }
  },
}

export const uvAnalyzePackageAction: ActionDefinition = {
  id: 'uv_analyze_package',
  aliases: ['analyze_python_package', 'inspect_package', 'uv_inspect'],
  description:
    'Deeply introspects an installed Python package in a uv sandbox. Extracts package metadata, public classes, methods, functions, type signatures, and docstrings as structured JSON.',
  parameters: {
    envId: {
      type: 'string',
      required: false,
      description: 'Target environment ID. Defaults to the active or latest environment.',
    },
    package: {
      type: 'string',
      required: true,
      description: 'Name of the installed Python package to analyze (e.g. "requests", "pydantic", "fastapi").',
    },
  },
  example: {
    action: 'uv_analyze_package',
    package: 'requests',
  },
  async execute(_ctx: ActionContext, payload: any): Promise<ActionResult> {
    const service = UvPythonService.getInstance()
    const pkg = payload.package || payload.packageName
    if (!pkg) {
      return {
        success: false,
        action: 'uv_analyze_package',
        message: 'Missing "package" name to analyze',
        error: 'Missing required "package"',
      }
    }

    const envs = await service.listEnvs()
    let targetEnvId = payload.envId
    if (!targetEnvId && envs.length > 0) {
      targetEnvId = envs[0].id
    }

    if (!targetEnvId) {
      const created = await service.createVenv('default')
      if (!created.success || !created.env) {
        return {
          success: false,
          action: 'uv_analyze_package',
          message: 'No uv environment available and failed to auto-create default environment',
          error: created.error,
        }
      }
      targetEnvId = created.env.id
    }

    let res = await service.analyzePackage(targetEnvId, pkg)
    if (!res.success && (res.error?.includes('No module named') || res.error?.includes('Failed to import'))) {
      // Automatically install the package in the sandbox and retry analysis
      const installRes = await service.installPackage(targetEnvId, pkg)
      if (installRes.success) {
        res = await service.analyzePackage(targetEnvId, pkg)
      }
    }

    if (res.success && res.report) {
      const classCount = res.report.classes?.length || 0
      const funcCount = res.report.functions?.length || 0
      const version = res.report.metadata?.version || 'unknown'
      const summary = res.report.metadata?.summary || ''
      const deps = res.report.metadata?.dependencies || []

      let formattedSummary = `Package: ${pkg} (v${version})\n`
      if (summary) formattedSummary += `Summary: ${summary}\n`
      if (deps.length > 0) {
        formattedSummary += `Dependencies: ${deps.slice(0, 15).join(', ')}${deps.length > 15 ? ` (+${deps.length - 15} more)` : ''}\n`
      }

      if (classCount > 0) {
        formattedSummary += `\nClasses (${classCount}):\n`
        for (const cls of (res.report.classes || []).slice(0, 30)) {
          const methodList = cls.methods.map((m: any) => m.name).slice(0, 8).join(', ')
          const docFirstLine = cls.docstring ? cls.docstring.split('\n')[0].trim() : ''
          formattedSummary += `- class ${cls.name}: ${docFirstLine ? `"${docFirstLine}" ` : ''}[methods: ${methodList || 'none'}]\n`
        }
        if (classCount > 30) {
          formattedSummary += `... (+${classCount - 30} more classes)\n`
        }
      }

      if (funcCount > 0) {
        formattedSummary += `\nPublic Functions (${funcCount}):\n`
        for (const fn of (res.report.functions || []).slice(0, 30)) {
          const docFirstLine = fn.docstring ? fn.docstring.split('\n')[0].trim() : ''
          formattedSummary += `- ${fn.signature || fn.name}: ${docFirstLine ? `"${docFirstLine}"` : ''}\n`
        }
        if (funcCount > 30) {
          formattedSummary += `... (+${funcCount - 30} more functions)\n`
        }
      }

      return {
        success: true,
        action: 'uv_analyze_package',
        message: `Analyzed package "${pkg}" (v${version}): found ${classCount} classes and ${funcCount} public functions.`,
        details: {
          ...res.report,
          content: formattedSummary,
        },
      }
    }
    return {
      success: false,
      action: 'uv_analyze_package',
      message: res.error || `Failed to analyze package "${pkg}"`,
      error: res.error,
    }
  },
}

export const uvRunCodeAction: ActionDefinition = {
  id: 'uv_run_code',
  aliases: ['run_python_in_env', 'uv_python', 'run_python_code'],
  description:
    'Executes a Python script or code snippet in the isolated uv virtual environment. Captures stdout, stderr, execution duration, and exit codes.',
  parameters: {
    envId: {
      type: 'string',
      required: false,
      description: 'Target environment ID. Defaults to the active or latest environment.',
    },
    code: {
      type: 'string',
      required: true,
      description: 'The Python code snippet to execute.',
    },
  },
  example: {
    action: 'uv_run_code',
    code: 'import sys\nprint("Python version:", sys.version)',
  },
  async execute(_ctx: ActionContext, payload: any): Promise<ActionResult> {
    const service = UvPythonService.getInstance()
    const code = payload.code || payload.script
    if (!code || typeof code !== 'string' || !code.trim()) {
      return {
        success: false,
        action: 'uv_run_code',
        message: 'Missing "code" snippet to execute',
        error: 'Missing required "code"',
      }
    }

    const envs = await service.listEnvs()
    let targetEnvId = payload.envId
    if (!targetEnvId && envs.length > 0) {
      targetEnvId = envs[0].id
    }

    if (!targetEnvId) {
      return {
        success: false,
        action: 'uv_run_code',
        message: 'No uv environment available. Create an environment first.',
        error: 'No environment',
      }
    }

    const res = await service.executeCode(targetEnvId, code)
    if (res.success) {
      return {
        success: true,
        action: 'uv_run_code',
        message: res.output.trim() || 'Python script executed successfully with no output.',
        details: {
          stdout: res.output,
          stderr: res.stderr,
          exitCode: res.exitCode,
          executionTimeMs: res.executionTimeMs,
        },
      }
    }
    return {
      success: false,
      action: 'uv_run_code',
      message: res.error || 'Python execution failed',
      error: res.error,
      details: {
        stdout: res.output,
        stderr: res.stderr,
        exitCode: res.exitCode,
        executionTimeMs: res.executionTimeMs,
      },
    }
  },
}
