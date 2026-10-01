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
  actionMode: propActionMode,
  onToggleActionMode: propToggleActionMode,
  isActivatingAction: propIsActivatingAction,
  customInstructions: propCustomInstructions,
  onOpenActionModeModal,
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
  const [localActionMode, setLocalActionMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('workbench:action-mode') === 'true'
    } catch {
      return false
    }
  })
  const actionMode = typeof propActionMode === 'boolean' ? propActionMode : localActionMode

  const [localIsActivating, setLocalIsActivating] = useState(false)
  const isActivatingAction = typeof propIsActivatingAction === 'boolean' ? propIsActivatingAction : localIsActivating
  const [isPriming, setIsPriming] = useState(false)

  const [localCustomInstructions] = useState<string>(() => {
    try {
      return localStorage.getItem('workbench:action-custom-instructions') || ''
    } catch {
      return ''
    }
  })
  const customInstructions = typeof propCustomInstructions === 'string' ? propCustomInstructions : localCustomInstructions
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
  const [showFolderDropdown, setShowFolderDropdown] = useState(false)
  const folderDropdownRef = useRef<HTMLDivElement>(null)

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

    const unsubTarget = window.electron?.onActionTargetChanged?.((wf) => {
      if (wf) {
        setWorkspaceFolders(wf)
        setActiveDirectory(wf.activeDirectory)
      }
    })

    const unsubDir = window.electron?.onActiveDirectoryChanged?.(() => {
      fetchWorkspaceFolders()
    })

    // Ensure backend is aware of restored Action Mode state
    try {
      const savedMode = localStorage.getItem('workbench:action-mode') === 'true'
      const savedInst = localStorage.getItem('workbench:action-custom-instructions') || ''
      if (savedMode) {
        window.electron?.setActionMode?.({ enabled: true, customInstructions: savedInst, primeAI: false })
      }
    } catch (_) {}

    return () => {
      unsubTarget?.()
      unsubDir?.()
    }
  }, [isAI])

  // Close folder dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (folderDropdownRef.current && !folderDropdownRef.current.contains(e.target as Node)) {
        setShowFolderDropdown(false)
      }
    }
    if (showFolderDropdown) {
      document.addEventListener('mousedown', handleOutsideClick)
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [showFolderDropdown])

  const handleSelectTarget = async (target: 'book' | 'note') => {
    setShowFolderDropdown(false)
    try {
      const currentDir = target === 'note' ? workspaceFolders.noteDirectory : workspaceFolders.bookDirectory
      if (!currentDir) {
        // If not opened in this view yet, let the user browse for a folder directly
        const picked = await window.electron?.browseDirectory?.()
        if (picked) {
          const updated = await window.electron?.setActionTarget?.({ target, customPath: picked })
          if (updated) {
            setWorkspaceFolders(updated)
            setActiveDirectory(updated.activeDirectory)
            const label = target === 'note' ? 'Note View' : 'Book View'
            window.electron?.showNotification?.({
              title: 'Action Target Set',
              body: `🎯 Action Mode now targets ${label}: ${picked}`,
              type: 'success',
            })
          }
        }
        return
      }

      const updated = await window.electron?.setActionTarget?.({ target })
      if (updated) {
        setWorkspaceFolders(updated)
        setActiveDirectory(updated.activeDirectory)
        const label = target === 'note' ? 'Note View' : 'Book View'
        window.electron?.showNotification?.({
          title: 'Action Target Changed',
          body: `🎯 Action Mode now targets ${label}: ${updated.activeDirectory}`,
          type: 'success',
        })
      }
    } catch (_) {}
  }

  const handlePickCustomFolder = async () => {
    setShowFolderDropdown(false)
    try {
      const picked = await window.electron?.browseDirectory?.()
      if (picked) {
        const updated = await window.electron?.setActionTarget?.({ target: 'custom', customPath: picked })
        if (updated) {
          setWorkspaceFolders(updated)
          setActiveDirectory(updated.activeDirectory)
          window.electron?.showNotification?.({
            title: 'Action Target Changed',
            body: `🎯 Action Mode now targets: ${picked}`,
            type: 'success',
          })
        }
      }
    } catch (_) {}
  }

  const handleToggleActionMode = async () => {
    if (propToggleActionMode) {
      propToggleActionMode()
      return
    }
    const nextState = !actionMode
    setLocalIsActivating(true)
    try {
      const res = await window.electron?.setActionMode?.({
        enabled: nextState,
        customInstructions: nextState ? customInstructions.trim() : undefined,
        primeAI: nextState, // When explicitly toggled ON by user, prime the active chat!
      })
      if (res?.success) {
        setLocalActionMode(nextState)
        try {
          localStorage.setItem('workbench:action-mode', String(nextState))
        } catch (_) {}
        if (nextState) {
          window.electron?.showNotification?.({
            title: '⚡ Action Mode: ON',
            body: res?.alreadyPrimed
              ? 'Action Mode active (chat already primed). Local execution enabled.'
              : 'Action Mode active! Chat primed in background (prompt hidden).',
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
      setLocalIsActivating(false)
    }
  }

  const handlePrimeChat = async () => {
    setIsPriming(true)
    try {
      const res = await window.electron?.setActionMode?.({
        enabled: true,
        customInstructions: customInstructions.trim(),
        primeAI: true,
      })
      if (res?.alreadyPrimed) {
        window.electron?.showNotification?.({
          title: '⚡ Chat Already Primed',
          body: 'This conversation already has Workbench action context & folder access.',
          type: 'info',
        })
      } else if (res?.success) {
        window.electron?.showNotification?.({
          title: '⚡ Chat Primed with Workbench',
          body: `AI now knows active folder (${workspaceFolders.activeDirectory || 'Current'}) and can execute actions!`,
          type: 'success',
        })
      } else {
        window.electron?.showNotification?.({
          title: '⚠️ Could Not Prime Chat',
          body: res?.error || 'Make sure the chat input is loaded.',
          type: 'warning',
        })
      }
    } catch (err: any) {
      console.error('Prime error:', err)
    } finally {
      setIsPriming(false)
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

              {actionMode && (
                <button
                  className={`action-mode-prime-btn ${isPriming ? 'pulsing' : ''}`}
                  onClick={handlePrimeChat}
                  disabled={isPriming}
                  title="Prime this active chat with Workbench action rules & active folder path so AI knows how to view and manage your files"
                >
                  <Sparkles size={11} className={isPriming ? 'animate-spin text-amber' : 'text-amber'} />
                  <span className="action-btn-label">{isPriming ? 'Priming...' : 'Prime Chat'}</span>
                </button>
              )}

              <button
                className="action-mode-config-btn"
                onClick={() => {
                  if (onOpenActionModeModal) {
                    onOpenActionModeModal()
                  } else {
                    window.dispatchEvent(new CustomEvent('workbench:open-action-mode-modal'))
                  }
                }}
                title="Configure Action Mode prompt, custom instructions & rules"
              >
                <Settings2 size={11} className={customInstructions ? 'text-amber' : 'text-gray-400'} />
              </button>
            </div>

            {/* Target Working Directory Badge & Dropdown */}
            {(actionMode || workspaceFolders.activeDirectory || activeDirectory) && (
              <div className="active-workspace-wrapper" ref={folderDropdownRef} style={{ position: 'relative' }}>
                <div
                  className={`active-workspace-badge target-${workspaceFolders.activeTarget}`}
                  title={`Target: ${
                    workspaceFolders.activeTarget === 'note'
                      ? 'Note View'
                      : workspaceFolders.activeTarget === 'custom'
                      ? 'Custom Directory'
                      : 'Book View'
                  } (${workspaceFolders.activeDirectory || activeDirectory})\nClick to switch destination between Book View, Note View, or Custom folder`}
                  onClick={() => setShowFolderDropdown(!showFolderDropdown)}
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
                >
                  {workspaceFolders.activeTarget === 'note' ? (
                    <FileText size={11} style={{ color: '#38bdf8' }} />
                  ) : workspaceFolders.activeTarget === 'custom' ? (
                    <Folder size={11} style={{ color: '#f59e0b' }} />
                  ) : (
                    <BookOpen size={11} style={{ color: '#34d399' }} />
                  )}
                  <span className="workspace-name" style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <span style={{ opacity: 0.75, fontSize: '10px' }}>
                      {workspaceFolders.activeTarget === 'note' ? 'Note:' : workspaceFolders.activeTarget === 'custom' ? 'Custom:' : 'Book:'}
                    </span>
                    {(workspaceFolders.activeDirectory || activeDirectory).split(/[/\\]/).filter(Boolean).pop() || activeDirectory}
                  </span>
                  <ChevronDown size={10} style={{ opacity: 0.6, transform: showFolderDropdown ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
                </div>

                {/* Dropdown Menu */}
                {showFolderDropdown && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 5px)',
                      left: 0,
                      zIndex: 1000,
                      minWidth: '280px',
                      background: 'rgba(20, 24, 33, 0.98)',
                      border: '1px solid rgba(255, 255, 255, 0.14)',
                      borderRadius: '8px',
                      boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5), 0 0 1px 1px rgba(255, 255, 255, 0.08)',
                      padding: '6px',
                      backdropFilter: 'blur(16px)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ padding: '4px 8px', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Action Mode Target Folder
                    </div>

                    {/* Book View Option */}
                    <button
                      onClick={() => handleSelectTarget('book')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 8px',
                        background: workspaceFolders.activeTarget === 'book' ? 'rgba(52, 211, 153, 0.12)' : 'transparent',
                        border: workspaceFolders.activeTarget === 'book' ? '1px solid rgba(52, 211, 153, 0.3)' : '1px solid transparent',
                        borderRadius: '5px',
                        color: '#f8fafc',
                        cursor: 'pointer',
                        textAlign: 'left',
                        gap: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                        <BookOpen size={13} style={{ color: '#34d399', flexShrink: 0 }} />
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                          <span style={{ fontSize: '11px', fontWeight: 600 }}>Book View Folder</span>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {workspaceFolders.bookDirectory || 'Not opened in Book View'}
                          </span>
                        </div>
                      </div>
                      {workspaceFolders.activeTarget === 'book' && <Check size={12} style={{ color: '#34d399', flexShrink: 0 }} />}
                    </button>

                    {/* Note View Option */}
                    <button
                      onClick={() => handleSelectTarget('note')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 8px',
                        background: workspaceFolders.activeTarget === 'note' ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                        border: workspaceFolders.activeTarget === 'note' ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid transparent',
                        borderRadius: '5px',
                        color: '#f8fafc',
                        cursor: 'pointer',
                        textAlign: 'left',
                        gap: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                        <FileText size={13} style={{ color: '#38bdf8', flexShrink: 0 }} />
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                          <span style={{ fontSize: '11px', fontWeight: 600 }}>Note View Folder</span>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {workspaceFolders.noteDirectory || 'Not opened in Note View'}
                          </span>
                        </div>
                      </div>
                      {workspaceFolders.activeTarget === 'note' && <Check size={12} style={{ color: '#38bdf8', flexShrink: 0 }} />}
                    </button>

                    <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.08)', margin: '2px 0' }} />

                    {/* Browse Custom Folder Option */}
                    <button
                      onClick={handlePickCustomFolder}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 8px',
                        background: workspaceFolders.activeTarget === 'custom' ? 'rgba(245, 158, 11, 0.12)' : 'transparent',
                        border: workspaceFolders.activeTarget === 'custom' ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid transparent',
                        borderRadius: '5px',
                        color: '#f8fafc',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <Folder size={13} style={{ color: '#f59e0b', flexShrink: 0 }} />
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <span style={{ fontSize: '11px', fontWeight: 600 }}>Browse / Choose Custom Folder...</span>
                        {workspaceFolders.activeTarget === 'custom' && (
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {workspaceFolders.activeDirectory}
                          </span>
                        )}
                      </div>
                      {workspaceFolders.activeTarget === 'custom' && <Check size={12} style={{ color: '#f59e0b', flexShrink: 0, marginLeft: 'auto' }} />}
                    </button>
                  </div>
                )}
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
    </div>
  )
}
