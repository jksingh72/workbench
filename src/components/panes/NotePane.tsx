import React from 'react'
import { BookMarked } from 'lucide-react'
import { PaneToolbar } from '../PaneToolbar'
import { OneNoteApp } from '../OneNoteApp'
import { LocalExplorer } from '../LocalExplorer'
import { NavState, NoteSource } from '../../types/electron'

export interface NotePaneProps {
  style?: React.CSSProperties
  anchorRef: React.RefObject<HTMLDivElement | null>
  navState: NavState
  onNavAction: (cmd: 'back' | 'forward' | 'reload' | 'home' | 'zoom-in' | 'zoom-out' | 'zoom-reset') => void
  noteSources: NoteSource[]
  activeNoteSourceId: string
  onOpenNoteSourceModal: () => void
  clippedText: string | null
  onClearClippedText: () => void
  noteResetTrigger: number
  onNoteReset: () => void
  onOpenDeleteData: () => void
  onNotify: (msg: string) => void
}

export const NotePane: React.FC<NotePaneProps> = ({
  style,
  anchorRef,
  navState,
  onNavAction,
  noteSources,
  activeNoteSourceId,
  onOpenNoteSourceModal,
  clippedText,
  onClearClippedText,
  noteResetTrigger,
  onOpenDeleteData,
  onNotify,
}) => {
  const currentSource: NoteSource = noteSources.find((s) => s.id === activeNoteSourceId) || {
    id: 'onenote',
    name: 'Microsoft OneNote',
    url: '',
    isLocal: false,
  }
  const isLocalFolder =
    currentSource.isLocal ||
    currentSource.id === 'local-explorer' ||
    (!!currentSource.url && !currentSource.url.startsWith('http://') && !currentSource.url.startsWith('https://'))

  return (
    <div className="pane-wrapper onenote-pane" style={style}>
      <PaneToolbar
        target="note"
        navState={navState}
        onNavAction={onNavAction}
        onOpenSessionModal={onOpenDeleteData}
        noteSources={noteSources}
        activeNoteSourceId={activeNoteSourceId}
        onOpenNoteSourceModal={onOpenNoteSourceModal}
      />

      {isLocalFolder ? (
        <LocalExplorer
          rootPath={currentSource.url}
          clippedText={clippedText}
          onClearClippedText={onClearClippedText}
          onNotify={onNotify}
        />
      ) : activeNoteSourceId === 'local' ? (
        <OneNoteApp
          onNotify={onNotify}
          clippedText={clippedText}
          onClearClippedText={onClearClippedText}
          onOpenSessionModal={onOpenDeleteData}
          resetTrigger={noteResetTrigger}
        />
      ) : (
        <div className="native-view-anchor" ref={anchorRef}>
          <div className="pane-ghost-placeholder">
            <BookMarked size={36} className="ghost-icon text-purple" />
            <span className="ghost-title">Noteview</span>
            <span className="ghost-subtitle">{currentSource.name}</span>
          </div>
        </div>
      )}
    </div>
  )
}

