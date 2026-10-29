import fs from 'node:fs'
import path from 'node:path'

export interface PromptMetadata {
  id: string
  category: string
  name: string
  description?: string
  whenToUse: string
  targetActions?: string[]
  filePath: string
  relativePath: string
}

export interface PromptDefinition extends PromptMetadata {
  content: string
  rawContent: string
}

export class PromptRegistryService {
  private static instance: PromptRegistryService | null = null

  public static getInstance(): PromptRegistryService {
    if (!PromptRegistryService.instance) {
      PromptRegistryService.instance = new PromptRegistryService()
    }
    return PromptRegistryService.instance
  }

  /**
   * Resolves candidate root directories for modular prompts in priority order:
   * 1. <workspace>/.workbench/prompts
   * 2. <workspace>/prompts
   * 3. <cwd>/.workbench/prompts
   * 4. <cwd>/prompts
   * 5. Relative to module directory (__dirname/../../prompts)
   */
  public getCandidateRootDirs(workspaceDir?: string): string[] {
    const dirs: string[] = []

    if (workspaceDir) {
      dirs.push(path.join(workspaceDir, '.workbench', 'prompts'))
      dirs.push(path.join(workspaceDir, 'prompts'))
    }

    const cwd = process.cwd()
    dirs.push(path.join(cwd, '.workbench', 'prompts'))
    dirs.push(path.join(cwd, 'prompts'))

    try {
      const fallbackDir = path.resolve(__dirname, '..', '..', 'prompts')
      dirs.push(fallbackDir)
    } catch {
      // Ignore if __dirname is not available in ESM context
    }

    return Array.from(new Set(dirs.map((d) => path.normalize(d)))).filter((d) => {
      try {
        return fs.existsSync(d) && fs.statSync(d).isDirectory()
      } catch {
        return false
      }
    })
  }

  /**
   * Recursively collects all .md files inside a root prompts directory,
   * skipping README.md.
   */
  private walkPromptFiles(rootDir: string, currentDir: string = rootDir): string[] {
    const results: string[] = []
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name)
        if (entry.isDirectory()) {
          results.push(...this.walkPromptFiles(rootDir, fullPath))
        } else if (
          entry.isFile() &&
          entry.name.toLowerCase().endsWith('.md') &&
          entry.name.toLowerCase() !== 'readme.md'
        ) {
          results.push(fullPath)
        }
      }
    } catch (err) {
      console.warn(`[PromptRegistryService] Failed to scan prompt directory ${currentDir}:`, err)
    }
    return results
  }

  /**
   * Parses YAML frontmatter (if present) and extracts the full prompt content verbatim.
   */
  private parsePromptFile(filePath: string, rootDir: string): PromptDefinition | null {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8')
      const frontmatterMatch = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n([\s\S]*)$/)

      const relFromRoot = path.relative(rootDir, filePath).replace(/\\/g, '/')
      const relParts = relFromRoot.split('/')
      const inferredCategory = relParts.length > 1 ? relParts[0] : 'general'

      let id = path
        .basename(filePath)
        .replace(/(\.prompt|\.format)?\.md$/i, '')
        .trim()
      let category = inferredCategory
      let name = id
      let description: string | undefined
      let whenToUse = ''
      const targetActions: string[] = []
      let content = raw

      if (frontmatterMatch) {
        const yamlBlock = frontmatterMatch[1]
        content = frontmatterMatch[2].trim()

        const idMatch = yamlBlock.match(/^id:\s*['"]?([^\r\n'"]+)['"]?/m)
        if (idMatch) id = idMatch[1].trim()

        const catMatch = yamlBlock.match(/^category:\s*['"]?([^\r\n'"]+)['"]?/m)
        if (catMatch) category = catMatch[1].trim()

        const nameMatch = yamlBlock.match(/^name:\s*['"]?([^\r\n'"]+)['"]?/m)
        if (nameMatch) name = nameMatch[1].trim()

        const descMatch = yamlBlock.match(/^description:\s*['"]?([^\r\n'"]+)['"]?/m)
        if (descMatch) description = descMatch[1].trim()

        const whenMatch =
          yamlBlock.match(/^whenToUse:\s*['"]?([^\r\n'"]+)['"]?/m) ||
          yamlBlock.match(/^trigger:\s*['"]?([^\r\n'"]+)['"]?/m)
        if (whenMatch) whenToUse = whenMatch[1].trim()

        const actionsMatch = yamlBlock.match(/targetActions:\s*\r?\n((?:\s*-\s*.+\r?\n?)+)/m)
        if (actionsMatch) {
          const actionLines = actionsMatch[1].split('\n')
          for (const line of actionLines) {
            const clean = line.replace(/^\s*-\s*/, '').trim()
            if (clean) targetActions.push(clean)
          }
        }
      }

      if (!whenToUse) {
        whenToUse =
          description ||
          `Load this prompt ONLY when the user asks for "${name}" (${category}).`
      }

      const relativePath = `prompts/${relFromRoot}`

      return {
        id,
        category,
        name,
        description,
        whenToUse,
        targetActions,
        filePath,
        relativePath,
        content,
        rawContent: raw,
      }
    } catch (err) {
      console.warn(`[PromptRegistryService] Error reading prompt file ${filePath}:`, err)
      return null
    }
  }

  /**
   * Lists all discovered modular prompts across candidate root directories.
   */
  public listPrompts(workspaceDir?: string): PromptMetadata[] {
    const roots = this.getCandidateRootDirs(workspaceDir)
    const seenIds = new Set<string>()
    const results: PromptMetadata[] = []

    for (const rootDir of roots) {
      const files = this.walkPromptFiles(rootDir)
      for (const filePath of files) {
        const parsed = this.parsePromptFile(filePath, rootDir)
        if (parsed && !seenIds.has(parsed.id.toLowerCase())) {
          seenIds.add(parsed.id.toLowerCase())
          results.push({
            id: parsed.id,
            category: parsed.category,
            name: parsed.name,
            description: parsed.description,
            whenToUse: parsed.whenToUse,
            targetActions: parsed.targetActions,
            filePath: parsed.filePath,
            relativePath: parsed.relativePath,
          })
        }
      }
    }

    return results
  }

  /**
   * Resolves a prompt by ID (e.g. "package-analysis"), relative path
   * (e.g. "prompts/analysis/package-analysis.md" or "analysis/package-analysis.md"),
   * or filename ("package-analysis.md").
   */
  public getPrompt(idOrPath: string = 'package-analysis', workspaceDir?: string): PromptDefinition | null {
    const query = (idOrPath || 'package-analysis').trim()
    const normalizedQuery = query.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase()
    const strippedPromptsPrefix = normalizedQuery.replace(/^prompts\//i, '')
    const baseWithoutExt = path.basename(normalizedQuery).replace(/(\.prompt|\.format)?\.md$/i, '')

    const roots = this.getCandidateRootDirs(workspaceDir)
    for (const rootDir of roots) {
      const files = this.walkPromptFiles(rootDir)
      for (const filePath of files) {
        const parsed = this.parsePromptFile(filePath, rootDir)
        if (!parsed) continue

        const parsedId = parsed.id.toLowerCase()
        const parsedRel = parsed.relativePath.toLowerCase()
        const parsedRelNoPrefix = parsedRel.replace(/^prompts\//i, '')
        const parsedFilename = path.basename(parsed.filePath).toLowerCase()

        if (
          parsedId === normalizedQuery ||
          parsedId === baseWithoutExt ||
          parsedRel === normalizedQuery ||
          parsedRelNoPrefix === strippedPromptsPrefix ||
          parsedFilename === normalizedQuery ||
          // Compatibility alias: map legacy 'package-architecture' requests to 'package-analysis'
          (normalizedQuery === 'package-architecture' && parsedId === 'package-analysis')
        ) {
          return parsed
        }
      }
    }

    return null
  }

  /**
   * Renders the full prompt content, substituting variables like [PACKAGE NAME]
   * or generic [KEY] / {{key}} placeholders when provided, without removing any prompt text.
   */
  public renderPrompt(
    idOrPath: string = 'package-analysis',
    variables?: Record<string, string | undefined>,
    workspaceDir?: string
  ): string | null {
    const prompt = this.getPrompt(idOrPath, workspaceDir)
    if (!prompt) return null

    let rendered = prompt.content

    if (variables) {
      const pkgName = (variables.packageName || variables.package || '').trim()
      if (pkgName) {
        rendered = rendered.replace(/\[PACKAGE NAME\]/g, pkgName)
      }

      for (const [key, val] of Object.entries(variables)) {
        if (val === undefined || val === null || !String(val).trim()) continue
        const cleanVal = String(val).trim()
        const upperKey = key.replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase()
        rendered = rendered.split(`[${upperKey}]`).join(cleanVal)
        rendered = rendered.split(`[${key}]`).join(cleanVal)
        rendered = rendered.split(`{{${key}}}`).join(cleanVal)
      }
    }

    return rendered
  }

  /**
   * Renders the prompt wrapped in a clear execution directive header for action feedback.
   */
  public renderGuidance(
    idOrPath: string = 'package-analysis',
    workspaceDir?: string,
    variables?: Record<string, string | undefined>
  ): string | null {
    const prompt = this.getPrompt(idOrPath, workspaceDir)
    if (!prompt) return null

    const renderedBody = this.renderPrompt(idOrPath, variables, workspaceDir) || prompt.content

    return [
      `---`,
      `### Loaded Modular Prompt: ${prompt.name} (\`${prompt.relativePath}\`)`,
      `Follow all instructions, research accuracy rules, explanation structure, coverage framework, and quality checks below:`,
      ``,
      renderedBody,
      `---`,
    ].join('\n')
  }
}

