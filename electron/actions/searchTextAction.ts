import fs from 'node:fs'
import path from 'node:path'
import { ActionDefinition, ActionContext, ActionResult } from './types'

export interface SearchHit {
  fileName: string
  page: number
  lineNumber: number
  matchText: string
  context: string
}

export const searchTextAction: ActionDefinition = {
  id: 'search_text',
  aliases: ['grep_rfp', 'find_in_rfp', 'search_rfp', 'query_extracted_text'],
  description:
    'Searches across all extracted RFP documents in a folder (`_extracted/*.txt`). Returns precise matching hits with source file name, page number, line number, and surrounding context lines.',
  parameters: {
    folder: {
      type: 'string',
      required: true,
      description: 'The target folder containing the `_extracted/` directory (relative to active directory or absolute).',
    },
    query: {
      type: 'string',
      required: true,
      description: 'Search string or regular expression to search for.',
    },
    regex: {
      type: 'boolean',
      required: false,
      description: 'Whether to treat the query as a regular expression (default: false).',
      default: false,
    },
    contextLines: {
      type: 'number',
      required: false,
      description: 'Number of surrounding context lines to include before and after each match (default: 2).',
      default: 2,
    },
    maxHits: {
      type: 'number',
      required: false,
      description: 'Maximum number of match hits to return (default: 50).',
      default: 50,
    },
  },
  example: {
    action: 'search_text',
    folder: 'RFP-2',
    query: 'Reliability Status',
    contextLines: 2,
    maxHits: 20,
  },
  async execute(ctx: ActionContext, payload: any, targetPane = 'book'): Promise<ActionResult> {
    const params = payload.params || {}
    const folderRaw = params.folder ?? payload.folder ?? params.path ?? payload.path
    const query = (params.query ?? payload.query ?? '').trim()
    const isRegex = Boolean(params.regex ?? payload.regex ?? false)
    const contextLines = Number(params.contextLines ?? payload.contextLines ?? 2)
    const maxHits = Number(params.maxHits ?? payload.maxHits ?? 50)

    if (!folderRaw) {
      throw new Error('Missing required parameter "folder"')
    }
    if (!query) {
      throw new Error('Missing required parameter "query"')
    }

    const resolvedFolder = ctx.resolveSafePath(folderRaw, targetPane)
    const extractedDir = path.join(resolvedFolder, '_extracted')

    if (!fs.existsSync(extractedDir)) {
      throw new Error(
        `Extracted directory not found at "${extractedDir}". Please run "extract_rfp" on this folder first.`
      )
    }

    let searchPattern: RegExp
    if (isRegex) {
      searchPattern = new RegExp(query, 'i')
    } else {
      // Escape regex special chars for literal search
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      searchPattern = new RegExp(escaped, 'i')
    }

    const files = await fs.promises.readdir(extractedDir)
    const txtFiles = files.filter((f) => f.endsWith('.txt') && f !== 'manifest.json')
    const hits: SearchHit[] = []

    for (const txtFile of txtFiles) {
      if (hits.length >= maxHits) break

      const fullPath = path.join(extractedDir, txtFile)
      const content = await fs.promises.readFile(fullPath, 'utf8')
      const lines = content.split('\n')

      let currentPage = 1
      // Derive original file name (strip trailing .txt)
      const originalDocName = txtFile.endsWith('.txt') ? txtFile.slice(0, -4) : txtFile

      for (let i = 0; i < lines.length; i++) {
        if (hits.length >= maxHits) break

        const line = lines[i]
        const pageMarkerMatch = line.match(/^--\s*page\s+(\d+)\s*--/i)
        if (pageMarkerMatch) {
          currentPage = parseInt(pageMarkerMatch[1], 10)
          continue
        }

        if (searchPattern.test(line)) {
          const start = Math.max(0, i - contextLines)
          const end = Math.min(lines.length - 1, i + contextLines)
          const contextSnippetLines: string[] = []

          for (let c = start; c <= end; c++) {
            const prefix = c === i ? '>> ' : '   '
            contextSnippetLines.push(`${prefix}${lines[c]}`)
          }

          hits.push({
            fileName: originalDocName,
            page: currentPage,
            lineNumber: i + 1,
            matchText: line.trim(),
            context: contextSnippetLines.join('\n'),
          })
        }
      }
    }

    if (hits.length === 0) {
      return {
        success: true,
        action: 'search_text',
        message: `No matches found for "${query}" across ${txtFiles.length} extracted document(s) in "${path.basename(resolvedFolder)}".`,
        details: {
          query,
          hitsCount: 0,
          searchedFilesCount: txtFiles.length,
        },
      }
    }

    // Format results in a crisp, high-signal markdown block
    const formattedBlocks = hits.map((hit, idx) => {
      return `### Match ${idx + 1}: ${hit.fileName} (Page ${hit.page}, Line ${hit.lineNumber})\n\`\`\`text\n${hit.context}\n\`\`\``
    })

    const summaryMessage = `Found ${hits.length} hit(s) for "${query}" across ${txtFiles.length} document(s):\n\n${formattedBlocks.join('\n\n')}`

    return {
      success: true,
      action: 'search_text',
      message: summaryMessage,
      details: {
        query,
        hitsCount: hits.length,
        totalMatches: hits.length,
        searchedFilesCount: txtFiles.length,
        hits,
        matches: hits.map((h) => ({
          file: h.fileName,
          page: h.page,
          line: h.lineNumber,
          text: h.matchText,
          match: h.matchText,
          context: h.context,
        })),
      },
    }
  },
}
