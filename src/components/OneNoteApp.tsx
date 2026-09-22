import React, { useState, useEffect, useRef } from 'react'
import {
  BookMarked,
  Plus,
  Trash2,
  Search,
  CheckSquare,
  FileDown,
  Bold,
  Italic,
  Strikethrough,
  Code,
  List,
  ListOrdered,
  Quote,
  Highlighter,
  Heading1,
  Heading2,
  Heading3,
  Calendar,
  ClipboardCopy,
  Check,
  ChevronLeft,
  ChevronRight,
  KeyRound
} from 'lucide-react'
import { NoteBook, NoteSection, NotePage } from '../types/electron'

const SECTION_COLORS = [
  '#9333ea', // Purple (Classic OneNote)
  '#2563eb', // Blue
  '#0d9488', // Teal
  '#16a34a', // Green
  '#ea580c', // Orange
  '#db2777', // Pink
  '#dc2626', // Red
]

const DEFAULT_NOTEBOOKS: NoteBook[] = [
  {
    id: 'nb-default',
    name: 'My Workbench Notebook',
    sections: [
      {
        id: 'sec-quick-notes',
        name: 'Quick Notes',
        color: '#9333ea',
        pages: [
          {
            id: 'page-welcome',
            title: 'Welcome to your OneNote Notebook',
            content: `# Welcome to OneNote for Workbench! 📒\n\nThis note pane is integrated directly with your **O'Reilly Books** and **ChatGPT AI**.\n\n### Key Features:\n- [x] **Section Tabs**: Organize notes by topic or book with OneNote colors.\n- [x] **Pages**: Create multiple pages in each section.\n- [ ] **Highlight Clipping**: Select text in O'Reilly and click **"Clip to Note"** to save quotes instantly.\n- [ ] **Rich Formatting**: Use headers, checklists, code snippets, and highlighters.\n- [ ] **Auto-Save**: Everything you write is saved locally automatically.\n\n### Sample Code Snippet:\n\`\`\`typescript\n// Transfer insights seamlessly between O'Reilly, AI, and Notes\nfunction studyWorkflow(bookExcerpt: string, aiExplanation: string) {\n  return saveToNote({ bookExcerpt, aiExplanation });\n}\n\`\`\`\n\n> "Taking notes while reading reinforces retention and accelerates learning."\n`,
            createdAt: Date.now() - 3600000,
            updatedAt: Date.now(),
          },
        ],
      },
      {
        id: 'sec-reading-insights',
        name: 'Reading Insights',
        color: '#2563eb',
        pages: [
          {
            id: 'page-sample-reading',
            title: 'Book Takeaways & Concepts',
            content: `## Architecture Patterns & Insights\n\nUse this section to clip excerpts directly from O'Reilly books while reading.\n\n### Key Principles:\n- High cohesion, loose coupling\n- Single responsibility principle\n- Event-driven communication\n\n---`,
            createdAt: Date.now() - 7200000,
            updatedAt: Date.now() - 3600000,
          },
        ],
      },
      {
        id: 'sec-code-ai',
        name: 'Code & AI',
        color: '#0d9488',
        pages: [
          {
            id: 'page-ai-prompts',
            title: 'ChatGPT Prompts & Recipes',
            content: `## Favorite Prompts for ChatGPT\n\n1. Explain this concept in simple terms with an analogy\n2. Provide production-ready TypeScript code with unit tests\n3. Generate 3 quiz questions to test retention\n`,
            createdAt: Date.now() - 86400000,
            updatedAt: Date.now() - 43200000,
          },
        ],
      },
      {
        id: 'sec-tasks',
        name: 'Action Items',
        color: '#ea580c',
        pages: [
          {
            id: 'page-todo',
            title: 'Study Goals & Tasks',
            content: `## Study Tasks\n\n- [ ] Finish Chapter 3 in current O'Reilly book\n- [ ] Ask ChatGPT to explain reactive architecture\n- [ ] Implement sample prototype\n- [x] Set up dual-pane workbench\n`,
            createdAt: Date.now() - 172800000,
            updatedAt: Date.now() - 86400000,
          },
        ],
      },
    ],
  },
]

interface OneNoteAppProps {
  onNotify: (msg: string) => void
  clippedText?: string | null
  onClearClippedText?: () => void
  onOpenSessionModal?: () => void
  resetTrigger?: number
}

export const OneNoteApp: React.FC<OneNoteAppProps> = ({
  onNotify,
  clippedText,
  onClearClippedText,
  onOpenSessionModal,
  resetTrigger,
}) => {
  const [notebooks, setNotebooks] = useState<NoteBook[]>(DEFAULT_NOTEBOOKS)
  const [activeSectionId, setActiveSectionId] = useState<string>('sec-quick-notes')
  const [activePageId, setActivePageId] = useState<string>('page-welcome')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true)
  const [copiedSuccess, setCopiedSuccess] = useState<boolean>(false)
  const [saveStatus, setSaveStatus] = useState<string>('Saved')

  const editorRef = useRef<HTMLTextAreaElement>(null)
  const saveTimeoutRef = useRef<any>(null)

  // Load notes on mount from Electron persistent storage
  useEffect(() => {
    if (window.electron?.loadNotes) {
      window.electron.loadNotes().then((loaded) => {
        if (loaded && loaded.length > 0) {
          setNotebooks(loaded)
          const firstSection = loaded[0]?.sections?.[0]
          if (firstSection) {
            setActiveSectionId(firstSection.id)
            if (firstSection.pages?.[0]) {
              setActivePageId(firstSection.pages[0].id)
            }
          }
        }
      })
    }
  }, [])

  // Reset to default notebooks if triggered by clearing session
  useEffect(() => {
    if (resetTrigger && resetTrigger > 0) {
      setNotebooks(DEFAULT_NOTEBOOKS)
      setActiveSectionId('sec-quick-notes')
      setActivePageId('page-welcome')
      setSaveStatus('Reset to default')
    }
  }, [resetTrigger])

  // Auto-save changes to persistent storage
  const persistNotes = (updated: NoteBook[]) => {
    setSaveStatus('Saving...')
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => {
      if (window.electron?.saveNotes) {
        window.electron.saveNotes(updated).then((res) => {
          if (res.success) setSaveStatus('Saved')
          else setSaveStatus('Error saving')
        })
      } else {
        setSaveStatus('Saved')
      }
    }, 400)
  }

  // Handle incoming clipped text from O'Reilly or ChatGPT
  useEffect(() => {
    if (!clippedText) return

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const snippet = `\n\n> **Clipped at ${timestamp}:**\n> "${clippedText.replace(/\n/g, '\n> ')}"\n`

    setNotebooks((prev) => {
      const next = prev.map((nb) => ({
        ...nb,
        sections: nb.sections.map((sec) => {
          if (sec.id !== activeSectionId) return sec
          return {
            ...sec,
            pages: sec.pages.map((p) => {
              if (p.id !== activePageId) return p
              return {
                ...p,
                content: p.content + snippet,
                updatedAt: Date.now(),
              }
            }),
          }
        }),
      }))
      persistNotes(next)
      return next
    })

    onNotify('📝 Clipped text appended to your active OneNote page!')
    onClearClippedText?.()
  }, [clippedText, activeSectionId, activePageId])

  const activeNotebook = notebooks[0]
  const activeSection =
    activeNotebook?.sections.find((s) => s.id === activeSectionId) || activeNotebook?.sections[0]
  const activePage =
    activeSection?.pages.find((p) => p.id === activePageId) || activeSection?.pages[0]

  // Add new section
  const handleAddSection = () => {
    const name = prompt('Enter new Section name:', 'New Section')
    if (!name || !name.trim()) return

    const nextColorIndex = (activeNotebook?.sections.length || 0) % SECTION_COLORS.length
    const newPage: NotePage = {
      id: `page-${Date.now()}`,
      title: 'Untitled Page',
      content: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    const newSection: NoteSection = {
      id: `sec-${Date.now()}`,
      name: name.trim(),
      color: SECTION_COLORS[nextColorIndex],
      pages: [newPage],
    }

    const nextNotebooks = notebooks.map((nb, i) =>
      i === 0 ? { ...nb, sections: [...nb.sections, newSection] } : nb
    )
    setNotebooks(nextNotebooks)
    setActiveSectionId(newSection.id)
    setActivePageId(newPage.id)
    persistNotes(nextNotebooks)
    onNotify(`✨ Created new section "${newSection.name}"`)
  }

  // Delete section
  const handleDeleteSection = (secId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (activeNotebook.sections.length <= 1) {
      alert('You must keep at least one section in the notebook.')
      return
    }
    if (!confirm('Are you sure you want to delete this section and all its pages?')) return

    const nextSections = activeNotebook.sections.filter((s) => s.id !== secId)
    const nextNotebooks = notebooks.map((nb, i) =>
      i === 0 ? { ...nb, sections: nextSections } : nb
    )
    setNotebooks(nextNotebooks)
    if (activeSectionId === secId) {
      const first = nextSections[0]
      setActiveSectionId(first.id)
      if (first.pages[0]) setActivePageId(first.pages[0].id)
    }
    persistNotes(nextNotebooks)
    onNotify('🗑️ Section deleted')
  }

  // Add new page
  const handleAddPage = () => {
    if (!activeSection) return
    const newPage: NotePage = {
      id: `page-${Date.now()}`,
      title: 'Untitled Page',
      content: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    const nextNotebooks = notebooks.map((nb, i) => {
      if (i !== 0) return nb
      return {
        ...nb,
        sections: nb.sections.map((sec) => {
          if (sec.id !== activeSection.id) return sec
          return {
            ...sec,
            pages: [newPage, ...sec.pages],
          }
        }),
      }
    })
    setNotebooks(nextNotebooks)
    setActivePageId(newPage.id)
    persistNotes(nextNotebooks)
  }

  // Delete page
  const handleDeletePage = (pageId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!activeSection) return
    if (activeSection.pages.length <= 1) {
      alert('A section must have at least one page.')
      return
    }
    const nextPages = activeSection.pages.filter((p) => p.id !== pageId)
    const nextNotebooks = notebooks.map((nb, i) => {
      if (i !== 0) return nb
      return {
        ...nb,
        sections: nb.sections.map((sec) => {
          if (sec.id !== activeSection.id) return sec
          return { ...sec, pages: nextPages }
        }),
      }
    })
    setNotebooks(nextNotebooks)
    if (activePageId === pageId) {
      setActivePageId(nextPages[0].id)
    }
    persistNotes(nextNotebooks)
  }

  // Update active page title
  const handleTitleChange = (title: string) => {
    if (!activePage || !activeSection) return
    const nextNotebooks = notebooks.map((nb, i) => {
      if (i !== 0) return nb
      return {
        ...nb,
        sections: nb.sections.map((sec) => {
          if (sec.id !== activeSection.id) return sec
          return {
            ...sec,
            pages: sec.pages.map((p) => {
              if (p.id !== activePage.id) return p
              return { ...p, title, updatedAt: Date.now() }
            }),
          }
        }),
      }
    })
    setNotebooks(nextNotebooks)
    persistNotes(nextNotebooks)
  }

  // Update active page content
  const handleContentChange = (content: string) => {
    if (!activePage || !activeSection) return
    const nextNotebooks = notebooks.map((nb, i) => {
      if (i !== 0) return nb
      return {
        ...nb,
        sections: nb.sections.map((sec) => {
          if (sec.id !== activeSection.id) return sec
          return {
            ...sec,
            pages: sec.pages.map((p) => {
              if (p.id !== activePage.id) return p
              return { ...p, content, updatedAt: Date.now() }
            }),
          }
        }),
      }
    })
    setNotebooks(nextNotebooks)
    persistNotes(nextNotebooks)
  }

  // Formatting helpers: insert text/markdown at cursor position
  const insertFormatting = (prefix: string, suffix = '') => {
    const textarea = editorRef.current
    if (!textarea || !activePage) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selectedText = textarea.value.substring(start, end)
    const replacement = prefix + (selectedText || 'text') + suffix

    const newContent =
      textarea.value.substring(0, start) + replacement + textarea.value.substring(end)

    handleContentChange(newContent)

    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(
        start + prefix.length,
        start + prefix.length + (selectedText.length || 4)
      )
    }, 20)
  }

  // Export note to Markdown file
  const handleExportNote = () => {
    if (!activePage) return
    const blob = new Blob([activePage.content], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${activePage.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'note'}.md`
    a.click()
    URL.revokeObjectURL(url)
    onNotify(`📥 Downloaded note "${activePage.title}.md"`)
  }

  // Copy note to clipboard
  const handleCopyNote = () => {
    if (!activePage) return
    navigator.clipboard.writeText(`# ${activePage.title}\n\n${activePage.content}`)
    setCopiedSuccess(true)
    setTimeout(() => setCopiedSuccess(false), 2000)
    onNotify('📋 Note copied to clipboard!')
  }

  // Filter pages by search query
  const filteredPages = (activeSection?.pages || []).filter(
    (p) =>
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.content.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const activeColor = activeSection?.color || '#9333ea'

  return (
    <div className="onenote-container">
      {/* Top App Toolbar: OneNote Branding, Search, New Actions */}
      <div className="onenote-top-bar">
        <div className="onenote-brand">
          <div className="onenote-logo-badge">
            <BookMarked size={14} className="onenote-logo-icon" />
          </div>
          <span className="onenote-title">OneNote</span>
          <span className="save-status-pill">{saveStatus}</span>
        </div>

        {/* Search Notes */}
        <div className="onenote-search-box">
          <Search size={12} className="search-icon" />
          <input
            type="text"
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>

        {/* Global Toolbar Actions */}
        <div className="onenote-top-actions">
          <button className="onenote-btn" onClick={handleAddPage} title="Add new page in current section">
            <Plus size={13} />
            <span>Page</span>
          </button>
          <button className="onenote-btn" onClick={handleAddSection} title="Add new section tab">
            <Plus size={13} />
            <span>Section</span>
          </button>
          <button className="onenote-icon-btn" onClick={handleExportNote} title="Export as Markdown (.md)">
            <FileDown size={13} />
          </button>
          <button className="onenote-icon-btn" onClick={handleCopyNote} title="Copy full note to clipboard">
            {copiedSuccess ? <Check size={13} className="text-emerald" /> : <ClipboardCopy size={13} />}
          </button>

          {/* Delete Login / Saved Notes button */}
          <button
            className="session-manage-btn onenote-delete-login-btn"
            onClick={onOpenSessionModal}
            title="Delete saved notes, session state, and manage OneNote storage"
          >
            <KeyRound size={12} className="key-icon" />
            <span className="session-manage-label">Delete Login</span>
          </button>
        </div>
      </div>

      {/* Section Tabs (Horizontal Color-coded Tabs like OneNote) */}
      <div className="onenote-section-tabs">
        <div className="section-tabs-scroll">
          {activeNotebook?.sections.map((sec) => {
            const isActive = sec.id === activeSectionId
            return (
              <div
                key={sec.id}
                className={`section-tab ${isActive ? 'active' : ''}`}
                style={{
                  borderTopColor: isActive ? sec.color : 'transparent',
                  backgroundColor: isActive ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
                }}
                onClick={() => {
                  setActiveSectionId(sec.id)
                  if (sec.pages[0]) setActivePageId(sec.pages[0].id)
                }}
              >
                <span className="tab-color-dot" style={{ backgroundColor: sec.color }} />
                <span className="tab-name">{sec.name}</span>
                <span className="tab-count">{sec.pages.length}</span>
                {activeNotebook.sections.length > 1 && (
                  <button
                    className="tab-delete-btn"
                    onClick={(e) => handleDeleteSection(sec.id, e)}
                    title="Delete section"
                  >
                    ×
                  </button>
                )}
              </div>
            )
          })}
        </div>

        <button className="add-section-plus" onClick={handleAddSection} title="New Section">
          <Plus size={13} />
        </button>
      </div>

      {/* Main Workspace: Sidebar (Page List) + Canvas (Editor) */}
      <div className="onenote-workspace">
        {/* Page List Sidebar */}
        <div className={`onenote-pages-sidebar ${isSidebarOpen ? 'open' : 'collapsed'}`}>
          <div className="sidebar-header">
            <span className="sidebar-section-title" style={{ color: activeColor }}>
              {activeSection?.name}
            </span>
            <div className="sidebar-header-actions">
              <button className="sidebar-icon-btn" onClick={handleAddPage} title="New Page">
                <Plus size={12} />
              </button>
              <button
                className="sidebar-icon-btn"
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                title={isSidebarOpen ? 'Collapse page list' : 'Expand page list'}
              >
                {isSidebarOpen ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
              </button>
            </div>
          </div>

          {isSidebarOpen && (
            <div className="pages-list">
              {filteredPages.map((page) => {
                const isActive = page.id === activePageId
                const dateStr = new Date(page.updatedAt).toLocaleDateString([], {
                  month: 'short',
                  day: 'numeric',
                })
                return (
                  <div
                    key={page.id}
                    className={`page-card ${isActive ? 'active' : ''}`}
                    onClick={() => setActivePageId(page.id)}
                    style={{ borderLeftColor: isActive ? activeColor : 'transparent' }}
                  >
                    <div className="page-card-header">
                      <span className="page-card-title">{page.title || 'Untitled Page'}</span>
                      {activeSection && activeSection.pages.length > 1 && (
                        <button
                          className="page-delete-btn"
                          onClick={(e) => handleDeletePage(page.id, e)}
                          title="Delete page"
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                    <div className="page-card-meta">
                      <span className="page-card-date">{dateStr}</span>
                      <span className="page-card-snippet">
                        {page.content ? page.content.slice(0, 45).replace(/[#*`_>]/g, '') : 'No content'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Note Editor Canvas */}
        <div className="onenote-canvas">
          {activePage ? (
            <>
              {/* OneNote Ribbon / Formatting Bar */}
              <div className="onenote-ribbon">
                <div className="ribbon-group">
                  <button className="ribbon-btn" onClick={() => insertFormatting('# ')} title="Heading 1">
                    <Heading1 size={13} />
                  </button>
                  <button className="ribbon-btn" onClick={() => insertFormatting('## ')} title="Heading 2">
                    <Heading2 size={13} />
                  </button>
                  <button className="ribbon-btn" onClick={() => insertFormatting('### ')} title="Heading 3">
                    <Heading3 size={13} />
                  </button>
                </div>

                <div className="ribbon-divider" />

                <div className="ribbon-group">
                  <button className="ribbon-btn" onClick={() => insertFormatting('**', '**')} title="Bold (Ctrl+B)">
                    <Bold size={13} />
                  </button>
                  <button className="ribbon-btn" onClick={() => insertFormatting('*', '*')} title="Italic (Ctrl+I)">
                    <Italic size={13} />
                  </button>
                  <button className="ribbon-btn" onClick={() => insertFormatting('~~', '~~')} title="Strikethrough">
                    <Strikethrough size={13} />
                  </button>
                  <button className="ribbon-btn" onClick={() => insertFormatting('`', '`')} title="Inline Code">
                    <Code size={13} />
                  </button>
                </div>

                <div className="ribbon-divider" />

                <div className="ribbon-group">
                  <button className="ribbon-btn" onClick={() => insertFormatting('- [ ] ')} title="Task / To-Do Checkbox">
                    <CheckSquare size={13} className="text-amber" />
                  </button>
                  <button className="ribbon-btn" onClick={() => insertFormatting('- ')} title="Bullet List">
                    <List size={13} />
                  </button>
                  <button className="ribbon-btn" onClick={() => insertFormatting('1. ')} title="Numbered List">
                    <ListOrdered size={13} />
                  </button>
                  <button className="ribbon-btn" onClick={() => insertFormatting('> ')} title="Quote Block">
                    <Quote size={13} />
                  </button>
                  <button className="ribbon-btn" onClick={() => insertFormatting('```\n', '\n```')} title="Code Block">
                    <span className="code-block-btn">{'{}'}</span>
                  </button>
                  <button className="ribbon-btn" onClick={() => insertFormatting('==', '==')} title="Highlight">
                    <Highlighter size={13} className="text-yellow" />
                  </button>
                </div>

                <div className="ribbon-spacer" />

                <div className="ribbon-meta">
                  <Calendar size={11} />
                  <span>
                    {new Date(activePage.updatedAt).toLocaleDateString([], {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>

              {/* Note Page Header & Body */}
              <div className="onenote-page-content">
                <input
                  type="text"
                  className="note-title-input"
                  placeholder="Page Title"
                  value={activePage.title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                />

                <textarea
                  ref={editorRef}
                  className="note-body-textarea"
                  placeholder="Type your notes here... (Supports Markdown, To-Do checklists, code snippets)"
                  value={activePage.content}
                  onChange={(e) => handleContentChange(e.target.value)}
                />
              </div>
            </>
          ) : (
            <div className="no-page-placeholder">
              <BookMarked size={32} className="placeholder-icon" />
              <p>No page selected</p>
              <button className="btn-primary-done" onClick={handleAddPage}>
                Create Page
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
