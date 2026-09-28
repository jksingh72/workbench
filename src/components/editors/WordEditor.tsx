import React, { useState, useEffect, useCallback } from 'react'
import {
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
  Undo,
  Redo,
  Save,
  ExternalLink,
  FolderOpen,
  RotateCw,
  Check,
  FileText
} from 'lucide-react'
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
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [isDirty, setIsDirty] = useState<boolean>(false)
  const [wordCount, setWordCount] = useState<number>(0)
  const [charCount, setCharCount] = useState<number>(0)

  // TipTap Rich-Text Engine
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
    content: '',
    onUpdate: ({ editor: ed }) => {
      setIsDirty(true)
      const text = ed.getText()
      const words = text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0
      setWordCount(words)
      setCharCount(text.trim().length)
    },
  })

  // Load DOCX document into TipTap
  useEffect(() => {
    let isMounted = true
    if (!editor) return

    const loadDocx = async () => {
      setIsLoading(true)
      try {
        if (window.electron?.readDocx) {
          const res = await window.electron.readDocx(filePath)
          if (res.success && isMounted) {
            const docHtml = res.html || '<p></p>'
            editor.commands.setContent(docHtml)
            const text = editor.getText()
            const words = text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0
            setWordCount(words)
            setCharCount(text.trim().length)
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
  }, [filePath, editor])

  // Save document back to DOCX
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
      } else {
        onNotify(`⚠️ Failed to save Word document: ${res.error}`)
      }
    } catch (err: any) {
      onNotify(`⚠️ Error saving Word document: ${err.message}`)
    } finally {
      setIsSaving(false)
    }
  }, [filePath, fileName, editor, onNotify])

  // Ctrl+S global keyboard shortcut
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

  return (
    <div className="wb-doc-editor wb-word-editor">
      {/* Top Word Ribbon Toolbar */}
      <div className="wb-editor-toolbar wb-word-ribbon">
        <div className="wb-toolbar-group">
          {/* Undo / Redo */}
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

          {/* Text Formatting */}
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

          {/* Headings */}
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

          {/* Text Alignment */}
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

          {/* Lists and Quotes */}
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

          {/* Table Insertion */}
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
      <div className="wb-word-canvas-wrapper">
        {isLoading && (
          <div className="wb-word-loading-overlay">
            <RotateCw size={24} className="spin text-cyan" />
            <span>Loading Word document...</span>
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
