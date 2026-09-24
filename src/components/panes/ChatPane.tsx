import React from 'react'
import { PaneToolbar } from '../PaneToolbar'
import { AIDeleteLoginModal } from '../AIDeleteLoginModal'
import { AISourceModal } from '../AISourceModal'
import { NavState, AISource } from '../../types/electron'

export interface ChatPaneProps {
  style?: React.CSSProperties
  anchorRef: React.RefObject<HTMLDivElement | null>
  navState: NavState
  onNavAction: (cmd: 'back' | 'forward' | 'reload' | 'home' | 'zoom-in' | 'zoom-out' | 'zoom-reset') => void
  aiSources: AISource[]
  activeAISourceId: string
  onOpenAISourceModal: () => void
  isDeleteLoginOpen: boolean
  onOpenDeleteLogin: () => void
  onCloseDeleteLogin: () => void
  onNotify: (msg: string) => void
  isSourceModalOpen: boolean
  onCloseSourceModal: () => void
  onSelectAISource: (id: string) => void
  onSaveSources: (sources: AISource[], newActiveId?: string) => Promise<void>
}

export const ChatPane: React.FC<ChatPaneProps> = ({
  style,
  anchorRef,
  navState,
  onNavAction,
  aiSources,
  activeAISourceId,
  onOpenAISourceModal,
  isDeleteLoginOpen,
  onOpenDeleteLogin,
  onCloseDeleteLogin,
  onNotify,
  isSourceModalOpen,
  onCloseSourceModal,
  onSelectAISource,
  onSaveSources,
}) => {
  const activeAISource =
    aiSources.find((s) => s.id === activeAISourceId) ||
    aiSources[0] || { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/' }

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
      <div className="native-view-anchor" ref={anchorRef} />

      {/* Pane-Scoped Delete Login Modal */}
      {isDeleteLoginOpen && (
        <AIDeleteLoginModal
          isOpen={isDeleteLoginOpen}
          activeSource={activeAISource}
          sources={aiSources}
          onClose={onCloseDeleteLogin}
          onNotify={onNotify}
        />
      )}

      {/* Pane-Scoped Configure AI Platforms Modal */}
      {isSourceModalOpen && (
        <AISourceModal
          isOpen={isSourceModalOpen}
          sources={aiSources}
          activeSourceId={activeAISourceId}
          onClose={onCloseSourceModal}
          onSelectSource={onSelectAISource}
          onSaveSources={onSaveSources}
          onNotify={onNotify}
        />
      )}
    </div>
  )
}
