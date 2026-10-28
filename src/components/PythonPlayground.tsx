import React, { useState } from 'react'
import {
  Play,
  Square,
  Sparkles,
  Bot,
  FileText,
  Copy,
  Check,
  RotateCcw,
  Clock,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'

interface PythonPlaygroundProps {
  envId?: string
  packageName?: string
  onExecuteCode: (code: string) => Promise<{
    success: boolean
    output: string
    stderr?: string
    exitCode: number
    executionTimeMs: number
    error?: string
  }>
  onAskAI?: (prompt: string) => void
  onSendToNotes?: (markdown: string) => void
}

const TEMPLATES = [
  {
    name: 'Import & Version',
    getCode: (pkg: string) =>
      `import sys\nimport ${pkg}\n\nprint(f"Python: {sys.version}")\nprint(f"${pkg} version: {getattr(${pkg}, '__version__', 'unknown')}")\nprint(f"${pkg} location: {getattr(${pkg}, '__file__', 'built-in')}")`,
  },
  {
    name: 'Inspect Symbols',
    getCode: (pkg: string) =>
      `import ${pkg}\n\nsymbols = [s for s in dir(${pkg}) if not s.startswith("_")]\nprint(f"Public symbols in ${pkg} ({len(symbols)}):")\nfor s in symbols[:20]:\n    print("  •", s)\nif len(symbols) > 20:\n    print(f"  ... and {len(symbols)-20} more")`,
  },
  {
    name: 'Benchmark Speed',
    getCode: (pkg: string) =>
      `import time\nimport ${pkg}\n\nt0 = time.perf_counter()\n# Perform repetitive operations\nfor _ in range(1000):\n    _ = dir(${pkg})\nelapsed_ms = (time.perf_counter() - t0) * 1000\nprint(f"⏱️ 1,000 iterations completed in {elapsed_ms:.2f} ms")`,
  },
  {
    name: 'Assert & Test',
    getCode: (pkg: string) =>
      `import ${pkg}\n\nprint("Running verification checks...")\nassert ${pkg} is not None, "Package failed to load"\nprint("✅ Assertion passed: Package module is valid")`,
  },
]

export const PythonPlayground: React.FC<PythonPlaygroundProps> = ({
  packageName = 'sys',
  onExecuteCode,
  onAskAI,
  onSendToNotes,
}) => {
  const [code, setCode] = useState(() => TEMPLATES[0].getCode(packageName))
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState<{
    success: boolean
    output: string
    stderr?: string
    exitCode: number
    executionTimeMs: number
    error?: string
  } | null>(null)
  const [copied, setCopied] = useState(false)

  const handleRun = async () => {
    if (isRunning || !code.trim()) return
    setIsRunning(true)
    try {
      const res = await onExecuteCode(code)
      setResult(res)
    } finally {
      setIsRunning(false)
    }
  }

  // Handle Tab key in code editor
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const target = e.currentTarget
      const start = target.selectionStart
      const end = target.selectionEnd
      const newCode = code.substring(0, start) + '    ' + code.substring(end)
      setCode(newCode)
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 4
      }, 0)
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      handleRun()
    }
  }

  const handleApplyTemplate = (tmpl: (typeof TEMPLATES)[0]) => {
    setCode(tmpl.getCode(packageName || 'sys'))
  }

  const handleCopyOutput = () => {
    if (!result) return
    const text = [result.output, result.stderr].filter(Boolean).join('\n')
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleExportToNotes = () => {
    if (!onSendToNotes || !result) return
    const md = [
      `### Python Execution Snippet (${packageName})`,
      '```python',
      code,
      '```',
      '**Output:**',
      '```',
      result.output || result.stderr || 'No output',
      '```',
      `*Duration: ${result.executionTimeMs}ms | Exit Code: ${result.exitCode}*`,
    ].join('\n')
    onSendToNotes(md)
  }

  const handleDebugWithAI = () => {
    if (!onAskAI || !result) return
    onAskAI(
      `I ran the following Python code using package '${packageName}' and encountered an error:\n\n\`\`\`python\n${code}\n\`\`\`\n\nStderr / Error:\n\`\`\`\n${result.stderr || result.error}\n\`\`\`\n\nPlease explain why this happened and provide the corrected code.`
    )
  }

  return (
    <div className="playground-root">
      {/* Playground Left Column: Editor */}
      <div className="playground-editor-col">
        {/* Editor Toolbar */}
        <div className="playground-toolbar">
          <div className="template-chips">
            <span className="template-label">Templates:</span>
            {TEMPLATES.map((tmpl) => (
              <button
                key={tmpl.name}
                type="button"
                className="template-btn"
                onClick={() => handleApplyTemplate(tmpl)}
                title={`Load "${tmpl.name}" snippet`}
              >
                <Sparkles size={11} />
                <span>{tmpl.name}</span>
              </button>
            ))}
          </div>

          <div className="editor-actions">
            <button
              type="button"
              className="term-btn"
              onClick={() => setCode('')}
              title="Reset code"
            >
              <RotateCcw size={12} />
              <span>Reset</span>
            </button>
            <button
              type="button"
              className="run-code-btn"
              onClick={handleRun}
              disabled={isRunning || !code.trim()}
              title="Execute code in isolated uv sandbox (Ctrl+Enter)"
            >
              {isRunning ? <Square size={13} /> : <Play size={13} fill="currentColor" />}
              <span>{isRunning ? 'Running...' : 'Run (Ctrl+Enter)'}</span>
            </button>
          </div>
        </div>

        {/* Code Input Area */}
        <textarea
          className="playground-textarea"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="# Write Python code here to test against the isolated package sandbox..."
          spellCheck={false}
        />
      </div>

      {/* Playground Right Column: Output Viewer */}
      <div className="playground-output-col">
        <div className="output-header">
          <div className="output-status-group">
            <span className="output-title">Execution Result</span>
            {result && (
              <span className={`output-badge ${result.success ? 'badge-success' : 'badge-error'}`}>
                {result.success ? (
                  <CheckCircle2 size={12} />
                ) : (
                  <AlertCircle size={12} />
                )}
                <span>Exit {result.exitCode}</span>
              </span>
            )}
            {result && (
              <span className="output-time-badge">
                <Clock size={11} />
                <span>{result.executionTimeMs}ms</span>
              </span>
            )}
          </div>

          {result && (
            <div className="output-actions">
              <button
                type="button"
                className="term-btn"
                onClick={handleCopyOutput}
                title="Copy output to clipboard"
              >
                {copied ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>

              {onSendToNotes && (
                <button
                  type="button"
                  className="term-btn"
                  onClick={handleExportToNotes}
                  title="Send code and output to Note Pane"
                >
                  <FileText size={12} />
                  <span>To Notes</span>
                </button>
              )}

              {!result.success && onAskAI && (
                <button
                  type="button"
                  className="term-btn term-ai-debug-btn"
                  onClick={handleDebugWithAI}
                  title="Ask AI to diagnose and fix this error"
                >
                  <Bot size={12} />
                  <span>Debug with AI</span>
                </button>
              )}
            </div>
          )}
        </div>

        <div className="output-viewer-body">
          {!result && !isRunning && (
            <div className="output-placeholder">
              <Play size={24} className="placeholder-icon" />
              <span>Click "Run (Ctrl+Enter)" to execute code in the uv sandbox.</span>
            </div>
          )}

          {isRunning && (
            <div className="output-placeholder running">
              <div className="spinner" />
              <span>Executing script in isolated uv sandbox...</span>
            </div>
          )}

          {result && (
            <div className="output-logs">
              {result.output && (
                <pre className="stdout-block">{result.output}</pre>
              )}
              {result.stderr && (
                <pre className="stderr-block">{result.stderr}</pre>
              )}
              {!result.output && !result.stderr && (
                <span className="output-empty-note">(Process finished with no stdout or stderr output)</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
