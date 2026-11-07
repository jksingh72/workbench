import React, { useState, useEffect, useCallback } from 'react'
import {
  Server,
  Globe,
  Terminal,
  Plus,
  Trash2,
  RefreshCw,
  Check,
  X,
  Search,
  ExternalLink,
  Power,
  Pencil,
  KeyRound,
  ClipboardPaste,
  Layers,
  CheckCircle2,
  AlertCircle,
  Zap,
} from 'lucide-react'
import { McpServerInfo, McpServerConfig, McpOnlineServerResult } from '../types/electron'

export interface McpManagerModalProps {
  isOpen: boolean
  initialTab?: 'installed' | 'discover' | 'custom'
  onClose: () => void
  onNotify: (msg: string) => void
  onOpenPrimeChatModal?: () => void
}

const FALLBACK_CATALOG: McpOnlineServerResult[] = [
  {
    id: 'oreilly',
    displayName: "📚 MCP: O'Reilly Books",
    description: "Official O'Reilly Search MCP Server: Search O'Reilly books, chapters, and expert technical content.",
    transport: 'remote',
    url: 'https://api.oreilly.com/api/search/v1/mcp',
    command: 'npx',
    args: ['-y', 'mcp-remote', 'https://api.oreilly.com/api/search/v1/mcp'],
    publisher: "O'Reilly Media",
    homepage: 'https://www.oreilly.com',
    source: 'catalog',
    defaultSelected: true,
  },
  {
    id: 'fetch',
    displayName: '🌐 MCP: Web Fetch',
    description: 'Official MCP web fetch server to retrieve and convert web pages into markdown for LLMs.',
    transport: 'uvx',
    command: 'uvx',
    args: ['mcp-server-fetch'],
    publisher: 'Model Context Protocol',
    homepage: 'https://github.com/modelcontextprotocol/servers',
    source: 'catalog',
    defaultSelected: true,
  },
  {
    id: 'playwright',
    displayName: '🎭 MCP: Playwright Browser',
    description: 'Official Microsoft Playwright MCP server for browser automation, DOM snapshots, and web interaction.',
    transport: 'npx',
    command: 'npx',
    args: ['-y', '@playwright/mcp@latest'],
    publisher: 'Microsoft',
    homepage: 'https://github.com/microsoft/playwright-mcp',
    source: 'catalog',
    defaultSelected: false,
  },
  {
    id: 'memory',
    displayName: '🧠 MCP: Knowledge Graph Memory',
    description: 'Persistent memory system using a local knowledge graph so AI chats remember entities and relationships across sessions.',
    transport: 'npx',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    publisher: 'Model Context Protocol',
    homepage: 'https://github.com/modelcontextprotocol/servers',
    source: 'catalog',
    defaultSelected: false,
  },
  {
    id: 'sequential-thinking',
    displayName: '🧩 MCP: Sequential Thinking',
    description: 'Dynamic and reflective problem-solving tool through structured sequential thought chains.',
    transport: 'npx',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
    publisher: 'Model Context Protocol',
    homepage: 'https://github.com/modelcontextprotocol/servers',
    source: 'catalog',
    defaultSelected: false,
  },
  {
    id: 'sqlite',
    displayName: '🗄️ MCP: SQLite Database',
    description: 'Query, inspect schemas, and manage local SQLite database files.',
    transport: 'uvx',
    command: 'uvx',
    args: ['--with', 'mcp<2', 'mcp-server-sqlite', '--db-path', './workspace.db'],
    publisher: 'Model Context Protocol',
    homepage: 'https://github.com/modelcontextprotocol/servers',
    source: 'catalog',
    defaultSelected: false,
  },
  {
    id: 'postgres',
    displayName: '🐘 MCP: PostgreSQL Database',
    description: 'Read-only database inspection and schema querying for PostgreSQL databases.',
    transport: 'npx',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://localhost/mydb'],
    publisher: 'Model Context Protocol',
    homepage: 'https://github.com/modelcontextprotocol/servers',
    source: 'catalog',
    defaultSelected: false,
  },
  {
    id: 'github',
    displayName: '🐙 MCP: GitHub',
    description: 'Repository management, file operations, issue & PR creation, and code search via GitHub API.',
    transport: 'npx',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: {
      GITHUB_PERSONAL_ACCESS_TOKEN: 'YOUR_GITHUB_TOKEN_HERE',
    },
    requiredEnvKeys: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
    publisher: 'Model Context Protocol',
    homepage: 'https://github.com/modelcontextprotocol/servers',
    source: 'catalog',
    defaultSelected: false,
  },
  {
    id: 'brave_search',
    displayName: '🦁 MCP: Brave Web Search',
    description: "Web and local search using Brave's Search API.",
    transport: 'npx',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    env: {
      BRAVE_API_KEY: 'YOUR_BRAVE_API_KEY_HERE',
    },
    requiredEnvKeys: ['BRAVE_API_KEY'],
    publisher: 'Model Context Protocol',
    homepage: 'https://github.com/modelcontextprotocol/servers',
    source: 'catalog',
    defaultSelected: false,
  },
  {
    id: 'git',
    displayName: '🌿 MCP: Git Repository Tools',
    description: 'Tools to read, search, diff, commit, and inspect local Git repositories.',
    transport: 'uvx',
    command: 'uvx',
    args: ['mcp-server-git'],
    publisher: 'Model Context Protocol',
    homepage: 'https://github.com/modelcontextprotocol/servers',
    source: 'catalog',
    defaultSelected: false,
  },
  {
    id: 'time',
    displayName: '🕒 MCP: Time & Timezone',
    description: 'Time and timezone conversion capabilities using IANA timezone names.',
    transport: 'uvx',
    command: 'uvx',
    args: ['mcp-server-time'],
    publisher: 'Model Context Protocol',
    homepage: 'https://github.com/modelcontextprotocol/servers',
    source: 'catalog',
    defaultSelected: false,
  },
  {
    id: 'context7',
    displayName: '📖 MCP: Context7 Live Code Docs',
    description: 'Up-to-date, version-specific official documentation and code examples for thousands of libraries.',
    transport: 'npx',
    command: 'npx',
    args: ['-y', '@upstash/context7-mcp@latest'],
    publisher: 'Upstash',
    homepage: 'https://github.com/upstash/context7',
    source: 'catalog',
    defaultSelected: false,
  },
]

export const McpManagerModal: React.FC<McpManagerModalProps> = ({
  isOpen,
  initialTab = 'installed',
  onClose,
  onNotify,
  onOpenPrimeChatModal,
}) => {
  const [activeTab, setActiveTab] = useState<'installed' | 'discover' | 'custom'>(initialTab)
  const [servers, setServers] = useState<McpServerInfo[]>([])
  const [configPath, setConfigPath] = useState<string>('')
  const [isLoadingStatus, setIsLoadingStatus] = useState<boolean>(false)
  const [actionLoadingServer, setActionLoadingServer] = useState<string | null>(null)

  // Online Discovery state
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [onlineResults, setOnlineResults] = useState<McpOnlineServerResult[]>(FALLBACK_CATALOG)
  const [isSearchingOnline, setIsSearchingOnline] = useState<boolean>(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [installingId, setInstallingId] = useState<string | null>(null)

  // Add / Edit Form state
  const [isEditingExisting, setIsEditingExisting] = useState<boolean>(false)
  const [connectionType, setConnectionType] = useState<'local' | 'remote'>('local')
  const [serverKey, setServerKey] = useState<string>('')
  const [displayName, setDisplayName] = useState<string>('')
  const [description, setDescription] = useState<string>('')
  const [command, setCommand] = useState<string>('npx')
  const [argsText, setArgsText] = useState<string>('')
  const [remoteUrl, setRemoteUrl] = useState<string>('')
  const [authHeader, setAuthHeader] = useState<string>('')
  const [envRows, setEnvRows] = useState<Array<{ key: string; value: string }>>([])
  const [defaultSelected, setDefaultSelected] = useState<boolean>(true)
  const [enableImmediately, setEnableImmediately] = useState<boolean>(true)
  const [isSavingServer, setIsSavingServer] = useState<boolean>(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Smart Snippet Paste state
  const [rawSnippet, setRawSnippet] = useState<string>('')

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab)
    }
  }, [isOpen, initialTab])

  const mergeStatusWithConfig = useCallback(
    (statusList: McpServerInfo[], mcpServersMap?: Record<string, McpServerConfig>): McpServerInfo[] => {
      const merged = [...statusList]
      const seen = new Set(merged.map((s) => s.name.toLowerCase()))
      if (mcpServersMap && typeof mcpServersMap === 'object') {
        for (const [name, cfg] of Object.entries(mcpServersMap)) {
          if (!seen.has(name.toLowerCase())) {
            merged.push({
              name,
              displayName: cfg.displayName || `🔌 MCP: ${name}`,
              description: cfg.description,
              command: cfg.command || (cfg.url ? 'npx' : ''),
              args: cfg.args || (cfg.url ? ['-y', 'mcp-remote', cfg.url] : []),
              url: cfg.url,
              headers: cfg.headers,
              env: cfg.env,
              disabled: Boolean(cfg.disabled),
              defaultSelected: Boolean(cfg.defaultSelected),
              connected: false,
              toolCount: 0,
              tools: [],
              error: 'Click "Reload All" to connect newly added server',
            })
            seen.add(name.toLowerCase())
          }
        }
      }
      return merged
    },
    []
  )

  const loadServersAndConfig = useCallback(async () => {
    setIsLoadingStatus(true)
    try {
      const [statusRes, cfgRes] = await Promise.all([
        window.electron?.mcpGetStatus?.(),
        window.electron?.mcpGetConfig?.(),
      ])
      if (cfgRes?.path) {
        setConfigPath(cfgRes.path)
      }
      const baseStatus = Array.isArray(statusRes) ? statusRes : []
      const merged = mergeStatusWithConfig(baseStatus, cfgRes?.config?.mcpServers)
      setServers(merged)
    } catch (err) {
      console.error('Failed to load MCP status:', err)
    } finally {
      setIsLoadingStatus(false)
    }
  }, [mergeStatusWithConfig])

  // Direct renderer-side search fallback (queries workbench-mcp.json catalog + Official MCP Registry + NPM Registry)
  const searchOnlineDirect = useCallback(async (query: string): Promise<McpOnlineServerResult[]> => {
    const q = (query || '').trim().toLowerCase()
    let catalogItems: McpOnlineServerResult[] = FALLBACK_CATALOG

    try {
      const cfgRes = await window.electron?.mcpGetConfig?.()
      if (Array.isArray(cfgRes?.config?.catalog) && cfgRes.config.catalog.length > 0) {
        catalogItems = cfgRes.config.catalog.map((item) => ({
          ...item,
          source: item.source || 'catalog',
        }))
      }
    } catch {
      // Use FALLBACK_CATALOG
    }

    if (!q) {
      return catalogItems
    }

    // Topic alias expansion for quick-search chips
    const topicAliases: Record<string, string[]> = {
      database: ['database', 'sqlite', 'postgres', 'postgresql', 'sql', 'mysql', 'db', 'supabase', 'redis'],
      browser: ['browser', 'playwright', 'puppeteer', 'fetch', 'web', 'scrape'],
      docs: ['docs', 'context7', 'oreilly', 'documentation', 'fetch', 'markdown'],
      oreilly: ['oreilly', "o'reilly", 'books', 'learning'],
      memory: ['memory', 'knowledge', 'graph', 'thinking'],
    }
    const matchTerms = topicAliases[q] || [q]

    const matchedCatalog = catalogItems.filter((item) => {
      const haystack = `${item.id} ${item.displayName} ${item.description} ${item.publisher || ''}`.toLowerCase()
      return matchTerms.some((term) => haystack.includes(term))
    })

    const results: McpOnlineServerResult[] = [...matchedCatalog]
    const seenIds = new Set<string>(results.map((r) => r.id.toLowerCase()))

    // Query Official Model Context Protocol Registry + NPM Registry in parallel
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 6500)

    try {
      const [registryResp, npmResp] = await Promise.allSettled([
        fetch(`https://registry.modelcontextprotocol.io/v0.1/servers?search=${encodeURIComponent(q)}&limit=24`, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        }).then((r) => (r.ok ? r.json() : null)),
        fetch(
          `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(`mcp server ${q}`)}&size=24`,
          {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
          }
        ).then((r) => (r.ok ? r.json() : null)),
      ])

      // 1. Parse Official MCP Registry results
      if (registryResp.status === 'fulfilled' && registryResp.value) {
        const list = Array.isArray(registryResp.value.servers)
          ? registryResp.value.servers
          : Array.isArray(registryResp.value)
          ? registryResp.value
          : []

        for (const rawEntry of list) {
          const entry = rawEntry?.server || rawEntry
          const rawName: string = entry?.name || entry?.id || ''
          if (!rawName) continue

          const shortId = (rawName.split('/').pop() || rawName)
            .replace(/^mcp-server-/, '')
            .replace(/^server-/, '')
            .toLowerCase()
            .replace(/[^a-z0-9-_]/g, '-')

          if (!shortId || seenIds.has(shortId)) continue

          const remotes = Array.isArray(entry?.remotes) ? entry.remotes : []
          const packages = Array.isArray(entry?.packages) ? entry.packages : []
          const firstRemote = remotes.find((r: any) => r?.url)
          const npmPkg = packages.find(
            (p: any) => p?.registryType === 'npm' || p?.registry_name === 'npm' || p?.identifier
          )

          if (firstRemote?.url) {
            seenIds.add(shortId)
            results.push({
              id: shortId,
              displayName: `🌐 MCP: ${entry.title || shortId}`,
              description: entry.description || `Remote MCP server (${rawName})`,
              transport: 'remote',
              url: firstRemote.url,
              command: 'npx',
              args: ['-y', 'mcp-remote', firstRemote.url],
              publisher: rawName.split('/')[0] || 'MCP Registry',
              homepage: entry?.repository?.url || entry?.websiteUrl,
              source: 'mcp-registry',
              defaultSelected: false,
            })
          } else if (npmPkg?.identifier || npmPkg?.name) {
            const pkgId = npmPkg.identifier || npmPkg.name
            seenIds.add(shortId)
            results.push({
              id: shortId,
              displayName: `🔌 MCP: ${entry.title || shortId}`,
              description: entry.description || `MCP Server (${pkgId})`,
              transport: 'npx',
              command: 'npx',
              args: ['-y', pkgId],
              publisher: rawName.split('/')[0] || 'MCP Registry',
              homepage: entry?.repository?.url || entry?.websiteUrl,
              source: 'mcp-registry',
              defaultSelected: false,
            })
          }
        }
      }

      // 2. Parse NPM Registry results
      if (npmResp.status === 'fulfilled' && Array.isArray(npmResp.value?.objects)) {
        for (const obj of npmResp.value.objects) {
          const pkg = obj?.package
          const pkgName: string = pkg?.name || ''
          if (!pkgName) continue
          const lowerPkg = pkgName.toLowerCase()
          if (!lowerPkg.includes('mcp')) continue

          const shortId = (pkgName.split('/').pop() || pkgName)
            .replace(/^mcp-server-/, '')
            .replace(/^server-/, '')
            .replace(/-mcp-server$/, '')
            .replace(/-mcp$/, '')
            .toLowerCase()
            .replace(/[^a-z0-9-_]/g, '-')

          if (!shortId || seenIds.has(shortId)) continue
          seenIds.add(shortId)

          results.push({
            id: shortId,
            displayName: `📦 MCP: ${shortId}`,
            description: pkg.description || `NPM MCP server package ${pkgName}`,
            transport: 'npx',
            command: 'npx',
            args: ['-y', pkgName],
            publisher: pkg?.publisher?.username || 'npm',
            homepage: pkg?.links?.homepage || pkg?.links?.repository || pkg?.links?.npm,
            source: 'npm',
            defaultSelected: false,
          })
        }
      }
    } catch (err: any) {
      console.warn('Direct online search warning:', err)
    } finally {
      clearTimeout(timeoutId)
    }

    return results
  }, [])

  const runOnlineSearch = useCallback(
    async (q: string) => {
      setIsSearchingOnline(true)
      setSearchError(null)
      try {
        // 1. Try Electron Main IPC handler first if available
        if (window.electron?.mcpSearchOnline) {
          try {
            const ipcRes = await window.electron.mcpSearchOnline(q)
            if (Array.isArray(ipcRes?.results) && ipcRes.results.length > 0) {
              setOnlineResults(ipcRes.results)
              return
            }
          } catch {
            // Fall through to direct search when main process hasn't restarted yet
          }
        }

        // 2. Direct fallback search (Catalog + Official MCP Registry + NPM Registry)
        const directResults = await searchOnlineDirect(q)
        setOnlineResults(directResults)
      } catch (err: any) {
        console.error('Online MCP search error:', err)
        setSearchError(err?.message || 'Failed to search online registries')
      } finally {
        setIsSearchingOnline(false)
      }
    },
    [searchOnlineDirect]
  )

  // Upsert helper with automatic fallback to mcpGetConfig + mcpSaveConfig
  const upsertServerWithFallback = useCallback(
    async (serverName: string, cfg: McpServerConfig) => {
      // 1. Try newly added IPC handler if registered in main process
      if (window.electron?.mcpUpsertServer) {
        try {
          const res = await window.electron.mcpUpsertServer(serverName, cfg)
          if (res && typeof res === 'object') {
            return res
          }
        } catch {
          // Main process predates workbench:mcp-upsert-server; fall back to mcpSaveConfig
        }
      }

      // 2. Fallback: read workbench-mcp.json via mcpGetConfig, insert server, and call mcpSaveConfig
      const cfgRes = await window.electron?.mcpGetConfig?.()
      const currentFileConfig = cfgRes?.config || { mcpServers: {} }
      if (!currentFileConfig.mcpServers || typeof currentFileConfig.mcpServers !== 'object') {
        currentFileConfig.mcpServers = {}
      }

      const normalized: McpServerConfig = {
        ...cfg,
        command: cfg.command || (cfg.url ? 'npx' : 'npx'),
        args:
          Array.isArray(cfg.args) && cfg.args.length > 0
            ? cfg.args
            : cfg.url
            ? ['-y', 'mcp-remote', cfg.url]
            : [],
      }

      currentFileConfig.mcpServers[serverName] = normalized
      const saveRes = await window.electron?.mcpSaveConfig?.(currentFileConfig)
      const statusList = Array.isArray(saveRes?.status) ? saveRes.status : []
      const mergedStatus = mergeStatusWithConfig(statusList, currentFileConfig.mcpServers)
      const serverInfo = mergedStatus.find((s) => s.name === serverName)

      return {
        success: Boolean(saveRes?.success && (serverInfo?.connected || normalized.disabled)),
        error: (saveRes as any)?.error || serverInfo?.error,
        status: mergedStatus,
        serverInfo,
      }
    },
    [mergeStatusWithConfig]
  )

  useEffect(() => {
    if (!isOpen) return
    loadServersAndConfig()
    runOnlineSearch(searchQuery)
  }, [isOpen, loadServersAndConfig]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const resetForm = () => {
    setIsEditingExisting(false)
    setConnectionType('local')
    setServerKey('')
    setDisplayName('')
    setDescription('')
    setCommand('npx')
    setArgsText('')
    setRemoteUrl('')
    setAuthHeader('')
    setEnvRows([])
    setDefaultSelected(true)
    setEnableImmediately(true)
    setFormError(null)
    setRawSnippet('')
  }

  const handleEditServer = (srv: McpServerInfo) => {
    setIsEditingExisting(true)
    const isRemote = Boolean(srv.url || (srv.args && srv.args.includes('mcp-remote')))
    setConnectionType(isRemote ? 'remote' : 'local')
    setServerKey(srv.name)
    setDisplayName(srv.displayName || `🔌 MCP: ${srv.name}`)
    setDescription(srv.description || '')

    if (isRemote) {
      const detectedUrl =
        srv.url ||
        srv.args.find((a) => a.startsWith('http://') || a.startsWith('https://')) ||
        ''
      setRemoteUrl(detectedUrl)
      const authVal = srv.headers?.Authorization || ''
      setAuthHeader(authVal)
      setCommand('npx')
      setArgsText('')
    } else {
      setCommand(srv.command || 'npx')
      setArgsText((srv.args || []).join(' '))
      setRemoteUrl('')
      setAuthHeader('')
    }

    const envEntries = Object.entries(srv.env || {}).map(([key, value]) => ({ key, value: String(value) }))
    setEnvRows(envEntries)
    setDefaultSelected(Boolean(srv.defaultSelected))
    setEnableImmediately(!srv.disabled)
    setFormError(null)
    setActiveTab('custom')
  }

  const handleToggleServer = async (srv: McpServerInfo) => {
    setActionLoadingServer(srv.name)
    try {
      const nextDisabled = !srv.disabled
      const res = await window.electron?.mcpConfigureServer?.(srv.name, { disabled: nextDisabled })
      if (res?.status) {
        const cfgRes = await window.electron?.mcpGetConfig?.()
        setServers(mergeStatusWithConfig(res.status, cfgRes?.config?.mcpServers))
      }
      if (res?.success) {
        onNotify(nextDisabled ? `⏸️ Disabled MCP server "${srv.name}"` : `🟢 Enabled & connected "${srv.name}"!`)
      } else {
        onNotify(`⚠️ Could not start "${srv.name}": ${res?.error || 'Check command or API keys'}`)
      }
    } catch (err: any) {
      onNotify(`⚠️ Error toggling "${srv.name}": ${err?.message || ''}`)
    } finally {
      setActionLoadingServer(null)
    }
  }

  const handleToggleDefaultSelected = async (srv: McpServerInfo) => {
    const nextDefault = !srv.defaultSelected
    try {
      const res = await window.electron?.mcpConfigureServer?.(srv.name, { defaultSelected: nextDefault })
      if (res?.status) {
        const cfgRes = await window.electron?.mcpGetConfig?.()
        setServers(mergeStatusWithConfig(res.status, cfgRes?.config?.mcpServers))
      } else {
        setServers((prev) => prev.map((s) => (s.name === srv.name ? { ...s, defaultSelected: nextDefault } : s)))
      }
      onNotify(
        nextDefault
          ? `✅ "${srv.displayName || srv.name}" will now be selected by default in Prime AI Chat`
          : `⚪ "${srv.displayName || srv.name}" omitted by default in Prime AI Chat`
      )
    } catch (err: any) {
      onNotify(`⚠️ Error updating default selection: ${err?.message || ''}`)
    }
  }

  const handleRemoveServer = async (serverName: string) => {
    if (!window.confirm(`Remove MCP server "${serverName}" from workbench-mcp.json?`)) return
    setActionLoadingServer(serverName)
    try {
      const res = await window.electron?.mcpRemoveServer?.(serverName)
      if (res?.status) {
        const cfgRes = await window.electron?.mcpGetConfig?.()
        setServers(mergeStatusWithConfig(res.status, cfgRes?.config?.mcpServers))
      }
      onNotify(`🗑️ Removed MCP server "${serverName}"`)
    } catch (err: any) {
      onNotify(`⚠️ Failed to remove "${serverName}": ${err?.message || ''}`)
    } finally {
      setActionLoadingServer(null)
    }
  }

  const handleReloadAll = async () => {
    setIsLoadingStatus(true)
    try {
      const [res, cfgRes] = await Promise.all([
        window.electron?.mcpReload?.(),
        window.electron?.mcpGetConfig?.(),
      ])
      if (res?.status) {
        const merged = mergeStatusWithConfig(res.status, cfgRes?.config?.mcpServers)
        setServers(merged)
        const activeCount = merged.filter((s) => s.connected).length
        const toolCount = merged.reduce((sum, s) => sum + (s.toolCount || 0), 0)
        onNotify(`🔄 Reloaded MCP servers: ${activeCount} connected (${toolCount} tools)`)
      }
    } catch (err: any) {
      onNotify(`⚠️ Failed to reload MCP servers: ${err?.message || ''}`)
    } finally {
      setIsLoadingStatus(false)
    }
  }

  const handleInstallFromOnline = async (item: McpOnlineServerResult) => {
    // If server requires API keys/env vars, open pre-filled form so the user can enter their key
    if (item.requiredEnvKeys && item.requiredEnvKeys.length > 0) {
      setIsEditingExisting(false)
      setConnectionType(item.transport === 'remote' ? 'remote' : 'local')
      setServerKey(item.id)
      setDisplayName(item.displayName || `🔌 MCP: ${item.id}`)
      setDescription(item.description || '')
      setCommand(item.command || 'npx')
      setArgsText((item.args || []).join(' '))
      setRemoteUrl(item.url || '')
      setEnvRows(
        item.requiredEnvKeys.map((k) => ({
          key: k,
          value: item.env?.[k] || '',
        }))
      )
      setDefaultSelected(item.defaultSelected ?? true)
      setEnableImmediately(true)
      setFormError(null)
      setActiveTab('custom')
      onNotify(`🔑 Please enter required API key (${item.requiredEnvKeys.join(', ')}) to complete setup`)
      return
    }

    setInstallingId(item.id)
    try {
      const cfg: McpServerConfig = {
        displayName: item.displayName || `🔌 MCP: ${item.id}`,
        description: item.description,
        command: item.command || (item.url ? 'npx' : 'npx'),
        args: item.args || (item.url ? ['-y', 'mcp-remote', item.url] : []),
        url: item.url,
        env: item.env,
        disabled: false,
        defaultSelected: item.defaultSelected ?? true,
      }
      const res = await upsertServerWithFallback(item.id, cfg)
      if (res?.status) {
        setServers(res.status)
      }
      if (res?.success) {
        onNotify(`⚡ Added & connected "${item.displayName}" (${res.serverInfo?.toolCount || 0} tools)!`)
      } else {
        onNotify(`💾 Added "${item.displayName}" to workbench-mcp.json (${res?.error || 'Saved'})`)
      }
    } catch (err: any) {
      onNotify(`⚠️ Failed to install "${item.id}": ${err?.message || ''}`)
    } finally {
      setInstallingId(null)
    }
  }

  const handleParseSmartSnippet = (input?: string) => {
    const text = (input !== undefined ? input : rawSnippet).trim()
    if (!text) return
    setFormError(null)

    try {
      // Case 1: Raw URL (e.g. https://api.oreilly.com/api/search/v1/mcp)
      if (/^https?:\/\/\S+$/i.test(text)) {
        const u = new URL(text)
        const hostParts = u.hostname.replace(/^www\.|^api\./, '').split('.')
        const guessedId = (hostParts[0] || 'remote-mcp').toLowerCase()
        setConnectionType('remote')
        setServerKey(guessedId)
        setDisplayName(`🌐 MCP: ${guessedId.charAt(0).toUpperCase() + guessedId.slice(1)}`)
        setRemoteUrl(text)
        if (!description) setDescription(`Remote MCP server at ${u.hostname}`)
        onNotify(`✨ Parsed remote MCP URL for "${guessedId}"!`)
        return
      }

      // Case 2: JSON snippet (full { "mcpServers": { ... } } or partial `"key": { ... }`)
      if (text.includes('{')) {
        let jsonCandidate = text
        if (!jsonCandidate.startsWith('{')) {
          jsonCandidate = `{${jsonCandidate}}`
        }
        const parsed = JSON.parse(jsonCandidate)
        const serversMap = parsed.mcpServers || parsed
        const firstEntry = Object.entries<any>(serversMap)[0]
        if (firstEntry) {
          const [k, val] = firstEntry
          if (val && typeof val === 'object') {
            const cleanId = k.toLowerCase().replace(/[^a-z0-9-_]/g, '-')
            setServerKey(cleanId)
            setDisplayName(val.displayName || `🔌 MCP: ${cleanId}`)
            setDescription(val.description || `MCP Server: ${cleanId}`)
            if (val.url) {
              setConnectionType('remote')
              setRemoteUrl(val.url)
              setAuthHeader(val.headers?.Authorization || '')
            } else {
              setConnectionType('local')
              setCommand(val.command || 'npx')
              setArgsText(Array.isArray(val.args) ? val.args.join(' ') : '')
            }
            if (val.env && typeof val.env === 'object') {
              setEnvRows(Object.entries(val.env).map(([ek, ev]) => ({ key: ek, value: String(ev) })))
            }
            onNotify(`✨ Parsed JSON configuration for "${cleanId}"!`)
            return
          }
        }
      }

      // Case 3: CLI command (e.g. `claude mcp add --transport http oreilly https://...` or `npx -y @playwright/mcp@latest`)
      const tokens = text.split(/\s+/).filter(Boolean)
      const urlToken = tokens.find((t) => t.startsWith('http://') || t.startsWith('https://'))
      if (urlToken) {
        const u = new URL(urlToken)
        const hostId = (u.hostname.replace(/^www\.|^api\./, '').split('.')[0] || 'remote').toLowerCase()
        setConnectionType('remote')
        setServerKey(hostId)
        setDisplayName(`🌐 MCP: ${hostId}`)
        setRemoteUrl(urlToken)
        onNotify(`✨ Parsed remote URL command for "${hostId}"!`)
        return
      }

      if (tokens.length >= 2) {
        const cmd = tokens[0]
        const restArgs = tokens.slice(1)
        const pkgToken = restArgs.find((a) => !a.startsWith('-')) || restArgs[restArgs.length - 1] || 'custom'
        const cleanId = (pkgToken.split('/').pop() || pkgToken)
          .replace(/@.*$/, '')
          .replace(/^mcp-server-/, '')
          .replace(/^server-/, '')
          .toLowerCase()
          .replace(/[^a-z0-9-_]/g, '-')

        setConnectionType('local')
        setServerKey(cleanId || 'custom-mcp')
        setDisplayName(`🔌 MCP: ${cleanId || 'custom'}`)
        setCommand(cmd)
        setArgsText(restArgs.join(' '))
        if (!description) setDescription(`MCP server (${pkgToken})`)
        onNotify(`✨ Parsed CLI command for "${cleanId}"!`)
      }
    } catch (err: any) {
      setFormError('Could not automatically parse snippet. Please check the JSON or command format.')
    }
  }

  const handleSaveCustomServer = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    const cleanKey = serverKey.trim().toLowerCase().replace(/\s+/g, '-')
    if (!cleanKey) {
      setFormError('Please enter a unique Server ID (e.g. "oreilly", "postgres", "memory").')
      return
    }

    const envObj: Record<string, string> = {}
    for (const row of envRows) {
      if (row.key.trim()) {
        envObj[row.key.trim()] = row.value.trim()
      }
    }

    let cfg: McpServerConfig
    if (connectionType === 'remote') {
      const cleanUrl = remoteUrl.trim()
      if (!cleanUrl || (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://'))) {
        setFormError('Please enter a valid remote HTTP/HTTPS MCP URL.')
        return
      }
      const headers: Record<string, string> = {}
      if (authHeader.trim()) {
        headers['Authorization'] = authHeader.trim()
      }
      cfg = {
        displayName: displayName.trim() || `🌐 MCP: ${cleanKey}`,
        description: description.trim() || `Remote MCP server (${cleanUrl})`,
        url: cleanUrl,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        command: 'npx',
        args: ['-y', 'mcp-remote', cleanUrl],
        env: Object.keys(envObj).length > 0 ? envObj : undefined,
        disabled: !enableImmediately,
        defaultSelected,
      }
    } else {
      const cleanCmd = command.trim()
      if (!cleanCmd) {
        setFormError('Please enter an executable command (e.g. npx, uvx, node, python).')
        return
      }
      const parsedArgs = argsText
        .trim()
        .split(/\s+/)
        .filter(Boolean)

      cfg = {
        displayName: displayName.trim() || `🔌 MCP: ${cleanKey}`,
        description: description.trim() || `MCP Server (${cleanCmd} ${parsedArgs.join(' ')})`,
        command: cleanCmd,
        args: parsedArgs,
        env: Object.keys(envObj).length > 0 ? envObj : undefined,
        disabled: !enableImmediately,
        defaultSelected,
      }
    }

    setIsSavingServer(true)
    try {
      const res = await upsertServerWithFallback(cleanKey, cfg)
      if (res?.status) {
        setServers(res.status)
      }
      if (res?.success || !enableImmediately) {
        onNotify(
          enableImmediately
            ? `⚡ Saved & connected "${cfg.displayName}" (${res?.serverInfo?.toolCount || 0} tools active)!`
            : `💾 Saved "${cfg.displayName}" to workbench-mcp.json`
        )
        resetForm()
        setActiveTab('installed')
      } else {
        onNotify(`⚠️ Saved "${cleanKey}" to config, but connection failed: ${res?.error || 'Check command/args'}`)
        setActiveTab('installed')
      }
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save MCP server')
    } finally {
      setIsSavingServer(false)
    }
  }

  const installedIds = new Set(servers.map((s) => s.name.toLowerCase()))
  const activeConnectedCount = servers.filter((s) => s.connected).length
  const totalToolsCount = servers.reduce((sum, s) => sum + (s.toolCount || 0), 0)

  return (
    <div className="pane-modal-backdrop" onClick={onClose}>
      <div
        className="pane-modal-container"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '860px',
          maxWidth: '95vw',
          maxHeight: '90vh',
          background: '#0d1117',
          border: '1px solid rgba(255, 255, 255, 0.14)',
          borderRadius: '14px',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(180deg, rgba(168, 85, 247, 0.08) 0%, rgba(0, 0, 0, 0) 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '9px',
                background: 'rgba(168, 85, 247, 0.2)',
                border: '1px solid rgba(168, 85, 247, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#c084fc',
              }}
            >
              <Server size={19} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#f8fafc' }}>
                  MCP Server Manager & Online Discovery
                </h2>
                <span
                  style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    background: activeConnectedCount > 0 ? 'rgba(52, 211, 153, 0.15)' : 'rgba(255, 255, 255, 0.06)',
                    color: activeConnectedCount > 0 ? '#34d399' : '#94a3b8',
                    border: '1px solid rgba(52, 211, 153, 0.3)',
                    fontWeight: 600,
                  }}
                >
                  {activeConnectedCount} Connected • {totalToolsCount} Tools
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '11.5px', color: '#94a3b8' }}>
                Discover MCP servers from the web, manage API keys, and control Prime AI Chat tool availability (100% stored in workbench-mcp.json)
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => window.electron?.mcpOpenConfig?.()}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#cbd5e1',
                padding: '5px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                cursor: 'pointer',
              }}
              title={configPath || 'Open workbench-mcp.json in file explorer'}
            >
              <ExternalLink size={12} />
              <span>workbench-mcp.json</span>
            </button>

            <button
              type="button"
              onClick={handleReloadAll}
              disabled={isLoadingStatus}
              style={{
                background: 'rgba(168, 85, 247, 0.14)',
                border: '1px solid rgba(168, 85, 247, 0.35)',
                color: '#d8b4fe',
                padding: '5px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                cursor: 'pointer',
              }}
              title="Reconnect all enabled servers from workbench-mcp.json"
            >
              <RefreshCw size={12} className={isLoadingStatus ? 'animate-spin' : ''} />
              <span>{isLoadingStatus ? 'Reloading...' : 'Reload All'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                padding: '5px',
                cursor: 'pointer',
                display: 'flex',
              }}
              title="Close (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '6px',
            padding: '10px 20px',
            background: 'rgba(0, 0, 0, 0.35)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('installed')}
            style={{
              padding: '8px 12px',
              borderRadius: '7px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '7px',
              background: activeTab === 'installed' ? 'rgba(168, 85, 247, 0.18)' : 'rgba(255, 255, 255, 0.03)',
              color: activeTab === 'installed' ? '#e9d5ff' : '#94a3b8',
              border: `1px solid ${activeTab === 'installed' ? 'rgba(168, 85, 247, 0.45)' : 'rgba(255, 255, 255, 0.06)'}`,
            }}
          >
            <Layers size={14} />
            <span>Configured Servers ({servers.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('discover')}
            style={{
              padding: '8px 12px',
              borderRadius: '7px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '7px',
              background: activeTab === 'discover' ? 'rgba(56, 189, 248, 0.18)' : 'rgba(255, 255, 255, 0.03)',
              color: activeTab === 'discover' ? '#7dd3fc' : '#94a3b8',
              border: `1px solid ${activeTab === 'discover' ? 'rgba(56, 189, 248, 0.45)' : 'rgba(255, 255, 255, 0.06)'}`,
            }}
          >
            <Globe size={14} />
            <span>🌐 Discover & Search Online</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (activeTab !== 'custom') resetForm()
              setActiveTab('custom')
            }}
            style={{
              padding: '8px 12px',
              borderRadius: '7px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '7px',
              background: activeTab === 'custom' ? 'rgba(16, 185, 129, 0.18)' : 'rgba(255, 255, 255, 0.03)',
              color: activeTab === 'custom' ? '#6ee7b7' : '#94a3b8',
              border: `1px solid ${activeTab === 'custom' ? 'rgba(16, 185, 129, 0.45)' : 'rgba(255, 255, 255, 0.06)'}`,
            }}
          >
            <Plus size={14} />
            <span>{isEditingExisting ? `Edit "${serverKey}"` : 'Add / Smart Paste Server'}</span>
          </button>
        </div>

        {/* Body Content */}
        <div
          style={{
            padding: '18px 20px',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          {/* ===================================================================== */}
          {/* TAB 1: CONFIGURED / INSTALLED SERVERS                                 */}
          {/* ===================================================================== */}
          {activeTab === 'installed' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {servers.length === 0 ? (
                <div
                  style={{
                    padding: '32px',
                    textAlign: 'center',
                    background: 'rgba(255, 255, 255, 0.02)',
                    borderRadius: '10px',
                    border: '1px dashed rgba(255, 255, 255, 0.12)',
                    color: '#94a3b8',
                  }}
                >
                  <p style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#e2e8f0' }}>
                    No MCP servers configured yet.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('discover')}
                    style={{
                      background: 'rgba(56, 189, 248, 0.15)',
                      border: '1px solid rgba(56, 189, 248, 0.4)',
                      color: '#38bdf8',
                      padding: '6px 14px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    🌐 Browse & Add MCP Servers Online
                  </button>
                </div>
              ) : (
                servers.map((srv) => {
                  const isRemote = Boolean(srv.url || (srv.args && srv.args.includes('mcp-remote')))
                  return (
                    <div
                      key={srv.name}
                      style={{
                        background: 'rgba(255, 255, 255, 0.025)',
                        border: `1px solid ${
                          srv.connected
                            ? 'rgba(52, 211, 153, 0.28)'
                            : srv.disabled
                            ? 'rgba(255, 255, 255, 0.07)'
                            : 'rgba(239, 68, 68, 0.28)'
                        }`,
                        borderRadius: '9px',
                        padding: '12px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span
                              style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                background: srv.connected ? '#10b981' : srv.disabled ? '#64748b' : '#ef4444',
                                boxShadow: srv.connected ? '0 0 8px #10b981' : 'none',
                              }}
                            />
                            <span style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>
                              {srv.displayName || `🔌 MCP: ${srv.name}`}
                            </span>
                            <code
                              style={{
                                fontSize: '10.5px',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                background: 'rgba(255, 255, 255, 0.06)',
                                color: '#94a3b8',
                              }}
                            >
                              id: {srv.name}
                            </code>
                            <span
                              style={{
                                fontSize: '10px',
                                padding: '1px 7px',
                                borderRadius: '10px',
                                background: isRemote ? 'rgba(56, 189, 248, 0.15)' : 'rgba(168, 85, 247, 0.15)',
                                color: isRemote ? '#38bdf8' : '#c084fc',
                                fontWeight: 600,
                              }}
                            >
                              {isRemote ? 'Remote HTTP/SSE' : `Stdio (${srv.command})`}
                            </span>
                            <span
                              style={{
                                fontSize: '10.5px',
                                fontWeight: 600,
                                color: srv.connected ? '#34d399' : srv.disabled ? '#64748b' : '#f87171',
                              }}
                            >
                              {srv.connected
                                ? `● Connected (${srv.toolCount} tools)`
                                : srv.disabled
                                ? '○ Disabled'
                                : `⚠️ ${srv.error || 'Disconnected'}`}
                            </span>
                          </div>

                          {srv.description && (
                            <p style={{ margin: 0, fontSize: '11.5px', color: '#94a3b8', lineHeight: 1.35 }}>
                              {srv.description}
                            </p>
                          )}

                          <div
                            style={{
                              fontSize: '10.5px',
                              fontFamily: 'monospace',
                              color: '#64748b',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={srv.url || `${srv.command} ${(srv.args || []).join(' ')}`}
                          >
                            {srv.url ? `URL: ${srv.url}` : `Cmd: ${srv.command} ${(srv.args || []).join(' ')}`}
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                          {/* Default in Prime Chat Checkbox Pill */}
                          <label
                            onClick={() => handleToggleDefaultSelected(srv)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '5px',
                              padding: '4px 8px',
                              borderRadius: '6px',
                              fontSize: '10.5px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              background: srv.defaultSelected ? 'rgba(245, 158, 11, 0.14)' : 'rgba(255, 255, 255, 0.04)',
                              border: `1px solid ${
                                srv.defaultSelected ? 'rgba(245, 158, 11, 0.4)' : 'rgba(255, 255, 255, 0.1)'
                              }`,
                              color: srv.defaultSelected ? '#fbbf24' : '#94a3b8',
                              userSelect: 'none',
                            }}
                            title="When checked, this MCP server is pre-selected by default in the Prime AI Chat screen"
                          >
                            <input
                              type="checkbox"
                              checked={Boolean(srv.defaultSelected)}
                              onChange={() => {}}
                              style={{ margin: 0, accentColor: '#f59e0b', cursor: 'pointer' }}
                            />
                            <span>Prime Default</span>
                          </label>

                          {/* Enable / Disable Toggle */}
                          <button
                            type="button"
                            onClick={() => handleToggleServer(srv)}
                            disabled={actionLoadingServer === srv.name}
                            style={{
                              background: srv.disabled ? 'rgba(255, 255, 255, 0.06)' : 'rgba(16, 185, 129, 0.15)',
                              border: `1px solid ${
                                srv.disabled ? 'rgba(255, 255, 255, 0.14)' : 'rgba(16, 185, 129, 0.4)'
                              }`,
                              color: srv.disabled ? '#cbd5e1' : '#34d399',
                              padding: '4px 9px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 600,
                              cursor: actionLoadingServer === srv.name ? 'wait' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                            title={srv.disabled ? 'Enable and connect this server' : 'Disable and disconnect this server'}
                          >
                            {actionLoadingServer === srv.name ? (
                              <RefreshCw size={11} className="animate-spin" />
                            ) : (
                              <Power size={11} />
                            )}
                            <span>{srv.disabled ? 'Enable' : 'Active'}</span>
                          </button>

                          {/* Edit Server */}
                          <button
                            type="button"
                            onClick={() => handleEditServer(srv)}
                            style={{
                              background: 'rgba(255, 255, 255, 0.05)',
                              border: '1px solid rgba(255, 255, 255, 0.12)',
                              color: '#cbd5e1',
                              padding: '4px 8px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                            title="Edit command, URL, description, or API keys"
                          >
                            <Pencil size={11} />
                            <span>Edit</span>
                          </button>

                          {/* Delete Server */}
                          <button
                            type="button"
                            onClick={() => handleRemoveServer(srv.name)}
                            disabled={actionLoadingServer === srv.name}
                            style={{
                              background: 'rgba(239, 68, 68, 0.1)',
                              border: '1px solid rgba(239, 68, 68, 0.25)',
                              color: '#f87171',
                              padding: '4px 7px',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                            }}
                            title={`Remove "${srv.name}"`}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>

                      {/* Discovered Tools Badges */}
                      {srv.tools && srv.tools.length > 0 && (
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '5px',
                            paddingTop: '6px',
                            borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                          }}
                        >
                          {srv.tools.map((t) => (
                            <span
                              key={t.actionId}
                              style={{
                                fontSize: '10px',
                                fontFamily: 'monospace',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: 'rgba(168, 85, 247, 0.1)',
                                border: '1px solid rgba(168, 85, 247, 0.22)',
                                color: '#d8b4fe',
                              }}
                              title={t.description || t.actionId}
                            >
                              {t.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}

          {/* ===================================================================== */}
          {/* TAB 2: DISCOVER & SEARCH MCP SERVERS ONLINE                           */}
          {/* ===================================================================== */}
          {activeTab === 'discover' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Search Bar */}
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  runOnlineSearch(searchQuery)
                }}
                style={{ display: 'flex', gap: '8px' }}
              >
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'rgba(0, 0, 0, 0.45)',
                    border: '1px solid rgba(56, 189, 248, 0.35)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                  }}
                >
                  <Search size={15} color="#38bdf8" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search Official MCP Registry & NPM (e.g. oreilly, postgres, slack, notion, docker, github, memory)..."
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      color: '#f8fafc',
                      fontSize: '12.5px',
                      outline: 'none',
                    }}
                    autoFocus
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('')
                        runOnlineSearch('')
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#64748b',
                        cursor: 'pointer',
                        display: 'flex',
                      }}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSearchingOnline}
                  style={{
                    background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                    border: '1px solid rgba(56, 189, 248, 0.4)',
                    color: '#fff',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: isSearchingOnline ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  {isSearchingOnline ? <RefreshCw size={13} className="animate-spin" /> : <Globe size={13} />}
                  <span>{isSearchingOnline ? 'Searching...' : 'Search Online'}</span>
                </button>
              </form>

              {/* Quick Topic Chips */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', color: '#64748b' }}>Quick search:</span>
                {['', 'oreilly', 'database', 'postgres', 'browser', 'github', 'slack', 'memory', 'docs'].map((topic) => (
                  <button
                    key={topic || 'featured'}
                    type="button"
                    onClick={() => {
                      setSearchQuery(topic)
                      runOnlineSearch(topic)
                    }}
                    style={{
                      background: searchQuery === topic ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                      border: `1px solid ${
                        searchQuery === topic ? 'rgba(56, 189, 248, 0.45)' : 'rgba(255, 255, 255, 0.08)'
                      }`,
                      color: searchQuery === topic ? '#38bdf8' : '#94a3b8',
                      borderRadius: '12px',
                      padding: '3px 10px',
                      fontSize: '11px',
                      cursor: 'pointer',
                    }}
                  >
                    {topic ? `#${topic}` : '⭐ Featured Catalog'}
                  </button>
                ))}
              </div>

              {/* Search Status & Result Count Banner */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  borderRadius: '7px',
                  background: 'rgba(56, 189, 248, 0.06)',
                  border: '1px solid rgba(56, 189, 248, 0.16)',
                  fontSize: '11.5px',
                  color: '#94a3b8',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  {isSearchingOnline ? (
                    <>
                      <RefreshCw size={12} className="animate-spin" color="#38bdf8" />
                      <span style={{ color: '#7dd3fc' }}>
                        Searching Official MCP Registry, NPM & Starter Catalog for "{searchQuery || 'featured'}"...
                      </span>
                    </>
                  ) : (
                    <span>
                      Showing <strong style={{ color: '#f8fafc' }}>{onlineResults.length}</strong> MCP server(s){' '}
                      {searchQuery.trim()
                        ? `matching "${searchQuery.trim()}" across Catalog, Official MCP Registry & NPM`
                        : 'from Starter Catalog (workbench-mcp.json)'}
                    </span>
                  )}
                </span>
                {searchError && <span style={{ color: '#f87171', fontSize: '11px' }}>⚠️ {searchError}</span>}
              </div>

              {/* Results Grid or Empty State */}
              {onlineResults.length === 0 && !isSearchingOnline ? (
                <div
                  style={{
                    padding: '28px',
                    textAlign: 'center',
                    background: 'rgba(255, 255, 255, 0.02)',
                    borderRadius: '9px',
                    border: '1px dashed rgba(255, 255, 255, 0.12)',
                    color: '#94a3b8',
                  }}
                >
                  <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#e2e8f0' }}>
                    No MCP servers found for "{searchQuery}".
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('')
                      runOnlineSearch('')
                    }}
                    style={{
                      background: 'rgba(56, 189, 248, 0.15)',
                      border: '1px solid rgba(56, 189, 248, 0.4)',
                      color: '#38bdf8',
                      padding: '5px 12px',
                      borderRadius: '6px',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    ⭐ Show Featured Catalog
                  </button>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                  {onlineResults.map((item) => {
                    const isInstalled = installedIds.has(item.id.toLowerCase())
                    const isBusy = installingId === item.id
                    return (
                      <div
                        key={`${item.source || 'cat'}-${item.id}`}
                        style={{
                          background: 'rgba(255, 255, 255, 0.025)',
                          border: `1px solid ${
                            isInstalled ? 'rgba(52, 211, 153, 0.3)' : 'rgba(255, 255, 255, 0.08)'
                          }`,
                          borderRadius: '9px',
                          padding: '12px',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: '10px',
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>
                              {item.displayName}
                            </span>
                            <span
                              style={{
                                fontSize: '9.5px',
                                padding: '1px 6px',
                                borderRadius: '8px',
                                background:
                                  item.transport === 'remote'
                                    ? 'rgba(56, 189, 248, 0.15)'
                                    : item.transport === 'uvx'
                                    ? 'rgba(245, 158, 11, 0.15)'
                                    : 'rgba(168, 85, 247, 0.15)',
                                color:
                                  item.transport === 'remote'
                                    ? '#38bdf8'
                                    : item.transport === 'uvx'
                                    ? '#fbbf24'
                                    : '#c084fc',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                              }}
                            >
                              {item.transport}
                            </span>
                          </div>

                          <p style={{ margin: 0, fontSize: '11.5px', color: '#94a3b8', lineHeight: 1.35 }}>
                            {item.description}
                          </p>

                          {item.requiredEnvKeys && item.requiredEnvKeys.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', marginTop: '2px' }}>
                              <KeyRound size={11} color="#f59e0b" />
                              <span style={{ fontSize: '10px', color: '#fbbf24' }}>
                                Requires: {item.requiredEnvKeys.join(', ')}
                              </span>
                            </div>
                          )}
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            paddingTop: '8px',
                            borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10.5px', color: '#64748b' }}>
                            <span>{item.publisher || item.source || 'MCP'}</span>
                            {item.homepage && (
                              <button
                                type="button"
                                onClick={() => window.electron?.openExternal?.(item.homepage!)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: '#38bdf8',
                                  fontSize: '10.5px',
                                  padding: 0,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                }}
                              >
                                <ExternalLink size={10} />
                                <span>Docs</span>
                              </button>
                            )}
                          </div>

                          {isInstalled ? (
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                color: '#34d399',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              <CheckCircle2 size={13} />
                              <span>Installed</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleInstallFromOnline(item)}
                              disabled={isBusy}
                              style={{
                                background: 'rgba(56, 189, 248, 0.16)',
                                border: '1px solid rgba(56, 189, 248, 0.4)',
                                color: '#38bdf8',
                                padding: '4px 10px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 600,
                                cursor: isBusy ? 'wait' : 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              {isBusy ? <RefreshCw size={11} className="animate-spin" /> : <Plus size={12} />}
                              <span>{isBusy ? 'Connecting...' : 'Add to Workbench'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ===================================================================== */}
          {/* TAB 3: ADD / EDIT SERVER OR SMART PASTE FROM WEB                      */}
          {/* ===================================================================== */}
          {activeTab === 'custom' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Smart Paste Box */}
              {!isEditingExisting && (
                <div
                  style={{
                    padding: '12px',
                    background: 'rgba(168, 85, 247, 0.06)',
                    border: '1px solid rgba(168, 85, 247, 0.25)',
                    borderRadius: '9px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#e9d5ff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ClipboardPaste size={13} color="#c084fc" />
                      <span>Smart Import: Paste JSON Snippet, CLI Command, or Remote MCP URL from Web</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleParseSmartSnippet()}
                      disabled={!rawSnippet.trim()}
                      style={{
                        background: 'rgba(168, 85, 247, 0.2)',
                        border: '1px solid rgba(168, 85, 247, 0.45)',
                        color: '#e9d5ff',
                        padding: '3px 10px',
                        borderRadius: '5px',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: rawSnippet.trim() ? 'pointer' : 'not-allowed',
                      }}
                    >
                      ✨ Parse & Auto-Fill Form
                    </button>
                  </div>
                  <textarea
                    value={rawSnippet}
                    onChange={(e) => {
                      setRawSnippet(e.target.value)
                    }}
                    placeholder={`Paste any MCP config block (e.g. { "mcpServers": { "oreilly": { "url": "https://api.oreilly.com/api/search/v1/mcp" } } }) or command (e.g. npx -y @modelcontextprotocol/server-memory)`}
                    rows={2}
                    style={{
                      width: '100%',
                      background: 'rgba(0, 0, 0, 0.4)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      padding: '7px 9px',
                      outline: 'none',
                      resize: 'vertical',
                    }}
                  />
                </div>
              )}

              {/* Connection Type Switcher */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setConnectionType('local')}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '7px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '7px',
                    background: connectionType === 'local' ? 'rgba(16, 185, 129, 0.16)' : 'rgba(255, 255, 255, 0.03)',
                    color: connectionType === 'local' ? '#34d399' : '#94a3b8',
                    border: `1px solid ${
                      connectionType === 'local' ? 'rgba(16, 185, 129, 0.45)' : 'rgba(255, 255, 255, 0.08)'
                    }`,
                  }}
                >
                  <Terminal size={14} />
                  <span>Local Command (npx / uvx / node / python)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setConnectionType('remote')}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '7px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '7px',
                    background: connectionType === 'remote' ? 'rgba(56, 189, 248, 0.16)' : 'rgba(255, 255, 255, 0.03)',
                    color: connectionType === 'remote' ? '#38bdf8' : '#94a3b8',
                    border: `1px solid ${
                      connectionType === 'remote' ? 'rgba(56, 189, 248, 0.45)' : 'rgba(255, 255, 255, 0.08)'
                    }`,
                  }}
                >
                  <Globe size={14} />
                  <span>Remote HTTP / SSE Server URL (e.g. O'Reilly)</span>
                </button>
              </div>

              {/* Structured Form */}
              <form onSubmit={handleSaveCustomServer} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#cbd5e1', marginBottom: '4px' }}>
                      Server ID / Key (no spaces) *
                    </label>
                    <input
                      type="text"
                      value={serverKey}
                      onChange={(e) => setServerKey(e.target.value)}
                      placeholder="e.g. oreilly, postgres, slack"
                      disabled={isEditingExisting}
                      style={{
                        width: '100%',
                        padding: '7px 10px',
                        borderRadius: '6px',
                        background: 'rgba(0, 0, 0, 0.4)',
                        border: '1px solid rgba(255, 255, 255, 0.14)',
                        color: '#f8fafc',
                        fontSize: '12px',
                        fontFamily: 'monospace',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#cbd5e1', marginBottom: '4px' }}>
                      Display Name (shown in Prime Chat & UI)
                    </label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g. 📚 MCP: O'Reilly Books"
                      style={{
                        width: '100%',
                        padding: '7px 10px',
                        borderRadius: '6px',
                        background: 'rgba(0, 0, 0, 0.4)',
                        border: '1px solid rgba(255, 255, 255, 0.14)',
                        color: '#f8fafc',
                        fontSize: '12px',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#cbd5e1', marginBottom: '4px' }}>
                    Description (stored in workbench-mcp.json)
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief description of what tools this server provides..."
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: '6px',
                      background: 'rgba(0, 0, 0, 0.4)',
                      border: '1px solid rgba(255, 255, 255, 0.14)',
                      color: '#f8fafc',
                      fontSize: '12px',
                    }}
                  />
                </div>

                {connectionType === 'local' ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#cbd5e1', marginBottom: '4px' }}>
                        Command *
                      </label>
                      <input
                        type="text"
                        value={command}
                        onChange={(e) => setCommand(e.target.value)}
                        placeholder="npx / uvx / node"
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          borderRadius: '6px',
                          background: 'rgba(0, 0, 0, 0.4)',
                          border: '1px solid rgba(255, 255, 255, 0.14)',
                          color: '#f8fafc',
                          fontSize: '12px',
                          fontFamily: 'monospace',
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#cbd5e1', marginBottom: '4px' }}>
                        Arguments (space-separated)
                      </label>
                      <input
                        type="text"
                        value={argsText}
                        onChange={(e) => setArgsText(e.target.value)}
                        placeholder="e.g. -y @modelcontextprotocol/server-memory"
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          borderRadius: '6px',
                          background: 'rgba(0, 0, 0, 0.4)',
                          border: '1px solid rgba(255, 255, 255, 0.14)',
                          color: '#f8fafc',
                          fontSize: '12px',
                          fontFamily: 'monospace',
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#cbd5e1', marginBottom: '4px' }}>
                        Remote MCP Endpoint URL *
                      </label>
                      <input
                        type="text"
                        value={remoteUrl}
                        onChange={(e) => setRemoteUrl(e.target.value)}
                        placeholder="https://api.oreilly.com/api/search/v1/mcp"
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          borderRadius: '6px',
                          background: 'rgba(0, 0, 0, 0.4)',
                          border: '1px solid rgba(56, 189, 248, 0.35)',
                          color: '#f8fafc',
                          fontSize: '12px',
                          fontFamily: 'monospace',
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#cbd5e1', marginBottom: '4px' }}>
                        Authorization Header (Optional, OAuth automatic if blank)
                      </label>
                      <input
                        type="password"
                        value={authHeader}
                        onChange={(e) => setAuthHeader(e.target.value)}
                        placeholder="Bearer YOUR_TOKEN (optional)"
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          borderRadius: '6px',
                          background: 'rgba(0, 0, 0, 0.4)',
                          border: '1px solid rgba(255, 255, 255, 0.14)',
                          color: '#f8fafc',
                          fontSize: '12px',
                          fontFamily: 'monospace',
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Environment Variables / API Keys */}
                <div
                  style={{
                    padding: '10px 12px',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <KeyRound size={12} color="#fbbf24" />
                      <span>Environment Variables / API Keys (Optional)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setEnvRows((prev) => [...prev, { key: '', value: '' }])}
                      style={{
                        background: 'rgba(255, 255, 255, 0.06)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        color: '#cbd5e1',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '10.5px',
                        cursor: 'pointer',
                      }}
                    >
                      + Add Variable
                    </button>
                  </div>

                  {envRows.length === 0 ? (
                    <span style={{ fontSize: '11px', color: '#64748b' }}>
                      No environment variables configured. Click "+ Add Variable" if this server requires an API key.
                    </span>
                  ) : (
                    envRows.map((row, idx) => (
                      <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr auto', gap: '8px' }}>
                        <input
                          type="text"
                          value={row.key}
                          onChange={(e) => {
                            const val = e.target.value
                            setEnvRows((prev) => prev.map((r, i) => (i === idx ? { ...r, key: val } : r)))
                          }}
                          placeholder="ENV_VAR_NAME (e.g. GITHUB_PERSONAL_ACCESS_TOKEN)"
                          style={{
                            padding: '5px 8px',
                            borderRadius: '5px',
                            background: 'rgba(0, 0, 0, 0.45)',
                            border: '1px solid rgba(255, 255, 255, 0.12)',
                            color: '#f8fafc',
                            fontSize: '11px',
                            fontFamily: 'monospace',
                          }}
                        />
                        <input
                          type="text"
                          value={row.value}
                          onChange={(e) => {
                            const val = e.target.value
                            setEnvRows((prev) => prev.map((r, i) => (i === idx ? { ...r, value: val } : r)))
                          }}
                          placeholder="Value / API Key..."
                          style={{
                            padding: '5px 8px',
                            borderRadius: '5px',
                            background: 'rgba(0, 0, 0, 0.45)',
                            border: '1px solid rgba(255, 255, 255, 0.12)',
                            color: '#f8fafc',
                            fontSize: '11px',
                            fontFamily: 'monospace',
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setEnvRows((prev) => prev.filter((_, i) => i !== idx))}
                          style={{
                            background: 'rgba(239, 68, 68, 0.12)',
                            border: '1px solid rgba(239, 68, 68, 0.25)',
                            color: '#f87171',
                            padding: '4px 7px',
                            borderRadius: '5px',
                            cursor: 'pointer',
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {/* Options Checkboxes */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '4px 2px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px', color: '#e2e8f0', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={defaultSelected}
                      onChange={(e) => setDefaultSelected(e.target.checked)}
                      style={{ accentColor: '#f59e0b' }}
                    />
                    <span>Pre-select by default in Prime AI Chat screen</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px', color: '#e2e8f0', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={enableImmediately}
                      onChange={(e) => setEnableImmediately(e.target.checked)}
                      style={{ accentColor: '#10b981' }}
                    />
                    <span>Enable & connect server immediately upon saving</span>
                  </label>
                </div>

                {formError && (
                  <div
                    style={{
                      padding: '8px 12px',
                      borderRadius: '6px',
                      background: 'rgba(239, 68, 68, 0.12)',
                      border: '1px solid rgba(239, 68, 68, 0.35)',
                      color: '#f87171',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '7px',
                    }}
                  >
                    <AlertCircle size={14} />
                    <span>{formError}</span>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                  {isEditingExisting && (
                    <button
                      type="button"
                      onClick={() => {
                        resetForm()
                        setActiveTab('installed')
                      }}
                      style={{
                        background: 'rgba(255, 255, 255, 0.06)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        color: '#cbd5e1',
                        padding: '7px 14px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      Cancel Edit
                    </button>
                  )}

                  <button
                    type="submit"
                    disabled={isSavingServer}
                    style={{
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      border: 'none',
                      color: '#fff',
                      padding: '7px 18px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: isSavingServer ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    {isSavingServer ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
                    <span>
                      {isSavingServer
                        ? 'Saving & Connecting...'
                        : isEditingExisting
                        ? 'Update Server in workbench-mcp.json'
                        : 'Save & Add to workbench-mcp.json'}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(0, 0, 0, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: '11px', color: '#64748b' }}>
            Tip: Use <strong style={{ color: '#cbd5e1' }}>MCP & Tools</strong> in the top Electron menu bar or press{' '}
            <kbd style={{ padding: '1px 5px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', color: '#94a3b8' }}>
              Ctrl+Shift+M
            </kbd>{' '}
            anytime.
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {onOpenPrimeChatModal && (
              <button
                type="button"
                onClick={() => {
                  onClose()
                  onOpenPrimeChatModal()
                }}
                style={{
                  background: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  color: '#fbbf24',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <Zap size={13} />
                <span>Configure Priming & Select Tools...</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.16)',
                color: '#f8fafc',
                padding: '6px 18px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
