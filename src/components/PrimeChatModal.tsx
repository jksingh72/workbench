import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Zap,
  X,
  Check,
  Copy,
  BookOpen,
  Layers,
  ShieldCheck,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Cpu,
  Eye,
} from 'lucide-react'
import { LLMProvider, ToolGroup, PrimingOptions } from '../types/electron'

interface PrimeChatModalProps {
  isOpen: boolean
  onClose: () => void
  onNotify: (msg: string) => void
  customInstructions: string
  onSaveCustomInstructions: (instructions: string) => void
  activeDirectory: string
  onSuccess?: () => void
}

const PROVIDERS: Array<{
  id: LLMProvider
  name: string
  subtitle: string
  badge: string
  accentColor: string
}> = [
  {
    id: 'perplexity',
    name: 'Perplexity',
    subtitle: 'Ultra-compact (<2.5k chars) for Perplexity search limit',
    badge: 'Query Limit Guard',
    accentColor: '#22b8cf',
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    subtitle: '10-file upload ceiling guardrail & single-shot inspect_folder',
    badge: 'Upload Ceiling Safe',
    accentColor: '#10a37f',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    subtitle: 'High-signal typed signatures without redundant schemas',
    badge: 'Concise Struct',
    accentColor: '#3b82f6',
  },
  {
    id: 'claude',
    name: 'Claude',
    subtitle: 'Full semantic specification & hierarchical multi-step execution',
    badge: 'Full Hierarchy',
    accentColor: '#d97706',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    subtitle: 'Clean markdown protocol with explicit JSON parameter templates',
    badge: 'Direct Protocol',
    accentColor: '#8b5cf6',
  },
  {
    id: 'generic',
    name: 'Generic / Local',
    subtitle: 'Universal standard specification compatible with any LLM',
    badge: 'Universal',
    accentColor: '#94a3b8',
  },
]

export const PrimeChatModal: React.FC<PrimeChatModalProps> = ({
  isOpen,
  onClose,
  onNotify,
  customInstructions,
  onSaveCustomInstructions,
  activeDirectory,
  onSuccess,
}) => {
  const [provider, setProvider] = useState<LLMProvider>('generic')
  const [detectedProvider, setDetectedProvider] = useState<LLMProvider>('generic')
  const [groups, setGroups] = useState<ToolGroup[]>([])
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set())
  const [instructions, setInstructions] = useState<string>(customInstructions || '')
  const [previewPrompt, setPreviewPrompt] = useState<string>('')
  const [charCount, setCharCount] = useState<number>(0)
  const [tokenEstimate, setTokenEstimate] = useState<number>(0)
  const [showPreview, setShowPreview] = useState<boolean>(false)
  const [isPriming, setIsPriming] = useState<boolean>(false)
  const [copied, setCopied] = useState<boolean>(false)
  const [activePreset, setActivePreset] = useState<'custom' | 'books' | 'full' | 'minimal'>('books')

  // Load initial available groups & detected provider
  useEffect(() => {
    if (!isOpen) return

    let isMounted = true

    const init = async () => {
      try {
        const preview = await window.electron?.getPrimingPreview?.()
        if (!isMounted || !preview) return

        const detected = preview.detectedProvider || 'generic'
        setDetectedProvider(detected)
        setProvider(detected)

        const available = preview.availableGroups || []
        setGroups(available)

        // Load saved or default selected groups
        let initialGroups = new Set(available.filter((g) => g.defaultSelected).map((g) => g.id))
        try {
          const saved = localStorage.getItem('workbench:action-selected-groups')
          if (saved) {
            const parsed = JSON.parse(saved)
            if (Array.isArray(parsed) && parsed.length > 0) {
              initialGroups = new Set(parsed)
            }
          }
        } catch (_) {}
        setSelectedGroupIds(initialGroups)

        setPreviewPrompt(preview.prompt || '')
        setCharCount(preview.charCount || 0)
        setTokenEstimate(preview.tokenEstimate || 0)
      } catch (err) {
        console.error('Failed to initialize priming preview:', err)
      }
    }

    init()

    return () => {
      isMounted = false
    }
  }, [isOpen])

  // Refresh preview whenever provider, selected groups, or instructions change
  const refreshPreview = useCallback(
    async (p: LLMProvider, sel: Set<string>, inst: string) => {
      try {
        const res = await window.electron?.getPrimingPreview?.({
          provider: p,
          selectedGroups: Array.from(sel),
          customInstructions: inst.trim(),
        })
        if (res) {
          setPreviewPrompt(res.prompt || '')
          setCharCount(res.charCount || 0)
          setTokenEstimate(res.tokenEstimate || 0)
        }
      } catch (err) {
        console.error('Error refreshing preview:', err)
      }
    },
    []
  )

  const handleProviderChange = (newProvider: LLMProvider) => {
    setProvider(newProvider)
    refreshPreview(newProvider, selectedGroupIds, instructions)
  }

  const handleToggleGroup = (groupId: string) => {
    setActivePreset('custom')
    setSelectedGroupIds((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) {
        next.delete(groupId)
      } else {
        next.add(groupId)
      }
      refreshPreview(provider, next, instructions)
      return next
    })
  }

  const handleInstructionsChange = (newInst: string) => {
    setInstructions(newInst)
    refreshPreview(provider, selectedGroupIds, newInst)
  }

  // Presets
  const applyPreset = (presetKey: 'books' | 'full' | 'minimal') => {
    setActivePreset(presetKey)
    let newSelected = new Set<string>()

    if (presetKey === 'books') {
      // Core + Books & Docs + MCP Fetch (if present)
      newSelected = new Set(['core', 'books'])
      if (groups.some((g) => g.id === 'mcp_fetch')) {
        newSelected.add('mcp_fetch')
      }
    } else if (presetKey === 'full') {
      // All groups
      newSelected = new Set(groups.map((g) => g.id))
    } else if (presetKey === 'minimal') {
      // Core only
      newSelected = new Set(['core'])
    }

    setSelectedGroupIds(newSelected)
    refreshPreview(provider, newSelected, instructions)
  }

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(previewPrompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      onNotify('📋 Prompt guide copied to clipboard!')
    } catch (_) {
      onNotify('⚠️ Failed to copy to clipboard')
    }
  }

  const handleSaveDefaults = () => {
    const trimmedInst = instructions.trim()
    onSaveCustomInstructions(trimmedInst)
    const selectedArr = Array.from(selectedGroupIds)
    try {
      localStorage.setItem('workbench:action-selected-groups', JSON.stringify(selectedArr))
      localStorage.setItem('workbench:action-custom-instructions', trimmedInst)
    } catch (_) {}
    onNotify('💾 Saved prompt settings as default for 1-Click Priming!')
    onClose()
  }

  const handlePrimeChat = async () => {
    setIsPriming(true)
    try {
      const trimmedInst = instructions.trim()
      onSaveCustomInstructions(trimmedInst)

      const selectedArr = Array.from(selectedGroupIds)
      try {
        localStorage.setItem('workbench:action-selected-groups', JSON.stringify(selectedArr))
        localStorage.setItem('workbench:action-custom-instructions', trimmedInst)
      } catch (_) {}

      const primingOptions: PrimingOptions = {
        provider,
        selectedGroups: selectedArr,
        customInstructions: trimmedInst,
      }

      const res = await window.electron?.setActionMode?.({
        enabled: true,
        customInstructions: trimmedInst,
        primeAI: true,
        primingOptions,
      })

      if (res?.success) {
        onNotify(`⚡ Primed chat successfully with ${provider.toUpperCase()} profile!`)
        onSuccess?.()
        onClose()
      } else {
        onNotify(`⚠️ Could not prime chat: ${res?.error || 'Chat input not ready'}`)
      }
    } catch (err: any) {
      onNotify(`⚠️ Priming error: ${err?.message || 'Unknown error'}`)
    } finally {
      setIsPriming(false)
    }
  }

  // Group classification
  const builtinGroups = useMemo(() => groups.filter((g) => !g.isMcp), [groups])
  const mcpGroups = useMemo(() => groups.filter((g) => g.isMcp), [groups])

  // Limit indicator calculations
  const isPerplexity = provider === 'perplexity'
  const isOverPerplexityLimit = isPerplexity && charCount > 3800
  const isNearPerplexityLimit = isPerplexity && charCount > 2800 && charCount <= 3800

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '20px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        style={{
          width: '840px',
          maxWidth: '96vw',
          maxHeight: '90vh',
          backgroundColor: '#0d1117',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '14px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'fadeIn 0.15s ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(245, 158, 11, 0.35)',
              }}
            >
              <Zap size={18} color="#000" />
            </div>
            <div>
              <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#f1f5f9', margin: 0 }}>
                Prime AI Chat with Modular Tools
              </h2>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
                Tailor action guides by LLM provider, select MCP tools, and add custom instructions
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div
          style={{
            padding: '20px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
          }}
        >
          {/* Section 1: LLM Provider Core Selection */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <label style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#cbd5e1' }}>
                1. Select AI Model Provider
              </label>
              {detectedProvider && (
                <span
                  style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    background: 'rgba(59, 130, 246, 0.15)',
                    color: '#60a5fa',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Cpu size={11} />
                  Auto-Detected in Tab: <strong style={{ textTransform: 'capitalize' }}>{detectedProvider}</strong>
                </span>
              )}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px',
              }}
            >
              {PROVIDERS.map((p) => {
                const isSelected = provider === p.id
                return (
                  <button
                    key={p.id}
                    onClick={() => handleProviderChange(p.id)}
                    style={{
                      background: isSelected ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                      border: `1px solid ${isSelected ? p.accentColor : 'rgba(255, 255, 255, 0.07)'}`,
                      borderRadius: '8px',
                      padding: '10px 12px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      position: 'relative',
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? `0 0 12px ${p.accentColor}25` : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: isSelected ? '#ffffff' : '#e2e8f0' }}>
                        {p.name}
                      </span>
                      <span
                        style={{
                          fontSize: '9px',
                          padding: '1px 6px',
                          borderRadius: '10px',
                          background: `${p.accentColor}20`,
                          color: p.accentColor,
                          fontWeight: 600,
                        }}
                      >
                        {p.badge}
                      </span>
                    </div>
                    <span style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.3 }}>
                      {p.subtitle}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Section 2: Size & Limit Health Indicator */}
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              background: isOverPerplexityLimit
                ? 'rgba(239, 68, 68, 0.12)'
                : isNearPerplexityLimit
                  ? 'rgba(245, 158, 11, 0.12)'
                  : 'rgba(16, 185, 129, 0.08)',
              border: `1px solid ${
                isOverPerplexityLimit
                  ? 'rgba(239, 68, 68, 0.4)'
                  : isNearPerplexityLimit
                    ? 'rgba(245, 158, 11, 0.35)'
                    : 'rgba(16, 185, 129, 0.25)'
              }`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {isOverPerplexityLimit ? (
                <AlertTriangle size={16} color="#ef4444" />
              ) : isNearPerplexityLimit ? (
                <AlertTriangle size={16} color="#f59e0b" />
              ) : (
                <ShieldCheck size={16} color="#10b981" />
              )}
              <span style={{ color: '#f1f5f9' }}>
                {isOverPerplexityLimit ? (
                  <strong style={{ color: '#ef4444' }}>Prompt exceeds Perplexity limits (~4,000 chars)! Deselect some MCP tools below.</strong>
                ) : isNearPerplexityLimit ? (
                  <strong style={{ color: '#f59e0b' }}>Approaching Perplexity limit ({charCount} / 4,000 chars).</strong>
                ) : isPerplexity ? (
                  <strong style={{ color: '#10b981' }}>Safe: Compact prompt ({charCount} chars) fits easily in Perplexity query window.</strong>
                ) : provider === 'chatgpt' ? (
                  <strong style={{ color: '#10a37f' }}>ChatGPT guardrails active: 10-file upload ceiling warning & inspect_folder guidance enabled.</strong>
                ) : (
                  <span>Prompt optimized for {provider.toUpperCase()} with active tool definitions.</span>
                )}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px', color: '#94a3b8' }}>
              <span>
                Length: <strong style={{ color: '#f1f5f9' }}>{charCount.toLocaleString()}</strong> chars
              </span>
              <span>•</span>
              <span>
                Tokens: <strong style={{ color: '#f1f5f9' }}>~{tokenEstimate.toLocaleString()}</strong> tokens
              </span>
            </div>
          </div>

          {/* Section 3: Presets Quick Bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#cbd5e1' }}>
              2. Tool Selection Presets
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => applyPreset('books')}
                style={{
                  padding: '5px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: activePreset === 'books' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                  color: activePreset === 'books' ? '#38bdf8' : '#cbd5e1',
                  border: `1px solid ${activePreset === 'books' ? 'rgba(56, 189, 248, 0.4)' : 'rgba(255, 255, 255, 0.08)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <BookOpen size={12} />
                Books & Docs (Optimal)
              </button>
              <button
                onClick={() => applyPreset('full')}
                style={{
                  padding: '5px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: activePreset === 'full' ? 'rgba(168, 85, 247, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                  color: activePreset === 'full' ? '#c084fc' : '#cbd5e1',
                  border: `1px solid ${activePreset === 'full' ? 'rgba(168, 85, 247, 0.4)' : 'rgba(255, 255, 255, 0.08)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <Layers size={12} />
                Full Dev & All MCP
              </button>
              <button
                onClick={() => applyPreset('minimal')}
                style={{
                  padding: '5px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: activePreset === 'minimal' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                  color: activePreset === 'minimal' ? '#fbbf24' : '#cbd5e1',
                  border: `1px solid ${activePreset === 'minimal' ? 'rgba(245, 158, 11, 0.4)' : 'rgba(255, 255, 255, 0.08)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <Zap size={12} />
                Minimal Safe
              </button>
            </div>
          </div>

          {/* Section 4: Built-in Tool Groups */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', marginBottom: '8px', textTransform: 'uppercase' }}>
              Workbench Built-in Action Groups
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
              {builtinGroups.map((group) => {
                const isChecked = selectedGroupIds.has(group.id)
                return (
                  <label
                    key={group.id}
                    onClick={() => handleToggleGroup(group.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      background: isChecked ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.015)',
                      border: `1px solid ${isChecked ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.05)'}`,
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}} // handled by parent onClick
                      style={{ marginTop: '2px', accentColor: '#f59e0b', cursor: 'pointer' }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: isChecked ? '#f8fafc' : '#94a3b8' }}>
                          {group.name}
                        </span>
                        <span style={{ fontSize: '10px', color: '#64748b' }}>
                          {group.actionIds.length} tools
                        </span>
                      </div>
                      <span style={{ fontSize: '11px', color: '#64748b', lineHeight: 1.3 }}>
                        {group.description}
                      </span>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>

          {/* Section 5: External MCP Servers */}
          {mcpGroups.length > 0 && (
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', marginBottom: '8px', textTransform: 'uppercase' }}>
                External MCP Servers (Model Context Protocol)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                {mcpGroups.map((group) => {
                  const isChecked = selectedGroupIds.has(group.id)
                  return (
                    <label
                      key={group.id}
                      onClick={() => handleToggleGroup(group.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        background: isChecked ? 'rgba(168, 85, 247, 0.08)' : 'rgba(255, 255, 255, 0.015)',
                        border: `1px solid ${isChecked ? 'rgba(168, 85, 247, 0.35)' : 'rgba(255, 255, 255, 0.05)'}`,
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}} // handled by parent onClick
                        style={{ marginTop: '2px', accentColor: '#a855f7', cursor: 'pointer' }}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: isChecked ? '#f8fafc' : '#94a3b8' }}>
                            {group.name}
                          </span>
                          <span
                            style={{
                              fontSize: '9px',
                              padding: '1px 5px',
                              borderRadius: '4px',
                              background: 'rgba(168, 85, 247, 0.2)',
                              color: '#c084fc',
                              fontWeight: 600,
                            }}
                          >
                            MCP ({group.actionIds.length})
                          </span>
                        </div>
                        <span style={{ fontSize: '11px', color: '#64748b', lineHeight: 1.3 }}>
                          {group.description}
                        </span>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {/* Section 6: Custom User Instructions */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#cbd5e1' }}>
                3. Custom Instructions / Task Rules
              </label>
              <span style={{ fontSize: '11px', color: '#64748b' }}>
                Optional instructions injected directly into this prime session
              </span>
            </div>
            <textarea
              value={instructions}
              onChange={(e) => handleInstructionsChange(e.target.value)}
              placeholder="e.g. You are cataloging books. Group them by category. Ask for confirmation before moving files."
              rows={3}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#f1f5f9',
                fontSize: '12px',
                fontFamily: 'inherit',
                resize: 'vertical',
                outline: 'none',
              }}
            />
          </div>

          {/* Section 7: Live Prompt Preview Accordion */}
          <div
            style={{
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '8px',
              overflow: 'hidden',
              background: 'rgba(0, 0, 0, 0.25)',
            }}
          >
            <div
              onClick={() => setShowPreview(!showPreview)}
              style={{
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Eye size={14} color="#94a3b8" />
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0' }}>
                  Live Prompt Guide Preview
                </span>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  ({charCount.toLocaleString()} chars)
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleCopyPrompt()
                  }}
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#cbd5e1',
                    fontSize: '11px',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  {copied ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                  {copied ? 'Copied' : 'Copy Preview'}
                </button>
                {showPreview ? <ChevronUp size={16} color="#94a3b8" /> : <ChevronDown size={16} color="#94a3b8" />}
              </div>
            </div>

            {showPreview && (
              <div
                style={{
                  maxHeight: '220px',
                  overflowY: 'auto',
                  padding: '12px 14px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                  background: '#070a0f',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono, monospace)',
                  color: '#94a3b8',
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.45,
                }}
              >
                {previewPrompt}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(0, 0, 0, 0.3)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#94a3b8' }}>
            <span>Target Folder:</span>
            <code
              style={{
                color: '#38bdf8',
                background: 'rgba(56, 189, 248, 0.1)',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '11px',
              }}
            >
              {activeDirectory || 'Current Workspace'}
            </code>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={onClose}
              disabled={isPriming}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#94a3b8',
                padding: '8px 14px',
                borderRadius: '6px',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>

            <button
              onClick={handleCopyPrompt}
              disabled={isPriming}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#e2e8f0',
                padding: '8px 14px',
                borderRadius: '6px',
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy Prompt'}
            </button>

            <button
              onClick={handleSaveDefaults}
              disabled={isPriming}
              title="Save selected tool groups and instructions as default for 1-Click Priming"
              style={{
                background: 'rgba(59, 130, 246, 0.12)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                color: '#60a5fa',
                padding: '8px 14px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>💾</span>
              <span>Save as Default</span>
            </button>

            <button
              onClick={handlePrimeChat}
              disabled={isPriming}
              style={{
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                border: 'none',
                color: '#000000',
                padding: '8px 18px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: isPriming ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 10px rgba(245, 158, 11, 0.4)',
                opacity: isPriming ? 0.7 : 1,
              }}
            >
              <Zap size={14} color="#000000" fill="#000000" />
              {isPriming ? 'Priming Chat...' : '⚡ Prime Chat Now'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
