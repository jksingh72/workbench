import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Formats an ActionResult into an observation payload suitable for AI consumption.
 * If any content/stdout/result body exceeds 90,000 characters, spills full content to os.tmpdir()
 * and provides a 12,000-character preview.
 */
export function formatActionFeedback(payload: any, result: any): string {
  const actionType = (payload.action || payload.type || result.action || 'action').toLowerCase()

  if (
    result.message &&
    (result.message.includes('Ignored documentation schema template') ||
      result.message.includes('Duplicate action suppressed'))
  ) {
    return ''
  }

  const handleLargeText = (text: string, label: string): string => {
    const MAX_LEN = 90000
    if (!text) return ''
    if (text.length <= MAX_LEN) {
      return `\n${label}:\n\`\`\`\n${text}\n\`\`\``
    }
    const timestamp = Date.now()
    const rand = Math.random().toString(36).substring(2, 6)
    const spillFile = path.join(os.tmpdir(), `wb_result_${timestamp}_${rand}.txt`)
    const preview = text.slice(0, 12000)
    try {
      fs.writeFileSync(spillFile, text, 'utf-8')
      return `\n${label} (Showing first 12,000 of ${text.length.toLocaleString()} characters):\n\`\`\`\n${preview}\n\`\`\`\n[Output was ${text.length.toLocaleString()} characters; full payload saved to: ${spillFile}. Use read_pages or search_text to query specific sections if needed.]`
    } catch (err: any) {
      return `\n${label} (Showing first 12,000 of ${text.length.toLocaleString()} characters):\n\`\`\`\n${preview}\n\`\`\`\n[Output was ${text.length.toLocaleString()} characters; failed to save spill file: ${err?.message || err}]`
    }
  }

  let body = ''
  if (result.success) {
    body = `[Workbench Action Result: ✅ ${result.message}]`
  } else {
    body = `[Workbench Action Result: ❌ Action "${actionType}" failed: ${result.error || result.message}]`
  }

  if (result.createdPath) {
    body += `\nTarget: ${result.createdPath}`
  }

  if (
    (result.details?.folderCount !== undefined || result.details?.fileCount !== undefined) &&
    !result.message?.includes('Directory Listing')
  ) {
    const folders = result.details.folders || []
    const files = result.details.files || []
    const MAX_FILES = 80
    const MAX_FOLDERS = 40
    const shownFolders =
      folders.slice(0, MAX_FOLDERS).join(', ') +
      (folders.length > MAX_FOLDERS ? ` ... (+${folders.length - MAX_FOLDERS} more)` : '')
    const shownFiles =
      files.slice(0, MAX_FILES).join(', ') +
      (files.length > MAX_FILES ? ` ... (+${files.length - MAX_FILES} more)` : '')
    body += `\nContents:\n`
    body += `- Folders (${folders.length}): ${shownFolders || 'none'}\n`
    body += `- Files (${files.length}): ${shownFiles || 'none'}`
  }

  // Batch execution: format each step once and include any step-level output
  if (Array.isArray(result.details?.results)) {
    for (const step of result.details.results) {
      const stepLabel = step.step || '1/1'
      if (step.details?.content) {
        body += handleLargeText(String(step.details.content), `Step ${stepLabel} Content`)
      }
      if (step.details?.stdout) {
        body += handleLargeText(String(step.details.stdout), `Step ${stepLabel} Output`)
      }
      if (Array.isArray(step.details?.matches) && step.details.matches.length > 0) {
        let matchText = `Found ${step.details.matches.length} match(es):`
        for (const m of step.details.matches.slice(0, 20)) {
          const loc = m.page ? `Page ${m.page}, Line ${m.line}` : `Line ${m.line}`
          matchText += `\n- [${m.file}:${loc}] ${m.text || m.match}`
        }
        if (step.details.matches.length > 20) {
          matchText += `\n... (+${step.details.matches.length - 20} more matches)`
        }
        body += handleLargeText(matchText, `Step ${stepLabel} Matches`)
      } else if (
        step.message &&
        step.message.includes('\n') &&
        !step.details?.content &&
        !step.details?.stdout
      ) {
        body += handleLargeText(step.message, `Step ${stepLabel} Details`)
      }
    }
  } else {
    // Extracted RFP files
    if (Array.isArray(result.details?.extractedFiles)) {
      body += `\nExtracted Files (${result.details.extractedFiles.length}):`
      for (const ef of result.details.extractedFiles.slice(0, 30)) {
        body += `\n- ${ef.originalFile} (${ef.pageCount || 1} pages${ef.isScanned ? ', ⚠️ SCANNED/NO OCR' : ''}) -> ${ef.extractedTextFile}`
      }
      if (result.details.extractedFiles.length > 30) {
        body += `\n... (+${result.details.extractedFiles.length - 30} more)`
      }
    }

    // Search matches
    if (Array.isArray(result.details?.matches)) {
      body += `\nMatches (${result.details.matches.length} found):`
      for (const m of result.details.matches.slice(0, 20)) {
        const loc = m.page ? `Page ${m.page}, Line ${m.line}` : `Line ${m.line}`
        body += `\n- [${m.file}:${loc}] ${m.text || m.match}`
      }
      if (result.details.matches.length > 20) {
        body += `\n... (+${result.details.matches.length - 20} more matches)`
      }
    }

    if (result.details?.content) {
      body += handleLargeText(String(result.details.content), 'File Content')
    }

    if (result.details?.stdout) {
      body += handleLargeText(String(result.details.stdout), 'Script Output')
    }
  }

  if (!result.success && !result.details?.results?.length) {
    body += `\nPlease inspect this error, adjust parameters or file paths, and proceed.`
  }

  // Safety check on final body size (raised to 100,000 characters)
  if (body.length > 100000) {
    const timestamp = Date.now()
    const rand = Math.random().toString(36).substring(2, 6)
    const spillFile = path.join(os.tmpdir(), `wb_result_full_${timestamp}_${rand}.txt`)
    try {
      fs.writeFileSync(spillFile, body, 'utf-8')
      const preview = body.slice(0, 12000)
      body = `${preview}\n\n... [Action result text was ${body.length.toLocaleString()} characters; full payload saved to: ${spillFile}. Use read_pages or search_text to query specific sections if needed.]`
    } catch (_) {}
  }

  return body
}
