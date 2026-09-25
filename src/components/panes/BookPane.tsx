import React from 'react'
import { BookOpen } from 'lucide-react'
import { PaneToolbar } from '../PaneToolbar'
import { NavState, BookSource } from '../../types/electron'

export interface BookPaneProps {
  style?: React.CSSProperties
  anchorRef: React.RefObject<HTMLDivElement | null>
  navState: NavState
  onNavAction: (cmd: 'back' | 'forward' | 'reload' | 'home' | 'zoom-in' | 'zoom-out' | 'zoom-reset') => void
  onAskAI: (templateKey: 'explain' | 'summarize' | 'code' | 'quiz' | 'raw' | 'custom', customPrompt?: string) => void
  onShowNativeMenu: () => void
  onClipToNote: () => void
  bookSources: BookSource[]
  activeBookSourceId: string
  onSelectBookSource: (id: string) => void
  onOpenBookSourceModal: () => void
  isAskingAI: boolean
  onOpenDeleteLogin: () => void
}


export const BookPane: React.FC<BookPaneProps> = ({
  style,
  anchorRef,
  navState,
  onNavAction,
  onAskAI,
  onShowNativeMenu,
  onClipToNote,
  bookSources,
  activeBookSourceId,
  onSelectBookSource,
  onOpenBookSourceModal,
  isAskingAI,
  onOpenDeleteLogin,
}) => {
  const currentSource = bookSources.find((s) => s.id === activeBookSourceId) || { name: "O'Reilly Learning" }

  return (
    <div className="pane-wrapper book-pane" style={style}>
      <PaneToolbar
        target="book"
        navState={navState}
        onNavAction={onNavAction}
        onAskAI={onAskAI}
        onShowNativeMenu={onShowNativeMenu}
        onOpenSessionModal={onOpenDeleteLogin}
        onClipToNote={onClipToNote}
        bookSources={bookSources}
        activeBookSourceId={activeBookSourceId}
        onSelectBookSource={onSelectBookSource}
        onOpenBookSourceModal={onOpenBookSourceModal}
        isAskingAI={isAskingAI}
      />
      <div className="native-view-anchor" ref={anchorRef}>
        <div className="pane-ghost-placeholder">
          <BookOpen size={36} className="ghost-icon text-red" />
          <span className="ghost-title">Bookview</span>
          <span className="ghost-subtitle">{currentSource.name}</span>
        </div>
      </div>
    </div>
  )
}

