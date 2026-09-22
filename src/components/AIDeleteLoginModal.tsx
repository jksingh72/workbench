import React, { useState } from 'react'
import { KeyRound, Trash2, CheckCircle2, X, RefreshCw, AlertCircle, Bot, Sparkles } from 'lucide-react'
import { AISource } from '../types/electron'

interface AIDeleteLoginModalProps {
  isOpen: boolean
  activeSource: AISource
  onClose: () => void
  onNotify: (msg: string) => void
  onCleared?: () => void
}

export const AIDeleteLoginModal: React.FC<AIDeleteLoginModalProps> = ({
  isOpen,
  activeSource,
  onClose,
  onNotify,
  onCleared,
}) => {
  const [isClearing, setIsClearing] = useState(false)
  const [clearedSuccess, setClearedSuccess] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  if (!isOpen) return null

  const handleClear = async () => {
    setIsClearing(true)
    try {
      if (window.electron?.clearSession) {
        const res = await window.electron.clearSession('ai')
        if (res.success) {
          setClearedSuccess(true)
          setConfirmClear(false)
          onNotify(`🗑️ Cleared login credentials for ${activeSource.name}! Fresh login page loaded.`)
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

  // Pick badge styling according to source
  const badgeClass =
    activeSource.id === 'gemini'
      ? 'badge-gemini'
      : activeSource.id === 'claude'
      ? 'badge-claude'
      : activeSource.id === 'perplexity'
      ? 'badge-perplexity'
      : 'badge-chatgpt'

  return (
    <div className="pane-modal-backdrop" onClick={onClose}>
      <div className="pane-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title-group">
            <div className={`modal-icon-badge ${badgeClass}`}>
              {activeSource.id === 'gemini' ? <Sparkles size={18} /> : <Bot size={18} />}
            </div>
            <div>
              <h3 className="modal-title">Delete Login — {activeSource.name}</h3>
              <p className="modal-subtitle">AI Platform: {activeSource.url}</p>
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
                <span className="status-title">ChatView Session Status</span>
              </div>
              <span className={`status-pill-badge ${clearedSuccess ? 'pill-cleared' : 'pill-active'}`}>
                {clearedSuccess ? 'Cleared / Fresh' : 'Active Session'}
              </span>
            </div>
            <p className="status-explanation">
              {clearedSuccess
                ? `Saved credentials for ${activeSource.name} have been erased. A clean login page has been reloaded.`
                : `Cookies, passwords, and authorization tokens for ${activeSource.name} are currently stored in this pane. You can delete them below to sign in with a different account or switch accounts.`}
            </p>
          </div>

          {/* Action Section */}
          <div className="session-action-section">
            <h4 className="section-heading">
              <Trash2 size={14} className="heading-icon text-amber" />
              Delete Saved Credentials & Cookies
            </h4>
            <p className="section-description">
              Permanently clears your saved email, password, authentication cookies, and cached tokens for{' '}
              <strong>{activeSource.name}</strong>. The page will reload completely fresh.
            </p>

            {!confirmClear ? (
              <button
                className="btn-danger-outline"
                onClick={() => setConfirmClear(true)}
                disabled={isClearing}
              >
                <KeyRound size={14} />
                <span>Delete {activeSource.name} Login</span>
              </button>
            ) : (
              <div className="confirm-box">
                <div className="confirm-message">
                  <AlertCircle size={16} className="text-amber" />
                  <span>
                    Are you sure? This will delete your saved login for <strong>{activeSource.name}</strong> and log you out.
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
                        <span>Yes, Delete {activeSource.name} Login</span>
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
                <span>Credentials deleted! Clean login page loaded.</span>
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
