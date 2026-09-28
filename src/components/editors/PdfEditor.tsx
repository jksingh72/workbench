import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  FileText,
  ExternalLink,
  FolderOpen,
  Save,
  Check,
  RotateCw,
  Copy,
  Columns,
  Eye,
  Edit3,
  BookOpen,
  Sparkles,
  Zap
} from 'lucide-react'

interface PdfEditorProps {
  filePath: string
  fileName: string
  onNotify: (msg: string) => void
  onOpenOutside?: () => void
  onShowInFolder?: () => void
}

export const PdfEditor: React.FC<PdfEditorProps> = ({
  filePath,
  fileName,
  onNotify,
  onOpenOutside,
  onShowInFolder
}) => {
  // Visual URL is instant and never blocked
  const cleanPath = filePath.replace(/\\/g, '/').replace(/^\/+/, '')
  const pdfUrl = encodeURI(`local-file:///${cleanPath}`)

  const [pageCount, setPageCount] = useState<number | null>(null)
  const [isExtracting, setIsExtracting] = useState<boolean>(true)
  const [isExtractingAll, setIsExtractingAll] = useState<boolean>(false)
  const [isTruncated, setIsTruncated] = useState<boolean>(false)
  const [viewMode, setViewMode] = useState<'visual' | 'notes' | 'split'>('visual')
  
  // Editable text & annotations
  const [notesContent, setNotesContent] = useState<string>('')
  const [isDirty, setIsDirty] = useState<boolean>(false)
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [wordCount, setWordCount] = useState<number>(0)
  const [charCount, setCharCount] = useState<number>(0)
  
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const companionPath = `${filePath}.notes.md`
  const hasUserEdited = useRef<boolean>(false)

  // Fast background text & companion notes loader (non-blocking)
  useEffect(() => {
    let isMounted = true
    hasUserEdited.current = false

    const loadNotesAndText = async () => {
      try {
        // 1. Immediately check for existing companion notes file (<fileName>.notes.md)
        let loadedNotes = ''
        if (window.electron?.readFileContent) {
          const companionRes = await window.electron.readFileContent(companionPath)
          if (companionRes.success && companionRes.content !== undefined) {
            loadedNotes = companionRes.content
          }
        }

        if (loadedNotes.trim()) {
          if (isMounted) {
            setNotesContent(loadedNotes)
            setIsDirty(false)
            setIsExtracting(false)
          }
          return
        }

        // When in Visual Viewer mode, do NOT run CPU-intensive text extraction!
        // The visual viewer streams the PDF directly via Chromium in milliseconds.
        if (viewMode === 'visual') {
          if (isMounted) setIsExtracting(false)
          return
        }

        // 2. Fetch fast initial preview of PDF only when user switches to notes or split mode
        if (window.electron?.readPdf) {
          setIsExtracting(true)
          const res = await window.electron.readPdf({ filePath, maxPages: 5 })
          if (!isMounted) return

          if (res.success) {
            if (res.pageCount) setPageCount(res.pageCount)
            setIsTruncated(!!res.truncated)

            // If user has not written custom notes and no companion file existed, populate extracted text
            if (!loadedNotes.trim() && !hasUserEdited.current) {
              const header = `# Notes & Highlights: ${fileName}\n\n*Extracted from PDF (${res.pageCount ? res.pageCount + ' pages' : 'Document'})*\n\n---\n\n`
              const initialBody = res.text?.trim()
                ? res.text
                : '*(No text extracted or document is image-based. You can write your custom notes and annotations here.)*'
              setNotesContent(header + initialBody)
              setIsDirty(false)
            }
          }
        }
      } catch (err: any) {
        console.warn('[PdfEditor] Background extraction error:', err?.message)
      } finally {
        if (isMounted) setIsExtracting(false)
      }
    }

    loadNotesAndText()
    return () => {
      isMounted = false
    }
  }, [filePath, fileName, companionPath, viewMode])

  // Extract all pages on demand for massive documents
  const handleExtractAllPages = async () => {
    if (!window.electron?.readPdf) return
    setIsExtractingAll(true)
    onNotify(`⚡ Extracting all pages for ${fileName}...`)
    try {
      const res = await window.electron.readPdf({ filePath, maxPages: 0 })
      if (res.success && res.text) {
        const fullHeader = `# Full Notes & Text: ${fileName}\n\n*Extracted all ${res.pageCount || ''} pages*\n\n---\n\n`
        setNotesContent(fullHeader + res.text)
        setIsTruncated(false)
        setIsDirty(true)
        onNotify(`✨ Extracted full text (${res.pageCount || ''} pages)`)
      } else {
        onNotify(`⚠️ Failed to extract full text: ${res.error}`)
      }
    } catch (err: any) {
      onNotify(`⚠️ Error: ${err.message}`)
    } finally {
      setIsExtractingAll(false)
    }
  }

  // Word and character count calculation
  useEffect(() => {
    const trimmed = notesContent.trim()
    const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0
    setWordCount(words)
    setCharCount(notesContent.length)
  }, [notesContent])

  // Save companion notes / annotations
  const handleSaveNotes = useCallback(async () => {
    if (!window.electron?.writeFileContent) return
    setIsSaving(true)
    try {
      const res = await window.electron.writeFileContent(companionPath, notesContent)
      if (res.success) {
        setIsDirty(false)
        onNotify(`💾 Saved PDF notes to ${fileName}.notes.md`)
      } else {
        onNotify(`⚠️ Save failed: ${res.error}`)
      }
    } catch (err: any) {
      onNotify(`⚠️ Error saving notes: ${err.message}`)
    } finally {
      setIsSaving(false)
    }
  }, [companionPath, notesContent, fileName, onNotify])

  // Ctrl+S shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        handleSaveNotes()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSaveNotes])

  // Copy text to clipboard
  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(notesContent)
      onNotify(`📋 Copied text & notes to clipboard`)
    } catch (_) {
      onNotify(`⚠️ Could not copy to clipboard`)
    }
  }

  // Insert markdown snippet at cursor
  const insertSnippet = (prefix: string, suffix: string = '') => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = notesContent.substring(start, end)
    const replacement = `${prefix}${selected || 'text'}${suffix}`
    const updated = notesContent.substring(0, start) + replacement + notesContent.substring(end)
    setNotesContent(updated)
    setIsDirty(true)
    hasUserEdited.current = true
    setTimeout(() => {
      ta.focus()
      ta.selectionStart = start + prefix.length
      ta.selectionEnd = start + prefix.length + (selected ? selected.length : 4)
    }, 10)
  }

  // Add annotation template
  const handleAddAnnotation = () => {
    if (viewMode === 'visual') {
      setViewMode('split')
    }
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const template = `\n\n### 📌 Annotation (${timestamp})\n> **Key takeaway:** \n\n- Action Item: \n`
    setNotesContent((prev) => prev + template)
    setIsDirty(true)
    hasUserEdited.current = true
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.scrollTop = textareaRef.current.scrollHeight
        textareaRef.current.focus()
      }
    }, 20)
    onNotify('✨ Added annotation section')
  }

  return (
    <div className="wb-doc-editor wb-pdf-editor">
      {/* PDF Main Toolbar */}
      <div className="wb-editor-toolbar">
        <div className="wb-toolbar-group">
          <span className="wb-doc-badge badge-pdf-tag">
            <BookOpen size={13} style={{ marginRight: '5px' }} />
            PDF {pageCount ? `(${pageCount} pgs)` : ''}
          </span>

          {/* View Mode Switcher: Default Viewer mode, with Notes and Split available */}
          <div className="wb-view-mode-group">
            <button
              className={`wb-mode-btn ${viewMode === 'visual' ? 'active' : ''}`}
              onClick={() => setViewMode('visual')}
              title="Viewer: Clean, full visual PDF viewer"
            >
              <Eye size={13} />
              <span>Viewer</span>
            </button>
            <button
              className={`wb-mode-btn ${viewMode === 'notes' ? 'active' : ''}`}
              onClick={() => setViewMode('notes')}
              title="Notes: Companion notes & extracted text"
            >
              <Edit3 size={13} />
              <span>Notes</span>
            </button>
            <button
              className={`wb-mode-btn ${viewMode === 'split' ? 'active' : ''}`}
              onClick={() => setViewMode('split')}
              title="Split View: Visual PDF on left, editable notes on right"
            >
              <Columns size={13} />
              <span>Split</span>
            </button>
          </div>
        </div>

        {/* Right Toolbar Actions */}
        <div className="wb-toolbar-right">
          {/* Add Annotation Button */}
          <button
            className="wb-tool-btn"
            onClick={handleAddAnnotation}
            title="Insert new annotation section"
          >
            <Sparkles size={13} className="text-cyan" />
            <span>Annotate</span>
          </button>

          {/* Copy Text */}
          <button
            className="wb-tool-btn"
            onClick={handleCopyText}
            title="Copy extracted text & notes to clipboard"
          >
            <Copy size={13} />
            <span>Copy</span>
          </button>

          {/* Save Notes Button */}
          <button
            className={`wb-save-btn ${isDirty ? 'dirty' : ''}`}
            onClick={handleSaveNotes}
            disabled={isSaving}
            title="Save notes and annotations (Ctrl+S)"
          >
            {isSaving ? (
              <RotateCw size={13} className="spin" />
            ) : isDirty ? (
              <Save size={13} />
            ) : (
              <Check size={13} />
            )}
            <span>{isDirty ? 'Save Notes *' : 'Notes Saved'}</span>
          </button>

          {/* Open in external PDF reader */}
          {onOpenOutside && (
            <button
              className="wb-tool-btn"
              onClick={onOpenOutside}
              title="Open in System Default PDF Reader (Adobe Acrobat, Edge, etc.)"
            >
              <ExternalLink size={14} />
              <span>Open in Reader</span>
            </button>
          )}

          {/* Show in folder */}
          {onShowInFolder && (
            <button
              className="wb-tool-btn"
              onClick={onShowInFolder}
              title="Show in File Explorer"
            >
              <FolderOpen size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Main Workspace Area (Split or Single) */}
      <div className={`wb-pdf-main-area mode-${viewMode}`}>
        {/* Left Side: Visual Interactive PDF Viewer (Instant Native Streaming) */}
        {(viewMode === 'split' || viewMode === 'visual') && (
          <div className="wb-pdf-visual-pane">
            <embed
              src={pdfUrl}
              type="application/pdf"
              className="wb-pdf-embed-element"
              width="100%"
              height="100%"
            />
          </div>
        )}

        {/* Right Side: Editable Notes & Extracted Text */}
        {(viewMode === 'split' || viewMode === 'notes') && (
          <div className="wb-pdf-notes-pane">
            {/* Notes Sub-Toolbar */}
            <div className="wb-notes-mini-toolbar">
              <span className="wb-notes-title">
                <FileText size={13} className="text-cyan" />
                <span>Companion Notes</span>
                {isExtracting && (
                  <span className="wb-extract-status">
                    <RotateCw size={10} className="spin" style={{ marginLeft: '4px' }} />
                    <span style={{ fontSize: '10.5px', color: '#64748b' }}>loading preview...</span>
                  </span>
                )}
              </span>

              <div className="wb-mini-format-group">
                {isTruncated && (
                  <button
                    className="wb-mini-extract-all-btn"
                    onClick={handleExtractAllPages}
                    disabled={isExtractingAll}
                    title="Extract all pages of this document"
                  >
                    {isExtractingAll ? (
                      <RotateCw size={11} className="spin" />
                    ) : (
                      <Zap size={11} className="text-amber" />
                    )}
                    <span>Extract All Pages</span>
                  </button>
                )}

                <button
                  className="wb-mini-btn"
                  onClick={() => insertSnippet('**', '**')}
                  title="Bold (**text**)"
                >
                  B
                </button>
                <button
                  className="wb-mini-btn"
                  onClick={() => insertSnippet('*', '*')}
                  title="Italic (*text*)"
                  style={{ fontStyle: 'italic' }}
                >
                  I
                </button>
                <button
                  className="wb-mini-btn"
                  onClick={() => insertSnippet('\n## ', '\n')}
                  title="Heading 2 (## Heading)"
                >
                  H2
                </button>
                <button
                  className="wb-mini-btn"
                  onClick={() => insertSnippet('\n- ', '\n')}
                  title="Bullet list (- Item)"
                >
                  •
                </button>
                <button
                  className="wb-mini-btn"
                  onClick={() => insertSnippet('\n> ', '\n')}
                  title="Quote block (> Quote)"
                >
                  "
                </button>
                <button
                  className="wb-mini-btn"
                  onClick={() => insertSnippet('`', '`')}
                  title="Inline code (`code`)"
                >
                  &lt;&gt;
                </button>
              </div>
            </div>

            {/* Editable Textarea */}
            <div className="wb-notes-textarea-container">
              <textarea
                ref={textareaRef}
                className="wb-notes-textarea"
                value={notesContent}
                onChange={(e) => {
                  setNotesContent(e.target.value)
                  setIsDirty(true)
                  hasUserEdited.current = true
                }}
                placeholder={isExtracting ? 'Loading document notes...' : 'Write your notes, excerpts, takeaways, and annotations here...'}
                spellCheck={false}
              />
            </div>

            {/* Notes Status Bar */}
            <div className="wb-editor-status-bar">
              <span className="wb-status-item">{wordCount} words</span>
              <span className="wb-status-item">{charCount} characters</span>
              <span className="wb-status-item text-muted">
                {isTruncated ? 'Preview (first 30 pgs)' : 'All text'}
              </span>
              <span className="wb-status-item">
                {isDirty ? (
                  <span className="wb-status-dirty">● Unsaved edits</span>
                ) : (
                  <span className="wb-status-saved">✓ Saved to disk</span>
                )}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
