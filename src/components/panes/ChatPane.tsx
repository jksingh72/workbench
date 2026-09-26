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
    let filePath = (window as any).__workbench_dragged_file || ''

    // Check for custom workbench file or JSON path from LocalExplorer
    if (!filePath) {
      filePath = e.dataTransfer.getData('application/x-workbench-file') || ''
    }
    if (!filePath) {
      const jsonData = e.dataTransfer.getData('application/json')
      if (jsonData) {
        try {
          const { paths } = JSON.parse(jsonData)
          if (paths && paths.length > 0) filePath = paths[0]
        } catch (_) {}
      }
    }

    // Check for external OS file drop
    if (!filePath && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      filePath = (e.dataTransfer.files[0] as any).path || ''
    }

    // Check text/plain (could be file path or highlighted quote)
    if (!filePath) {
      const text = e.dataTransfer.getData('text/plain')
      if (text && (text.includes(':\\') || text.startsWith('/'))) {
        filePath = text.trim()
      } else if (text && text.trim()) {
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

    if (filePath && window.electron?.sendFileToAI) {
      const fileName = filePath.split(/[\\/]/).pop() || 'file'
      onNotify?.(`🤖 Sending ${fileName} to ${currentSource.name}...`)
      try {
        const res = await window.electron.sendFileToAI(filePath)
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
      />
      <div
        className={`chat-drop-bar ${isDragOver ? 'active' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }}
        onDrop={handleDrop}
        title={`Drop a file or text here to send directly to ${currentSource.name}`}
      >
        <UploadCloud size={13} className="text-emerald" />
        <span>Drop file or text snippet here to send to {currentSource.name}</span>
      </div>
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

