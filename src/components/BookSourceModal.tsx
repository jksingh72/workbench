import React, { useState } from 'react'
import {
  BookOpen,
  Plus,
  Trash2,
  CheckCircle2,
  X,
  Globe,
  BookMarked
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

  if (!isOpen) return null

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
