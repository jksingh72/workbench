import React from 'react'
import { BookOpen } from 'lucide-react'
import { PaneToolbar } from '../PaneToolbar'
import { LocalExplorer } from '../LocalExplorer'
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
  onNotify?: (msg: string) => void
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
  onNotify,
}) => {
  const currentSource = bookSources.find((s) => s.id === activeBookSourceId) || {
    id: 'oreilly',
    name: "O'Reilly Learning",
    url: '',
  }
  const isLocalFolder =
    currentSource.isLocal ||
    currentSource.id === 'local-books' ||
    (!!currentSource.url && !currentSource.url.startsWith('http://') && !currentSource.url.startsWith('https://'))

  const localBookSource = bookSources.find((s) => s.id === 'local-books' || s.isLocal)
  const localRootPath = isLocalFolder
    ? (currentSource.url && !currentSource.url.startsWith('http') ? currentSource.url : undefined)
    : (localBookSource?.url && !localBookSource.url.startsWith('http') ? localBookSource.url : undefined)

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

      {/* 1. Local Explorer for Books/PDFs - kept mounted so folder, tabs, reader & scroll are 100% preserved */}
      <div
        className="local-explorer-wrapper"
        style={{
          display: isLocalFolder ? 'flex' : 'none',
          flex: 1,
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden',
        }}
      >
        <LocalExplorer
          target="book"
          storageKey="workbench_book_explorer_state"
          rootPath={localRootPath}
          onNotify={onNotify || (() => {})}
          zoomFactor={navState.zoomFactor}
        />
      </div>

      {/* 2. Web Book View Anchor (O'Reilly, Kindle, etc.) */}
      <div
        className="native-view-anchor"
        ref={anchorRef}
        style={{
          display: isLocalFolder ? 'none' : 'block',
        }}
      >
        <div className="pane-ghost-placeholder">
          <BookOpen size={36} className="ghost-icon text-red" />
          <span className="ghost-title">Bookview</span>
          <span className="ghost-subtitle">{currentSource.name}</span>
        </div>
      </div>
    </div>
  )
}
