import React, { useState, useRef } from 'react'
import { Bot, UploadCloud } from 'lucide-react'
import { PaneToolbar } from '../PaneToolbar'
import { NavState, AISource } from '../../types/electron'

export interface ChatPaneProps {
  style?: React.CSSProperties
  anchorRef: React.RefObject<HTMLDivElement | null>
  navState: NavState
  onNavAction: (cmd: 'back' | 'forward' | 'reload' | 'home' | 'zoom-in' | 'zoom-out' | 'zoom-reset') => void
  aiSources: AISource[]
  activeAISourceId: string
  onOpenAISourceModal: () => void
  onOpenDeleteLogin: () => void
  onSaveAIToNote?: () => void
  onExtractCode?: () => void
  onExportTranscript?: () => void
  onNotify?: (msg: string) => void
  actionMode?: boolean
  onToggleActionMode?: () => void
  isActivatingAction?: boolean
  customInstructions?: string
  onOpenActionModeModal?: () => void
  onOpenPrimeChatModal?: () => void
}

export const ChatPane: React.FC<ChatPaneProps> = ({
  style,
  anchorRef,
  navState,
  onNavAction,
  aiSources,
  activeAISourceId,
  onOpenAISourceModal,
  onOpenDeleteLogin,
  onSaveAIToNote,
  onExtractCode,
  onExportTranscript,
  onNotify,
  actionMode,
  onToggleActionMode,
  isActivatingAction,
  customInstructions,
  onOpenActionModeModal,
  onOpenPrimeChatModal,
}) => {
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounter = useRef(0)
  const currentSource = aiSources.find((s) => s.id === activeAISourceId) || { name: 'ChatGPT' }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current++
    if (dragCounter.current === 1) {
      setIsDragOver(true)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
    if (!isDragOver) setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current <= 0) {
      dragCounter.current = 0
      setIsDragOver(false)
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current = 0
    setIsDragOver(false)

    // Check in-memory dragged file
    // Check for JSON paths from LocalExplorer
    let filePaths: string[] = []
    const jsonData = e.dataTransfer.getData('application/json')
    if (jsonData) {
      try {
        const parsed = JSON.parse(jsonData)
        if (Array.isArray(parsed?.paths) && parsed.paths.length > 0) {
          filePaths = parsed.paths
        }
      } catch (_) {}
    }

    // Check for external OS file drop
    if (filePaths.length === 0 && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const p = (e.dataTransfer.files[i] as any).path
        if (p) filePaths.push(p)
      }
    }

    // Check in-memory dragged file or custom workbench file header
    if (filePaths.length === 0) {
      const single = (window as any).__workbench_dragged_file || e.dataTransfer.getData('application/x-workbench-file')
      if (single) filePaths.push(single)
    }

    // Check text/plain (could be newline-separated file paths or highlighted quote)
    if (filePaths.length === 0) {
      const text = e.dataTransfer.getData('text/plain')
      if (text) {
        const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
        const isPathList = lines.length > 0 && lines.every((l) => l.includes(':\\') || l.startsWith('/'))
        if (isPathList) {
          filePaths = lines
        } else if (text.trim()) {
          // Plain text snippet dropped from BookView or NoteView
          onNotify?.(`🤖 Sending dropped text to ${currentSource.name}...`)
          try {
            if (window.electron?.sendTextToAI) {
              const res = await window.electron.sendTextToAI({ text: text.trim(), templateKey: 'explain' })
              if (res.success) {
                onNotify?.(`✨ Transferred text snippet to ${currentSource.name} prompt!`)
              } else {
                onNotify?.(`⚠️ ${res.error || 'Failed to send text to AI'}`)
              }
            }
          } catch (err: any) {
            onNotify?.(`⚠️ Error: ${err.message}`)
          }
          return
        }
      }
    }

    if (filePaths.length > 0) {
      if (window.electron?.sendFilesToAI) {
        onNotify?.(`🤖 Sending ${filePaths.length} file${filePaths.length > 1 ? 's' : ''} to ${currentSource.name}...`)
        try {
          const res = await window.electron.sendFilesToAI(filePaths)
          if (res.success) {
            if (res.uploaded) {
              onNotify?.(`🚀 Uploaded ${filePaths.length} file${filePaths.length > 1 ? 's' : ''} to ${currentSource.name}!`)
            } else {
              onNotify?.(`✨ Pasted ${filePaths.length} file${filePaths.length > 1 ? 's' : ''} into ${currentSource.name} prompt!`)
            }
          } else {
            onNotify?.(`⚠️ ${res.error || 'Failed to send files'}`)
          }
        } catch (err: any) {
          onNotify?.(`⚠️ Error: ${err.message}`)
        }
      } else if (window.electron?.sendFileToAI) {
        const fileName = filePaths[0].split(/[\\/]/).pop() || 'file'
        onNotify?.(`🤖 Sending ${fileName} to ${currentSource.name}...`)
        try {
          const res = await window.electron.sendFileToAI(filePaths[0])
          if (res.success) {
            if (res.uploaded) {
              onNotify?.(`🚀 Uploaded ${res.fileName || fileName} to ${currentSource.name}!`)
            } else {
              onNotify?.(`✨ Pasted ${res.fileName || fileName} into ${currentSource.name} prompt!`)
            }
          } else {
            onNotify?.(`⚠️ ${res.error || 'Failed to send file'}`)
          }
        } catch (err: any) {
          onNotify?.(`⚠️ Error: ${err.message}`)
        }
      }
    }
  }

  return (
    <div
      className="pane-wrapper ai-pane"
      style={style}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <PaneToolbar
        target="ai"
        navState={navState}
        onNavAction={onNavAction}
        onOpenSessionModal={onOpenDeleteLogin}
        onSaveAIToNote={onSaveAIToNote}
        onExtractAICode={onExtractCode}
        onExportAITranscript={onExportTranscript}
        aiSources={aiSources}
        activeAISourceId={activeAISourceId}
        onOpenAISourceModal={onOpenAISourceModal}
        actionMode={actionMode}
        onToggleActionMode={onToggleActionMode}
        isActivatingAction={isActivatingAction}
        customInstructions={customInstructions}
        onOpenActionModeModal={onOpenActionModeModal}
        onOpenPrimeChatModal={onOpenPrimeChatModal}
      />
      <div className="native-view-anchor" ref={anchorRef}>
        {isDragOver && (
          <div className="chat-drop-overlay">
            <UploadCloud size={44} className="text-emerald animate-pulse" />
            <span className="drop-title">Drop file to send to {currentSource.name}</span>
            <span className="drop-subtitle">Uploads file directly to chat</span>
          </div>
        )}
        <div className="pane-ghost-placeholder">
          <Bot size={36} className="ghost-icon text-emerald" />
          <span className="ghost-title">Chatview</span>
          <span className="ghost-subtitle">{currentSource.name}</span>
        </div>
      </div>
    </div>
  )
}

