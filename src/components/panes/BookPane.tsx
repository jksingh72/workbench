import React from 'react'
import { PaneToolbar } from '../PaneToolbar'
import { BookDeleteLoginModal } from '../BookDeleteLoginModal'
import { BookSourceModal } from '../BookSourceModal'
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
  isDeleteLoginOpen: boolean
  onOpenDeleteLogin: () => void
  onCloseDeleteLogin: () => void
  onNotify: (msg: string) => void
  isSourceModalOpen: boolean
  onCloseSourceModal: () => void
  onSaveSources: (sources: BookSource[], newActiveId?: string) => Promise<void>
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
  isDeleteLoginOpen,
  onOpenDeleteLogin,
  onCloseDeleteLogin,
  onNotify,
  isSourceModalOpen,
  onCloseSourceModal,
  onSaveSources,
}) => {
  const activeBookSource =
    bookSources.find((s) => s.id === activeBookSourceId) ||
    bookSources[0] || { id: 'oreilly', name: "O'Reilly Learning", url: 'https://www.oreilly.com/member/login/' }

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
      <div className="native-view-anchor" ref={anchorRef} />

      {/* Pane-Scoped Delete Login Modal */}
      {isDeleteLoginOpen && (
        <BookDeleteLoginModal
          isOpen={isDeleteLoginOpen}
          activeSource={activeBookSource}
          sources={bookSources}
          onClose={onCloseDeleteLogin}
          onNotify={onNotify}
        />
      )}

      {/* Pane-Scoped Configure Book Sites Modal */}
      {isSourceModalOpen && (
        <BookSourceModal
          isOpen={isSourceModalOpen}
          sources={bookSources}
          activeSourceId={activeBookSourceId}
          onClose={onCloseSourceModal}
          onSelectSource={onSelectBookSource}
          onSaveSources={onSaveSources}
          onNotify={onNotify}
        />
      )}
    </div>
  )
}
