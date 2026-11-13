import React, { useState, useEffect, useMemo } from 'react'
import {
  Terminal,
  X,
  Pencil,
  Check,
  RotateCcw,
  Plus,
  Trash2,
  Search,
  Play,
  FileText,
  Lightbulb,
  Sparkles,
  Wrench,
  Layers,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import {
  BookCommandCategory,
  BookCommandPromptConfigItem,
  BookCommandPromptOverrides,
  PageDesignPromptSettings,
} from '../types/electron'

const DEFAULT_MODAL_PAGE_DESIGN: PageDesignPromptSettings = {
  includeDesignSummary: true,
  preserveMarkdownStructure: true,
  includeFigureCaptions: true,
  includeVideoTranscript: true,
  designGuidancePrompt:
    'Note on Source Material & Page Design: This extraction is tailored to the detected material layout (section hierarchy, callout boxes, code blocks, tables, figure/diagram descriptions, or video transcript timestamps). Use these structural cues—and reference code blocks, diagrams, tables, or timestamps directly—to produce an accurate, well-organized response.',
}

interface BookCommandConfigModalProps {
  isOpen: boolean
  onClose: () => void
  onNotify: (msg: string) => void
  onRunCommand?: (commandStr: string) => void
}

export const BookCommandConfigModal: React.FC<BookCommandConfigModalProps> = ({
  isOpen,
  onClose,
  onNotify,
  onRunCommand,
}) => {
  const [loading, setLoading] = useState(false)
  const [config, setConfig] = useState<BookCommandPromptOverrides>({ overrides: {}, customCommands: [] })
  const [defaults, setDefaults] = useState<BookCommandPromptConfigItem[]>([])
  const [items, setItems] = useState<BookCommandPromptConfigItem[]>([])

  const [activeTab, setActiveTab] = useState<'all' | BookCommandCategory>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Editing state
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editIcon, setEditIcon] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editAliases, setEditAliases] = useState('')
  const [editPrompt, setEditPrompt] = useState('')
  const [editError, setEditError] = useState<string | null>(null)

  // Add custom command state
  const [newKey, setNewKey] = useState('')
  const [newCategory, setNewCategory] = useState<BookCommandCategory>('explain')
  const [newLabel, setNewLabel] = useState('')
  const [newIcon, setNewIcon] = useState('✨')
  const [newDesc, setNewDesc] = useState('')
  const [newPrompt, setNewPrompt] = useState('')
  const [addError, setAddError] = useState<string | null>(null)

  // Confirm reset all
  const [confirmResetAll, setConfirmResetAll] = useState(false)

  // Material & Page Design settings panel
  const [showDesignPanel, setShowDesignPanel] = useState(false)
  const [designDraft, setDesignDraft] = useState<PageDesignPromptSettings>(DEFAULT_MODAL_PAGE_DESIGN)

  const loadConfigState = async () => {
    if (!window.electron?.getBookCommandConfig) return
    setLoading(true)
    try {
      const state = await window.electron.getBookCommandConfig()
      setConfig(state.config || { overrides: {}, customCommands: [] })
      setDefaults(state.defaults || [])
      setItems(state.items || [])
      setDesignDraft({
        ...DEFAULT_MODAL_PAGE_DESIGN,
        ...(state.config?.pageDesign || {}),
      })
    } catch (err) {
      console.error('[BookCommandConfigModal] Failed to load command config:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isOpen) return
    setEditingKey(null)
    setEditError(null)
    setAddError(null)
    setConfirmResetAll(false)
    loadConfigState()
  }, [isOpen])

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

  const defaultByKey = useMemo(() => {
    return new Map(defaults.map((d) => [d.key, d]))
  }, [defaults])

  const customizedCount = useMemo(() => {
    const ovCount = Object.keys(config.overrides || {}).length
    const customCount = (config.customCommands || []).length
    return ovCount + customCount
  }, [config])

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return items.filter((item) => {
      if (activeTab !== 'all' && item.category !== activeTab) return false
      if (!q) return true
      return (
        item.command.toLowerCase().includes(q) ||
        item.key.toLowerCase().includes(q) ||
        item.label.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.aliases.some((a) => a.toLowerCase().includes(q)) ||
        item.promptDirective.toLowerCase().includes(q)
      )
    })
  }, [items, activeTab, searchQuery])

  if (!isOpen) return null

  const persistConfig = async (nextConfig: BookCommandPromptOverrides, toastMsg?: string) => {
    if (!window.electron?.saveBookCommandConfig) return
    const res = await window.electron.saveBookCommandConfig(nextConfig)
    if (res?.success) {
      setConfig(res.config)
      setDefaults(res.defaults)
      setItems(res.items)
      if (toastMsg) onNotify(toastMsg)
    } else {
      onNotify(`⚠️ Failed to save command configuration: ${res?.error || 'Unknown error'}`)
    }
  }

  const handleStartEdit = (item: BookCommandPromptConfigItem) => {
    setEditingKey(item.key)
    setEditLabel(item.label)
    setEditIcon(item.icon)
    setEditDesc(item.description)
    setEditAliases(item.aliases.join(', '))
    setEditPrompt(item.promptDirective)
    setEditError(null)
  }

  const handleSaveEdit = async (item: BookCommandPromptConfigItem) => {
    const cleanLabel = editLabel.trim()
    const cleanPrompt = editPrompt.trim()
    if (!cleanLabel) {
      setEditError('Command label is required.')
      return
    }
    if (!cleanPrompt) {
      setEditError('Prompt directive cannot be empty.')
      return
    }

    const parsedAliases = editAliases
      .split(',')
      .map((s) => s.trim().replace(/^:/, '').toLowerCase())
      .filter(Boolean)

    if (item.isBuiltIn) {
      const def = defaultByKey.get(item.key)
      const nextOverrides = { ...(config.overrides || {}) }

      const isIdenticalToDefault =
        def &&
        cleanLabel === def.label &&
        (editIcon.trim() || def.icon) === def.icon &&
        editDesc.trim() === def.description &&
        cleanPrompt === def.promptDirective &&
        JSON.stringify(parsedAliases) === JSON.stringify(def.aliases)

      if (isIdenticalToDefault) {
        delete nextOverrides[item.key]
      } else {
        nextOverrides[item.key] = {
          label: cleanLabel,
          icon: editIcon.trim() || item.icon,
          description: editDesc.trim(),
          promptDirective: cleanPrompt,
          aliases: parsedAliases.length > 0 ? parsedAliases : item.aliases,
        }
      }

      await persistConfig(
        { ...config, overrides: nextOverrides },
        `✅ Updated prompt for ${item.command}`
      )
    } else {
      const nextCustom = (config.customCommands || []).map((c) =>
        c.key === item.key
          ? {
              ...c,
              label: cleanLabel,
              icon: editIcon.trim() || '✨',
              description: editDesc.trim(),
              promptDirective: cleanPrompt,
            }
          : c
      )
      await persistConfig(
        { ...config, customCommands: nextCustom },
        `✅ Updated custom command "${item.command}"`
      )
    }

    setEditingKey(null)
    setEditError(null)
  }

  const handleResetSingleCommand = async (item: BookCommandPromptConfigItem) => {
    const nextOverrides = { ...(config.overrides || {}) }
    delete nextOverrides[item.key]
    await persistConfig(
      { ...config, overrides: nextOverrides },
      `↺ Restored default prompt for ${item.command}`
    )
    if (editingKey === item.key) {
      const def = defaultByKey.get(item.key)
      if (def) {
        setEditLabel(def.label)
        setEditIcon(def.icon)
        setEditDesc(def.description)
        setEditAliases(def.aliases.join(', '))
        setEditPrompt(def.promptDirective)
      }
      setEditingKey(null)
    }
  }

  const handleDeleteCustomCommand = async (item: BookCommandPromptConfigItem) => {
    const nextCustom = (config.customCommands || []).filter((c) => c.key !== item.key)
    await persistConfig(
      { ...config, customCommands: nextCustom },
      `🗑️ Deleted custom command "${item.command}"`
    )
  }

  const handleAddCustomCommand = async (e: React.FormEvent) => {
    e.preventDefault()
    const rawKey = newKey
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '')
    const cleanLabel = newLabel.trim()
    const cleanPrompt = newPrompt.trim()

    if (!rawKey) {
      setAddError('Please enter a command key (letters/numbers/hyphens, e.g. flashcards).')
      return
    }
    if (items.some((i) => i.key.toLowerCase() === rawKey || i.key.toLowerCase() === `${newCategory}:${rawKey}`)) {
      setAddError(`A command with key "${rawKey}" already exists. Choose a unique key.`)
      return
    }
    if (!cleanLabel) {
      setAddError('Please enter a short display label for the HUD button.')
      return
    }
    if (!cleanPrompt) {
      setAddError('Please enter the prompt instruction that should be sent to the AI.')
      return
    }

    const nextCustom = [
      ...(config.customCommands || []),
      {
        key: rawKey,
        category: newCategory,
        label: cleanLabel,
        icon: newIcon.trim() || (newCategory === 'summarize' ? '📝' : newCategory === 'explain' ? '💡' : '✨'),
        description: newDesc.trim() || `Custom ${newCategory} command`,
        promptDirective: cleanPrompt,
      },
    ]

    await persistConfig(
      { ...config, customCommands: nextCustom },
      `✨ Added command "${newCategory === 'general' ? `/chapter ${rawKey}` : `/chapter ${newCategory}:${rawKey}`}"`
    )

    setNewKey('')
    setNewLabel('')
    setNewDesc('')
    setNewPrompt('')
    setAddError(null)
  }

  const handleResetAll = async () => {
    if (!confirmResetAll) {
      setConfirmResetAll(true)
      return
    }
    if (!window.electron?.resetBookCommandConfig) return
    const res = await window.electron.resetBookCommandConfig()
    if (res?.success) {
      setConfig(res.config)
      setDefaults(res.defaults)
      setItems(res.items)
      setEditingKey(null)
      setConfirmResetAll(false)
      onNotify('↺ All BookView chat command prompts restored to factory defaults.')
    }
  }

  const getCategoryColor = (cat: BookCommandCategory) => {
    switch (cat) {
      case 'summarize':
        return { border: 'rgba(16, 185, 129, 0.38)', bg: 'rgba(16, 185, 129, 0.12)', text: '#34d399' }
      case 'explain':
        return { border: 'rgba(245, 158, 11, 0.42)', bg: 'rgba(245, 158, 11, 0.12)', text: '#fbbf24' }
      default:
        return { border: 'rgba(168, 85, 247, 0.4)', bg: 'rgba(168, 85, 247, 0.12)', text: '#d8b4fe' }
    }
  }

  const sanitizedPreviewKey =
    newKey
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '') || '<key>'

  return (
    <div className="pane-modal-backdrop" onClick={onClose}>
      <div
        className="pane-modal-container ask-ai-template-modal"
        style={{ width: '760px', maxWidth: '96vw', maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title-group">
            <div
              className="modal-icon-badge"
              style={{
                background: 'linear-gradient(135deg, #059669, #2563eb)',
                color: '#ffffff',
              }}
            >
              <Terminal size={18} />
            </div>
            <div>
              <h3 className="modal-title">BookView Chat Commands — Prompt Configurator</h3>
              <p className="modal-subtitle">
                Configure the exact prompt sent for each <code>/chapter</code>, <code>/page</code>, and <code>@macro</code> command ({customizedCount} customized)
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} title="Close (Esc)">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Filter Tabs + Search */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              flexWrap: 'wrap',
              paddingBottom: '8px',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              {(
                [
                  { id: 'all', label: `All (${items.length})`, icon: <Wrench size={12} /> },
                  {
                    id: 'summarize',
                    label: `Summarize (${items.filter((i) => i.category === 'summarize').length})`,
                    icon: <FileText size={12} />,
                  },
                  {
                    id: 'explain',
                    label: `Explain (${items.filter((i) => i.category === 'explain').length})`,
                    icon: <Lightbulb size={12} />,
                  },
                  {
                    id: 'general',
                    label: `Utilities (${items.filter((i) => i.category === 'general').length})`,
                    icon: <Sparkles size={12} />,
                  },
                ] as const
              ).map((tab) => {
                const isActive = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '5px 10px',
                      borderRadius: '6px',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: isActive
                        ? '1px solid rgba(16, 185, 129, 0.55)'
                        : '1px solid rgba(255, 255, 255, 0.1)',
                      background: isActive ? 'rgba(16, 185, 129, 0.16)' : 'rgba(255, 255, 255, 0.04)',
                      color: isActive ? '#34d399' : '#cbd5e1',
                    }}
                  >
                    {tab.icon}
                    <span>{tab.label}</span>
                  </button>
                )
              })}
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: '#090d16',
                border: '1px solid rgba(255,255,255,0.14)',
                borderRadius: '6px',
                padding: '4px 9px',
                minWidth: '210px',
              }}
            >
              <Search size={13} style={{ color: '#64748b' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter commands or prompts..."
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#f1f5f9',
                  fontSize: '12px',
                  width: '100%',
                }}
              />
            </div>
          </div>

          {/* Commands List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {loading && items.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '12.5px' }}>
                Loading BookView command configuration...
              </div>
            ) : filteredItems.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '12.5px' }}>
                No matching commands found.
              </div>
            ) : (
              filteredItems.map((item) => {
                const isModified = item.isBuiltIn && Boolean(config.overrides?.[item.key])
                const isEditing = editingKey === item.key
                const catStyle = getCategoryColor(item.category)

                if (isEditing) {
                  return (
                    <div
                      key={item.key}
                      className="source-item-card editing-card"
                      style={{
                        padding: '12px 14px',
                        border: '1px solid rgba(16, 185, 129, 0.5)',
                        flexDirection: 'column',
                        alignItems: 'stretch',
                        gap: '10px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <code
                            style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              background: catStyle.bg,
                              border: `1px solid ${catStyle.border}`,
                              color: catStyle.text,
                              fontSize: '12px',
                              fontWeight: 700,
                            }}
                          >
                            {item.command}
                          </code>
                          <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>Editing Command Prompt</span>
                        </div>
                        {item.isBuiltIn ? (
                          <span className="source-preset-pill">Built-in Command</span>
                        ) : (
                          <span className="source-preset-pill" style={{ borderColor: 'rgba(168,85,247,0.4)', color: '#d8b4fe' }}>
                            Custom Command
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr 1.4fr', gap: '8px' }}>
                        <div className="edit-field">
                          <label>Icon</label>
                          <input
                            type="text"
                            value={editIcon}
                            onChange={(e) => setEditIcon(e.target.value)}
                            maxLength={4}
                            style={{ textAlign: 'center' }}
                          />
                        </div>
                        <div className="edit-field">
                          <label>HUD Button Label</label>
                          <input
                            type="text"
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            placeholder="e.g. Deep Dive"
                          />
                        </div>
                        <div className="edit-field">
                          <label>Short Description</label>
                          <input
                            type="text"
                            value={editDesc}
                            onChange={(e) => setEditDesc(e.target.value)}
                            placeholder="Brief tooltip description"
                          />
                        </div>
                      </div>

                      {item.isBuiltIn && item.key.includes(':') && (
                        <div className="edit-field">
                          <label>
                            Trigger Aliases <span style={{ color: '#64748b', fontWeight: 400 }}>(comma-separated shorthand flags)</span>
                          </label>
                          <input
                            type="text"
                            value={editAliases}
                            onChange={(e) => setEditAliases(e.target.value)}
                            placeholder="e.g. deep, detailed, technical"
                          />
                        </div>
                      )}

                      <div className="edit-field">
                        <label>
                          Prompt Directive{' '}
                          <span style={{ color: '#94a3b8', fontWeight: 400 }}>
                            (Workbench automatically appends the live BookView chapter/page snapshot below this directive)
                          </span>
                        </label>
                        <textarea
                          rows={6}
                          value={editPrompt}
                          onChange={(e) => setEditPrompt(e.target.value)}
                          style={{
                            width: '100%',
                            backgroundColor: '#090d16',
                            border: '1px solid rgba(255,255,255,0.16)',
                            borderRadius: '6px',
                            padding: '9px 10px',
                            color: '#f1f5f9',
                            fontSize: '12px',
                            lineHeight: 1.45,
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
                        {item.isBuiltIn ? (
                          <button
                            type="button"
                            className="btn-edit-reset"
                            onClick={() => handleResetSingleCommand(item)}
                            title="Restore factory default prompt for this command"
                          >
                            <RotateCcw size={12} />
                            <span>Reset to Default</span>
                          </button>
                        ) : (
                          <div />
                        )}
                        <div className="edit-actions-right">
                          <button
                            type="button"
                            className="btn-edit-cancel"
                            onClick={() => {
                              setEditingKey(null)
                              setEditError(null)
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="btn-edit-save"
                            onClick={() => handleSaveEdit(item)}
                          >
                            <Check size={12} />
                            <span>Save Command</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                }

                return (
                  <div
                    key={item.key}
                    className={`source-item-card ${isModified ? 'active-card' : ''}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      gap: '10px',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                        <code
                          style={{
                            padding: '1px 7px',
                            borderRadius: '4px',
                            background: catStyle.bg,
                            border: `1px solid ${catStyle.border}`,
                            color: catStyle.text,
                            fontSize: '11.5px',
                            fontWeight: 700,
                          }}
                        >
                          {item.command}
                        </code>
                        <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#f1f5f9' }}>
                          {item.icon} {item.label}
                        </span>
                        {isModified && (
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              padding: '1px 6px',
                              borderRadius: '999px',
                              background: 'rgba(245, 158, 11, 0.16)',
                              border: '1px solid rgba(245, 158, 11, 0.4)',
                              color: '#fbbf24',
                            }}
                          >
                            Customized
                          </span>
                        )}
                        {!item.isBuiltIn && (
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              padding: '1px 6px',
                              borderRadius: '999px',
                              background: 'rgba(168, 85, 247, 0.16)',
                              border: '1px solid rgba(168, 85, 247, 0.4)',
                              color: '#d8b4fe',
                            }}
                          >
                            Custom
                          </span>
                        )}
                      </div>

                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                        {item.description}
                        {item.aliases.length > 0 && (
                          <span style={{ color: '#64748b', marginLeft: '8px' }}>
                            Aliases: {item.aliases.map((a) => `:${a}`).join(', ')}
                          </span>
                        )}
                      </span>

                      <code
                        style={{
                          fontSize: '10.5px',
                          color: '#64748b',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: 'block',
                          marginTop: '1px',
                        }}
                      >
                        {item.promptDirective.replace(/\n+/g, ' ')}
                      </code>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                      {onRunCommand && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose()
                            onRunCommand(item.command)
                          }}
                          title={`Run "${item.command}" on the active BookView chapter now`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 8px',
                            borderRadius: '5px',
                            background: 'rgba(59, 130, 246, 0.14)',
                            border: '1px solid rgba(59, 130, 246, 0.35)',
                            color: '#93c5fd',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          <Play size={10} />
                          <span>Run</span>
                        </button>
                      )}

                      <button
                        type="button"
                        className="source-action-btn"
                        onClick={() => handleStartEdit(item)}
                        title={`Edit prompt for ${item.command}`}
                      >
                        <Pencil size={12} />
                      </button>

                      {isModified && (
                        <button
                          type="button"
                          className="source-action-btn"
                          onClick={() => handleResetSingleCommand(item)}
                          title={`Reset ${item.command} to default`}
                        >
                          <RotateCcw size={12} />
                        </button>
                      )}

                      {!item.isBuiltIn && (
                        <button
                          type="button"
                          className="source-action-btn delete-btn"
                          onClick={() => handleDeleteCustomCommand(item)}
                          title={`Delete ${item.command}`}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Add Custom Command Section */}
          <div className="add-source-section">
            <h4 className="section-heading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <Plus size={14} className="heading-icon text-emerald" />
                <span>Add Custom Chat Command</span>
              </span>
              <code style={{ fontSize: '11px', color: '#34d399', fontWeight: 500 }}>
                Invoke as: {newCategory === 'general' ? `/chapter ${sanitizedPreviewKey}` : `/chapter ${newCategory}:${sanitizedPreviewKey}`}
              </code>
            </h4>

            <form onSubmit={handleAddCustomCommand} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 60px 1fr', gap: '8px' }}>
                <input
                  type="text"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="Command key (e.g. flashcards)"
                  className="source-input"
                />
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as BookCommandCategory)}
                  className="source-input"
                  style={{ padding: '0 8px' }}
                >
                  <option value="explain">Explain</option>
                  <option value="summarize">Summarize</option>
                  <option value="general">Utility</option>
                </select>
                <input
                  type="text"
                  value={newIcon}
                  onChange={(e) => setNewIcon(e.target.value)}
                  maxLength={4}
                  placeholder="✨"
                  className="source-input"
                  style={{ textAlign: 'center' }}
                />
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="HUD Button Label (e.g. Flashcards)"
                  className="source-input"
                />
              </div>

              <input
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Short description (e.g. Generates Anki Q&A flashcards for this section)"
                className="source-input"
              />

              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <textarea
                  rows={3}
                  value={newPrompt}
                  onChange={(e) => setNewPrompt(e.target.value)}
                  placeholder="Prompt directive sent before the BookView content..."
                  className="source-input"
                  style={{ flex: 1, padding: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: '12px', resize: 'vertical' }}
                />
                <button type="submit" className="btn-add-source" style={{ whiteSpace: 'nowrap', height: '38px' }}>
                  <Plus size={14} />
                  <span>Add Command</span>
                </button>
              </div>

              {addError && (
                <div className="error-message-box">
                  <span>{addError}</span>
                </div>
              )}
            </form>
          </div>

          {/* Material Classification & Page Design Extraction Settings */}
          <div
            className="add-source-section"
            style={{
              background: 'rgba(16, 185, 129, 0.05)',
              borderColor: 'rgba(16, 185, 129, 0.25)',
            }}
          >
            <button
              type="button"
              onClick={() => setShowDesignPanel((v) => !v)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'transparent',
                border: 'none',
                color: '#f1f5f9',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '12.5px', fontWeight: 600 }}>
                <Layers size={14} className="text-emerald" />
                <span>Material Classification &amp; Page Design Context</span>
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#94a3b8' }}>
                <span>{designDraft.includeDesignSummary ? 'Active' : 'Minimal'}</span>
                {showDesignPanel ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
            </button>

            {showDesignPanel && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11.5px', color: '#cbd5e1' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '7px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={designDraft.includeDesignSummary}
                      onChange={(e) => setDesignDraft((d) => ({ ...d, includeDesignSummary: e.target.checked }))}
                    />
                    <span>Include Material &amp; Page Structure Map</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '7px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={designDraft.preserveMarkdownStructure}
                      onChange={(e) => setDesignDraft((d) => ({ ...d, preserveMarkdownStructure: e.target.checked }))}
                    />
                    <span>Preserve Headings, Tables &amp; Code Fences</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '7px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={designDraft.includeFigureCaptions}
                      onChange={(e) => setDesignDraft((d) => ({ ...d, includeFigureCaptions: e.target.checked }))}
                    />
                    <span>Include Diagram &amp; Chart Captions</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '7px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={designDraft.includeVideoTranscript}
                      onChange={(e) => setDesignDraft((d) => ({ ...d, includeVideoTranscript: e.target.checked }))}
                    />
                    <span>Include Video Timestamps &amp; Transcripts</span>
                  </label>
                </div>

                <div className="edit-field">
                  <label>
                    Page Design Guidance Note <span style={{ color: '#64748b', fontWeight: 400 }}>(Included with extracted material when Map is enabled)</span>
                  </label>
                  <textarea
                    rows={3}
                    value={designDraft.designGuidancePrompt}
                    onChange={(e) => setDesignDraft((d) => ({ ...d, designGuidancePrompt: e.target.value }))}
                    style={{
                      width: '100%',
                      backgroundColor: '#090d16',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: '6px',
                      padding: '8px',
                      color: '#f1f5f9',
                      fontSize: '11.5px',
                      fontFamily: 'var(--font-mono)',
                      resize: 'vertical',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn-edit-reset"
                    onClick={async () => {
                      setDesignDraft(DEFAULT_MODAL_PAGE_DESIGN)
                      await persistConfig(
                        { ...config, pageDesign: DEFAULT_MODAL_PAGE_DESIGN },
                        '↺ Restored default Material & Page Design settings.'
                      )
                    }}
                  >
                    <RotateCcw size={12} />
                    <span>Reset Design Defaults</span>
                  </button>
                  <button
                    type="button"
                    className="btn-edit-save"
                    onClick={async () => {
                      await persistConfig(
                        { ...config, pageDesign: designDraft },
                        '✅ Saved Material & Page Design settings.'
                      )
                    }}
                  >
                    <Check size={12} />
                    <span>Save Design Settings</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          <button
            type="button"
            className="btn-edit-reset"
            onClick={handleResetAll}
            style={{
              borderColor: confirmResetAll ? 'rgba(239, 68, 68, 0.55)' : undefined,
              color: confirmResetAll ? '#fca5a5' : undefined,
            }}
          >
            <RotateCcw size={12} />
            <span>{confirmResetAll ? 'Click again to confirm Reset All' : 'Reset All to Defaults'}</span>
          </button>

          <button className="btn-primary-done" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

