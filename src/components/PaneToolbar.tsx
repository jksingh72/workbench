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
  Folder,
  Zap
} from 'lucide-react'
import { NavState, BookSource, AISource, NoteSource } from '../types/electron'
import { ActionModeModal } from './ActionModeModal'

interface PaneToolbarProps {
  target: 'book' | 'ai' | 'note'
  navState: NavState
  onNavAction: (command: 'back' | 'forward' | 'reload' | 'home' | 'zoom-in' | 'zoom-out' | 'zoom-reset') => void
  onAskAI?: (templateKey: 'explain' | 'summarize' | 'code' | 'quiz' | 'raw' | 'custom', customPrompt?: string) => void
  onShowNativeMenu?: () => void
  onOpenSessionModal?: (target: 'book' | 'ai' | 'note') => void
  onClipToNote?: () => void
  onSaveAIToNote?: () => void
  onExtractAICode?: () => void
  onExportAITranscript?: () => void
  onSendNoteToAI?: () => void
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
  onSaveAIToNote,
  onExtractAICode,
  onExportAITranscript,
  onSendNoteToAI,
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
  const [actionMode, setActionMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('workbench:action-mode') === 'true'
    } catch {
      return false
    }
  })
  const [isActivatingAction, setIsActivatingAction] = useState(false)
  const [showPromptSettings, setShowPromptSettings] = useState(false)
  const [customInstructions, setCustomInstructions] = useState<string>(() => {
    try {
      return localStorage.getItem('workbench:action-custom-instructions') || ''
    } catch {
      return ''
    }
  })
  const [activeDirectory, setActiveDirectory] = useState<string>('')

  // Sync active directory and Action Mode state on mount + live folder navigation
  useEffect(() => {
    if (!isAI) return
    window.electron
      ?.getActionPrompt?.('book')
      .then((p) => {
        const match = p?.match(/Active Directory:\s*`([^`]+)`/)
        if (match && match[1]) {
          setActiveDirectory(match[1])
        }
      })
      .catch(() => {})

    const unsubDir = window.electron?.onActiveDirectoryChanged?.((data) => {
      if (data?.currentPath && (!data.target || data.target === 'book')) {
        setActiveDirectory(data.currentPath)
      }
    })

    // Ensure backend is aware of restored Action Mode state
    try {
      const savedMode = localStorage.getItem('workbench:action-mode') === 'true'
      const savedInst = localStorage.getItem('workbench:action-custom-instructions') || ''
      if (savedMode) {
        window.electron?.setActionMode?.({ enabled: true, customInstructions: savedInst })
      }
    } catch (_) {}

    return () => {
      unsubDir?.()
    }
  }, [isAI])

  const handleToggleActionMode = async () => {
    const nextState = !actionMode
    setIsActivatingAction(true)
    try {
      const res = await window.electron?.setActionMode?.({
        enabled: nextState,
        customInstructions: nextState ? customInstructions.trim() : undefined,
      })
      if (res?.success) {
        setActionMode(nextState)
        try {
          localStorage.setItem('workbench:action-mode', String(nextState))
        } catch (_) {}
        if (nextState) {
          window.electron?.showNotification?.({
            title: '⚡ Action Mode: ON',
            body: 'AI primed in background (prompt hidden). Commands will execute locally.',
            type: 'success',
          })
        } else {
          window.electron?.showNotification?.({
            title: '⚡ Action Mode: OFF',
            body: 'Automated local filesystem execution paused.',
            type: 'info',
          })
        }
      } else {
        window.electron?.showNotification?.({
          title: '⚠️ Action Mode Error',
          body: res?.error || 'Failed to toggle Action Mode',
          type: 'error',
        })
      }
    } catch (err: any) {
      console.error('Toggle Action Mode error:', err)
    } finally {
      setIsActivatingAction(false)
    }
  }

  const handleSaveCustomInstructions = (newInstructions: string) => {
    setCustomInstructions(newInstructions)
    try {
      localStorage.setItem('workbench:action-custom-instructions', newInstructions)
    } catch (_) {}
  }

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

  const isLocalBook =
    isBook &&
    (!!activeSource.isLocal ||
      activeSource.id === 'local-books' ||
      activeSource.id === 'local' ||
      (!!activeSource.url && !activeSource.url.startsWith('http://') && !activeSource.url.startsWith('https://')))

  const isLocalActive = isLocalNote || isLocalBook

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
              title="Click to switch reading platform (O'Reilly, Kindle, Local Books, etc.)"
            >
              {isLocalBook ? <Folder size={13} className="text-cyan" /> : <BookOpen size={13} />}
              <span className="tag-label" title={activeSource.name}>{activeSource.name}</span>
              <ChevronDown size={11} className="selector-chevron" />
            </button>

            <button
              className="configure-sources-quick-btn"
              onClick={onOpenBookSourceModal}
              title="Configure Book Sites (Add, edit, remove book websites)"
            >
              <Settings2 size={12} className="config-icon" />
              <span className="config-btn-label">Configure</span>
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
              <span className="tag-label" title={activeAISource.name}>{activeAISource.name}</span>
              <ChevronDown size={11} className="selector-chevron" />
            </button>

            <button
              className="configure-sources-quick-btn configure-ai-btn"
              onClick={onOpenAISourceModal}
              title="Configure AI Platforms (Add, edit, remove AI websites)"
            >
              <Settings2 size={12} className="config-icon" />
              <span className="config-btn-label">Configure</span>
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
              <span className="tag-label" title={activeNoteSource.name}>{activeNoteSource.name}</span>
              <ChevronDown size={11} className="selector-chevron" />
            </button>

            <button
              className="configure-sources-quick-btn configure-note-btn"
              onClick={onOpenNoteSourceModal}
              title="Configure Note Platforms (OneNote, Evernote, Notion, Keep, custom sites)"
            >
              <Settings2 size={12} className="config-icon" />
              <span className="config-btn-label">Configure</span>
            </button>
          </div>
        )}

        <div className="nav-buttons">
          <button
            className="nav-btn"
            disabled={isLocalActive || !navState.canGoBack}
            onClick={() => onNavAction('back')}
            title="Go Back"
          >
            <ArrowLeft size={13} />
          </button>
          <button
            className="nav-btn"
            disabled={isLocalActive || !navState.canGoForward}
            onClick={() => onNavAction('forward')}
            title="Go Forward"
          >
            <ArrowRight size={13} />
          </button>
          <button
            className={`nav-btn ${navState.isLoading && !isLocalActive ? 'loading' : ''}`}
            disabled={isLocalActive}
            onClick={() => onNavAction('reload')}
            title="Reload Page"
          >
            <RotateCw size={13} className={navState.isLoading && !isLocalActive ? 'spin' : ''} />
          </button>
          <button
            className="nav-btn"
            disabled={isLocalActive}
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

        {/* Stationary Zoom Controls right next to Home */}
        <div className="zoom-controls">
          <button
            className="zoom-btn"
            onClick={() => onNavAction('zoom-out')}
            title="Zoom Out (Ctrl+-)"
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
            title="Zoom In (Ctrl++)"
          >
            <ZoomIn size={12} />
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

      {/* Right section: Actions */}
      <div className="toolbar-section-right">
        {isBook && (
          <>

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
              title="Clip highlighted text from book directly into Notes (Ctrl+Shift+N)"
            >
              <BookMarked size={12} className="text-purple" />
              <span className="action-btn-label">Clip to Note</span>
            </button>
          </>
        )}

        {isAI && (
          <>
            <button
              className="clip-note-btn ai-save-note-btn"
              onClick={onSaveAIToNote}
              title="Save selected text or latest response from AI to Notes (Ctrl+Shift+S)"
            >
              <BookMarked size={12} className="text-purple" />
              <span className="action-btn-label">Save to Note</span>
            </button>
            {onExtractAICode && (
              <button
                className="clip-note-btn ai-extract-code-btn"
                onClick={onExtractAICode}
                title="Extract code blocks from chat into project files"
              >
                <Code2 size={12} className="text-cyan" />
                <span className="action-btn-label">Extract Code</span>
              </button>
            )}
            {onExportAITranscript && (
              <button
                className="clip-note-btn ai-export-chat-btn"
                onClick={onExportAITranscript}
                title="Export full chat session as a Markdown note"
              >
                <FileText size={12} className="text-amber" />
                <span className="action-btn-label">Export Chat</span>
              </button>
            )}
            <div className="action-mode-group">
              <button
                className={`clip-note-btn action-mode-btn ${actionMode ? 'active' : 'inactive'}`}
                onClick={handleToggleActionMode}
                disabled={isActivatingAction}
                title={
                  actionMode
                    ? '⚡ Action Mode is ON: AI commands execute on your computer. Click to turn OFF.'
                    : '⚡ Action Mode is OFF. Click to turn ON (auto-primes AI in background & enables local execution).'
                }
              >
                <Zap
                  size={12}
                  className={
                    isActivatingAction
                      ? 'animate-spin text-amber'
                      : actionMode
                        ? 'text-emerald fill-emerald animate-pulse'
                        : 'text-gray-400'
                  }
                />
                <span className="action-btn-label">
                  {isActivatingAction
                    ? 'Priming AI...'
                    : actionMode
                      ? 'Action Mode: ON'
                      : 'Action Mode: OFF'}
                </span>
              </button>

              <button
                className="action-mode-config-btn"
                onClick={() => setShowPromptSettings(true)}
                title="Configure Action Mode prompt, custom instructions & rules"
              >
                <Settings2 size={11} className={customInstructions ? 'text-amber' : 'text-gray-400'} />
              </button>
            </div>

            {activeDirectory && (
              <div
                className="active-workspace-badge"
                title={`Active Working Directory: ${activeDirectory}\n(AI file commands will execute here)`}
                onClick={() => setShowPromptSettings(true)}
              >
                <Folder size={11} className="text-cyan" />
                <span className="workspace-name">
                  {activeDirectory.split(/[/\\]/).filter(Boolean).pop() || activeDirectory}
                </span>
              </div>
            )}
          </>
        )}

        {isNote && !isLocalFolder && (
          <button
            className="clip-note-btn note-send-ai-btn text-emerald"
            onClick={onSendNoteToAI}
            title="Send selection from Note to AI Chat (Ctrl+Shift+A)"
          >
            <Bot size={12} className="text-emerald" />
            <span className="action-btn-label">Send to AI</span>
          </button>
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

        {isBook && (
          <div
            className="book-status-badge"
            title={
              isLocalBook
                ? 'Workbench Local Books'
                : `Connected to ${activeSource.name}`
            }
          >
            <span
              className={`book-active-indicator ${
                isLocalBook ? 'indicator-local' : 'indicator-cloud'
              }`}
            />
            <span className="status-badge-text">{isLocalBook ? 'Local Books' : 'Connected'}</span>
          </div>
        )}

        {isAI && (
          <div className="ai-status-badge" title={`Connected to ${activeAISource.name} web view`}>
            <span className="ai-active-indicator" />
            <span className="status-badge-text">Ready for prompts</span>
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
            <span className="status-badge-text">{isLocalNote ? 'Local Notes' : 'Connected'}</span>
          </div>
        )}
      </div>

      {isAI && (
        <ActionModeModal
          isOpen={showPromptSettings}
          onClose={() => setShowPromptSettings(false)}
          actionMode={actionMode}
          onToggleActionMode={handleToggleActionMode}
          customInstructions={customInstructions}
          onSaveCustomInstructions={handleSaveCustomInstructions}
          activeDirectory={activeDirectory}
          onNotify={(msg) => {
            try {
              window.electron?.showNotification?.({
                title: '⚡ Action Mode',
                body: msg,
                type: msg.includes('❌') || msg.includes('⚠️') ? 'error' : 'info',
              })
            } catch (_) {}
          }}
        />
      )}
    </div>
  )
}
