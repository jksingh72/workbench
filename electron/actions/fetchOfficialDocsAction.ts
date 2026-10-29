import path from 'node:path'
import fs from 'node:fs'
import { ActionDefinition, ActionContext, ActionResult } from './types'
import { OfficialDocsResolver } from '../services/officialDocsResolver'
import { OutputFormatService } from '../services/outputFormatService'
import { PromptRegistryService } from '../services/promptRegistryService'

export const fetchOfficialDocsAction: ActionDefinition = {
  id: 'fetch_official_docs',
  aliases: [
    'analyze_package_ecosystem',
    'inspect_package_docs',
    'official_docs_lookup',
    'package_docs',
    'get_official_docs',
  ],
  description:
    'Fetches verified official documentation, architecture guides, and satellite package maps for any Python package/ecosystem directly from official sources (PyPI metadata and project documentation sites) and attaches the modular package-analysis prompt.',
  parameters: {
    package: {
      type: 'string',
      required: true,
      description:
        'Name of the package or ecosystem to analyze (e.g. "langchain", "pydantic", "fastapi", "faststream").',
    },
    fetchDocs: {
      type: 'boolean',
      required: false,
      description:
        'Whether to fetch and scrape the official documentation site content. Defaults to true.',
      default: true,
    },
    prompt: {
      type: 'string',
      required: false,
      description:
        'ID or path of the modular prompt in prompts/ to load for analysis (defaults to "package-analysis" at prompts/analysis/package-analysis.md).',
      default: 'package-analysis',
    },
    format: {
      type: 'string',
      required: false,
      description:
        'Optional output format or prompt ID override (defaults to "package-analysis").',
      default: 'package-analysis',
    },
    saveNote: {
      type: 'boolean',
      required: false,
      description:
        'Whether to automatically save the generated architecture guide as a Markdown note in NoteView (e.g. notes/<package>-guide.md). Defaults to false.',
      default: false,
    },
  },
  example: {
    action: 'fetch_official_docs',
    package: 'fastapi',
    prompt: 'package-analysis',
  },
  async execute(ctx: ActionContext, payload: any): Promise<ActionResult> {
    const params = payload.params || {}
    const pkg = (params.package || payload.package || payload.packageName || payload.name || '').trim()

    if (!pkg) {
      return {
        success: false,
        action: 'fetch_official_docs',
        message: 'Missing required "package" parameter to fetch official documentation.',
        error: 'Missing package name',
      }
    }

    console.log(`[fetch_official_docs] Resolving official ecosystem for: "${pkg}"...`)
    ctx.notify(`🔍 Resolving official docs for "${pkg}"...`)

    const resolver = OfficialDocsResolver.getInstance()
    const ecosystem = await resolver.resolveEcosystem(pkg)

    if (!ecosystem) {
      return {
        success: false,
        action: 'fetch_official_docs',
        message: `Package "${pkg}" was not found in the official PyPI registry. Please verify the package spelling.`,
        error: `Package "${pkg}" not found on PyPI`,
      }
    }

    let docsResult: any = null
    const shouldFetchDocs = payload.fetchDocs !== false && params.fetchDocs !== false

    if (shouldFetchDocs && ecosystem.officialDocsUrl) {
      ctx.notify(`🌐 Fetching official documentation from ${ecosystem.officialDocsUrl}...`)
      console.log(`[fetch_official_docs] Fetching docs from: ${ecosystem.officialDocsUrl}`)
      docsResult = await resolver.fetchOfficialDocsMarkdown(ecosystem.officialDocsUrl)
    }

    // Build rich, structured markdown report for the LLM
    const mdLines: string[] = []
    mdLines.push(`# Official Ecosystem Analysis: ${ecosystem.name} (v${ecosystem.version})`)
    if (ecosystem.summary) {
      mdLines.push(`> ${ecosystem.summary}\n`)
    }

    mdLines.push(`- **Official Documentation:** ${ecosystem.officialDocsUrl || 'None specified on PyPI'}`)
    if (ecosystem.homepageUrl) {
      mdLines.push(`- **Homepage:** ${ecosystem.homepageUrl}`)
    }
    if (ecosystem.sourceUrl) {
      mdLines.push(`- **Source Repository:** ${ecosystem.sourceUrl}`)
    }
    if (ecosystem.license) {
      mdLines.push(`- **License:** ${ecosystem.license}`)
    }
    mdLines.push(`- **Import Module:** \`import ${ecosystem.importableModule}\``)

    // Satellite Packages breakdown
    if (ecosystem.satellitePackages.length > 0) {
      mdLines.push(`\n## Constituent & Satellite Packages (${ecosystem.satellitePackages.length} detected)`)

      const coreList = ecosystem.satellitePackages.filter((p) => p.category === 'core')
      const ecoToolsList = ecosystem.satellitePackages.filter((p) => p.category === 'ecosystem')
      const integrationList = ecosystem.satellitePackages.filter((p) => p.category === 'integration')
      const otherList = ecosystem.satellitePackages.filter(
        (p) => p.category !== 'core' && p.category !== 'ecosystem' && p.category !== 'integration'
      )

      if (coreList.length > 0) {
        mdLines.push(`\n### Core / Foundation Packages (Primary runtime abstractions):`)
        for (const cp of coreList) {
          mdLines.push(`- \`${cp.name}\`${cp.constraint ? ` (${cp.constraint})` : ''} — Foundation abstractions`)
        }
      }

      if (ecoToolsList.length > 0) {
        mdLines.push(`\n### Ecosystem Tools & Extensions:`)
        for (const ep of ecoToolsList) {
          mdLines.push(`- \`${ep.name}\`${ep.constraint ? ` (${ep.constraint})` : ''} — Official tools & extensions`)
        }
      }

      if (integrationList.length > 0) {
        mdLines.push(`\n### Official Provider Integrations:`)
        for (const ip of integrationList.slice(0, 15)) {
          mdLines.push(`- \`${ip.name}\`${ip.constraint ? ` (${ip.constraint})` : ''}`)
        }
        if (integrationList.length > 15) {
          mdLines.push(`- ... (+${integrationList.length - 15} more provider integrations)`)
        }
      }

      if (otherList.length > 0 && coreList.length === 0 && ecoToolsList.length === 0 && integrationList.length === 0) {
        mdLines.push(`\n### Related Dependencies:`)
        for (const op of otherList.slice(0, 10)) {
          mdLines.push(`- \`${op.name}\`${op.constraint ? ` (${op.constraint})` : ''}`)
        }
      }
    }

    // Official Documentation Excerpt
    if (docsResult && docsResult.success && docsResult.markdownContent) {
      mdLines.push(`\n## Official Documentation (${docsResult.title})`)
      mdLines.push(`Source: ${docsResult.url}\n`)
      mdLines.push(docsResult.markdownContent)
    } else if (ecosystem.officialDocsUrl) {
      mdLines.push(`\n## Official Documentation URL`)
      mdLines.push(`Official documentation is available at: ${ecosystem.officialDocsUrl}`)
    }

    // Inject Modular Prompt from prompts/ (default: prompts/analysis/package-analysis.md)
    const requestedId = (params.prompt || payload.prompt || params.format || payload.format || 'package-analysis').trim()
    const activeDir = ctx.getActiveDirectory?.() || process.cwd()
    const promptRegistry = PromptRegistryService.getInstance()
    const formatService = OutputFormatService.getInstance()

    let resolvedPromptMeta: { id: string; name: string; filePath: string; relativePath?: string } | undefined
    let promptGuidance: string | null = null

    // If explicitly requesting a legacy format that exists only in templates/formats, allow it; otherwise prefer prompts/
    const promptDef = promptRegistry.getPrompt(requestedId, activeDir)
    if (promptDef) {
      promptGuidance = promptRegistry.renderGuidance(promptDef.id, activeDir, {
        packageName: ecosystem.name,
        package: ecosystem.name,
      })
      resolvedPromptMeta = {
        id: promptDef.id,
        name: promptDef.name,
        filePath: promptDef.filePath,
        relativePath: promptDef.relativePath,
      }
    } else {
      const formatMeta = formatService.getFormat(requestedId, activeDir)
      if (formatMeta) {
        promptGuidance = formatService.renderGuidance(requestedId, activeDir)
        resolvedPromptMeta = {
          id: formatMeta.id,
          name: formatMeta.name,
          filePath: formatMeta.filePath,
        }
      }
    }

    if (promptGuidance) {
      mdLines.push(`\n${promptGuidance}`)
    }

    const fullContent = mdLines.join('\n')

    // Optional NoteView persistence
    const shouldSaveNote = payload.saveNote === true || params.saveNote === true
    let savedNotePath: string | undefined

    if (shouldSaveNote) {
      try {
        const notesDir = path.join(activeDir, 'notes')
        if (!fs.existsSync(notesDir)) {
          fs.mkdirSync(notesDir, { recursive: true })
        }
        savedNotePath = path.join(notesDir, `${ecosystem.name}-architecture.md`)
        fs.writeFileSync(savedNotePath, fullContent, 'utf-8')
        ctx.notify(`📝 Saved architecture guide to: ${savedNotePath}`)
        ctx.refreshExplorer?.()
      } catch (err) {
        console.warn('[fetch_official_docs] Failed to save note:', err)
      }
    }

    return {
      success: true,
      action: 'fetch_official_docs',
      message: `Resolved official documentation for "${ecosystem.name}" (v${ecosystem.version}): ${
        ecosystem.officialDocsUrl || 'Docs URL verified'
      } with ${ecosystem.satellitePackages.length} satellite package(s)${
        resolvedPromptMeta ? ` using prompt "${resolvedPromptMeta.name}"` : ''
      }.`,
      details: {
        ecosystem,
        docs: docsResult,
        prompt: resolvedPromptMeta,
        format: resolvedPromptMeta,
        savedNotePath,
        content: fullContent,
      },
    }
  },
}
