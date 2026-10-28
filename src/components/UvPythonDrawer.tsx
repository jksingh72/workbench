import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Terminal as TerminalIcon,
  Layers,
  Code2,
  X,
  Maximize2,
  Minimize2,
  Plus,
  Trash2,
  Zap,
  Package,
  Check,
  GripHorizontal,
} from 'lucide-react'
import { TerminalConsole } from './TerminalConsole'
import { PackageSymbolTree } from './PackageSymbolTree'
import { PythonPlayground } from './PythonPlayground'
import { UvEnvInfo, PackageAnalysisReport } from '../types/electron'

interface UvPythonDrawerProps {
  isOpen: boolean
  height: number
  onResizeHeight: (newHeight: number) => void
  onToggleOpen: () => void
  onNotify: (msg: string) => void
  onAskAI?: (prompt: string) => void
  onSendToNotes?: (markdown: string) => void
}

export const UvPythonDrawer: React.FC<UvPythonDrawerProps> = ({
  isOpen,
  height,
  onResizeHeight,
  onToggleOpen,
  onNotify,
  onAskAI,
  onSendToNotes,
}) => {
  const [activeTab, setActiveTab] = useState<'terminal' | 'symbols' | 'playground'>('terminal')
  const [envs, setEnvs] = useState<UvEnvInfo[]>([])
  const [activeEnvId, setActiveEnvId] = useState<string>('')
  const [uvInfo, setUvInfo] = useState<{
    available: boolean
    version?: string
    path?: string
    managedPythons?: string[]
  } | null>(null)

  const [packageInput, setPackageInput] = useState('')
  const [report, setReport] = useState<PackageAnalysisReport | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [activeStreamId, setActiveStreamId] = useState<string>('')
  const [isCreatingEnv, setIsCreatingEnv] = useState(false)
  const [newEnvName, setNewEnvName] = useState('')
  const [isMaximized, setIsMaximized] = useState(false)
  const [prevHeight, setPrevHeight] = useState(height)

  const isDraggingRef = useRef(false)
  const startYRef = useRef(0)
  const startHeightRef = useRef(height)

  // Load uv detection status and environments on mount / open
  const refreshEnvs = useCallback(async () => {
    if (!window.electron?.uvListEnvs) return
    try {
      const list = await window.electron.uvListEnvs()
      setEnvs(list || [])
      if (list && list.length > 0 && !activeEnvId) {
        setActiveEnvId(list[0].id)
      }
    } catch (_) {}
  }, [activeEnvId])

  useEffect(() => {
    if (isOpen) {
      if (window.electron?.uvDetect) {
        window.electron.uvDetect().then((res) => {
          setUvInfo(res)
          if (!res.available) {
            onNotify('⚠️ Astral uv not found on system PATH. Install uv to enable sandbox features.')
          }
        }).catch(() => {})
      }
      refreshEnvs()
    }
  }, [isOpen, onNotify, refreshEnvs])

  // Dragging horizontal splitter to resize height
  const handleSplitterPointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true
    startYRef.current = e.clientY
    startHeightRef.current = height
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handleSplitterPointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return
    const deltaY = startYRef.current - e.clientY // dragging up increases height
    const newHeight = Math.max(180, Math.min(window.innerHeight * 0.75, startHeightRef.current + deltaY))
    onResizeHeight(Math.round(newHeight))
  }

  const handleSplitterPointerUp = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return
    isDraggingRef.current = false
    try {
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    } catch (_) {}
  }

  const handleSplitterDoubleClick = () => {
    if (height > 400) {
      onResizeHeight(320)
    } else {
      onResizeHeight(560)
    }
  }

  const handleToggleMaximize = () => {
    if (!isMaximized) {
      setPrevHeight(height)
      onResizeHeight(Math.round(window.innerHeight * 0.72))
      setIsMaximized(true)
    } else {
      onResizeHeight(prevHeight || 320)
      setIsMaximized(false)
    }
  }

  // Handle "+ New Environment"
  const handleCreateNewEnv = async () => {
    if (!newEnvName.trim() || !window.electron?.uvCreateEnv) return
    const streamId = `create_${Date.now()}`
    setActiveStreamId(streamId)
    setIsProcessing(true)
    setActiveTab('terminal')

    try {
      const res = await window.electron.uvCreateEnv({ name: newEnvName.trim(), streamId })
      if (res.success && res.env) {
        onNotify(`✅ Created uv environment "${res.env.name}"`)
        await refreshEnvs()
        setActiveEnvId(res.env.id)
        setIsCreatingEnv(false)
        setNewEnvName('')
      } else {
        onNotify(`❌ Failed to create environment: ${res.error || 'Unknown error'}`)
      }
    } catch (e: any) {
      onNotify(`❌ Error: ${e.message}`)
    } finally {
      setIsProcessing(false)
    }
  }

  // Handle "Delete Environment"
  const handleDeleteActiveEnv = async () => {
    if (!activeEnvId || !window.electron?.uvDeleteEnv) return
    const current = envs.find((e) => e.id === activeEnvId)
    if (!current) return
    const confirmed = window.confirm(`Are you sure you want to delete environment "${current.name}" from disk?`)
    if (!confirmed) return

    try {
      const res = await window.electron.uvDeleteEnv({ envId: activeEnvId })
      if (res.success) {
        onNotify(`🗑️ Removed environment "${current.name}"`)
        const remaining = envs.filter((e) => e.id !== activeEnvId)
        setEnvs(remaining)
        setActiveEnvId(remaining[0]?.id || '')
        setReport(null)
      } else {
        onNotify(`❌ Failed to remove environment: ${res.error}`)
      }
    } catch (e: any) {
      onNotify(`❌ Error: ${e.message}`)
    }
  }

  // Handle "Install & Analyze" Package
  const handleInstallAndAnalyze = async (pkgToAnalyze?: string) => {
    const pkg = (pkgToAnalyze || packageInput).trim()
    if (!pkg) {
      onNotify('⚠️ Please enter a package name to analyze')
      return
    }

    if (!window.electron?.uvInstallPackage || !window.electron?.uvAnalyzePackage) return

    // Ensure we have an active environment, create default if none
    let targetEnvId = activeEnvId
    if (!targetEnvId) {
      if (envs.length > 0) {
        targetEnvId = envs[0].id
        setActiveEnvId(targetEnvId)
      } else if (window.electron.uvCreateEnv) {
        const streamId = `init_${Date.now()}`
        setActiveStreamId(streamId)
        setIsProcessing(true)
        const created = await window.electron.uvCreateEnv({ name: 'default', streamId })
        if (!created.success || !created.env) {
          onNotify(`❌ Failed to create default environment: ${created.error}`)
          setIsProcessing(false)
          return
        }
        targetEnvId = created.env.id
        await refreshEnvs()
        setActiveEnvId(targetEnvId)
      }
    }

    const streamId = `install_${Date.now()}`
    setActiveStreamId(streamId)
    setIsProcessing(true)
    setActiveTab('terminal')

    try {
      onNotify(`📦 Installing "${pkg}" via uv...`)
      const installRes = await window.electron.uvInstallPackage({
        envId: targetEnvId,
        packageSpec: pkg,
        streamId,
      })

      if (!installRes.success) {
        onNotify(`❌ Failed to install "${pkg}": ${installRes.error}`)
        setIsProcessing(false)
        return
      }

      onNotify(`🔍 Analyzing AST and APIs for "${pkg}"...`)
      const basePkgName = pkg.split(/[=><~ ]/)[0]
      const analyzeRes = await window.electron.uvAnalyzePackage({
        envId: targetEnvId,
        packageName: basePkgName,
        streamId,
      })

      if (analyzeRes.success && analyzeRes.report) {
        setReport(analyzeRes.report)
        setActiveTab('symbols')
        onNotify(`✅ Successfully analyzed "${basePkgName}"! Found ${analyzeRes.report.classes.length} classes and ${analyzeRes.report.functions.length} functions.`)
      } else {
        onNotify(`⚠️ Installation succeeded, but AST introspection returned: ${analyzeRes.error || 'No symbols found'}`)
      }
    } catch (e: any) {
      onNotify(`❌ Error during package analysis: ${e.message}`)
    } finally {
      setIsProcessing(false)
      refreshEnvs()
    }
  }

  // Handle Command Line Execution in Terminal
  const handleRunCommand = async (cmd: string) => {
    if (!activeEnvId || !window.electron?.uvRunCommand) return
    const streamId = `cmd_${Date.now()}`
    setActiveStreamId(streamId)
    setIsProcessing(true)
    try {
      await window.electron.uvRunCommand({ envId: activeEnvId, command: cmd, streamId })
    } catch (e: any) {
      onNotify(`❌ Command error: ${e.message}`)
    } finally {
      setIsProcessing(false)
    }
  }

  // Handle Python Code Execution in Playground
  const handleExecutePlaygroundCode = async (code: string) => {
    if (!activeEnvId || !window.electron?.uvExecuteCode) {
      return {
        success: false,
        output: '',
        stderr: 'No active environment available',
        exitCode: 1,
        executionTimeMs: 0,
        error: 'No active environment',
      }
    }
    const streamId = `code_${Date.now()}`
    setActiveStreamId(streamId)
    return await window.electron.uvExecuteCode({ envId: activeEnvId, code, streamId })
  }

  // Handle Kill Active Process
  const handleKillProcess = async () => {
    if (!activeStreamId || !window.electron?.uvKillProcess) return
    const res = await window.electron.uvKillProcess({ streamId: activeStreamId })
    if (res.success) {
      onNotify('⏹ Terminated running process')
      setIsProcessing(false)
    }
  }

  if (!isOpen) return null

  const activeEnv = envs.find((e) => e.id === activeEnvId)

  return (
    <div
      className="uv-drawer-container"
      style={{ height: `${height}px` }}
      data-testid="uv-python-drawer"
    >
      {/* Horizontal Drag Handle Splitter */}
      <div
        className="uv-drawer-splitter"
        onPointerDown={handleSplitterPointerDown}
        onPointerMove={handleSplitterPointerMove}
        onPointerUp={handleSplitterPointerUp}
        onDoubleClick={handleSplitterDoubleClick}
        title="Drag to resize drawer height (Double-click to snap)"
      >
        <div className="splitter-grip">
          <GripHorizontal size={14} />
        </div>
      </div>

      {/* Top Control Bar */}
      <div className="uv-drawer-header">
        <div className="uv-header-left">
          {/* Logo & Status Badge */}
          <div className="uv-brand">
            <span className="uv-python-logo">🐍</span>
            <span className="uv-title">uv Python Sandbox</span>
            {uvInfo?.version && (
              <span className="uv-version-pill" title={`uv path: ${uvInfo.path}`}>
                {uvInfo.version.split(' ')[1] || 'uv'}
              </span>
            )}
          </div>

          {/* Environment Selector Dropdown */}
          <div className="uv-env-selector-group">
            <label className="uv-env-label">Env:</label>
            {envs.length > 0 ? (
              <select
                className="uv-env-select"
                value={activeEnvId}
                onChange={(e) => setActiveEnvId(e.target.value)}
                disabled={isProcessing}
              >
                {envs.map((env) => (
                  <option key={env.id} value={env.id}>
                    {env.name} ({env.pythonVersion})
                  </option>
                ))}
              </select>
            ) : (
              <span className="no-envs-tag">No environments</span>
            )}

            {!isCreatingEnv ? (
              <button
                type="button"
                className="uv-env-icon-btn"
                onClick={() => setIsCreatingEnv(true)}
                title="Create a new isolated virtual environment"
              >
                <Plus size={13} />
                <span>New</span>
              </button>
            ) : (
              <div className="create-env-inline">
                <input
                  type="text"
                  className="create-env-input"
                  value={newEnvName}
                  onChange={(e) => setNewEnvName(e.target.value)}
                  placeholder="env_name..."
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateNewEnv()}
                  autoFocus
                />
                <button
                  type="button"
                  className="create-env-confirm-btn"
                  onClick={handleCreateNewEnv}
                  title="Create"
                >
                  <Check size={12} />
                </button>
                <button
                  type="button"
                  className="create-env-cancel-btn"
                  onClick={() => setIsCreatingEnv(false)}
                  title="Cancel"
                >
                  <X size={12} />
                </button>
              </div>
            )}

            {activeEnvId && (
              <button
                type="button"
                className="uv-env-icon-btn delete-btn"
                onClick={handleDeleteActiveEnv}
                title="Delete active environment"
                disabled={isProcessing}
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Center: Package Quick-Install & Analyze Input */}
        <div className="uv-header-center">
          <div className="uv-pkg-input-wrap">
            <Package size={13} className="pkg-input-icon" />
            <input
              type="text"
              className="uv-pkg-input"
              value={packageInput}
              onChange={(e) => setPackageInput(e.target.value)}
              placeholder="Package (e.g. requests, fastapi, pydantic)..."
              onKeyDown={(e) => e.key === 'Enter' && handleInstallAndAnalyze()}
              disabled={isProcessing}
            />
            <button
              type="button"
              className="uv-analyze-btn"
              onClick={() => handleInstallAndAnalyze()}
              disabled={isProcessing || !packageInput.trim()}
              title="Install via uv pip and extract AST symbols"
            >
              <Zap size={12} fill="currentColor" />
              <span>{isProcessing ? 'Working...' : 'Install & Analyze'}</span>
            </button>
          </div>
        </div>

        {/* Right: Tab Selectors & Window Controls */}
        <div className="uv-header-right">
          <div className="uv-tab-group">
            <button
              type="button"
              className={`uv-tab-btn ${activeTab === 'terminal' ? 'active' : ''}`}
              onClick={() => setActiveTab('terminal')}
              title="Live streaming terminal console"
            >
              <TerminalIcon size={12} />
              <span>Terminal</span>
            </button>

            <button
              type="button"
              className={`uv-tab-btn ${activeTab === 'symbols' ? 'active' : ''}`}
              onClick={() => setActiveTab('symbols')}
              title="Package AST & Symbol Explorer"
            >
              <Layers size={12} />
              <span>Symbol Tree</span>
              {report && <span className="tab-dot" />}
            </button>

            <button
              type="button"
              className={`uv-tab-btn ${activeTab === 'playground' ? 'active' : ''}`}
              onClick={() => setActiveTab('playground')}
              title="Interactive Python code execution"
            >
              <Code2 size={12} />
              <span>Playground</span>
            </button>
          </div>

          <div className="uv-window-controls">
            <button
              type="button"
              className="uv-win-btn"
              onClick={handleToggleMaximize}
              title={isMaximized ? 'Restore height' : 'Maximize height'}
            >
              {isMaximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>

            <button
              type="button"
              className="uv-win-btn close-btn"
              onClick={onToggleOpen}
              title="Close Python Drawer (Ctrl+`)"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Drawer Body Area */}
      <div className="uv-drawer-body">
        {activeTab === 'terminal' && (
          <TerminalConsole
            streamId={activeStreamId}
            isRunning={isProcessing}
            onRunCommand={handleRunCommand}
            onKillProcess={handleKillProcess}
            envName={activeEnv?.name || 'sandbox'}
          />
        )}

        {activeTab === 'symbols' && (
          <PackageSymbolTree
            report={report}
            onAskAI={onAskAI}
            onSendToNotes={onSendToNotes}
            onSelectQuickPackage={(pkg) => {
              setPackageInput(pkg)
              handleInstallAndAnalyze(pkg)
            }}
          />
        )}

        {activeTab === 'playground' && (
          <PythonPlayground
            envId={activeEnvId}
            packageName={report?.package || packageInput || 'sys'}
            onExecuteCode={handleExecutePlaygroundCode}
            onAskAI={onAskAI}
            onSendToNotes={onSendToNotes}
          />
        )}
      </div>
    </div>
  )
}
