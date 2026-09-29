import React, { useState, useEffect } from 'react'
import {
  Zap,
  X,
  Folder,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Code2
} from 'lucide-react'

interface ActionModeModalProps {
  isOpen: boolean
  onClose: () => void
  actionMode: boolean
  onToggleActionMode: () => void
  customInstructions: string
  onSaveCustomInstructions: (instructions: string) => void
  activeDirectory: string
  onNotify: (msg: string) => void
}

export const ActionModeModal: React.FC<ActionModeModalProps> = ({
  isOpen,
  onClose,
  actionMode,
  onToggleActionMode,
  customInstructions,
  onSaveCustomInstructions,
  activeDirectory,
  onNotify,
}) => {
  const [instructions, setInstructions] = useState(customInstructions)
  const [fullPrompt, setFullPrompt] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [isRePriming, setIsRePriming] = useState(false)

  useEffect(() => {
    setInstructions(customInstructions)
  }, [customInstructions, isOpen])

  // Fetch live prompt preview whenever instructions or activeDirectory change
  useEffect(() => {
    if (!isOpen) return
    let active = true

    const fetchPrompt = async () => {
      try {
        const p = await window.electron?.getActionPrompt?.({
          targetPane: 'book',
          customInstructions: instructions,
        })
        if (active && p) {
          setFullPrompt(p)
        }
      } catch (_) {}
    }

    fetchPrompt()
    return () => {
      active = false
    }
  }, [isOpen, instructions, activeDirectory])

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleCopyPrompt = () => {
    if (!fullPrompt) return
    navigator.clipboard.writeText(fullPrompt)
    setCopied(true)
    onNotify('📋 Full Action Prompt copied to clipboard!')
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSave = () => {
    onSaveCustomInstructions(instructions.trim())
    onNotify('💾 Action Mode instructions saved!')
    onClose()
  }

  const handleReset = () => {
    setInstructions('')
  }

  const handleRePrimeAI = async () => {
    setIsRePriming(true)
    try {
      const trimmed = instructions.trim()
      onSaveCustomInstructions(trimmed)
      const res = await window.electron?.setActionMode?.({
        enabled: true,
        customInstructions: trimmed,
      })
      if (res?.success) {
        onNotify('⚡ AI re-primed with updated instructions! (Prompt bubble hidden)')
      } else {
        onNotify('⚠️ Failed to re-prime AI: ' + (res?.error || 'Unknown error'))
      }
    } catch (err: any) {
      onNotify('⚠️ Error re-priming AI: ' + (err.message || 'Unknown error'))
    } finally {
      setIsRePriming(false)
      onClose()
    }
  }

  return (
    <div className="pane-modal-backdrop" onClick={onClose}>
      <div
        className="pane-modal-container action-mode-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '640px', width: '92%' }}
      >
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="modal-icon-badge" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399' }}>
              <Zap size={18} />
            </div>
            <div>
              <h3 className="modal-title">⚡ Action Mode & System Prompt</h3>
              <p className="modal-subtitle">
                Configure automated local filesystem actions and customize prompt rules for ChatGPT/Claude.
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} title="Close dialog">
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '72vh', overflowY: 'auto' }}>
          
          {/* Active Directory & Mode Status Card */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '6px',
            fontSize: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
              <Folder size={14} className="text-cyan" style={{ flexShrink: 0 }} />
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Active Working Directory:</span>
                <span style={{ color: '#e2e8f0', fontWeight: 600, fontFamily: 'monospace', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={activeDirectory}>
                  {activeDirectory || 'Documents (Default)'}
                </span>
              </div>
            </div>

            <button
              onClick={onToggleActionMode}
              className={`clip-note-btn ${actionMode ? 'active' : ''}`}
              style={{
                background: actionMode ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                borderColor: actionMode ? 'rgba(16, 185, 129, 0.5)' : 'rgba(255, 255, 255, 0.15)',
                color: actionMode ? '#34d399' : '#94a3b8',
                fontWeight: 600,
                fontSize: '11px',
                padding: '4px 10px',
              }}
              title="Toggle Action Mode ON / OFF"
            >
              <Zap size={11} className={actionMode ? 'fill-emerald animate-pulse' : ''} />
              <span>{actionMode ? 'Action Mode: ON' : 'Action Mode: OFF'}</span>
            </button>
          </div>

          {/* Custom Instructions Textarea */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={13} className="text-amber" />
                Custom Instructions & Coding Rules:
              </label>
              {instructions && (
                <button
                  onClick={handleReset}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    fontSize: '11px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    cursor: 'pointer',
                    padding: 0
                  }}
                  title="Clear custom instructions"
                >
                  <RotateCcw size={10} /> Reset
                </button>
              )}
            </div>
            <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>
              These rules are automatically injected into ChatGPT/Claude whenever Action Mode is enabled.
            </p>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Always write code in TypeScript. Create tests alongside components using Vitest. Follow Clean Architecture style. Never delete existing files without asking."
              rows={4}
              style={{
                width: '100%',
                background: 'rgba(0, 0, 0, 0.35)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '6px',
                color: '#f8fafc',
                fontSize: '12px',
                padding: '8px 10px',
                fontFamily: 'inherit',
                resize: 'vertical',
                outline: 'none',
              }}
            />
          </div>

          {/* Collapsible Prompt Preview */}
          <div style={{
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '6px',
            overflow: 'hidden',
            background: 'rgba(0, 0, 0, 0.2)'
          }}>
            <button
              onClick={() => setShowPreview(!showPreview)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: 'none',
                color: '#cbd5e1',
                fontSize: '12px',
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Code2 size={13} className="text-cyan" />
                <span style={{ fontWeight: 600 }}>Preview Full System Prompt Guide</span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>({fullPrompt.length} chars)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {showPreview ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </div>
            </button>

            {showPreview && (
              <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <pre style={{
                  margin: 0,
                  fontSize: '11px',
                  lineHeight: '1.45',
                  maxHeight: '180px',
                  overflowY: 'auto',
                  fontFamily: 'monospace',
                  color: '#94a3b8',
                  background: 'rgba(0, 0, 0, 0.4)',
                  padding: '8px',
                  borderRadius: '4px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'
                }}>
                  {fullPrompt}
                </pre>
                <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={handleCopyPrompt}
                    className="clip-note-btn"
                    style={{ fontSize: '11px', padding: '3px 8px' }}
                  >
                    {copied ? <Check size={11} className="text-emerald" /> : <Copy size={11} />}
                    <span>{copied ? 'Copied!' : 'Copy Full Prompt'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Modal Footer */}
        <div className="modal-footer" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <button
            onClick={handleCopyPrompt}
            className="clip-note-btn"
            style={{ fontSize: '11px', padding: '5px 10px', background: 'transparent', borderColor: 'rgba(255, 255, 255, 0.15)', color: '#94a3b8' }}
          >
            {copied ? <Check size={12} className="text-emerald" /> : <Copy size={12} />}
            <span>{copied ? 'Copied' : 'Copy Prompt'}</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={onClose}
              className="modal-cancel-btn"
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#cbd5e1',
                padding: '5px 12px',
                borderRadius: '4px',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>

            {actionMode && (
              <button
                onClick={handleRePrimeAI}
                disabled={isRePriming}
                style={{
                  background: 'rgba(16, 185, 129, 0.2)',
                  border: '1px solid rgba(16, 185, 129, 0.5)',
                  color: '#34d399',
                  padding: '5px 12px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
                title="Send updated instructions to AI immediately and hide bubble"
              >
                <Zap size={12} className={isRePriming ? 'animate-spin' : 'fill-emerald'} />
                <span>{isRePriming ? 'Priming...' : 'Re-Prime AI'}</span>
              </button>
            )}

            <button
              onClick={handleSave}
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                border: 'none',
                color: '#fff',
                padding: '5px 14px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <Check size={12} />
              <span>Save Changes</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
