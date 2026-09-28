import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Save,
  ExternalLink,
  FolderOpen,
  RotateCw,
  Check,
  FileText
} from 'lucide-react'

interface WordEditorProps {
  filePath: string
  fileName: string
  onNotify: (msg: string) => void
  onOpenOutside?: () => void
  onShowInFolder?: () => void
}

export const WordEditor: React.FC<WordEditorProps> = ({
  filePath,
  fileName,
  onNotify,
  onOpenOutside,
  onShowInFolder
}) => {
  const [htmlContent, setHtmlContent] = useState<string>('')
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [isDirty, setIsDirty] = useState<boolean>(false)
  const [wordCount, setWordCount] = useState<number>(0)
  const [charCount, setCharCount] = useState<number>(0)

  const editorRef = useRef<HTMLDivElement>(null)

  // Compute word and char counts from HTML/text
  const updateCounts = (text: string) => {
    const trimmed = text.trim()
    const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0
    setWordCount(words)
    setCharCount(trimmed.length)
  }

  // Load DOCX document
  useEffect(() => {
    let isMounted = true
    const loadDocx = async () => {
      setIsLoading(true)
      try {
        if (window.electron?.readDocx) {
          const res = await window.electron.readDocx(filePath)
          if (res.success && isMounted) {
            const docHtml = res.html || '<p><br></p>'
            setHtmlContent(docHtml)
            if (editorRef.current) {
              editorRef.current.innerHTML = docHtml
              updateCounts(editorRef.current.innerText || '')
            }
            setIsDirty(false)
          } else if (res.error) {
            onNotify(`⚠️ Could not read Word document: ${res.error}`)
          }
        }
      } catch (err: any) {
        onNotify(`⚠️ Error loading Word document: ${err.message}`)
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    loadDocx()
    return () => {
      isMounted = false
    }
  }, [filePath])

  // Synchronize HTML into contentEditable whenever htmlContent changes or loading completes
  useEffect(() => {
    if (editorRef.current && !isLoading) {
      if (editorRef.current.innerHTML !== htmlContent) {
        editorRef.current.innerHTML = htmlContent || '<p><br></p>'
      }
      updateCounts(editorRef.current.innerText || '')
    }
  }, [htmlContent, isLoading])

  // Handle edit input
  const handleInput = () => {
    if (!editorRef.current) return
    const currentHtml = editorRef.current.innerHTML
    setHtmlContent(currentHtml)
    setIsDirty(true)
    updateCounts(editorRef.current.innerText || '')
  }

  // Save document
  const handleSave = useCallback(async () => {
    if (!window.electron?.saveDocx || !editorRef.current) return
    setIsSaving(true)
    try {
      const currentHtml = editorRef.current.innerHTML
      const currentText = editorRef.current.innerText
      const res = await window.electron.saveDocx({
        filePath,
        html: currentHtml,
        text: currentText
      })
      if (res.success) {
        setIsDirty(false)
        onNotify(`💾 Saved Word document ${fileName}`)
      } else {
        onNotify(`⚠️ Failed to save Word document: ${res.error}`)
      }
    } catch (err: any) {
      onNotify(`⚠️ Error saving Word document: ${err.message}`)
    } finally {
      setIsSaving(false)
    }
  }, [filePath, fileName, onNotify])

  // Format actions via standard document.execCommand
  const executeFormat = (cmd: string, val: string = '') => {
    if (!editorRef.current) return
    editorRef.current.focus()
    document.execCommand(cmd, false, val)
    handleInput()
  }

  // Keyboard shortcut listener (Ctrl+S, Ctrl+B, Ctrl+I, Ctrl+U)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase()
        if (key === 's') {
          e.preventDefault()
          handleSave()
        } else if (key === 'b') {
          e.preventDefault()
          executeFormat('bold')
        } else if (key === 'i') {
          e.preventDefault()
          executeFormat('italic')
        } else if (key === 'u') {
          e.preventDefault()
          executeFormat('underline')
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave])

  return (
    <div className="wb-doc-editor wb-word-editor">
      {/* Top Word Ribbon Toolbar */}
      <div className="wb-editor-toolbar wb-word-ribbon">
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
            onClick={() => executeFormat('underline')}
            title="Underline (Ctrl+U)"
          >
            <Underline size={14} />
          </button>
          <button
            className="wb-tool-btn"
            onClick={() => executeFormat('strikeThrough')}
            title="Strikethrough"
          >
            <Strikethrough size={14} />
          </button>

          <div className="wb-toolbar-sep" />

          <button
            className="wb-tool-btn"
            onClick={() => executeFormat('formatBlock', '<h1>')}
            title="Heading 1"
          >
            <Heading1 size={14} />
          </button>
          <button
            className="wb-tool-btn"
            onClick={() => executeFormat('formatBlock', '<h2>')}
            title="Heading 2"
          >
            <Heading2 size={14} />
          </button>
          <button
            className="wb-tool-btn"
            onClick={() => executeFormat('formatBlock', '<h3>')}
            title="Heading 3"
          >
            <Heading3 size={14} />
          </button>

          <div className="wb-toolbar-sep" />

          <button
            className="wb-tool-btn"
            onClick={() => executeFormat('justifyLeft')}
            title="Align Left"
          >
            <AlignLeft size={14} />
          </button>
          <button
            className="wb-tool-btn"
            onClick={() => executeFormat('justifyCenter')}
            title="Align Center"
          >
            <AlignCenter size={14} />
          </button>
          <button
            className="wb-tool-btn"
            onClick={() => executeFormat('justifyRight')}
            title="Align Right"
          >
            <AlignRight size={14} />
          </button>

          <div className="wb-toolbar-sep" />

          <button
            className="wb-tool-btn"
            onClick={() => executeFormat('insertUnorderedList')}
            title="Bullet List"
          >
            <List size={14} />
          </button>
          <button
            className="wb-tool-btn"
            onClick={() => executeFormat('insertOrderedList')}
            title="Numbered List"
          >
            <ListOrdered size={14} />
          </button>
        </div>

        <div className="wb-toolbar-right">
          {/* Save Button */}
          <button
            className={`wb-save-btn ${isDirty ? 'dirty' : ''}`}
            onClick={handleSave}
            disabled={isSaving}
            title="Save Word Document (Ctrl+S)"
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

          {/* Open Outside in MS Word */}
          {onOpenOutside && (
            <button
              className="wb-tool-btn wb-word-external-btn"
              onClick={onOpenOutside}
              title="Open outside in Microsoft Word"
            >
              <ExternalLink size={14} />
              <span>Open in Word</span>
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

      {/* Word Page Document Canvas */}
      <div
        className="wb-word-canvas-wrapper"
        onClick={(e) => {
          if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('wb-word-page')) {
            editorRef.current?.focus()
          }
        }}
      >
        {isLoading && (
          <div className="wb-word-loading-overlay">
            <RotateCw size={24} className="spin text-cyan" />
            <span>Loading Word document...</span>
          </div>
        )}

        <div className="wb-word-page">
          <div
            ref={editorRef}
            className="wb-word-content"
            contentEditable={!isLoading}
            onInput={handleInput}
            spellCheck={true}
            data-placeholder="Start typing your Word document..."
          />
        </div>
      </div>

      {/* Word Status Bar */}
      <div className="wb-editor-footer">
        <span className="wb-footer-item">
          <FileText size={12} style={{ marginRight: '4px' }} />
          <strong>{wordCount}</strong> words · <strong>{charCount}</strong> chars · Microsoft Word (.docx)
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
