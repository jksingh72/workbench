import { ActionDefinition, ActionContext, ActionResult } from './types'
import { OfficialDocsResolver } from '../services/officialDocsResolver'

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
    'Fetches verified official documentation, architecture guides, and satellite package maps for any Python package/ecosystem directly from official sources (PyPI metadata and project documentation sites). No local installation required.',
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
  },
  example: {
    action: 'fetch_official_docs',
    package: 'langchain',
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

      if (ecosystem.corePackages.length > 0) {
        mdLines.push(`\n### Core / Foundation Packages (Where primary runtime abstractions live):`)
        for (const cp of ecosystem.corePackages) {
          const sat = ecosystem.satellitePackages.find((s) => s.name === cp)
          mdLines.push(`- \`${cp}\`${sat?.constraint ? ` (${sat.constraint})` : ''} — Foundation abstractions`)
        }
      }

      if (ecosystem.integrationPackages.length > 0) {
        mdLines.push(`\n### Official Provider Integrations:`)
        for (const ip of ecosystem.integrationPackages.slice(0, 15)) {
          const sat = ecosystem.satellitePackages.find((s) => s.name === ip)
          mdLines.push(`- \`${ip}\`${sat?.constraint ? ` (${sat.constraint})` : ''}`)
        }
        if (ecosystem.integrationPackages.length > 15) {
          mdLines.push(`- ... (+${ecosystem.integrationPackages.length - 15} more provider integrations)`)
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

    const fullContent = mdLines.join('\n')

    return {
      success: true,
      action: 'fetch_official_docs',
      message: `Resolved official documentation for "${ecosystem.name}" (v${ecosystem.version}): ${
        ecosystem.officialDocsUrl || 'Docs URL verified'
      } with ${ecosystem.satellitePackages.length} satellite package(s).`,
      details: {
        ecosystem,
        docs: docsResult,
        content: fullContent,
      },
    }
  },
}
