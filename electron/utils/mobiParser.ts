import fs from 'node:fs'
import path from 'node:path'
import AdmZip from 'adm-zip'
import { EpubBookData, EpubChapter, EpubTocItem } from '../utils/epubParser'
import { parseEpub } from '../utils/epubParser'

function decompressPalmDoc(buffer: Buffer): Buffer {
  const out: number[] = []
  let i = 0
  while (i < buffer.length) {
    const byte = buffer[i++]
    if (byte === 0x00) {
      out.push(0)
    } else if (byte >= 0x01 && byte <= 0x08) {
      for (let j = 0; j < byte && i < buffer.length; j++) {
        out.push(buffer[i++])
      }
    } else if (byte >= 0x09 && byte <= 0x7f) {
      out.push(byte)
    } else if (byte >= 0x80 && byte <= 0xbf) {
      if (i >= buffer.length) break
      const byte2 = buffer[i++]
      const distance = ((byte & 0x3f) << 3) | (byte2 >> 5)
      const length = (byte2 & 0x07) + 3
      for (let k = 0; k < length; k++) {
        const srcIdx = out.length - distance
        if (srcIdx >= 0) {
          out.push(out[srcIdx])
        }
      }
    } else if (byte >= 0xc0) {
      out.push(0x20)
      out.push(byte ^ 0x80)
    }
  }
  return Buffer.from(out)
}

function stripHtmlToText(html: string): string {
  if (!html) return ''
  let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
  text = text.replace(/<(?:p|div|h[1-6]|li|tr|blockquote|section|article)[^>]*>/gi, '\n')
  text = text.replace(/<br\s*\/?>/gi, '\n')
  text = text.replace(/<[^>]+>/g, '')
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n\n')
}

function detectImageMime(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png'
  }
  if (buffer.length >= 6 && buffer.subarray(0, 3).toString('latin1') === 'GIF') {
    return 'image/gif'
  }
  return 'image/jpeg'
}

/**
 * Parses a MOBI / PalmDOC (.mobi / .prc / .azw) book file into structured metadata,
 * chapters, and inlined images.
 */
export function parseMobi(filePath: string): EpubBookData {
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

    const fileBuf = fs.readFileSync(filePath)

    // 1. Check if the file is actually a renamed EPUB or contains an embedded EPUB
    if (fileBuf.length > 4 && fileBuf[0] === 0x50 && fileBuf[1] === 0x4b && fileBuf[2] === 0x03 && fileBuf[3] === 0x04) {
      return parseEpub(filePath)
    }

    // 2. Parse Palm Database (PDB) header
    if (fileBuf.length < 78) {
      return {
        success: false,
        filePath,
        fileName: path.basename(filePath),
        title: path.basename(filePath),
        totalChapters: 0,
        totalWords: 0,
        chapters: [],
        toc: [],
        error: 'Invalid MOBI file: header too short',
      }
    }

    const numRecords = fileBuf.readUInt16BE(76)
    if (numRecords < 1 || fileBuf.length < 78 + numRecords * 8) {
      return {
        success: false,
        filePath,
        fileName: path.basename(filePath),
        title: path.basename(filePath),
        totalChapters: 0,
        totalWords: 0,
        chapters: [],
        toc: [],
        error: 'Invalid MOBI file: invalid record count',
      }
    }

    const recordOffsets: number[] = []
    for (let r = 0; r < numRecords; r++) {
      recordOffsets.push(fileBuf.readUInt32BE(78 + r * 8))
    }

    // Check if any record in the PDB is an embedded EPUB (modern KF8 / Combo MOBI)
    for (let r = 0; r < numRecords; r++) {
      const recStart = recordOffsets[r]
      const recEnd = r + 1 < numRecords ? recordOffsets[r + 1] : fileBuf.length
      if (recEnd - recStart > 4) {
        if (
          fileBuf[recStart] === 0x50 &&
          fileBuf[recStart + 1] === 0x4b &&
          fileBuf[recStart + 2] === 0x03 &&
          fileBuf[recStart + 3] === 0x04
        ) {
          try {
            // Write to a temporary zip buffer in memory
            const zipBuf = fileBuf.subarray(recStart, recEnd)
            const zip = new AdmZip(zipBuf)
            if (zip.getEntry('META-INF/container.xml')) {
              // Valid embedded EPUB found! Parse directly using in-memory zip
              const tempEpub = `${filePath}.kf8.temp.epub`
              fs.writeFileSync(tempEpub, zipBuf)
              const epubRes = parseEpub(tempEpub)
              try {
                fs.unlinkSync(tempEpub)
              } catch (_) {}
              if (epubRes.success) {
                return {
                  ...epubRes,
                  filePath,
                  fileName: path.basename(filePath),
                }
              }
            }
          } catch (_) {}
        }
      }
    }

    // 3. Parse Record 0 (PalmDOC & MOBI Headers)
    const rec0Start = recordOffsets[0]
    const rec0End = numRecords > 1 ? recordOffsets[1] : fileBuf.length
    const rec0 = fileBuf.subarray(rec0Start, rec0End)

    if (rec0.length < 16) {
      return {
        success: false,
        filePath,
        fileName: path.basename(filePath),
        title: path.basename(filePath),
        totalChapters: 0,
        totalWords: 0,
        chapters: [],
        toc: [],
        error: 'Invalid MOBI Record 0: header too short',
      }
    }

    const compression = rec0.readUInt16BE(0)
    const recordCount = rec0.readUInt16BE(8)

    let title = path.basename(filePath, path.extname(filePath))
    let author: string | undefined
    let publisher: string | undefined
    let description: string | undefined
    let firstImageIndex = 0

    // MOBI Header check
    if (rec0.length >= 16 + 20 && rec0.subarray(16, 20).toString('latin1') === 'MOBI') {
      const headerLength = rec0.readUInt32BE(20)

      if (rec0.length >= 16 + 88) {
        const fullNameOffset = rec0.readUInt32BE(16 + 80)
        const fullNameLength = rec0.readUInt32BE(16 + 84)
        if (fullNameOffset > 0 && fullNameLength > 0 && fullNameOffset + fullNameLength <= rec0.length) {
          title = rec0.subarray(fullNameOffset, fullNameOffset + fullNameLength).toString('utf-8').trim() || title
        }
      }

      if (rec0.length >= 16 + 112) {
        firstImageIndex = rec0.readUInt32BE(16 + 108)
      }

      // Check for EXTH header
      const exthOffset = 16 + headerLength
      if (rec0.length >= exthOffset + 12 && rec0.subarray(exthOffset, exthOffset + 4).toString('latin1') === 'EXTH') {
        const exthCount = rec0.readUInt32BE(exthOffset + 8)
        let exthPos = exthOffset + 12
        for (let e = 0; e < exthCount && exthPos + 8 <= rec0.length; e++) {
          const recType = rec0.readUInt32BE(exthPos)
          const recLen = rec0.readUInt32BE(exthPos + 4)
          if (recLen < 8 || exthPos + recLen > rec0.length) break
          const data = rec0.subarray(exthPos + 8, exthPos + recLen)
          if (recType === 100) {
            author = data.toString('utf-8').trim()
          } else if (recType === 101) {
            publisher = data.toString('utf-8').trim()
          } else if (recType === 103) {
            description = data.toString('utf-8').trim()
          } else if (recType === 503) {
            title = data.toString('utf-8').trim() || title
          }
          exthPos += recLen
        }
      }
    }

    // 4. Extract Images into memory map
    const imageMap = new Map<number, string>()
    if (firstImageIndex > 0 && firstImageIndex < numRecords) {
      for (let imgIdx = firstImageIndex; imgIdx < numRecords; imgIdx++) {
        const start = recordOffsets[imgIdx]
        const end = imgIdx + 1 < numRecords ? recordOffsets[imgIdx + 1] : fileBuf.length
        const imgBuf = fileBuf.subarray(start, end)
        if (imgBuf.length > 4) {
          const mime = detectImageMime(imgBuf)
          const dataUri = `data:${mime};base64,${imgBuf.toString('base64')}`
          const relativeIndex = imgIdx - firstImageIndex + 1
          imageMap.set(relativeIndex, dataUri)
        }
      }
    }

    // 5. Decompress Text Records (1 .. recordCount)
    const textChunks: Buffer[] = []
    const maxTextRecords = Math.min(recordCount, numRecords - 1)

    for (let r = 1; r <= maxTextRecords; r++) {
      const start = recordOffsets[r]
      const end = r + 1 < numRecords ? recordOffsets[r + 1] : fileBuf.length
      const chunkBuf = fileBuf.subarray(start, end)

      if (compression === 2) {
        textChunks.push(decompressPalmDoc(chunkBuf))
      } else if (compression === 1) {
        textChunks.push(chunkBuf)
      } else {
        // Unknown compression, push raw
        textChunks.push(chunkBuf)
      }
    }

    const fullHtmlBuffer = Buffer.concat(textChunks)

    // 6. Locate filepos targets and insert anchor markers
    const targetFilepos = new Set<number>()
    const initialHtml = fullHtmlBuffer.toString('utf-8')
    const fpRefRegex = /(?:href=["']filepos:0*(\d+)["']|filepos=["']?0*(\d+)["']?)/gi
    let fpMatch: RegExpExecArray | null
    while ((fpMatch = fpRefRegex.exec(initialHtml)) !== null) {
      const numStr = fpMatch[1] || fpMatch[2]
      if (numStr) {
        const pos = parseInt(numStr, 10)
        if (!isNaN(pos) && pos >= 0 && pos < fullHtmlBuffer.length) {
          targetFilepos.add(pos)
        }
      }
    }

    // Insert anchor markers in descending byte order so earlier offsets remain accurate
    let workingBuffer = fullHtmlBuffer
    if (targetFilepos.size > 0) {
      const sortedPositions = Array.from(targetFilepos).sort((a, b) => b - a)
      for (const pos of sortedPositions) {
        if (pos <= 0 || pos >= workingBuffer.length) continue
        let insertPos = pos
        // If pos falls inside an open HTML tag, advance past the closing '>'
        const prevOpen = workingBuffer.lastIndexOf(0x3c /* '<' */, pos)
        const prevClose = workingBuffer.lastIndexOf(0x3e /* '>' */, pos)
        if (prevOpen !== -1 && prevOpen > prevClose) {
          const nextClose = workingBuffer.indexOf(0x3e /* '>' */, pos)
          if (nextClose !== -1 && nextClose - pos < 500) {
            insertPos = nextClose + 1
          }
        }
        const markerBuf = Buffer.from(`<a id="filepos_${pos}" name="filepos_${pos}" class="wb-mobi-anchor"></a>`, 'utf-8')
        workingBuffer = Buffer.concat([
          workingBuffer.subarray(0, insertPos),
          markerBuf,
          workingBuffer.subarray(insertPos),
        ])
      }
    }

    let rawHtml = workingBuffer.toString('utf-8')

    // 7. Normalize filepos links to standard hash anchors with data-filepos attributes
    rawHtml = rawHtml.replace(/\bhref=["']filepos:0*(\d+)["']/gi, (_m, posStr) => {
      const pos = parseInt(posStr, 10)
      return `href="#filepos_${pos}" data-filepos="${pos}"`
    })
    rawHtml = rawHtml.replace(/<a\b([^>]*\bfilepos=["']?0*(\d+)["']?[^>]*)>/gi, (_fullTag, attrs, posStr) => {
      const pos = parseInt(posStr, 10)
      let updated = attrs.replace(/\bfilepos=["']?0*\d+["']?/i, `data-filepos="${pos}"`)
      if (!/\bhref\s*=/i.test(updated)) {
        updated = `href="#filepos_${pos}" ` + updated
      }
      return `<a ${updated}>`
    })

    // 8. In-line Images
    // Replace <img recindex="1"/> or <img recindex="0001"/> or <img src="kindle:embed:0001"/>
    rawHtml = rawHtml.replace(/<img\b([^>]*\brecindex=["']?(\d+)["']?[^>]*)>/gi, (full, attrs, idxStr) => {
      const idx = parseInt(idxStr, 10)
      const dataUri = imageMap.get(idx)
      if (dataUri) {
        return `<img src="${dataUri}" ${attrs.replace(/\brecindex=["']?\d+["']?/i, '')} />`
      }
      return full
    })

    rawHtml = rawHtml.replace(/<img\b([^>]*\bsrc=["']kindle:embed:0*(\d+)["'][^>]*)>/gi, (full, _attrs, idxStr) => {
      const idx = parseInt(idxStr, 10)
      const dataUri = imageMap.get(idx)
      if (dataUri) {
        return `<img src="${dataUri}" />`
      }
      return full
    })

    // 9. Split into Chapters and track character/byte offsets
    // Standard MOBI breaks chapters with <mbp:pagebreak/>
    const pagebreakRegex = /<mbp:pagebreak\s*\/?>/gi
    interface RawChunk {
      startPos: number
      endPos: number
      html: string
    }
    const rawChunks: RawChunk[] = []
    let lastOffset = 0
    let pbMatch: RegExpExecArray | null

    while ((pbMatch = pagebreakRegex.exec(rawHtml)) !== null) {
      const chunkText = rawHtml.substring(lastOffset, pbMatch.index)
      if (chunkText.trim().length > 0) {
        rawChunks.push({
          startPos: lastOffset,
          endPos: pbMatch.index,
          html: chunkText,
        })
      }
      lastOffset = pbMatch.index + pbMatch[0].length
    }
    const trailingText = rawHtml.substring(lastOffset)
    if (trailingText.trim().length > 0) {
      rawChunks.push({
        startPos: lastOffset,
        endPos: rawHtml.length,
        html: trailingText,
      })
    }

    const finalChunks = rawChunks.length > 0 ? rawChunks : [{ startPos: 0, endPos: rawHtml.length, html: rawHtml }]

    const chapters: EpubChapter[] = []
    const toc: EpubTocItem[] = []
    let totalWords = 0

    for (let i = 0; i < finalChunks.length; i++) {
      const chunk = finalChunks[i]
      const chunkHtml = chunk.html
      const plainText = stripHtmlToText(chunkHtml)
      const words = plainText.trim() ? plainText.trim().split(/\s+/).filter(Boolean).length : 0
      totalWords += words

      // Detect Title from <h1>, <h2> or first non-empty line
      let chTitle = ''
      const hMatch = chunkHtml.match(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i)
      if (hMatch) {
        chTitle = hMatch[1].replace(/<[^>]+>/g, '').trim()
      }
      if (!chTitle) {
        const firstLine = plainText.split('\n')[0]?.trim()
        if (firstLine && firstLine.length > 2 && firstLine.length < 60) {
          chTitle = firstLine
        }
      }
      if (!chTitle) {
        chTitle = `Chapter ${i + 1}`
      }

      chapters.push({
        id: `ch_${i + 1}`,
        title: chTitle,
        href: `chapter_${i + 1}.html`,
        html: chunkHtml,
        text: plainText,
        wordCount: words,
        startPos: chunk.startPos,
        endPos: chunk.endPos,
      })

      toc.push({
        title: chTitle,
        href: `chapter_${i + 1}.html`,
        chapterIndex: i,
      })
    }

    const coverDataUrl = imageMap.get(1)

    return {
      success: true,
      filePath,
      fileName: path.basename(filePath),
      title,
      author,
      description,
      publisher,
      coverDataUrl,
      totalChapters: chapters.length,
      totalWords,
      chapters,
      toc,
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
      error: err?.message || 'Failed to parse MOBI book',
    }
  }
}
