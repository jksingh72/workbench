import React, { useState, useEffect } from 'react'
import {
  BookMarked,
  Plus,
  Trash2,
  CheckCircle2,
  X,
  Globe,
  StickyNote,
  Pencil,
  Check,
  RotateCcw,
  Folder,
  FolderOpen
} from 'lucide-react'
import { NoteSource } from '../types/electron'

interface NoteSourceModalProps {
  isOpen: boolean
  sources: NoteSource[]
  activeSourceId: string
  onClose: () => void
  onSelectSource: (sourceId: string) => void
  onSaveSources: (sources: NoteSource[], newActiveId?: string) => Promise<void>
  onNotify: (msg: string) => void
}

const DEFAULT_PRESET_NOTE_URLS: Record<string, { name: string; url: string }> = {
  onenote: { name: 'Microsoft OneNote', url: 'https://www.onenote.com/notebooks' },
  evernote: { name: 'Evernote', url: 'https://www.evernote.com/client/web' },
  'apple-notes': { name: 'Apple Notes', url: 'https://www.icloud.com/notes' },
  keep: { name: 'Google Keep', url: 'https://keep.google.com/' },
  'local-explorer': { name: 'Local File Explorer', url: '' },
}

export const NoteSourceModal: React.FC<NoteSourceModalProps> = ({
  isOpen,
  sources,
  activeSourceId,
  onClose,
  onSelectSource,
  onSaveSources,
  onNotify,
}) => {
  const [newSourceType, setNewSourceType] = useState<'web' | 'local'>('web')
  const [newName, setNewName] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editUrl, setEditUrl] = useState('')
  const [editIsLocal, setEditIsLocal] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [isSavingEdit, setIsSavingEdit] = useState(false)

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

  const handleStartEdit = (source: NoteSource) => {
    setEditingId(source.id)
    setEditName(source.name)
    setEditUrl(source.url)
    setEditIsLocal(
      !!source.isLocal ||
      source.id === 'local-explorer' ||
      (!source.url.startsWith('http://') && !source.url.startsWith('https://'))
    )
    setEditError(null)
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditName('')
    setEditUrl('')
    setEditIsLocal(false)
    setEditError(null)
  }

  const handleBrowseEditFolder = async () => {
    if (window.electron?.selectFolder) {
      const selected = await window.electron.selectFolder(editUrl || undefined)
      if (selected) {
        setEditUrl(selected)
      }
    }
  }

  const handleBrowseNewFolder = async () => {
    if (window.electron?.selectFolder) {
      const selected = await window.electron.selectFolder(newUrl || undefined)
      if (selected) {
        setNewUrl(selected)
        if (!newName.trim()) {
          const parts = selected.split(/[\/\\]/).filter(Boolean)
          setNewName(parts[parts.length - 1] || 'Local Folder')
        }
      }
    }
  }

  const handleResetToDefault = (sourceId: string) => {
    const preset = DEFAULT_PRESET_NOTE_URLS[sourceId]
    if (preset) {
      setEditName(preset.name)
      setEditUrl(preset.url)
      setEditError(null)
    }
  }

  const handleSaveEdit = async (sourceId: string) => {
    setEditError(null)
    const cleanName = editName.trim()
    let cleanUrl = editUrl.trim()
    const isLocal = editIsLocal || sourceId === 'local-explorer'

    if (!cleanName) {
      setEditError('Name cannot be empty.')
      return
    }

    if (!cleanUrl) {
      setEditError(isLocal ? 'Folder path cannot be empty.' : 'URL cannot be empty.')
      return
    }

    if (!isLocal && !cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl
    }

    setIsSavingEdit(true)
    try {
      const updated = sources.map((s) => {
        if (s.id !== sourceId) return s
        return {
          ...s,
          name: cleanName,
          url: cleanUrl,
          isLocal,
        }
      })

      await onSaveSources(updated)
      setEditingId(null)
      onNotify(`Updated ${cleanName} details!`)
    } catch (err: any) {
      setEditError(err.message || 'Failed to save changes.')
    } finally {
      setIsSavingEdit(false)
    }
  }

  const handleAddSource = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    const cleanName = newName.trim()
    let cleanUrl = newUrl.trim()
    const isLocal = newSourceType === 'local'

    if (!cleanName) {
      setErrorMsg('Please enter a name for the note platform or folder.')
      return
    }

    if (!cleanUrl) {
      setErrorMsg(isLocal ? 'Please select a local folder to explore.' : 'Please enter the website login or workspace URL.')
      return
    }

    if (!isLocal) {
      if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
        cleanUrl = 'https://' + cleanUrl
      }

      try {
        new URL(cleanUrl)
      } catch {
        setErrorMsg('Please enter a valid website URL (e.g. https://www.evernote.com/)')
        return
      }
    }

    const newId = `custom-note-${Date.now()}`
    const newSource: NoteSource = {
      id: newId,
      name: cleanName,
      url: cleanUrl,
      isPreset: false,
      isLocal,
    }

    setIsSubmitting(true)
    try {
      const updated = [...sources, newSource]
      await onSaveSources(updated, newId)
      onSelectSource(newId)
      setNewName('')
      setNewUrl('')
      onNotify(`✨ Added and switched NoteView to "${cleanName}"!`)
      onClose()
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save note platform.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteSource = async (sourceId: string, sourceName: string) => {
    if (!confirm(`Are you sure you want to remove "${sourceName}" from your note platforms?`)) {
      return
    }

    const updated = sources.filter((s) => s.id !== sourceId)
    const newActiveId = activeSourceId === sourceId ? updated[0]?.id || 'onenote' : activeSourceId

    try {
      await onSaveSources(updated, newActiveId)
      if (activeSourceId === sourceId) {
        onSelectSource(newActiveId)
      }
      onNotify(`🗑️ Removed "${sourceName}" from note platforms.`)
    } catch (err: any) {
      onNotify(`⚠️ Error removing platform: ${err.message}`)
    }
  }

  return (
    <div className="pane-modal-backdrop" onClick={onClose}>
      <div className="pane-modal-container note-sources-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="modal-icon-badge badge-purple">
              <BookMarked size={16} />
            </div>
            <div>
              <h3 className="modal-title">Configure Note Platforms</h3>
              <p className="modal-subtitle">
                Switch between OneNote, Evernote, Apple Notes, Google Keep, or add custom note workspaces
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} title="Close (Esc)">
            <X size={15} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body">
          {/* Active / Available Sources List */}
          <div className="sources-list-section">
            <h4 className="section-heading">
              <StickyNote size={14} className="heading-icon text-purple" />
              <span>Available Note Platforms</span>
            </h4>

            <div className="sources-list">
              {sources.map((source) => {
                const isActive = source.id === activeSourceId
                const isEditing = editingId === source.id

                if (isEditing) {
                  return (
                    <div key={source.id} className="source-item editing">
                      <div className="source-edit-form">
                        <div className="edit-field">
                          <label>Platform Name</label>
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="Platform Name"
                            autoFocus
                          />
                        </div>
                        {editIsLocal ? (
                          <div className="edit-field">
                            <label>Folder Path</label>
                            <div className="input-with-action-btn">
                              <input
                                type="text"
                                value={editUrl}
                                onChange={(e) => setEditUrl(e.target.value)}
                                placeholder="D:\Notes"
                              />
                              <button
                                type="button"
                                className="btn-browse-folder"
                                onClick={handleBrowseEditFolder}
                                title="Browse Folder..."
                              >
                                <FolderOpen size={13} />
                                <span>Browse...</span>
                              </button>
                            </div>
                          </div>
                        ) : source.id !== 'local' ? (
                          <div className="edit-field">
                            <label>Website URL</label>
                            <input
                              type="text"
                              value={editUrl}
                              onChange={(e) => setEditUrl(e.target.value)}
                              placeholder="https://..."
                            />
                          </div>
                        ) : null}

                        {editError && <div className="edit-error-text">{editError}</div>}

                        <div className="edit-actions">
                          {source.isPreset && DEFAULT_PRESET_NOTE_URLS[source.id] && (
                            <button
                              type="button"
                              className="btn-reset-preset"
                              onClick={() => handleResetToDefault(source.id)}
                              title="Reset URL and Name to official default"
                            >
                              <RotateCcw size={12} />
                              <span>Reset to Default</span>
                            </button>
                          )}
                          <div className="edit-actions-right">
                            <button
                              type="button"
                              className="btn-cancel-edit"
                              onClick={handleCancelEdit}
                              disabled={isSavingEdit}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="btn-save-edit"
                              onClick={() => handleSaveEdit(source.id)}
                              disabled={isSavingEdit}
                            >
                              <Check size={13} />
                              <span>{isSavingEdit ? 'Saving...' : 'Save'}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                }

                const isItemLocal =
                  source.isLocal ||
                  source.id === 'local-explorer' ||
                  (!source.url.startsWith('http://') && !source.url.startsWith('https://'))

                return (
                  <div
                    key={source.id}
                    className={`source-item ${isActive ? 'active' : ''}`}
                  >
                    <div className="source-info">
                      <div className="source-name-row">
                        {isItemLocal ? (
                          <Folder size={15} className="source-type-icon text-cyan" />
                        ) : (
                          <Globe size={15} className="source-type-icon text-muted" />
                        )}
                        <span className="source-name">{source.name}</span>
                        {source.isPreset && (
                          <span className="source-preset-badge">Built-in</span>
                        )}
                        {isItemLocal && (
                          <span className="source-local-badge">Local</span>
                        )}
                        {isActive && (
                          <span className="source-active-pill">
                            <CheckCircle2 size={11} />
                            <span>Active</span>
                          </span>
                        )}
                      </div>
                      <span className="source-url" title={source.url}>
                        {source.url || '(Local Folder)'}
                      </span>
                    </div>

                    <div className="source-actions">
                      {!isActive ? (
                        <button
                          className="btn-select-source"
                          onClick={() => onSelectSource(source.id)}
                          title={`Switch NoteView to ${source.name}`}
                        >
                          <span>Switch To</span>
                        </button>
                      ) : (
                        <span className="current-source-label">Current</span>
                      )}

                      <button
                        className="btn-edit-source"
                        onClick={() => handleStartEdit(source)}
                        title={`Edit ${source.name} name or URL`}
                      >
                        <Pencil size={13} />
                      </button>

                      {!source.isPreset && (
                        <button
                          className="btn-delete-source"
                          onClick={() => handleDeleteSource(source.id, source.name)}
                          title={`Delete ${source.name}`}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Add New Note Platform / Local Folder Form */}
          <div className="add-source-section">
            <h4 className="section-heading">
              <Plus size={14} className="heading-icon text-purple" />
              <span>Add Note Platform or Local Folder</span>
            </h4>
            <p className="section-description">
              Connect a web-based note taking workspace or explore a local folder on your computer (with Word, Excel, and local notes support).
            </p>

            {/* Type selector toggle */}
            <div className="source-type-toggle">
              <button
                type="button"
                className={`type-tab-btn ${newSourceType === 'web' ? 'active' : ''}`}
                onClick={() => {
                  setNewSourceType('web')
                  setNewUrl('')
                }}
              >
                <Globe size={13} />
                <span>Web Platform (OneNote, Evernote, etc.)</span>
              </button>
              <button
                type="button"
                className={`type-tab-btn ${newSourceType === 'local' ? 'active' : ''}`}
                onClick={() => {
                  setNewSourceType('local')
                  setNewUrl('')
                }}
              >
                <Folder size={13} />
                <span>Local Folder Explorer (Word, Excel, Notes)</span>
              </button>
            </div>

            <form onSubmit={handleAddSource} className="add-source-form">
              <div className="form-row">
                <div className="form-field field-name">
                  <label htmlFor="note-source-name">
                    {newSourceType === 'local' ? 'Folder Display Name' : 'Platform Name'}
                  </label>
                  <input
                    id="note-source-name"
                    type="text"
                    placeholder={newSourceType === 'local' ? 'e.g. My Documents or Work Vault' : 'e.g. Joplin Web'}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>

                <div className="form-field field-url">
                  <label htmlFor="note-source-url">
                    {newSourceType === 'local' ? 'Local Directory Path' : 'Website URL'}
                  </label>
                  <div className="input-with-icon">
                    {newSourceType === 'local' ? (
                      <Folder size={14} className="field-icon text-cyan" />
                    ) : (
                      <Globe size={14} className="field-icon" />
                    )}
                    <input
                      id="note-source-url"
                      type="text"
                      placeholder={newSourceType === 'local' ? 'D:\\MyNotes\\...' : 'e.g. https://app.joplinapp.org/'}
                      value={newUrl}
                      onChange={(e) => setNewUrl(e.target.value)}
                      disabled={isSubmitting}
                    />
                    {newSourceType === 'local' && (
                      <button
                        type="button"
                        className="btn-browse-in-field"
                        onClick={handleBrowseNewFolder}
                        title="Browse for folder"
                      >
                        <FolderOpen size={13} />
                        <span>Browse...</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {errorMsg && (
                <div className="form-error-banner">
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="form-actions-row">
                <button
                  type="submit"
                  className="btn-add-source"
                  disabled={isSubmitting || !newName.trim() || !newUrl.trim()}
                >
                  <Plus size={13} />
                  <span>{isSubmitting ? 'Adding...' : newSourceType === 'local' ? 'Add & Open Folder' : 'Add & Open Platform'}</span>
                </button>
              </div>
            </form>
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
