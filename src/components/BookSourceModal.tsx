import React, { useState, useEffect } from 'react'
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
  RotateCcw,
  Folder,
  FolderOpen
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

const DEFAULT_PRESET_BOOK_URLS: Record<string, { name: string; url: string }> = {
  oreilly: { name: "O'Reilly Learning", url: 'https://learning.oreilly.com/home/' },
  kindle: { name: 'Amazon Kindle', url: 'https://read.amazon.com/' },
  'local-books': { name: 'Local Books', url: '' },
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
  // Ensure presets, especially Local Books, are always present, properly named and non-deletable
  const displaySources = React.useMemo(() => {
    const list = [...sources]
    const hasLocal = list.some((s) => s.id === 'local-books')
    if (!hasLocal) {
      list.push({
        id: 'local-books',
        name: 'Local Books',
        url: '',
        isPreset: true,
        isLocal: true,
      })
    }
    return list.map((s) => {
      if (s.id === 'local-books') {
        return {
          ...s,
          name: 'Local Books',
          isPreset: true,
          isLocal: true,
        }
      }
      return s
    })
  }, [sources])

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

  const handleStartEdit = (source: BookSource) => {
    setEditingId(source.id)
    setEditName(source.name)
    setEditUrl(source.url)
    setEditIsLocal(
      !!source.isLocal ||
      source.id === 'local-books' ||
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
          setNewName(parts[parts.length - 1] || 'Local Books')
        }
      }
    }
  }

  const handleResetToDefault = (sourceId: string) => {
    const preset = DEFAULT_PRESET_BOOK_URLS[sourceId]
    if (preset) {
      setEditName(preset.name)
      setEditUrl(preset.url)
      setEditIsLocal(sourceId === 'local-books')
      setEditError(null)
    }
  }

  const handleSaveEdit = async (sourceId: string) => {
    setEditError(null)
    const cleanName = editName.trim()
    let cleanUrl = editUrl.trim()
    const isLocal = editIsLocal || sourceId === 'local-books'

    if (!cleanName) {
      setEditError('Name cannot be empty.')
      return
    }

    if (!cleanUrl) {
      setEditError(isLocal ? 'Folder path cannot be empty.' : 'Website URL cannot be empty.')
      return
    }

    if (!isLocal) {
      if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
        cleanUrl = 'https://' + cleanUrl
      }

      try {
        new URL(cleanUrl)
      } catch {
        setEditError('Invalid URL format. Please include a valid web address.')
        return
      }
    }

    // Check duplicate name with other sources
    if (displaySources.some((s) => s.id !== sourceId && s.name.toLowerCase() === cleanName.toLowerCase())) {
      setEditError('Another book site with this name already exists.')
      return
    }

    setIsSavingEdit(true)
    try {
      const updatedSources = displaySources.map((s) =>
        s.id === sourceId
          ? {
              ...s,
              name: s.id === 'local-books' ? 'Local Books' : cleanName,
              url: cleanUrl,
              isLocal,
              isPreset: s.id === 'local-books' ? true : s.isPreset,
            }
          : s
      )
      await onSaveSources(updatedSources, activeSourceId)
      onNotify(`✏️ Updated "${sourceId === 'local-books' ? 'Local Books' : cleanName}" configuration.`)
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
    const isLocal = newSourceType === 'local'

    if (!cleanName) {
      setErrorMsg('Please enter a name.')
      return
    }

    if (!cleanUrl) {
      setErrorMsg(isLocal ? 'Please select a folder on your computer.' : 'Please enter a valid website URL.')
      return
    }

    if (!isLocal) {
      if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
        cleanUrl = 'https://' + cleanUrl
      }

      try {
        new URL(cleanUrl)
      } catch {
        setErrorMsg('Invalid URL format. Please include a valid web address.')
        return
      }
    }

    // Check duplicate name
    if (displaySources.some((s) => s.name.toLowerCase() === cleanName.toLowerCase())) {
      setErrorMsg('A book source with this name already exists.')
      return
    }

    setIsSubmitting(true)
    try {
      const newSource: BookSource = {
        id: `custom-${Date.now()}`,
        name: cleanName,
        url: cleanUrl,
        isPreset: false,
        isLocal,
      }

      const updatedSources = [...displaySources, newSource]
      await onSaveSources(updatedSources, newSource.id)
      onNotify(`📚 Added "${cleanName}" and loaded it into Bookview!`)
      setNewName('')
      setNewUrl('')
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to add book source.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteSource = async (id: string, name: string) => {
    if (id === 'oreilly' || id === 'kindle' || id === 'local-books') {
      onNotify('⚠️ Preset reading sources cannot be deleted.')
      return
    }
    const updatedSources = displaySources.filter((s) => s.id !== id)
    const newActiveId = id === activeSourceId ? updatedSources[0]?.id || 'oreilly' : activeSourceId
    await onSaveSources(updatedSources, newActiveId)
    onNotify(`🗑️ Removed "${name}" from configured book sites.`)
  }

  return (
    <div className="pane-modal-backdrop" onClick={onClose}>
      <div className="pane-modal-container book-sources-modal" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="modal-icon-badge badge-oreilly">
              <BookOpen size={18} />
            </div>
            <div>
              <h3 className="modal-title">Configure Book Sites & Local Libraries</h3>
              <p className="modal-subtitle">
                Switch between reading platforms or explore local book folders and PDFs
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
                {displaySources.find((s) => s.id === activeSourceId)?.name || "O'Reilly Learning"}
              </span>
            </div>
            <p className="status-explanation">
              Selecting a book site switches the Bookview pane immediately. Local books and PDFs open
              inside the tabbed document workspace with zero unmount and persistent state.
            </p>
          </div>

          {/* Configured Sources List */}
          <div className="book-sources-list-section">
            <h4 className="section-heading">
              <BookMarked size={14} className="heading-icon text-blue" />
              <span>Configured Reading Sources ({displaySources.length})</span>
            </h4>

            <div className="sources-card-grid">
              {displaySources.map((source) => {
                const isActive = source.id === activeSourceId
                const isEditing = editingId === source.id
                const isItemLocal =
                  source.isLocal ||
                  source.id === 'local-books' ||
                  (!source.url.startsWith('http://') && !source.url.startsWith('https://'))

                if (isEditing) {
                  return (
                    <div
                      key={source.id}
                      className={`source-item-card editing-card ${isActive ? 'active-card' : ''}`}
                    >
                      <div className="source-edit-form">
                        <div className="edit-form-header">
                          <span className="edit-title">Edit: {source.name}</span>
                          {source.isPreset && (
                            <span className="source-preset-pill">Preset</span>
                          )}
                          {isItemLocal && (
                            <span className="source-local-pill">Local</span>
                          )}
                        </div>

                        <div className="edit-fields-row">
                          <div className="edit-field field-name">
                            <label>Name</label>
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              placeholder={editIsLocal ? 'e.g. My PDF Books' : 'e.g. Amazon Kindle'}
                              disabled={isSavingEdit}
                              autoFocus
                            />
                          </div>

                          <div className="edit-field field-url">
                            <label>{editIsLocal ? 'Folder Path' : 'Website URL'}</label>
                            <div className="input-with-action-btn">
                              <input
                                type="text"
                                value={editUrl}
                                onChange={(e) => setEditUrl(e.target.value)}
                                placeholder={editIsLocal ? 'C:\\Books\\...' : 'e.g. https://read.amazon.com/'}
                                disabled={isSavingEdit}
                              />
                              {editIsLocal && (
                                <button
                                  type="button"
                                  className="btn-browse-folder"
                                  onClick={handleBrowseEditFolder}
                                  title="Browse Folder..."
                                  disabled={isSavingEdit}
                                >
                                  <FolderOpen size={13} />
                                  <span>Browse...</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {editError && (
                          <div className="edit-error-banner">
                            <span>{editError}</span>
                          </div>
                        )}

                        <div className="edit-actions-row">
                          {source.id in DEFAULT_PRESET_BOOK_URLS ? (
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
                        {isItemLocal ? (
                          <Folder size={14} className="source-type-icon text-cyan" />
                        ) : (
                          <Globe size={14} className="source-type-icon text-muted" />
                        )}
                        <span className="source-name">{source.name}</span>
                        {source.isPreset && (
                          <span className="source-preset-pill">Preset</span>
                        )}
                        {isItemLocal && (
                          <span className="source-local-pill">Local</span>
                        )}
                        {isActive && (
                          <span className="source-active-pill">
                            <CheckCircle2 size={11} />
                            <span>Active</span>
                          </span>
                        )}
                      </div>
                      <span className="source-url" title={source.url}>
                        {source.url || (isItemLocal ? '(Local Folder)' : '')}
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
                        title={`Edit ${source.name} name or URL/folder`}
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

          {/* Add New Reading Source Form */}
          <div className="add-source-section">
            <h4 className="section-heading">
              <Plus size={14} className="heading-icon text-amber" />
              <span>Add Book Site or Local Folder</span>
            </h4>
            <p className="section-description">
              Configure a web-based digital library (e.g. Manning LiveBook, Project Gutenberg) or choose a local folder containing your PDF books and documents.
            </p>

            {/* Type selector toggle */}
            <div className="source-type-toggle">
              <button
                type="button"
                className={`type-tab-btn ${newSourceType === 'web' ? 'active' : ''}`}
                onClick={() => {
                  setNewSourceType('web')
                  setErrorMsg(null)
                }}
              >
                <Globe size={13} />
                <span>Web Reading Platform</span>
              </button>
              <button
                type="button"
                className={`type-tab-btn ${newSourceType === 'local' ? 'active' : ''}`}
                onClick={() => {
                  setNewSourceType('local')
                  setErrorMsg(null)
                }}
              >
                <Folder size={13} />
                <span>Local Books Folder</span>
              </button>
            </div>

            <form onSubmit={handleAddSource} className="add-source-form">
              <div className="form-row">
                <div className="form-field field-name">
                  <label htmlFor="book-source-name">
                    {newSourceType === 'local' ? 'Library Name' : 'Site Name'}
                  </label>
                  <input
                    id="book-source-name"
                    type="text"
                    placeholder={newSourceType === 'local' ? 'e.g. Programming Books' : 'e.g. Project Gutenberg'}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>

                <div className="form-field field-url">
                  <label htmlFor="book-source-url">
                    {newSourceType === 'local' ? 'Folder on Computer' : 'Website URL'}
                  </label>
                  <div className="input-with-action-btn">
                    {newSourceType === 'local' ? (
                      <>
                        <input
                          id="book-source-url"
                          type="text"
                          placeholder="Select a folder containing PDFs..."
                          value={newUrl}
                          onChange={(e) => setNewUrl(e.target.value)}
                          disabled={isSubmitting}
                        />
                        <button
                          type="button"
                          className="btn-browse-folder"
                          onClick={handleBrowseNewFolder}
                          title="Browse Folder..."
                          disabled={isSubmitting}
                        >
                          <FolderOpen size={13} />
                          <span>Browse...</span>
                        </button>
                      </>
                    ) : (
                      <div className="input-with-icon" style={{ width: '100%' }}>
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
                  <span>
                    {isSubmitting
                      ? 'Adding...'
                      : newSourceType === 'local'
                        ? 'Add & Open Library'
                        : 'Add & Open Site'}
                  </span>
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
