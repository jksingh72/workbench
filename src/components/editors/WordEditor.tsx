import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Eye,
  Edit3,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Printer,
  Columns,
  Rows,
  Save,
  Check,
  RotateCw,
  ExternalLink,
  FolderOpen,
  FileText,
  AlertTriangle,
  Undo,
  Redo,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Quote,
  Table as TableIcon,
} from 'lucide-react'
import { renderAsync } from 'docx-preview'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Underline } from '@tiptap/extension-underline'
import { TextAlign } from '@tiptap/extension-text-align'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableHeader } from '@tiptap/extension-table-header'
import { TableCell } from '@tiptap/extension-table-cell'
import { Image } from '@tiptap/extension-image'

interface WordEditorProps {
  filePath: string
  fileName: string
  initialHtml?: string
  onNotify: (msg: string) => void
  onOpenOutside?: () => void
  onShowInFolder?: () => void
  onContentChange?: (html: string) => void
}

export const WordEditor: React.FC<WordEditorProps> = ({
  filePath,
  fileName,
  initialHtml,
  onNotify,
  onOpenOutside,
  onShowInFolder,
  onContentChange,
}) => {
  // Mode: 'view' for high-fidelity native-like Word page viewer, 'edit' for TipTap rich editor
  const [mode, setMode] = useState<'view' | 'edit'>('view')

  // View Mode Layout & Zoom Controls
  const [layoutMode, setLayoutMode] = useState<'side-by-side' | 'continuous'>('side-by-side')
  const [zoom, setZoom] = useState<number>(100)
  const [pageCount, setPageCount] = useState<number>(1)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [isLoadingView, setIsLoadingView] = useState<boolean>(true)
  const [viewError, setViewError] = useState<string | null>(null)

  // Edit Mode state
  const [isLoadingEdit, setIsLoadingEdit] = useState<boolean>(false)
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [isDirty, setIsDirty] = useState<boolean>(false)
  const [editLoaded, setEditLoaded] = useState<boolean>(!!initialHtml)

  // Counts
  const [wordCount, setWordCount] = useState<number>(0)
  const [charCount, setCharCount] = useState<number>(0)

  // DOM Refs
  const viewerMountRef = useRef<HTMLDivElement>(null)
  const scrollWrapperRef = useRef<HTMLDivElement>(null)

  // TipTap Rich-Text Engine (only instantiated for Edit mode)
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({
        inline: true,
        allowBase64: true,
      }),
    ],
    content: initialHtml || '',
    onUpdate: ({ editor: ed }) => {
      setIsDirty(true)
      const text = ed.getText()
      const words = text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0
      setWordCount(words)
      setCharCount(text.trim().length)
      onContentChange?.(ed.getHTML())
    },
  })

  // 1. High-Fidelity Word Preview via docx-preview
  const renderDocxPreview = useCallback(async () => {
    if (!viewerMountRef.current) return
    setIsLoadingView(true)
    setViewError(null)

    try {
      if (!window.electron?.readFileBuffer) {
        throw new Error('readFileBuffer IPC handler is not available')
      }

      const res = await window.electron.readFileBuffer(filePath)
      if (!res.success || !res.buffer) {
        throw new Error(res.error || 'Failed to read document binary buffer')
      }

      let rawData: any = res.buffer
      if (rawData && !(rawData instanceof ArrayBuffer) && rawData.buffer) {
        rawData = rawData.buffer.slice(rawData.byteOffset, rawData.byteOffset + rawData.byteLength)
      }

      viewerMountRef.current.innerHTML = ''

      await renderAsync(rawData, viewerMountRef.current, undefined, {
        className: 'docx',
        inWrapper: true,
        breakPages: true,
        ignoreLastRenderedPageBreak: false, // Critical: breaks pages on Word's lastRenderedPageBreak
        experimental: true, // Critical: calculates tab stops for right-aligned dates & columns
        trimXmlDeclaration: true,
        useBase64URL: true,
        renderHeaders: true,
        renderFooters: true,
        renderFootnotes: true,
        renderEndnotes: true,
        renderAltChunks: true,
      })

      // Count pages
      const sections = viewerMountRef.current.querySelectorAll('section.docx')
      const count = sections.length > 0 ? sections.length : 1
      setPageCount(count)

      // Calculate words and characters
      const text = viewerMountRef.current.innerText || ''
      const words = text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0
      setWordCount(words)
      setCharCount(text.trim().length)
    } catch (err: any) {
      console.error('[WordEditor] docx-preview error:', err)
      setViewError(err?.message || 'Failed to render document preview')
    } finally {
      setIsLoadingView(false)
    }
  }, [filePath])

  // Trigger high-fidelity render on mount and file change
  useEffect(() => {
    if (mode === 'view') {
      renderDocxPreview()
    }
  }, [mode, renderDocxPreview])

  // Track active page on scroll
  const handleScroll = useCallback(() => {
    if (!scrollWrapperRef.current || !viewerMountRef.current) return
    const sections = viewerMountRef.current.querySelectorAll('section.docx')
    if (!sections.length) return

    const containerTop = scrollWrapperRef.current.scrollTop
    const containerHeight = scrollWrapperRef.current.clientHeight
    const threshold = containerTop + containerHeight / 3

    for (let i = 0; i < sections.length; i++) {
      const el = sections[i] as HTMLElement
      const elTop = el.offsetTop
      const elBottom = elTop + el.offsetHeight
      if (threshold >= elTop && threshold <= elBottom) {
        setCurrentPage(i + 1)
        break
      }
    }
  }, [])

  // 2. Load Edit Mode HTML on Demand
  const loadEditContent = useCallback(async () => {
    if (editLoaded || !editor) return
    setIsLoadingEdit(true)
    try {
      if (window.electron?.readDocx) {
        const res = await window.electron.readDocx(filePath)
        if (res.success && res.html !== undefined) {
          editor.commands.setContent(res.html || '<p></p>')
          setEditLoaded(true)
          setIsDirty(false)
          const text = editor.getText()
          const words = text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0
          setWordCount(words)
          setCharCount(text.trim().length)
        } else if (res.error) {
          onNotify(`⚠️ Could not load document for editing: ${res.error}`)
        }
      }
    } catch (err: any) {
      onNotify(`⚠️ Error loading editor: ${err.message}`)
    } finally {
      setIsLoadingEdit(false)
    }
  }, [editLoaded, editor, filePath, onNotify])

  const handleSwitchMode = (targetMode: 'view' | 'edit') => {
    if (targetMode === 'edit') {
      setMode('edit')
      if (!editLoaded) {
        loadEditContent()
      }
    } else {
      setMode('view')
    }
  }

  // Save document back to DOCX from Edit mode
  const handleSave = useCallback(async () => {
    if (!window.electron?.saveDocx || !editor) return
    setIsSaving(true)
    try {
      const currentHtml = editor.getHTML()
      const currentText = editor.getText()
      const res = await window.electron.saveDocx({
        filePath,
        html: currentHtml,
        text: currentText,
      })
      if (res.success) {
        setIsDirty(false)
        onNotify(`💾 Saved Word document ${fileName}`)
        // Re-render preview if user switches back to view
        renderDocxPreview()
      } else {
        onNotify(`⚠️ Failed to save Word document: ${res.error}`)
      }
    } catch (err: any) {
      onNotify(`⚠️ Error saving Word document: ${err.message}`)
    } finally {
      setIsSaving(false)
    }
  }, [filePath, fileName, editor, onNotify, renderDocxPreview])

  // Ctrl+S / Ctrl+P shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        if (mode === 'edit') {
          e.preventDefault()
          handleSave()
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        if (mode === 'view') {
          e.preventDefault()
          window.print()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave, mode])

  // Zoom helpers
  const handleZoomIn = () => setZoom((z) => Math.min(z + 10, 200))
  const handleZoomOut = () => setZoom((z) => Math.max(z - 10, 40))
  const handleResetZoom = () => setZoom(100)

  const handleFitWidth = () => {
    if (!scrollWrapperRef.current) return
    const containerW = scrollWrapperRef.current.clientWidth - 48
    // Typical Word page width in pixels is ~816px (8.5 inches at 96 DPI)
    const targetW = layoutMode === 'side-by-side' ? 816 * 2 + 32 : 816
    const calculated = Math.floor((containerW / targetW) * 100)
    const clamped = Math.min(Math.max(calculated, 40), 200)
    setZoom(clamped)
  }

  return (
    <div className={`wb-doc-editor wb-word-editor ${mode === 'view' ? 'wb-word-view-active' : ''}`}>
      {/* Word Main Toolbar */}
      <div className="wb-editor-toolbar wb-word-toolbar">
        {/* Left: Mode Switcher (View vs Edit) */}
        <div className="wb-word-mode-group">
          <button
            className={`wb-word-mode-pill ${mode === 'view' ? 'active' : ''}`}
            onClick={() => handleSwitchMode('view')}
            title="High-Fidelity Document View (True Word Layout)"
          >
            <Eye size={13} />
            <span>View</span>
          </button>
          <button
            className={`wb-word-mode-pill ${mode === 'edit' ? 'active' : ''}`}
            onClick={() => handleSwitchMode('edit')}
            title="Edit Document Content"
          >
            <Edit3 size={13} />
            <span>Edit</span>
          </button>
        </div>

        <div className="wb-toolbar-sep" />

        {/* View Mode Controls: Zoom & Layout */}
        {mode === 'view' && (
          <div className="wb-toolbar-group">
            <button
              className="wb-tool-btn"
              onClick={handleZoomOut}
              disabled={zoom <= 40}
              title="Zoom Out (Ctrl+-)"
            >
              <ZoomOut size={13} />
            </button>
            <button
              className="wb-tool-btn wb-zoom-badge"
              onClick={handleResetZoom}
              title="Reset Zoom to 100%"
            >
              <span>{zoom}%</span>
            </button>
            <button
              className="wb-tool-btn"
              onClick={handleZoomIn}
              disabled={zoom >= 200}
              title="Zoom In (Ctrl++)"
            >
              <ZoomIn size={13} />
            </button>
            <button
              className="wb-tool-btn"
              onClick={handleFitWidth}
              title="Fit to Width"
            >
              <Maximize2 size={13} />
              <span>Fit</span>
            </button>

            <div className="wb-toolbar-sep" />

            {/* Layout Mode: Side-by-Side (2 Pages) vs Continuous (Single Column) */}
            <button
              className={`wb-tool-btn ${layoutMode === 'side-by-side' ? 'active' : ''}`}
              onClick={() => setLayoutMode('side-by-side')}
              title="Side-by-Side Pages (Two Page View)"
            >
              <Columns size={13} />
              <span>Two Pages</span>
            </button>
            <button
              className={`wb-tool-btn ${layoutMode === 'continuous' ? 'active' : ''}`}
              onClick={() => setLayoutMode('continuous')}
              title="Continuous Vertical Page Stack"
            >
              <Rows size={13} />
              <span>Single</span>
            </button>

            <div className="wb-toolbar-sep" />

            <button
              className="wb-tool-btn"
              onClick={() => window.print()}
              title="Print Document (Ctrl+P)"
            >
              <Printer size={13} />
              <span>Print</span>
            </button>
            <button
              className="wb-tool-btn"
              onClick={renderDocxPreview}
              title="Reload Preview"
            >
              <RotateCw size={13} />
            </button>
          </div>
        )}

        {/* Edit Mode Formatting Ribbon */}
        {mode === 'edit' && (
          <div className="wb-toolbar-group">
            <button
              className="wb-tool-btn"
              onClick={() => editor?.chain().focus().undo().run()}
              disabled={!editor?.can().undo()}
              title="Undo (Ctrl+Z)"
            >
              <Undo size={14} />
            </button>
            <button
              className="wb-tool-btn"
              onClick={() => editor?.chain().focus().redo().run()}
              disabled={!editor?.can().redo()}
              title="Redo (Ctrl+Y)"
            >
              <Redo size={14} />
            </button>

            <div className="wb-toolbar-sep" />

            <button
              className={`wb-tool-btn ${editor?.isActive('bold') ? 'active' : ''}`}
              onClick={() => editor?.chain().focus().toggleBold().run()}
              title="Bold (Ctrl+B)"
            >
              <Bold size={14} />
            </button>
            <button
              className={`wb-tool-btn ${editor?.isActive('italic') ? 'active' : ''}`}
              onClick={() => editor?.chain().focus().toggleItalic().run()}
              title="Italic (Ctrl+I)"
            >
              <Italic size={14} />
            </button>
            <button
              className={`wb-tool-btn ${editor?.isActive('underline') ? 'active' : ''}`}
              onClick={() => editor?.chain().focus().toggleUnderline().run()}
              title="Underline (Ctrl+U)"
            >
              <UnderlineIcon size={14} />
            </button>
            <button
              className={`wb-tool-btn ${editor?.isActive('strike') ? 'active' : ''}`}
              onClick={() => editor?.chain().focus().toggleStrike().run()}
              title="Strikethrough"
            >
              <Strikethrough size={14} />
            </button>

            <div className="wb-toolbar-sep" />

            <button
              className={`wb-tool-btn ${editor?.isActive('heading', { level: 1 }) ? 'active' : ''}`}
              onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
              title="Heading 1"
            >
              <Heading1 size={14} />
            </button>
            <button
              className={`wb-tool-btn ${editor?.isActive('heading', { level: 2 }) ? 'active' : ''}`}
              onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
              title="Heading 2"
            >
              <Heading2 size={14} />
            </button>
            <button
              className={`wb-tool-btn ${editor?.isActive('heading', { level: 3 }) ? 'active' : ''}`}
              onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
              title="Heading 3"
            >
              <Heading3 size={14} />
            </button>

            <div className="wb-toolbar-sep" />

            <button
              className={`wb-tool-btn ${editor?.isActive({ textAlign: 'left' }) ? 'active' : ''}`}
              onClick={() => editor?.chain().focus().setTextAlign('left').run()}
              title="Align Left"
            >
              <AlignLeft size={14} />
            </button>
            <button
              className={`wb-tool-btn ${editor?.isActive({ textAlign: 'center' }) ? 'active' : ''}`}
              onClick={() => editor?.chain().focus().setTextAlign('center').run()}
              title="Align Center"
            >
              <AlignCenter size={14} />
            </button>
            <button
              className={`wb-tool-btn ${editor?.isActive({ textAlign: 'right' }) ? 'active' : ''}`}
              onClick={() => editor?.chain().focus().setTextAlign('right').run()}
              title="Align Right"
            >
              <AlignRight size={14} />
            </button>

            <div className="wb-toolbar-sep" />

            <button
              className={`wb-tool-btn ${editor?.isActive('bulletList') ? 'active' : ''}`}
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
              title="Bullet List"
            >
              <List size={14} />
            </button>
            <button
              className={`wb-tool-btn ${editor?.isActive('orderedList') ? 'active' : ''}`}
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
              title="Numbered List"
            >
              <ListOrdered size={14} />
            </button>
            <button
              className={`wb-tool-btn ${editor?.isActive('blockquote') ? 'active' : ''}`}
              onClick={() => editor?.chain().focus().toggleBlockquote().run()}
              title="Blockquote"
            >
              <Quote size={14} />
            </button>

            <div className="wb-toolbar-sep" />

            <button
              className={`wb-tool-btn ${editor?.isActive('table') ? 'active' : ''}`}
              onClick={() => {
                if (editor?.isActive('table')) {
                  editor.chain().focus().deleteTable().run()
                } else {
                  editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
                }
              }}
              title={editor?.isActive('table') ? 'Delete Table' : 'Insert 3x3 Table'}
            >
              <TableIcon size={14} />
              <span>Table</span>
            </button>
          </div>
        )}

        {/* Right Actions */}
        <div className="wb-toolbar-right">
          {mode === 'edit' && (
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
          )}

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

      {/* Main Canvas Scroll Area */}
      <div
        ref={scrollWrapperRef}
        className={`wb-word-canvas-wrapper ${mode === 'view' ? `wb-word-viewer layout-${layoutMode}` : 'wb-word-editor-canvas'}`}
        onScroll={mode === 'view' ? handleScroll : undefined}
      >
        {/* VIEW MODE: High-Fidelity Word Pages */}
        {mode === 'view' && (
          <div
            className="wb-docx-zoom-container"
            style={{ zoom: `${zoom}%` }}
          >
            {isLoadingView && (
              <div className="wb-word-loading-overlay">
                <RotateCw size={26} className="spin text-cyan" />
                <span style={{ fontSize: '13px', fontWeight: 500 }}>Rendering Word document pages...</span>
              </div>
            )}

            {viewError ? (
              <div className="wb-word-error-box">
                <AlertTriangle size={24} className="text-amber" />
                <div className="wb-word-error-details">
                  <h4>Could not render high-fidelity preview</h4>
                  <p>{viewError}</p>
                </div>
                <div className="wb-word-error-actions">
                  <button
                    className="wb-modal-btn wb-modal-btn-primary"
                    onClick={() => handleSwitchMode('edit')}
                  >
                    Open in Rich Editor
                  </button>
                  {onOpenOutside && (
                    <button
                      className="wb-modal-btn wb-modal-btn-secondary"
                      onClick={onOpenOutside}
                    >
                      Open in External Word
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div ref={viewerMountRef} className="wb-docx-preview-mount" />
            )}
          </div>
        )}

        {/* EDIT MODE: TipTap Canvas */}
        {mode === 'edit' && (
          <div className="wb-word-edit-container">
            {isLoadingEdit && (
              <div className="wb-word-loading-overlay">
                <RotateCw size={26} className="spin text-cyan" />
                <span style={{ fontSize: '13px', fontWeight: 500 }}>Loading document for editing...</span>
              </div>
            )}

            <div
              className="wb-word-page"
              onClick={() => {
                if (editor && !editor.isFocused) {
                  editor.commands.focus()
                }
              }}
            >
              <EditorContent editor={editor} className="wb-tiptap-wrapper" />
            </div>
          </div>
        )}
      </div>

      {/* Word Document Footer Status Bar */}
      <div className="wb-editor-footer">
        <span className="wb-footer-item">
          <FileText size={12} style={{ marginRight: '4px' }} />
          {mode === 'view' ? (
            <>
              Page <strong>{currentPage}</strong> of <strong>{pageCount}</strong> · <strong>{wordCount}</strong> words · <strong>{charCount}</strong> chars
            </>
          ) : (
            <>
              <strong>{wordCount}</strong> words · <strong>{charCount}</strong> chars · TipTap Rich Editor
            </>
          )}
        </span>
        <span className="wb-footer-item wb-footer-path" title={filePath}>
          {filePath}
        </span>
        <span className="wb-footer-status">
          {mode === 'view' ? (
            '📄 High-Fidelity Word Layout'
          ) : isDirty ? (
            '● Unsaved changes (Ctrl+S)'
          ) : (
            '✓ Up to date'
          )}
        </span>
      </div>
    </div>
  )
}
