import fs from 'node:fs'
import path from 'node:path'
import { ActionDefinition, ActionContext, ActionResult } from './types'

const MAX_INPUT_CHARS = 60000
const MAX_FALLBACK_CHARS = 20000
const MAX_LINES = 15
const DEFAULT_MODEL = 'claude-sonnet-5-5'

async function loadModule(name: string): Promise<any> {
  try {
    return await import(/* @vite-ignore */ name)
  } catch {
    throw new Error(`Missing dependency '${name}'. Install it with: npm install ${name}`)
  }
}

async function readPdf(filePath: string, maxPages = 15): Promise<string> {
  const mod: any = await loadModule('pdf-parse')
  const buffer = await fs.promises.readFile(filePath)
  const PDFParse = mod.PDFParse || mod.default?.PDFParse
  if (PDFParse) {
    const parser = new PDFParse({ data: buffer })
    try {
      const result = await parser.getText(maxPages > 0 ? { first: maxPages } : {})
      return result.text || ''
    } finally {
      if (typeof parser.destroy === 'function') await parser.destroy()
    }
  }
  const fn = typeof mod === 'function' ? mod : mod.default
  if (typeof fn !== 'function') throw new Error('Unsupported pdf-parse version installed')
  const result = await fn(buffer, maxPages > 0 ? { max: maxPages } : {})
  return result.text || ''
}

async function readDocx(filePath: string): Promise<string> {
  const mod: any = await loadModule('mammoth')
  const mammoth = mod.extractRawText ? mod : mod.default
  const result = await mammoth.extractRawText({ path: filePath })
  return result.value || ''
}

async function extractText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.txt':
    case '.md':
    case '.markdown':
      return fs.promises.readFile(filePath, 'utf8')
    case '.docx':
      return readDocx(filePath)
    case '.pdf':
      return readPdf(filePath)
    case '.doc':
      throw new Error('Legacy .doc files are not supported. Save as .docx and retry.')
    default:
      throw new Error(`Unsupported file type '${ext}'. Supported: .docx, .pdf, .txt, .md`)
  }
}

function buildPrompt(fileName: string, text: string, truncated: boolean): string {
  const lines: string[] = [`Summarize the document '${fileName}'.`]
  if (truncated) lines.push('The document was truncated; summarize only the portion provided and say so.')
  lines.push(
    'Respond in plain text, 15 lines maximum in total, in exactly this format:',
    'CONTEXT:',
    '- 2 to 3 lines: document type, author or audience, purpose, and time frame if stated.',
    'SUMMARY:',
    '- Up to 10 lines: key points, decisions, figures, and action items.',
    'Use only what the document states. Do not invent details. If something is unclear, say so.',
    '',
    '<document>',
    text,
    '</document>'
  )
  return lines.join('\n')
}

function clampLines(text: string): string {
  return text.split(/\r?\n/).filter(l => l.trim() !== '').slice(0, MAX_LINES).join('\n')
}

async function summarizeWithClaude(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: process.env.SUMMARIZE_MODEL || DEFAULT_MODEL,
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }]
    })
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`Claude API error ${res.status}: ${detail.slice(0, 300)}`)
  }
  const data: any = await res.json()
  return (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')
}

export const summarizeFileAction: ActionDefinition = {
  id: 'summarize_file',
  aliases: ['summarize', 'summarise_file', 'file_summary', 'summarize_document'],
  description: 'Reads a .docx, .pdf, .txt or .md file from a given folder and file name, and returns its context plus a summary of 15 lines or fewer.',
  parameters: {
    folder: { type: 'string', required: false, description: 'Full folder location of the file' },
    file: { type: 'string', required: false, description: 'File name, e.g. JD.pdf' },
    path: { type: 'string', required: false, description: 'Full file path (alternative to folder + file)' }
  },
  example: { action: 'summarize_file', folder: 'D:\\Docs\\Cognizant', file: 'JD.pdf' },
  async execute(ctx: ActionContext, payload: any, targetPane = 'book'): Promise<ActionResult> {
    const params = payload.params || {}
    const folder = params.folder || payload.folder
    const file = params.file || payload.file
    const full = params.path || payload.path || (folder && file ? path.join(folder, file) : '')
    if (!full) throw new Error('Provide folder + file, or a full path')
    const filePath = path.isAbsolute(full) ? path.normalize(full) : ctx.resolveSafePath(full, targetPane)
    if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`)
    const fileName = path.basename(filePath)

    // SMART AUTO-ATTACHMENT: For chat-based AI, attach the document natively!
    // This allows the AI model (ChatGPT, Claude, Gemini) to natively inspect the entire document
    // regardless of size (e.g. 1000-page manuals) without freezing Node or hitting text token limits.
    if (typeof ctx.attachToChat === 'function') {
      ctx.notify(`📎 Attaching "${fileName}" to chat for native summarization...`)
      const attachRes = await ctx.attachToChat(
        filePath,
        `Please summarize this document ('${fileName}'): provide context, key points, and action items.`
      )
      if (attachRes.success) {
        return {
          success: true,
          action: 'summarize_file',
          createdPath: filePath,
          message: `Attached "${fileName}" directly to the chat session. The AI can now process and summarize the entire document natively.`,
          details: {
            fileName,
            filePath,
            method: 'native_attachment',
          },
        }
      }
    }

    const raw = (await extractText(filePath)).trim()
    if (!raw) throw new Error('No text found. The file may be empty or a scanned PDF without an OCR layer.')

    const truncated = raw.length > MAX_INPUT_CHARS
    const text = truncated ? raw.slice(0, MAX_INPUT_CHARS) : raw
    const apiKey = process.env.ANTHROPIC_API_KEY

    if (!apiKey) {
      ctx.notify(`📄 Extracted ${fileName} (no API key; summary in chat)`)
      const excerpt = raw.slice(0, MAX_FALLBACK_CHARS)
      const note = raw.length > MAX_FALLBACK_CHARS ? ', truncated' : ''
      return {
        success: true,
        action: 'summarize_file',
        message: `ANTHROPIC_API_KEY not set. Extracted text of ${fileName} returned for summarization in chat (CONTEXT + SUMMARY, max 15 lines${note}):\n\n${excerpt}`
      }
    }

    ctx.notify(`🧠 Summarizing ${fileName}...`)
    const summary = clampLines(await summarizeWithClaude(buildPrompt(fileName, text, truncated), apiKey))
    ctx.notify(`✅ Summarized ${fileName}`)
    return { success: true, action: 'summarize_file', message: `Summary of ${fileName}:\n${summary}` }
  }
}
