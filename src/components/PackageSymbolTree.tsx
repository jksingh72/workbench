import React, { useState, useMemo } from 'react'
import {
  Search,
  Bot,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Package,
  Layers,
  Code,
  Tag,
  ExternalLink,
  Sparkles,
  FileText,
  AlertCircle,
} from 'lucide-react'
import { PackageAnalysisReport } from '../types/electron'

interface PackageSymbolTreeProps {
  report: PackageAnalysisReport | null
  onAskAI?: (prompt: string) => void
  onSendToNotes?: (markdown: string) => void
  onSelectQuickPackage?: (pkgName: string) => void
}

const POPULAR_PACKAGES = [
  'requests',
  'pydantic',
  'fastapi',
  'httpx',
  'rich',
  'typer',
  'flask',
  'numpy',
]

export const PackageSymbolTree: React.FC<PackageSymbolTreeProps> = ({
  report,
  onAskAI,
  onSendToNotes,
  onSelectQuickPackage,
}) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedModule, setSelectedModule] = useState<string>('')
  const [expandedClasses, setExpandedClasses] = useState<Record<string, boolean>>({})
  const [expandedMethods, setExpandedMethods] = useState<Record<string, boolean>>({})
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const toggleClass = (className: string) => {
    setExpandedClasses((prev) => ({ ...prev, [className]: !prev[className] }))
  }

  const toggleMethod = (methodKey: string) => {
    setExpandedMethods((prev) => ({ ...prev, [methodKey]: !prev[methodKey] }))
  }

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  // Filter symbols based on search query and selected submodule
  const filteredData = useMemo(() => {
    if (!report) return null
    const q = searchQuery.toLowerCase().trim()

    let clsList = report.classes || []
    let fnList = report.functions || []
    let constList = report.constants || []

    if (selectedModule) {
      clsList = clsList.filter(
        (c) => c.module === selectedModule || c.module.endsWith(`.${selectedModule}`)
      )
      fnList = fnList.filter(
        (f) => f.module === selectedModule || f.module.endsWith(`.${selectedModule}`)
      )
    }

    if (q) {
      clsList = clsList.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.module && c.module.toLowerCase().includes(q)) ||
          (c.docstring && c.docstring.toLowerCase().includes(q)) ||
          c.methods.some((m) => m.name.toLowerCase().includes(q))
      )

      fnList = fnList.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          (f.module && f.module.toLowerCase().includes(q)) ||
          (f.docstring && f.docstring.toLowerCase().includes(q)) ||
          f.signature.toLowerCase().includes(q)
      )

      constList = constList.filter(
        (k) => k.name.toLowerCase().includes(q) || k.value.toLowerCase().includes(q)
      )
    }

    return {
      classes: clsList,
      functions: fnList,
      constants: constList,
    }
  }, [report, searchQuery, selectedModule])

  // Handle Exporting entire analysis report to Note Pane
  const handleExportAllToNotes = () => {
    if (!report || !onSendToNotes) return
    const md: string[] = []
    md.push(`# Package Analysis: ${report.package} (v${report.metadata?.version || 'unknown'})`)
    if (report.metadata?.summary) md.push(`> ${report.metadata.summary}\n`)
    if (report.metadata?.author) md.push(`- **Author:** ${report.metadata.author}`)
    if (report.metadata?.license) md.push(`- **License:** ${report.metadata.license}`)
    if (report.metadata?.dependencies?.length) {
      md.push(`- **Dependencies:** ${report.metadata.dependencies.join(', ')}`)
    }
    md.push('\n## Public Classes')
    for (const c of report.classes || []) {
      md.push(`### \`class ${c.name}\``)
      if (c.docstring) md.push(c.docstring)
      if (c.methods.length) {
        md.push('**Methods:**')
        for (const m of c.methods) {
          md.push(`- \`${m.signature}\``)
        }
      }
      md.push('')
    }
    md.push('## Public Functions')
    for (const f of report.functions || []) {
      md.push(`### \`${f.signature}\``)
      if (f.docstring) md.push(f.docstring)
      md.push('')
    }
    onSendToNotes(md.join('\n'))
  }

  if (!report) {
    return (
      <div className="symbol-empty-state">
        <Package size={36} className="empty-icon" />
        <h4 className="empty-title">No Package Analyzed Yet</h4>
        <p className="empty-subtitle">
          Type any package name above and click <strong>"Install &amp; Analyze"</strong>, or choose a popular library:
        </p>
        <div className="quick-package-tags">
          {POPULAR_PACKAGES.map((pkg) => (
            <button
              key={pkg}
              type="button"
              className="quick-pkg-btn"
              onClick={() => onSelectQuickPackage?.(pkg)}
            >
              <Sparkles size={11} />
              <span>{pkg}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  const { metadata } = report
  const classCount = filteredData?.classes.length || 0
  const funcCount = filteredData?.functions.length || 0
  const constCount = filteredData?.constants.length || 0

  return (
    <div className="symbol-tree-root">
      {/* Package Header Card */}
      <div className="package-meta-card">
        <div className="package-title-row">
          <div className="package-name-group">
            <Package size={18} className="pkg-icon" />
            <span className="package-main-name">{report.package}</span>
            <span className="package-version-badge">v{metadata?.version || '0.0.0'}</span>
            {metadata?.license && <span className="package-license-badge">{metadata.license}</span>}
          </div>

          <div className="package-meta-actions">
            {onSendToNotes && (
              <button
                type="button"
                className="meta-action-btn"
                onClick={handleExportAllToNotes}
                title="Export complete API analysis report to Notes"
              >
                <FileText size={12} />
                <span>Export to Notes</span>
              </button>
            )}

            {metadata?.homepage && (
              <a
                href={metadata.homepage}
                target="_blank"
                rel="noreferrer"
                className="meta-link-btn"
                title="View project homepage / PyPI"
              >
                <ExternalLink size={12} />
                <span>PyPI / Docs</span>
              </a>
            )}
          </div>
        </div>

        {metadata?.summary && <p className="package-summary-text">{metadata.summary}</p>}

        {metadata?.dependencies && metadata.dependencies.length > 0 && (
          <div className="package-deps-row">
            <span className="deps-label">Dependencies:</span>
            <div className="deps-list">
              {metadata.dependencies.slice(0, 8).map((dep, idx) => (
                <span key={idx} className="dep-tag">
                  {dep}
                </span>
              ))}
              {metadata.dependencies.length > 8 && (
                <span className="dep-tag dep-overflow">+{metadata.dependencies.length - 8} more</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Symbol Search & Filter Bar */}
      <div className="symbol-search-bar">
        <Search size={14} className="search-icon" />
        <input
          type="text"
          className="symbol-search-input"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter classes, methods, functions, or docstrings..."
        />
        <div className="symbol-counts-badge">
          <span>{classCount} classes</span>
          <span>•</span>
          <span>{funcCount} functions</span>
          {constCount > 0 && (
            <>
              <span>•</span>
              <span>{constCount} constants</span>
            </>
          )}
        </div>
      </div>

      {/* Submodules Filter Bar */}
      {report.modules && report.modules.length > 0 && (
        <div className="submodules-filter-bar">
          <span className="submodules-label">Submodules:</span>
          <div className="submodules-scroll-list">
            <button
              type="button"
              className={`submodule-filter-pill ${selectedModule === '' ? 'active' : ''}`}
              onClick={() => setSelectedModule('')}
            >
              All Modules ({report.classes.length + report.functions.length})
            </button>
            {report.modules.map((m) => {
              const fullMod = `${report.package}.${m.name}`
              const symCount =
                (report.classes || []).filter(
                  (c) => c.module === fullMod || c.module.endsWith(`.${m.name}`)
                ).length +
                (report.functions || []).filter(
                  (f) => f.module === fullMod || f.module.endsWith(`.${m.name}`)
                ).length
              return (
                <button
                  key={m.name}
                  type="button"
                  className={`submodule-filter-pill ${selectedModule === m.name ? 'active' : ''}`}
                  onClick={() => setSelectedModule(selectedModule === m.name ? '' : m.name)}
                  title={`Filter symbols in ${fullMod}`}
                >
                  <span>{m.name}</span>
                  {symCount > 0 && <span className="pill-count">{symCount}</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Main Symbols List */}
      <div className="symbol-tree-scroll">
        {/* Classes Section */}
        {filteredData && filteredData.classes.length > 0 && (
          <div className="symbol-section">
            <div className="section-header">
              <Layers size={14} className="section-icon" />
              <span>Classes ({filteredData.classes.length})</span>
            </div>

            <div className="symbol-items-list">
              {filteredData.classes.map((cls) => {
                const isExpanded = !!expandedClasses[cls.name]
                const modTag =
                  cls.module && cls.module !== report.package
                    ? cls.module.replace(`${report.package}.`, '')
                    : ''
                return (
                  <div key={`${cls.module || ''}_${cls.name}`} className="class-card">
                    <div className="class-header" onClick={() => toggleClass(cls.name)}>
                      <button type="button" className="expand-chevron-btn">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      <span className="class-keyword">class</span>
                      <span className="class-name">{cls.name}</span>
                      {cls.bases.length > 0 && (
                        <span className="class-bases">({cls.bases.join(', ')})</span>
                      )}
                      {modTag && <span className="symbol-module-badge">{modTag}</span>}
                      <span className="method-count-badge">{cls.methods.length} methods</span>

                      <div className="item-quick-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="item-btn"
                          onClick={() => copyToClipboard(`class ${cls.name}:`, `cls_${cls.name}`)}
                          title="Copy class declaration"
                        >
                          {copiedId === `cls_${cls.name}` ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
                        </button>
                        {onAskAI && (
                          <button
                            type="button"
                            className="item-btn item-ai-btn"
                            onClick={() =>
                              onAskAI(
                                `Please explain the Python class '${cls.name}' from package '${report.package}', its responsibilities, and provide an example of how to use it:\n\nClass Signature: class ${cls.name}(${cls.bases.join(', ')}):\nDocstring: ${cls.docstring}`
                              )
                            }
                            title="Ask AI to explain this class"
                          >
                            <Bot size={11} />
                            <span>Ask AI</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="class-body">
                        {cls.docstring && (
                          <pre className="symbol-docstring">{cls.docstring}</pre>
                        )}

                        <div className="methods-list">
                          {cls.methods.map((method) => {
                            const methodKey = `${cls.name}.${method.name}`
                            const isMethodOpen = !!expandedMethods[methodKey]
                            return (
                              <div key={method.name} className="method-item">
                                <div
                                  className="method-header"
                                  onClick={() => toggleMethod(methodKey)}
                                >
                                  <button type="button" className="expand-chevron-btn mini">
                                    {isMethodOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                  </button>
                                  <span className="method-sig">{method.signature}</span>

                                  <div
                                    className="item-quick-actions"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <button
                                      type="button"
                                      className="item-btn"
                                      onClick={() => copyToClipboard(method.signature, methodKey)}
                                      title="Copy method signature"
                                    >
                                      {copiedId === methodKey ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
                                    </button>
                                    {onAskAI && (
                                      <button
                                        type="button"
                                        className="item-btn item-ai-btn"
                                        onClick={() =>
                                          onAskAI(
                                            `Explain the method '${method.name}' of class '${cls.name}' in package '${report.package}':\n\nSignature: ${method.signature}\nDocstring: ${method.docstring}`
                                          )
                                        }
                                        title="Ask AI about this method"
                                      >
                                        <Bot size={11} />
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {isMethodOpen && method.docstring && (
                                  <pre className="symbol-docstring mini">{method.docstring}</pre>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Functions Section */}
        {filteredData && filteredData.functions.length > 0 && (
          <div className="symbol-section">
            <div className="section-header">
              <Code size={14} className="section-icon" />
              <span>Public Functions ({filteredData.functions.length})</span>
            </div>

            <div className="symbol-items-list">
              {filteredData.functions.map((fn) => {
                const fnKey = `fn_${fn.module || ''}_${fn.name}`
                const isOpen = !!expandedMethods[fnKey]
                const modTag =
                  fn.module && fn.module !== report.package
                    ? fn.module.replace(`${report.package}.`, '')
                    : ''
                return (
                  <div key={fnKey} className="function-card">
                    <div className="function-header" onClick={() => toggleMethod(fnKey)}>
                      <button type="button" className="expand-chevron-btn">
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      <span className="fn-keyword">def</span>
                      <span className="fn-sig">{fn.signature}</span>
                      {modTag && <span className="symbol-module-badge">{modTag}</span>}

                      <div className="item-quick-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="item-btn"
                          onClick={() => copyToClipboard(fn.signature, fnKey)}
                          title="Copy function signature"
                        >
                          {copiedId === fnKey ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
                        </button>
                        {onAskAI && (
                          <button
                            type="button"
                            className="item-btn item-ai-btn"
                            onClick={() =>
                              onAskAI(
                                `Explain the function '${fn.name}' in package '${report.package}', its arguments, return values, and give a code example:\n\nSignature: ${fn.signature}\nDocstring: ${fn.docstring}`
                              )
                            }
                            title="Ask AI to explain this function"
                          >
                            <Bot size={11} />
                            <span>Ask AI</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {isOpen && fn.docstring && (
                      <pre className="symbol-docstring">{fn.docstring}</pre>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Constants Section */}
        {filteredData && filteredData.constants.length > 0 && (
          <div className="symbol-section">
            <div className="section-header">
              <Tag size={14} className="section-icon" />
              <span>Constants &amp; Variables ({filteredData.constants.length})</span>
            </div>

            <div className="constants-grid">
              {filteredData.constants.map((c) => (
                <div key={c.name} className="const-item">
                  <span className="const-name">{c.name}</span>
                  <span className="const-type">({c.type})</span>
                  <span className="const-val">= {c.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty Notice State */}
        {filteredData &&
          filteredData.classes.length === 0 &&
          filteredData.functions.length === 0 &&
          filteredData.constants.length === 0 && (
            <div className="symbol-empty-notice">
              <AlertCircle size={28} className="empty-notice-icon" />
              <h4>No Direct Symbols Found for {report.package}</h4>
              <p>
                {searchQuery || selectedModule
                  ? `No symbols match "${searchQuery || selectedModule}". Try clearing the search query or selecting "All Modules".`
                  : `This package is structured as a top-level meta-package. Its core classes and components may reside in submodules or companion foundation packages.`}
              </p>
              {report.metadata?.dependencies && report.metadata.dependencies.length > 0 && (
                <div className="suggested-companions">
                  <span className="suggested-label">Try analyzing foundation companion packages:</span>
                  <div className="suggested-list">
                    {report.metadata.dependencies.slice(0, 6).map((dep, idx) => {
                      const clean = dep.split(/[=><~ ]/)[0]
                      return (
                        <button
                          key={idx}
                          type="button"
                          className="suggested-pkg-chip"
                          onClick={() => onSelectQuickPackage?.(clean)}
                          title={`Analyze ${clean}`}
                        >
                          <Sparkles size={11} />
                          <span>{clean}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
      </div>
    </div>
  )
}
