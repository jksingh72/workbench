import React, { useState, useRef, useEffect } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Home,
  ZoomIn,
  ZoomOut,
  Sparkles,
  ChevronDown,
  BookOpen,
  Bot,
  Lightbulb,
  FileText,
  Code2,
  HelpCircle,
  ClipboardCopy,
  Check,
  KeyRound,
  BookMarked,
  Settings2,
  Folder
} from 'lucide-react'
import { NavState, BookSource, AISource, NoteSource } from '../types/electron'

interface PaneToolbarProps {
  target: 'book' | 'ai' | 'note'
  navState: NavState
  onNavAction: (command: 'back' | 'forward' | 'reload' | 'home' | 'zoom-in' | 'zoom-out' | 'zoom-reset') => void
  onAskAI?: (templateKey: 'explain' | 'summarize' | 'code' | 'quiz' | 'raw' | 'custom', customPrompt?: string) => void
  onShowNativeMenu?: () => void
  onOpenSessionModal?: (target: 'book' | 'ai' | 'note') => void
  onClipToNote?: () => void
  bookSources?: BookSource[]
  activeBookSourceId?: string
  onSelectBookSource?: (sourceId: string) => void
  onOpenBookSourceModal?: () => void
  aiSources?: AISource[]
  activeAISourceId?: string
  onOpenAISourceModal?: () => void
  noteSources?: NoteSource[]
  activeNoteSourceId?: string
  onOpenNoteSourceModal?: () => void
  isAskingAI?: boolean
}

export const PaneToolbar: React.FC<PaneToolbarProps> = ({
  target,
  navState,
  onNavAction,
  onAskAI,
  onShowNativeMenu,
  onOpenSessionModal,
  onClipToNote,
  bookSources = [],
  activeBookSourceId = 'oreilly',
  onOpenBookSourceModal,
  aiSources = [],
  activeAISourceId = 'chatgpt',
  onOpenAISourceModal,
  noteSources = [],
  activeNoteSourceId = 'onenote',
  onOpenNoteSourceModal,
  isAskingAI = false,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const bookSourceRef = useRef<HTMLDivElement>(null)

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
        setShowCustomInput(false)
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [dropdownOpen])

  const handleSelectTemplate = (key: 'explain' | 'summarize' | 'code' | 'quiz' | 'raw') => {
    setDropdownOpen(false)
    setShowCustomInput(false)
    onAskAI?.(key)
  }

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!customPrompt.trim()) return
    setDropdownOpen(false)
    setShowCustomInput(false)
    onAskAI?.('custom', customPrompt.trim())
    setCustomPrompt('')
  }

  const isBook = target === 'book'
  const isAI = target === 'ai'
  const isNote = target === 'note'

  const zoomPercent = Math.round((navState.zoomFactor || 1) * 100)

  const activeSource = bookSources.find((s) => s.id === activeBookSourceId) || {
    id: 'oreilly',
    name: "O'Reilly Learning",
    url: 'https://www.oreilly.com/member/login/',
  }

  const activeAISource = aiSources.find((s) => s.id === activeAISourceId) || {
    id: 'chatgpt',
    name: 'ChatGPT',
    url: 'https://chatgpt.com/',
  }

  const activeNoteSource = noteSources.find((s) => s.id === activeNoteSourceId) || {
    id: 'onenote',
    name: 'Microsoft OneNote',
    url: 'https://www.onenote.com/notebooks',
  }

  const isLocalFolder =
    isNote &&
    (!!activeNoteSource.isLocal ||
      activeNoteSource.id === 'local-explorer' ||
      activeNoteSource.id === 'local' ||
      (!!activeNoteSource.url && !activeNoteSource.url.startsWith('http://') && !activeNoteSource.url.startsWith('https://')))

  const isLocalNote = isLocalFolder

  const toolbarClass = isBook
    ? 'book-toolbar'
    : isAI
      ? 'ai-toolbar'
      : 'note-toolbar'

  return (
    <div className={`pane-toolbar ${toolbarClass}`}>
      {/* Left section: Identity & Navigation */}
      <div className="toolbar-section-left">
        {isBook && (
          <div className="book-source-selector-wrapper" ref={bookSourceRef}>
            <button
              className="pane-tag tag-oreilly book-selector-btn"
              onClick={() => {
                if (window.electron?.showBookSourceMenu) {
                  window.electron.showBookSourceMenu()
                } else {
                  onOpenBookSourceModal?.()
                }
              }}
              title="Click to switch reading platform (O'Reilly, Kindle, etc.)"
            >
              <BookOpen size={13} />
              <span className="tag-label">{activeSource.name}</span>
              <ChevronDown size={11} className="selector-chevron" />
            </button>

            <button
              className="configure-sources-quick-btn"
              onClick={onOpenBookSourceModal}
              title="Configure Book Sites (Add, edit, remove book websites)"
            >
              <Settings2 size={12} className="config-icon" />
              <span>Configure</span>
            </button>
          </div>
        )}

        {isAI && (
          <div className="ai-source-selector-wrapper">
            <button
              className="pane-tag tag-chatgpt ai-selector-btn"
              onClick={() => {
                if (window.electron?.showAISourceMenu) {
                  window.electron.showAISourceMenu()
                } else {
                  onOpenAISourceModal?.()
                }
              }}
              title="Click to switch AI assistant (ChatGPT, Claude, Gemini, etc.)"
            >
              <Bot size={13} />
              <span className="tag-label">{activeAISource.name}</span>
              <ChevronDown size={11} className="selector-chevron" />
            </button>

            <button
              className="configure-sources-quick-btn configure-ai-btn"
              onClick={onOpenAISourceModal}
              title="Configure AI Platforms (Add, edit, remove AI websites)"
            >
              <Settings2 size={12} className="config-icon" />
              <span>Configure</span>
            </button>
          </div>
        )}

        {isNote && (
          <div className="note-source-selector-wrapper">
            <button
              className="pane-tag tag-onenote note-selector-btn"
              onClick={() => {
                if (window.electron?.showNoteSourceMenu) {
                  window.electron.showNoteSourceMenu()
                } else {
                  onOpenNoteSourceModal?.()
                }
              }}
              title="Click to switch note platform (OneNote, Evernote, Local Notes, etc.)"
            >
              {isLocalFolder ? <Folder size={13} className="text-cyan" /> : <BookMarked size={13} />}
              <span className="tag-label">{activeNoteSource.name}</span>
              <ChevronDown size={11} className="selector-chevron" />
            </button>

            <button
              className="configure-sources-quick-btn configure-note-btn"
              onClick={onOpenNoteSourceModal}
              title="Configure Note Platforms (OneNote, Evernote, Notion, Keep, custom sites)"
            >
              <Settings2 size={12} className="config-icon" />
              <span>Configure</span>
            </button>
          </div>
        )}

        <div className="nav-buttons">
          <button
            className="nav-btn"
            disabled={isLocalNote || !navState.canGoBack}
            onClick={() => onNavAction('back')}
            title="Go Back"
          >
            <ArrowLeft size={13} />
          </button>
          <button
            className="nav-btn"
            disabled={isLocalNote || !navState.canGoForward}
            onClick={() => onNavAction('forward')}
            title="Go Forward"
          >
            <ArrowRight size={13} />
          </button>
          <button
            className={`nav-btn ${navState.isLoading && !isLocalNote ? 'loading' : ''}`}
            disabled={isLocalNote}
            onClick={() => onNavAction('reload')}
            title="Reload Page"
          >
            <RotateCw size={13} className={navState.isLoading && !isLocalNote ? 'spin' : ''} />
          </button>
          <button
            className="nav-btn"
            disabled={isLocalNote}
            onClick={() => onNavAction('home')}
            title={
              isBook
                ? `${activeSource.name} Home`
                : isAI
                  ? `${activeAISource.name} Home`
                  : `${activeNoteSource.name} Home`
            }
          >
            <Home size={13} />
          </button>
        </div>
      </div>

      {/* Center section: Page info */}
      <div className="toolbar-section-center">
        <span
          className="url-display"
          title={
            navState.url ||
            (isBook
              ? activeSource.name
              : isAI
                ? activeAISource.name
                : activeNoteSource.name)
          }
        >
          {navState.title ||
            (isBook
              ? activeSource.name
              : isAI
                ? `${activeAISource.name} Assistant`
                : activeNoteSource.name)}
        </span>
      </div>

      {/* Right section: Actions & Zoom */}
      <div className="toolbar-section-right">
        {isBook && (
          <>
            {/* Zoom Controls */}
            <div className="zoom-controls">
              <button
                className="zoom-btn"
                onClick={() => onNavAction('zoom-out')}
                title="Zoom Out"
              >
                <ZoomOut size={12} />
              </button>
              <button
                className="zoom-reset-btn"
                onClick={() => onNavAction('zoom-reset')}
                title="Reset Zoom to 100%"
              >
                {zoomPercent}%
              </button>
              <button
                className="zoom-btn"
                onClick={() => onNavAction('zoom-in')}
                title="Zoom In"
              >
                <ZoomIn size={12} />
              </button>
            </div>

            {/* "Ask AI" Action Dropdown */}
            <div className="ask-ai-wrapper" ref={dropdownRef}>
              <button
                className={`ask-ai-btn ${dropdownOpen ? 'active' : ''} ${isAskingAI ? 'pulsing' : ''}`}
                onClick={() => {
                  if (onShowNativeMenu) {
                    onShowNativeMenu()
                  } else {
                    setDropdownOpen(!dropdownOpen)
                  }
                }}
                title="Send highlighted text to ChatGPT with a preset prompt"
              >
                <Sparkles size={13} className="sparkle-icon" />
                <span className="btn-text">Ask AI</span>
                <ChevronDown size={12} className={`chevron ${dropdownOpen ? 'open' : ''}`} />
              </button>

              {dropdownOpen && (
                <div className="ask-ai-dropdown">
                  <div className="dropdown-header">
                    <span>Transfer Highlighted Text to AI:</span>
                  </div>

                  <button
                    className="dropdown-item"
                    onClick={() => handleSelectTemplate('explain')}
                  >
                    <Lightbulb size={14} className="item-icon icon-bulb" />
                    <div className="item-text">
                      <span className="item-title">Explain Concept</span>
                      <span className="item-desc">Explains clearly in simple terms with examples</span>
                    </div>
                  </button>

                  <button
                    className="dropdown-item"
                    onClick={() => handleSelectTemplate('summarize')}
                  >
                    <FileText size={14} className="item-icon icon-summary" />
                    <div className="item-text">
                      <span className="item-title">Summarize</span>
                      <span className="item-desc">Extracts key takeaways and summary points</span>
                    </div>
                  </button>

                  <button
                    className="dropdown-item"
                    onClick={() => handleSelectTemplate('code')}
                  >
                    <Code2 size={14} className="item-icon icon-code" />
                    <div className="item-text">
                      <span className="item-title">Code Example</span>
                      <span className="item-desc">Generates practical working code demo</span>
                    </div>
                  </button>

                  <button
                    className="dropdown-item"
                    onClick={() => handleSelectTemplate('quiz')}
                  >
                    <HelpCircle size={14} className="item-icon icon-quiz" />
                    <div className="item-text">
                      <span className="item-title">Quiz Me</span>
                      <span className="item-desc">Generates 3 test questions to test retention</span>
                    </div>
                  </button>

                  <button
                    className="dropdown-item"
                    onClick={() => handleSelectTemplate('raw')}
                  >
                    <ClipboardCopy size={14} className="item-icon icon-copy" />
                    <div className="item-text">
                      <span className="item-title">Paste Raw Selection</span>
                      <span className="item-desc">Transfers text directly without template</span>
                    </div>
                  </button>

                  <div className="dropdown-divider" />

                  {showCustomInput ? (
                    <form className="custom-prompt-form" onSubmit={handleCustomSubmit}>
                      <input
                        type="text"
                        autoFocus
                        placeholder="e.g. Translate to Python, critique, etc."
                        value={customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        className="custom-input"
                      />
                      <button type="submit" className="custom-submit-btn">
                        <Check size={12} />
                      </button>
                    </form>
                  ) : (
                    <button
                      className="dropdown-item custom-trigger"
                      onClick={() => setShowCustomInput(true)}
                    >
                      <Sparkles size={13} className="item-icon" />
                      <span>Custom Prompt...</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Clip to OneNote button */}
            <button
              className="clip-note-btn"
              onClick={onClipToNote}
              title="Clip highlighted text from book directly into OneNote"
            >
              <BookMarked size={12} className="text-purple" />
              <span>Clip to Note</span>
            </button>
          </>
        )}

        {/* Delete Login / Credentials button */}
        <button
          className="session-manage-btn"
          onClick={() => onOpenSessionModal?.(target)}
          title={`Delete saved login and credentials for ${
            isBook
              ? activeSource.name
              : isAI
                ? activeAISource.name
                : activeNoteSource.name
          }`}
        >
          <KeyRound size={12} className="key-icon" />
          <span className="session-manage-label">Delete Login</span>
        </button>

        {isAI && (
          <div className="ai-status-badge" title={`Connected to ${activeAISource.name} web view`}>
            <span className="ai-active-indicator" />
            <span>Ready for prompts</span>
          </div>
        )}

        {isNote && (
          <div
            className="note-status-badge"
            title={
              isLocalNote
                ? 'Workbench Local Notes'
                : `Connected to ${activeNoteSource.name}`
            }
          >
            <span
              className={`note-active-indicator ${
                isLocalNote ? 'indicator-local' : 'indicator-cloud'
              }`}
            />
            <span>{isLocalNote ? 'Local Notes' : 'Connected'}</span>
          </div>
        )}
      </div>
    </div>
  )
}
