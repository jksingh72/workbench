import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Save,
  ExternalLink,
  Eye,
  Edit3,
  Columns,
  Check,
  RotateCw,
  FolderOpen
} from 'lucide-react'
import { marked } from 'marked'
import TurndownService from 'turndown'

interface MarkdownEditorProps {
  filePath: string
  fileName: string
  initialContent?: string
  incomingClip?: string | null
  onClearIncomingClip?: () => void
  onSave?: (savedContent: string) => void
  onNotify: (msg: string) => void
  onOpenOutside?: () => void
  onShowInFolder?: () => void
}

const turndownService = new TurndownService({
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced'
})

export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  filePath,
  fileName,
  initialContent = '',
  incomingClip,
  onClearIncomingClip,
  onSave,
  onNotify,
  onOpenOutside,
  onShowInFolder
}) => {
  const [content, setContent] = useState<string>(initialContent)
  const [isDirty, setIsDirty] = useState<boolean>(false)
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [viewMode, setViewMode] = useState<'wysiwyg' | 'source' | 'split'>('wysiwyg')
  const [wordCount, setWordCount] = useState<number>(0)
  const [charCount, setCharCount] = useState<number>(0)

  const wysiwygRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isUpdatingFromSource = useRef<boolean>(false)

  // Synchronize on filePath or initialContent change (e.g. switching tabs or file reload)
  useEffect(() => {
    setContent(initialContent)
    setIsDirty(false)
    if (wysiwygRef.current && (viewMode === 'wysiwyg' || viewMode === 'split')) {
      try {
        const parsedHtml = marked.parse(initialContent || '') as string
        wysiwygRef.current.innerHTML = parsedHtml || '<p><br></p>'
      } catch (_) {}
    }
  }, [filePath, initialContent])

  // Compute word and character count
  useEffect(() => {
    const text = content.trim()
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0
    setWordCount(words)
    setCharCount(content.length)
  }, [content])

  // Initial render of HTML into WYSIWYG
  useEffect(() => {
    if (viewMode === 'wysiwyg' || viewMode === 'split') {
      if (wysiwygRef.current && !isUpdatingFromSource.current) {
        try {
          const parsedHtml = marked.parse(content || '') as string
          if (wysiwygRef.current.innerHTML !== parsedHtml) {
            wysiwygRef.current.innerHTML = parsedHtml || '<p><br></p>'
          }
        } catch (_) {}
      }
    }
  }, [viewMode])

  // Handle incoming clippings from Bookview or Chatview
  useEffect(() => {
    if (!incomingClip) return

    const isAlreadyFormatted =
      incomingClip.includes('> —') ||
      incomingClip.includes('### 📖') ||
      incomingClip.includes('### 💬') ||
      incomingClip.trim().startsWith('---')

    const clipBlock = isAlreadyFormatted
      ? (incomingClip.trim().startsWith('---') ? `\n\n${incomingClip.trim()}\n` : `\n\n---\n${incomingClip.trim()}\n`)
      : `\n\n---\n> **Quote clipped at ${new Date().toLocaleTimeString()}:**\n> "${incomingClip.replace(/\n/g, '\n> ')}"\n`

    const newContent = (content ? content.trimEnd() : '') + clipBlock
    setContent(newContent)
    setIsDirty(true)

    // Update WYSIWYG DOM
    if (wysiwygRef.current) {
      try {
        wysiwygRef.current.innerHTML = (marked.parse(newContent) as string) || '<p><br></p>'
      } catch (_) {}
    }

    onNotify(`📝 Inserted excerpt into ${fileName}`)
    onClearIncomingClip?.()
  }, [incomingClip])

  // Save handler
  const handleSave = useCallback(async () => {
    if (!window.electron?.writeFileContent) return
    setIsSaving(true)
    try {
      let contentToSave = content
      if (viewMode === 'wysiwyg' && wysiwygRef.current) {
        contentToSave = turndownService.turndown(wysiwygRef.current.innerHTML)
        setContent(contentToSave)
      }

      const res = await window.electron.writeFileContent(filePath, contentToSave)
      if (res.success) {
        setIsDirty(false)
        onSave?.(contentToSave)
        onNotify(`💾 Saved ${fileName}`)
      } else {
        onNotify(`⚠️ Failed to save: ${res.error}`)
      }
    } catch (err: any) {
      onNotify(`⚠️ Error saving file: ${err.message}`)
    } finally {
      setIsSaving(false)
    }
  }, [content, filePath, fileName, viewMode, onSave, onNotify])

  // Keyboard shortcut Ctrl+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave])

  // Content change from WYSIWYG
  const handleWysiwygInput = () => {
    if (!wysiwygRef.current) return
    isUpdatingFromSource.current = true
    try {
      const markdown = turndownService.turndown(wysiwygRef.current.innerHTML)
      setContent(markdown)
      setIsDirty(true)
    } catch (_) {}
    setTimeout(() => {
      isUpdatingFromSource.current = false
    }, 50)
  }

  // Formatting actions
  const executeFormat = (command: string) => {
    if (viewMode === 'source' && textareaRef.current) {
      const ta = textareaRef.current
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const sel = content.substring(start, end)
      let replacement = ''

      switch (command) {
        case 'bold':
          replacement = `**${sel || 'bold text'}**`
          break
        case 'italic':
          replacement = `*${sel || 'italic text'}*`
          break
        case 'strikethrough':
          replacement = `~~${sel || 'strikethrough'}~~`
          break
        case 'h1':
          replacement = `\n# ${sel || 'Heading 1'}\n`
          break
        case 'h2':
          replacement = `\n## ${sel || 'Heading 2'}\n`
          break
        case 'h3':
          replacement = `\n### ${sel || 'Heading 3'}\n`
          break
        case 'ul':
          replacement = `\n- ${sel || 'List item'}\n`
          break
        case 'ol':
          replacement = `\n1. ${sel || 'List item'}\n`
          break
        case 'quote':
          replacement = `\n> ${sel || 'Quote'}\n`
          break
        case 'code':
          replacement = sel.includes('\n') ? `\n\`\`\`\n${sel || 'code'}\n\`\`\`\n` : `\`${sel || 'code'}\``
          break
        default:
          return
      }

      const updated = content.substring(0, start) + replacement + content.substring(end)
      setContent(updated)
      setIsDirty(true)
      setTimeout(() => {
        ta.focus()
        ta.setSelectionRange(start + replacement.length, start + replacement.length)
      }, 10)
      return
    }

    if (wysiwygRef.current) {
      wysiwygRef.current.focus()
      switch (command) {
        case 'bold':
          document.execCommand('bold', false)
          break
        case 'italic':
          document.execCommand('italic', false)
          break
        case 'strikethrough':
          document.execCommand('strikeThrough', false)
          break
        case 'h1':
          document.execCommand('formatBlock', false, '<h1>')
          break
        case 'h2':
          document.execCommand('formatBlock', false, '<h2>')
          break
        case 'h3':
          document.execCommand('formatBlock', false, '<h3>')
          break
        case 'ul':
          document.execCommand('insertUnorderedList', false)
          break
        case 'ol':
          document.execCommand('insertOrderedList', false)
          break
        case 'quote':
          document.execCommand('formatBlock', false, '<blockquote>')
          break
        case 'code':
          document.execCommand('formatBlock', false, '<pre>')
          break
      }
      handleWysiwygInput()
    }
  }

  return (
    <div className="wb-doc-editor wb-markdown-editor">
      {/* Editor Sub-Header Toolbar */}
      <div className="wb-editor-toolbar">
        {/* Formatting Buttons */}
        <div className="wb-toolbar-group">
          <button
            className="wb-tool-btn"
            onClick={() => executeFormat('bold')}
            title="Bold (Ctrl+B)"
          >
            <Bold size={14} />
          </button>
          <button
            className="wb-tool-btn"
            onClick={() => executeFormat('italic')}
            title="Italic (Ctrl+I)"
          >
            <Italic size={14} />
          </button>
          <button
            className="wb-tool-btn"
            onClick={() => executeFormat('strikethrough')}
            title="Strikethrough"
          >
            <Strikethrough size={14} />
          </button>

          <div className="wb-toolbar-sep" />

          <button
            className="wb-tool-btn"
            onClick={() => executeFormat('h1')}
            title="Heading 1"
          >
            <Heading1 size={14} />
          </button>
          <button
            className="wb-tool-btn"
            onClick={() => executeFormat('h2')}
            title="Heading 2"
          >
            <Heading2 size={14} />
          </button>
          <button
            className="wb-tool-btn"
            onClick={() => executeFormat('h3')}
            title="Heading 3"
          >
            <Heading3 size={14} />
          </button>

          <div className="wb-toolbar-sep" />

          <button
            className="wb-tool-btn"
            onClick={() => executeFormat('ul')}
            title="Bulleted List"
          >
            <List size={14} />
          </button>
          <button
            className="wb-tool-btn"
            onClick={() => executeFormat('ol')}
            title="Numbered List"
          >
            <ListOrdered size={14} />
          </button>
          <button
            className="wb-tool-btn"
            onClick={() => executeFormat('quote')}
            title="Blockquote"
          >
            <Quote size={14} />
          </button>
          <button
            className="wb-tool-btn"
            onClick={() => executeFormat('code')}
            title="Code Block"
          >
            <Code size={14} />
          </button>
        </div>

        {/* View Mode Toggle & Save Options */}
        <div className="wb-toolbar-right">
          <div className="wb-viewmode-pill">
            <button
              className={`wb-pill-btn ${viewMode === 'wysiwyg' ? 'active' : ''}`}
              onClick={() => {
                if (viewMode === 'source' && wysiwygRef.current) {
                  try {
                    wysiwygRef.current.innerHTML = (marked.parse(content) as string) || '<p><br></p>'
                  } catch (_) {}
                }
                setViewMode('wysiwyg')
              }}
              title="WYSIWYG Visual Mode"
            >
              <Eye size={13} />
              <span>Visual</span>
            </button>
            <button
              className={`wb-pill-btn ${viewMode === 'source' ? 'active' : ''}`}
              onClick={() => {
                if (viewMode === 'wysiwyg' && wysiwygRef.current) {
                  const md = turndownService.turndown(wysiwygRef.current.innerHTML)
                  setContent(md)
                }
                setViewMode('source')
              }}
              title="Markdown Source Code"
            >
              <Edit3 size={13} />
              <span>Source</span>
            </button>
            <button
              className={`wb-pill-btn ${viewMode === 'split' ? 'active' : ''}`}
              onClick={() => {
                if (viewMode === 'wysiwyg' && wysiwygRef.current) {
                  const md = turndownService.turndown(wysiwygRef.current.innerHTML)
                  setContent(md)
                }
                setViewMode('split')
              }}
              title="Side-by-Side Split View"
            >
              <Columns size={13} />
              <span>Split</span>
            </button>
          </div>

          <div className="wb-toolbar-sep" />

          {/* Save Button */}
          <button
            className={`wb-save-btn ${isDirty ? 'dirty' : ''}`}
            onClick={handleSave}
            disabled={isSaving}
            title="Save Document (Ctrl+S)"
          >
            {isSaving ? (
              <RotateCw size={13} className="spin" />
            ) : isDirty ? (
              <Save size={13} />
            ) : (
              <Check size={13} />
            )}
            <span>{isDirty ? 'Save *' : 'Saved'}</span>
          </button>

          {/* Open Outside (System App) */}
          {onOpenOutside && (
            <button
              className="wb-tool-btn wb-external-btn"
              onClick={onOpenOutside}
              title="Open outside in System App (Notepad / VS Code)"
            >
              <ExternalLink size={14} />
              <span>Open Outside</span>
            </button>
          )}

          {/* Show in Explorer */}
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

      {/* Editor Body Area */}
      <div className="wb-editor-body">
        {/* WYSIWYG View */}
        {(viewMode === 'wysiwyg' || viewMode === 'split') && (
          <div
            className={`wb-wysiwyg-container ${viewMode === 'split' ? 'split-pane' : ''}`}
          >
            <div
              ref={wysiwygRef}
              className="wb-wysiwyg-content"
              contentEditable={true}
              onInput={handleWysiwygInput}
              spellCheck={true}
              data-placeholder="Start typing your notes, or clip text from Bookview..."
            />
          </div>
        )}

        {/* Source Textarea View */}
        {(viewMode === 'source' || viewMode === 'split') && (
          <div className={`wb-source-container ${viewMode === 'split' ? 'split-pane' : ''}`}>
            <textarea
              ref={textareaRef}
              className="wb-source-textarea"
              value={content}
              onChange={(e) => {
                setContent(e.target.value)
                setIsDirty(true)
                if (viewMode === 'split' && wysiwygRef.current) {
                  try {
                    wysiwygRef.current.innerHTML = (marked.parse(e.target.value) as string) || '<p><br></p>'
                  } catch (_) {}
                }
              }}
              placeholder="Type raw Markdown here (# Heading, - List, **Bold**)..."
              spellCheck={false}
            />
          </div>
        )}
      </div>

      {/* Footer Info Bar */}
      <div className="wb-editor-footer">
        <span className="wb-footer-item">
          <strong>{wordCount}</strong> words · <strong>{charCount}</strong> chars
        </span>
        <span className="wb-footer-item wb-footer-path" title={filePath}>
          {filePath}
        </span>
        <span className="wb-footer-status">
          {isDirty ? '● Unsaved changes (Ctrl+S)' : '✓ Up to date'}
        </span>
      </div>
    </div>
  )
}
