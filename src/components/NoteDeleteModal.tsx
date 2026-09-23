import React, { useState, useEffect } from 'react'
import { Trash2, X, RefreshCw, AlertCircle, BookMarked, Layers, ChevronDown } from 'lucide-react'
import { NoteSource } from '../types/electron'

interface NoteDeleteModalProps {
  isOpen: boolean
  activeSource: NoteSource
  sources: NoteSource[]
  onClose: () => void
  onNotify: (msg: string) => void
  onCleared?: () => void
}

export const NoteDeleteModal: React.FC<NoteDeleteModalProps> = ({
  isOpen,
  activeSource,
  sources,
  onClose,
  onNotify,
  onCleared,
}) => {
  const [selectedSourceId, setSelectedSourceId] = useState<string>(activeSource.id)
  const [isClearing, setIsClearing] = useState(false)
  const [clearedSuccessMsg, setClearedSuccessMsg] = useState<string | null>(null)
  const [confirmScope, setConfirmScope] = useState<'selected' | 'all' | null>(null)

  // Sync selected source when modal opens or activeSource changes
  useEffect(() => {
    if (isOpen) {
      setSelectedSourceId(activeSource.id)
      setClearedSuccessMsg(null)
      setConfirmScope(null)
    }
  }, [isOpen, activeSource.id])

  // Listen for Escape key to close modal
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const targetSource = sources.find((s) => s.id === selectedSourceId) || activeSource
  const isLocal = targetSource.id === 'local'

  const handleClear = async (scope: 'selected' | 'all') => {
    setIsClearing(true)
    try {
      if (window.electron?.clearSession) {
        const clearScope = scope === 'all' ? 'all' : targetSource.id
        const res = await window.electron.clearSession('note', clearScope)
        if (res.success) {
          const msg =
            scope === 'all'
              ? '🗑️ Cleared login credentials for ALL note platforms! Fresh login pages loaded.'
              : isLocal
                ? '🗑️ Cleared saved local notes! Fresh default notebook loaded.'
                : `🗑️ Cleared login credentials for ${targetSource.name} ONLY! Fresh login page loaded.`

          setClearedSuccessMsg(
            scope === 'all'
              ? `Credentials and cookies deleted across ALL ${sources.length} note platforms!`
              : isLocal
                ? 'Local offline notes have been reset to default state.'
                : `Credentials deleted for ${targetSource.name} only! Other note logins are preserved.`
          )
          setConfirmScope(null)
          onNotify(msg)
          onCleared?.()
        } else {
          onNotify(`⚠️ Failed to clear login: ${res.error}`)
        }
      }
    } catch (err: any) {
      onNotify(`⚠️ Error clearing login: ${err.message}`)
    } finally {
      setIsClearing(false)
    }
  }

  return (
    <div className="pane-modal-backdrop" onClick={onClose}>
      <div className="pane-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="modal-icon-badge badge-purple">
              <BookMarked size={18} />
            </div>
            <div>
              <h3 className="modal-title">Delete Login — Note Platform</h3>
              <p className="modal-subtitle">Isolated Storage per Note Platform</p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} title="Close (Esc)">
            <X size={16} />
          </button>
        </div>

        {/* Modal Content */}
        <div className="modal-body">
          {/* Platform Selector Box */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
              Select Note Platform to Manage:
            </label>
            <div style={{ position: 'relative' }}>
              <select
                value={selectedSourceId}
                onChange={(e) => {
                  setSelectedSourceId(e.target.value)
                  setConfirmScope(null)
                  setClearedSuccessMsg(null)
                }}
                disabled={isClearing}
                style={{
                  width: '100%',
                  padding: '9px 32px 9px 12px',
                  backgroundColor: '#0d131f',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '13px',
                  appearance: 'none',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.id === activeSource.id ? '(Active in pane)' : ''} — {s.url}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none',
                  color: 'var(--text-muted)',
                }}
              />
            </div>
          </div>

          {/* Status Box */}
          <div className="session-status-card">
            <div className="status-indicator-row">
              <div className="status-label-group">
                <span className="status-pulse-dot" />
                <span className="status-title">Target: {targetSource.name}</span>
              </div>
              <span className={`status-pill-badge ${clearedSuccessMsg ? 'pill-cleared' : 'pill-active'}`}>
                {clearedSuccessMsg ? 'Cleared / Fresh' : isLocal ? 'Local Storage Active' : 'Isolated Storage Active'}
              </span>
            </div>
            <p className="status-explanation">
              {clearedSuccessMsg
                ? clearedSuccessMsg
                : isLocal
                  ? 'Workbench Local Notes stores your notebooks directly in your local user data directory. Clearing will reset your offline notebook.'
                  : `Every note platform (OneNote, Evernote, etc.) has its own independent storage partition. Deleting credentials for ${targetSource.name} will not touch your other note accounts.`}
            </p>
          </div>

          {/* Action Section */}
          <div className="session-action-section">
            <h4 className="section-heading">
              <Trash2 size={14} className="heading-icon text-amber" />
              {isLocal ? 'Reset Local Notebook Data' : 'Delete Saved Credentials & Cookies'}
            </h4>

            {confirmScope === null ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <p className="section-description">
                  {isLocal
                    ? 'Choose whether to reset your offline notebook or clear all note accounts:'
                    : `Choose whether to delete credentials only for ${targetSource.name} or clear all note platforms at once:`}
                </p>

                {/* Clear Selected Button */}
                <button
                  className="btn-danger-outline"
                  onClick={() => setConfirmScope('selected')}
                  disabled={isClearing}
                >
                  <Trash2 size={13} />
                  <span>
                    {isLocal ? 'Reset Local Notebook' : `Delete Credentials for ${targetSource.name} only`}
                  </span>
                </button>

                {/* Clear ALL Platforms Button */}
                {sources.length > 1 && (
                  <button
                    className="btn-secondary"
                    onClick={() => setConfirmScope('all')}
                    disabled={isClearing}
                    style={{ justifyContent: 'center', gap: '6px' }}
                  >
                    <Layers size={13} />
                    <span>Clear All Note Platforms ({sources.length} sites)</span>
                  </button>
                )}
              </div>
            ) : (
              /* Inline Confirmation Box */
              <div className="confirm-delete-box">
                <div className="confirm-delete-header">
                  <AlertCircle size={15} className="text-amber" />
                  <strong>
                    {confirmScope === 'all'
                      ? 'Confirm: Clear ALL Note Platform Credentials?'
                      : isLocal
                        ? 'Confirm: Reset Local Notebook?'
                        : `Confirm: Delete Login for ${targetSource.name}?`}
                  </strong>
                </div>
                <p className="confirm-delete-text">
                  {confirmScope === 'all'
                    ? `This will log you out of all ${sources.length} note platforms and reset local notes. This action cannot be undone.`
                    : isLocal
                      ? 'This will clear all saved local notes and sections and reload a fresh default notebook.'
                      : `You will be logged out of ${targetSource.name}. Other note platforms will stay logged in.`}
                </p>
                <div className="confirm-delete-actions">
                  <button
                    className="btn-secondary"
                    onClick={() => setConfirmScope(null)}
                    disabled={isClearing}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn-danger-solid"
                    onClick={() => handleClear(confirmScope)}
                    disabled={isClearing}
                  >
                    {isClearing ? (
                      <>
                        <RefreshCw size={13} className="spin" />
                        <span>Clearing...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 size={13} />
                        <span>Yes, Delete Now</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="modal-footer">
          <button className="btn-primary-done" onClick={onClose} disabled={isClearing}>
            {clearedSuccessMsg ? 'Done' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  )
}
