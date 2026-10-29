import { ActionDefinition, ActionContext, ActionResult } from './types'
import { PromptRegistryService } from '../services/promptRegistryService'

export const loadPromptAction: ActionDefinition = {
  id: 'load_prompt',
  aliases: ['read_prompt', 'get_prompt', 'list_prompts'],
  description:
    'Loads a modular task-specific prompt from the prompts/ directory on demand (e.g. "package-analysis" from prompts/analysis/package-analysis.md). Use ONLY when the user request matches a modular prompt trigger.',
  parameters: {
    prompt: {
      type: 'string',
      required: true,
      description:
        'Prompt ID (e.g. "package-analysis"), relative path (e.g. "prompts/analysis/package-analysis.md"), or "list" to list all available prompts.',
    },
    package: {
      type: 'string',
      required: false,
      description:
        'Optional package or target name to substitute into [PACKAGE NAME] when loading package-analysis.',
    },
    variables: {
      type: 'object',
      required: false,
      description:
        'Optional key-value variables to substitute into [KEY] or {{key}} placeholders in the prompt.',
    },
  },
  example: {
    action: 'load_prompt',
    prompt: 'package-analysis',
    package: 'fastapi',
  },
  async execute(ctx: ActionContext, payload: any): Promise<ActionResult> {
    const params = payload.params || {}
    const promptId = String(
      params.prompt ?? payload.prompt ?? params.id ?? payload.id ?? params.path ?? payload.path ?? 'package-analysis'
    ).trim()

    const activeDir = ctx.getActiveDirectory?.() || process.cwd()
    const registry = PromptRegistryService.getInstance()

    if (promptId.toLowerCase() === 'list') {
      const available = registry.listPrompts(activeDir)
      const listLines = available.map(
        (p) => `- **${p.id}** (\`${p.relativePath}\`, category: \`${p.category}\`): ${p.whenToUse}`
      )
      const content = `# Available Modular Prompts (${available.length})\n\n${listLines.join('\n')}`
      return {
        success: true,
        action: 'load_prompt',
        message: `Listed ${available.length} modular prompt(s) in prompts/.`,
        details: {
          prompts: available,
          content,
        },
      }
    }

    const found = registry.getPrompt(promptId, activeDir)
    if (!found) {
      const availableIds = registry
        .listPrompts(activeDir)
        .map((p) => `${p.id} (${p.relativePath})`)
        .join(', ')
      return {
        success: false,
        action: 'load_prompt',
        message: `Modular prompt "${promptId}" was not found in prompts/. Available prompts: ${availableIds || 'none'}.`,
        error: `Prompt "${promptId}" not found`,
      }
    }

    const pkg = String(params.package ?? payload.package ?? params.packageName ?? payload.packageName ?? '').trim()
    const userVars =
      typeof (params.variables ?? payload.variables) === 'object' && (params.variables ?? payload.variables) !== null
        ? (params.variables ?? payload.variables)
        : {}

    const variables: Record<string, string | undefined> = {
      ...userVars,
      ...(pkg ? { package: pkg, packageName: pkg } : {}),
    }

    const renderedGuidance = registry.renderGuidance(found.id, activeDir, variables) || found.content
    ctx.notify(`📋 Loaded modular prompt: ${found.name} (${found.relativePath})`)

    return {
      success: true,
      action: 'load_prompt',
      message: `Loaded modular prompt "${found.id}" (${found.relativePath})${pkg ? ` for package "${pkg}"` : ''}. Follow all instructions in the loaded prompt below.`,
      details: {
        prompt: {
          id: found.id,
          category: found.category,
          name: found.name,
          relativePath: found.relativePath,
          filePath: found.filePath,
        },
        content: renderedGuidance,
      },
    }
  },
}

