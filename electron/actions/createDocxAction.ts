import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { ActionDefinition, ActionContext, ActionResult } from './types'

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'

// ---------- ZIP writer (Node built-ins only) ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function buildZip(entries: { name: string; data: string }[]): Buffer {
  const now = new Date()
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2)
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8')
    const raw = Buffer.from(e.data, 'utf8')
    const comp = zlib.deflateRawSync(raw)
    const crc = crc32(raw)
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0)
    lh.writeUInt16LE(20, 4)
    lh.writeUInt16LE(0x0800, 6)
    lh.writeUInt16LE(8, 8)
    lh.writeUInt16LE(dosTime, 10)
    lh.writeUInt16LE(dosDate, 12)
    lh.writeUInt32LE(crc, 14)
    lh.writeUInt32LE(comp.length, 18)
    lh.writeUInt32LE(raw.length, 22)
    lh.writeUInt16LE(name.length, 26)
    lh.writeUInt16LE(0, 28)
    locals.push(lh, name, comp)
    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0)
    ch.writeUInt16LE(20, 4)
    ch.writeUInt16LE(20, 6)
    ch.writeUInt16LE(0x0800, 8)
    ch.writeUInt16LE(8, 10)
    ch.writeUInt16LE(dosTime, 12)
    ch.writeUInt16LE(dosDate, 14)
    ch.writeUInt32LE(crc, 16)
    ch.writeUInt32LE(comp.length, 20)
    ch.writeUInt32LE(raw.length, 24)
    ch.writeUInt16LE(name.length, 28)
    ch.writeUInt32LE(offset, 42)
    centrals.push(ch, name)
    offset += lh.length + name.length + comp.length
  }
  const cd = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(cd.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, end])
}

// ---------- WordprocessingML builders ----------
function esc(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function runs(text: string): string {
  return text
    .split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
    .filter((p) => p.length > 0)
    .map((p) => {
      let rPr = ''
      let t = p
      if (p.length > 4 && p.startsWith('**') && p.endsWith('**')) {
        rPr = '<w:rPr><w:b/></w:rPr>'
        t = p.slice(2, -2)
      } else if (p.length > 2 && p.startsWith('*') && p.endsWith('*')) {
        rPr = '<w:rPr><w:i/></w:rPr>'
        t = p.slice(1, -1)
      }
      return '<w:r>' + rPr + '<w:t xml:space="preserve">' + esc(t) + '</w:t></w:r>'
    })
    .join('')
}

function para(style: string, inner: string): string {
  return '<w:p>' + (style ? '<w:pPr><w:pStyle w:val="' + style + '"/></w:pPr>' : '') + inner + '</w:p>'
}

function listPara(numId: number, lvl: number, inner: string): string {
  return '<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="' + lvl + '"/><w:numId w:val="' + numId + '"/></w:numPr></w:pPr>' + inner + '</w:p>'
}

function buildBody(content: string, title?: string): { body: string; numberedLists: number } {
  const out: string[] = []
  let listCount = 0
  let currentNumId = 0
  let inNumbered = false
  if (title) out.push(para('Title', runs(String(title))))
  for (const rawLine of content.replace(/\r\n?/g, '\n').split('\n')) {
    const indent = (rawLine.match(/^ */) || [''])[0].length
    const level = Math.min(2, Math.floor(indent / 2))
    const line = rawLine.trim()
    if (line === '') continue
    if (line === '[[pagebreak]]') {
      out.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')
      inNumbered = false
      continue
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/)
    if (h) {
      out.push(para('Heading' + h[1].length, runs(h[2])))
      inNumbered = false
      continue
    }
    const b = line.match(/^[-*•]\s+(.*)$/)
    if (b) {
      out.push(listPara(1, level, runs(b[1])))
      continue
    }
    const n = line.match(/^\d+[.)]\s+(.*)$/)
    if (n) {
      if (!inNumbered) {
        listCount++
        currentNumId = 1 + listCount
        inNumbered = true
      }
      out.push(listPara(currentNumId, level, runs(n[1])))
      continue
    }
    out.push(para('', runs(line)))
    if (level === 0) inNumbered = false
  }
  if (out.length === 0) out.push('<w:p/>')
  return { body: out.join(''), numberedLists: listCount }
}

function lvlXml(i: number, fmt: string, text: string): string {
  return '<w:lvl w:ilvl="' + i + '"><w:start w:val="1"/><w:numFmt w:val="' + fmt + '"/><w:lvlText w:val="' + text + '"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="' + 720 * (i + 1) + '" w:hanging="360"/></w:pPr></w:lvl>'
}

function numberingXml(numberedLists: number): string {
  const bullets = ['•', '◦', '▪']
  const nums: [string, string][] = [['decimal', '%1.'], ['lowerLetter', '%2.'], ['lowerRoman', '%3.']]
  let x = XML_DECL + '<w:numbering xmlns:w="' + W_NS + '">'
  x += '<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>' + bullets.map((c, i) => lvlXml(i, 'bullet', c)).join('') + '</w:abstractNum>'
  x += '<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>' + nums.map((f, i) => lvlXml(i, f[0], f[1])).join('') + '</w:abstractNum>'
  x += '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>'
  for (let k = 0; k < numberedLists; k++) {
    x += '<w:num w:numId="' + (k + 2) + '"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>'
  }
  return x + '</w:numbering>'
}

function headingStyle(id: string, name: string, before: number, after: number, lvl: number, size: number, color: string): string {
  return '<w:style w:type="paragraph" w:styleId="' + id + '"><w:name w:val="' + name + '"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="' + before + '" w:after="' + after + '"/><w:outlineLvl w:val="' + lvl + '"/></w:pPr><w:rPr><w:b/><w:color w:val="' + color + '"/><w:sz w:val="' + size + '"/><w:szCs w:val="' + size + '"/></w:rPr></w:style>'
}

function stylesXml(): string {
  return XML_DECL + '<w:styles xmlns:w="' + W_NS + '">' +
    '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:sz w:val="48"/><w:szCs w:val="48"/></w:rPr></w:style>' +
    headingStyle('Heading1', 'heading 1', 360, 120, 0, 32, '1F3864') +
    headingStyle('Heading2', 'heading 2', 240, 80, 1, 26, '2F5496') +
    headingStyle('Heading3', 'heading 3', 200, 60, 2, 24, '2F5496') +
    '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="60"/></w:pPr></w:style>' +
    '</w:styles>'
}

function documentXml(body: string): string {
  return XML_DECL + '<w:document xmlns:w="' + W_NS + '"><w:body>' + body +
    '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>'
}

function coreXml(title: string, author: string): string {
  const ts = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  return XML_DECL + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    '<dc:title>' + esc(title) + '</dc:title><dc:creator>' + esc(author) + '</dc:creator>' +
    '<dcterms:created xsi:type="dcterms:W3CDTF">' + ts + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + ts + '</dcterms:modified></cp:coreProperties>'
}

const CONTENT_TYPES = XML_DECL + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
  '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
  '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
  '</Types>'

const ROOT_RELS = XML_DECL + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
  '</Relationships>'

const DOC_RELS = XML_DECL + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>' +
  '</Relationships>'

export const createDocxAction: ActionDefinition = {
  id: 'create_docx',
  aliases: ['new_docx', 'write_docx', 'save_docx', 'create_word_doc', 'generate_docx'],
  description: 'Generates a Word (.docx) file from Markdown-style content: # / ## / ### headings, - bullets, 1. numbered lists (2-space indent nests), **bold**, *italic*, [[pagebreak]]. Each other non-empty line is a paragraph.',
  parameters: {
    path: { type: 'string', required: true, description: 'Target file path (.docx added if missing)' },
    content: { type: 'string', required: true, description: 'Markdown-style document body' },
    title: { type: 'string', required: false, description: 'Optional title shown at top and stored in document properties' },
    author: { type: 'string', required: false, description: 'Document author property (default: Workbench)' },
    overwrite: { type: 'boolean', required: false, description: 'Replace an existing file (default: false)' },
    open: { type: 'boolean', required: false, description: 'Open the file after creation (default: true)' }
  },
  example: {
    action: 'create_docx',
    path: 'Notes/Chapter1-Summary.docx',
    title: 'Chapter 1 Summary',
    content: '# Key Ideas\n- First point with **bold** text\n- Second point\n  - Nested point\n\n## Steps\n1. Read the chapter\n2. Write the summary'
  },
  async execute(ctx: ActionContext, payload: any, targetPane = 'book'): Promise<ActionResult> {
    const params = payload.params || {}
    const rawPath: string = params.path || payload.path
    const content: string = String(params.content ?? payload.content ?? '')
    const title: string | undefined = params.title ?? payload.title
    const author: string = String(params.author ?? payload.author ?? 'Workbench')
    const overwrite = (params.overwrite ?? payload.overwrite) === true
    const open = (params.open ?? payload.open) !== false
    if (!rawPath) throw new Error('create_docx requires a "path"')
    const relPath = rawPath.toLowerCase().endsWith('.docx') ? rawPath : rawPath + '.docx'
    const targetPath = ctx.resolveSafePath(relPath, targetPane)
    if (fs.existsSync(targetPath) && !overwrite) {
      throw new Error(`File already exists: ${relPath}. Pass "overwrite": true to replace it.`)
    }
    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true })
    const { body, numberedLists } = buildBody(content, title)
    const docTitle = title || path.basename(targetPath, '.docx')
    const zip = buildZip([
      { name: '[Content_Types].xml', data: CONTENT_TYPES },
      { name: '_rels/.rels', data: ROOT_RELS },
      { name: 'docProps/core.xml', data: coreXml(docTitle, author) },
      { name: 'word/_rels/document.xml.rels', data: DOC_RELS },
      { name: 'word/document.xml', data: documentXml(body) },
      { name: 'word/styles.xml', data: stylesXml() },
      { name: 'word/numbering.xml', data: numberingXml(numberedLists) }
    ])
    await fs.promises.writeFile(targetPath, zip)
    ctx.notify(`📝 Created: ${path.basename(targetPath)}`)
    ctx.refreshExplorer(targetPane)
    if (open) ctx.openInTab(targetPath)
    return { success: true, action: 'create_docx', message: `Created ${relPath}`, createdPath: targetPath }
  }
}