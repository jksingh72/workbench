import React, { useState } from 'react'
import {
  BookOpen,
  Plus,
  Trash2,
  CheckCircle2,
  X,
  Globe,
  BookMarked,
  Pencil,
  Check,
  RotateCcw
} from 'lucide-react'
import { BookSource } from '../types/electron'

interface BookSourceModalProps {
  isOpen: boolean
  sources: BookSource[]
  activeSourceId: string
  onClose: () => void
  onSelectSource: (sourceId: string) => void
  onSaveSources: (sources: BookSource[], newActiveId?: string) => Promise<void>
  onNotify: (msg: string) => void
}

const DEFAULT_PRESET_URLS: Record<string, { name: string; url: string }> = {
  oreilly: { name: "O'Reilly Learning", url: 'https://www.oreilly.com/member/login/' },
  kindle: { name: 'Amazon Kindle', url: 'https://read.amazon.com/' },
}

export const BookSourceModal: React.FC<BookSourceModalProps> = ({
  isOpen,
  sources,
  activeSourceId,
  onClose,
  onSelectSource,
  onSaveSources,
  onNotify,
}) => {
  const [newName, setNewName] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editUrl, setEditUrl] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  if (!isOpen) return null

  const handleStartEdit = (source: BookSource) => {
    setEditingId(source.id)
    setEditName(source.name)
    setEditUrl(source.url)
    setEditError(null)
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditName('')
    setEditUrl('')
    setEditError(null)
  }

  const handleResetToDefault = (sourceId: string) => {
    const preset = DEFAULT_PRESET_URLS[sourceId]
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

    if (!cleanName) {
      setEditError('Site name cannot be empty.')
      return
    }

    if (!cleanUrl) {
      setEditError('Website URL cannot be empty.')
      return
    }

    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl
    }

    try {
      new URL(cleanUrl)
    } catch {
      setEditError('Invalid URL format. Please include a valid web address.')
      return
    }

    // Check duplicate name with other sources
    if (sources.some((s) => s.id !== sourceId && s.name.toLowerCase() === cleanName.toLowerCase())) {
      setEditError('Another book site with this name already exists.')
      return
    }

    setIsSavingEdit(true)
    try {
      const updatedSources = sources.map((s) =>
        s.id === sourceId ? { ...s, name: cleanName, url: cleanUrl } : s
      )
      await onSaveSources(updatedSources, activeSourceId)
      onNotify(`✏️ Updated "${cleanName}" configuration.`)
      setEditingId(null)
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

    if (!cleanName) {
      setErrorMsg('Please enter a website name.')
      return
    }

    if (!cleanUrl) {
      setErrorMsg('Please enter a valid website URL.')
      return
    }

    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl
    }

    try {
      new URL(cleanUrl)
    } catch {
      setErrorMsg('Invalid URL format. Please include a valid web address.')
      return
    }

    // Check duplicate name or URL
    if (sources.some((s) => s.name.toLowerCase() === cleanName.toLowerCase())) {
      setErrorMsg('A book site with this name already exists.')
      return
    }

    setIsSubmitting(true)
    try {
      const newSource: BookSource = {
        id: `custom-${Date.now()}`,
        name: cleanName,
        url: cleanUrl,
        isPreset: false,
      }

      const updatedSources = [...sources, newSource]
      await onSaveSources(updatedSources, newSource.id)
      onNotify(`📚 Added "${cleanName}" and loaded it into Bookview!`)
      setNewName('')
      setNewUrl('')
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to add book site.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteSource = async (id: string, name: string) => {
    const updatedSources = sources.filter((s) => s.id !== id)
    const newActiveId = id === activeSourceId ? updatedSources[0]?.id || 'oreilly' : activeSourceId
    await onSaveSources(updatedSources, newActiveId)
    onNotify(`🗑️ Removed "${name}" from configured book sites.`)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container book-sources-modal" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="modal-icon-badge badge-oreilly">
              <BookOpen size={18} />
            </div>
            <div>
              <h3 className="modal-title">Configure Book Sites</h3>
              <p className="modal-subtitle">
                Switch between reading platforms or add your favorite book sites
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body">
          {/* Active Reader Banner */}
          <div className="session-status-card">
            <div className="status-indicator-row">
              <div className="status-label-group">
                <span className="status-pulse-dot" />
                <span className="status-title">Active Reading Platform</span>
              </div>
              <span className="status-pill-badge pill-active">
                {sources.find((s) => s.id === activeSourceId)?.name || "O'Reilly Learning"}
              </span>
            </div>
            <p className="status-explanation">
              Selecting a book site switches the Bookview pane immediately. Text selection,{' '}
              <strong>Ask AI</strong>, and <strong>Clip to OneNote</strong> will work automatically
              on whichever reader is open.
            </p>
          </div>

          {/* Configured Sources List */}
          <div className="book-sources-list-section">
            <h4 className="section-heading">
              <BookMarked size={14} className="heading-icon text-blue" />
              <span>Configured Book Sites ({sources.length})</span>
            </h4>

            <div className="sources-card-grid">
              {sources.map((source) => {
                const isActive = source.id === activeSourceId
                const isEditing = editingId === source.id

                if (isEditing) {
                  return (
                    <div
                      key={source.id}
                      className={`source-item-card editing-card ${isActive ? 'active-card' : ''}`}
                    >
                      <div className="source-edit-form">
                        <div className="edit-form-header">
                          <span className="edit-title">Edit Book Site: {source.name}</span>
                          {source.isPreset && (
                            <span className="source-preset-pill">Preset</span>
                          )}
                        </div>

                        <div className="edit-fields-row">
                          <div className="edit-field field-name">
                            <label>Site Name</label>
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              placeholder="e.g. Amazon Kindle"
                              disabled={isSavingEdit}
                              autoFocus
                            />
                          </div>

                          <div className="edit-field field-url">
                            <label>Website URL</label>
                            <input
                              type="text"
                              value={editUrl}
                              onChange={(e) => setEditUrl(e.target.value)}
                              placeholder="e.g. https://read.amazon.com/"
                              disabled={isSavingEdit}
                            />
                          </div>
                        </div>

                        {editError && (
                          <div className="edit-error-banner">
                            <span>{editError}</span>
                          </div>
                        )}

                        <div className="edit-actions-row">
                          {source.id in DEFAULT_PRESET_URLS ? (
                            <button
                              type="button"
                              className="btn-reset-preset"
                              onClick={() => handleResetToDefault(source.id)}
                              title="Reset back to default factory URL"
                              disabled={isSavingEdit}
                            >
                              <RotateCcw size={11} />
                              <span>Reset to Default</span>
                            </button>
                          ) : (
                            <div />
                          )}

                          <div className="edit-button-group">
                            <button
                              type="button"
                              className="btn-cancel-edit"
                              onClick={handleCancelEdit}
                              disabled={isSavingEdit}
                            >
                              <X size={12} />
                              <span>Cancel</span>
                            </button>
                            <button
                              type="button"
                              className="btn-save-edit"
                              onClick={() => handleSaveEdit(source.id)}
                              disabled={isSavingEdit || !editName.trim() || !editUrl.trim()}
                            >
                              <Check size={12} />
                              <span>{isSavingEdit ? 'Saving...' : 'Save'}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                }

                return (
                  <div
                    key={source.id}
                    className={`source-item-card ${isActive ? 'active-card' : ''}`}
                  >
                    <div className="source-info">
                      <div className="source-header-line">
                        <span className="source-name">{source.name}</span>
                        {source.isPreset && (
                          <span className="source-preset-pill">Preset</span>
                        )}
                        {isActive && (
                          <span className="source-active-pill">
                            <CheckCircle2 size={11} />
                            <span>Active</span>
                          </span>
                        )}
                      </div>
                      <span className="source-url" title={source.url}>
                        {source.url}
                      </span>
                    </div>

                    <div className="source-actions">
                      {!isActive ? (
                        <button
                          className="btn-select-source"
                          onClick={() => onSelectSource(source.id)}
                          title={`Switch Bookview to ${source.name}`}
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

          {/* Add New Book Site Form */}
          <div className="add-source-section">
            <h4 className="section-heading">
              <Plus size={14} className="heading-icon text-amber" />
              <span>Add Custom Book Site</span>
            </h4>
            <p className="section-description">
              Configure any web reader or digital library (e.g. Manning LiveBook, Project Gutenberg, Leanpub).
            </p>

            <form onSubmit={handleAddSource} className="add-source-form">
              <div className="form-row">
                <div className="form-field field-name">
                  <label htmlFor="book-source-name">Site Name</label>
                  <input
                    id="book-source-name"
                    type="text"
                    placeholder="e.g. Project Gutenberg"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>

                <div className="form-field field-url">
                  <label htmlFor="book-source-url">Website URL</label>
                  <div className="input-with-icon">
                    <Globe size={14} className="field-icon" />
                    <input
                      id="book-source-url"
                      type="text"
                      placeholder="e.g. https://www.gutenberg.org/"
                      value={newUrl}
                      onChange={(e) => setNewUrl(e.target.value)}
                      disabled={isSubmitting}
                    />
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
                  <span>{isSubmitting ? 'Adding...' : 'Add & Open Site'}</span>
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
