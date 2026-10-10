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
    'Searches across all extracted RFP documents in a folder (`_extracted/*.txt`). Normalizes whitespace across lines, tracks exact page/line numbers, and returns high-signal context hits.',
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
    caseSensitive: {
      type: 'boolean',
      required: false,
      description: 'Whether search should be case-sensitive (default: false).',
      default: false,
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
    query: 'Cyber Liability',
    caseSensitive: false,
    contextLines: 2,
    maxHits: 20,
  },
  async execute(ctx: ActionContext, payload: any, targetPane = 'book'): Promise<ActionResult> {
    const params = payload.params || {}
    const folderRaw = params.folder ?? payload.folder ?? params.path ?? payload.path
    const query = (params.query ?? payload.query ?? '').trim()
    const caseSensitive = Boolean(params.caseSensitive ?? payload.caseSensitive ?? false)
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

    // Read manifest.json to only search valid extracted RFP files
    const manifestPath = path.join(extractedDir, 'manifest.json')
    let allowedFileNames: Set<string> | null = null

    if (fs.existsSync(manifestPath)) {
      try {
        const manifestRaw = await fs.promises.readFile(manifestPath, 'utf8')
        const manifest = JSON.parse(manifestRaw)
        if (Array.isArray(manifest.files)) {
          allowedFileNames = new Set(
            manifest.files.map((f: any) => path.basename(f.extractedTextFile || f.name))
          )
        }
      } catch (_) {}
    }

    const files = await fs.promises.readdir(extractedDir)
    const txtFiles = files.filter((f) => {
      if (!f.endsWith('.txt') || f === 'manifest.json') return false
      if (allowedFileNames && !allowedFileNames.has(f)) return false
      return true
    })

    // Build search regex pattern with whitespace normalization
    let searchPattern: RegExp
    if (isRegex) {
      searchPattern = new RegExp(query, caseSensitive ? 'g' : 'gi')
    } else {
      // Normalize whitespace runs in query to single spaces
      const normalizedQuery = query.replace(/\s+/g, ' ').trim()
      const escapedWords = normalizedQuery.split(' ').map((w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      // \s+ matches spaces, tabs, and newlines across line breaks
      const patternStr = escapedWords.join('\\s+')
      searchPattern = new RegExp(patternStr, caseSensitive ? 'g' : 'gi')
    }

    const hits: SearchHit[] = []

    for (const txtFile of txtFiles) {
      if (hits.length >= maxHits) break

      const fullPath = path.join(extractedDir, txtFile)
      const rawContent = await fs.promises.readFile(fullPath, 'utf8')
      const lines = rawContent.split(/\r?\n/)

      // Track 1-based page and line offsets exactly against rawContent
      const lineOffsets: number[] = [0]
      const linePageMap: number[] = []
      let currentPage = 1

      let curIdx = 0
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const pageMarkerMatch = line.match(/^--\s*page\s+(\d+)\s*--/i)
        if (pageMarkerMatch) {
          currentPage = parseInt(pageMarkerMatch[1], 10)
        }
        linePageMap.push(currentPage)

        curIdx += line.length
        if (curIdx < rawContent.length && rawContent[curIdx] === '\r') {
          curIdx++
        }
        if (curIdx < rawContent.length && rawContent[curIdx] === '\n') {
          curIdx++
        }
        if (i < lines.length - 1) {
          lineOffsets.push(curIdx)
        }
      }

      // Helper to map char index to line index (0-based)
      const findLineIndex = (charIndex: number): number => {
        let low = 0
        let high = lineOffsets.length - 1
        let result = 0
        while (low <= high) {
          const mid = (low + high) >> 1
          if (lineOffsets[mid] <= charIndex) {
            result = mid
            low = mid + 1
          } else {
            high = mid - 1
          }
        }
        return result
      }

      // Execute search across full document text
      let match: RegExpExecArray | null = null
      searchPattern.lastIndex = 0

      while ((match = searchPattern.exec(rawContent)) !== null) {
        if (hits.length >= maxHits) break

        const matchStartChar = match.index
        const matchEndChar = matchStartChar + match[0].length
        const startLineIdx = findLineIndex(matchStartChar)
        const endLineIdx = findLineIndex(Math.max(matchStartChar, matchEndChar - 1))

        const matchPage = linePageMap[startLineIdx] || 1
        const matchLineNum = startLineIdx + 1

        // Skip hit if the match is strictly within a page marker comment
        if (lines[startLineIdx] && /^--\s*page\s+\d+\s*--/i.test(lines[startLineIdx].trim())) {
          if (searchPattern.lastIndex === match.index) searchPattern.lastIndex++
          continue
        }

        // Build context snippet
        const contextStart = Math.max(0, startLineIdx - contextLines)
        const contextEnd = Math.min(lines.length - 1, endLineIdx + contextLines)
        const contextSnippetLines: string[] = []

        for (let c = contextStart; c <= contextEnd; c++) {
          const isMatchLine = c >= startLineIdx && c <= endLineIdx
          const prefix = isMatchLine ? '>> ' : '   '
          contextSnippetLines.push(`${prefix}${lines[c]}`)
        }

        const originalDocName = txtFile.endsWith('.txt') ? txtFile.slice(0, -4) : txtFile
        const snippetText = lines
          .slice(startLineIdx, endLineIdx + 1)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()

        hits.push({
          fileName: originalDocName,
          page: matchPage,
          lineNumber: matchLineNum,
          matchText: snippetText,
          context: contextSnippetLines.join('\n'),
        })

        if (searchPattern.lastIndex === match.index) {
          searchPattern.lastIndex++
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
          totalMatches: 0,
          searchedFilesCount: txtFiles.length,
          hits: [],
          matches: [],
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
