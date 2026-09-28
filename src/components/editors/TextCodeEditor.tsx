import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Save,
  RotateCw,
  ExternalLink,
  FolderOpen,
  Check,
  FileCode,
  Copy
} from 'lucide-react'

interface TextCodeEditorProps {
  filePath: string
  fileName: string
  initialContent?: string
  onSave?: (savedContent: string) => void
  onNotify: (msg: string) => void
  onOpenOutside?: () => void
  onShowInFolder?: () => void
}

export const TextCodeEditor: React.FC<TextCodeEditorProps> = ({
  filePath,
  fileName,
  initialContent = '',
  onSave,
  onNotify,
  onOpenOutside,
  onShowInFolder
}) => {
  const [content, setContent] = useState<string>(initialContent)
  const [isDirty, setIsDirty] = useState<boolean>(false)
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [lineCount, setLineCount] = useState<number>(1)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lineNumbersRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const lines = content.split('\n').length
    setLineCount(lines)
  }, [content])

  // Sync scrolling between line numbers and textarea
  const handleScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop
    }
  }

  // Handle Tab key
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = e.currentTarget
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const updated = content.substring(0, start) + '  ' + content.substring(end)
      setContent(updated)
      setIsDirty(true)
      setTimeout(() => {
        ta.selectionStart = ta.selectionEnd = start + 2
      }, 0)
    }
  }

  // Save handler
  const handleSave = useCallback(async () => {
    if (!window.electron?.writeFileContent) return
    setIsSaving(true)
    try {
      const res = await window.electron.writeFileContent(filePath, content)
      if (res.success) {
        setIsDirty(false)
        onSave?.(content)
        onNotify(`💾 Saved ${fileName}`)
      } else {
        onNotify(`⚠️ Save failed: ${res.error}`)
      }
    } catch (err: any) {
      onNotify(`⚠️ Error saving: ${err.message}`)
    } finally {
      setIsSaving(false)
    }
  }, [filePath, fileName, content, onSave, onNotify])

  // Global Ctrl+S
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [handleSave])

  return (
    <div className="wb-doc-editor wb-code-editor">
      {/* Top Toolbar */}
      <div className="wb-editor-toolbar">
        <div className="wb-toolbar-group">
          <span className="wb-doc-badge">
            <FileCode size={13} style={{ marginRight: '4px' }} />
            {fileName}
          </span>
          <button
            className="wb-tool-btn"
            onClick={() => {
              navigator.clipboard.writeText(content)
              onNotify('📋 Copied file contents to clipboard')
            }}
            title="Copy All Content"
          >
            <Copy size={13} />
            <span>Copy</span>
          </button>
        </div>

        <div className="wb-toolbar-right">
          <button
            className={`wb-save-btn ${isDirty ? 'dirty' : ''}`}
            onClick={handleSave}
            disabled={isSaving}
            title="Save File (Ctrl+S)"
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

          {onOpenOutside && (
            <button
              className="wb-tool-btn wb-external-btn"
              onClick={onOpenOutside}
              title="Open outside in System Editor"
            >
              <ExternalLink size={14} />
              <span>Open Outside</span>
            </button>
          )}

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

      {/* Code Editor Body */}
      <div className="wb-code-body">
        <div className="wb-line-numbers" ref={lineNumbersRef}>
          {Array.from({ length: lineCount }).map((_, i) => (
            <div key={i} className="wb-line-num">
              {i + 1}
            </div>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          className="wb-code-textarea"
          value={content}
          onChange={(e) => {
            setContent(e.target.value)
            setIsDirty(true)
          }}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          spellCheck={false}
        />
      </div>

      {/* Code Status Footer */}
      <div className="wb-editor-footer">
        <span className="wb-footer-item">
          <strong>{lineCount}</strong> lines · <strong>{content.length}</strong> chars
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
