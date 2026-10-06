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
  Zap,
  Power
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
  actionMode?: boolean
  onToggleActionMode?: () => void
  isActivatingAction?: boolean
  customInstructions?: string
  onOpenActionModeModal?: () => void
  onOpenPrimeChatModal?: () => void
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
  actionMode: _propActionMode,
  onToggleActionMode: _propToggleActionMode,
  isActivatingAction: propIsActivatingAction,
  customInstructions: _propCustomInstructions,
  onOpenActionModeModal,
  onOpenPrimeChatModal,
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
  const [, setLocalActionMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('workbench:action-mode') !== 'false'
    } catch {
      return true
    }
  })

  const [localIsActivating, setLocalIsActivating] = useState(false)
  const isActivatingAction = typeof propIsActivatingAction === 'boolean' ? propIsActivatingAction : localIsActivating

  const [activeDirectory, setActiveDirectory] = useState<string>('')
  const [workspaceFolders, setWorkspaceFolders] = useState<{
    activeTarget: 'book' | 'note' | 'custom'
    activeDirectory: string
    bookDirectory: string
    noteDirectory: string
    customDirectory?: string
  }>({
    activeTarget: 'book',
    activeDirectory: '',
    bookDirectory: '',
    noteDirectory: '',
    customDirectory: '',
  })

  const [isChatPrimed, setIsChatPrimed] = useState<boolean>(false)

  // Sync workspace folders and Action Mode state on mount + live folder navigation
  useEffect(() => {
    if (!isAI) return

    const fetchWorkspaceFolders = async () => {
      try {
        const wf = await window.electron?.getWorkspaceFolders?.()
        if (wf) {
          setWorkspaceFolders(wf)
          setActiveDirectory(wf.activeDirectory)
        }
      } catch (_) {}
    }
    fetchWorkspaceFolders()

    window.electron?.getChatPrimeStatus?.().then((res) => {
      if (res) setIsChatPrimed(Boolean(res.isPrimed))
    })

    const unsubPrime = window.electron?.onChatPrimeStatusChanged?.((data) => {
      setIsChatPrimed(Boolean(data?.isPrimed))
    })

    const unsubTarget = window.electron?.onActionTargetChanged?.((wf) => {
      if (wf) {
        setWorkspaceFolders(wf)
        setActiveDirectory(wf.activeDirectory)
      }
    })

    const unsubDir = window.electron?.onActiveDirectoryChanged?.(() => {
      fetchWorkspaceFolders()
    })

    const unsubMode = window.electron?.onActionModeChanged?.((data) => {
      const enabled = Boolean(data?.enabled)
      setLocalActionMode(enabled)
      if (!enabled) {
        setIsChatPrimed(false)
      } else {
        window.electron?.getChatPrimeStatus?.().then((res) => {
          if (res) setIsChatPrimed(Boolean(res.isPrimed))
        })
      }
    })

    // Ensure backend is aware of restored Action Mode state
    try {
      const savedMode = localStorage.getItem('workbench:action-mode') !== 'false'
      const savedInst = localStorage.getItem('workbench:action-custom-instructions') || ''
      window.electron?.setActionMode?.({ enabled: savedMode, customInstructions: savedInst, primeAI: false })
    } catch (_) {}

    return () => {
      unsubTarget?.()
      unsubDir?.()
      unsubPrime?.()
      unsubMode?.()
    }
  }, [isAI])

  const handleDisableChat = async () => {
    setLocalIsActivating(true)
    try {
      const res = await window.electron?.setActionMode?.({
        enabled: false,
      })
      if (res?.success) {
        setLocalActionMode(false)
        setIsChatPrimed(false)
        try {
          localStorage.setItem('workbench:action-mode', 'false')
        } catch (_) {}
        window.electron?.showNotification?.({
          title: 'Chat Disconnected',
          body: 'Chat is now unprimed. Local file actions are disabled.',
          type: 'info',
        })
      }
    } catch (err: any) {
      console.error('Disable Chat error:', err)
    } finally {
      setLocalIsActivating(false)
    }
  }



  const handleInstantPrime = async () => {
    setLocalIsActivating(true)
    try {
      const savedInst = localStorage.getItem('workbench:action-custom-instructions') || ''
      let savedGroups: string[] | undefined
      try {
        const rawGroups = localStorage.getItem('workbench:action-selected-groups')
        if (rawGroups) savedGroups = JSON.parse(rawGroups)
      } catch (_) {}

      const res = await window.electron?.setActionMode?.({
        enabled: true,
        customInstructions: savedInst,
        primeAI: true,
        primingOptions: {
          customInstructions: savedInst,
          selectedGroups: savedGroups,
        },
      })

      if (res?.success) {
        setLocalActionMode(true)
        setIsChatPrimed(true)
        try {
          localStorage.setItem('workbench:action-mode', 'true')
        } catch (_) {}
        window.electron?.showNotification?.({
          title: '⚡ Chat Primed',
          body: 'Connected to Workbench. Ready for instructions!',
          type: 'info',
        })
      } else {
        window.electron?.showNotification?.({
          title: '⚠️ Priming Failed',
          body: res?.error || 'Chat input not ready or chat not loaded.',
          type: 'warning',
        })
      }
    } catch (err: any) {
      console.error('Instant Prime error:', err)
      window.electron?.showNotification?.({
        title: '⚠️ Priming Error',
        body: err?.message || 'Failed to prime chat.',
        type: 'error',
      })
    } finally {
      setLocalIsActivating(false)
    }
  }

  const handleOpenPrimeModal = () => {
    if (onOpenPrimeChatModal) {
      onOpenPrimeChatModal()
    } else {
      window.dispatchEvent(new CustomEvent('workbench:open-prime-chat-modal'))
    }
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
            className="nav-btn nav-btn-home"
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
            {/* 1. Primary Direct Action: Save latest AI response or selection to Notes */}
            <button
              className="clip-note-btn ai-save-note-btn"
              onClick={onSaveAIToNote}
              title="Save latest AI response or highlighted selection to Notes (Ctrl+Shift+S)"
            >
              <BookMarked size={12} className="text-purple" />
              <span className="action-btn-label">Save to Note</span>
            </button>

            {/* 2. Secondary Export Options: Native Dropdown Menu (Extract Code / Export Transcript) */}
            <button
              className="clip-note-btn ai-export-dropdown-btn"
              onClick={() => {
                if (window.electron?.showAIExportMenu) {
                  window.electron.showAIExportMenu()
                } else if (onExportAITranscript) {
                  onExportAITranscript()
                } else if (onExtractAICode) {
                  onExtractAICode()
                }
              }}
              title="Export chat options: Extract code blocks or export conversation transcript"
            >
              <FileText size={12} className="text-amber" />
              <span className="action-btn-label">Export</span>
              <ChevronDown size={10} className="export-chevron" style={{ opacity: 0.6, marginLeft: '2px' }} />
            </button>

            {/* 3. Streamlined Action Mode Pill: Segregated Status, Action, and Target Folder */}
            <div className={`action-mode-pill ${isChatPrimed ? 'primed' : 'unprimed'}`}>
              {/* 1. Status Indicator */}
              <span
                className={`action-pill-status ${isChatPrimed ? 'primed' : 'unprimed'}`}
                title={
                  isChatPrimed
                    ? '● Primed: Connected and ready to execute local file actions.'
                    : '○ Unprimed: Not connected to local files.'
                }
              >
                <span className={`status-dot ${isChatPrimed ? 'primed' : 'unprimed'}`} />
                <span className="status-text">{isChatPrimed ? 'Primed' : 'Unprimed'}</span>
              </span>

              <span className="pill-internal-divider">|</span>

              {/* 2. Button to change status */}
              {!isChatPrimed ? (
                <>
                  <button
                    className="action-pill-btn prime-action"
                    onClick={handleInstantPrime}
                    disabled={isActivatingAction}
                    title="1-Click Prime: Connect this chat to local files immediately without prompt config"
                  >
                    <Zap
                      size={11}
                      className={isActivatingAction ? 'animate-spin text-amber' : 'text-amber fill-amber'}
                    />
                    <span className="pill-btn-label">{isActivatingAction ? 'Priming...' : 'Prime Chat'}</span>
                  </button>
                  <button
                    className="action-pill-btn prime-config-btn"
                    onClick={handleOpenPrimeModal}
                    title="Configure tool groups or custom prompt instructions"
                    style={{ padding: '0 4px', opacity: 0.75 }}
                  >
                    <Settings2 size={10} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="action-pill-btn prime-action"
                    onClick={handleOpenPrimeModal}
                    title="Customize tools & re-prime this chat"
                    style={{ padding: '0 4px', opacity: 0.85 }}
                  >
                    <Zap size={10} className="text-amber fill-amber" />
                  </button>
                  <button
                    className="action-pill-btn disable-action"
                    onClick={handleDisableChat}
                    disabled={isActivatingAction}
                    title="Click to disable connection and unprime this chat"
                  >
                    <Power size={10} className="pill-disable-icon" />
                    <span className="pill-btn-label">Disable</span>
                  </button>
                </>
              )}

              {/* 3. Target Folder button */}
              <button
                className={`action-pill-target target-${workspaceFolders.activeTarget}`}
                onClick={() => {
                  if (onOpenActionModeModal) {
                    onOpenActionModeModal()
                  } else {
                    window.dispatchEvent(new CustomEvent('workbench:open-action-mode-modal'))
                  }
                }}
                title={`Target: ${
                  workspaceFolders.activeTarget === 'note'
                    ? 'Note View'
                    : workspaceFolders.activeTarget === 'custom'
                    ? 'Custom Directory'
                    : 'Book View'
                } (${workspaceFolders.activeDirectory || activeDirectory})\nClick to change destination folder or settings`}
              >
                <span className="target-divider">|</span>
                {workspaceFolders.activeTarget === 'note' ? (
                  <FileText size={11} style={{ color: isChatPrimed ? '#38bdf8' : '#94a3b8' }} />
                ) : workspaceFolders.activeTarget === 'custom' ? (
                  <Folder size={11} style={{ color: isChatPrimed ? '#f59e0b' : '#94a3b8' }} />
                ) : (
                  <BookOpen size={11} style={{ color: isChatPrimed ? '#34d399' : '#94a3b8' }} />
                )}
                <span className="target-folder-label">
                  <span className="target-type-prefix">
                    {workspaceFolders.activeTarget === 'note' ? 'Note: ' : workspaceFolders.activeTarget === 'custom' ? 'Custom: ' : 'Book: '}
                  </span>
                  <span className="target-folder-name">
                    {(workspaceFolders.activeDirectory || activeDirectory).split(/[/\\]/).filter(Boolean).pop() || activeDirectory || 'Select'}
                  </span>
                </span>
                <Settings2 size={10} className="target-settings-icon" style={{ opacity: 0.6, marginLeft: '2px' }} />
              </button>
            </div>
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
    </div>
  )
}
