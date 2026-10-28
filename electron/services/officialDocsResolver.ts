import https from 'node:https'
import http from 'node:http'

export interface SatellitePackage {
  name: string
  cleanName: string
  constraint: string
  category: 'core' | 'integration' | 'ecosystem' | 'general'
}

export interface EcosystemInfo {
  name: string
  cleanName: string
  version: string
  summary: string
  author: string
  license: string
  officialDocsUrl: string | null
  homepageUrl: string | null
  sourceUrl: string | null
  satellitePackages: SatellitePackage[]
  corePackages: string[]
  integrationPackages: string[]
  importableModule: string
}

export interface DocsFetchResult {
  url: string
  title: string
  markdownContent: string
  success: boolean
  error?: string
}

export class OfficialDocsResolver {
  private static instance: OfficialDocsResolver | null = null
  private cache: Map<string, EcosystemInfo> = new Map()

  public static getInstance(): OfficialDocsResolver {
    if (!OfficialDocsResolver.instance) {
      OfficialDocsResolver.instance = new OfficialDocsResolver()
    }
    return OfficialDocsResolver.instance
  }

  /**
   * Resolves official ecosystem metadata directly from PyPI official registry JSON.
   */
  public async resolveEcosystem(packageName: string): Promise<EcosystemInfo | null> {
    const clean = packageName.trim().toLowerCase()
    if (!clean) return null

    if (this.cache.has(clean)) {
      return this.cache.get(clean)!
    }

    try {
      const pypiData = await this.fetchJson(`https://pypi.org/pypi/${encodeURIComponent(clean)}/json`)
      if (!pypiData || !pypiData.info) {
        return null
      }

      const info = pypiData.info
      const projectUrls = info.project_urls || {}

      // Discover Official Documentation URL with prioritization
      let officialDocsUrl: string | null = null
      const docCandidates = [
        projectUrls.Documentation,
        projectUrls.Docs,
        projectUrls.documentation,
        projectUrls['Official Documentation'],
        projectUrls['Documentation & Tutorials'],
        info.docs_url,
      ].filter(Boolean)

      if (docCandidates.length > 0) {
        officialDocsUrl = docCandidates[0]
      }

      // Discover Homepage URL
      let homepageUrl: string | null = null
      const homeCandidates = [
        projectUrls.Homepage,
        projectUrls.homepage,
        info.home_page,
      ].filter(Boolean)

      if (homeCandidates.length > 0) {
        homepageUrl = homeCandidates[0]
      }

      // Discover Source / Repository URL
      let sourceUrl: string | null = null
      const sourceCandidates = [
        projectUrls.Source,
        projectUrls.Repository,
        projectUrls['Source Code'],
        projectUrls.GitHub,
        projectUrls.Github,
      ].filter(Boolean)

      if (sourceCandidates.length > 0) {
        sourceUrl = sourceCandidates[0]
      }

      // If official docs not found in project_urls, test homepage if it looks like a docs site
      if (!officialDocsUrl && homepageUrl) {
        const lowerHome = homepageUrl.toLowerCase()
        if (
          lowerHome.includes('docs.') ||
          lowerHome.includes('/docs') ||
          lowerHome.includes('readthedocs') ||
          lowerHome.includes('gitbook.io')
        ) {
          officialDocsUrl = homepageUrl
        }
      }

      // Satellite Package Extraction from requires_dist
      const requiresDist: string[] = Array.isArray(info.requires_dist) ? info.requires_dist : []
      const prefix = clean.replace(/-core$|-community$|-base$/, '')
      const satellitePackages: SatellitePackage[] = []
      const corePackages: string[] = []
      const integrationPackages: string[] = []

      for (const req of requiresDist) {
        // e.g. "langchain-core<2.0.0,>=1.6.13; extra == 'standard'"
        const specPart = req.split(';')[0].trim()
        if (!specPart) continue

        const match = specPart.match(/^([a-zA-Z0-9_\-\.]+)(.*)$/)
        if (!match) continue

        const depName = match[1].trim()
        const constraint = match[2].trim()
        const lowerDep = depName.toLowerCase()

        let category: 'core' | 'integration' | 'ecosystem' | 'general' = 'general'
        if (
          lowerDep === `${prefix}-core` ||
          lowerDep === `${prefix}-base` ||
          lowerDep === `${prefix}_core` ||
          lowerDep === 'langgraph'
        ) {
          category = 'core'
          corePackages.push(depName)
        } else if (
          lowerDep.startsWith(`${prefix}-`) ||
          lowerDep.startsWith(`${prefix}_`)
        ) {
          if (
            lowerDep.includes('anthropic') ||
            lowerDep.includes('openai') ||
            lowerDep.includes('aws') ||
            lowerDep.includes('azure') ||
            lowerDep.includes('google') ||
            lowerDep.includes('community')
          ) {
            category = 'integration'
            integrationPackages.push(depName)
          } else {
            category = 'ecosystem'
          }
        }

        if (category !== 'general') {
          satellitePackages.push({
            name: depName,
            cleanName: depName.replace(/_/g, '-'),
            constraint,
            category,
          })
        }
      }

      const importableModule = clean.replace(/-/g, '_')

      const ecosystem: EcosystemInfo = {
        name: info.name || clean,
        cleanName: clean,
        version: info.version || 'unknown',
        summary: info.summary || '',
        author: info.author || info.author_email || '',
        license: info.license || '',
        officialDocsUrl,
        homepageUrl,
        sourceUrl,
        satellitePackages,
        corePackages,
        integrationPackages,
        importableModule,
      }

      this.cache.set(clean, ecosystem)
      return ecosystem
    } catch (err) {
      console.warn(`[OfficialDocsResolver] Failed to resolve PyPI metadata for "${clean}":`, err)
      return null
    }
  }

  /**
   * Fetches the official documentation page and converts it into dense, clean Markdown.
   */
  public async fetchOfficialDocsMarkdown(url: string): Promise<DocsFetchResult> {
    try {
      const html = await this.fetchText(url)
      const markdownContent = this.htmlToCleanMarkdown(html, url)
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
      const title = titleMatch ? titleMatch[1].trim() : 'Official Documentation'

      return {
        url,
        title,
        markdownContent,
        success: true,
      }
    } catch (err: any) {
      return {
        url,
        title: 'Error Fetching Documentation',
        markdownContent: '',
        success: false,
        error: err.message || 'Failed to fetch documentation',
      }
    }
  }

  /**
   * Converts raw HTML documentation into structured Markdown, stripping scripts, styles, and navs.
   */
  private htmlToCleanMarkdown(html: string, sourceUrl: string): string {
    let clean = html
    // Remove scripts, styles, and SVG
    clean = clean.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    clean = clean.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    clean = clean.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')

    // Remove nav and header/footer boilerplates if large
    clean = clean.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
    clean = clean.replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')

    // Extract main or article if available
    const mainMatch = clean.match(/<main[^>]*>([\s\S]*?)<\/main>/i) || clean.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
    if (mainMatch && mainMatch[1].length > 300) {
      clean = mainMatch[1]
    }

    // Convert Headings
    clean = clean.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
    clean = clean.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
    clean = clean.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')
    clean = clean.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n')

    // Convert Code blocks
    clean = clean.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n```python\n$1\n```\n')
    clean = clean.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')

    // Convert Lists
    clean = clean.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n')

    // Convert Paragraphs & Linebreaks
    clean = clean.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n')
    clean = clean.replace(/<br\s*[\/]?>/gi, '\n')

    // Strip remaining HTML tags
    clean = clean.replace(/<[^>]+>/g, '')

    // Decode HTML entities
    clean = clean.replace(/&amp;/g, '&')
    clean = clean.replace(/&lt;/g, '<')
    clean = clean.replace(/&gt;/g, '>')
    clean = clean.replace(/&quot;/g, '"')
    clean = clean.replace(/&#39;/g, "'")
    clean = clean.replace(/&nbsp;/g, ' ')

    // Collapse multiple blank lines
    clean = clean.replace(/\n\s*\n\s*\n+/g, '\n\n').trim()

    // Cap output length to 15,000 characters for optimal LLM context size
    const MAX_LEN = 15000
    if (clean.length > MAX_LEN) {
      clean = clean.slice(0, MAX_LEN) + `\n\n... [Official Documentation continues at: ${sourceUrl}]`
    }

    return clean
  }

  /**
   * Low-level JSON fetch with 8s timeout and redirect handling.
   */
  private fetchJson(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http
      const req = client.get(url, { headers: { 'User-Agent': 'Workbench-Package-Docs-Agent/1.0' }, timeout: 8000 }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return this.fetchJson(res.headers.location).then(resolve).catch(reject)
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`PyPI HTTP status: ${res.statusCode}`))
        }
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          try {
            resolve(JSON.parse(data))
          } catch (e) {
            reject(e)
          }
        })
      })
      req.on('timeout', () => {
        req.destroy()
        reject(new Error('PyPI request timed out'))
      })
      req.on('error', reject)
    })
  }

  /**
   * Low-level text/html fetch with 10s timeout and redirect handling.
   */
  private fetchText(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http
      const req = client.get(
        url,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
          timeout: 10000,
        },
        (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            const redirectUrl = res.headers.location.startsWith('http')
              ? res.headers.location
              : new URL(res.headers.location, url).href
            return this.fetchText(redirectUrl).then(resolve).catch(reject)
          }
          if (res.statusCode && res.statusCode >= 400) {
            return reject(new Error(`Docs site returned HTTP ${res.statusCode}`))
          }
          let data = ''
          res.on('data', (chunk) => (data += chunk))
          res.on('end', () => resolve(data))
        }
      )
      req.on('timeout', () => {
        req.destroy()
        reject(new Error('Documentation site request timed out'))
      })
      req.on('error', reject)
    })
  }
}
