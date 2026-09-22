import React, { useState, useEffect } from 'react'
import {
  KeyRound,
  Trash2,
  CheckCircle2,
  X,
  Lock,
  RefreshCw,
  AlertCircle,
  BookMarked
} from 'lucide-react'
import { SessionSettings } from '../types/electron'

interface SessionModalProps {
  isOpen: boolean
  target: 'book' | 'ai' | 'note'
  onClose: () => void
  onNotify: (msg: string) => void
  onCleared?: (target: 'book' | 'ai' | 'note') => void
}

export const SessionModal: React.FC<SessionModalProps> = ({
  isOpen,
  target,
  onClose,
  onNotify,
  onCleared,
}) => {
  const isBook = target === 'book'
  const isAI = target === 'ai'
  const isNote = target === 'note'
  const title = isBook ? "O'Reilly Learning" : isAI ? 'ChatGPT' : 'OneNote Notebook'

  const [settings, setSettings] = useState<SessionSettings>({
    storeBookCredentials: true,
    storeAICredentials: true,
    storeNoteCredentials: true,
  })
  const [isClearing, setIsClearing] = useState(false)
  const [clearedSuccess, setClearedSuccess] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  // Load current settings when modal opens
  useEffect(() => {
    if (isOpen && window.electron?.getSessionSettings) {
      window.electron.getSessionSettings().then((s) => {
        if (s) setSettings(s)
      })
      setClearedSuccess(false)
      setConfirmClear(false)
    }
  }, [isOpen, target])

  if (!isOpen) return null

  const isStoreEnabled = isBook
    ? settings.storeBookCredentials
    : isAI
    ? settings.storeAICredentials
    : settings.storeNoteCredentials

  const handleToggleStore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVal = e.target.checked
    const key = isBook
      ? 'storeBookCredentials'
      : isAI
      ? 'storeAICredentials'
      : 'storeNoteCredentials'

    const newSettings = { ...settings, [key]: nextVal }
    setSettings(newSettings)

    if (window.electron?.updateSessionSettings) {
      await window.electron.updateSessionSettings({ [key]: nextVal })
      onNotify(
        isNote
          ? nextVal
            ? `🔐 OneNote: Will store notebook pages and sections across restarts`
            : `🛡️ OneNote: Will NOT persist notes (starts fresh each restart)`
          : nextVal
          ? `🔐 ${title}: Will store login credentials for future sessions`
          : `🛡️ ${title}: Will NOT store login credentials (starts fresh each restart)`
      )
    }
  }

  const handleClear = async () => {
    setIsClearing(true)
    try {
      if (window.electron?.clearSession) {
        const res = await window.electron.clearSession(target)
        if (res.success) {
          setClearedSuccess(true)
          setConfirmClear(false)
          onNotify(
            isNote
              ? '🗑️ Cleared saved notes and local data for OneNote! Fresh notebook loaded.'
              : `🗑️ Cleared stored login credentials for ${title}! Fresh login loaded.`
          )
          onCleared?.(target)
        } else {
          onNotify(`⚠️ Failed to clear session: ${res.error}`)
        }
      }
    } catch (err: any) {
      onNotify(`⚠️ Error clearing session: ${err.message}`)
    } finally {
      setIsClearing(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title-group">
            <div
              className={`modal-icon-badge ${
                isBook ? 'badge-oreilly' : isAI ? 'badge-chatgpt' : 'badge-onenote'
              }`}
            >
              {isNote ? <BookMarked size={18} /> : <KeyRound size={18} />}
            </div>
            <div>
              <h3 className="modal-title">
                Delete {title} {isNote ? 'Data' : 'Login'}
              </h3>
              <p className="modal-subtitle">
                {isNote
                  ? 'Delete saved notebook pages, local notes, and session state'
                  : 'Delete saved User ID & password, or manage session storage'}
              </p>
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
                <span className="status-title">
                  {isNote ? 'OneNote Storage Status' : 'Stored Login Status'}
                </span>
              </div>
              <span
                className={`status-pill-badge ${clearedSuccess ? 'pill-cleared' : 'pill-active'}`}
              >
                {clearedSuccess ? 'Cleared / Fresh' : isNote ? 'Saved Notes Active' : 'Older Login Saved'}
              </span>
            </div>
            <p className="status-explanation">
              {clearedSuccess
                ? isNote
                  ? 'OneNote saved notes and local session data have been removed. Fresh notebook template loaded.'
                  : 'Older login credentials have been removed. This pane is now on a fresh login page.'
                : isNote
                ? 'Your notes and section state are currently saved locally. You can clear them below to start fresh.'
                : 'Older credentials or cookies are currently saved. You can clear them below to log in with a different account or start fresh.'}
            </p>
          </div>

          {/* Setting 1: Clear Login Button */}
          <div className="session-action-section">
            <h4 className="section-heading">
              <Trash2 size={14} className="heading-icon text-amber" />
              {isNote ? 'Delete Saved Notes & Session Data' : 'Delete Saved User ID & Password'}
            </h4>
            <p className="section-description">
              {isNote
                ? 'Permanently deletes all saved notebook sections, pages, and cached session data for OneNote. Restores the clean default notebook template.'
                : `Permanently deletes your saved User ID, email, password, cookies, and session data for ${title}. The login page will reload completely blank.`}
            </p>

            {!confirmClear ? (
              <button
                className="btn-danger-outline"
                onClick={() => setConfirmClear(true)}
                disabled={isClearing}
              >
                <Trash2 size={14} />
                <span>
                  {isNote ? 'Delete Saved Notes & Session Data' : 'Delete Saved User ID & Password'}
                </span>
              </button>
            ) : (
              <div className="confirm-box">
                <div className="confirm-message">
                  <AlertCircle size={16} className="text-amber" />
                  <span>
                    {isNote
                      ? 'Are you sure? This will erase all saved notebook pages and sections for OneNote.'
                      : `Are you sure? This will erase your saved User ID, password, and cookies for ${title}.`}
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
                        <span>
                          {isNote ? 'Yes, Delete All Notes & State' : 'Yes, Delete User ID & Password'}
                        </span>
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
                <span>
                  {isNote
                    ? 'OneNote saved data deleted! Fresh notebook loaded.'
                    : 'User ID and password deleted! Login page reloaded blank.'}
                </span>
              </div>
            )}
          </div>

          {/* Setting 2: Store Future Credentials / Notes Toggle */}
          <div className="session-toggle-section">
            <div className="toggle-header-row">
              <div className="toggle-info">
                <div className="toggle-title">
                  <Lock size={14} className="heading-icon text-blue" />
                  <span>{isNote ? 'Store Notes Across Restarts' : 'Store Future Login Credentials'}</span>
                </div>
                <p className="toggle-description">
                  {isNote
                    ? isStoreEnabled
                      ? 'Enabled: All notes you write will be saved locally across app restarts.'
                      : 'Disabled: Notes will NOT be saved permanently. The notebook will start fresh every time.'
                    : isStoreEnabled
                    ? 'Enabled: Any new login you enter will be saved across app restarts.'
                    : 'Disabled: Logins will NOT be stored permanently. This pane will start fresh every time.'}
                </p>
              </div>

              <label
                className="switch-toggle"
                title={isNote ? 'Toggle note storage persistence' : 'Toggle login credential storage'}
              >
                <input
                  type="checkbox"
                  checked={isStoreEnabled}
                  onChange={handleToggleStore}
                />
                <span className="slider-round" />
              </label>
            </div>
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
