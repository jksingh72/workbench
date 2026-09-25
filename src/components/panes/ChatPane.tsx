import React from 'react'
import { Bot } from 'lucide-react'
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
}) => {
  const currentSource = aiSources.find((s) => s.id === activeAISourceId) || { name: 'ChatGPT' }

  return (
    <div className="pane-wrapper ai-pane" style={style}>
      <PaneToolbar
        target="ai"
        navState={navState}
        onNavAction={onNavAction}
        onOpenSessionModal={onOpenDeleteLogin}
        aiSources={aiSources}
        activeAISourceId={activeAISourceId}
        onOpenAISourceModal={onOpenAISourceModal}
      />
      <div className="native-view-anchor" ref={anchorRef}>
        <div className="pane-ghost-placeholder">
          <Bot size={36} className="ghost-icon text-emerald" />
          <span className="ghost-title">Chatview</span>
          <span className="ghost-subtitle">{currentSource.name}</span>
        </div>
      </div>
    </div>
  )
}

