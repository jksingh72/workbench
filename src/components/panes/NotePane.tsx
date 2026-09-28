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
  onSendNoteToAI?: () => void
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
  onSendNoteToAI,
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
        onSendNoteToAI={onSendNoteToAI}
        noteSources={noteSources}
        activeNoteSourceId={activeNoteSourceId}
        onOpenNoteSourceModal={onOpenNoteSourceModal}
      />

      {/* 1. Local Explorer - kept mounted so folder, tabs, cursor & scroll are 100% preserved */}
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
          rootPath={currentSource.url}
          clippedText={isLocalFolder ? clippedText : null}
          onClearClippedText={onClearClippedText}
          onNotify={onNotify}
          zoomFactor={navState.zoomFactor}
        />
      </div>

      {/* 2. Built-in Local Notes App */}
      <div
        className="onenote-app-wrapper"
        style={{
          display: activeNoteSourceId === 'local' ? 'flex' : 'none',
          flex: 1,
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden',
        }}
      >
        <OneNoteApp
          onNotify={onNotify}
          clippedText={activeNoteSourceId === 'local' ? clippedText : null}
          onClearClippedText={onClearClippedText}
          onOpenSessionModal={onOpenDeleteData}
          resetTrigger={noteResetTrigger}
        />
      </div>

      {/* 3. Native WebContentsView Anchor for Web-based Note Sites */}
      <div
        className="native-view-anchor"
        ref={anchorRef}
        style={{
          display: !isLocalFolder && activeNoteSourceId !== 'local' ? 'block' : 'none',
          flex: 1,
          height: '100%',
          position: 'relative',
        }}
      >
        <div className="pane-ghost-placeholder">
          <BookMarked size={36} className="ghost-icon text-purple" />
          <span className="ghost-title">Noteview</span>
          <span className="ghost-subtitle">{currentSource.name}</span>
        </div>
      </div>
    </div>
  )
}

