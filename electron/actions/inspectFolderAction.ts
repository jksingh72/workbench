import fs from 'node:fs'
import path from 'node:path'
import { ActionDefinition, ActionContext, ActionResult } from './types'

const BOOK_EXTENSIONS = new Set([
  '.pdf',
  '.epub',
  '.mobi',
  '.azw',
  '.azw3',
  '.djvu',
  '.docx',
  '.doc',
  '.txt',
  '.md',
  '.markdown',
  '.rtf',
  '.cbr',
  '.cbz',
])

interface CatalogItem {
  index: number
  fileName: string
  title: string
  author: string
  format: string
  sizeBytes: number
  sizeFormatted: string
  modified: string
  relativePath: string
  excerpt?: string
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`
  }
  return `${bytes} B`
}

function parseTitleAndAuthor(fileName: string): { title: string; author: string } {
  const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '')
  const cleaned = nameWithoutExt.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim()

  if (cleaned.includes(' - ')) {
    const parts = cleaned.split(' - ').map((p) => p.trim()).filter(Boolean)
    if (parts.length >= 2) {
      return {
        author: parts[0],
        title: parts.slice(1).join(' - '),
      }
    }
  }

  const byMatch = cleaned.match(/^(.*?)\s+by\s+(.*)$/i)
  if (byMatch) {
    return {
      title: byMatch[1].trim(),
      author: byMatch[2].trim(),
    }
  }

  return {
    title: cleaned,
    author: 'Unknown',
  }
}

async function loadModule(name: string): Promise<any> {
  try {
    return await import(/* @vite-ignore */ name)
  } catch {
    return null
  }
}

async function extractQuickExcerpt(filePath: string, ext: string, fileSize = 0): Promise<string> {
  try {
    if (ext === '.pdf') {
      // Guard: Skip large PDF files (> 20 MB) to prevent high memory allocations
      if (fileSize > 20 * 1024 * 1024) {
        return ''
      }
      const mod: any = await loadModule('pdf-parse')
      if (!mod) return ''
      const buffer = await fs.promises.readFile(filePath)
      const PDFParse = mod.PDFParse || mod.default?.PDFParse
      let text = ''
      if (PDFParse) {
        const parser = new PDFParse({ data: buffer })
        try {
          const result = await parser.getText({ first: 1 })
          text = result.text || ''
        } finally {
          if (typeof parser.destroy === 'function') await parser.destroy()
        }
      } else {
        const fn = typeof mod === 'function' ? mod : mod.default
        if (typeof fn === 'function') {
          const result = await fn(buffer, { max: 1 })
          text = result.text || ''
        }
      }
      return cleanExcerptText(text)
    }

    if (ext === '.docx') {
      const mod: any = await loadModule('mammoth')
      if (!mod) return ''
      const mammoth = mod.extractRawText ? mod : mod.default
      const result = await mammoth.extractRawText({ path: filePath })
      return cleanExcerptText(result.value || '')
    }

    if (ext === '.txt' || ext === '.md' || ext === '.markdown') {
      const raw = await fs.promises.readFile(filePath, 'utf-8')
      return cleanExcerptText(raw)
    }
  } catch (_) {}
  return ''
}

function cleanExcerptText(raw: string): string {
  if (!raw) return ''
  // Strip control chars, newlines, multiple spaces, markdown symbols
  const cleaned = raw
    .slice(0, 1200)
    .replace(/[#*`~_>\r\n\t]+/g, ' ')
    .replace(/\|/g, '/')
    .replace(/\s+/g, ' ')
    .trim()

  if (cleaned.length > 200) {
    return cleaned.slice(0, 197) + '...'
  }
  return cleaned
}

export const inspectFolderAction: ActionDefinition = {
  id: 'inspect_folder',
  aliases: ['inspect_books', 'scan_folder', 'scan_books', 'catalog_folder', 'list_book_details'],
  description:
    'Rapidly scans, inspects, and catalogs books, documents, or files in a directory in a single shot. Gathers structured metadata (title, author, format, size, last modified, and topical excerpts) without needing multiple chat roundtrips or file uploads.',
  parameters: {
    path: {
      type: 'string',
      required: false,
      description: 'The directory path to inspect. Defaults to active workspace directory (".").',
      default: '.',
    },
    filter: {
      type: 'string',
      required: false,
      description: 'File filter: "books" (PDF, EPUB, MOBI, DOCX, TXT, MD), "all", or comma-separated extensions (e.g. "pdf,epub"). Defaults to "books".',
      default: 'books',
    },
    includeExcerpts: {
      type: 'boolean',
      required: false,
      description: 'Whether to extract first-page topics / abstracts to facilitate grouping and categorization (default: true).',
      default: true,
    },
    recursive: {
      type: 'boolean',
      required: false,
      description: 'Whether to scan subdirectories recursively. Defaults to false.',
      default: false,
    },
    maxItems: {
      type: 'number',
      required: false,
      description: 'Maximum number of items to return in the catalog table (default: 100).',
      default: 100,
    },
  },
  example: {
    action: 'inspect_folder',
    path: '.',
    filter: 'books',
    includeExcerpts: true,
  },
  async execute(ctx: ActionContext, payload: any, targetPane = 'book'): Promise<ActionResult> {
    const rawPath = payload.path || payload.folder || payload.dir || payload.directory || '.'
    const targetDir = ctx.resolveSafePath(rawPath, targetPane as any)

    if (!fs.existsSync(targetDir)) {
      return {
        success: false,
        action: 'inspect_folder',
        message: `Directory does not exist: "${rawPath}" (resolved to: "${targetDir}")`,
        error: 'Directory not found',
      }
    }

    const dirStat = await fs.promises.stat(targetDir)
    if (!dirStat.isDirectory()) {
      return {
        success: false,
        action: 'inspect_folder',
        message: `Path is a file, not a directory: "${targetDir}". Use read_file to inspect individual files.`,
        error: 'Not a directory',
      }
    }

    const filterMode = String(payload.filter || 'books').trim().toLowerCase()
    const isRecursive = Boolean(payload.recursive)
    const shouldIncludeExcerpts = payload.includeExcerpts !== false
    const maxItems = typeof payload.maxItems === 'number' && payload.maxItems > 0 ? payload.maxItems : 100

    let allowedExtensions: Set<string> | null = null
    if (filterMode === 'books') {
      allowedExtensions = BOOK_EXTENSIONS
    } else if (filterMode !== 'all') {
      allowedExtensions = new Set(
        filterMode
          .split(',')
          .map((ext) => (ext.trim().startsWith('.') ? ext.trim().toLowerCase() : `.${ext.trim().toLowerCase()}`))
          .filter(Boolean)
      )
    }

    console.log(`[inspect_folder:START] Scanning "${targetDir}" (filter: ${filterMode}, excerpts: ${shouldIncludeExcerpts}, recursive: ${isRecursive})`)
    const startTime = performance.now()

    const catalog: CatalogItem[] = []
    let totalSizeBytes = 0
    const formatCounts: Record<string, number> = {}

    async function scanDirectory(currentDir: string, relativePrefix = ''): Promise<void> {
      if (catalog.length >= maxItems) return

      let entries: fs.Dirent[] = []
      try {
        entries = await fs.promises.readdir(currentDir, { withFileTypes: true })
      } catch (err: any) {
        console.warn(`[inspect_folder:WARN] Could not read directory "${currentDir}":`, err.message)
        return
      }

      entries.sort((a, b) => a.name.localeCompare(b.name))

      for (const entry of entries) {
        if (catalog.length >= maxItems) break

        const fullPath = path.join(currentDir, entry.name)
        const relPath = relativePrefix ? path.join(relativePrefix, entry.name) : entry.name

        if (entry.isDirectory()) {
          if (isRecursive && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await scanDirectory(fullPath, relPath)
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase()
          if (allowedExtensions && !allowedExtensions.has(ext)) {
            continue
          }

          try {
            const stat = await fs.promises.stat(fullPath)
            const size = stat.size
            totalSizeBytes += size
            const formatName = ext.replace(/^\./, '').toUpperCase() || 'FILE'
            formatCounts[formatName] = (formatCounts[formatName] || 0) + 1

            const { title, author } = parseTitleAndAuthor(entry.name)
            const modifiedDate = stat.mtime.toISOString().split('T')[0]

            // Extract quick topic/first-page excerpt for the first 35 items if requested
            let excerpt = ''
            if (shouldIncludeExcerpts && catalog.length < 35 && size < 20 * 1024 * 1024) {
              excerpt = await extractQuickExcerpt(fullPath, ext, size)
            }

            catalog.push({
              index: catalog.length + 1,
              fileName: entry.name,
              title,
              author,
              format: formatName,
              sizeBytes: size,
              sizeFormatted: formatBytes(size),
              modified: modifiedDate,
              relativePath: relPath,
              excerpt: excerpt || undefined,
            })
          } catch (_) {}
        }
      }
    }

    await scanDirectory(targetDir)
    const durationMs = Math.round(performance.now() - startTime)
    const dirDisplayName = path.basename(targetDir) || targetDir

    const formatBreakdownStr = Object.entries(formatCounts)
      .map(([fmt, count]) => `${count} ${fmt}`)
      .join(', ') || 'none'

    // Build rich Markdown report
    let message = `### 📚 Folder Catalog: \`${dirDisplayName}\`\n\n`
    message += `**Summary:** Found **${catalog.length}** item(s) (Total Size: **${formatBytes(totalSizeBytes)}**) scanned in ${durationMs}ms\n`
    if (formatBreakdownStr !== 'none') {
      message += `**Format Breakdown:** ${formatBreakdownStr}\n\n`
    } else {
      message += '\n'
    }

    const hasAnyExcerpts = catalog.some((c) => Boolean(c.excerpt))

    if (catalog.length === 0) {
      message += `*No files matching filter "${filterMode}" were found in this directory.*\n`
    } else {
      if (hasAnyExcerpts) {
        message += '| # | Title | Author | Format | Size | Topic / Excerpt |\n'
        message += '|---|-------|--------|--------|------|-----------------|\n'
        for (const item of catalog) {
          const safeTitle = item.title.replace(/\|/g, '/')
          const safeAuthor = item.author.replace(/\|/g, '/')
          const safeExcerpt = (item.excerpt || item.fileName).replace(/\|/g, '/')
          message += `| ${item.index} | **${safeTitle}** | ${safeAuthor} | \`${item.format}\` | ${item.sizeFormatted} | ${safeExcerpt} |\n`
        }
      } else {
        message += '| # | Title | Author | Format | Size | Modified | File Name |\n'
        message += '|---|-------|--------|--------|------|----------|-----------|\n'
        for (const item of catalog) {
          const safeTitle = item.title.replace(/\|/g, '/')
          const safeAuthor = item.author.replace(/\|/g, '/')
          const safeFile = item.fileName.replace(/\|/g, '/')
          message += `| ${item.index} | **${safeTitle}** | ${safeAuthor} | \`${item.format}\` | ${item.sizeFormatted} | ${item.modified} | \`${safeFile}\` |\n`
        }
      }
      if (catalog.length >= maxItems) {
        message += `\n*Note: Output capped at ${maxItems} items.*\n`
      }
    }

    ctx.notify(`📚 Cataloged ${catalog.length} items in "${dirDisplayName}" (${formatBytes(totalSizeBytes)})`)

    return {
      success: true,
      action: 'inspect_folder',
      message,
      details: {
        directory: targetDir,
        itemCount: catalog.length,
        totalSizeBytes,
        totalSizeFormatted: formatBytes(totalSizeBytes),
        formatBreakdown: formatCounts,
        items: catalog,
        executionTimeMs: durationMs,
      },
    }
  },
}
