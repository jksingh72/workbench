import React, { useState, useEffect } from 'react'
import {
  Zap,
  X,
  Folder,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Code2,
  Repeat,
  BookOpen,
  FileText,
  FolderOpen,
  ExternalLink,
  SendHorizontal,
  Server,
  RefreshCw,
  Trash2,
  Power,
} from 'lucide-react'

interface ActionModeModalProps {
  isOpen: boolean
  onClose: () => void
  actionMode: boolean
  onToggleActionMode: () => void
  customInstructions: string
  onSaveCustomInstructions: (instructions: string) => void
  activeDirectory: string
  onNotify: (msg: string) => void
}

const QUICK_RULES = [
  'Use TypeScript',
  'Follow Clean Architecture',
  'Create unit tests alongside code',
  'Do not delete files without asking',
]

export const ActionModeModal: React.FC<ActionModeModalProps> = ({
  isOpen,
  onClose,
  actionMode,
  onToggleActionMode,
  customInstructions,
  onSaveCustomInstructions,
  activeDirectory,
  onNotify,
}) => {
  const [instructions, setInstructions] = useState(customInstructions)
  const [fullPrompt, setFullPrompt] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isPriming, setIsPriming] = useState(false)
  const [feedbackLoop, setFeedbackLoop] = useState<boolean>(true)
  const [workspaceFolders, setWorkspaceFolders] = useState<{
    activeTarget: 'book' | 'note' | 'custom'
    activeDirectory: string
    bookDirectory: string
    noteDirectory: string
    customDirectory?: string
  }>({
    activeTarget: 'book',
    activeDirectory: activeDirectory || '',
    bookDirectory: '',
    noteDirectory: '',
    customDirectory: '',
  })
  const [customInputPath, setCustomInputPath] = useState<string>('')
  const [pathCopied, setPathCopied] = useState<boolean>(false)

  // MCP Servers state
  const [mcpServers, setMcpServers] = useState<any[]>([])
  const [showMcpSection, setShowMcpSection] = useState(false)
  const [isReloadingMcp, setIsReloadingMcp] = useState(false)
  const [mcpConfigPath, setMcpConfigPath] = useState<string>('')
  const [actionLoadingServer, setActionLoadingServer] = useState<string | null>(null)

  // Load MCP status and config path
  useEffect(() => {
    if (isOpen) {
      if (window.electron?.mcpGetStatus) {
        window.electron.mcpGetStatus().then((statuses) => {
          if (Array.isArray(statuses)) setMcpServers(statuses)
        }).catch(() => {})
      }
      if (window.electron?.mcpGetConfig) {
        window.electron.mcpGetConfig().then((res) => {
          if (res?.path) setMcpConfigPath(res.path)
        }).catch(() => {})
      }
    }
  }, [isOpen])

  // Load initial workspace directories and feedback state
  useEffect(() => {
    if (isOpen && window.electron?.getWorkspaceFolders) {
      window.electron.getWorkspaceFolders().then((wf) => {
        if (wf) {
          setWorkspaceFolders(wf)
          if (wf.customDirectory) {
            setCustomInputPath(wf.customDirectory)
          } else if (wf.activeTarget === 'custom' && wf.activeDirectory) {
            setCustomInputPath(wf.activeDirectory)
          }
        }
      }).catch(() => {})
    }
  }, [isOpen])

  // Sync if directories change while open
  useEffect(() => {
    if (!isOpen || !window.electron?.onActiveDirectoryChanged) return
    const unbind = window.electron.onActiveDirectoryChanged(() => {
      window.electron?.getWorkspaceFolders?.().then((wf) => {
        if (wf) setWorkspaceFolders(wf)
      }).catch(() => {})
    })
    return () => {
      unbind?.()
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen && window.electron?.getAutoFeedbackLoop) {
      window.electron.getAutoFeedbackLoop().then((res) => {
        if (typeof res === 'boolean') {
          setFeedbackLoop(res)
        }
      }).catch(() => {})
    }
  }, [isOpen])

  useEffect(() => {
    setInstructions(customInstructions)
  }, [customInstructions, isOpen])

  // Fetch live prompt preview whenever instructions or target change
  useEffect(() => {
    if (!isOpen) return
    let active = true

    const fetchPrompt = async () => {
      try {
        const p = await window.electron?.getActionPrompt?.({
          targetPane: workspaceFolders.activeTarget === 'note' ? 'note' : 'book',
          customInstructions: instructions,
        })
        if (active && p) {
          setFullPrompt(p)
        }
      } catch (_) {}
    }

    fetchPrompt()
    return () => {
      active = false
    }
  }, [isOpen, instructions, workspaceFolders.activeTarget])

  // Close on Escape, Save on Ctrl+Enter
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        handleUnifiedSave()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, instructions, workspaceFolders, customInputPath, actionMode])

  if (!isOpen) return null

  // Fast 1-click Target Switcher
  const handleSelectTarget = async (target: 'book' | 'note' | 'custom') => {
    try {
      const updated = await window.electron?.setActionTarget?.({
        target,
        customPath: target === 'custom' ? customInputPath.trim() : undefined,
      })
      if (updated) {
        setWorkspaceFolders(updated)
        const label = target === 'note' ? 'Note View' : target === 'book' ? 'Book View' : 'Custom Folder'
        onNotify(`🎯 Action Mode target: ${label}`)
      }
    } catch (_) {}
  }

  // Fast Browse & Set
  const handleBrowseFolder = async (target: 'book' | 'note' | 'custom') => {
    try {
      const picked = await window.electron?.browseDirectory?.()
      if (picked) {
        const updated = await window.electron?.setActionTarget?.({ target, customPath: picked })
        if (updated) {
          setWorkspaceFolders(updated)
          if (target === 'custom') setCustomInputPath(picked)
          const label = target === 'note' ? 'Note View' : target === 'book' ? 'Book View' : 'Custom Folder'
          onNotify(`🎯 Set ${label} to: ${picked}`)
        }
      }
    } catch (err: any) {
      onNotify('⚠️ Failed to browse folder: ' + (err?.message || ''))
    }
  }

  const handleApplyCustomPath = async () => {
    const trimmed = customInputPath.trim()
    if (!trimmed) {
      onNotify('⚠️ Please enter or browse a folder path first')
      return
    }
    try {
      const updated = await window.electron?.setActionTarget?.({ target: 'custom', customPath: trimmed })
      if (updated) {
        setWorkspaceFolders(updated)
        onNotify(`🎯 Action Mode target set to custom folder: ${trimmed}`)
      }
    } catch (err: any) {
      onNotify('⚠️ Error setting folder path: ' + (err?.message || 'Directory not found'))
    }
  }

  const handleOpenInExplorer = (dirPath: string) => {
    if (!dirPath) return
    if (window.electron?.openPath) {
      window.electron.openPath(dirPath)
      onNotify('🖥️ Opened directory in Windows File Explorer')
    } else if (window.electron?.showItemInFolder) {
      window.electron.showItemInFolder(dirPath)
      onNotify('🖥️ Opened directory in Windows File Explorer')
    }
  }

  const handleCopyTargetDirectory = (dirPath: string) => {
    if (!dirPath) return
    navigator.clipboard.writeText(dirPath)
    setPathCopied(true)
    onNotify('📋 Directory path copied to clipboard!')
    setTimeout(() => setPathCopied(false), 2000)
  }

  const handleToggleFeedbackLoop = async () => {
    const nextVal = !feedbackLoop
    setFeedbackLoop(nextVal)
    try {
      await window.electron?.setAutoFeedbackLoop?.(nextVal)
      onNotify(nextVal ? '🔄 Action Feedback Loop enabled!' : '⏸️ Action Feedback Loop disabled')
    } catch (_) {}
  }

  const handleCopyPrompt = () => {
    if (!fullPrompt) return
    navigator.clipboard.writeText(fullPrompt)
    setCopied(true)
    onNotify('📋 Full Action Prompt copied to clipboard!')
    setTimeout(() => setCopied(false), 2000)
  }

  const handleAddRule = (rule: string) => {
    setInstructions((prev) => {
      const trimmed = prev.trim()
      if (!trimmed) return rule
      if (trimmed.includes(rule)) return trimmed
      return `${trimmed}\n- ${rule}`
    })
  }

  // Save Settings without auto-submitting or creating threads in Claude
  const handleUnifiedSave = async () => {
    setIsSaving(true)
    try {
      const trimmed = instructions.trim()
      onSaveCustomInstructions(trimmed)

      // If user typed a custom path and custom target is active, apply it
      if (workspaceFolders.activeTarget === 'custom' && customInputPath.trim()) {
        await window.electron?.setActionTarget?.({ target: 'custom', customPath: customInputPath.trim() })
      }

      // Synchronize Action Mode state with primeAI: false (NEVER creates unwanted threads!)
      await window.electron?.setActionMode?.({
        enabled: actionMode,
        customInstructions: trimmed,
        primeAI: false,
      })

      onNotify('💾 Action Mode settings saved!')
      onClose()
    } catch (err: any) {
      onNotify('⚠️ Save completed with warning: ' + (err?.message || ''))
      onClose()
    } finally {
      setIsSaving(false)
    }
  }

  // Explicit user action to inject rules into active chat (ONLY when deliberately requested)
  const handlePrimeActiveChat = async () => {
    setIsPriming(true)
    try {
      const trimmed = instructions.trim()
      onSaveCustomInstructions(trimmed)

      const res = await window.electron?.setActionMode?.({
        enabled: true,
        customInstructions: trimmed,
        primeAI: true,
      })

      if (res?.alreadyPrimed) {
        onNotify('ℹ️ Active chat is already primed with Workbench action rules!')
      } else if (res?.success) {
        onNotify('⚡ Sent action rules to active chat!')
      } else {
        onNotify('⚠️ Could not prime active chat: ' + (res?.error || 'Chat input not ready'))
      }
    } catch (err: any) {
      onNotify('⚠️ Error priming chat: ' + (err?.message || 'Unknown error'))
    } finally {
      setIsPriming(false)
    }
  }

  const handleReloadMcp = async () => {
    setIsReloadingMcp(true)
    try {
      const res = await window.electron?.mcpReload?.()
      if (res?.status) {
        setMcpServers(res.status)
        const totalTools = res.status.reduce((sum: number, s: any) => sum + (s.toolCount || 0), 0)
        onNotify(`🔄 MCP reloaded: ${res.status.length} server(s), ${totalTools} tool(s) active!`)
      }
    } catch (err: any) {
      onNotify(`⚠️ MCP reload error: ${err?.message || ''}`)
    } finally {
      setIsReloadingMcp(false)
    }
  }

  const handleOpenMcpConfig = async () => {
    try {
      const res = await window.electron?.mcpOpenConfig?.()
      if (res?.success) {
        onNotify('📂 Opened workbench-mcp.json in explorer')
      } else {
        onNotify(`⚠️ ${res?.error || 'Could not open config file'}`)
      }
    } catch (err: any) {
      onNotify(`⚠️ ${err?.message || 'Error opening config'}`)
    }
  }

  const handleToggleServer = async (serverName: string, currentlyDisabled: boolean) => {
    setActionLoadingServer(serverName)
    try {
      const newDisabledState = !currentlyDisabled
      const res = await window.electron?.mcpConfigureServer?.(serverName, { disabled: newDisabledState })
      if (res?.status) {
        setMcpServers(res.status)
      } else if (res?.serverInfo) {
        setMcpServers((prev) => prev.map((s) => (s.name === serverName ? res.serverInfo : s)))
      }
      if (res?.success) {
        onNotify(newDisabledState ? `⏸️ MCP server "${serverName}" disabled` : `🟢 MCP server "${serverName}" enabled and active!`)
      } else {
        onNotify(`⚠️ Failed to toggle "${serverName}": ${res?.error || 'Unknown error'}`)
      }
    } catch (err: any) {
      onNotify(`⚠️ Error toggling MCP server "${serverName}": ${err?.message || ''}`)
    } finally {
      setActionLoadingServer(null)
    }
  }

  const handleRemoveServer = async (serverName: string) => {
    if (!window.confirm(`Remove MCP server "${serverName}"? This will disconnect the server and remove it from workbench-mcp.json.`)) {
      return
    }
    setActionLoadingServer(serverName)
    try {
      const res = await window.electron?.mcpRemoveServer?.(serverName)
      if (res?.status) {
        setMcpServers(res.status)
      } else {
        setMcpServers((prev) => prev.filter((s) => s.name !== serverName))
      }
      if (res?.success) {
        onNotify(`🗑️ Removed MCP server "${serverName}"`)
      } else {
        onNotify(`⚠️ Could not remove server "${serverName}"`)
      }
    } catch (err: any) {
      onNotify(`⚠️ Error removing MCP server "${serverName}": ${err?.message || ''}`)
    } finally {
      setActionLoadingServer(null)
    }
  }

  // Determine current active folder display
  const currentTarget = workspaceFolders.activeTarget
  const currentPath =
    currentTarget === 'book'
      ? workspaceFolders.bookDirectory
      : currentTarget === 'note'
      ? workspaceFolders.noteDirectory
      : customInputPath || workspaceFolders.customDirectory || workspaceFolders.activeDirectory

  const targetColor = currentTarget === 'note' ? '#38bdf8' : currentTarget === 'custom' ? '#f59e0b' : '#34d399'

  return (
    <div className="pane-modal-backdrop" onClick={onClose}>
      <div
        className="pane-modal-container action-mode-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '580px',
          width: '92%',
          background: '#0f172a',
          border: '1px solid rgba(255, 255, 255, 0.14)',
          borderRadius: '12px',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.08)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header: Title + Master Action Mode Pill Toggle + Close */}
        <div
          className="modal-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 18px',
            background: 'rgba(255, 255, 255, 0.02)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: actionMode ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                color: actionMode ? '#34d399' : '#94a3b8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: actionMode ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
                transition: 'all 0.2s ease',
              }}
            >
              <Zap size={18} className={actionMode ? 'fill-emerald animate-pulse' : ''} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.2px' }}>
                  Action Mode Settings
                </h3>
              </div>
              <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>
                Automated file execution target & AI system prompt rules
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Master Toggle Pill Button */}
            <button
              onClick={onToggleActionMode}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 12px',
                borderRadius: '20px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                background: actionMode
                  ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.25) 0%, rgba(5, 150, 105, 0.35) 100%)'
                  : 'rgba(255, 255, 255, 0.05)',
                border: actionMode ? '1px solid rgba(52, 211, 153, 0.6)' : '1px solid rgba(255, 255, 255, 0.12)',
                color: actionMode ? '#34d399' : '#94a3b8',
                boxShadow: actionMode ? '0 0 14px rgba(16, 185, 129, 0.3)' : 'none',
              }}
              title="Click to toggle Action Mode ON or OFF (Does not affect chat history)"
            >
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  background: actionMode ? '#10b981' : '#64748b',
                  boxShadow: actionMode ? '0 0 6px #10b981' : 'none',
                }}
              />
              <span>{actionMode ? 'Action Mode: ON' : 'Action Mode: OFF'}</span>
            </button>

            <button
              className="modal-close-btn"
              onClick={onClose}
              title="Close (Esc)"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#64748b',
                padding: '4px',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div
          className="modal-body"
          style={{
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            overflowY: 'auto',
            maxHeight: 'calc(85vh - 120px)',
          }}
        >
          {/* Section 1: Unified Target Destination (Segmented Switcher) */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              padding: '12px',
              background: 'rgba(255, 255, 255, 0.025)',
              border: '1px solid rgba(255, 255, 255, 0.07)',
              borderRadius: '9px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#94a3b8' }}>
                Execution Target Destination
              </span>
              <span
                style={{
                  fontSize: '10px',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontWeight: 700,
                  background: currentTarget === 'note' ? 'rgba(56, 189, 248, 0.15)' : currentTarget === 'custom' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(52, 211, 153, 0.15)',
                  color: targetColor,
                  border: `1px solid ${targetColor}40`,
                }}
              >
                ● Active: {currentTarget === 'note' ? 'Note View' : currentTarget === 'custom' ? 'Custom Folder' : 'Book View'}
              </span>
            </div>

            {/* Segmented Tab Bar */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '4px',
                background: 'rgba(0, 0, 0, 0.35)',
                padding: '3px',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              {/* Tab 1: Book View */}
              <button
                onClick={() => handleSelectTarget('book')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '7px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: currentTarget === 'book' ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  border: currentTarget === 'book' ? '1px solid rgba(52, 211, 153, 0.45)' : '1px solid transparent',
                  background: currentTarget === 'book' ? 'rgba(52, 211, 153, 0.15)' : 'transparent',
                  color: currentTarget === 'book' ? '#34d399' : '#94a3b8',
                }}
                title="Target files in Book View"
              >
                <BookOpen size={13} />
                <span>Book View</span>
              </button>

              {/* Tab 2: Note View */}
              <button
                onClick={() => handleSelectTarget('note')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '7px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: currentTarget === 'note' ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  border: currentTarget === 'note' ? '1px solid rgba(56, 189, 248, 0.45)' : '1px solid transparent',
                  background: currentTarget === 'note' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                  color: currentTarget === 'note' ? '#38bdf8' : '#94a3b8',
                }}
                title="Target files in Note View"
              >
                <FileText size={13} />
                <span>Note View</span>
              </button>

              {/* Tab 3: Custom Folder */}
              <button
                onClick={() => handleSelectTarget('custom')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '7px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: currentTarget === 'custom' ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  border: currentTarget === 'custom' ? '1px solid rgba(245, 158, 11, 0.45)' : '1px solid transparent',
                  background: currentTarget === 'custom' ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
                  color: currentTarget === 'custom' ? '#f59e0b' : '#94a3b8',
                }}
                title="Target any custom folder on PC"
              >
                <Folder size={13} />
                <span>Custom Folder</span>
              </button>
            </div>

            {/* Active Target Path Row & Actions */}
            {currentTarget !== 'custom' ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  padding: '8px 10px',
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                  <FolderOpen size={14} style={{ color: targetColor, flexShrink: 0 }} />
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '11px',
                      color: currentPath ? '#f1f5f9' : '#64748b',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={currentPath || 'No folder loaded in this view'}
                  >
                    {currentPath || `No folder loaded in ${currentTarget === 'note' ? 'Note View' : 'Book View'}`}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                  <button
                    onClick={() => handleBrowseFolder(currentTarget)}
                    className="clip-note-btn"
                    style={{
                      fontSize: '10px',
                      padding: '3px 8px',
                      background: 'rgba(255, 255, 255, 0.06)',
                      borderColor: 'rgba(255, 255, 255, 0.18)',
                      color: '#f1f5f9',
                    }}
                    title="Change folder for this view"
                  >
                    <FolderOpen size={11} />
                    <span>Change...</span>
                  </button>

                  {currentPath && (
                    <>
                      <button
                        onClick={() => handleOpenInExplorer(currentPath)}
                        className="clip-note-btn"
                        style={{ fontSize: '10px', padding: '3px 7px', color: '#94a3b8' }}
                        title="Open in Windows File Explorer"
                      >
                        <ExternalLink size={11} />
                        <span>Explore</span>
                      </button>
                      <button
                        onClick={() => handleCopyTargetDirectory(currentPath)}
                        className="clip-note-btn"
                        style={{ fontSize: '10px', padding: '3px 7px' }}
                        title="Copy folder path"
                      >
                        {pathCopied ? <Check size={11} className="text-emerald" /> : <Copy size={11} />}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              /* Custom Folder Input Row */
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  value={customInputPath}
                  onChange={(e) => setCustomInputPath(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleApplyCustomPath()
                    }
                  }}
                  placeholder="Paste or type path, e.g. D:\Projects\MyNotes"
                  style={{
                    flex: 1,
                    background: 'rgba(0, 0, 0, 0.35)',
                    border: '1px solid rgba(245, 158, 11, 0.35)',
                    borderRadius: '5px',
                    color: '#f8fafc',
                    fontSize: '11px',
                    padding: '6px 9px',
                    fontFamily: 'monospace',
                    outline: 'none',
                  }}
                />
                <button
                  onClick={() => handleBrowseFolder('custom')}
                  className="clip-note-btn"
                  style={{
                    fontSize: '10px',
                    padding: '4px 9px',
                    background: 'rgba(245, 158, 11, 0.15)',
                    borderColor: 'rgba(245, 158, 11, 0.4)',
                    color: '#f59e0b',
                    flexShrink: 0,
                  }}
                  title="Browse folder from disk"
                >
                  <FolderOpen size={11} />
                  <span>Browse...</span>
                </button>
                <button
                  onClick={handleApplyCustomPath}
                  className="clip-note-btn"
                  style={{
                    fontSize: '10px',
                    padding: '4px 9px',
                    background: 'rgba(245, 158, 11, 0.25)',
                    borderColor: 'rgba(245, 158, 11, 0.5)',
                    color: '#f59e0b',
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                  title="Set target folder"
                >
                  <Check size={11} />
                  <span>Set</span>
                </button>
                {customInputPath && (
                  <button
                    onClick={() => handleOpenInExplorer(customInputPath)}
                    className="clip-note-btn"
                    style={{ fontSize: '10px', padding: '4px 6px', color: '#94a3b8', flexShrink: 0 }}
                    title="Open in Explorer"
                  >
                    <ExternalLink size={11} />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Section 2: Two-Way Action Feedback Loop (Compact 1-row) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              background: 'rgba(56, 189, 248, 0.04)',
              border: '1px solid rgba(56, 189, 248, 0.15)',
              borderRadius: '8px',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '6px',
                  background: feedbackLoop ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  color: feedbackLoop ? '#38bdf8' : '#94a3b8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Repeat size={13} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ color: '#f1f5f9', fontWeight: 600, fontSize: '11px' }}>
                  Two-Way Action Feedback Loop
                </span>
                <span style={{ color: '#94a3b8', fontSize: '10px' }}>
                  Feeds tool results back into chat so the AI can verify and proceed autonomously
                </span>
              </div>
            </div>

            <button
              onClick={handleToggleFeedbackLoop}
              style={{
                padding: '3px 10px',
                borderRadius: '14px',
                fontSize: '10px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                background: feedbackLoop ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                border: feedbackLoop ? '1px solid rgba(56, 189, 248, 0.45)' : '1px solid rgba(255, 255, 255, 0.12)',
                color: feedbackLoop ? '#38bdf8' : '#94a3b8',
                flexShrink: 0,
              }}
              title="Toggle feedback loop"
            >
              {feedbackLoop ? 'Loop: ON' : 'Loop: OFF'}
            </button>
          </div>

          {/* Section 3: Custom Instructions & Rule Suggestions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Sparkles size={12} className="text-amber" />
                <span>Custom Prompt Rules & Coding Guidelines:</span>
              </label>
              {instructions && (
                <button
                  onClick={() => setInstructions('')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    fontSize: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                  title="Clear custom instructions"
                >
                  <RotateCcw size={10} />
                  <span>Reset</span>
                </button>
              )}
            </div>

            {/* Quick Rule Chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
              {QUICK_RULES.map((rule) => (
                <button
                  key={rule}
                  onClick={() => handleAddRule(rule)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '12px',
                    color: '#94a3b8',
                    fontSize: '10px',
                    padding: '2px 8px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(245, 158, 11, 0.12)'
                    e.currentTarget.style.color = '#f59e0b'
                    e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.3)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'
                    e.currentTarget.style.color = '#94a3b8'
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
                  }}
                  title={`Add "${rule}" to instructions`}
                >
                  + {rule}
                </button>
              ))}
            </div>

            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Always write clean TypeScript. Add tests alongside components. Do not delete files without asking."
              rows={3}
              style={{
                width: '100%',
                background: 'rgba(0, 0, 0, 0.35)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '6px',
                color: '#f8fafc',
                fontSize: '11px',
                lineHeight: '1.4',
                padding: '7px 9px',
                fontFamily: 'inherit',
                resize: 'vertical',
                outline: 'none',
              }}
            />
          </div>

          {/* Section 4: MCP Servers (Model Context Protocol) */}
          <div
            style={{
              border: '1px solid rgba(255, 255, 255, 0.07)',
              borderRadius: '7px',
              overflow: 'hidden',
              background: 'rgba(0, 0, 0, 0.2)',
            }}
          >
            <div
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '7px 10px',
                background: 'rgba(255, 255, 255, 0.02)',
                cursor: 'pointer',
              }}
              onClick={() => setShowMcpSection(!showMcpSection)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Server size={13} style={{ color: '#c084fc' }} />
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#cbd5e1' }}>
                  MCP Servers
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    padding: '1px 6px',
                    borderRadius: '10px',
                    background: mcpServers.some((s) => s.connected) ? 'rgba(52, 211, 153, 0.15)' : 'rgba(255, 255, 255, 0.06)',
                    color: mcpServers.some((s) => s.connected) ? '#34d399' : '#94a3b8',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                  }}
                >
                  {mcpServers.filter((s) => s.connected).length} active ({mcpServers.reduce((sum, s) => sum + (s.toolCount || 0), 0)} tools)
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleOpenMcpConfig()
                  }}
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#94a3b8',
                    padding: '2px 7px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    cursor: 'pointer',
                  }}
                  title={`Open workbench-mcp.json (${mcpConfigPath || 'config'})`}
                >
                  <ExternalLink size={10} />
                  <span>Config</span>
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleReloadMcp()
                  }}
                  disabled={isReloadingMcp}
                  style={{
                    background: 'rgba(168, 85, 247, 0.12)',
                    border: '1px solid rgba(168, 85, 247, 0.3)',
                    color: '#c084fc',
                    padding: '2px 7px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    cursor: 'pointer',
                  }}
                  title="Reload MCP servers from config"
                >
                  <RefreshCw size={10} className={isReloadingMcp ? 'animate-spin' : ''} />
                  <span>{isReloadingMcp ? 'Reloading...' : 'Reload'}</span>
                </button>
                {showMcpSection ? <ChevronDown size={13} style={{ color: '#94a3b8' }} /> : <ChevronRight size={13} style={{ color: '#94a3b8' }} />}
              </div>
            </div>

            {showMcpSection && (
              <div style={{ padding: '8px 10px', borderTop: '1px solid rgba(255, 255, 255, 0.07)' }}>
                {mcpServers.length === 0 ? (
                  <div style={{ fontSize: '11px', color: '#94a3b8', padding: '6px 0', lineHeight: '1.4' }}>
                    No MCP servers configured yet. Click <strong>Config</strong> above to open{' '}
                    <code style={{ color: '#c084fc', fontSize: '10px' }}>workbench-mcp.json</code> and paste servers
                    (SQLite, GitHub, Web Search, etc.).
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {mcpServers.map((srv) => (
                      <div
                        key={srv.name}
                        style={{
                          background: 'rgba(0, 0, 0, 0.3)',
                          border: `1px solid ${
                            srv.connected
                              ? 'rgba(52, 211, 153, 0.2)'
                              : srv.disabled
                              ? 'rgba(255, 255, 255, 0.05)'
                              : 'rgba(239, 68, 68, 0.15)'
                          }`,
                          borderRadius: '5px',
                          padding: '6px 8px',
                          opacity: srv.disabled ? 0.75 : 1,
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
                            <span
                              style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                background: srv.connected ? '#34d399' : srv.disabled ? '#64748b' : '#f87171',
                                flexShrink: 0,
                              }}
                            />
                            <strong style={{ fontSize: '11px', color: srv.disabled ? '#94a3b8' : '#f1f5f9' }}>{srv.name}</strong>
                            <span
                              style={{
                                fontSize: '10px',
                                color: '#64748b',
                                fontFamily: 'monospace',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                              title={`${srv.command} ${(srv.args || []).join(' ')}`}
                            >
                              ({srv.command} {(srv.args || []).slice(0, 2).join(' ')})
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, marginLeft: '8px' }}>
                            <span
                              style={{
                                fontSize: '9.5px',
                                color: srv.connected ? '#34d399' : srv.disabled ? '#64748b' : '#f87171',
                                fontWeight: 500,
                              }}
                            >
                              {srv.connected
                                ? `${srv.toolCount} tool(s)`
                                : srv.disabled
                                ? 'Disabled'
                                : srv.error || 'Disconnected'}
                            </span>

                            {/* Inline Toggle: Enable / Disable */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleToggleServer(srv.name, !!srv.disabled)
                              }}
                              disabled={actionLoadingServer === srv.name}
                              style={{
                                background: srv.disabled ? 'rgba(255, 255, 255, 0.05)' : 'rgba(52, 211, 153, 0.12)',
                                border: `1px solid ${
                                  srv.disabled ? 'rgba(255, 255, 255, 0.12)' : 'rgba(52, 211, 153, 0.3)'
                                }`,
                                borderRadius: '4px',
                                color: srv.disabled ? '#94a3b8' : '#34d399',
                                padding: '2px 6px',
                                fontSize: '9.5px',
                                fontWeight: 600,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                cursor: actionLoadingServer === srv.name ? 'wait' : 'pointer',
                                transition: 'all 0.15s ease',
                              }}
                              title={srv.disabled ? `Enable "${srv.name}"` : `Disable "${srv.name}"`}
                            >
                              {actionLoadingServer === srv.name ? (
                                <RefreshCw size={9} className="animate-spin" />
                              ) : (
                                <Power size={9} />
                              )}
                              <span>{srv.disabled ? 'Enable' : 'Active'}</span>
                            </button>

                            {/* Inline Delete: Trash icon */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleRemoveServer(srv.name)
                              }}
                              disabled={actionLoadingServer === srv.name}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#64748b',
                                padding: '2px 4px',
                                borderRadius: '4px',
                                cursor: actionLoadingServer === srv.name ? 'wait' : 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.15s ease',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.color = '#f87171'
                                e.currentTarget.style.background = 'rgba(248, 113, 113, 0.15)'
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.color = '#64748b'
                                e.currentTarget.style.background = 'transparent'
                              }}
                              title={`Remove "${srv.name}" MCP server`}
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>
                        {srv.tools && srv.tools.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                            {srv.tools.map((t: any) => (
                              <span
                                key={t.actionId}
                                style={{
                                  fontSize: '9.5px',
                                  fontFamily: 'monospace',
                                  padding: '1px 5px',
                                  background: 'rgba(168, 85, 247, 0.1)',
                                  border: '1px solid rgba(168, 85, 247, 0.2)',
                                  borderRadius: '3px',
                                  color: '#d8b4fe',
                                }}
                                title={t.description || t.actionId}
                              >
                                {t.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 5: Collapsible AI Prompt Preview & Optional Manual Priming */}
          <div
            style={{
              border: '1px solid rgba(255, 255, 255, 0.07)',
              borderRadius: '7px',
              overflow: 'hidden',
              background: 'rgba(0, 0, 0, 0.2)',
            }}
          >
            <div
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 10px',
                background: 'rgba(255, 255, 255, 0.02)',
                cursor: 'pointer',
              }}
              onClick={() => setShowPreview(!showPreview)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Code2 size={12} className="text-cyan" />
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#cbd5e1' }}>
                  Preview Injected AI System Prompt
                </span>
                <span style={{ fontSize: '10px', color: '#64748b' }}>({fullPrompt.length} chars)</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleCopyPrompt()
                  }}
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#94a3b8',
                    padding: '2px 7px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    cursor: 'pointer',
                  }}
                  title="Copy full AI system prompt to clipboard"
                >
                  {copied ? <Check size={10} className="text-emerald" /> : <Copy size={10} />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
                {showPreview ? <ChevronDown size={13} style={{ color: '#94a3b8' }} /> : <ChevronRight size={13} style={{ color: '#94a3b8' }} />}
              </div>
            </div>

            {showPreview && (
              <div style={{ padding: '8px 10px', borderTop: '1px solid rgba(255, 255, 255, 0.07)' }}>
                <pre
                  style={{
                    margin: 0,
                    fontSize: '10px',
                    lineHeight: '1.4',
                    maxHeight: '130px',
                    overflowY: 'auto',
                    fontFamily: 'monospace',
                    color: '#94a3b8',
                    background: 'rgba(0, 0, 0, 0.4)',
                    padding: '8px',
                    borderRadius: '4px',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {fullPrompt}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer: Explicit Controls, Zero Unwanted Submissions */}
        <div
          className="modal-footer"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 18px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(0, 0, 0, 0.25)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: '#64748b' }}>Shortcut:</span>
            <kbd
              style={{
                fontSize: '10px',
                fontFamily: 'monospace',
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '3px',
                padding: '1px 5px',
                color: '#94a3b8',
              }}
            >
              Ctrl+Enter
            </kbd>
            <span style={{ fontSize: '10px', color: '#64748b' }}>to save</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#cbd5e1',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Cancel
            </button>

            {/* Optional explicit action to prime the active conversation ONLY when user explicitly asks */}
            {actionMode && (
              <button
                onClick={handlePrimeActiveChat}
                disabled={isPriming}
                style={{
                  background: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  color: '#34d399',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: isPriming ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  transition: 'all 0.15s ease',
                }}
                title="Send action mode rules into your active chat thread (Only click if you want AI to learn rules in this chat)"
              >
                <SendHorizontal size={12} className={isPriming ? 'animate-pulse' : ''} />
                <span>{isPriming ? 'Sending...' : 'Prime Active Chat'}</span>
              </button>
            )}

            {/* Primary Action: Save Settings Locally (NEVER creates threads in Claude) */}
            <button
              onClick={handleUnifiedSave}
              disabled={isSaving}
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                border: 'none',
                color: '#fff',
                padding: '6px 18px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: isSaving ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 10px rgba(16, 185, 129, 0.35)',
                transition: 'all 0.15s ease',
              }}
              title="Save instructions & target destination (Ctrl+Enter)"
            >
              <Check size={13} />
              <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
