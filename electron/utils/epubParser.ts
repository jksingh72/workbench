import fs from 'node:fs'
import path from 'node:path'
import AdmZip from 'adm-zip'

export interface EpubChapter {
  id: string
  title: string
  href: string
  html: string
  text: string
  wordCount: number
  startPos?: number
  endPos?: number
}

export interface EpubTocItem {
  title: string
  href: string
  chapterIndex: number
}

export interface EpubBookData {
  success: boolean
  filePath: string
  fileName: string
  title: string
  author?: string
  description?: string
  publisher?: string
  language?: string
  coverDataUrl?: string
  totalChapters: number
  totalWords: number
  chapters: EpubChapter[]
  toc: EpubTocItem[]
  error?: string
}

function decodeXmlEntities(str: string): string {
  if (!str) return ''
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

function stripHtmlToText(html: string): string {
  if (!html) return ''
  // Remove script and style elements
  let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
  // Replace block tags and breaks with newlines
  text = text.replace(/<(?:p|div|h[1-6]|li|tr|blockquote|section|article)[^>]*>/gi, '\n')
  text = text.replace(/<br\s*\/?>/gi, '\n')
  // Strip all other HTML tags
  text = text.replace(/<[^>]+>/g, '')
  // Decode entities
  text = decodeXmlEntities(text)
  // Normalize whitespace
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n\n')
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.svg':
      return 'image/svg+xml'
    case '.webp':
      return 'image/webp'
    case '.ico':
      return 'image/x-icon'
    default:
      return 'application/octet-stream'
  }
}

/**
 * Parses an EPUB (.epub) book file into structured metadata, table of contents,
 * and chapters with inline base64 images for offline in-app reading.
 */
export function parseEpub(filePath: string): EpubBookData {
  try {
    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        filePath,
        fileName: path.basename(filePath),
        title: path.basename(filePath),
        totalChapters: 0,
        totalWords: 0,
        chapters: [],
        toc: [],
        error: `File not found: ${filePath}`,
      }
    }

    const zip = new AdmZip(filePath)
    const entries = zip.getEntries()
    const entryMap = new Map<string, AdmZip.IZipEntry>()
    for (const entry of entries) {
      entryMap.set(entry.entryName.replace(/\\/g, '/').toLowerCase(), entry)
    }

    const getEntryContent = (relPath: string): string | null => {
      const normalized = relPath.replace(/\\/g, '/').toLowerCase()
      const entry = entryMap.get(normalized)
      if (entry) {
        try {
          return entry.getData().toString('utf-8')
        } catch (_) {}
      }
      // Fallback: match by basename if exact path not found
      const base = path.posix.basename(normalized)
      for (const [k, e] of entryMap.entries()) {
        if (path.posix.basename(k) === base) {
          try {
            return e.getData().toString('utf-8')
          } catch (_) {}
        }
      }
      return null
    }

    const getEntryBuffer = (relPath: string): Buffer | null => {
      const normalized = relPath.replace(/\\/g, '/').toLowerCase()
      const entry = entryMap.get(normalized)
      if (entry) {
        try {
          return entry.getData()
        } catch (_) {}
      }
      const base = path.posix.basename(normalized)
      for (const [k, e] of entryMap.entries()) {
        if (path.posix.basename(k) === base) {
          try {
            return e.getData()
          } catch (_) {}
        }
      }
      return null
    }

    // 1. Find the root OPF package file from META-INF/container.xml
    let opfPath = 'OEBPS/content.opf'
    const containerXml = getEntryContent('META-INF/container.xml')
    if (containerXml) {
      const rootfileMatch = containerXml.match(/<rootfile\b[^>]*full-path=["']([^"']+)["']/i)
      if (rootfileMatch && rootfileMatch[1]) {
        opfPath = rootfileMatch[1]
      }
    } else {
      // Find any .opf file in the zip
      for (const [k] of entryMap.entries()) {
        if (k.endsWith('.opf')) {
          opfPath = k
          break
        }
      }
    }

    const opfContent = getEntryContent(opfPath)
    if (!opfContent) {
      return {
        success: false,
        filePath,
        fileName: path.basename(filePath),
        title: path.basename(filePath),
        totalChapters: 0,
        totalWords: 0,
        chapters: [],
        toc: [],
        error: `Could not find OPF package document in EPUB: ${opfPath}`,
      }
    }

    const opfDir = path.posix.dirname(opfPath.replace(/\\/g, '/'))
    const resolveFromOpf = (href: string) => {
      const cleanHref = href.split('#')[0].replace(/\\/g, '/')
      if (opfDir && opfDir !== '.' && !cleanHref.startsWith('/')) {
        return path.posix.join(opfDir, cleanHref)
      }
      return cleanHref
    }

    // 2. Parse Metadata
    const titleMatch = opfContent.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i)
    const authorMatch = opfContent.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i)
    const descMatch = opfContent.match(/<dc:description[^>]*>([\s\S]*?)<\/dc:description>/i)
    const pubMatch = opfContent.match(/<dc:publisher[^>]*>([\s\S]*?)<\/dc:publisher>/i)
    const langMatch = opfContent.match(/<dc:language[^>]*>([\s\S]*?)<\/dc:language>/i)

    const rawTitle = titleMatch ? decodeXmlEntities(titleMatch[1].replace(/<[^>]+>/g, '').trim()) : ''
    const title = rawTitle || path.basename(filePath, path.extname(filePath))
    const author = authorMatch ? decodeXmlEntities(authorMatch[1].replace(/<[^>]+>/g, '').trim()) : undefined
    const description = descMatch ? decodeXmlEntities(descMatch[1].replace(/<[^>]+>/g, '').trim()) : undefined
    const publisher = pubMatch ? decodeXmlEntities(pubMatch[1].replace(/<[^>]+>/g, '').trim()) : undefined
    const language = langMatch ? decodeXmlEntities(langMatch[1].replace(/<[^>]+>/g, '').trim()) : undefined

    // 3. Parse Manifest items: id -> { href, mediaType, properties }
    interface ManifestItem {
      id: string
      href: string
      mediaType: string
      properties?: string
    }
    const manifest = new Map<string, ManifestItem>()
    const itemRegex = /<item\b([^>]+)\/?>/gi
    let match: RegExpExecArray | null

    while ((match = itemRegex.exec(opfContent)) !== null) {
      const attrStr = match[1]
      const idMatch = attrStr.match(/\bid=["']([^"']+)["']/i)
      const hrefMatch = attrStr.match(/\bhref=["']([^"']+)["']/i)
      const mediaMatch = attrStr.match(/\bmedia-type=["']([^"']+)["']/i)
      const propMatch = attrStr.match(/\bproperties=["']([^"']+)["']/i)

      if (idMatch && hrefMatch) {
        manifest.set(idMatch[1], {
          id: idMatch[1],
          href: decodeURIComponent(hrefMatch[1]),
          mediaType: mediaMatch ? mediaMatch[1] : '',
          properties: propMatch ? propMatch[1] : undefined,
        })
      }
    }

    // 4. Parse Spine: ordered list of itemrefs
    const spine: string[] = []
    const itemrefRegex = /<itemref\b([^>]+)\/?>/gi
    while ((match = itemrefRegex.exec(opfContent)) !== null) {
      const idrefMatch = match[1].match(/\bidref=["']([^"']+)["']/i)
      if (idrefMatch) {
        spine.push(idrefMatch[1])
      }
    }

    // 5. Look for cover image
    let coverDataUrl: string | undefined
    let coverItem = Array.from(manifest.values()).find(
      (m) =>
        m.properties?.includes('cover-image') ||
        m.id.toLowerCase() === 'cover-image' ||
        m.id.toLowerCase() === 'cover'
    )
    if (!coverItem) {
      const metaCoverMatch = opfContent.match(/<meta\b[^>]*name=["']cover["'][^>]*content=["']([^"']+)["']/i)
      if (metaCoverMatch) {
        coverItem = manifest.get(metaCoverMatch[1])
      }
    }
    if (coverItem) {
      const coverPath = resolveFromOpf(coverItem.href)
      const buf = getEntryBuffer(coverPath)
      if (buf) {
        const mime = coverItem.mediaType || getMimeType(coverPath)
        coverDataUrl = `data:${mime};base64,${buf.toString('base64')}`
      }
    }

    // 6. Parse Table of Contents (NCX or EPUB 3 Nav)
    const tocItems: { title: string; href: string }[] = []

    // Check for NCX TOC
    const ncxItem = Array.from(manifest.values()).find(
      (m) => m.mediaType === 'application/x-dtbncx+xml' || m.href.endsWith('.ncx')
    )
    if (ncxItem) {
      const ncxPath = resolveFromOpf(ncxItem.href)
      const ncxContent = getEntryContent(ncxPath)
      if (ncxContent) {
        const navPointRegex = /<navPoint\b[\s\S]*?<text>([\s\S]*?)<\/text>[\s\S]*?<content\b[^>]*src=["']([^"']+)["'][\s\S]*?<\/navPoint>/gi
        let npMatch: RegExpExecArray | null
        while ((npMatch = navPointRegex.exec(ncxContent)) !== null) {
          const navTitle = decodeXmlEntities(npMatch[1].replace(/<[^>]+>/g, '').trim())
          const navHref = decodeURIComponent(npMatch[2].trim())
          if (navTitle && navHref) {
            tocItems.push({ title: navTitle, href: navHref })
          }
        }
      }
    }

    // Check for EPUB 3 Nav TOC if NCX was empty
    if (tocItems.length === 0) {
      const navItem = Array.from(manifest.values()).find(
        (m) => m.properties?.includes('nav') || m.id.toLowerCase().includes('toc')
      )
      if (navItem) {
        const navPath = resolveFromOpf(navItem.href)
        const navContent = getEntryContent(navPath)
        if (navContent) {
          const aRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
          let aMatch: RegExpExecArray | null
          while ((aMatch = aRegex.exec(navContent)) !== null) {
            const navHref = decodeURIComponent(aMatch[1].trim())
            const navTitle = decodeXmlEntities(aMatch[2].replace(/<[^>]+>/g, '').trim())
            if (navTitle && navHref) {
              tocItems.push({ title: navTitle, href: navHref })
            }
          }
        }
      }
    }

    // 7. Load and Process Chapters in Spine reading order
    const chapters: EpubChapter[] = []
    let totalWords = 0

    for (let i = 0; i < spine.length; i++) {
      const idref = spine[i]
      const manifestItem = manifest.get(idref)
      if (!manifestItem) continue

      const chapterPath = resolveFromOpf(manifestItem.href)
      const rawHtml = getEntryContent(chapterPath)
      if (!rawHtml) continue

      const chapterDir = path.posix.dirname(chapterPath)

      // Find Title of chapter
      let chapterTitle = ''
      // Try TOC match
      const matchingToc = tocItems.find((t) => {
        const baseHref = t.href.split('#')[0]
        return baseHref === manifestItem.href || baseHref === path.posix.basename(manifestItem.href)
      })
      if (matchingToc) {
        chapterTitle = matchingToc.title
      }

      if (!chapterTitle) {
        const hMatch = rawHtml.match(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i)
        if (hMatch) {
          chapterTitle = decodeXmlEntities(hMatch[1].replace(/<[^>]+>/g, '').trim())
        }
      }
      if (!chapterTitle) {
        const tMatch = rawHtml.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)
        if (tMatch) {
          chapterTitle = decodeXmlEntities(tMatch[1].replace(/<[^>]+>/g, '').trim())
        }
      }
      if (!chapterTitle) {
        chapterTitle = `Chapter ${i + 1}`
      }

      // Inline images with base64 data URIs
      let processedHtml = rawHtml
      const imgRegex = /<img\b([^>]*\bsrc=["']([^"']+)["'][^>]*)>/gi
      processedHtml = processedHtml.replace(imgRegex, (fullImg, _attrs, src) => {
        const cleanSrc = decodeURIComponent(src.split('#')[0])
        const imgZipPath = chapterDir ? path.posix.join(chapterDir, cleanSrc) : cleanSrc
        const imgBuffer = getEntryBuffer(imgZipPath)
        if (imgBuffer) {
          const mime = getMimeType(cleanSrc)
          const dataUri = `data:${mime};base64,${imgBuffer.toString('base64')}`
          return fullImg.replace(src, dataUri)
        }
        return fullImg
      })

      // Handle SVG <image xlink:href="..."> or <image href="...">
      const svgImgRegex = /<image\b([^>]*\b(?:xlink:)?href=["']([^"']+)["'][^>]*)>/gi
      processedHtml = processedHtml.replace(svgImgRegex, (fullImg, _attrs, src) => {
        const cleanSrc = decodeURIComponent(src.split('#')[0])
        const imgZipPath = chapterDir ? path.posix.join(chapterDir, cleanSrc) : cleanSrc
        const imgBuffer = getEntryBuffer(imgZipPath)
        if (imgBuffer) {
          const mime = getMimeType(cleanSrc)
          const dataUri = `data:${mime};base64,${imgBuffer.toString('base64')}`
          return fullImg.replace(src, dataUri)
        }
        return fullImg
      })

      // Strip external scripts
      processedHtml = processedHtml.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')

      // Extract plain text
      const plainText = stripHtmlToText(processedHtml)
      const words = plainText.trim() ? plainText.trim().split(/\s+/).filter(Boolean).length : 0
      totalWords += words

      chapters.push({
        id: manifestItem.id,
        title: chapterTitle,
        href: manifestItem.href,
        html: processedHtml,
        text: plainText,
        wordCount: words,
      })
    }

    // 8. Map TOC to Chapter Indices
    const mappedToc: EpubTocItem[] = []
    for (const tocItem of tocItems) {
      const baseHref = tocItem.href.split('#')[0]
      const chIdx = chapters.findIndex(
        (c) => c.href === baseHref || path.posix.basename(c.href) === path.posix.basename(baseHref)
      )
      mappedToc.push({
        title: tocItem.title,
        href: tocItem.href,
        chapterIndex: chIdx >= 0 ? chIdx : 0,
      })
    }

    // If TOC is empty, build from chapters
    if (mappedToc.length === 0) {
      chapters.forEach((ch, idx) => {
        mappedToc.push({
          title: ch.title,
          href: ch.href,
          chapterIndex: idx,
        })
      })
    }

    return {
      success: true,
      filePath,
      fileName: path.basename(filePath),
      title,
      author,
      description,
      publisher,
      language,
      coverDataUrl,
      totalChapters: chapters.length,
      totalWords,
      chapters,
      toc: mappedToc,
    }
  } catch (err: any) {
    return {
      success: false,
      filePath,
      fileName: path.basename(filePath),
      title: path.basename(filePath),
      totalChapters: 0,
      totalWords: 0,
      chapters: [],
      toc: [],
      error: err?.message || 'Failed to parse EPUB book',
    }
  }
}
