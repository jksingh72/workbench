import React, { useState, useEffect, useRef } from 'react'
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Eye,
  Edit3,
  Columns,
  List,
  Sparkles,
  Copy,
  Save,
  Check,
  RotateCw,
  ExternalLink,
  FolderOpen,
  Sun,
  Moon,
  Coffee,
  Bookmark,
  Search
} from 'lucide-react'
import { EpubBookData, EpubChapter } from '../../types/electron'

interface EpubEditorProps {
  filePath: string
  fileName: string
  bookType?: 'epub' | 'mobi'
  onNotify: (msg: string) => void
  onOpenOutside?: () => void
  onShowInFolder?: () => void
}

export const EpubEditor: React.FC<EpubEditorProps> = ({
  filePath,
  fileName,
  bookType,
  onNotify,
  onOpenOutside,
  onShowInFolder,
}) => {
  const isMobi =
    bookType === 'mobi' ||
    filePath.toLowerCase().endsWith('.mobi') ||
    filePath.toLowerCase().endsWith('.azw') ||
    filePath.toLowerCase().endsWith('.prc')

  const [bookData, setBookData] = useState<EpubBookData | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Chapter Navigation State
  const [currentChapterIndex, setCurrentChapterIndex] = useState<number>(0)
  const [showTocSidebar, setShowTocSidebar] = useState<boolean>(false)
  const [searchQuery, setSearchQuery] = useState<string>('')

  // Reader Settings
  const [viewMode, setViewMode] = useState<'reader' | 'notes' | 'split'>('reader')
  const [theme, setTheme] = useState<'dark' | 'sepia' | 'light'>('dark')
  const [fontSize, setFontSize] = useState<number>(16)

  // Notes & Annotations State
  const companionPath = `${filePath}.notes.md`
  const [notesContent, setNotesContent] = useState<string>('')
  const [isDirty, setIsDirty] = useState<boolean>(false)
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const readerScrollRef = useRef<HTMLDivElement>(null)
  const hasUserEdited = useRef<boolean>(false)

  // Load Book Data (EPUB or MOBI)
  useEffect(() => {
    let isMounted = true
    setIsLoading(true)
    setError(null)

    const loadBook = async () => {
      try {
        const readFn = isMobi
          ? window.electron?.readMobi || window.electron?.readEpub
          : window.electron?.readEpub
        if (!readFn) {
          throw new Error('E-book reader API is not available')
        }
        const data = await readFn(filePath)
        if (!isMounted) return

        if (data.success && data.chapters.length > 0) {
          setBookData(data)
          setCurrentChapterIndex(0)
        } else {
          setError(data.error || 'No readable chapters found in book')
        }
      } catch (err: any) {
        if (isMounted) setError(err?.message || 'Failed to load book')
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    loadBook()
    return () => {
      isMounted = false
    }
  }, [filePath, isMobi])

  // Load Companion Notes (<filePath>.notes.md)
  useEffect(() => {
    let isMounted = true
    hasUserEdited.current = false

    const loadNotes = async () => {
      try {
        if (window.electron?.readFileContent) {
          const res = await window.electron.readFileContent(companionPath)
          if (!isMounted) return
          if (res.success && res.content !== undefined) {
            setNotesContent(res.content)
            setIsDirty(false)
          } else if (bookData) {
            // Populate initial notes outline
            const initialTemplate = `# Notes & Highlights: ${bookData.title}\n*Author: ${bookData.author || 'Unknown'}*\n\n---\n\n### 📖 Reading Log\n`
            setNotesContent(initialTemplate)
          }
        }
      } catch (_) {}
    }

    loadNotes()
    return () => {
      isMounted = false
    }
  }, [companionPath, bookData])

  // Scroll reader to top on chapter change
  useEffect(() => {
    if (readerScrollRef.current) {
      readerScrollRef.current.scrollTop = 0
    }
  }, [currentChapterIndex])

  const currentChapter: EpubChapter | undefined = bookData?.chapters[currentChapterIndex]

  const handlePrevChapter = () => {
    if (currentChapterIndex > 0) {
      setCurrentChapterIndex((prev) => prev - 1)
    }
  }

  const handleNextChapter = () => {
    if (bookData && currentChapterIndex < bookData.chapters.length - 1) {
      setCurrentChapterIndex((prev) => prev + 1)
    }
  }

  // Copy current chapter text
  const handleCopyChapter = () => {
    if (!currentChapter) return
    navigator.clipboard.writeText(currentChapter.text)
    onNotify(`📋 Copied "${currentChapter.title}" to clipboard!`)
  }

  // Add annotation template
  const handleAddAnnotation = () => {
    if (viewMode === 'reader') {
      setViewMode('split')
    }
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const chTitle = currentChapter?.title || `Chapter ${currentChapterIndex + 1}`
    const template = `\n\n### 📌 Note on ${chTitle} (${timestamp})\n> **Key Concept:** \n\n- Summary: \n`
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

  // Save notes to companion file
  const handleSaveNotes = async () => {
    if (!window.electron?.writeFileContent) return
    setIsSaving(true)
    try {
      const res = await window.electron.writeFileContent(companionPath, notesContent)
      if (res.success) {
        setIsDirty(false)
        onNotify(`💾 Saved notes to ${fileName}.notes.md`)
      } else {
        onNotify(`❌ Error saving notes: ${res.error}`)
      }
    } catch (err: any) {
      onNotify(`❌ Failed to save notes: ${err.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  // Intercept and handle all internal and external link clicks in rendered chapter HTML
  const handleRenderedHtmlClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    const anchor = target.closest('a')
    if (!anchor) return

    // Always prevent Chromium's default window-level navigation
    e.preventDefault()
    e.stopPropagation()

    const rawHref = anchor.getAttribute('href') || ''
    const dataFilepos = anchor.getAttribute('data-filepos') || anchor.getAttribute('filepos')

    // 1. External Links: open safely in external default browser
    if (
      rawHref.startsWith('http://') ||
      rawHref.startsWith('https://') ||
      rawHref.startsWith('mailto:') ||
      rawHref.startsWith('ftp://')
    ) {
      if (window.electron?.openExternal) {
        window.electron.openExternal(rawHref)
        onNotify('🔗 Opened link in external browser')
      }
      return
    }

    // 2. MOBI filepos link (e.g. data-filepos="12345", href="filepos:12345", or href="#filepos_12345")
    let targetPos: number | null = null
    if (dataFilepos && /^\d+$/.test(dataFilepos.trim())) {
      targetPos = parseInt(dataFilepos.trim(), 10)
    } else if (rawHref.startsWith('filepos:')) {
      const numPart = rawHref.replace(/^filepos:/i, '').trim()
      if (/^\d+$/.test(numPart)) {
        targetPos = parseInt(numPart, 10)
      }
    } else if (rawHref.startsWith('#filepos_')) {
      const numPart = rawHref.replace(/^#filepos_/i, '').trim()
      if (/^\d+$/.test(numPart)) {
        targetPos = parseInt(numPart, 10)
      }
    }

    if (targetPos !== null && bookData) {
      // Find chapter containing this filepos
      let targetChIdx = bookData.chapters.findIndex(
        (ch) =>
          ch.startPos !== undefined &&
          ch.endPos !== undefined &&
          targetPos! >= ch.startPos &&
          targetPos! < ch.endPos
      )

      // Fallback 1: check if target anchor is in the chapter's HTML text
      if (targetChIdx === -1) {
        targetChIdx = bookData.chapters.findIndex(
          (ch) =>
            ch.html.includes(`id="filepos_${targetPos}"`) ||
            ch.html.includes(`name="filepos_${targetPos}"`)
        )
      }

      // Fallback 2: find closest preceding chapter
      if (targetChIdx === -1) {
        for (let i = bookData.chapters.length - 1; i >= 0; i--) {
          const ch = bookData.chapters[i]
          if (ch.startPos !== undefined && targetPos! >= ch.startPos) {
            targetChIdx = i
            break
          }
        }
      }

      if (targetChIdx !== -1) {
        const needChapterSwitch = targetChIdx !== currentChapterIndex
        if (needChapterSwitch) {
          setCurrentChapterIndex(targetChIdx)
        }

        const scrollToFilepos = () => {
          const container = readerScrollRef.current
          if (!container) return
          const el = container.querySelector(
            `#filepos_${targetPos}, [name="filepos_${targetPos}"]`
          )
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' })
          } else {
            const ch = bookData.chapters[targetChIdx]
            if (ch && ch.startPos !== undefined && ch.endPos && ch.endPos > ch.startPos) {
              const ratio = Math.max(
                0,
                Math.min(1, (targetPos! - ch.startPos) / (ch.endPos - ch.startPos))
              )
              container.scrollTo({ top: container.scrollHeight * ratio, behavior: 'smooth' })
            }
          }
        }

        if (needChapterSwitch) {
          setTimeout(scrollToFilepos, 100)
        } else {
          scrollToFilepos()
        }
        return
      }
    }

    // 3. In-page anchor hash link (e.g. href="#footnote-1")
    if (rawHref.startsWith('#')) {
      const anchorId = rawHref.substring(1)
      if (!anchorId) return

      const scrollToAnchor = () => {
        const container = readerScrollRef.current
        if (!container) return
        try {
          const el = container.querySelector(
            `#${CSS.escape(anchorId)}, [name="${CSS.escape(anchorId)}"]`
          )
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' })
            return true
          }
        } catch (_) {
          const el = document.getElementById(anchorId)
          if (el && container.contains(el)) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' })
            return true
          }
        }
        return false
      }

      // Try current chapter first
      if (scrollToAnchor()) return

      // If not in current chapter, check other chapters
      if (bookData) {
        const crossChIdx = bookData.chapters.findIndex(
          (ch) =>
            ch.html.includes(`id="${anchorId}"`) ||
            ch.html.includes(`name="${anchorId}"`)
        )
        if (crossChIdx !== -1 && crossChIdx !== currentChapterIndex) {
          setCurrentChapterIndex(crossChIdx)
          setTimeout(scrollToAnchor, 100)
        }
      }
      return
    }

    // 4. Relative chapter link (e.g. href="chapter_2.html#sec1" or href="text/part001.xhtml")
    if (bookData && rawHref.length > 0) {
      const [pathPart, hashPart] = rawHref.split('#')
      const cleanPath = decodeURIComponent(pathPart.replace(/\\/g, '/')).trim()
      const baseName = cleanPath.split('/').pop()?.toLowerCase() || ''

      let targetChIdx = bookData.chapters.findIndex((ch) => {
        const chHref = ch.href.replace(/\\/g, '/').toLowerCase()
        const chBase = chHref.split('/').pop()?.toLowerCase() || ''
        return chHref === cleanPath.toLowerCase() || chBase === baseName
      })

      if (targetChIdx === -1 && bookData.toc) {
        const tocMatch = bookData.toc.find((t) => {
          const tHref = t.href.split('#')[0].replace(/\\/g, '/').toLowerCase()
          const tBase = tHref.split('/').pop()?.toLowerCase() || ''
          return tHref === cleanPath.toLowerCase() || tBase === baseName
        })
        if (tocMatch) {
          targetChIdx = tocMatch.chapterIndex
        }
      }

      if (targetChIdx !== -1) {
        const needSwitch = targetChIdx !== currentChapterIndex
        if (needSwitch) {
          setCurrentChapterIndex(targetChIdx)
        }

        if (hashPart) {
          const scrollTarget = () => {
            const container = readerScrollRef.current
            if (!container) return
            try {
              const el = container.querySelector(
                `#${CSS.escape(hashPart)}, [name="${CSS.escape(hashPart)}"]`
              )
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
            } catch (_) {
              const el = document.getElementById(hashPart)
              if (el && container.contains(el)) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
            }
          }
          if (needSwitch) {
            setTimeout(scrollTarget, 100)
          } else {
            scrollTarget()
          }
        }
        return
      }
    }
  }

  // Filtered TOC for sidebar search
  const filteredChapters = (bookData?.chapters || []).filter((ch, idx) => {
    if (!searchQuery.trim()) return true
    return (
      ch.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      `chapter ${idx + 1}`.includes(searchQuery.toLowerCase())
    )
  })

  if (isLoading) {
    return (
      <div className="wb-doc-loading">
        <RotateCw size={24} className="spin text-teal" />
        <span style={{ marginTop: '10px' }}>Loading {isMobi ? 'MOBI' : 'EPUB'} book "{fileName}"...</span>
      </div>
    )
  }

  if (error || !bookData) {
    return (
      <div className="wb-doc-loading wb-doc-error">
        <span style={{ fontSize: '14px', color: '#f87171', fontWeight: 600 }}>
          Unable to open {isMobi ? 'MOBI' : 'EPUB'}
        </span>
        <span style={{ fontSize: '12px', color: '#94a3b8', maxWidth: '400px', textAlign: 'center', marginTop: '6px' }}>
          {error || 'Unknown error occurred while reading the file.'}
        </span>
        {onOpenOutside && (
          <button className="wb-tool-btn" onClick={onOpenOutside} style={{ marginTop: '14px' }}>
            <ExternalLink size={14} />
            <span>Open in System Reader</span>
          </button>
        )}
      </div>
    )
  }

  return (
    <div className={`wb-doc-editor wb-epub-editor theme-${theme}`}>
      {/* EPUB/MOBI Main Toolbar */}
      <div className="wb-editor-toolbar">
        <div className="wb-toolbar-group">
          {/* Badge */}
          <span className={`wb-doc-badge ${isMobi ? 'badge-mobi-tag' : 'badge-epub-tag'}`} title={bookData.title}>
            <BookOpen size={13} style={{ marginRight: '5px' }} />
            {isMobi ? 'MOBI' : 'EPUB'} ({bookData.totalChapters} chs)
          </span>

          {/* TOC Sidebar Toggle */}
          <button
            className={`wb-tool-btn ${showTocSidebar ? 'active' : ''}`}
            onClick={() => setShowTocSidebar((prev) => !prev)}
            title="Toggle Table of Contents sidebar"
          >
            <List size={14} />
            <span>Contents</span>
          </button>

          {/* Chapter Quick Jump Selector */}
          <select
            className="wb-epub-chapter-select"
            value={currentChapterIndex}
            onChange={(e) => setCurrentChapterIndex(Number(e.target.value))}
            title="Select Chapter"
          >
            {bookData.chapters.map((ch, idx) => (
              <option key={ch.id || idx} value={idx}>
                {idx + 1}. {ch.title} ({ch.wordCount.toLocaleString()} w)
              </option>
            ))}
          </select>

          {/* Prev / Next Chapter Buttons */}
          <div className="wb-epub-nav-buttons">
            <button
              className="wb-tool-btn"
              onClick={handlePrevChapter}
              disabled={currentChapterIndex === 0}
              title="Previous Chapter"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="wb-epub-page-indicator">
              {currentChapterIndex + 1} / {bookData.totalChapters}
            </span>
            <button
              className="wb-tool-btn"
              onClick={handleNextChapter}
              disabled={currentChapterIndex >= bookData.totalChapters - 1}
              title="Next Chapter"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {/* View Mode Switcher: Reader | Notes | Split */}
          <div className="wb-view-mode-group">
            <button
              className={`wb-mode-btn ${viewMode === 'reader' ? 'active' : ''}`}
              onClick={() => setViewMode('reader')}
              title="Reader: Full distraction-free book reader"
            >
              <Eye size={13} />
              <span>Reader</span>
            </button>
            <button
              className={`wb-mode-btn ${viewMode === 'notes' ? 'active' : ''}`}
              onClick={() => setViewMode('notes')}
              title="Notes: Companion notes & synthesis"
            >
              <Edit3 size={13} />
              <span>Notes</span>
            </button>
            <button
              className={`wb-mode-btn ${viewMode === 'split' ? 'active' : ''}`}
              onClick={() => setViewMode('split')}
              title="Split View: Book on left, Notes on right"
            >
              <Columns size={13} />
              <span>Split</span>
            </button>
          </div>
        </div>

        {/* Right Toolbar Actions */}
        <div className="wb-toolbar-right">
          {/* Font Size Adjusters */}
          <div className="wb-font-size-group" title="Adjust Reader Font Size">
            <button
              className="wb-tool-btn"
              onClick={() => setFontSize((s) => Math.max(13, s - 1))}
              disabled={fontSize <= 13}
              title="Decrease Font Size"
            >
              A-
            </button>
            <span style={{ fontSize: '11px', color: '#94a3b8', minWidth: '24px', textAlign: 'center' }}>
              {fontSize}px
            </span>
            <button
              className="wb-tool-btn"
              onClick={() => setFontSize((s) => Math.min(26, s + 1))}
              disabled={fontSize >= 26}
              title="Increase Font Size"
            >
              A+
            </button>
          </div>

          {/* Theme Selector: Dark, Sepia, Light */}
          <div className="wb-theme-picker">
            <button
              className={`wb-theme-btn theme-btn-dark ${theme === 'dark' ? 'active' : ''}`}
              onClick={() => setTheme('dark')}
              title="Dark Theme"
            >
              <Moon size={12} />
            </button>
            <button
              className={`wb-theme-btn theme-btn-sepia ${theme === 'sepia' ? 'active' : ''}`}
              onClick={() => setTheme('sepia')}
              title="Sepia Paper Theme"
            >
              <Coffee size={12} />
            </button>
            <button
              className={`wb-theme-btn theme-btn-light ${theme === 'light' ? 'active' : ''}`}
              onClick={() => setTheme('light')}
              title="Light Theme"
            >
              <Sun size={12} />
            </button>
          </div>

          {/* Annotate Button */}
          <button
            className="wb-tool-btn"
            onClick={handleAddAnnotation}
            title="Insert new annotation section into notes"
          >
            <Sparkles size={13} className="text-cyan" />
            <span>Annotate</span>
          </button>

          {/* Copy Chapter */}
          <button
            className="wb-tool-btn"
            onClick={handleCopyChapter}
            title="Copy current chapter text to clipboard"
          >
            <Copy size={13} />
            <span>Copy</span>
          </button>

          {/* Save Notes Button */}
          <button
            className={`wb-save-btn ${isDirty ? 'dirty' : ''}`}
            onClick={handleSaveNotes}
            disabled={isSaving}
            title="Save companion notes (Ctrl+S)"
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

          {/* Open in external app */}
          {onOpenOutside && (
            <button
              className="wb-tool-btn"
              onClick={onOpenOutside}
              title="Open in System Default Reader"
            >
              <ExternalLink size={14} />
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

      {/* Main Workspace Area */}
      <div className={`wb-epub-main-area mode-${viewMode}`}>
        {/* Table of Contents Collapsible Sidebar */}
        {showTocSidebar && (
          <div className="wb-epub-toc-sidebar">
            <div className="wb-toc-header">
              <span className="wb-toc-title">Table of Contents</span>
              <span className="wb-toc-count">{bookData.totalChapters} chapters</span>
            </div>
            <div className="wb-toc-search">
              <Search size={12} className="text-slate-400" />
              <input
                type="text"
                placeholder="Filter chapters..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="wb-toc-list">
              {filteredChapters.map((ch) => {
                const actualIndex = bookData.chapters.indexOf(ch)
                const isActive = actualIndex === currentChapterIndex
                return (
                  <button
                    key={ch.id || actualIndex}
                    className={`wb-toc-item ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      setCurrentChapterIndex(actualIndex)
                    }}
                    title={ch.title}
                  >
                    <span className="wb-toc-num">{actualIndex + 1}</span>
                    <span className="wb-toc-name">{ch.title}</span>
                    <span className="wb-toc-words">{ch.wordCount.toLocaleString()}w</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Reader Pane */}
        {(viewMode === 'reader' || viewMode === 'split') && (
          <div className="wb-epub-reader-pane" ref={readerScrollRef}>
            <div
              className="wb-epub-content-column"
              style={{
                fontSize: `${fontSize}px`,
                lineHeight: 1.7,
              }}
            >
              {/* Book Header Meta */}
              <div className="wb-epub-book-header">
                <h1 className="wb-epub-book-title">{bookData.title}</h1>
                {bookData.author && (
                  <div className="wb-epub-book-author">By {bookData.author}</div>
                )}
                <div className="wb-epub-chapter-banner">
                  <span>Chapter {currentChapterIndex + 1} of {bookData.totalChapters}</span>
                  {currentChapter && <span>• {currentChapter.wordCount.toLocaleString()} words</span>}
                </div>
              </div>

              {/* Rendered Chapter HTML */}
              {currentChapter ? (
                <div
                  className="wb-epub-rendered-html"
                  onClick={handleRenderedHtmlClick}
                  dangerouslySetInnerHTML={{ __html: currentChapter.html }}
                />
              ) : (
                <div className="wb-epub-empty-chapter">No content in this chapter</div>
              )}

              {/* Chapter Footer Navigation */}
              <div className="wb-epub-chapter-footer">
                <button
                  className="wb-chapter-nav-btn prev"
                  onClick={handlePrevChapter}
                  disabled={currentChapterIndex === 0}
                >
                  <ChevronLeft size={16} />
                  <span>Previous Chapter</span>
                </button>
                <span className="wb-chapter-progress">
                  Chapter {currentChapterIndex + 1} / {bookData.totalChapters}
                </span>
                <button
                  className="wb-chapter-nav-btn next"
                  onClick={handleNextChapter}
                  disabled={currentChapterIndex >= bookData.totalChapters - 1}
                >
                  <span>Next Chapter</span>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Companion Notes Pane */}
        {(viewMode === 'notes' || viewMode === 'split') && (
          <div className="wb-epub-notes-pane">
            <div className="wb-notes-mini-toolbar">
              <div className="wb-notes-title">
                <Bookmark size={13} className="text-teal" />
                <span>Companion Notes ({fileName}.notes.md)</span>
              </div>
              <div className="wb-notes-stats">
                <span>{notesContent.trim().length} chars</span>
              </div>
            </div>
            <textarea
              ref={textareaRef}
              className="wb-notes-textarea"
              value={notesContent}
              onChange={(e) => {
                setNotesContent(e.target.value)
                setIsDirty(true)
                hasUserEdited.current = true
              }}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                  e.preventDefault()
                  handleSaveNotes()
                }
              }}
              placeholder="Take notes, highlights, or paste insights from this book..."
            />
          </div>
        )}
      </div>
    </div>
  )
}
export default EpubEditor
