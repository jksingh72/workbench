import React, { useState, useEffect, useMemo } from 'react'
import {
  Folder,
  FolderPlus,
  FileText,
  FileCode,
  FileImage,
  File,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
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
  HardDrive,
  MoreVertical,
  Sparkles,
  X,
  FileCheck
} from 'lucide-react'
import { FileItem } from '../types/electron'

interface LocalExplorerProps {
  rootPath: string
  clippedText?: string | null
  onClearClippedText?: () => void
  onNotify: (msg: string) => void
}

export const LocalExplorer: React.FC<LocalExplorerProps> = ({
  rootPath,
  clippedText,
  onClearClippedText,
  onNotify,
}) => {
  const [currentPath, setCurrentPath] = useState<string>(rootPath || '')
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState<number>(-1)
  const [items, setItems] = useState<FileItem[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [activeContextMenu, setActiveContextMenu] = useState<{
    item: FileItem
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
    // Determine parent folder
    const normalized = currentPath.replace(/\\/g, '/')
    const parts = normalized.split('/').filter(Boolean)
    if (parts.length <= 1) return // Already at root (e.g. D:)

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

  const handleOpenInExplorer = () => {
    if (window.electron?.showItemInFolder) {
      window.electron.showItemInFolder(currentPath)
      onNotify('🖥️ Opened in Windows Explorer')
    }
  }

  // Open item (Enter folder or launch app for file)
  const handleItemDoubleClick = async (item: FileItem) => {
    if (item.isDirectory) {
      navigateTo(item.path)
    } else {
      if (window.electron?.openPath) {
        const res = await window.electron.openPath(item.path)
        if (res.success) {
          onNotify(`🚀 Opened ${item.name} with default app`)
        } else {
          onNotify(`⚠️ Could not open file: ${res.error}`)
        }
      }
    }
  }

  // File creation
  const handleCreateNewItem = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanName = newItemName.trim()
    if (!cleanName) return

    if (showNewModal === 'folder' && window.electron?.createFolder) {
      const res = await window.electron.createFolder(currentPath, cleanName)
      if (res.success) {
        onNotify(`📁 Created folder: ${cleanName}`)
        loadDirectory(currentPath)
        setShowNewModal(null)
        setNewItemName('')
      } else {
        onNotify(`⚠️ Error creating folder: ${res.error}`)
      }
    } else if (showNewModal === 'file' && window.electron?.createFile) {
      const res = await window.electron.createFile(currentPath, cleanName)
      if (res.success) {
        onNotify(`📄 Created file: ${cleanName}`)
        loadDirectory(currentPath)
        setShowNewModal(null)
        setNewItemName('')
      } else {
        onNotify(`⚠️ Error creating file: ${res.error}`)
      }
    }
  }

  // Rename
  const handleSaveRename = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!renamingItem || !renameValue.trim() || !window.electron?.renameItem) return
    const cleanNewName = renameValue.trim()
    const parent = currentPath
    const newPath = `${parent}\\${cleanNewName}`

    const res = await window.electron.renameItem(renamingItem.path, newPath)
    if (res.success) {
      onNotify(`✏️ Renamed to ${cleanNewName}`)
      loadDirectory(currentPath)
      setRenamingItem(null)
      setRenameValue('')
    } else {
      onNotify(`⚠️ Rename failed: ${res.error}`)
    }
  }

  // Delete
  const handleDeleteItem = async (item: FileItem) => {
    if (!window.electron?.deleteItem) return
    const confirmed = window.confirm(`Move "${item.name}" to Recycle Bin?`)
    if (!confirmed) return

    const res = await window.electron.deleteItem(item.path)
    if (res.success) {
      onNotify(`🗑️ Moved to Recycle Bin: ${item.name}`)
      loadDirectory(currentPath)
    } else {
      onNotify(`⚠️ Delete failed: ${res.error}`)
    }
  }

  // Clip saving
  const handleSaveClipToFolder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!clippedText || !clipFileName.trim() || !window.electron?.createFile) return

    let fName = clipFileName.trim()
    if (!fName.includes('.')) {
      fName += '.md'
    }

    const res = await window.electron.createFile(currentPath, fName, clippedText)
    if (res.success) {
      onNotify(`✨ Saved clipped note as ${fName}`)
      loadDirectory(currentPath)
      setShowClipModal(false)
      onClearClippedText?.()
    } else {
      onNotify(`⚠️ Failed to save note: ${res.error}`)
    }
  }

  // Filtered items
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items
    const q = searchQuery.toLowerCase().trim()
    return items.filter((item) => item.name.toLowerCase().includes(q))
  }, [items, searchQuery])

  // Breadcrumb path segments
  const breadcrumbSegments = useMemo(() => {
    const normalized = currentPath.replace(/\\/g, '/')
    const parts = normalized.split('/').filter(Boolean)
    const result: { label: string; fullPath: string }[] = []

    let acc = ''
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      if (i === 0 && part.endsWith(':')) {
        acc = `${part}\\`
      } else {
        acc = acc ? `${acc}\\${part}` : part
      }
      result.push({ label: part, fullPath: acc })
    }
    return result
  }, [currentPath])

  // Helper for size display
  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '—'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // Helper for date display
  const formatDate = (isoString: string): string => {
    try {
      const d = new Date(isoString)
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return '—'
    }
  }

  // Helper for icons based on file type
  const renderItemIcon = (item: FileItem) => {
    if (item.isDirectory) {
      return <Folder size={18} className="file-icon folder-icon" />
    }

    const ext = item.extension.toLowerCase()
    switch (ext) {
      case '.docx':
      case '.doc':
        return (
          <div className="file-badge-icon badge-word" title="Microsoft Word Document">
            <span className="badge-letter">W</span>
          </div>
        )
      case '.xlsx':
      case '.xls':
      case '.csv':
        return (
          <div className="file-badge-icon badge-excel" title="Microsoft Excel Spreadsheet">
            <span className="badge-letter">X</span>
          </div>
        )
      case '.pptx':
      case '.ppt':
        return (
          <div className="file-badge-icon badge-ppt" title="Microsoft PowerPoint Presentation">
            <span className="badge-letter">P</span>
          </div>
        )
      case '.pdf':
        return (
          <div className="file-badge-icon badge-pdf" title="Adobe PDF Document">
            <span className="badge-letter">PDF</span>
          </div>
        )
      case '.md':
      case '.txt':
      case '.rtf':
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

  // Helper for type description
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

  return (
    <div className="local-explorer-container" onClick={() => setActiveContextMenu(null)}>
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
        {/* Navigation buttons */}
        <div className="explorer-nav-buttons">
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
          <button className="nav-btn" onClick={handleGoUp} title="Up one folder">
            <ArrowUp size={15} />
          </button>
          <button className="nav-btn" onClick={handleRefresh} title="Refresh (F5)">
            <RotateCw size={15} />
          </button>
        </div>

        {/* Breadcrumb Path Bar */}
        <div className="explorer-breadcrumb-bar">
          <HardDrive size={13} className="text-muted" style={{ marginRight: '6px' }} />
          {breadcrumbSegments.map((seg, idx) => (
            <React.Fragment key={seg.fullPath}>
              {idx > 0 && <ChevronRight size={12} className="breadcrumb-arrow" />}
              <button
                type="button"
                className={`breadcrumb-segment ${idx === breadcrumbSegments.length - 1 ? 'current' : ''}`}
                onClick={() => navigateTo(seg.fullPath)}
                title={seg.fullPath}
              >
                {seg.label}
              </button>
            </React.Fragment>
          ))}
        </div>

        {/* Search Bar */}
        <div className="explorer-search-box">
          <Search size={13} className="search-icon" />
          <input
            type="text"
            placeholder="Filter files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="clear-search-btn" onClick={() => setSearchQuery('')}>
              <X size={12} />
            </button>
          )}
        </div>

        {/* Quick action buttons */}
        <div className="explorer-actions-right">
          <button
            className="action-icon-btn"
            onClick={() => {
              setNewItemName('New Note.md')
              setShowNewModal('file')
            }}
            title="New File"
          >
            <Plus size={14} />
            <span>File</span>
          </button>
          <button
            className="action-icon-btn"
            onClick={() => {
              setNewItemName('New Folder')
              setShowNewModal('folder')
            }}
            title="New Folder"
          >
            <FolderPlus size={14} />
            <span>Folder</span>
          </button>
          <button
            className="action-icon-btn btn-explorer-reveal"
            onClick={handleOpenInExplorer}
            title="Open in Windows Explorer"
          >
            <ExternalLink size={14} />
          </button>
          <div className="view-toggle-group">
            <button
              className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="Details List View"
            >
              <List size={14} />
            </button>
            <button
              className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Grid Cards View"
            >
              <LayoutGrid size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Main File Content Area */}
      <div className="explorer-content">
        {isLoading ? (
          <div className="explorer-loading-state">
            <RotateCw size={24} className="spin text-cyan" />
            <span>Reading directory...</span>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="explorer-empty-state">
            <Folder size={40} className="text-muted" style={{ opacity: 0.4 }} />
            <p className="empty-title">
              {searchQuery ? 'No matching files found' : 'This folder is empty'}
            </p>
            <p className="empty-subtitle">
              {searchQuery
                ? 'Try a different search term'
                : 'Create a new note or folder using the toolbar buttons above'}
            </p>
          </div>
        ) : viewMode === 'list' ? (
          <div className="explorer-list-view">
            <div className="list-header-row">
              <div className="col-name">Name</div>
              <div className="col-type">Type</div>
              <div className="col-size">Size</div>
              <div className="col-date">Date Modified</div>
              <div className="col-actions"></div>
            </div>
            <div className="list-body">
              {filteredItems.map((item) => {
                const isSelected = selectedPath === item.path
                return (
                  <div
                    key={item.path}
                    className={`list-item-row ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedPath(item.path)}
                    onDoubleClick={() => handleItemDoubleClick(item)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setSelectedPath(item.path)
                      setActiveContextMenu({ item, x: e.clientX, y: e.clientY })
                    }}
                  >
                    <div className="col-name">
                      <span className="item-icon-wrapper">{renderItemIcon(item)}</span>
                      <span className="item-name" title={item.name}>
                        {item.name}
                      </span>
                    </div>
                    <div className="col-type">{getTypeDescription(item)}</div>
                    <div className="col-size">{formatSize(item.size)}</div>
                    <div className="col-date">{formatDate(item.mtime)}</div>
                    <div className="col-actions">
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
            {filteredItems.map((item) => {
              const isSelected = selectedPath === item.path
              return (
                <div
                  key={item.path}
                  className={`grid-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedPath(item.path)}
                  onDoubleClick={() => handleItemDoubleClick(item)}
                  onContextMenu={(e) => {
                    e.preventDefault()
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

      {/* Status Bar */}
      <div className="explorer-status-bar">
        <div className="status-left">
          <span>{filteredItems.length} items</span>
          {searchQuery && <span className="status-filtered">(filtered from {items.length})</span>}
        </div>
        <div className="status-right">
          {selectedPath && (
            <span className="status-selected" title={selectedPath}>
              Selected: {selectedPath.split('\\').pop()}
            </span>
          )}
        </div>
      </div>

      {/* Context Menu */}
      {activeContextMenu && (
        <div
          className="explorer-context-menu"
          style={{ top: activeContextMenu.y, left: Math.min(activeContextMenu.x, window.innerWidth - 200) }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="menu-option"
            onClick={() => {
              handleItemDoubleClick(activeContextMenu.item)
              setActiveContextMenu(null)
            }}
          >
            <ExternalLink size={13} />
            <span>{activeContextMenu.item.isDirectory ? 'Open Folder' : 'Open (Default App)'}</span>
          </button>
          <button
            className="menu-option"
            onClick={() => {
              window.electron?.showItemInFolder(activeContextMenu.item.path)
              setActiveContextMenu(null)
            }}
          >
            <Folder size={13} />
            <span>Reveal in Windows Explorer</span>
          </button>
          <button
            className="menu-option"
            onClick={() => {
              navigator.clipboard.writeText(activeContextMenu.item.path)
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
              setRenamingItem(activeContextMenu.item)
              setRenameValue(activeContextMenu.item.name)
              setActiveContextMenu(null)
            }}
          >
            <Edit3 size={13} />
            <span>Rename</span>
          </button>
          <button
            className="menu-option text-red"
            onClick={() => {
              handleDeleteItem(activeContextMenu.item)
              setActiveContextMenu(null)
            }}
          >
            <Trash2 size={13} />
            <span>Move to Recycle Bin</span>
          </button>
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
                <label>{showNewModal === 'folder' ? 'Folder Name' : 'File Name (e.g. Notes.md, Report.docx)'}</label>
                <input
                  type="text"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  placeholder={showNewModal === 'folder' ? 'My Folder' : 'Note.md'}
                  autoFocus
                />
              </div>
              <div className="edit-actions-right" style={{ marginTop: '16px' }}>
                <button type="button" className="btn-cancel-edit" onClick={() => setShowNewModal(null)}>
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
                <button type="button" className="btn-cancel-edit" onClick={() => setRenamingItem(null)}>
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
                <button type="button" className="btn-cancel-edit" onClick={() => setShowClipModal(false)}>
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
