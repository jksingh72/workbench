import React, { useState, useEffect } from 'react'
import { Trash2, CheckCircle2, X, RefreshCw, AlertCircle, BookMarked } from 'lucide-react'

interface NoteDeleteModalProps {
  isOpen: boolean
  onClose: () => void
  onNotify: (msg: string) => void
  onCleared?: () => void
}

export const NoteDeleteModal: React.FC<NoteDeleteModalProps> = ({
  isOpen,
  onClose,
  onNotify,
  onCleared,
}) => {
  const [isClearing, setIsClearing] = useState(false)
  const [clearedSuccess, setClearedSuccess] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

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

  const handleClear = async () => {
    setIsClearing(true)
    try {
      if (window.electron?.clearSession) {
        const res = await window.electron.clearSession('note')
        if (res.success) {
          setClearedSuccess(true)
          setConfirmClear(false)
          onNotify('🗑️ Cleared saved notes and local data for OneNote! Fresh notebook loaded.')
          onCleared?.()
        } else {
          onNotify(`⚠️ Failed to clear note data: ${res.error}`)
        }
      }
    } catch (err: any) {
      onNotify(`⚠️ Error clearing note data: ${err.message}`)
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
            <div className="modal-icon-badge badge-onenote">
              <BookMarked size={18} />
            </div>
            <div>
              <h3 className="modal-title">Delete Notes & Notebook State</h3>
              <p className="modal-subtitle">OneNote Local Storage</p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </div>

        {/* Modal Content */}
        <div className="modal-body">
          {/* Status Box */}
          <div className="session-status-card">
            <div className="status-indicator-row">
              <div className="status-label-group">
                <span className="status-pulse-dot" />
                <span className="status-title">OneNote Storage Status</span>
              </div>
              <span className={`status-pill-badge ${clearedSuccess ? 'pill-cleared' : 'pill-active'}`}>
                {clearedSuccess ? 'Reset / Fresh' : 'Saved Notes Active'}
              </span>
            </div>
            <p className="status-explanation">
              {clearedSuccess
                ? 'OneNote saved notes and local session data have been removed. Fresh notebook template loaded.'
                : 'Your notes and section state are currently saved locally. You can clear them below to start fresh.'}
            </p>
          </div>

          {/* Action Section */}
          <div className="session-action-section">
            <h4 className="section-heading">
              <Trash2 size={14} className="heading-icon text-amber" />
              Delete Saved Notes & Notebook State
            </h4>
            <p className="section-description">
              Permanently deletes all saved notebook sections, pages, and local session data for OneNote. Restores the clean default notebook template.
            </p>

            {!confirmClear ? (
              <button
                className="btn-danger-outline"
                onClick={() => setConfirmClear(true)}
                disabled={isClearing}
              >
                <Trash2 size={14} />
                <span>Delete Saved Notes & Session Data</span>
              </button>
            ) : (
              <div className="confirm-box">
                <div className="confirm-message">
                  <AlertCircle size={16} className="text-amber" />
                  <span>
                    Are you sure? This will erase all saved notebook pages and sections for OneNote.
                  </span>
                </div>
                <div className="confirm-buttons">
                  <button
                    className="btn-danger-solid"
                    onClick={handleClear}
                    disabled={isClearing}
                  >
                    {isClearing ? (
                      <>
                        <RefreshCw size={13} className="spin" />
                        <span>Deleting...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={13} />
                        <span>Yes, Delete All Notes & State</span>
                      </>
                    )}
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => setConfirmClear(false)}
                    disabled={isClearing}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {clearedSuccess && (
              <div className="success-banner">
                <CheckCircle2 size={15} />
                <span>OneNote saved data deleted! Fresh notebook loaded.</span>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="modal-footer">
          <button className="btn-primary-done" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
