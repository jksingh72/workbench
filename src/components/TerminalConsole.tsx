import React, { useState, useEffect, useRef } from 'react'
import {
  Terminal as TerminalIcon,
  Square,
  Trash2,
  Copy,
  Check,
  ArrowDown,
  CornerDownLeft,
} from 'lucide-react'
import { UvStreamMessage } from '../types/electron'

interface TerminalConsoleProps {
  streamId?: string
  isRunning: boolean
  onRunCommand: (command: string) => void
  onKillProcess: () => void
  envName?: string
}

// Lightweight ANSI-to-HTML parser for terminal color sequences
function parseAnsiToHtml(text: string): string {
  // Replace standard ANSI color sequences
  const colorMap: Record<string, string> = {
    '30': '#4b5563', // black
    '31': '#ef4444', // red
    '32': '#10b981', // green
    '33': '#f59e0b', // yellow
    '34': '#3b82f6', // blue
    '35': '#8b5cf6', // magenta
    '36': '#06b6d4', // cyan
    '37': '#e5e7eb', // white
    '90': '#6b7280', // bright black
    '91': '#f87171', // bright red
    '92': '#34d399', // bright green
    '93': '#fbbf24', // bright yellow
    '94': '#60a5fa', // bright blue
    '95': '#a78bfa', // bright magenta
    '96': '#22d3ee', // bright cyan
    '97': '#f9fafb', // bright white
  }

  // Escape HTML characters
  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Handle color resets and styles
  escaped = escaped.replace(/\x1b\[0?m/g, '</span>')
  escaped = escaped.replace(/\x1b\[1m/g, '<span style="font-weight:bold;">')
  escaped = escaped.replace(/\x1b\[(\d+)m/g, (_match, code) => {
    const color = colorMap[code]
    return color ? `<span style="color:${color};">` : ''
  })

  // Clean any remaining unhandled escape codes
  escaped = escaped.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')

  return escaped
}

export const TerminalConsole: React.FC<TerminalConsoleProps> = ({
  streamId,
  isRunning,
  onRunCommand,
  onKillProcess,
  envName = 'sandbox',
}) => {
  const [lines, setLines] = useState<Array<{ type: string; text: string; id: string }>>([
    {
      type: 'status',
      text: '🐍 Astral uv Terminal Console Initialized.\nIsolated virtual environment active. Output streams in real-time.\n',
      id: 'init',
    },
  ])
  const [commandInput, setCommandInput] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const [copied, setCopied] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Subscribe to real-time IPC stream data
  useEffect(() => {
    if (!window.electron?.onUvStreamData) return

    const unsubscribe = window.electron.onUvStreamData((msg: UvStreamMessage) => {
      // If a specific streamId is tracked, filter or include global streams
      if (!streamId || msg.streamId === streamId || msg.streamType === 'exit' || msg.streamType === 'status') {
        setLines((prev) => [
          ...prev,
          {
            type: msg.streamType,
            text: msg.chunk,
            id: `${Date.now()}_${Math.random()}`,
          },
        ])
      }
    })

    return () => {
      unsubscribe()
    }
  }, [streamId])

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [lines, autoScroll])

  const handleScroll = () => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 40
    setAutoScroll(isAtBottom)
  }

  const handleClear = () => {
    setLines([])
  }

  const handleCopy = () => {
    const fullText = lines.map((l) => l.text).join('')
    navigator.clipboard.writeText(fullText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = commandInput.trim()
    if (!trimmed) return

    setLines((prev) => [
      ...prev,
      {
        type: 'command',
        text: `\n$ ${trimmed}\n`,
        id: `${Date.now()}_cmd`,
      },
    ])
    onRunCommand(trimmed)
    setCommandInput('')
  }

  return (
    <div className="terminal-console-root">
      {/* Terminal Toolbar */}
      <div className="terminal-toolbar">
        <div className="terminal-left-info">
          <TerminalIcon size={14} className="terminal-icon" />
          <span className="terminal-title">uv shell</span>
          <span className="terminal-env-badge">({envName})</span>
          {isRunning && (
            <span className="terminal-running-indicator">
              <span className="running-dot" />
              <span>Running...</span>
            </span>
          )}
        </div>

        <div className="terminal-actions">
          {isRunning && (
            <button
              type="button"
              className="term-btn term-kill-btn"
              onClick={onKillProcess}
              title="Terminate current process (SIGINT/SIGTERM)"
            >
              <Square size={12} />
              <span>Kill</span>
            </button>
          )}

          <button
            type="button"
            className="term-btn"
            onClick={handleCopy}
            title="Copy terminal buffer to clipboard"
          >
            {copied ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>

          <button
            type="button"
            className="term-btn"
            onClick={handleClear}
            title="Clear terminal buffer"
          >
            <Trash2 size={12} />
            <span>Clear</span>
          </button>

          {!autoScroll && (
            <button
              type="button"
              className="term-btn term-scroll-btn"
              onClick={() => {
                setAutoScroll(true)
                if (scrollRef.current) {
                  scrollRef.current.scrollTop = scrollRef.current.scrollHeight
                }
              }}
              title="Scroll to latest output"
            >
              <ArrowDown size={12} />
              <span>Scroll to bottom</span>
            </button>
          )}
        </div>
      </div>

      {/* Terminal Screen / Log Viewer */}
      <div className="terminal-screen" ref={scrollRef} onScroll={handleScroll}>
        {lines.map((line) => {
          const htmlContent = parseAnsiToHtml(line.text)
          return (
            <span
              key={line.id}
              className={`term-line term-${line.type}`}
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
          )
        })}
      </div>

      {/* Terminal Command Input Bar */}
      <form className="terminal-input-bar" onSubmit={handleCommandSubmit}>
        <span className="prompt-symbol">$</span>
        <input
          type="text"
          className="terminal-cmd-input"
          value={commandInput}
          onChange={(e) => setCommandInput(e.target.value)}
          placeholder={`Run command in "${envName}" (e.g. uv pip list, uv run python -V)...`}
          disabled={isRunning}
        />
        <button
          type="submit"
          className="terminal-send-btn"
          disabled={isRunning || !commandInput.trim()}
          title="Execute command"
        >
          {isRunning ? <Square size={13} /> : <CornerDownLeft size={13} />}
        </button>
      </form>
    </div>
  )
}
