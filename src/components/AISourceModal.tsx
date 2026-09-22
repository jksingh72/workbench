import React, { useState, useEffect } from 'react'
import {
  Bot,
  Plus,
  Trash2,
  CheckCircle2,
  X,
  Globe,
  Sparkles,
  Pencil,
  Check,
  RotateCcw
} from 'lucide-react'
import { AISource } from '../types/electron'

interface AISourceModalProps {
  isOpen: boolean
  sources: AISource[]
  activeSourceId: string
  onClose: () => void
  onSelectSource: (sourceId: string) => void
  onSaveSources: (sources: AISource[], newActiveId?: string) => Promise<void>
  onNotify: (msg: string) => void
}

const DEFAULT_PRESET_AI_URLS: Record<string, { name: string; url: string }> = {
  chatgpt: { name: 'ChatGPT', url: 'https://chatgpt.com/' },
  claude: { name: 'Anthropic Claude', url: 'https://claude.ai/' },
  gemini: { name: 'Google Gemini', url: 'https://gemini.google.com/' },
  perplexity: { name: 'Perplexity AI', url: 'https://www.perplexity.ai/' },
}

export const AISourceModal: React.FC<AISourceModalProps> = ({
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

  const handleStartEdit = (source: AISource) => {
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
    const preset = DEFAULT_PRESET_AI_URLS[sourceId]
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
      setEditError('Another AI platform with this name already exists.')
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
      setErrorMsg('Please enter an AI platform name.')
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

    // Check duplicate name
    if (sources.some((s) => s.name.toLowerCase() === cleanName.toLowerCase())) {
      setErrorMsg('An AI platform with this name already exists.')
      return
    }

    setIsSubmitting(true)
    try {
      const newSource: AISource = {
        id: `custom-ai-${Date.now()}`,
        name: cleanName,
        url: cleanUrl,
        isPreset: false,
      }

      const updatedSources = [...sources, newSource]
      await onSaveSources(updatedSources, newSource.id)
      onNotify(`🤖 Added "${cleanName}" and loaded it into ChatView!`)
      setNewName('')
      setNewUrl('')
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to add AI platform.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteSource = async (id: string, name: string) => {
    const updatedSources = sources.filter((s) => s.id !== id)
    const newActiveId = id === activeSourceId ? updatedSources[0]?.id || 'chatgpt' : activeSourceId
    await onSaveSources(updatedSources, newActiveId)
    onNotify(`🗑️ Removed "${name}" from configured AI platforms.`)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container ai-sources-modal" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="modal-icon-badge badge-chatgpt">
              <Bot size={18} />
            </div>
            <div>
              <h3 className="modal-title">Configure AI Platforms</h3>
              <p className="modal-subtitle">
                Switch between AI assistants or connect your favorite web-based AI tools
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body">
          {/* Active AI Status Card */}
          <div className="session-status-card">
            <div className="status-indicator-row">
              <div className="status-label-group">
                <span className="status-pulse-dot dot-ai" />
                <span className="status-title">Active AI Assistant</span>
              </div>
              <span className="status-pill-badge pill-active-ai">
                {sources.find((s) => s.id === activeSourceId)?.name || 'ChatGPT'}
              </span>
            </div>
            <p className="status-explanation">
              Selecting an AI platform switches the ChatView pane immediately. All conversations,
              login states, and cookies are kept isolated and secure.
            </p>
          </div>

          {/* Configured AI Platforms List */}
          <div className="book-sources-list-section">
            <h4 className="section-heading">
              <Sparkles size={14} className="heading-icon text-emerald" />
              <span>Configured AI Platforms ({sources.length})</span>
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
                          <span className="edit-title">Edit AI Platform: {source.name}</span>
                          {source.isPreset && (
                            <span className="source-preset-pill">Preset</span>
                          )}
                        </div>

                        <div className="edit-fields-row">
                          <div className="edit-field field-name">
                            <label>Platform Name</label>
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              placeholder="e.g. Anthropic Claude"
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
                              placeholder="e.g. https://claude.ai/"
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
                          {source.id in DEFAULT_PRESET_AI_URLS ? (
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
                          title={`Switch ChatView to ${source.name}`}
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

          {/* Add New AI Platform Form */}
          <div className="add-source-section">
            <h4 className="section-heading">
              <Plus size={14} className="heading-icon text-amber" />
              <span>Add Custom AI Platform</span>
            </h4>
            <p className="section-description">
              Connect any web-based AI assistant or LLM chat interface (e.g. Hugging Face Chat, DeepSeek, Mistral Le Chat, Phind).
            </p>

            <form onSubmit={handleAddSource} className="add-source-form">
              <div className="form-row">
                <div className="form-field field-name">
                  <label htmlFor="ai-source-name">Platform Name</label>
                  <input
                    id="ai-source-name"
                    type="text"
                    placeholder="e.g. DeepSeek Chat"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>

                <div className="form-field field-url">
                  <label htmlFor="ai-source-url">Website URL</label>
                  <div className="input-with-icon">
                    <Globe size={14} className="field-icon" />
                    <input
                      id="ai-source-url"
                      type="text"
                      placeholder="e.g. https://chat.deepseek.com/"
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
                  <span>{isSubmitting ? 'Adding...' : 'Add & Open Platform'}</span>
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
