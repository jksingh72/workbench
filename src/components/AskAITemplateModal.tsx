import React, { useState, useEffect, useRef } from 'react'
import {
  Sparkles,
  X,
  Lightbulb,
  FileText,
  Code2,
  HelpCircle,
  ClipboardCopy,
  Pencil,
  Check,
  RotateCcw,
  Plus,
  Trash2,
  Star,
  SendHorizontal,
} from 'lucide-react'
import { AskAITemplate } from '../types/electron'

export const DEFAULT_ASK_AI_TEMPLATES: AskAITemplate[] = [
  {
    id: 'explain',
    name: 'Explain Concept',
    description: 'Explains clearly in simple terms with practical examples',
    prompt: 'Please explain the following concept clearly in simple terms with practical examples:\n\n"{text}"',
    isPreset: true,
  },
  {
    id: 'summarize',
    name: 'Summarize',
    description: 'Extracts key takeaways and summary points',
    prompt: 'Please summarize the key takeaways of the following excerpt:\n\n"{text}"',
    isPreset: true,
  },
  {
    id: 'code',
    name: 'Code Example',
    description: 'Generates a clean, practical working code demonstration',
    prompt: 'Please provide a clean, practical code example demonstrating the following concept:\n\n"{text}"',
    isPreset: true,
  },
  {
    id: 'quiz',
    name: 'Quiz Me',
    description: 'Generates 3 review questions with answers to test retention',
    prompt: 'Based on the following text, create 3 review questions with detailed answers to test my understanding:\n\n"{text}"',
    isPreset: true,
  },
  {
    id: 'raw',
    name: 'Paste Raw Selection',
    description: 'Transfers highlighted text directly without a wrapper prompt',
    prompt: '{text}',
    isPreset: true,
  },
]

const PRESET_MAP: Record<string, AskAITemplate> = Object.fromEntries(
  DEFAULT_ASK_AI_TEMPLATES.map((t) => [t.id, t])
)

interface AskAITemplateModalProps {
  isOpen: boolean
  initialMode?: 'custom' | 'manage'
  initialSelectionText?: string
  templates: AskAITemplate[]
  defaultTemplateId: string
  onClose: () => void
  onSaveTemplates: (templates: AskAITemplate[], defaultId: string) => void
  onRunTemplate: (templateKey: string, customPrompt?: string, explicitText?: string) => void
  onNotify: (msg: string) => void
}

export const AskAITemplateModal: React.FC<AskAITemplateModalProps> = ({
  isOpen,
  initialMode = 'manage',
  initialSelectionText = '',
  templates,
  defaultTemplateId,
  onClose,
  onSaveTemplates,
  onRunTemplate,
  onNotify,
}) => {
  const [quickPrompt, setQuickPrompt] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editPrompt, setEditPrompt] = useState('')
  const [editError, setEditError] = useState<string | null>(null)

  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newPrompt, setNewPrompt] = useState('')
  const [addError, setAddError] = useState<string | null>(null)

  const quickInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) return
    setEditingId(null)
    setEditError(null)
    setAddError(null)
    if (initialMode === 'custom') {
      setTimeout(() => quickInputRef.current?.focus(), 60)
    }
  }, [isOpen, initialMode])

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

  const renderTemplateIcon = (id: string) => {
    switch (id) {
      case 'explain':
        return <Lightbulb size={15} className="item-icon icon-bulb" />
      case 'summarize':
        return <FileText size={15} className="item-icon icon-summary" />
      case 'code':
        return <Code2 size={15} className="item-icon icon-code" />
      case 'quiz':
        return <HelpCircle size={15} className="item-icon icon-quiz" />
      case 'raw':
        return <ClipboardCopy size={15} className="item-icon icon-copy" />
      default:
        return <Sparkles size={15} className="item-icon text-amber" />
    }
  }

  const handleQuickCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const clean = quickPrompt.trim()
    if (!clean) {
      onNotify('⚠️ Please enter a custom prompt instruction first')
      return
    }
    onClose()
    onRunTemplate('custom', clean, initialSelectionText || undefined)
    setQuickPrompt('')
  }

  const handleSetDefault = (id: string, name: string) => {
    onSaveTemplates(templates, id)
    onNotify(`★ Set "${name}" as your 1-Click Ask AI default!`)
  }

  const handleStartEdit = (t: AskAITemplate) => {
    setEditingId(t.id)
    setEditName(t.name)
    setEditDesc(t.description)
    setEditPrompt(t.prompt)
    setEditError(null)
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditError(null)
  }

  const handleResetPreset = (id: string) => {
    const preset = PRESET_MAP[id]
    if (!preset) return
    setEditName(preset.name)
    setEditDesc(preset.description)
    setEditPrompt(preset.prompt)
    setEditError(null)
  }

  const handleSaveEdit = (id: string) => {
    const cleanName = editName.trim()
    const cleanDesc = editDesc.trim()
    const cleanPrompt = editPrompt.trim()

    if (!cleanName) {
      setEditError('Template name cannot be empty.')
      return
    }
    if (!cleanPrompt) {
      setEditError('Prompt instruction cannot be empty.')
      return
    }

    const updated = templates.map((t) =>
      t.id === id
        ? {
            ...t,
            name: cleanName,
            description: cleanDesc || t.description,
            prompt: cleanPrompt,
          }
        : t
    )
    onSaveTemplates(updated, defaultTemplateId)
    setEditingId(null)
    onNotify(`✏️ Updated "${cleanName}" template!`)
  }

  const handleAddTemplate = (e: React.FormEvent) => {
    e.preventDefault()
    setAddError(null)
    const cleanName = newName.trim()
    const cleanDesc = newDesc.trim() || 'Custom Ask AI prompt template'
    const cleanPrompt = newPrompt.trim()

    if (!cleanName) {
      setAddError('Please enter a template name.')
      return
    }
    if (!cleanPrompt) {
      setAddError('Please enter the prompt instructions.')
      return
    }
    if (templates.some((t) => t.name.toLowerCase() === cleanName.toLowerCase())) {
      setAddError('A template with this name already exists.')
      return
    }

    const newTemplate: AskAITemplate = {
      id: `custom-tpl-${Date.now()}`,
      name: cleanName,
      description: cleanDesc,
      prompt: cleanPrompt,
      isPreset: false,
    }

    const updated = [...templates, newTemplate]
    onSaveTemplates(updated, defaultTemplateId)
    setNewName('')
    setNewDesc('')
    setNewPrompt('')
    onNotify(`✨ Added "${cleanName}" to Ask AI templates!`)
  }

  const handleDeleteTemplate = (id: string, name: string) => {
    const updated = templates.filter((t) => t.id !== id)
    const nextDefault = defaultTemplateId === id ? 'explain' : defaultTemplateId
    onSaveTemplates(updated, nextDefault)
    onNotify(`🗑️ Removed "${name}" template.`)
  }

  const activeDefault = templates.find((t) => t.id === defaultTemplateId) || templates[0]

  return (
    <div className="pane-modal-backdrop" onClick={onClose}>
      <div
        className="pane-modal-container ask-ai-template-modal"
        style={{ width: '680px', maxWidth: '95vw', maxHeight: '88vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title-group">
            <div
              className="modal-icon-badge"
              style={{
                background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
                color: '#fde047',
              }}
            >
              <Sparkles size={18} />
            </div>
            <div>
              <h3 className="modal-title">Ask AI — Prompt Templates & Quick Prompt</h3>
              <p className="modal-subtitle">
                Customize your 1-Click default action, edit core presets, or create custom study templates
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} title="Close (Esc)">
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* 1. Quick One-Off Custom Prompt Bar */}
          <div className="session-status-card" style={{ padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={13} className="text-amber" />
                Quick Custom Prompt (One-Off)
              </span>
              {initialSelectionText ? (
                <span style={{ fontSize: '11px', color: '#34d399' }}>
                  ✓ Selection captured ({initialSelectionText.length} chars)
                </span>
              ) : (
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                  Uses currently highlighted text in Bookview
                </span>
              )}
            </div>
            <form onSubmit={handleQuickCustomSubmit} style={{ display: 'flex', gap: '8px' }}>
              <input
                ref={quickInputRef}
                type="text"
                value={quickPrompt}
                onChange={(e) => setQuickPrompt(e.target.value)}
                placeholder="e.g. Translate this code to Python, critique the architecture, give a real-world analogy..."
                style={{
                  flex: 1,
                  backgroundColor: '#090d16',
                  border: '1px solid rgba(255,255,255,0.16)',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  color: '#f8fafc',
                  fontSize: '12.5px',
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '0 14px',
                  background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                <SendHorizontal size={13} />
                <span>Send to AI</span>
              </button>
            </form>
          </div>

          {/* 2. 1-Click Default Status */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              background: 'rgba(124, 58, 237, 0.1)',
              border: '1px solid rgba(124, 58, 237, 0.3)',
              borderRadius: '8px',
              fontSize: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#e2e8f0' }}>
              <Star size={14} style={{ color: '#facc15', fill: '#facc15' }} />
              <span>
                <strong>1-Click Ask AI Button Default:</strong> Clicking the main{' '}
                <code style={{ color: '#c4b5fd' }}>✨ Ask AI</code> button (or pressing{' '}
                <code style={{ color: '#c4b5fd' }}>Ctrl+Shift+A</code>) immediately runs:
              </span>
            </div>
            <span
              style={{
                padding: '2px 10px',
                borderRadius: '999px',
                background: 'rgba(124, 58, 237, 0.25)',
                border: '1px solid rgba(167, 139, 250, 0.4)',
                color: '#ddd6fe',
                fontWeight: 600,
                fontSize: '11.5px',
              }}
            >
              {activeDefault?.name || 'Explain Concept'}
            </span>
          </div>

          {/* 3. Configured Templates List */}
          <div className="book-sources-list-section">
            <h4 className="section-heading" style={{ marginBottom: '8px' }}>
              <Sparkles size={14} className="heading-icon text-purple" />
              <span>Prompt Templates ({templates.length}) — Click ★ to set as 1-Click Default</span>
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {templates.map((t) => {
                const isDefault = t.id === defaultTemplateId
                const isEditing = editingId === t.id

                if (isEditing) {
                  return (
                    <div
                      key={t.id}
                      className="source-item-card editing-card"
                      style={{ padding: '12px', border: '1px solid rgba(124, 58, 237, 0.5)' }}
                    >
                      <div className="source-edit-form" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0' }}>
                            Edit Template: {t.name}
                          </span>
                          {t.isPreset && <span className="source-preset-pill">Core Preset</span>}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '8px' }}>
                          <div className="edit-field">
                            <label>Template Name</label>
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              placeholder="e.g. Explain Concept"
                            />
                          </div>
                          <div className="edit-field">
                            <label>Short Description</label>
                            <input
                              type="text"
                              value={editDesc}
                              onChange={(e) => setEditDesc(e.target.value)}
                              placeholder="What this prompt does"
                            />
                          </div>
                        </div>

                        <div className="edit-field">
                          <label>
                            Prompt Template{' '}
                            <span style={{ color: '#94a3b8', fontWeight: 400 }}>
                              (Use <code>{'{text}'}</code> where the book excerpt should be placed)
                            </span>
                          </label>
                          <textarea
                            rows={3}
                            value={editPrompt}
                            onChange={(e) => setEditPrompt(e.target.value)}
                            style={{
                              width: '100%',
                              backgroundColor: '#090d16',
                              border: '1px solid rgba(255,255,255,0.15)',
                              borderRadius: '6px',
                              padding: '8px',
                              color: '#f1f5f9',
                              fontSize: '12px',
                              fontFamily: 'var(--font-mono)',
                              resize: 'vertical',
                            }}
                          />
                        </div>

                        {editError && (
                          <div className="edit-error-banner">
                            <span>{editError}</span>
                          </div>
                        )}

                        <div className="edit-actions-row">
                          {t.id in PRESET_MAP ? (
                            <button
                              type="button"
                              className="btn-edit-reset"
                              onClick={() => handleResetPreset(t.id)}
                              title="Restore original preset text"
                            >
                              <RotateCcw size={12} />
                              <span>Reset to Default</span>
                            </button>
                          ) : (
                            <div />
                          )}
                          <div className="edit-actions-right">
                            <button type="button" className="btn-edit-cancel" onClick={handleCancelEdit}>
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="btn-edit-save"
                              onClick={() => handleSaveEdit(t.id)}
                            >
                              <Check size={12} />
                              <span>Save Template</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                }

                return (
                  <div
                    key={t.id}
                    className={`source-item-card ${isDefault ? 'active-card' : ''}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      gap: '10px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flex: 1, minWidth: 0 }}>
                      <div style={{ marginTop: '2px' }}>{renderTemplateIcon(t.id)}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#f1f5f9' }}>{t.name}</span>
                          {t.isPreset && <span className="source-preset-pill">Preset</span>}
                          {isDefault && (
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 600,
                                padding: '1px 7px',
                                borderRadius: '999px',
                                background: 'rgba(250, 204, 21, 0.15)',
                                border: '1px solid rgba(250, 204, 21, 0.4)',
                                color: '#fde047',
                              }}
                            >
                              ★ 1-Click Default
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>{t.description}</span>
                        {t.id !== 'raw' && (
                          <code
                            style={{
                              fontSize: '10.5px',
                              color: '#64748b',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: 'block',
                              marginTop: '2px',
                            }}
                          >
                            {t.prompt.replace(/\n+/g, ' ')}
                          </code>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => {
                          onClose()
                          onRunTemplate(t.id, t.id === 'raw' ? undefined : t.prompt, initialSelectionText || undefined)
                        }}
                        title={`Run "${t.name}" on current selection now`}
                        style={{
                          padding: '4px 9px',
                          borderRadius: '5px',
                          background: 'rgba(59, 130, 246, 0.15)',
                          border: '1px solid rgba(59, 130, 246, 0.35)',
                          color: '#93c5fd',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Run
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSetDefault(t.id, t.name)}
                        disabled={isDefault}
                        title={isDefault ? 'Currently the 1-Click Default' : `Set "${t.name}" as 1-Click Default`}
                        style={{
                          padding: '4px 7px',
                          borderRadius: '5px',
                          background: isDefault ? 'rgba(250, 204, 21, 0.18)' : 'rgba(255,255,255,0.05)',
                          border: `1px solid ${isDefault ? 'rgba(250, 204, 21, 0.45)' : 'rgba(255,255,255,0.12)'}`,
                          color: isDefault ? '#facc15' : '#94a3b8',
                          cursor: isDefault ? 'default' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <Star size={12} style={isDefault ? { fill: '#facc15' } : undefined} />
                      </button>

                      {t.id !== 'raw' && (
                        <button
                          type="button"
                          className="source-edit-btn"
                          onClick={() => handleStartEdit(t)}
                          title={`Customize "${t.name}" prompt`}
                        >
                          <Pencil size={12} />
                        </button>
                      )}

                      {!t.isPreset && (
                        <button
                          type="button"
                          className="source-delete-btn"
                          onClick={() => handleDeleteTemplate(t.id, t.name)}
                          title={`Delete "${t.name}"`}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 4. Add New Custom Template */}
          <div className="add-source-section">
            <h4 className="section-heading">
              <Plus size={14} className="heading-icon text-emerald" />
              <span>Add Custom Reusable Template</span>
            </h4>
            <form onSubmit={handleAddTemplate} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '8px' }}>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Template Name (e.g. Deep Dive)"
                  className="source-input"
                />
                <input
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Short description (optional)"
                  className="source-input"
                />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  value={newPrompt}
                  onChange={(e) => setNewPrompt(e.target.value)}
                  placeholder='Prompt instruction (e.g. Explain first principles and trade-offs of: "{text}")'
                  className="source-input"
                  style={{ flex: 1 }}
                />
                <button type="submit" className="btn-add-source" style={{ whiteSpace: 'nowrap' }}>
                  <Plus size={14} />
                  <span>Add Template</span>
                </button>
              </div>
              {addError && (
                <div className="error-message-box">
                  <span>{addError}</span>
                </div>
              )}
            </form>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="modal-footer">
          <span className="footer-hint">Tip: Use {'{text}'} in your template or Workbench will append the excerpt automatically.</span>
          <button className="btn-primary-done" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

