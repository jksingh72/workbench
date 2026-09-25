import React, { useState, useEffect, useMemo, useRef } from 'react'
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
  Cloud
} from 'lucide-react'
import { FileItem, SystemRootItem } from '../types/electron'

interface LocalExplorerProps {
  rootPath: string
  clippedText?: string | null
  onClearClippedText?: () => void
  onNotify: (msg: string) => void
}

type SortColumn = 'name' | 'date' | 'type' | 'size'
type SortDirection = 'asc' | 'desc'

export const LocalExplorer: React.FC<LocalExplorerProps> = ({
  rootPath,
  clippedText,
  onClearClippedText,
  onNotify,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)

  // Navigation & Directory state
  const [currentPath, setCurrentPath] = useState<string>(rootPath || '')
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState<number>(-1)
  const [items, setItems] = useState<FileItem[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

  // Context Menu state
  const [activeContextMenu, setActiveContextMenu] = useState<{
    item?: FileItem
    targetFolder?: string
    isBackground?: boolean
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

  // --- Sorting State ---
  const [sortCol, setSortCol] = useState<SortColumn>('name')
  const [sortDir, setSortDir] = useState<SortDirection>('asc')

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

  // Initialize or update path when rootPath changes
  useEffect(() => {
    if (rootPath) {
      setCurrentPath(rootPath)
      setHistory([rootPath])
      setHistoryIndex(0)
    }
  }, [rootPath])

  // Load directory items
  const loadDirectory = async (targetDir: string) => {
    if (!targetDir || !window.electron?.readDirectory) return
    setIsLoading(true)
    setSelectedPath(null)
    setActiveContextMenu(null)

    try {
      const res = await window.electron.readDirectory(targetDir)
      if (res.success && res.items) {
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
      if (window.electron?.openPath) {
        const res = await window.electron.openPath(item.path)
        if (res.success) {
          onNotify(`🚀 Opened ${item.name}`)
        } else {
          onNotify(`⚠️ Could not open file: ${res.error}`)
        }
      }
    }
  }

  // --- Copy, Cut, Paste Handlers ---
  const handleCopy = (paths: string[]) => {
    setClipboard({ action: 'copy', paths })
    onNotify(`📋 Copied ${paths.length} item${paths.length > 1 ? 's' : ''}`)
  }

  const handleCut = (paths: string[]) => {
    setClipboard({ action: 'cut', paths })
    onNotify(`✂️ Cut ${paths.length} item${paths.length > 1 ? 's' : ''}`)
  }

  const handlePaste = async (destDir: string = currentPath) => {
    if (!clipboard || clipboard.paths.length === 0) return
    let successCount = 0

    for (const src of clipboard.paths) {
      if (clipboard.action === 'copy' && window.electron?.copyItem) {
        const res = await window.electron.copyItem(src, destDir)
        if (res.success) successCount++
      } else if (clipboard.action === 'cut' && window.electron?.moveItem) {
        const res = await window.electron.moveItem(src, destDir)
        if (res.success) successCount++
      }
    }

    if (clipboard.action === 'cut') {
      setClipboard(null)
    }

    loadDirectory(currentPath)
    if (folderChildren[destDir] && window.electron?.readDirectory) {
      const res = await window.electron.readDirectory(destDir)
      if (res.success && res.items) {
        setFolderChildren((prev) => ({
          ...prev,
          [destDir]: res.items!.filter((i) => i.isDirectory),
        }))
      }
    }

    const folderName = destDir.split(/[\\/]/).filter(Boolean).pop() || 'folder'
    onNotify(`📋 Pasted ${successCount} item${successCount > 1 ? 's' : ''} into ${folderName}`)
  }

  // --- Drag and Drop Handlers ---
  const handleDragStartItem = (e: React.DragEvent, item: FileItem) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ paths: [item.path] }))
    e.dataTransfer.effectAllowed = 'copyMove'
  }

  const handleDropOnFolder = async (e: React.DragEvent, targetFolder: string) => {
    e.preventDefault()
    e.stopPropagation()
    setDropTargetFolder(null)
    setIsDraggingOverSelf(false)

    // 1. Internal application drag
    const jsonData = e.dataTransfer.getData('application/json')
    if (jsonData) {
      try {
        const { paths } = JSON.parse(jsonData) as { paths: string[] }
        if (paths && paths.length > 0) {
          const isCopy = e.ctrlKey
          let count = 0
          for (const p of paths) {
            if (p === targetFolder) continue
            if (isCopy && window.electron?.copyItem) {
              const res = await window.electron.copyItem(p, targetFolder)
              if (res.success) count++
            } else if (window.electron?.moveItem) {
              const res = await window.electron.moveItem(p, targetFolder)
              if (res.success) count++
            }
          }
          loadDirectory(currentPath)
          const folderName = targetFolder.split(/[\\/]/).filter(Boolean).pop() || 'folder'
          onNotify(`${isCopy ? '📋 Copied' : '📦 Moved'} ${count} item(s) to ${folderName}`)
          return
        }
      } catch (_) {}
    }

    // 2. External OS drag
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      let count = 0
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const file = e.dataTransfer.files[i]
        const filePath = (file as any).path
        if (filePath && window.electron?.copyItem) {
          const res = await window.electron.copyItem(filePath, targetFolder)
          if (res.success) count++
        }
      }
      loadDirectory(currentPath)
      const folderName = targetFolder.split(/[\\/]/).filter(Boolean).pop() || 'folder'
      onNotify(`📥 Imported ${count} file(s) into ${folderName}`)
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

      if (e.ctrlKey && e.key.toLowerCase() === 'c' && selectedPath) {
        e.preventDefault()
        handleCopy([selectedPath])
      } else if (e.ctrlKey && e.key.toLowerCase() === 'x' && selectedPath) {
        e.preventDefault()
        handleCut([selectedPath])
      } else if (e.ctrlKey && e.key.toLowerCase() === 'v' && clipboard) {
        e.preventDefault()
        handlePaste(currentPath)
      } else if (e.key === 'Delete' && selectedPath) {
        e.preventDefault()
        const item = items.find((i) => i.path === selectedPath)
        if (item) handleDeleteItem(item)
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
          setSelectedPath(sortedAndFilteredItems[idx + 1].path)
        } else if (sortedAndFilteredItems.length > 0 && idx === -1) {
          setSelectedPath(sortedAndFilteredItems[0].path)
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        const idx = sortedAndFilteredItems.findIndex((i) => i.path === selectedPath)
        if (idx > 0) {
          setSelectedPath(sortedAndFilteredItems[idx - 1].path)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedPath, clipboard, currentPath, items, sortedAndFilteredItems])

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
      setSortDir('asc')
    }
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
          const subdirs = res.items.filter((i) => i.isDirectory)
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

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="local-explorer-container"
      onClick={() => setActiveContextMenu(null)}
      onDragOver={(e) => {
        e.preventDefault()
        setIsDraggingOverSelf(true)
      }}
      onDragLeave={() => setIsDraggingOverSelf(false)}
      onDrop={(e) => handleDropOnFolder(e, currentPath)}
    >
      {/* Clipped Text Quick-Banner */}
      {clippedText && (
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

          {clipboard && (
            <button
              className="action-icon-btn btn-paste-active"
              onClick={() => handlePaste(currentPath)}
              title={`Paste ${clipboard.paths.length} item(s) (Ctrl+V)`}
            >
              <Clipboard size={14} />
              <span>Paste ({clipboard.paths.length})</span>
            </button>
          )}

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
          {isLoading ? (
            <div className="explorer-loading-state">
              <RotateCw size={24} className="spin text-cyan" />
              <span>Reading directory...</span>
            </div>
          ) : sortedAndFilteredItems.length === 0 ? (
            <div className="explorer-empty-state">
              <Folder size={40} className="text-muted" style={{ opacity: 0.4 }} />
              <p className="empty-title">
                {searchQuery ? 'No matching files found' : 'This folder is empty'}
              </p>
              <p className="empty-subtitle">
                {searchQuery
                  ? 'Try a different search term'
                  : 'Create a new note or folder using the toolbar buttons above, or drag files here'}
              </p>
            </div>
          ) : viewMode === 'list' ? (
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
                  const isSelected = selectedPath === item.path
                  const isCut = clipboard?.action === 'cut' && clipboard.paths.includes(item.path)
                  const isOver = dropTargetFolder === item.path && item.isDirectory

                  return (
                    <div
                      key={item.path}
                      className={`details-row ${isSelected ? 'selected' : ''} ${
                        isCut ? 'is-cut' : ''
                      } ${isOver ? 'drop-active' : ''}`}
                      draggable={true}
                      onDragStart={(e) => handleDragStartItem(e, item)}
                      onDragOver={(e) => {
                        if (item.isDirectory) {
                          e.preventDefault()
                          setDropTargetFolder(item.path)
                        }
                      }}
                      onDragLeave={() => {
                        if (dropTargetFolder === item.path) setDropTargetFolder(null)
                      }}
                      onDrop={(e) => {
                        if (item.isDirectory) handleDropOnFolder(e, item.path)
                      }}
                      onClick={() => setSelectedPath(item.path)}
                      onDoubleClick={() => handleItemDoubleClick(item)}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setSelectedPath(item.path)
                        setActiveContextMenu({ item, x: e.clientX, y: e.clientY })
                      }}
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
                            setSelectedPath(item.path)
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
                const isSelected = selectedPath === item.path
                const isCut = clipboard?.action === 'cut' && clipboard.paths.includes(item.path)
                const isOver = dropTargetFolder === item.path && item.isDirectory

                return (
                  <div
                    key={item.path}
                    className={`grid-card ${isSelected ? 'selected' : ''} ${
                      isCut ? 'is-cut' : ''
                    } ${isOver ? 'drop-active' : ''}`}
                    draggable={true}
                    onDragStart={(e) => handleDragStartItem(e, item)}
                    onDragOver={(e) => {
                      if (item.isDirectory) {
                        e.preventDefault()
                        setDropTargetFolder(item.path)
                      }
                    }}
                    onDragLeave={() => {
                      if (dropTargetFolder === item.path) setDropTargetFolder(null)
                    }}
                    onDrop={(e) => {
                      if (item.isDirectory) handleDropOnFolder(e, item.path)
                    }}
                    onClick={() => setSelectedPath(item.path)}
                    onDoubleClick={() => handleItemDoubleClick(item)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setSelectedPath(item.path)
                      setActiveContextMenu({ item, x: e.clientX, y: e.clientY })
                    }}
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
        </div>
      </div>

      {/* Context Menu */}
      {activeContextMenu && (
        <div
          className="explorer-context-menu"
          style={{ top: `${activeContextMenu.y}px`, left: `${activeContextMenu.x}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          {activeContextMenu.item ? (
            <>
              <button
                className="menu-option"
                onClick={() => {
                  handleItemDoubleClick(activeContextMenu.item!)
                  setActiveContextMenu(null)
                }}
              >
                <ExternalLink size={13} />
                <span>
                  {activeContextMenu.item.isDirectory ? 'Open Folder' : 'Open (Default App)'}
                </span>
              </button>
              <button
                className="menu-option"
                onClick={() => {
                  window.electron?.showItemInFolder(activeContextMenu.item!.path)
                  setActiveContextMenu(null)
                }}
              >
                <Folder size={13} />
                <span>Reveal in Windows Explorer</span>
              </button>
              <div className="menu-divider" />
              <button
                className="menu-option"
                onClick={() => {
                  handleCut([activeContextMenu.item!.path])
                  setActiveContextMenu(null)
                }}
              >
                <Scissors size={13} />
                <span>Cut (Ctrl+X)</span>
              </button>
              <button
                className="menu-option"
                onClick={() => {
                  handleCopy([activeContextMenu.item!.path])
                  setActiveContextMenu(null)
                }}
              >
                <Copy size={13} />
                <span>Copy (Ctrl+C)</span>
              </button>
              {activeContextMenu.item.isDirectory && clipboard && (
                <button
                  className="menu-option"
                  onClick={() => {
                    handlePaste(activeContextMenu.item!.path)
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
                  navigator.clipboard.writeText(activeContextMenu.item!.path)
                  onNotify('📋 Copied full path to clipboard')
                  setActiveContextMenu(null)
                }}
              >
                <Copy size={13} />
                <span>Copy Full Path</span>
              </button>
              <div className="menu-divider" />
              <button
                className="menu-option"
                onClick={() => {
                  setRenamingItem(activeContextMenu.item!)
                  setRenameValue(activeContextMenu.item!.name)
                  setActiveContextMenu(null)
                }}
              >
                <Edit3 size={13} />
                <span>Rename (F2)</span>
              </button>
              <button
                className="menu-option text-red"
                onClick={() => {
                  handleDeleteItem(activeContextMenu.item!)
                  setActiveContextMenu(null)
                }}
              >
                <Trash2 size={13} />
                <span>Move to Recycle Bin (Del)</span>
              </button>
            </>
          ) : activeContextMenu.targetFolder ? (
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
              {clipboard && (
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
              )}
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
              {clipboard && (
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
              )}
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
