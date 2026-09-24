import React from 'react'
import { PaneToolbar } from '../PaneToolbar'
import { OneNoteApp } from '../OneNoteApp'
import { NoteDeleteModal } from '../NoteDeleteModal'
import { NoteSourceModal } from '../NoteSourceModal'
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
  isDeleteDataOpen: boolean
  onOpenDeleteData: () => void
  onCloseDeleteData: () => void
  onNotify: (msg: string) => void
  isSourceModalOpen: boolean
  onCloseSourceModal: () => void
  onSelectNoteSource: (id: string) => void
  onSaveSources: (sources: NoteSource[], newActiveId?: string) => Promise<void>
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
  onNoteReset,
  isDeleteDataOpen,
  onOpenDeleteData,
  onCloseDeleteData,
  onNotify,
  isSourceModalOpen,
  onCloseSourceModal,
  onSelectNoteSource,
  onSaveSources,
}) => {
  const activeNoteSource =
    noteSources.find((s) => s.id === activeNoteSourceId) ||
    noteSources[0] || { id: 'onenote', name: 'Microsoft OneNote', url: 'https://www.onenote.com/notebooks' }

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

      {activeNoteSourceId === 'local' ? (
        <OneNoteApp
          onNotify={onNotify}
          clippedText={clippedText}
          onClearClippedText={onClearClippedText}
          onOpenSessionModal={onOpenDeleteData}
          resetTrigger={noteResetTrigger}
        />
      ) : (
        <div className="native-view-anchor" ref={anchorRef} />
      )}

      {/* Pane-Scoped Delete Login Modal */}
      {isDeleteDataOpen && (
        <NoteDeleteModal
          isOpen={isDeleteDataOpen}
          activeSource={activeNoteSource}
          sources={noteSources}
          onClose={onCloseDeleteData}
          onNotify={onNotify}
          onCleared={onNoteReset}
        />
      )}

      {/* Pane-Scoped Configure Note Sources Modal */}
      {isSourceModalOpen && (
        <NoteSourceModal
          isOpen={isSourceModalOpen}
          sources={noteSources}
          activeSourceId={activeNoteSourceId}
          onClose={onCloseSourceModal}
          onSelectSource={onSelectNoteSource}
          onSaveSources={onSaveSources}
          onNotify={onNotify}
        />
      )}
    </div>
  )
}
