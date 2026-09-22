import React, { useState, useEffect } from 'react'
import { KeyRound, Trash2, CheckCircle2, X, RefreshCw, AlertCircle, Bot, Sparkles, Layers, ChevronDown } from 'lucide-react'
import { AISource } from '../types/electron'

interface AIDeleteLoginModalProps {
  isOpen: boolean
  activeSource: AISource
  sources: AISource[]
  onClose: () => void
  onNotify: (msg: string) => void
  onCleared?: () => void
}

export const AIDeleteLoginModal: React.FC<AIDeleteLoginModalProps> = ({
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

  const handleClear = async (scope: 'selected' | 'all') => {
    setIsClearing(true)
    try {
      if (window.electron?.clearSession) {
        const clearScope = scope === 'all' ? 'all' : targetSource.id
        const res = await window.electron.clearSession('ai', clearScope)
        if (res.success) {
          const msg =
            scope === 'all'
              ? '🗑️ Cleared login credentials for ALL AI platforms! Fresh login pages loaded.'
              : `🗑️ Cleared login credentials for ${targetSource.name} ONLY! Fresh login page loaded.`
          setClearedSuccessMsg(
            scope === 'all'
              ? `Credentials and cookies deleted across ALL ${sources.length} AI platforms!`
              : `Credentials deleted for ${targetSource.name} only! Other AI logins are preserved.`
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

  // Pick badge styling according to targetSource
  const badgeClass =
    targetSource.id === 'gemini'
      ? 'badge-gemini'
      : targetSource.id === 'claude'
      ? 'badge-claude'
      : targetSource.id === 'perplexity'
      ? 'badge-perplexity'
      : 'badge-chatgpt'

  return (
    <div className="pane-modal-backdrop" onClick={onClose}>
      <div className="pane-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title-group">
            <div className={`modal-icon-badge ${badgeClass}`}>
              {targetSource.id === 'gemini' ? <Sparkles size={18} /> : <Bot size={18} />}
            </div>
            <div>
              <h3 className="modal-title">Delete Login — AI Platform</h3>
              <p className="modal-subtitle">Isolated Storage per AI Engine</p>
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
              Select AI Engine to Manage:
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
                {clearedSuccessMsg ? 'Cleared / Fresh' : 'Isolated Storage Active'}
              </span>
            </div>
            <p className="status-explanation">
              {clearedSuccessMsg
                ? clearedSuccessMsg
                : `Every AI engine (including custom ones you create) has its own independent storage partition. Deleting credentials for ${targetSource.name} will not touch your other AI accounts.`}
            </p>
          </div>

          {/* Action Section */}
          <div className="session-action-section">
            <h4 className="section-heading">
              <Trash2 size={14} className="heading-icon text-amber" />
              Delete Saved Credentials & Cookies
            </h4>

            {confirmScope === null ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <p className="section-description">
                  Choose whether to delete credentials <strong>only for {targetSource.name}</strong> or clear all {sources.length} AI engines at once:
                </p>

                {/* Option 1: Delete only selected AI */}
                <button
                  className="btn-danger-outline"
                  onClick={() => setConfirmScope('selected')}
                  disabled={isClearing}
                >
                  <KeyRound size={14} />
                  <span>Delete {targetSource.name} Login Only</span>
                </button>

                {/* Option 2: Delete all AI */}
                <button
                  className="btn-danger-outline"
                  onClick={() => setConfirmScope('all')}
                  disabled={isClearing}
                  style={{ borderColor: 'rgba(239, 68, 68, 0.4)', color: '#fca5a5' }}
                >
                  <Layers size={14} />
                  <span>Delete ALL AI Logins ({sources.map((s) => s.name).join(', ')})</span>
                </button>
              </div>
            ) : (
              <div className="confirm-box">
                <div className="confirm-message">
                  <AlertCircle size={16} className="text-amber" />
                  <span>
                    {confirmScope === 'all' ? (
                      <>
                        Are you sure? This will delete saved logins and cookies across <strong>ALL {sources.length} AI platforms</strong> ({sources.map((s) => s.name).join(', ')}).
                      </>
                    ) : (
                      <>
                        Are you sure? This will delete saved login <strong>only for {targetSource.name}</strong>. Your other AI logins remain saved.
                      </>
                    )}
                  </span>
                </div>
                <div className="confirm-buttons">
                  <button
                    className="btn-danger-solid"
                    onClick={() => handleClear(confirmScope)}
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
                        <span>
                          {confirmScope === 'all'
                            ? 'Yes, Delete ALL AI Logins'
                            : `Yes, Delete ${targetSource.name} Login`}
                        </span>
                      </>
                    )}
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => setConfirmScope(null)}
                    disabled={isClearing}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {clearedSuccessMsg && (
              <div className="success-banner" style={{ marginTop: '12px' }}>
                <CheckCircle2 size={15} />
                <span>{clearedSuccessMsg}</span>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="modal-footer">
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Press Esc to close</span>
          <button className="btn-primary-done" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
