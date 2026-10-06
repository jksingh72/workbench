import React, { useState, useEffect, useMemo, useRef, useCallback, Suspense, lazy } from 'react'
import {
  Folder,
  FolderOpen,
  FolderPlus,
  FileText,
  FileCode,
  FileImage,
  File,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  RotateCw,
  Search,
  LayoutGrid,
  List,
  ExternalLink,
  Trash2,
  Edit3,
  Plus,
  Copy,
  Check,
  ChevronRight,
  ChevronDown,
  HardDrive,
  MoreVertical,
  Sparkles,
  X,
  FileCheck,
  PanelLeft,
  Scissors,
  Clipboard,
  Download,
  Home,
  Monitor,
  Cloud,
  Bot,
  ClipboardCopy,
  Table as TableIcon
} from 'lucide-react'
import { FileItem, SystemRootItem } from '../types/electron'

// Code-split heavy document editors to shrink initial bundle by >2.5MB
const MarkdownEditor = lazy(() => import('./editors/MarkdownEditor').then((m) => ({ default: m.MarkdownEditor })))
const SpreadsheetEditor = lazy(() => import('./editors/SpreadsheetEditor').then((m) => ({ default: m.SpreadsheetEditor })))
const WordEditor = lazy(() => import('./editors/WordEditor').then((m) => ({ default: m.WordEditor })))
const TextCodeEditor = lazy(() => import('./editors/TextCodeEditor').then((m) => ({ default: m.TextCodeEditor })))
const PdfEditor = lazy(() => import('./editors/PdfEditor').then((m) => ({ default: m.PdfEditor })))

export interface OpenDocTab {
  id: string
  path: string
  name: string
  extension: string
  type: 'markdown' | 'spreadsheet' | 'word' | 'code' | 'image' | 'pdf'
  content?: string
}

interface LocalExplorerProps {
  rootPath?: string
  clippedText?: string | null
  onClearClippedText?: () => void
  onNotify: (msg: string) => void
  storageKey?: string
  target?: 'note' | 'book'
  zoomFactor?: number
}

type SortColumn = 'name' | 'date' | 'type' | 'size'
type SortDirection = 'asc' | 'desc'

const DEFAULT_STORAGE_KEY = 'workbench_local_explorer_state'

interface PersistentExplorerState {
  rootPath?: string
  currentPath?: string
  history?: string[]
  historyIndex?: number
  openTabs?: OpenDocTab[]
  activeTabId?: string
  selectedPath?: string | null
  viewMode?: 'list' | 'grid'
  sortCol?: SortColumn
  sortDir?: SortDirection
  userChangedSort?: boolean
}

function loadPersistedExplorerState(key: string): PersistentExplorerState {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw)
  } catch (_) {}
  return {}
}

function savePersistedExplorerState(key: string, state: Partial<PersistentExplorerState>) {
  try {
    const prev = loadPersistedExplorerState(key)
    const next = { ...prev, ...state }
    localStorage.setItem(key, JSON.stringify(next))
  } catch (_) {}
}

const isWebUrl = (p?: string) => !!p && (p.startsWith('http://') || p.startsWith('https://'))

// In-memory directory cache for instant SWR loading without screen flash
const dirCache: Record<string, FileItem[]> = {}

export const LocalExplorer: React.FC<LocalExplorerProps> = ({
  rootPath,
  clippedText,
  onClearClippedText,
  onNotify,
  storageKey = DEFAULT_STORAGE_KEY,
  target = 'note',
  zoomFactor = 1.0,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const persisted = useMemo(() => loadPersistedExplorerState(storageKey), [storageKey])

  const validRoot = rootPath && !isWebUrl(rootPath) ? rootPath : undefined

  // Navigation & Directory state
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (persisted.currentPath && !isWebUrl(persisted.currentPath)) {
      return persisted.currentPath
    }
    return validRoot || ''
  })
  const [history, setHistory] = useState<string[]>(() => {
    if (persisted.history && persisted.history.length > 0) {
      const validHist = persisted.history.filter((h) => !isWebUrl(h))
      if (validHist.length > 0) return validHist
    }
    return validRoot ? [validRoot] : []
  })
  const [historyIndex, setHistoryIndex] = useState<number>(() => {
    return typeof persisted.historyIndex === 'number' ? persisted.historyIndex : (validRoot ? 0 : -1)
  })
  const [items, setItems] = useState<FileItem[]>(() => {
    const initPath = (persisted.currentPath && !isWebUrl(persisted.currentPath)) ? persisted.currentPath : (validRoot || '')
    return dirCache[initPath] || []
  })
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    const initPath = (persisted.currentPath && !isWebUrl(persisted.currentPath)) ? persisted.currentPath : (validRoot || '')
    return !dirCache[initPath]
  })
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => {
    return persisted.viewMode || 'list'
  })
  const [selectedPath, setSelectedPath] = useState<string | null>(() => {
    return persisted.selectedPath || null
  })
  const [selectedPaths, setSelectedPaths] = useState<string[]>(() => {
    return persisted.selectedPath ? [persisted.selectedPath] : []
  })
  const lastClickedPathRef = useRef<string | null>(persisted.selectedPath || null)

  // Tabbed Document Workspace State
  const [openTabs, setOpenTabs] = useState<OpenDocTab[]>(() => {
    return persisted.openTabs || []
  })
  const [activeTabId, setActiveTabId] = useState<string>(() => {
    return persisted.activeTabId || '__explorer__'
  })
  // Helper to switch active tab
  const selectTab = useCallback((tabId: string) => {
    setActiveTabId(tabId)
  }, [])

  // Sorting State - default to Name Descending as requested!
  const [sortCol, setSortCol] = useState<SortColumn>(() => {
    return persisted.sortCol || 'name'
  })
  const [sortDir, setSortDir] = useState<SortDirection>(() => {
    // If user has not explicitly clicked header to change sort, enforce Name Descending
    if (!persisted.userChangedSort) {
      return 'desc'
    }
    return persisted.sortDir || 'desc'
  })

  // Save persistent state whenever key navigation or tab properties change
  useEffect(() => {
    if (isWebUrl(currentPath)) return
    savePersistedExplorerState(storageKey, {
      rootPath: validRoot || persisted.rootPath,
      currentPath,
      history,
      historyIndex,
      openTabs,
      activeTabId,
      selectedPath,
      viewMode,
      sortCol,
      sortDir,
    })
  }, [storageKey, validRoot, currentPath, history, historyIndex, openTabs, activeTabId, selectedPath, viewMode, sortCol, sortDir])

  const handleOpenDocInTab = async (item: FileItem) => {
    const ext = item.extension.toLowerCase()
    let type: OpenDocTab['type'] = 'code'

    if (['.md', '.markdown', '.txt'].includes(ext)) {
      type = 'markdown'
    } else if (['.xlsx', '.xls', '.csv', '.tsv'].includes(ext)) {
      type = 'spreadsheet'
    } else if (['.docx'].includes(ext)) {
      type = 'word'
    } else if (['.pdf'].includes(ext)) {
      type = 'pdf'
    } else if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico'].includes(ext)) {
      type = 'image'
    }

    const existing = openTabs.find((t) => t.path.toLowerCase() === item.path.toLowerCase())
    if (existing) {
      selectTab(existing.id)
      return
    }

    let initialContent = ''
    if (type === 'markdown' || type === 'code') {
      if (window.electron?.readFileContent) {
        const res = await window.electron.readFileContent(item.path)
        if (res.success && res.content !== undefined) {
          initialContent = res.content
        }
      }
    } else if (type === 'word') {
      // Word documents load asynchronously inside WordEditor via docx-preview
      initialContent = ''
    }

    const newTab: OpenDocTab = {
      id: item.path,
      path: item.path,
      name: item.name,
      extension: ext,
      type,
      content: initialContent,
    }

    setOpenTabs((prev) => [...prev, newTab])
    selectTab(item.path)
  }

  const handleCloseTab = (tabId: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    const closedTab = openTabs.find((t) => t.id === tabId)
    const nextTabs = openTabs.filter((t) => t.id !== tabId)
    setOpenTabs(nextTabs)
    if (activeTabId === tabId) {
      selectTab('__explorer__')
      if (closedTab) {
        setSelectedPath(closedTab.path)
        const parentDir = closedTab.path.substring(0, closedTab.path.lastIndexOf('\\'))
        if (parentDir && parentDir !== currentPath && !currentPath.startsWith(parentDir)) {
          setCurrentPath(parentDir)
        }
      }
      setTimeout(() => {
        containerRef.current?.focus()
      }, 50)
    }
  }

  // Context Menu state
  const [activeContextMenu, setActiveContextMenu] = useState<{
    item?: FileItem
    targetFolder?: string
    isBackground?: boolean
    x: number
    y: number
  } | null>(null)

  // Tab Context Menu state
  const [tabContextMenu, setTabContextMenu] = useState<{
    tab: OpenDocTab
    x: number
    y: number
  } | null>(null)

  // Modals for New Item and Rename
  const [showNewModal, setShowNewModal] = useState<'file' | 'folder' | null>(null)
  const [newItemName, setNewItemName] = useState('')
  const [renamingItem, setRenamingItem] = useState<FileItem | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Clip text modal
  const [showClipModal, setShowClipModal] = useState(false)
  const [clipFileName, setClipFileName] = useState('Clipping.md')

  // --- Left Navigation Sidebar State ---
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() => {
    return localStorage.getItem('workbench_explorer_sidebar_open') !== 'false'
  })
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = localStorage.getItem('workbench_explorer_sidebar_width')
    return saved ? parseInt(saved, 10) : 190
  })
  const [isResizingSidebar, setIsResizingSidebar] = useState(false)
  const [sidebarStartX, setSidebarStartX] = useState(0)
  const [sidebarStartWidth, setSidebarStartWidth] = useState(190)

  const [systemRoots, setSystemRoots] = useState<SystemRootItem[]>([])
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({})
  const [folderChildren, setFolderChildren] = useState<Record<string, FileItem[]>>({})
  const [loadingFolders, setLoadingFolders] = useState<Record<string, boolean>>({})

  // --- Resizable Columns State (Windows Explorer Details View) ---
  const [colWidths, setColWidths] = useState<{
    name: number
    date: number
    type: number
    size: number
  }>(() => {
    try {
      const saved = localStorage.getItem('workbench_explorer_col_widths')
      if (saved) return JSON.parse(saved)
    } catch (_) {}
    return { name: 240, date: 140, type: 110, size: 85 }
  })

  const [resizingCol, setResizingCol] = useState<{
    col: SortColumn
    startX: number
    startWidth: number
  } | null>(null)


  // --- Clipboard State (Copy / Cut / Paste) ---
  const [clipboard, setClipboard] = useState<{
    action: 'copy' | 'cut'
    paths: string[]
  } | null>(null)

  // --- Drag and Drop State ---
  const [dropTargetFolder, setDropTargetFolder] = useState<string | null>(null)
  const [isDraggingOverSelf, setIsDraggingOverSelf] = useState(false)

  // Load system roots for sidebar on mount
  useEffect(() => {
    if (window.electron?.getSystemRoots) {
      window.electron.getSystemRoots().then((res) => {
        if (res.success && res.roots) {
          setSystemRoots(res.roots)
        }
      })
    }
  }, [])

  // Initialize or update path when rootPath changes or if currentPath is not yet set
  const prevRootPathRef = useRef<string | undefined>(persisted.rootPath || validRoot)
  useEffect(() => {
    if (!validRoot) return

    // 1. Initial hydration if currentPath was empty
    if (!currentPath) {
      prevRootPathRef.current = validRoot
      setCurrentPath(validRoot)
      setHistory([validRoot])
      setHistoryIndex(0)
      savePersistedExplorerState(storageKey, { rootPath: validRoot })
      return
    }

    // 2. If user explicitly changed the configured root folder in settings to a different folder
    if (prevRootPathRef.current && prevRootPathRef.current !== validRoot) {
      prevRootPathRef.current = validRoot
      setCurrentPath(validRoot)
      setHistory([validRoot])
      setHistoryIndex(0)
      savePersistedExplorerState(storageKey, { rootPath: validRoot })
    } else if (!prevRootPathRef.current) {
      prevRootPathRef.current = validRoot
      savePersistedExplorerState(storageKey, { rootPath: validRoot })
    }
  }, [validRoot, currentPath, storageKey])

  // Load directory items with SWR (stale-while-revalidate) pattern
  const loadDirectory = async (targetDir: string) => {
    if (!targetDir || !window.electron?.readDirectory) return

    // If directory was previously cached, show items immediately for instant smooth transition
    if (dirCache[targetDir]) {
      setItems(dirCache[targetDir])
    } else {
      setIsLoading(true)
    }

    try {
      const res = await window.electron.readDirectory(targetDir)
      if (res.success && res.items) {
        dirCache[targetDir] = res.items
        setItems(res.items)
        if (res.currentPath && res.currentPath !== currentPath) {
          setCurrentPath(res.currentPath)
        }
      } else {
        onNotify(`⚠️ Could not open folder: ${res.error || 'Unknown error'}`)
      }
    } catch (err: any) {
      console.error('[LocalExplorer] Read directory failed:', err)
      onNotify('⚠️ Failed to read directory')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (currentPath) {
      loadDirectory(currentPath)
    }
  }, [currentPath])

  // Report active directory to Workbench ActionDispatcher
  useEffect(() => {
    if (currentPath && !isWebUrl(currentPath) && window.electron?.reportActiveDirectory) {
      window.electron.reportActiveDirectory({
        target,
        currentPath,
        rootPath: validRoot,
      })
    }
  }, [currentPath, validRoot, target])

  // Listen for Action Model events (live refresh & auto-open tab)
  useEffect(() => {
    const cleanups: (() => void)[] = []

    if (window.electron?.onExplorerRefreshNeeded) {
      const unsub = window.electron.onExplorerRefreshNeeded((data) => {
        if (!data.target || data.target === target) {
          if (currentPath) {
            delete dirCache[currentPath]
            loadDirectory(currentPath)
          }
        }
      })
      cleanups.push(unsub)
    }

    if (window.electron?.onActionOpenTab) {
      const unsub = window.electron.onActionOpenTab((data) => {
        if (data.filePath && target === 'book') {
          const fileName = data.filePath.substring(data.filePath.lastIndexOf('\\') + 1).replace(/.*\//, '')
          const ext = fileName.includes('.') ? fileName.substring(fileName.lastIndexOf('.')).toLowerCase() : ''
          handleOpenDocInTab({
            name: fileName,
            path: data.filePath,
            isDirectory: false,
            extension: ext,
            size: 0,
            mtime: new Date().toISOString(),
          })
        }
      })
      cleanups.push(unsub)
    }

    if (window.electron?.onNavigateToFolder) {
      const unsub = window.electron.onNavigateToFolder((data) => {
        if (data.target === target && data.path) {
          navigateTo(data.path)
        }
      })
      cleanups.push(unsub)
    }

    return () => {
      cleanups.forEach((c) => c())
    }
  }, [currentPath, target, openTabs])

  // Auto-append clipped text to active note file by default, or create Clippings.md
  useEffect(() => {
    if (target === 'book') return
    if (!clippedText) return

    const applyClip = async () => {
      // If a Markdown document tab is actively open, let its editor handle incoming clippings
      if (activeTabId !== '__explorer__') {
        const activeTab = openTabs.find((t) => t.id === activeTabId)
        if (activeTab && activeTab.type === 'markdown') {
          return
        }
      }

      const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      const isAlreadyFormatted =
        clippedText.includes('> —') ||
        clippedText.includes('### 📖') ||
        clippedText.includes('### 💬') ||
        clippedText.trim().startsWith('---') ||
        (clippedText.trim().startsWith('>') && clippedText.includes('—'))

      const blockToAppend = isAlreadyFormatted
        ? (clippedText.trim().startsWith('---') ? `\n\n${clippedText.trim()}\n` : `\n\n---\n${clippedText.trim()}\n`)
        : `\n\n---\n> **Quote clipped at ${timestamp}:**\n> "${clippedText.replace(/\n/g, '\n> ')}"\n`

      // 1. Check if an existing text/note file is selected
      const selectedItem = items.find((i) => i.path === selectedPath && !i.isDirectory)
      const isTextFile = selectedItem && ['txt', 'md', 'markdown', 'log', 'note'].includes(
        selectedItem.extension.toLowerCase().replace('.', '')
      )

      if (selectedItem && isTextFile && window.electron?.appendToFile) {
        const res = await window.electron.appendToFile(selectedItem.path, blockToAppend)
        if (res.success) {
          onNotify(`📝 Appended excerpt to ${selectedItem.name}`)
          loadDirectory(currentPath)
          onClearClippedText?.()
          return
        }
      }

      // 2. Default: Append to or create Clippings.md in current folder
      const targetClippingsPath = currentPath.endsWith('\\') || currentPath.endsWith('/')
        ? `${currentPath}Clippings.md`
        : `${currentPath}\\Clippings.md`

      if (window.electron?.appendToFile) {
        const defaultBlock = isAlreadyFormatted
          ? (clippedText.trim().startsWith('---') ? `\n\n${clippedText.trim()}\n` : `\n\n---\n${clippedText.trim()}\n`)
          : `\n## Clipped Note (${new Date().toLocaleDateString()} ${timestamp})\n> "${clippedText.replace(/\n/g, '\n> ')}"\n`

        const res = await window.electron.appendToFile(targetClippingsPath, defaultBlock)
        if (res.success) {
          onNotify(`📝 Saved excerpt to Clippings.md`)
          setSelectedPath(targetClippingsPath)
          loadDirectory(currentPath)
          onClearClippedText?.()
          return
        }
      }

      // Fallback: Show clip modal if auto-append had an issue
      setClipFileName('Clippings.md')
      setShowClipModal(true)
    }

    applyClip()
  }, [clippedText])

  // Navigation handlers
  const navigateTo = (newPath: string) => {
    if (newPath === currentPath) return
    const nextHistory = history.slice(0, historyIndex + 1)
    nextHistory.push(newPath)
    setHistory(nextHistory)
    setHistoryIndex(nextHistory.length - 1)
    setCurrentPath(newPath)
  }

  const handleGoBack = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1
      setHistoryIndex(newIndex)
      setCurrentPath(history[newIndex])
    }
  }

  const handleGoForward = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1
      setHistoryIndex(newIndex)
      setCurrentPath(history[newIndex])
    }
  }

  const handleGoUp = () => {
    const normalized = currentPath.replace(/\\/g, '/')
    const parts = normalized.split('/').filter(Boolean)
    if (parts.length <= 1) return

    parts.pop()
    let parent = parts.join('\\')
    if (parent.endsWith(':')) {
      parent += '\\'
    }
    navigateTo(parent)
  }

  const handleRefresh = () => {
    loadDirectory(currentPath)
  }

  const handleSelectFolder = async () => {
    if (window.electron?.selectFolder) {
      const selected = await window.electron.selectFolder(currentPath)
      if (selected) {
        navigateTo(selected)
        const folderName = selected.split(/[\\/]/).filter(Boolean).pop() || selected
        onNotify(`📂 Switched to ${folderName}`)
      }
    }
  }

  const handleOpenInExplorer = () => {
    if (window.electron?.showItemInFolder) {
      window.electron.showItemInFolder(currentPath)
      onNotify('🖥️ Opened in Windows Explorer')
    }
  }

  // Double click file or folder
  const handleItemDoubleClick = async (item: FileItem) => {
    if (item.isDirectory) {
      navigateTo(item.path)
    } else {
      const ext = item.extension.toLowerCase()
      const supportedInPane = [
        '.md', '.markdown', '.txt',
        '.xlsx', '.xls', '.csv', '.tsv',
        '.docx',
        '.pdf',
        '.json', '.js', '.ts', '.py', '.html', '.css', '.yaml', '.yml', '.log', '.env', '.ini', '.sh', '.bat', '.ps1',
        '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'
      ]
      if (supportedInPane.includes(ext)) {
        await handleOpenDocInTab(item)
      } else if (window.electron?.openPath) {
        const res = await window.electron.openPath(item.path)
        if (res.success) {
          onNotify(`🚀 Opened ${item.name} in external app`)
        } else {
          onNotify(`⚠️ Could not open file: ${res.error}`)
        }
      }
    }
  }

  // --- Selection Helpers (Multi-select: Ctrl+Click toggle, Shift+Click range) ---
  const handleItemSelect = (item: FileItem, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      setSelectedPaths((prev) => {
        const next = prev.includes(item.path) ? prev.filter((p) => p !== item.path) : [...prev, item.path]
        setSelectedPath(next[next.length - 1] || null)
        return next
      })
      lastClickedPathRef.current = item.path
    } else if (e.shiftKey && lastClickedPathRef.current) {
      const startIdx = sortedAndFilteredItems.findIndex((i) => i.path === lastClickedPathRef.current)
      const endIdx = sortedAndFilteredItems.findIndex((i) => i.path === item.path)
      if (startIdx !== -1 && endIdx !== -1) {
        const min = Math.min(startIdx, endIdx)
        const max = Math.max(startIdx, endIdx)
        const rangePaths = sortedAndFilteredItems.slice(min, max + 1).map((i) => i.path)
        setSelectedPaths(rangePaths)
        setSelectedPath(item.path)
      }
    } else {
      setSelectedPath(item.path)
      setSelectedPaths([item.path])
      lastClickedPathRef.current = item.path
    }
  }

  const handleItemContextMenu = (item: FileItem, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!selectedPaths.includes(item.path)) {
      setSelectedPath(item.path)
      setSelectedPaths([item.path])
      lastClickedPathRef.current = item.path
    }
    setActiveContextMenu({ item, x: e.clientX, y: e.clientY })
  }

  // --- Copy, Cut, Paste Handlers ---
  const handleCopy = (paths: string[] = selectedPaths.length > 0 ? selectedPaths : (selectedPath ? [selectedPath] : [])) => {
    if (paths.length === 0) return
    setClipboard({ action: 'copy', paths })
    if (window.electron?.copyFilesToClipboard) {
      window.electron.copyFilesToClipboard(paths, false)
    }
    onNotify(`📋 Copied ${paths.length} item${paths.length > 1 ? 's' : ''} to clipboard`)
  }

  const handleCut = (paths: string[] = selectedPaths.length > 0 ? selectedPaths : (selectedPath ? [selectedPath] : [])) => {
    if (paths.length === 0) return
    setClipboard({ action: 'cut', paths })
    if (window.electron?.copyFilesToClipboard) {
      window.electron.copyFilesToClipboard(paths, true)
    }
    onNotify(`✂️ Cut ${paths.length} item${paths.length > 1 ? 's' : ''} (ready to move or paste)`)
  }

  const handlePaste = async (destDir: string = currentPath) => {
    let sourcePaths: string[] = []
    let action: 'copy' | 'cut' = 'copy'

    if (clipboard && clipboard.paths.length > 0) {
      sourcePaths = clipboard.paths
      action = clipboard.action
    } else if (window.electron?.getClipboardFiles) {
      // Read directly from Windows OS Clipboard (CF_HDROP / FileDropList)!
      const res = await window.electron.getClipboardFiles()
      if (res.success && res.paths && res.paths.length > 0) {
        sourcePaths = res.paths
        action = 'copy'
      }
    }

    if (sourcePaths.length === 0) {
      onNotify('ℹ️ Clipboard is empty. Copy files first (Ctrl+C in Windows Explorer or Workbench).')
      return
    }

    let successCount = 0
    for (const src of sourcePaths) {
      if (action === 'copy' && window.electron?.copyItem) {
        const res = await window.electron.copyItem(src, destDir)
        if (res.success) successCount++
      } else if (action === 'cut' && window.electron?.moveItem) {
        const res = await window.electron.moveItem(src, destDir)
        if (res.success) successCount++
      }
    }

    if (action === 'cut') {
      setClipboard(null)
    }

    loadDirectory(currentPath)
    if (folderChildren[destDir] && window.electron?.readDirectory) {
      const res = await window.electron.readDirectory(destDir)
      if (res.success && res.items) {
        setFolderChildren((prev) => ({
          ...prev,
          [destDir]: res.items!
            .filter((i) => i.isDirectory)
            .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: 'base' })),
        }))
      }
    }

    const folderName = destDir.split(/[\\/]/).filter(Boolean).pop() || 'folder'
    onNotify(`📋 Pasted ${successCount} item${successCount > 1 ? 's' : ''} into ${folderName}`)
  }

  // --- Cross-Pane Movement & Transfer Actions ---
  const handleSendFilesToAI = async (pathsToSend?: string[]) => {
    const rawPaths = pathsToSend || (selectedPaths.length > 0 ? selectedPaths : (selectedPath ? [selectedPath] : []))
    // Filter out directories (AI file upload only accepts files)
    const filePaths = rawPaths.filter((p) => {
      const it = items.find((i) => i.path === p)
      return it ? !it.isDirectory : true
    })

    if (filePaths.length === 0) {
      onNotify('⚠️ Select one or more files to send to AI (folders cannot be uploaded directly)')
      return
    }

    if (window.electron?.sendFilesToAI) {
      onNotify(`🤖 Sending ${filePaths.length} file${filePaths.length > 1 ? 's' : ''} to Chat...`)
      try {
        const res = await window.electron.sendFilesToAI(filePaths)
        if (res.success) {
          if (res.uploaded) {
            onNotify(`🚀 Uploaded ${filePaths.length} file${filePaths.length > 1 ? 's' : ''} to Chat!`)
          } else {
            onNotify(`✨ Attached ${filePaths.length} file${filePaths.length > 1 ? 's' : ''} to AI prompt!`)
          }
        } else {
          onNotify(`⚠️ ${res.error || 'Failed to send files to AI'}`)
        }
      } catch (err: any) {
        onNotify(`⚠️ Error: ${err.message}`)
      }
    } else if (filePaths.length === 1 && window.electron?.sendFileToAI) {
      const it = items.find((i) => i.path === filePaths[0])
      if (it) handleSendFileToAI(it)
    }
  }

  const handleSendFileToAI = async (item: FileItem) => {
    if (item.isDirectory) {
      onNotify('⚠️ Select a file to send to AI, not a folder')
      return
    }
    handleSendFilesToAI([item.path])
  }

  const handleCopyFileContent = async (item: FileItem) => {
    if (item.isDirectory) return
    if (window.electron?.readFileContent) {
      const res = await window.electron.readFileContent(item.path)
      if (res.success && res.content !== undefined) {
        await navigator.clipboard.writeText(res.content)
        onNotify(`📋 Copied content of ${item.name} to clipboard`)
      } else if (res.isBinary) {
        onNotify(`⚠️ Cannot copy binary content as text. Use "Copy File" (Ctrl+C) instead.`)
      } else {
        onNotify(`⚠️ ${res.error || 'Could not read file'}`)
      }
    }
  }

  // --- Drag and Drop State & Handlers ---
  const draggedItemRef = useRef<FileItem | null>(null)

  useEffect(() => {
    const unsub = window.electron?.onDragEnded?.(() => {
      draggedItemRef.current = null
      ;(window as any).__workbench_dragged_file = null
      setDropTargetFolder(null)
      setIsDraggingOverSelf(false)
    })
    return () => unsub?.()
  }, [])

  const handleDragStartItem = (e: React.DragEvent, item: FileItem) => {
    draggedItemRef.current = item
    const pathsToDrag = selectedPaths.includes(item.path) && selectedPaths.length > 1 ? selectedPaths : [item.path]
    ;(window as any).__workbench_dragged_file = pathsToDrag[0]

    try {
      e.dataTransfer.setData('text/plain', pathsToDrag.join('\n'))
      e.dataTransfer.setData('application/json', JSON.stringify({ paths: pathsToDrag }))
      e.dataTransfer.setData('application/x-workbench-file', pathsToDrag[0])
      e.dataTransfer.effectAllowed = 'copyMove'
    } catch (_) {}

    // Initiate native OS file drag without canceling the drag sequence
    if (window.electron?.startDragFile) {
      window.electron.startDragFile(pathsToDrag)
    }
  }

  const handleDragEndItem = () => {
    draggedItemRef.current = null
    ;(window as any).__workbench_dragged_file = null
    setDropTargetFolder(null)
    setIsDraggingOverSelf(false)
  }

  const handleDropOnFolder = async (e: React.DragEvent, targetFolder: string) => {
    e.preventDefault()
    e.stopPropagation()
    setDropTargetFolder(null)
    setIsDraggingOverSelf(false)

    // Check if target is a specific markdown or text file
    const isTargetFile = targetFolder.toLowerCase().endsWith('.md') || targetFolder.toLowerCase().endsWith('.txt')
    const actualFolder = isTargetFile ? currentPath : targetFolder

    // 1. Internal application drag
    const draggedItem = draggedItemRef.current
    let draggedPaths: string[] = []

    const globalDragged = (window as any).__workbench_dragged_file
    if (globalDragged) {
      draggedPaths = [globalDragged]
    } else if (draggedItem) {
      draggedPaths = [draggedItem.path]
    } else {
      const jsonData = e.dataTransfer.getData('application/json')
      if (jsonData) {
        try {
          const { paths } = JSON.parse(jsonData) as { paths: string[] }
          if (paths && paths.length > 0) draggedPaths = paths
        } catch (_) {}
      }
    }

    if (draggedPaths.length > 0) {
      const isCopy = e.ctrlKey
      let count = 0
      for (const p of draggedPaths) {
        if (p === actualFolder || p === targetFolder) continue
        if (isCopy && window.electron?.copyItem) {
          const res = await window.electron.copyItem(p, actualFolder)
          if (res.success) count++
        } else if (window.electron?.moveItem) {
          const res = await window.electron.moveItem(p, actualFolder)
          if (res.success) count++
        }
      }
      draggedItemRef.current = null
      ;(window as any).__workbench_dragged_file = null
      loadDirectory(currentPath)
      const folderName = actualFolder.split(/[\\/]/).filter(Boolean).pop() || 'folder'
      onNotify(`${isCopy ? '📋 Copied' : '📦 Moved'} ${count} item(s) to ${folderName}`)
      return
    }

    // 2. External OS drag
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      let count = 0
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const file = e.dataTransfer.files[i]
        const filePath = (file as any).path
        if (filePath && window.electron?.copyItem) {
          const res = await window.electron.copyItem(filePath, actualFolder)
          if (res.success) count++
        }
      }
      loadDirectory(currentPath)
      const folderName = actualFolder.split(/[\\/]/).filter(Boolean).pop() || 'folder'
      onNotify(`📥 Imported ${count} file(s) into ${folderName}`)
      return
    }

    // 3. Dropped text snippet (from BookView or ChatView)
    const plainText = e.dataTransfer.getData('text/plain')
    if (plainText && plainText.trim() && !plainText.startsWith('{') && !plainText.includes(':\\')) {
      const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      let targetFile = ''
      if (isTargetFile) {
        targetFile = targetFolder
      } else if (selectedPath && (selectedPath.toLowerCase().endsWith('.md') || selectedPath.toLowerCase().endsWith('.txt'))) {
        targetFile = selectedPath
      } else {
        const targetClean = actualFolder || currentPath
        targetFile = targetClean.endsWith('\\') || targetClean.endsWith('/')
          ? `${targetClean}Clippings.md`
          : `${targetClean}\\Clippings.md`
      }

      const fileName = targetFile.split(/[\\/]/).pop() || 'Clippings.md'
      const entry = `\n## Clipped Quote (${new Date().toLocaleDateString()} ${timestamp})\n> "${plainText.trim().replace(/\n/g, '\n> ')}"\n`
      if (window.electron?.appendToFile) {
        await window.electron.appendToFile(targetFile, entry)
        onNotify(`📥 Saved quote into ${fileName}`)
        setSelectedPath(targetFile)
        loadDirectory(currentPath)
        return
      }
    }
  }

  const getTypeDescription = (item: FileItem): string => {
    if (item.isDirectory) return 'Folder'
    const ext = item.extension.toUpperCase().replace('.', '')
    if (['DOCX', 'DOC'].includes(ext)) return 'Word Document'
    if (['XLSX', 'XLS', 'CSV'].includes(ext)) return 'Excel Spreadsheet'
    if (['PPTX', 'PPT'].includes(ext)) return 'PowerPoint Presentation'
    if (ext === 'PDF') return 'PDF Document'
    if (['MD', 'TXT'].includes(ext)) return 'Text Note'
    if (['TS', 'JS', 'PY', 'JSON', 'HTML'].includes(ext)) return `${ext} Code`
    return ext ? `${ext} File` : 'File'
  }

  // Sorted and filtered items
  const sortedAndFilteredItems = useMemo(() => {
    let list = items
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter((i) => i.name.toLowerCase().includes(q))
    }

    return [...list].sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1
      if (!a.isDirectory && b.isDirectory) return 1

      let cmp = 0
      if (sortCol === 'name') {
        cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
      } else if (sortCol === 'date') {
        cmp = new Date(a.mtime).getTime() - new Date(b.mtime).getTime()
      } else if (sortCol === 'type') {
        cmp = getTypeDescription(a).localeCompare(getTypeDescription(b))
      } else if (sortCol === 'size') {
        cmp = (a.size || 0) - (b.size || 0)
      }

      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [items, searchQuery, sortCol, sortDir])

  // Delete multiple selected items
  const handleDeleteSelected = async () => {
    if (!window.electron?.deleteItem) return
    const pathsToDelete = selectedPaths.length > 0 ? selectedPaths : (selectedPath ? [selectedPath] : [])
    if (pathsToDelete.length === 0) return

    let count = 0
    for (const p of pathsToDelete) {
      const res = await window.electron.deleteItem(p)
      if (res.success) count++
    }
    onNotify(`🗑️ Moved ${count} item${count > 1 ? 's' : ''} to Recycle Bin`)
    setSelectedPaths([])
    setSelectedPath(null)
    loadDirectory(currentPath)
  }

  // --- Keyboard Shortcuts (strictly scoped to when focus/interaction is inside LocalExplorer) ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if event did not originate inside LocalExplorer or if inside text inputs
      if (
        !containerRef.current ||
        !containerRef.current.contains(e.target as Node) ||
        ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)
      ) {
        return
      }

      if (e.ctrlKey && e.shiftKey && (e.key.toLowerCase() === 'p' || e.key.toLowerCase() === 'a')) {
        e.preventDefault()
        handleSendFilesToAI()
      } else if (e.ctrlKey && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        handleCopy()
      } else if (e.ctrlKey && e.key.toLowerCase() === 'x') {
        e.preventDefault()
        handleCut()
      } else if (e.ctrlKey && e.key.toLowerCase() === 'v') {
        e.preventDefault()
        handlePaste(currentPath)
      } else if (e.ctrlKey && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        const allPaths = sortedAndFilteredItems.map((i) => i.path)
        setSelectedPaths(allPaths)
        if (allPaths.length > 0) setSelectedPath(allPaths[0])
      } else if (e.key === 'Delete') {
        e.preventDefault()
        if (selectedPaths.length > 1) {
          handleDeleteSelected()
        } else if (selectedPath) {
          const item = items.find((i) => i.path === selectedPath)
          if (item) handleDeleteItem(item)
        }
      } else if (e.key === 'F2' && selectedPath) {
        e.preventDefault()
        const item = items.find((i) => i.path === selectedPath)
        if (item) {
          setRenamingItem(item)
          setRenameValue(item.name)
        }
      } else if (e.key === 'Enter' && selectedPath) {
        e.preventDefault()
        const item = items.find((i) => i.path === selectedPath)
        if (item) handleItemDoubleClick(item)
      } else if (e.key === 'Backspace' || (e.altKey && e.key === 'ArrowUp')) {
        e.preventDefault()
        handleGoUp()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        const idx = sortedAndFilteredItems.findIndex((i) => i.path === selectedPath)
        if (idx < sortedAndFilteredItems.length - 1) {
          const next = sortedAndFilteredItems[idx + 1].path
          setSelectedPath(next)
          setSelectedPaths([next])
        } else if (sortedAndFilteredItems.length > 0 && idx === -1) {
          const first = sortedAndFilteredItems[0].path
          setSelectedPath(first)
          setSelectedPaths([first])
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        const idx = sortedAndFilteredItems.findIndex((i) => i.path === selectedPath)
        if (idx > 0) {
          const prev = sortedAndFilteredItems[idx - 1].path
          setSelectedPath(prev)
          setSelectedPaths([prev])
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedPath, selectedPaths, clipboard, currentPath, items, sortedAndFilteredItems])

  // Auto-scroll selected item into view when returning to explorer
  useEffect(() => {
    if (activeTabId === '__explorer__' && selectedPath) {
      const timer = setTimeout(() => {
        const el = containerRef.current?.querySelector('.details-row.selected, .grid-item.selected') as HTMLElement
        if (el) {
          el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        }
      }, 60)
      return () => clearTimeout(timer)
    }
  }, [activeTabId, selectedPath])

  // --- Sidebar Resizing ---
  useEffect(() => {
    if (!isResizingSidebar) return
    const handleMove = (e: MouseEvent) => {
      const delta = e.clientX - sidebarStartX
      const nextW = Math.min(Math.max(140, sidebarStartWidth + delta), 360)
      setSidebarWidth(nextW)
    }
    const handleUp = () => {
      setIsResizingSidebar(false)
      window.electron?.setViewsDragging?.(false)
      localStorage.setItem('workbench_explorer_sidebar_width', sidebarWidth.toString())
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [isResizingSidebar, sidebarStartX, sidebarStartWidth, sidebarWidth])

  const toggleSidebar = () => {
    const next = !isSidebarOpen
    setIsSidebarOpen(next)
    localStorage.setItem('workbench_explorer_sidebar_open', next.toString())
  }

  // --- Column Header Resizing ---
  useEffect(() => {
    if (!resizingCol) return

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizingCol.startX
      const minWidths = { name: 110, date: 90, type: 70, size: 55 }
      const newWidth = Math.max(minWidths[resizingCol.col], resizingCol.startWidth + delta)
      setColWidths((prev) => ({ ...prev, [resizingCol.col]: newWidth }))
    }

    const handleMouseUp = () => {
      setResizingCol(null)
      window.electron?.setViewsDragging?.(false)
      localStorage.setItem('workbench_explorer_col_widths', JSON.stringify(colWidths))
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [resizingCol, colWidths])

  const handleStartColResize = (e: React.MouseEvent, col: SortColumn) => {
    e.stopPropagation()
    e.preventDefault()
    window.electron?.setViewsDragging?.(true)
    setResizingCol({
      col,
      startX: e.clientX,
      startWidth: colWidths[col],
    })
  }

  const handleAutoFitCol = (col: SortColumn) => {
    if (col === 'name') {
      let maxLen = 15
      items.forEach((item) => {
        if (item.name.length > maxLen) maxLen = item.name.length
      })
      const ideal = Math.min(Math.max(180, maxLen * 8.5 + 65), 500)
      setColWidths((prev) => {
        const next = { ...prev, name: Math.round(ideal) }
        localStorage.setItem('workbench_explorer_col_widths', JSON.stringify(next))
        return next
      })
    } else if (col === 'date') {
      setColWidths((prev) => ({ ...prev, date: 145 }))
    } else if (col === 'type') {
      setColWidths((prev) => ({ ...prev, type: 130 }))
    } else if (col === 'size') {
      setColWidths((prev) => ({ ...prev, size: 85 }))
    }
  }

  const handleHeaderClick = (col: SortColumn) => {
    if (sortCol === col) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(col)
      setSortDir('desc')
    }
    savePersistedExplorerState(storageKey, { userChangedSort: true })
  }

  // --- Subfolder Expansion in Sidebar Tree ---
  const toggleFolderExpand = async (folderPath: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const isExpanded = !!expandedFolders[folderPath]
    if (isExpanded) {
      setExpandedFolders((prev) => ({ ...prev, [folderPath]: false }))
      return
    }

    setExpandedFolders((prev) => ({ ...prev, [folderPath]: true }))

    if (!folderChildren[folderPath] && window.electron?.readDirectory) {
      setLoadingFolders((prev) => ({ ...prev, [folderPath]: true }))
      try {
        const res = await window.electron.readDirectory(folderPath)
        if (res.success && res.items) {
          const subdirs = res.items
            .filter((i) => i.isDirectory)
            .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: 'base' }))
          setFolderChildren((prev) => ({ ...prev, [folderPath]: subdirs }))
        }
      } catch (err) {
        console.error('Failed to read subfolders:', err)
      } finally {
        setLoadingFolders((prev) => ({ ...prev, [folderPath]: false }))
      }
    }
  }

  // --- File / Folder Creation ---
  const handleCreateNewItem = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanName = newItemName.trim()
    if (!cleanName) return

    if (showNewModal === 'folder') {
      if (window.electron?.createFolder) {
        const res = await window.electron.createFolder(currentPath, cleanName)
        if (res.success) {
          onNotify(`📁 Created folder: ${cleanName}`)
          loadDirectory(currentPath)
          setShowNewModal(null)
          setNewItemName('')
        } else {
          onNotify(`⚠️ ${res.error}`)
        }
      }
    } else {
      if (window.electron?.createFile) {
        const res = await window.electron.createFile(currentPath, cleanName, '')
        if (res.success) {
          onNotify(`📄 Created file: ${cleanName}`)
          loadDirectory(currentPath)
          setShowNewModal(null)
          setNewItemName('')
        } else {
          onNotify(`⚠️ ${res.error}`)
        }
      }
    }
  }

  // Rename
  const handleSaveRename = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!renamingItem) return
    const clean = renameValue.trim()
    if (!clean || clean === renamingItem.name) {
      setRenamingItem(null)
      return
    }

    const parentDir = renamingItem.path.substring(0, renamingItem.path.lastIndexOf('\\'))
    const newPath = `${parentDir}\\${clean}`

    if (window.electron?.renameItem) {
      const res = await window.electron.renameItem(renamingItem.path, newPath)
      if (res.success) {
        onNotify(`✏️ Renamed to ${clean}`)
        loadDirectory(currentPath)
      } else {
        onNotify(`⚠️ ${res.error}`)
      }
    }
    setRenamingItem(null)
  }

  // Delete
  const handleDeleteItem = async (item: FileItem) => {
    if (!window.electron?.deleteItem) return
    const res = await window.electron.deleteItem(item.path)
    if (res.success) {
      onNotify(`🗑️ Moved ${item.name} to Recycle Bin`)
      loadDirectory(currentPath)
    } else {
      onNotify(`⚠️ ${res.error}`)
    }
  }

  // Save clipped text
  const handleSaveClipToFolder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!clippedText || !clipFileName.trim()) return

    if (window.electron?.createFile) {
      const res = await window.electron.createFile(currentPath, clipFileName.trim(), clippedText)
      if (res.success) {
        onNotify(`✨ Saved highlight to ${clipFileName}`)
        loadDirectory(currentPath)
        setShowClipModal(false)
        if (onClearClippedText) onClearClippedText()
      } else {
        onNotify(`⚠️ Failed to save note: ${res.error}`)
      }
    }
  }

  // Format helpers
  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
  }

  const formatDate = (isoString: string): string => {
    if (!isoString) return ''
    try {
      const d = new Date(isoString)
      return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return isoString
    }
  }

  // Icons
  const renderItemIcon = (item: FileItem) => {
    if (item.isDirectory) {
      return <Folder size={18} className="folder-icon text-amber" />
    }
    const ext = item.extension.toLowerCase()
    switch (ext) {
      case '.docx':
      case '.doc':
        return <span className="office-badge badge-word" title="Microsoft Word">W</span>
      case '.xlsx':
      case '.xls':
      case '.csv':
        return <span className="office-badge badge-excel" title="Microsoft Excel">X</span>
      case '.pptx':
      case '.ppt':
        return <span className="office-badge badge-powerpoint" title="PowerPoint">P</span>
      case '.pdf':
        return <span className="office-badge badge-pdf" title="Adobe PDF">PDF</span>
      case '.md':
      case '.txt':
        return <FileText size={18} className="file-icon text-purple" />
      case '.js':
      case '.ts':
      case '.jsx':
      case '.tsx':
      case '.py':
      case '.json':
      case '.html':
      case '.css':
        return <FileCode size={18} className="file-icon text-cyan" />
      case '.png':
      case '.jpg':
      case '.jpeg':
      case '.gif':
      case '.svg':
      case '.webp':
        return <FileImage size={18} className="file-icon text-orange" />
      default:
        return <File size={18} className="file-icon text-muted" />
    }
  }

  const renderRootIcon = (iconType: SystemRootItem['icon']) => {
    switch (iconType) {
      case 'documents':
        return <FileText size={14} className="text-cyan" />
      case 'downloads':
        return <Download size={14} className="text-green" />
      case 'desktop':
        return <Monitor size={14} className="text-purple" />
      case 'home':
        return <Home size={14} className="text-yellow" />
      case 'drive':
        return <HardDrive size={14} className="text-cyan" />
      case 'cloud':
        return <Cloud size={14} className="text-cyan" />
      default:
        return <Folder size={14} className="text-amber" />
    }
  }

  // Breadcrumb parts
  const breadcrumbSegments = useMemo(() => {
    const norm = currentPath.replace(/\\/g, '/')
    const parts = norm.split('/').filter(Boolean)
    const segments: { name: string; fullPath: string }[] = []

    let accumulated = ''
    parts.forEach((p, idx) => {
      if (idx === 0 && p.includes(':')) {
        accumulated = `${p}\\`
      } else {
        accumulated = accumulated ? `${accumulated}\\${p}` : p
      }
      segments.push({ name: p, fullPath: accumulated })
    })

    return segments
  }, [currentPath])

  const currentEffectiveZoom = zoomFactor || 1.0

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="local-explorer-container"
      style={currentEffectiveZoom && currentEffectiveZoom !== 1 ? { zoom: `${Math.round(currentEffectiveZoom * 100)}%` } : undefined}
      onClick={() => {
        setActiveContextMenu(null)
        setTabContextMenu(null)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        setIsDraggingOverSelf(true)
      }}
      onDragLeave={() => setIsDraggingOverSelf(false)}
      onDrop={(e) => handleDropOnFolder(e, currentPath)}
    >
      {/* Workspace Tabs Bar */}
      <div className="wb-workspace-tabs-bar">
        <button
          className={`wb-tab-btn ${activeTabId === '__explorer__' ? 'active' : ''}`}
          onClick={() => selectTab('__explorer__')}
          title="File Explorer"
        >
          <Folder size={13} className="text-amber" />
          <span>Explorer</span>
        </button>

        {openTabs.map((tab) => {
          const isActive = activeTabId === tab.id
          return (
            <div
              key={tab.id}
              className={`wb-tab-btn ${isActive ? 'active' : ''}`}
              onClick={() => selectTab(tab.id)}
              onAuxClick={(e) => {
                if (e.button === 1) handleCloseTab(tab.id, e)
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setTabContextMenu({ tab, x: e.clientX, y: e.clientY })
              }}
              title={tab.path}
            >
              {tab.type === 'markdown' && <FileText size={13} className="text-cyan" />}
              {tab.type === 'spreadsheet' && <TableIcon size={13} className="text-emerald" />}
              {tab.type === 'word' && <FileText size={13} className="text-blue" />}
              {tab.type === 'code' && <FileCode size={13} className="text-purple" />}
              {tab.type === 'image' && <FileImage size={13} className="text-pink" />}
              {tab.type === 'pdf' && <span className="office-badge badge-pdf" style={{ fontSize: '8px', padding: '1px 3px', lineHeight: '11px', height: '13px' }}>PDF</span>}
              <span className="wb-tab-title">{tab.name}</span>
              <button
                className="wb-tab-ext"
                onClick={(e) => {
                  e.stopPropagation()
                  window.electron?.openPath(tab.path)
                  onNotify(`🚀 Opening ${tab.name} outside...`)
                }}
                title="Open Outside in System App"
              >
                <ExternalLink size={11} />
              </button>
              <button
                className="wb-tab-close"
                onClick={(e) => handleCloseTab(tab.id, e)}
                title="Close Tab"
              >
                <X size={11} />
              </button>
            </div>
          )
        })}
      </div>

      {activeTabId !== '__explorer__' ? (
        <Suspense fallback={<div className="wb-doc-loading"><span>Loading editor...</span></div>}>
          {(() => {
            const activeTab = openTabs.find((t) => t.id === activeTabId)
          if (!activeTab) {
            return (
              <div className="wb-doc-loading">
                <span>Tab not found</span>
                <button className="wb-tool-btn" onClick={() => selectTab('__explorer__')}>
                  Return to Explorer
                </button>
              </div>
            )
          }

          if (activeTab.type === 'markdown') {
            return (
              <MarkdownEditor
                key={activeTab.id}
                filePath={activeTab.path}
                fileName={activeTab.name}
                initialContent={activeTab.content}
                incomingClip={clippedText}
                onClearIncomingClip={onClearClippedText}
                onNotify={onNotify}
                onOpenOutside={() => window.electron?.openPath(activeTab.path)}
                onShowInFolder={() => {
                  selectTab('__explorer__')
                  setSelectedPath(activeTab.path)
                }}
              />
            )
          }

          if (activeTab.type === 'spreadsheet') {
            return (
              <SpreadsheetEditor
                key={activeTab.id}
                filePath={activeTab.path}
                fileName={activeTab.name}
                onNotify={onNotify}
                onOpenOutside={() => window.electron?.openPath(activeTab.path)}
                onShowInFolder={() => {
                  selectTab('__explorer__')
                  setSelectedPath(activeTab.path)
                }}
              />
            )
          }

          if (activeTab.type === 'word') {
            return (
              <WordEditor
                key={activeTab.id}
                filePath={activeTab.path}
                fileName={activeTab.name}
                initialHtml={activeTab.content}
                onNotify={onNotify}
                onOpenOutside={() => window.electron?.openPath(activeTab.path)}
                onShowInFolder={() => {
                  selectTab('__explorer__')
                  setSelectedPath(activeTab.path)
                }}
                onContentChange={(html) => {
                  setOpenTabs((prev) =>
                    prev.map((t) => (t.id === activeTab.id ? { ...t, content: html } : t))
                  )
                }}
              />
            )
          }

          if (activeTab.type === 'code') {
            return (
              <TextCodeEditor
                key={activeTab.id}
                filePath={activeTab.path}
                fileName={activeTab.name}
                initialContent={activeTab.content}
                onNotify={onNotify}
                onOpenOutside={() => window.electron?.openPath(activeTab.path)}
                onShowInFolder={() => {
                  selectTab('__explorer__')
                  setSelectedPath(activeTab.path)
                }}
              />
            )
          }

          if (activeTab.type === 'pdf') {
            return (
              <PdfEditor
                key={activeTab.id}
                filePath={activeTab.path}
                fileName={activeTab.name}
                onNotify={onNotify}
                onOpenOutside={() => window.electron?.openPath(activeTab.path)}
                onShowInFolder={() => {
                  selectTab('__explorer__')
                  setSelectedPath(activeTab.path)
                }}
              />
            )
          }

          if (activeTab.type === 'image') {
            return (
              <div className="wb-doc-editor">
                <div className="wb-editor-toolbar">
                  <span className="wb-doc-badge">
                    <FileImage size={13} style={{ marginRight: '4px' }} />
                    {activeTab.name}
                  </span>
                  <div className="wb-toolbar-right">
                    <button
                      className="wb-tool-btn"
                      onClick={() => window.electron?.openPath(activeTab.path)}
                      title="Open in System Viewer"
                    >
                      <ExternalLink size={14} />
                      <span>Open Outside</span>
                    </button>
                    <button
                      className="wb-tool-btn"
                      onClick={() => {
                        selectTab('__explorer__')
                        setSelectedPath(activeTab.path)
                      }}
                      title="Show in Folder"
                    >
                      <FolderOpen size={14} />
                    </button>
                  </div>
                </div>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', overflow: 'auto', background: '#090d16' }}>
                  <img
                    src={`file://${activeTab.path.replace(/\\/g, '/')}`}
                    alt={activeTab.name}
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '4px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
                  />
                </div>
              </div>
            )
          }

          return null
        })()}
        </Suspense>
      ) : (
        <>
          {/* Clipped Text Quick-Banner */}
      {clippedText && target !== 'book' && (
        <div className="explorer-clip-banner">
          <div className="clip-banner-left">
            <Sparkles size={14} className="text-yellow" />
            <span className="clip-banner-text">
              Highlight ready to clip ({clippedText.length} chars)
            </span>
          </div>
          <div className="clip-banner-actions">
            <button
              className="btn-clip-save"
              onClick={() => {
                setClipFileName(`Clipping-${Date.now().toString().slice(-4)}.md`)
                setShowClipModal(true)
              }}
            >
              Save to this Folder
            </button>
            <button className="btn-clip-dismiss" onClick={onClearClippedText} title="Dismiss">
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Explorer Top Toolbar */}
      <div className="explorer-toolbar">
        {/* Sidebar Toggle & Navigation */}
        <div className="explorer-nav-buttons">
          <button
            className={`nav-btn ${isSidebarOpen ? 'active' : ''}`}
            onClick={toggleSidebar}
            title={isSidebarOpen ? 'Hide Navigation Pane' : 'Show Navigation Pane'}
          >
            <PanelLeft size={15} />
          </button>
          <button
            className="nav-btn"
            onClick={handleGoBack}
            disabled={historyIndex <= 0}
            title="Back (Alt+Left)"
          >
            <ArrowLeft size={15} />
          </button>
          <button
            className="nav-btn"
            onClick={handleGoForward}
            disabled={historyIndex >= history.length - 1}
            title="Forward (Alt+Right)"
          >
            <ArrowRight size={15} />
          </button>
          <button className="nav-btn" onClick={handleGoUp} title="Up to Parent Folder (Alt+Up)">
            <ArrowUp size={15} />
          </button>
          <button className="nav-btn" onClick={handleRefresh} title="Refresh (F5)">
            <RotateCw size={14} className={isLoading ? 'spin' : ''} />
          </button>
        </div>

        {/* Breadcrumb Path Bar */}
        <div className="explorer-breadcrumb-bar">
          <HardDrive size={13} className="text-muted" style={{ marginRight: '4px' }} />
          <div className="breadcrumb-segments">
            {breadcrumbSegments.map((seg, idx) => (
              <React.Fragment key={seg.fullPath}>
                {idx > 0 && <ChevronRight size={12} className="breadcrumb-separator" />}
                <button
                  className={`breadcrumb-segment ${
                    idx === breadcrumbSegments.length - 1 ? 'current' : ''
                  }`}
                  onClick={() => navigateTo(seg.fullPath)}
                  title={seg.fullPath}
                >
                  {seg.name}
                </button>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Search Input */}
        <div className="explorer-search-box">
          <Search size={13} className="search-icon" />
          <input
            type="text"
            placeholder="Search this folder..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="search-clear-btn" onClick={() => setSearchQuery('')}>
              <X size={12} />
            </button>
          )}
        </div>

        {/* Right Toolbar Actions */}
        <div className="explorer-actions-right">
          <button
            className="action-icon-btn"
            onClick={() => {
              setNewItemName('')
              setShowNewModal('folder')
            }}
            title="New Folder"
          >
            <FolderPlus size={14} />
            <span>Folder</span>
          </button>

          <button
            className="action-icon-btn"
            onClick={() => {
              setNewItemName('Note.md')
              setShowNewModal('file')
            }}
            title="New File / Note"
          >
            <Plus size={14} />
            <span>Note</span>
          </button>

          {/* Send to AI: Show if 1 or more files (non-folders) are selected */}
          {(() => {
            const rawPaths = selectedPaths.length > 0 ? selectedPaths : (selectedPath ? [selectedPath] : [])
            const filePaths = rawPaths.filter((p) => !items.find((i) => i.path === p)?.isDirectory)
            if (filePaths.length === 0) return null
            return (
              <button
                className="action-icon-btn btn-send-ai text-emerald"
                onClick={() => handleSendFilesToAI()}
                title={`Send ${filePaths.length} file(s) to AI Chatview (Ctrl+Shift+P / Ctrl+Shift+A)`}
              >
                <Bot size={14} className="text-emerald" />
                <span>Send to AI {filePaths.length > 1 ? `(${filePaths.length})` : ''}</span>
              </button>
            )
          })()}

          {/* Copy button when files/folders are selected */}
          {(selectedPaths.length > 0 || selectedPath) && (
            <button
              className="action-icon-btn"
              onClick={() => handleCopy()}
              title={`Copy ${selectedPaths.length || 1} item(s) (Ctrl+C)`}
            >
              <Copy size={14} />
              <span>Copy {selectedPaths.length > 1 ? `(${selectedPaths.length})` : ''}</span>
            </button>
          )}

          {/* Paste button: Always accessible so user can paste files copied from Windows Explorer or Workbench */}
          <button
            className={`action-icon-btn ${clipboard ? 'btn-paste-active' : ''}`}
            onClick={() => handlePaste(currentPath)}
            title={clipboard ? `Paste ${clipboard.paths.length} item(s) (Ctrl+V)` : 'Paste files from clipboard (Ctrl+V)'}
          >
            <Clipboard size={14} />
            <span>Paste {clipboard ? `(${clipboard.paths.length})` : ''}</span>
          </button>

          <button
            className="action-icon-btn btn-open-folder"
            onClick={handleSelectFolder}
            title="Open another folder in Workbench"
          >
            <FolderOpen size={14} className="text-cyan" />
            <span>Open Folder</span>
          </button>

          <div className="view-toggle-group">
            <button
              className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="Details View"
            >
              <List size={14} />
            </button>
            <button
              className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Large Icons View"
            >
              <LayoutGrid size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Explorer Main Body: Left Navigation Tree + Right File Area */}
      <div className="explorer-body-split">
        {/* Left Navigation Tree Sidebar */}
        {isSidebarOpen && (
          <>
            <div className="explorer-tree-sidebar" style={{ width: `${sidebarWidth}px` }}>
              <div className="sidebar-section-title">Quick Access</div>
              <div className="sidebar-tree-list">
                {systemRoots
                  .filter((r) => r.icon !== 'drive')
                  .map((root) => {
                    const isSelected = currentPath.toLowerCase() === root.path.toLowerCase()
                    const isOver = dropTargetFolder === root.path
                    return (
                      <div
                        key={root.path}
                        className={`sidebar-tree-node ${isSelected ? 'selected' : ''} ${
                          isOver ? 'drop-active' : ''
                        }`}
                        onClick={() => navigateTo(root.path)}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          setActiveContextMenu({
                            targetFolder: root.path,
                            x: e.clientX,
                            y: e.clientY,
                          })
                        }}
                        onDragOver={(e) => {
                          e.preventDefault()
                          setDropTargetFolder(root.path)
                        }}
                        onDragLeave={() => setDropTargetFolder(null)}
                        onDrop={(e) => handleDropOnFolder(e, root.path)}
                      >
                        <span className="sidebar-node-icon">{renderRootIcon(root.icon)}</span>
                        <span className="sidebar-node-name" title={root.path}>
                          {root.name}
                        </span>
                      </div>
                    )
                  })}
              </div>

              <div className="sidebar-section-title" style={{ marginTop: '12px' }}>
                This PC / Drives
              </div>
              <div className="sidebar-tree-list">
                {systemRoots
                  .filter((r) => r.icon === 'drive')
                  .map((drive) => {
                    const isSelected = currentPath.toLowerCase() === drive.path.toLowerCase()
                    const isExpanded = !!expandedFolders[drive.path]
                    const isOver = dropTargetFolder === drive.path
                    const subdirs = folderChildren[drive.path] || []

                    return (
                      <div key={drive.path} className="sidebar-tree-group">
                        <div
                          className={`sidebar-tree-node ${isSelected ? 'selected' : ''} ${
                            isOver ? 'drop-active' : ''
                          }`}
                          onClick={() => navigateTo(drive.path)}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            setActiveContextMenu({
                              targetFolder: drive.path,
                              x: e.clientX,
                              y: e.clientY,
                            })
                          }}
                          onDragOver={(e) => {
                            e.preventDefault()
                            setDropTargetFolder(drive.path)
                          }}
                          onDragLeave={() => setDropTargetFolder(null)}
                          onDrop={(e) => handleDropOnFolder(e, drive.path)}
                        >
                          <button
                            className="tree-expand-arrow"
                            onClick={(e) => toggleFolderExpand(drive.path, e)}
                          >
                            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          </button>
                          <span className="sidebar-node-icon">{renderRootIcon('drive')}</span>
                          <span className="sidebar-node-name">{drive.name}</span>
                        </div>

                        {/* Expanded subfolders */}
                        {isExpanded && (
                          <div className="sidebar-sub-tree">
                            {loadingFolders[drive.path] ? (
                              <div className="sidebar-loading-sub">Loading...</div>
                            ) : subdirs.length === 0 ? (
                              <div className="sidebar-empty-sub">No subfolders</div>
                            ) : (
                              subdirs.map((sub) => {
                                const isSubSelected =
                                  currentPath.toLowerCase() === sub.path.toLowerCase()
                                const isSubOver = dropTargetFolder === sub.path
                                return (
                                  <div
                                    key={sub.path}
                                    className={`sidebar-tree-node sub-node ${
                                      isSubSelected ? 'selected' : ''
                                    } ${isSubOver ? 'drop-active' : ''}`}
                                    onClick={() => navigateTo(sub.path)}
                                    onContextMenu={(e) => {
                                      e.preventDefault()
                                      setActiveContextMenu({
                                        targetFolder: sub.path,
                                        x: e.clientX,
                                        y: e.clientY,
                                      })
                                    }}
                                    onDragOver={(e) => {
                                      e.preventDefault()
                                      setDropTargetFolder(sub.path)
                                    }}
                                    onDragLeave={() => setDropTargetFolder(null)}
                                    onDrop={(e) => handleDropOnFolder(e, sub.path)}
                                  >
                                    <Folder size={13} className="text-amber" />
                                    <span className="sidebar-node-name" title={sub.name}>
                                      {sub.name}
                                    </span>
                                  </div>
                                )
                              })
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
              </div>
            </div>

            {/* Sidebar Divider Resizer */}
            <div
              className={`sidebar-divider-resizer ${isResizingSidebar ? 'resizing' : ''}`}
              onMouseDown={(e) => {
                window.electron?.setViewsDragging?.(true)
                setIsResizingSidebar(true)
                setSidebarStartX(e.clientX)
                setSidebarStartWidth(sidebarWidth)
              }}
            />
          </>
        )}

        {/* Right Main File Content Area */}
        <div
          className={`explorer-content ${isDraggingOverSelf ? 'dragging-over' : ''}`}
          onContextMenu={(e) => {
            if ((e.target as HTMLElement).closest('.list-item-row, .grid-card')) return
            e.preventDefault()
            setActiveContextMenu({ isBackground: true, x: e.clientX, y: e.clientY })
          }}
        >
          {isLoading && items.length === 0 ? (
            <div className="explorer-loading-state">
              <RotateCw size={24} className="spin text-cyan" />
              <span>Reading directory...</span>
            </div>
          ) : sortedAndFilteredItems.length === 0 && !isLoading ? (
            <div className="explorer-empty-state">
              <Folder size={40} className="text-muted" style={{ opacity: 0.4 }} />
              <p className="empty-title">
                {searchQuery ? 'No matching files found' : 'This folder is empty'}
              </p>
              <p className="empty-subtitle">
                {searchQuery
                  ? 'Try a different search term'
                  : target === 'book'
                    ? 'Add PDF books or documents to this folder, or use Open Folder above'
                    : 'Create a new note or folder using the toolbar buttons above, or drag files here'}
              </p>
            </div>
          ) : (
            <>
              {isLoading && <div className="wb-explorer-top-loader" />}
              {viewMode === 'list' ? (
                <div className="explorer-details-table">
              {/* Resizable Column Headers */}
              <div className="details-header-row">
                {/* Column 1: Name */}
                <div
                  className="details-header-col col-name"
                  style={{ width: `${colWidths.name}px` }}
                  onClick={() => handleHeaderClick('name')}
                >
                  <span className="header-label">Name</span>
                  {sortCol === 'name' && (
                    <span className="sort-indicator">
                      {sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                    </span>
                  )}
                  <div
                    className="col-resize-handle"
                    onMouseDown={(e) => handleStartColResize(e, 'name')}
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      handleAutoFitCol('name')
                    }}
                    title="Drag to resize, double-click to auto-fit"
                  />
                </div>

                {/* Column 2: Date Modified */}
                <div
                  className="details-header-col col-date"
                  style={{ width: `${colWidths.date}px` }}
                  onClick={() => handleHeaderClick('date')}
                >
                  <span className="header-label">Date modified</span>
                  {sortCol === 'date' && (
                    <span className="sort-indicator">
                      {sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                    </span>
                  )}
                  <div
                    className="col-resize-handle"
                    onMouseDown={(e) => handleStartColResize(e, 'date')}
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      handleAutoFitCol('date')
                    }}
                    title="Drag to resize"
                  />
                </div>

                {/* Column 3: Type */}
                <div
                  className="details-header-col col-type"
                  style={{ width: `${colWidths.type}px` }}
                  onClick={() => handleHeaderClick('type')}
                >
                  <span className="header-label">Type</span>
                  {sortCol === 'type' && (
                    <span className="sort-indicator">
                      {sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                    </span>
                  )}
                  <div
                    className="col-resize-handle"
                    onMouseDown={(e) => handleStartColResize(e, 'type')}
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      handleAutoFitCol('type')
                    }}
                    title="Drag to resize"
                  />
                </div>

                {/* Column 4: Size */}
                <div
                  className="details-header-col col-size"
                  style={{ width: `${colWidths.size}px` }}
                  onClick={() => handleHeaderClick('size')}
                >
                  <span className="header-label">Size</span>
                  {sortCol === 'size' && (
                    <span className="sort-indicator">
                      {sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                    </span>
                  )}
                  <div
                    className="col-resize-handle"
                    onMouseDown={(e) => handleStartColResize(e, 'size')}
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      handleAutoFitCol('size')
                    }}
                    title="Drag to resize"
                  />
                </div>

                <div className="details-header-col col-actions" />
              </div>

              {/* Table Rows */}
              <div className="details-body-list">
                {sortedAndFilteredItems.map((item) => {
                  const isSelected = selectedPaths.includes(item.path) || selectedPath === item.path
                  const isCut = clipboard?.action === 'cut' && clipboard.paths.includes(item.path)
                  const isNoteFile = item.extension === '.md' || item.extension === '.txt'
                  const isOver = dropTargetFolder === item.path && (item.isDirectory || isNoteFile)

                  return (
                    <div
                      key={item.path}
                      className={`details-row ${isSelected ? 'selected' : ''} ${
                        isCut ? 'is-cut' : ''
                      } ${isOver ? 'drop-active' : ''}`}
                      draggable={true}
                      onDragStart={(e) => handleDragStartItem(e, item)}
                      onDragEnd={handleDragEndItem}
                      onDragOver={(e) => {
                        e.preventDefault()
                        if (item.isDirectory || isNoteFile) {
                          setDropTargetFolder(item.path)
                        }
                      }}
                      onDragLeave={() => {
                        if (dropTargetFolder === item.path) setDropTargetFolder(null)
                      }}
                      onDrop={(e) => {
                        handleDropOnFolder(e, item.path)
                      }}
                      onClick={(e) => handleItemSelect(item, e)}
                      onDoubleClick={() => handleItemDoubleClick(item)}
                      onContextMenu={(e) => handleItemContextMenu(item, e)}
                    >
                      {/* Name Column */}
                      <div className="details-cell col-name" style={{ width: `${colWidths.name}px` }}>
                        <span className="item-icon-wrapper">{renderItemIcon(item)}</span>
                        <span className="item-name" title={item.name}>
                          {item.name}
                        </span>
                      </div>

                      {/* Date Modified Column */}
                      <div className="details-cell col-date" style={{ width: `${colWidths.date}px` }}>
                        {formatDate(item.mtime)}
                      </div>

                      {/* Type Column */}
                      <div className="details-cell col-type" style={{ width: `${colWidths.type}px` }}>
                        {getTypeDescription(item)}
                      </div>

                      {/* Size Column */}
                      <div className="details-cell col-size" style={{ width: `${colWidths.size}px` }}>
                        {item.isDirectory ? '' : formatSize(item.size)}
                      </div>

                      {/* Quick Action Button */}
                      <div className="details-cell col-actions">
                        <button
                          className="item-menu-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (!selectedPaths.includes(item.path)) {
                              setSelectedPath(item.path)
                              setSelectedPaths([item.path])
                              lastClickedPathRef.current = item.path
                            }
                            const rect = e.currentTarget.getBoundingClientRect()
                            setActiveContextMenu({ item, x: rect.right, y: rect.bottom })
                          }}
                        >
                          <MoreVertical size={13} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="explorer-grid-view">
              {sortedAndFilteredItems.map((item) => {
                const isSelected = selectedPaths.includes(item.path) || selectedPath === item.path
                const isCut = clipboard?.action === 'cut' && clipboard.paths.includes(item.path)
                const isNoteFile = item.extension === '.md' || item.extension === '.txt'
                const isOver = dropTargetFolder === item.path && (item.isDirectory || isNoteFile)

                return (
                  <div
                    key={item.path}
                    className={`grid-card ${isSelected ? 'selected' : ''} ${
                      isCut ? 'is-cut' : ''
                    } ${isOver ? 'drop-active' : ''}`}
                    draggable={true}
                    onDragStart={(e) => handleDragStartItem(e, item)}
                    onDragEnd={handleDragEndItem}
                    onDragOver={(e) => {
                      e.preventDefault()
                      if (item.isDirectory || isNoteFile) {
                        setDropTargetFolder(item.path)
                      }
                    }}
                    onDragLeave={() => {
                      if (dropTargetFolder === item.path) setDropTargetFolder(null)
                    }}
                    onDrop={(e) => {
                      handleDropOnFolder(e, item.path)
                    }}
                    onClick={(e) => handleItemSelect(item, e)}
                    onDoubleClick={() => handleItemDoubleClick(item)}
                    onContextMenu={(e) => handleItemContextMenu(item, e)}
                  >
                    <div className="grid-icon-area">{renderItemIcon(item)}</div>
                    <div className="grid-info">
                      <span className="grid-name" title={item.name}>
                        {item.name}
                      </span>
                      <span className="grid-meta">
                        {item.isDirectory ? 'Folder' : formatSize(item.size)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
            </>
          )}
        </div>
      </div>
        </>
      )}

      {/* Context Menu */}
      {activeContextMenu && (
        <div
          className="explorer-context-menu"
          style={{ top: `${activeContextMenu.y}px`, left: `${activeContextMenu.x}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          {activeContextMenu.item ? (() => {
            const item = activeContextMenu.item
            const isMulti = selectedPaths.length > 1 && selectedPaths.includes(item.path)
            const targetPaths = isMulti ? selectedPaths : [item.path]
            const filePaths = targetPaths.filter((p) => !items.find((i) => i.path === p)?.isDirectory)
            const count = targetPaths.length

            return (
              <>
                {filePaths.length > 0 && (
                  <>
                    <button
                      className="menu-option menu-option-highlight text-emerald"
                      onClick={() => {
                        handleSendFilesToAI(targetPaths)
                        setActiveContextMenu(null)
                      }}
                    >
                      <Bot size={13} className="text-emerald" />
                      <span>Send to AI Chat ({filePaths.length} File{filePaths.length > 1 ? 's' : ''})</span>
                    </button>
                    {!isMulti && (
                      <button
                        className="menu-option"
                        onClick={() => {
                          handleCopyFileContent(item)
                          setActiveContextMenu(null)
                        }}
                      >
                        <ClipboardCopy size={13} />
                        <span>Copy File Content</span>
                      </button>
                    )}
                    {!isMulti && (
                      <button
                        className="menu-option menu-option-highlight text-cyan"
                        onClick={() => {
                          handleOpenDocInTab(item)
                          setActiveContextMenu(null)
                        }}
                      >
                        <FileText size={13} className="text-cyan" />
                        <span>{target === 'book' ? 'Open in Tab (In-Pane Reader)' : 'Open in Tab (In-Pane Editor)'}</span>
                      </button>
                    )}
                    {!isMulti && (
                      <button
                        className="menu-option"
                        onClick={() => {
                          window.electron?.openPath(item.path)
                          setActiveContextMenu(null)
                        }}
                      >
                        <ExternalLink size={13} />
                        <span>Open Outside (System App)</span>
                      </button>
                    )}
                    <div className="menu-divider" />
                  </>
                )}
                {item.isDirectory && !isMulti && (
                  <button
                    className="menu-option"
                    onClick={() => {
                      handleItemDoubleClick(item)
                      setActiveContextMenu(null)
                    }}
                  >
                    <FolderOpen size={13} />
                    <span>Open Folder</span>
                  </button>
                )}
                {!isMulti && (
                  <button
                    className="menu-option"
                    onClick={() => {
                      window.electron?.showItemInFolder(item.path)
                      setActiveContextMenu(null)
                    }}
                  >
                    <Folder size={13} />
                    <span>Reveal in Windows Explorer</span>
                  </button>
                )}
                <div className="menu-divider" />
                <button
                  className="menu-option"
                  onClick={() => {
                    handleCut(targetPaths)
                    setActiveContextMenu(null)
                  }}
                >
                  <Scissors size={13} />
                  <span>Cut {count > 1 ? `(${count} Items)` : ''} (Ctrl+X)</span>
                </button>
                <button
                  className="menu-option"
                  onClick={() => {
                    handleCopy(targetPaths)
                    setActiveContextMenu(null)
                  }}
                >
                  <Copy size={13} />
                  <span>Copy {count > 1 ? `(${count} Items)` : ''} (Ctrl+C)</span>
                </button>
                {item.isDirectory && (
                  <button
                    className="menu-option"
                    onClick={() => {
                      handlePaste(item.path)
                      setActiveContextMenu(null)
                    }}
                  >
                    <Clipboard size={13} />
                    <span>Paste into this Folder (Ctrl+V)</span>
                  </button>
                )}
                <button
                  className="menu-option"
                  onClick={() => {
                    navigator.clipboard.writeText(isMulti ? targetPaths.join('\n') : item.path)
                    onNotify(`📋 Copied ${count > 1 ? `${count} paths` : 'full path'} to clipboard`)
                    setActiveContextMenu(null)
                  }}
                >
                  <Copy size={13} />
                  <span>Copy {count > 1 ? `${count} Paths` : 'Full Path'}</span>
                </button>
                <div className="menu-divider" />
                {!isMulti && (
                  <button
                    className="menu-option"
                    onClick={() => {
                      setRenamingItem(item)
                      setRenameValue(item.name)
                      setActiveContextMenu(null)
                    }}
                  >
                    <Edit3 size={13} />
                    <span>Rename (F2)</span>
                  </button>
                )}
                <button
                  className="menu-option text-red"
                  onClick={() => {
                    if (isMulti) {
                      handleDeleteSelected()
                    } else {
                      handleDeleteItem(item)
                    }
                    setActiveContextMenu(null)
                  }}
                >
                  <Trash2 size={13} />
                  <span>Move to Recycle Bin {count > 1 ? `(${count} Items)` : ''} (Del)</span>
                </button>
              </>
            )
          })() : activeContextMenu.targetFolder ? (
            <>
              <button
                className="menu-option"
                onClick={() => {
                  navigateTo(activeContextMenu.targetFolder!)
                  setActiveContextMenu(null)
                }}
              >
                <Folder size={13} />
                <span>Open Folder</span>
              </button>
              <button
                className="menu-option"
                onClick={() => {
                  handlePaste(activeContextMenu.targetFolder!)
                  setActiveContextMenu(null)
                }}
              >
                <Clipboard size={13} />
                <span>Paste into this Folder (Ctrl+V)</span>
              </button>
              <button
                className="menu-option"
                onClick={() => {
                  navigator.clipboard.writeText(activeContextMenu.targetFolder!)
                  onNotify('📋 Copied path')
                  setActiveContextMenu(null)
                }}
              >
                <Copy size={13} />
                <span>Copy Path</span>
              </button>
            </>
          ) : (
            <>
              <button
                className="menu-option"
                onClick={() => {
                  setNewItemName('')
                  setShowNewModal('folder')
                  setActiveContextMenu(null)
                }}
              >
                <FolderPlus size={13} />
                <span>New Folder</span>
              </button>
              <button
                className="menu-option"
                onClick={() => {
                  setNewItemName('Note.md')
                  setShowNewModal('file')
                  setActiveContextMenu(null)
                }}
              >
                <Plus size={13} />
                <span>New File</span>
              </button>
              <button
                className="menu-option"
                onClick={() => {
                  handlePaste(currentPath)
                  setActiveContextMenu(null)
                }}
              >
                <Clipboard size={13} />
                <span>Paste (Ctrl+V)</span>
              </button>
              <div className="menu-divider" />
              <button
                className="menu-option"
                onClick={() => {
                  handleRefresh()
                  setActiveContextMenu(null)
                }}
              >
                <RotateCw size={13} />
                <span>Refresh (F5)</span>
              </button>
              <div className="menu-divider" />
              <button
                className="menu-option"
                onClick={() => {
                  handleSelectFolder()
                  setActiveContextMenu(null)
                }}
              >
                <FolderOpen size={13} />
                <span>Open Folder...</span>
              </button>
              <button
                className="menu-option"
                onClick={() => {
                  handleOpenInExplorer()
                  setActiveContextMenu(null)
                }}
              >
                <Folder size={13} />
                <span>Reveal in Windows Explorer</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Tab Context Menu */}
      {tabContextMenu && (
        <div
          className="context-menu-wrapper"
          style={{ top: `${tabContextMenu.y}px`, left: `${tabContextMenu.x}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="context-menu">
            <button
              className="menu-option menu-option-highlight text-cyan"
              onClick={() => {
                window.electron?.openPath(tabContextMenu.tab.path)
                onNotify(`🚀 Opening ${tabContextMenu.tab.name} outside...`)
                setTabContextMenu(null)
              }}
            >
              <ExternalLink size={13} className="text-cyan" />
              <span>Open Outside (System App)</span>
            </button>
            <button
              className="menu-option"
              onClick={() => {
                window.electron?.showItemInFolder(tabContextMenu.tab.path)
                setTabContextMenu(null)
              }}
            >
              <Folder size={13} />
              <span>Reveal in Windows Explorer</span>
            </button>
            <button
              className="menu-option"
              onClick={() => {
                navigator.clipboard.writeText(tabContextMenu.tab.path)
                onNotify('📋 Copied full path to clipboard')
                setTabContextMenu(null)
              }}
            >
              <Copy size={13} />
              <span>Copy File Path</span>
            </button>
            <div className="menu-divider" />
            <button
              className="menu-option"
              onClick={() => {
                handleCloseTab(tabContextMenu.tab.id)
                setTabContextMenu(null)
              }}
            >
              <X size={13} />
              <span>Close Tab</span>
            </button>
            <button
              className="menu-option"
              onClick={() => {
                setOpenTabs([tabContextMenu.tab])
                selectTab(tabContextMenu.tab.id)
                setTabContextMenu(null)
              }}
            >
              <X size={13} />
              <span>Close Other Tabs</span>
            </button>
            <button
              className="menu-option text-danger"
              onClick={() => {
                setOpenTabs([])
                selectTab('__explorer__')
                setTabContextMenu(null)
              }}
            >
              <X size={13} />
              <span>Close All Tabs</span>
            </button>
          </div>
        </div>
      )}

      {/* New File / Folder Modal */}
      {showNewModal && (
        <div className="pane-modal-backdrop" onClick={() => setShowNewModal(null)}>
          <div className="pane-modal-container explorer-prompt-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-group">
                <div className="modal-icon-badge badge-cyan">
                  {showNewModal === 'folder' ? <FolderPlus size={16} /> : <FileText size={16} />}
                </div>
                <h3 className="modal-title">
                  {showNewModal === 'folder' ? 'Create New Folder' : 'Create New File'}
                </h3>
              </div>
              <button className="modal-close-btn" onClick={() => setShowNewModal(null)}>
                <X size={15} />
              </button>
            </div>
            <form onSubmit={handleCreateNewItem} className="modal-body">
              <div className="edit-field">
                <label>
                  {showNewModal === 'folder'
                    ? 'Folder Name'
                    : 'File Name (e.g. Notes.md, Report.docx, Data.xlsx)'}
                </label>
                <input
                  type="text"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  placeholder={showNewModal === 'folder' ? 'My Folder' : 'Note.md'}
                  autoFocus
                />
              </div>
              <div className="edit-actions-right" style={{ marginTop: '16px' }}>
                <button
                  type="button"
                  className="btn-cancel-edit"
                  onClick={() => setShowNewModal(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-save-edit" disabled={!newItemName.trim()}>
                  <Check size={13} />
                  <span>Create</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {renamingItem && (
        <div className="pane-modal-backdrop" onClick={() => setRenamingItem(null)}>
          <div className="pane-modal-container explorer-prompt-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-group">
                <div className="modal-icon-badge badge-purple">
                  <Edit3 size={16} />
                </div>
                <h3 className="modal-title">Rename Item</h3>
              </div>
              <button className="modal-close-btn" onClick={() => setRenamingItem(null)}>
                <X size={15} />
              </button>
            </div>
            <form onSubmit={handleSaveRename} className="modal-body">
              <div className="edit-field">
                <label>New Name</label>
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="edit-actions-right" style={{ marginTop: '16px' }}>
                <button
                  type="button"
                  className="btn-cancel-edit"
                  onClick={() => setRenamingItem(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-save-edit" disabled={!renameValue.trim()}>
                  <Check size={13} />
                  <span>Rename</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Save Clip Modal */}
      {showClipModal && (
        <div className="pane-modal-backdrop" onClick={() => setShowClipModal(false)}>
          <div className="pane-modal-container explorer-prompt-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-group">
                <div className="modal-icon-badge badge-yellow">
                  <Sparkles size={16} />
                </div>
                <h3 className="modal-title">Save Clipped Highlight as Note</h3>
              </div>
              <button className="modal-close-btn" onClick={() => setShowClipModal(false)}>
                <X size={15} />
              </button>
            </div>
            <form onSubmit={handleSaveClipToFolder} className="modal-body">
              <div className="edit-field">
                <label>Note File Name</label>
                <input
                  type="text"
                  value={clipFileName}
                  onChange={(e) => setClipFileName(e.target.value)}
                  placeholder="MyNote.md"
                  autoFocus
                />
              </div>
              <div className="clip-preview-snippet">
                <label>Clipped Content Preview</label>
                <div className="preview-text-box">{clippedText}</div>
              </div>
              <div className="edit-actions-right" style={{ marginTop: '16px' }}>
                <button
                  type="button"
                  className="btn-cancel-edit"
                  onClick={() => setShowClipModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-save-edit" disabled={!clipFileName.trim()}>
                  <FileCheck size={13} />
                  <span>Save Note</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
