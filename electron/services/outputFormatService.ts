import fs from 'node:fs'
import path from 'node:path'

export interface OutputFormatMetadata {
  id: string
  name: string
  description?: string
  targetActions?: string[]
  filePath: string
}

export interface OutputFormatTemplate extends OutputFormatMetadata {
  content: string
  rawTemplate: string
}

export class OutputFormatService {
  private static instance: OutputFormatService | null = null

  public static getInstance(): OutputFormatService {
    if (!OutputFormatService.instance) {
      OutputFormatService.instance = new OutputFormatService()
    }
    return OutputFormatService.instance
  }

  /**
   * Resolves search directories in priority order:
   * 1. <workspace>/.workbench/formats
   * 2. <workspace>/templates/formats
   * 3. <cwd>/.workbench/formats
   * 4. <cwd>/templates/formats
   * 5. Relative to module directory (__dirname/../../templates/formats)
   */
  private getCandidateDirs(workspaceDir?: string): string[] {
    const dirs: string[] = []

    if (workspaceDir) {
      dirs.push(path.join(workspaceDir, '.workbench', 'formats'))
      dirs.push(path.join(workspaceDir, 'templates', 'formats'))
    }

    const cwd = process.cwd()
    dirs.push(path.join(cwd, '.workbench', 'formats'))
    dirs.push(path.join(cwd, 'templates', 'formats'))

    try {
      const fallbackDir = path.resolve(__dirname, '..', '..', 'templates', 'formats')
      dirs.push(fallbackDir)
    } catch {
      // Ignore if __dirname is not available
    }

    // Return unique directories that exist
    return Array.from(new Set(dirs)).filter((d) => fs.existsSync(d))
  }

  /**
   * Parses simple YAML frontmatter (between triple dashes `---`) and the markdown body.
   */
  private parseFormatFile(filePath: string): OutputFormatTemplate | null {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8')
      const frontmatterMatch = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n([\s\S]*)$/)

      let id = path.basename(filePath).replace(/(\.format)?\.md$/i, '')
      let name = id
      let description: string | undefined
      const targetActions: string[] = []
      let content = raw

      if (frontmatterMatch) {
        const yamlBlock = frontmatterMatch[1]
        content = frontmatterMatch[2].trim()

        const idMatch = yamlBlock.match(/^id:\s*['"]?([^\r\n'"]+)['"]?/m)
        if (idMatch) id = idMatch[1].trim()

        const nameMatch = yamlBlock.match(/^name:\s*['"]?([^\r\n'"]+)['"]?/m)
        if (nameMatch) name = nameMatch[1].trim()

        const descMatch = yamlBlock.match(/^description:\s*['"]?([^\r\n'"]+)['"]?/m)
        if (descMatch) description = descMatch[1].trim()

        const actionsMatch = yamlBlock.match(/targetActions:\s*\r?\n((?:\s*-\s*.+\r?\n?)+)/m)
        if (actionsMatch) {
          const actionLines = actionsMatch[1].split('\n')
          for (const line of actionLines) {
            const clean = line.replace(/^\s*-\s*/, '').trim()
            if (clean) targetActions.push(clean)
          }
        }
      }

      return {
        id,
        name,
        description,
        targetActions,
        filePath,
        content,
        rawTemplate: raw,
      }
    } catch (err) {
      console.warn(`[OutputFormatService] Error reading format file ${filePath}:`, err)
      return null
    }
  }

  /**
   * Retrieves a format template by ID. Searches:
   * - <id>.format.md
   * - <id>.md
   * - <id>
   */
  public getFormat(formatId: string = 'package-architecture', workspaceDir?: string): OutputFormatTemplate | null {
    const cleanId = formatId.trim().toLowerCase()
    const dirs = this.getCandidateDirs(workspaceDir)

    const candidateFilenames = [
      `${cleanId}.format.md`,
      `${cleanId}.md`,
      `${cleanId}`,
    ]

    for (const dir of dirs) {
      for (const fname of candidateFilenames) {
        const fullPath = path.join(dir, fname)
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
          const parsed = this.parseFormatFile(fullPath)
          if (parsed) return parsed
        }
      }
    }

    return null
  }

  /**
   * Lists all discovered format templates across candidate directories.
   */
  public listFormats(workspaceDir?: string): OutputFormatMetadata[] {
    const dirs = this.getCandidateDirs(workspaceDir)
    const seenIds = new Set<string>()
    const results: OutputFormatMetadata[] = []

    for (const dir of dirs) {
      try {
        const files = fs.readdirSync(dir)
        for (const file of files) {
          if (!file.endsWith('.md')) continue
          const fullPath = path.join(dir, file)
          const parsed = this.parseFormatFile(fullPath)
          if (parsed && !seenIds.has(parsed.id)) {
            seenIds.add(parsed.id)
            results.push({
              id: parsed.id,
              name: parsed.name,
              description: parsed.description,
              targetActions: parsed.targetActions,
              filePath: parsed.filePath,
            })
          }
        }
      } catch (err) {
        console.warn(`[OutputFormatService] Error scanning directory ${dir}:`, err)
      }
    }

    return results
  }

  /**
   * Renders the format template as an actionable instruction prompt block
   * that can be injected into the LLM synthesis payload.
   */
  public renderGuidance(formatId: string = 'package-architecture', workspaceDir?: string): string | null {
    const template = this.getFormat(formatId, workspaceDir)
    if (!template) return null

    return [
      `---`,
      `### Required Synthesis Format Specification (${template.name})`,
      `Template source: ${template.filePath}`,
      `You MUST synthesize your response adhering strictly to the following structure and sections:`,
      ``,
      template.content,
      `---`,
    ].join('\n')
  }
}
