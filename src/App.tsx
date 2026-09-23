import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Header } from './components/Header'
import { PaneToolbar } from './components/PaneToolbar'
import { Splitter } from './components/Splitter'
import { HorizontalSplitter } from './components/HorizontalSplitter'
import { OneNoteApp } from './components/OneNoteApp'
import { BookDeleteLoginModal } from './components/BookDeleteLoginModal'
import { AIDeleteLoginModal } from './components/AIDeleteLoginModal'
import { NoteDeleteModal } from './components/NoteDeleteModal'
import { BookSourceModal } from './components/BookSourceModal'
import { AISourceModal } from './components/AISourceModal'
import { NoteSourceModal } from './components/NoteSourceModal'
import { NavState, BookSource, AISource, NoteSource } from './types/electron'
import './App.css'

export const App: React.FC = () => {
  // Horizontal split ratio (Bookview width vs Right Column width): Default 60:40
  const [splitRatio, setSplitRatio] = useState<number>(60)
  // Vertical split ratio for Right Column (ChatGPT height vs OneNote height): Default 50:50
  const [verticalSplitRatio, setVerticalSplitRatio] = useState<number>(50)
  const [isSwapped, setIsSwapped] = useState<boolean>(false)
  const [dragTarget, setDragTarget] = useState<'none' | 'column' | 'row'>('none')
  const [isAskingAI, setIsAskingAI] = useState<boolean>(false)
  const [notification, setNotification] = useState<string | null>(null)
  const [isBookDeleteLoginOpen, setIsBookDeleteLoginOpen] = useState<boolean>(false)
  const [isAIDeleteLoginOpen, setIsAIDeleteLoginOpen] = useState<boolean>(false)
  const [isNoteDeleteDataOpen, setIsNoteDeleteDataOpen] = useState<boolean>(false)
  const [noteResetTrigger, setNoteResetTrigger] = useState<number>(0)
  const [clippedText, setClippedText] = useState<string | null>(null)
  const [bookSources, setBookSources] = useState<BookSource[]>([
    { id: 'oreilly', name: "O'Reilly Learning", url: 'https://www.oreilly.com/member/login/', isPreset: true },
    { id: 'kindle', name: 'Amazon Kindle', url: 'https://read.amazon.com/', isPreset: true },
  ])
  const [activeBookSourceId, setActiveBookSourceId] = useState<string>('oreilly')
  const [isBookSourceModalOpen, setIsBookSourceModalOpen] = useState<boolean>(false)

  const [aiSources, setAiSources] = useState<AISource[]>([
    { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/', isPreset: true },
    { id: 'claude', name: 'Anthropic Claude', url: 'https://claude.ai/', isPreset: true },
    { id: 'gemini', name: 'Google Gemini', url: 'https://gemini.google.com/', isPreset: true },
    { id: 'perplexity', name: 'Perplexity AI', url: 'https://www.perplexity.ai/', isPreset: true },
  ])
  const [activeAISourceId, setActiveAISourceId] = useState<string>('chatgpt')
  const [isAISourceModalOpen, setIsAISourceModalOpen] = useState<boolean>(false)

  const [noteSources, setNoteSources] = useState<NoteSource[]>([
    { id: 'onenote', name: 'Microsoft OneNote', url: 'https://www.onenote.com/notebooks', isPreset: true },
    { id: 'evernote', name: 'Evernote', url: 'https://www.evernote.com/client/web', isPreset: true },
    { id: 'local', name: 'Workbench Local Notes', url: 'workbench://local-notes', isPreset: true },
    { id: 'notion', name: 'Notion', url: 'https://www.notion.so/login', isPreset: true },
    { id: 'keep', name: 'Google Keep', url: 'https://keep.google.com/', isPreset: true },
  ])
  const [activeNoteSourceId, setActiveNoteSourceId] = useState<string>('onenote')
  const [isNoteSourceModalOpen, setIsNoteSourceModalOpen] = useState<boolean>(false)

  const [bookNavState, setBookNavState] = useState<NavState>({
    canGoBack: false,
    canGoForward: false,
    isLoading: true,
    url: 'https://learning.oreilly.com/home/',
    title: "O'Reilly Learning",
    zoomFactor: 1.0,
  })

  const [aiNavState, setAiNavState] = useState<NavState>({
    canGoBack: false,
    canGoForward: false,
    isLoading: true,
    url: 'https://chatgpt.com/',
    title: 'ChatGPT',
    zoomFactor: 1.0,
  })

  const [noteNavState, setNoteNavState] = useState<NavState>({
    canGoBack: false,
    canGoForward: false,
    isLoading: true,
    url: 'https://www.onenote.com/notebooks',
    title: 'Microsoft OneNote',
    zoomFactor: 1.0,
  })

  const workspaceRef = useRef<HTMLDivElement>(null)
  const rightColumnRef = useRef<HTMLDivElement>(null)
  const bookAnchorRef = useRef<HTMLDivElement>(null)
  const aiAnchorRef = useRef<HTMLDivElement>(null)
  const noteAnchorRef = useRef<HTMLDivElement>(null)
  const notificationTimeoutRef = useRef<any>(null)
  const dragTargetRef = useRef<'none' | 'column' | 'row'>('none')

  const showNotification = (msg: string) => {
    if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current)
    setNotification(msg)
    notificationTimeoutRef.current = setTimeout(() => {
      setNotification(null)
    }, 4000)
  }

  // Calculate and sync bounds of native WebContentsViews
  const syncBounds = useCallback(() => {
    if (!window.electron?.updateBounds) return

    const bookRect = bookAnchorRef.current?.getBoundingClientRect()
    const aiRect = aiAnchorRef.current?.getBoundingClientRect()
    const noteRect = noteAnchorRef.current?.getBoundingClientRect()

    const book = bookRect
      ? {
          x: Math.round(bookRect.left),
          y: Math.round(bookRect.top),
          width: Math.round(bookRect.width),
          height: Math.round(bookRect.height),
        }
      : { x: 0, y: 0, width: 0, height: 0 }

    const ai = aiRect
      ? {
          x: Math.round(aiRect.left),
          y: Math.round(aiRect.top),
          width: Math.round(aiRect.width),
          height: Math.round(aiRect.height),
        }
      : { x: 0, y: 0, width: 0, height: 0 }

    const note = noteRect
      ? {
          x: Math.round(noteRect.left),
          y: Math.round(noteRect.top),
          width: Math.round(noteRect.width),
          height: Math.round(noteRect.height),
        }
      : { x: 0, y: 0, width: 0, height: 0 }

    window.electron.updateBounds({ book, ai, note })
  }, [])

  // Listen to navigation events from Electron
  useEffect(() => {
    if (!window.electron?.onNavStateChange) return

    const unsubscribeNav = window.electron.onNavStateChange((target, state) => {
      if (target === 'book') {
        setBookNavState((prev) => ({ ...prev, ...state }))
      } else if (target === 'ai') {
        setAiNavState((prev) => ({ ...prev, ...state }))
      } else if (target === 'note') {
        setNoteNavState((prev) => ({ ...prev, ...state }))
      }
    })

    const unsubscribeAskAI = window.electron.onAskAIResult?.((result) => {
      if (result.success) {
        showNotification('✨ Transferred highlighted text to ChatGPT!')
      } else {
        showNotification(`⚠️ ${result.error || 'No text selected'}`)
      }
    })

    // Load configured book sources
    if (window.electron?.getBookSources) {
      window.electron
        .getBookSources()
        .then((data) => {
          if (data?.sources && data.sources.length > 0) {
            setBookSources(data.sources)
            setActiveBookSourceId(data.activeSourceId || data.sources[0].id)
          }
        })
        .catch((err) => console.error('Failed to load book sources:', err))
    }

    const unsubscribeBookSourceChanged = window.electron?.onBookSourceChanged?.((data) => {
      if (data?.activeSourceId) {
        setActiveBookSourceId(data.activeSourceId)
        showNotification(`📖 Switched Bookview to ${data.activeSource?.name || 'selected site'}`)
      }
    })

    const unsubscribeOpenModal = window.electron?.onOpenBookSourceModal?.(() => {
      handleOpenBookSourceModal()
    })

    // Load configured AI sources
    if (window.electron?.getAISources) {
      window.electron
        .getAISources()
        .then((data) => {
          if (data?.sources && data.sources.length > 0) {
            setAiSources(data.sources)
            setActiveAISourceId(data.activeSourceId || data.sources[0].id)
          }
        })
        .catch((err) => console.error('Failed to load AI sources:', err))
    }

    const unsubscribeAISourceChanged = window.electron?.onAISourceChanged?.((data) => {
      if (data?.activeSourceId) {
        setActiveAISourceId(data.activeSourceId)
        showNotification(`🤖 Switched ChatView to ${data.activeSource?.name || 'selected AI'}`)
      }
    })

    const unsubscribeOpenAIModal = window.electron?.onOpenAISourceModal?.(() => {
      handleOpenAISourceModal()
    })

    // Load configured Note sources
    if (window.electron?.getNoteSources) {
      window.electron
        .getNoteSources()
        .then((data) => {
          if (data?.sources && data.sources.length > 0) {
            setNoteSources(data.sources)
            setActiveNoteSourceId(data.activeSourceId || data.sources[0].id)
          }
        })
        .catch((err) => console.error('Failed to load note sources:', err))
    }

    const unsubscribeNoteSourceChanged = window.electron?.onNoteSourceChanged?.((data) => {
      if (data?.activeSourceId) {
        setActiveNoteSourceId(data.activeSourceId)
        showNotification(`📝 Switched NoteView to ${data.activeSource?.name || 'selected platform'}`)
      }
    })

    const unsubscribeOpenNoteModal = window.electron?.onOpenNoteSourceModal?.(() => {
      handleOpenNoteSourceModal()
    })

    return () => {
      unsubscribeNav()
      unsubscribeAskAI?.()
      unsubscribeBookSourceChanged?.()
      unsubscribeOpenModal?.()
      unsubscribeAISourceChanged?.()
      unsubscribeOpenAIModal?.()
      unsubscribeNoteSourceChanged?.()
      unsubscribeOpenNoteModal?.()
    }
  }, [])

  // Sync split ratios with Electron when not dragging (e.g. presets, double-click, resize)
  useEffect(() => {
    if (dragTarget === 'none') {
      window.electron?.setSplit({ ratio: splitRatio, isSwapped })
      window.electron?.setVerticalSplit({ ratio: verticalSplitRatio })
      syncBounds()
      const timer = setTimeout(syncBounds, 50)
      return () => clearTimeout(timer)
    }
  }, [splitRatio, verticalSplitRatio, isSwapped, dragTarget, syncBounds])

  // Window resize listener
  useEffect(() => {
    window.addEventListener('resize', syncBounds)
    return () => window.removeEventListener('resize', syncBounds)
  }, [syncBounds])

  // Drag splitter handling: Column (Left pane vs Right column)
  const handleColumnPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch (err) {
      console.warn('[ColumnSplitter] Pointer capture failed:', err)
    }
    dragTargetRef.current = 'column'
    setDragTarget('column')
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  const handleColumnPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragTargetRef.current !== 'column') return
    if (!workspaceRef.current) return
    const rect = workspaceRef.current.getBoundingClientRect()
    if (rect.width <= 0) return

    const offsetX = e.clientX - rect.left
    const newRatio = (offsetX / rect.width) * 100
    const clampedRatio = Math.max(15, Math.min(85, Math.round(newRatio * 10) / 10))
    setSplitRatio(clampedRatio)
    window.electron?.setSplit({ ratio: clampedRatio, isSwapped })
  }

  const handleColumnPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragTargetRef.current === 'column') {
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId)
        }
      } catch {}
      dragTargetRef.current = 'none'
      setDragTarget('none')
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      syncBounds()
    }
  }

  // Drag splitter handling: Row (ChatGPT top vs OneNote bottom)
  const handleRowPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch (err) {
      console.warn('[RowSplitter] Pointer capture failed:', err)
    }
    dragTargetRef.current = 'row'
    setDragTarget('row')
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
  }

  const handleRowPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragTargetRef.current !== 'row') return
    if (!rightColumnRef.current) return
    const rect = rightColumnRef.current.getBoundingClientRect()
    if (rect.height <= 0) return

    const offsetY = e.clientY - rect.top
    const newRatio = (offsetY / rect.height) * 100
    const clampedRatio = Math.max(15, Math.min(85, Math.round(newRatio * 10) / 10))
    setVerticalSplitRatio(clampedRatio)
    window.electron?.setVerticalSplit({ ratio: clampedRatio })
  }

  const handleRowPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragTargetRef.current === 'row') {
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId)
        }
      } catch {}
      dragTargetRef.current = 'none'
      setDragTarget('none')
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      syncBounds()
    }
  }

  // Window-level safety listeners: guarantee that cursor speed or pointer release never drops the drag
  useEffect(() => {
    if (dragTarget === 'none') return

    const handleWindowPointerMove = (e: PointerEvent) => {
      if (dragTargetRef.current === 'column') {
        if (!workspaceRef.current) return
        const rect = workspaceRef.current.getBoundingClientRect()
        if (rect.width <= 0) return
        const offsetX = e.clientX - rect.left
        const newRatio = (offsetX / rect.width) * 100
        const clampedRatio = Math.max(15, Math.min(85, Math.round(newRatio * 10) / 10))
        setSplitRatio(clampedRatio)
        window.electron?.setSplit({ ratio: clampedRatio, isSwapped })
      } else if (dragTargetRef.current === 'row') {
        if (!rightColumnRef.current) return
        const rect = rightColumnRef.current.getBoundingClientRect()
        if (rect.height <= 0) return
        const offsetY = e.clientY - rect.top
        const newRatio = (offsetY / rect.height) * 100
        const clampedRatio = Math.max(15, Math.min(85, Math.round(newRatio * 10) / 10))
        setVerticalSplitRatio(clampedRatio)
        window.electron?.setVerticalSplit({ ratio: clampedRatio })
      }
    }

    const handleGlobalPointerUp = () => {
      dragTargetRef.current = 'none'
      setDragTarget('none')
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      syncBounds()
    }

    window.addEventListener('pointermove', handleWindowPointerMove, { passive: true })
    window.addEventListener('pointerup', handleGlobalPointerUp)
    window.addEventListener('pointercancel', handleGlobalPointerUp)
    window.addEventListener('blur', handleGlobalPointerUp)

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove)
      window.removeEventListener('pointerup', handleGlobalPointerUp)
      window.removeEventListener('pointercancel', handleGlobalPointerUp)
      window.removeEventListener('blur', handleGlobalPointerUp)
    }
  }, [dragTarget, isSwapped, syncBounds])

  // Navigation actions
  const handleNavAction = (
    target: 'book' | 'ai' | 'note',
    command: 'back' | 'forward' | 'reload' | 'home' | 'zoom-in' | 'zoom-out' | 'zoom-reset'
  ) => {
    window.electron?.navAction({ target, command })
  }

  // Active sources
  const activeBookSource =
    bookSources.find((s) => s.id === activeBookSourceId) ||
    bookSources[0] || { id: 'oreilly', name: "O'Reilly Learning", url: 'https://www.oreilly.com/member/login/' }

  const activeAISource =
    aiSources.find((s) => s.id === activeAISourceId) ||
    aiSources[0] || { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/' }

  const activeNoteSource =
    noteSources.find((s) => s.id === activeNoteSourceId) ||
    noteSources[0] || { id: 'onenote', name: 'Microsoft OneNote', url: 'https://www.onenote.com/notebooks' }

  // Book Delete Login modal (scoped strictly to Bookview pane)
  const handleOpenBookDeleteLogin = () => {
    setIsBookDeleteLoginOpen(true)
    window.electron?.setViewsVisible({ target: 'book', visible: false })
  }

  const handleCloseBookDeleteLogin = () => {
    setIsBookDeleteLoginOpen(false)
    window.electron?.setViewsVisible({ target: 'book', visible: true })
    setTimeout(syncBounds, 50)
  }

  // AI Delete Login modal (scoped strictly to ChatView pane)
  const handleOpenAIDeleteLogin = () => {
    setIsAIDeleteLoginOpen(true)
    window.electron?.setViewsVisible({ target: 'ai', visible: false })
  }

  const handleCloseAIDeleteLogin = () => {
    setIsAIDeleteLoginOpen(false)
    window.electron?.setViewsVisible({ target: 'ai', visible: true })
    setTimeout(syncBounds, 50)
  }

  // Note Delete Data modal (scoped strictly to NoteView pane)
  const handleOpenNoteDeleteData = () => {
    setIsNoteDeleteDataOpen(true)
    window.electron?.setViewsVisible({ target: 'note', visible: false })
  }

  const handleCloseNoteDeleteData = () => {
    setIsNoteDeleteDataOpen(false)
    window.electron?.setViewsVisible({ target: 'note', visible: true })
    setTimeout(syncBounds, 50)
  }

  // Book source configuration handlers
  const handleOpenBookSourceModal = () => {
    setIsBookSourceModalOpen(true)
    window.electron?.setViewsVisible({ target: 'all', visible: false })
  }

  const handleCloseBookSourceModal = () => {
    setIsBookSourceModalOpen(false)
    window.electron?.setViewsVisible({ target: 'all', visible: true })
    setTimeout(syncBounds, 50)
  }

  const handleSelectBookSource = async (sourceId: string) => {
    setActiveBookSourceId(sourceId)
    if (window.electron?.setActiveBookSource) {
      const res = await window.electron.setActiveBookSource(sourceId)
      if (res.success && res.activeSource) {
        showNotification(`📖 Switched Bookview to ${res.activeSource.name}`)
      }
    }
  }

  const handleSaveBookSources = async (sources: BookSource[], newActiveId?: string) => {
    setBookSources(sources)
    if (newActiveId) setActiveBookSourceId(newActiveId)
    if (window.electron?.saveBookSources) {
      const res = await window.electron.saveBookSources({ sources, activeSourceId: newActiveId })
      if (res.success && res.data) {
        setBookSources(res.data.sources)
        setActiveBookSourceId(res.data.activeSourceId)
      }
    }
  }

  // AI source configuration handlers
  const handleOpenAISourceModal = () => {
    setIsAISourceModalOpen(true)
    window.electron?.setViewsVisible({ target: 'all', visible: false })
  }

  const handleCloseAISourceModal = () => {
    setIsAISourceModalOpen(false)
    window.electron?.setViewsVisible({ target: 'all', visible: true })
    setTimeout(syncBounds, 50)
  }

  const handleSelectAISource = async (sourceId: string) => {
    setActiveAISourceId(sourceId)
    if (window.electron?.setActiveAISource) {
      const res = await window.electron.setActiveAISource(sourceId)
      if (res.success && res.activeSource) {
        showNotification(`🤖 Switched ChatView to ${res.activeSource.name}`)
      }
    }
  }

  const handleSaveAISources = async (sources: AISource[], newActiveId?: string) => {
    setAiSources(sources)
    if (newActiveId) setActiveAISourceId(newActiveId)
    if (window.electron?.saveAISources) {
      const res = await window.electron.saveAISources({ sources, activeSourceId: newActiveId })
      if (res.success && res.data) {
        setAiSources(res.data.sources)
        setActiveAISourceId(res.data.activeSourceId)
      }
    }
  }

  // Note source configuration handlers
  const handleOpenNoteSourceModal = () => {
    setIsNoteSourceModalOpen(true)
    window.electron?.setViewsVisible({ target: 'all', visible: false })
  }

  const handleCloseNoteSourceModal = () => {
    setIsNoteSourceModalOpen(false)
    window.electron?.setViewsVisible({ target: 'all', visible: true })
    setTimeout(syncBounds, 50)
  }

  const handleSelectNoteSource = async (sourceId: string) => {
    setActiveNoteSourceId(sourceId)
    if (window.electron?.setActiveNoteSource) {
      const res = await window.electron.setActiveNoteSource(sourceId)
      if (res.success && res.activeSource) {
        showNotification(`📝 Switched NoteView to ${res.activeSource.name}`)
      }
    }
  }

  const handleSaveNoteSources = async (sources: NoteSource[], newActiveId?: string) => {
    setNoteSources(sources)
    if (newActiveId) setActiveNoteSourceId(newActiveId)
    if (window.electron?.saveNoteSources) {
      const res = await window.electron.saveNoteSources({ sources, activeSourceId: newActiveId })
      if (res.success && res.data) {
        setNoteSources(res.data.sources)
        setActiveNoteSourceId(res.data.activeSourceId)
      }
    }
  }

  // Clip highlighted book text to OneNote
  const handleClipToNote = async () => {
    if (!window.electron?.clipSelection) return
    try {
      const res = await window.electron.clipSelection()
      if (res.success && res.text) {
        setClippedText(res.text)
      } else {
        showNotification(`⚠️ ${res.error || 'Please highlight some text in Bookview first'}`)
      }
    } catch (err: any) {
      showNotification(`⚠️ Clip error: ${err.message}`)
    }
  }

  // Ask AI handler
  const handleAskAI = async (
    templateKey: 'explain' | 'summarize' | 'code' | 'quiz' | 'raw' | 'custom',
    customPrompt?: string
  ) => {
    if (!window.electron?.askAI) return

    setIsAskingAI(true)
    try {
      const result = await window.electron.askAI({ templateKey, customPrompt })
      if (result.success) {
        showNotification('✨ Transferred highlighted text to ChatGPT!')
      } else {
        showNotification(`⚠️ ${result.error || 'No text selected'}`)
      }
    } catch (err: any) {
      showNotification(`⚠️ Error: ${err.message}`)
    } finally {
      setIsAskingAI(false)
    }
  }

  // Global keyboard shortcuts (Ctrl+Shift+A to Ask AI)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        handleAskAI('explain')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Calculate widths for columns (Left Pane vs Right Pane)
  const leftPercent = splitRatio
  const rightPercent = 100 - splitRatio

  const leftColumnStyle: React.CSSProperties = {
    width: `calc(${leftPercent}% - 4.5px)`,
    display: leftPercent <= 0 ? 'none' : 'flex',
    flexDirection: 'column',
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
    flexShrink: 0,
  }

  const rightColumnStyle: React.CSSProperties = {
    width: `calc(${rightPercent}% - 4.5px)`,
    display: rightPercent <= 0 ? 'none' : 'flex',
    flexDirection: 'column',
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
    flexShrink: 0,
  }

  const chatSubPaneStyle: React.CSSProperties = {
    height: `calc(${verticalSplitRatio}% - 4.5px)`,
    display: verticalSplitRatio <= 0 ? 'none' : 'flex',
    flexDirection: 'column',
    position: 'relative',
    overflow: 'hidden',
    flexShrink: 0,
  }

  const noteSubPaneStyle: React.CSSProperties = {
    height: `calc(${100 - verticalSplitRatio}% - 4.5px)`,
    display: verticalSplitRatio >= 100 ? 'none' : 'flex',
    flexDirection: 'column',
    position: 'relative',
    overflow: 'hidden',
    flexShrink: 0,
  }

  const renderBookPane = (paneStyle: React.CSSProperties) => (
    <div className="pane-wrapper book-pane" style={paneStyle}>
      <PaneToolbar
        target="book"
        navState={bookNavState}
        onNavAction={(cmd) => handleNavAction('book', cmd)}
        onAskAI={handleAskAI}
        onShowNativeMenu={() => window.electron?.showAskAIMenu()}
        onOpenSessionModal={handleOpenBookDeleteLogin}
        onClipToNote={handleClipToNote}
        bookSources={bookSources}
        activeBookSourceId={activeBookSourceId}
        onSelectBookSource={handleSelectBookSource}
        onOpenBookSourceModal={handleOpenBookSourceModal}
        isAskingAI={isAskingAI}
      />
      <div className="native-view-anchor" ref={bookAnchorRef} />

      {/* Pane-Scoped Delete Login Modal for Bookview */}
      {isBookDeleteLoginOpen && (
        <BookDeleteLoginModal
          isOpen={isBookDeleteLoginOpen}
          activeSource={activeBookSource}
          sources={bookSources}
          onClose={handleCloseBookDeleteLogin}
          onNotify={showNotification}
        />
      )}
    </div>
  )

  const renderRightColumn = (paneStyle: React.CSSProperties) => (
    <div className="right-column-wrapper" ref={rightColumnRef} style={paneStyle}>
      {/* Top Pane: AI Chat */}
      <div className="pane-wrapper ai-pane" style={chatSubPaneStyle}>
        <PaneToolbar
          target="ai"
          navState={aiNavState}
          onNavAction={(cmd) => handleNavAction('ai', cmd)}
          onOpenSessionModal={handleOpenAIDeleteLogin}
          aiSources={aiSources}
          activeAISourceId={activeAISourceId}
          onOpenAISourceModal={handleOpenAISourceModal}
        />
        <div className="native-view-anchor" ref={aiAnchorRef} />

        {/* Pane-Scoped Delete Login Modal for ChatView */}
        {isAIDeleteLoginOpen && (
          <AIDeleteLoginModal
            isOpen={isAIDeleteLoginOpen}
            activeSource={activeAISource}
            sources={aiSources}
            onClose={handleCloseAIDeleteLogin}
            onNotify={showNotification}
          />
        )}
      </div>

      {/* Horizontal Splitter (ChatGPT vs OneNote) */}
      <HorizontalSplitter
        onPointerDown={handleRowPointerDown}
        onPointerMove={handleRowPointerMove}
        onPointerUp={handleRowPointerUp}
        onDoubleClick={() => {
          setVerticalSplitRatio(50)
          window.electron?.setVerticalSplit({ ratio: 50 })
          setTimeout(syncBounds, 50)
        }}
        isDragging={dragTarget === 'row'}
      />

      {/* Bottom Pane: Note Application */}
      <div className="pane-wrapper onenote-pane" style={noteSubPaneStyle}>
        <PaneToolbar
          target="note"
          navState={noteNavState}
          onNavAction={(cmd) => handleNavAction('note', cmd)}
          onOpenSessionModal={handleOpenNoteDeleteData}
          noteSources={noteSources}
          activeNoteSourceId={activeNoteSourceId}
          onOpenNoteSourceModal={handleOpenNoteSourceModal}
        />

        {activeNoteSourceId === 'local' ? (
          <OneNoteApp
            onNotify={showNotification}
            clippedText={clippedText}
            onClearClippedText={() => setClippedText(null)}
            onOpenSessionModal={handleOpenNoteDeleteData}
            resetTrigger={noteResetTrigger}
          />
        ) : (
          <div className="native-view-anchor" ref={noteAnchorRef} />
        )}

        {/* Pane-Scoped Delete Login Modal for NoteView */}
        {isNoteDeleteDataOpen && (
          <NoteDeleteModal
            isOpen={isNoteDeleteDataOpen}
            activeSource={activeNoteSource}
            sources={noteSources}
            onClose={handleCloseNoteDeleteData}
            onNotify={showNotification}
            onCleared={() => setNoteResetTrigger(Date.now())}
          />
        )}
      </div>
    </div>
  )

  return (
    <div className="workbench-app">
      <Header
        splitRatio={splitRatio}
        onSetSplitRatio={(ratio) => {
          setSplitRatio(ratio)
          window.electron?.setSplit({ ratio, isSwapped })
          setTimeout(syncBounds, 50)
        }}
        onSwapPanes={() => {
          const next = !isSwapped
          setIsSwapped(next)
          window.electron?.setSplit({ ratio: splitRatio, isSwapped: next })
          setTimeout(syncBounds, 50)
        }}
        isSwapped={isSwapped}
        notification={notification}
      />

      <div className="workspace-container" ref={workspaceRef}>
        {!isSwapped ? (
          <>
            {renderBookPane(leftColumnStyle)}
            <Splitter
              onPointerDown={handleColumnPointerDown}
              onPointerMove={handleColumnPointerMove}
              onPointerUp={handleColumnPointerUp}
              onDoubleClick={() => {
                setSplitRatio(60)
                window.electron?.setSplit({ ratio: 60, isSwapped })
                setTimeout(syncBounds, 50)
              }}
              isDragging={dragTarget === 'column'}
            />
            {renderRightColumn(rightColumnStyle)}
          </>
        ) : (
          <>
            {renderRightColumn(leftColumnStyle)}
            <Splitter
              onPointerDown={handleColumnPointerDown}
              onPointerMove={handleColumnPointerMove}
              onPointerUp={handleColumnPointerUp}
              onDoubleClick={() => {
                setSplitRatio(60)
                window.electron?.setSplit({ ratio: 60, isSwapped })
                setTimeout(syncBounds, 50)
              }}
              isDragging={dragTarget === 'column'}
            />
            {renderBookPane(rightColumnStyle)}
          </>
        )}
      </div>



      {isBookSourceModalOpen && (
        <BookSourceModal
          isOpen={true}
          sources={bookSources}
          activeSourceId={activeBookSourceId}
          onClose={handleCloseBookSourceModal}
          onSelectSource={(id) => {
            handleSelectBookSource(id)
            handleCloseBookSourceModal()
          }}
          onSaveSources={handleSaveBookSources}
          onNotify={showNotification}
        />
      )}

      {isAISourceModalOpen && (
        <AISourceModal
          isOpen={true}
          sources={aiSources}
          activeSourceId={activeAISourceId}
          onClose={handleCloseAISourceModal}
          onSelectSource={(id) => {
            handleSelectAISource(id)
            handleCloseAISourceModal()
          }}
          onSaveSources={handleSaveAISources}
          onNotify={showNotification}
        />
      )}

      {isNoteSourceModalOpen && (
        <NoteSourceModal
          isOpen={true}
          sources={noteSources}
          activeSourceId={activeNoteSourceId}
          onClose={handleCloseNoteSourceModal}
          onSelectSource={(id) => {
            handleSelectNoteSource(id)
            handleCloseNoteSourceModal()
          }}
          onSaveSources={handleSaveNoteSources}
          onNotify={showNotification}
        />
      )}
    </div>
  )
}

export default App
