import path from 'node:path'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { ActionRegistry } from '../actions/registry'
import { ActionDefinition, ActionContext, ActionResult, ActionParameter } from '../actions/types'

function getUserDataPath(): string {
  try {
    const req = createRequire(import.meta.url)
    const electron = req('electron')
    if (electron?.app?.getPath) {
      return electron.app.getPath('userData')
    }
  } catch {
    // Non-electron test/script environment
  }
  return process.env.APPDATA || process.env.HOME || process.cwd()
}

export interface McpServerConfig {
  displayName?: string
  command?: string
  args?: string[]
  url?: string
  headers?: Record<string, string>
  env?: Record<string, string>
  disabled?: boolean
  defaultSelected?: boolean
  description?: string
  browser?: string
}

export interface McpOnlineServerResult {
  id: string
  displayName: string
  description: string
  transport: 'npx' | 'uvx' | 'remote' | 'custom'
  command?: string
  args?: string[]
  url?: string
  headers?: Record<string, string>
  env?: Record<string, string>
  requiredEnvKeys?: string[]
  publisher?: string
  homepage?: string
  version?: string
  source?: 'catalog' | 'mcp-registry' | 'npm'
  defaultSelected?: boolean
}

export interface McpConfigFile {
  mcpServers: Record<string, McpServerConfig>
  catalog?: McpOnlineServerResult[]
}

export interface McpServerInfo {
  name: string
  displayName?: string
  description?: string
  command: string
  args: string[]
  url?: string
  headers?: Record<string, string>
  env?: Record<string, string>
  connected: boolean
  disabled?: boolean
  defaultSelected?: boolean
  browser?: string
  error?: string
  toolCount: number
  tools: Array<{
    name: string
    actionId: string
    description?: string
  }>
}

interface ConnectedServer {
  client: Client
  transport: StdioClientTransport
  registeredActionIds: string[]
  tools: Array<{
    name: string
    description?: string
  }>
}

export class McpManager {
  private static instance: McpManager | null = null
  private configPath: string = ''
  private connectedServers: Map<string, ConnectedServer> = new Map()
  private serverStatuses: Map<string, McpServerInfo> = new Map()
  private isInitializing: boolean = false

  private constructor() {
    const cwdConfig = path.join(process.cwd(), 'workbench-mcp.json')
    const userConfig = path.join(getUserDataPath(), 'workbench-mcp.json')
    this.configPath = fs.existsSync(cwdConfig) ? cwdConfig : userConfig
    this.ensureConfigFile()
  }

  public static getInstance(): McpManager {
    if (!McpManager.instance) {
      McpManager.instance = new McpManager()
    }
    return McpManager.instance
  }

  /**
   * Ensures the workbench-mcp.json file exists with helpful template instructions.
   */
  private ensureConfigFile(): void {
    try {
      if (!fs.existsSync(this.configPath)) {
        const initialConfig: McpConfigFile = {
          mcpServers: {
            sqlite_example: {
              displayName: '🗄️ MCP: SQLite Example',
              command: 'uvx',
              args: ['--with', 'mcp<2', 'mcp-server-sqlite', '--db-path', './workspace.db'],
              disabled: true,
              defaultSelected: false,
              description: 'Example SQLite MCP Server. Set disabled to false to activate.',
            },
          },
          catalog: [],
        }
        fs.writeFileSync(this.configPath, JSON.stringify(initialConfig, null, 2), 'utf-8')
        console.log(`[MCP] Created initial configuration file at: ${this.configPath}`)
      }
    } catch (err) {
      console.warn('[MCP] Failed to create initial config file:', err)
    }
  }

  public getConfigPath(): string {
    return this.configPath
  }

  public readConfig(): McpConfigFile {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf-8')
        const parsed = JSON.parse(raw)
        return {
          mcpServers: parsed?.mcpServers || {},
          catalog: Array.isArray(parsed?.catalog) ? parsed.catalog : [],
        }
      }
    } catch (err: any) {
      console.error('[MCP] Failed to read config file:', err)
    }
    return { mcpServers: {}, catalog: [] }
  }

  public saveConfig(config: McpConfigFile): boolean {
    try {
      const existing = this.readConfig()
      const toWrite: McpConfigFile = {
        mcpServers: config.mcpServers || {},
        catalog: config.catalog !== undefined ? config.catalog : existing.catalog,
      }
      fs.writeFileSync(this.configPath, JSON.stringify(toWrite, null, 2), 'utf-8')
      return true
    } catch (err: any) {
      console.error('[MCP] Failed to save config file:', err)
      return false
    }
  }

  /**
   * Resolves effective stdio command and args for either local command or remote HTTP/SSE URL servers.
   */
  private resolveCommandAndArgs(serverName: string, cfg: McpServerConfig): { command: string; args: string[] } {
    const hasExplicitCommand = Boolean(cfg.command && cfg.command.trim())
    const command = hasExplicitCommand ? cfg.command!.trim() : cfg.url ? 'npx' : ''
    let args: string[] = []

    if (hasExplicitCommand) {
      args = [...(cfg.args || [])]
    } else if (cfg.url && cfg.url.trim()) {
      args = ['-y', 'mcp-remote', cfg.url.trim(), ...(cfg.args || [])]
      if (cfg.headers) {
        for (const [k, v] of Object.entries(cfg.headers)) {
          if (k.trim() && v.trim()) {
            args.push('--header', `${k.trim()}: ${v.trim()}`)
          }
        }
      }
    }

    if (serverName.toLowerCase().includes('playwright') || args.some((a) => a.includes('playwright'))) {
      args = this.resolvePlaywrightArgs(args, cfg.browser)
    }

    return { command, args }
  }

  /**
   * Initializes and connects to all configured MCP servers.
   */
  public async initialize(): Promise<void> {
    if (this.isInitializing) return
    this.isInitializing = true

    try {
      console.log(`[MCP] Initializing MCP servers from ${this.configPath}...`)
      const config = this.readConfig()
      const serverEntries = Object.entries(config.mcpServers || {})

      const connectionPromises = serverEntries.map(async ([serverName, serverCfg]) => {
        const { command, args } = this.resolveCommandAndArgs(serverName, serverCfg)
        if (serverCfg.disabled) {
          console.log(`[MCP] Server "${serverName}" is disabled in config. Skipping.`)
          this.serverStatuses.set(serverName, {
            name: serverName,
            displayName: serverCfg.displayName,
            description: serverCfg.description,
            command,
            args,
            url: serverCfg.url,
            headers: serverCfg.headers,
            env: serverCfg.env,
            connected: false,
            disabled: true,
            defaultSelected: Boolean(serverCfg.defaultSelected),
            browser: serverCfg.browser || this.detectBrowser(args),
            error: 'Server is disabled in configuration',
            toolCount: 0,
            tools: [],
          })
          return
        }

        await this.connectServer(serverName, serverCfg)
      })

      await Promise.allSettled(connectionPromises)

      const totalConnected = Array.from(this.connectedServers.values()).length
      const totalTools = Array.from(this.connectedServers.values()).reduce(
        (sum, s) => sum + s.tools.length,
        0
      )
      console.log(`[MCP] Initialized successfully: ${totalConnected} server(s) active, ${totalTools} tool(s) registered.`)
    } catch (err) {
      console.error('[MCP] Error during MCP initialization:', err)
    } finally {
      this.isInitializing = false
    }
  }

  /**
   * Returns the absolute path to the Comet browser executable if installed.
   */
  public static getCometExecutablePath(): string {
    const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local')
    return path.join(localAppData, 'Perplexity', 'Comet', 'Application', 'comet.exe')
  }

  /**
   * Resolves browser arguments for Playwright MCP server.
   * By default, checks if Comet browser exists on the machine and uses it.
   */
  public resolvePlaywrightArgs(rawArgs: string[] = [], requestedBrowser?: string): string[] {
    const cleanArgs = [...rawArgs]
    const cometPath = McpManager.getCometExecutablePath()
    const cometExists = fs.existsSync(cometPath)

    const removeFlagPair = (flag: string) => {
      let idx = cleanArgs.indexOf(flag)
      while (idx !== -1) {
        cleanArgs.splice(idx, 2)
        idx = cleanArgs.indexOf(flag)
      }
    }

    const browserToSet = (requestedBrowser || '').trim().toLowerCase()

    if (browserToSet) {
      removeFlagPair('--browser')
      removeFlagPair('--executable-path')

      if (browserToSet === 'comet') {
        if (cometExists) {
          cleanArgs.push('--executable-path', cometPath)
        } else {
          console.warn(`[MCP:Playwright] Comet browser not found at "${cometPath}". Falling back to chrome channel.`)
          cleanArgs.push('--browser', 'chrome')
        }
      } else if (['chrome', 'msedge', 'firefox', 'webkit'].includes(browserToSet)) {
        cleanArgs.push('--browser', browserToSet)
      } else if (browserToSet.endsWith('.exe') || browserToSet.includes(path.sep) || browserToSet.includes('/')) {
        cleanArgs.push('--executable-path', requestedBrowser!.trim())
      } else {
        cleanArgs.push('--browser', browserToSet)
      }
    } else {
      const hasBrowser = cleanArgs.includes('--browser')
      const hasExecutable = cleanArgs.includes('--executable-path')
      if (!hasBrowser && !hasExecutable && cometExists) {
        console.log(`[MCP:Playwright] Defaulting browser to Comet at: ${cometPath}`)
        cleanArgs.push('--executable-path', cometPath)
      }
    }

    if (!cleanArgs.includes('--isolated')) {
      cleanArgs.push('--isolated')
    }

    return cleanArgs
  }

  /**
   * Detects which browser is configured in the arguments.
   */
  public detectBrowser(args: string[] = []): string {
    const execIdx = args.indexOf('--executable-path')
    if (execIdx !== -1 && args[execIdx + 1]) {
      const p = args[execIdx + 1].toLowerCase()
      if (p.includes('comet')) return 'comet'
      return 'custom'
    }
    const bIdx = args.indexOf('--browser')
    if (bIdx !== -1 && args[bIdx + 1]) {
      return args[bIdx + 1].toLowerCase()
    }
    const cometPath = McpManager.getCometExecutablePath()
    if (fs.existsSync(cometPath)) return 'comet'
    return 'chrome'
  }

  /**
   * Connects to a single MCP server via Stdio transport and registers its tools into ActionRegistry.
   */
  public async connectServer(serverName: string, cfg: McpServerConfig): Promise<boolean> {
    await this.disconnectServer(serverName)

    const { command: effectiveCommand, args: resolvedArgs } = this.resolveCommandAndArgs(serverName, cfg)
    console.log(`[MCP:${serverName}] Connecting via stdio: ${effectiveCommand} ${resolvedArgs.join(' ')}...`)

    let transport: StdioClientTransport | null = null
    let client: Client | null = null

    try {
      if (!effectiveCommand) {
        throw new Error('No command or remote URL configured for this server')
      }

      const mergedEnv: Record<string, string> = {
        ...(process.env as Record<string, string>),
        ...(cfg.env || {}),
      }

      transport = new StdioClientTransport({
        command: effectiveCommand,
        args: resolvedArgs,
        env: mergedEnv,
      })

      transport.onclose = () => {
        console.warn(`[MCP:${serverName}] Transport connection closed. Child process exited.`)
        const currentStatus = this.serverStatuses.get(serverName)
        if (currentStatus && !currentStatus.disabled) {
          currentStatus.connected = false
          currentStatus.error = 'Process disconnected or exited'
        }
      }

      transport.onerror = (err: Error) => {
        console.warn(`[MCP:${serverName}] Transport error:`, err?.message || err)
      }

      client = new Client(
        {
          name: 'workbench-desktop',
          version: '1.0.0',
        },
        {
          capabilities: {},
        }
      )

      // Connect with a 45-second timeout guard to accommodate npx/uvx cold starts
      let timeoutHandle: any = null
      const connectPromise = client.connect(transport)
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error('Connection timed out after 45 seconds')), 45000)
      })

      try {
        await Promise.race([connectPromise, timeoutPromise])
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle)
      }

      // Discover tools
      const toolListResult = await client.listTools()
      const tools = toolListResult?.tools || []

      console.log(`[MCP:${serverName}] Connected! Discovered ${tools.length} tool(s).`)

      const registeredActionIds: string[] = []
      const registry = ActionRegistry.getInstance()

      for (const tool of tools) {
        const actionId = `mcp_${serverName}_${tool.name}`.toLowerCase()
        const aliases: string[] = [`${serverName}_${tool.name}`.toLowerCase()]

        // If tool name doesn't conflict with existing native Workbench actions, allow raw tool name alias
        const existing = registry.get(tool.name)
        if (!existing) {
          aliases.push(tool.name.toLowerCase())
        }

        const parameters = this.convertMcpSchemaToParameters(tool.inputSchema)
        const example = this.generateSamplePayload(actionId, tool.inputSchema)

        const actionDef: ActionDefinition = {
          id: actionId,
          aliases,
          description: `[MCP: ${serverName}] ${tool.description || tool.name}`,
          parameters,
          example,
          execute: async (_ctx: ActionContext, payload: any): Promise<ActionResult> => {
            const rawArgs = payload.parameters || payload.arguments || payload.args || { ...payload }
            const args = { ...rawArgs }
            delete args.action
            delete args.type

            return await this.callTool(serverName, tool.name, args)
          },
        }

        registry.register(actionDef)
        registeredActionIds.push(actionId)
      }

      this.connectedServers.set(serverName, {
        client,
        transport,
        registeredActionIds,
        tools: tools.map((t) => ({ name: t.name, description: t.description })),
      })

      this.serverStatuses.set(serverName, {
        name: serverName,
        displayName: cfg.displayName,
        description: cfg.description,
        command: effectiveCommand,
        args: resolvedArgs,
        url: cfg.url,
        headers: cfg.headers,
        env: cfg.env,
        connected: true,
        disabled: false,
        defaultSelected: Boolean(cfg.defaultSelected),
        browser: cfg.browser || this.detectBrowser(resolvedArgs),
        toolCount: tools.length,
        tools: tools.map((t) => ({
          name: t.name,
          actionId: `mcp_${serverName}_${t.name}`.toLowerCase(),
          description: t.description,
        })),
      })

      return true
    } catch (err: any) {
      const errMsg = err?.message || String(err)
      console.warn(`[MCP:${serverName}] Failed to connect:`, errMsg)

      if (transport) {
        try {
          await transport.close()
        } catch (_) {}
      }
      if (client) {
        try {
          await client.close()
        } catch (_) {}
      }

      this.serverStatuses.set(serverName, {
        name: serverName,
        displayName: cfg.displayName,
        description: cfg.description,
        command: effectiveCommand,
        args: resolvedArgs,
        url: cfg.url,
        headers: cfg.headers,
        env: cfg.env,
        connected: false,
        disabled: !!cfg.disabled,
        defaultSelected: Boolean(cfg.defaultSelected),
        browser: cfg.browser || this.detectBrowser(resolvedArgs),
        error: errMsg,
        toolCount: 0,
        tools: [],
      })
      return false
    }
  }

  /**
   * Returns a map of serverName -> registeredActionIds for accurate grouping in ActionRegistry.
   */
  public getRegisteredActionIdsByServer(): Map<string, string[]> {
    const map = new Map<string, string[]>()
    for (const [serverName, conn] of this.connectedServers.entries()) {
      map.set(serverName, [...conn.registeredActionIds])
    }
    return map
  }

  /**
   * Executes a tool on a connected MCP server.
   */
  public async callTool(serverName: string, toolName: string, args: Record<string, any>): Promise<ActionResult> {
    const server = this.connectedServers.get(serverName)
    if (!server) {
      return {
        success: false,
        message: `MCP server "${serverName}" is not connected or available.`,
        error: 'Server not connected',
      }
    }

    try {
      console.log(`[MCP:${serverName}] Calling tool "${toolName}" with args:`, JSON.stringify(args))
      const startTime = performance.now()

      const result: any = await server.client.callTool({
        name: toolName,
        arguments: args,
      })

      const durationMs = Math.round(performance.now() - startTime)
      console.log(`[MCP:${serverName}] Tool "${toolName}" completed in ${durationMs}ms`)

      let textOutput = ''
      const content = result?.content || []

      for (const item of content) {
        if (item.type === 'text') {
          textOutput += item.text + '\n'
        } else if (item.type === 'image') {
          textOutput += `[Image: ${item.mimeType || 'image/png'}]\n`
        } else if (item.type === 'resource') {
          textOutput += `[Resource: ${item.resource?.uri || 'unknown'}]\n`
        } else {
          textOutput += JSON.stringify(item, null, 2) + '\n'
        }
      }

      const cleanMessage = textOutput.trim() || 'Tool executed successfully.'

      if (result?.isError) {
        return {
          success: false,
          action: `mcp_${serverName}_${toolName}`,
          message: cleanMessage,
          error: cleanMessage,
          details: result,
        }
      }

      return {
        success: true,
        action: `mcp_${serverName}_${toolName}`,
        message: cleanMessage,
        details: result,
      }
    } catch (err: any) {
      console.error(`[MCP:${serverName}] Execution error in "${toolName}":`, err)
      const errMsg = err?.message || String(err)

      if (
        (errMsg.includes('Connection closed') || errMsg.includes('not connected') || errMsg.includes('Client is closed')) &&
        !args.__retried
      ) {
        console.warn(`[MCP:${serverName}] Process connection closed. Attempting auto-reconnect for "${toolName}"...`)
        const cfg = this.readConfig()?.mcpServers?.[serverName]
        if (cfg && !cfg.disabled) {
          const reconnected = await this.connectServer(serverName, cfg)
          if (reconnected) {
            console.log(`[MCP:${serverName}] Auto-reconnect succeeded! Retrying tool call...`)
            return await this.callTool(serverName, toolName, { ...args, __retried: true })
          }
        }
      }

      const status = this.serverStatuses.get(serverName)
      if (status && !status.disabled) {
        status.connected = false
        status.error = errMsg
      }

      return {
        success: false,
        action: `mcp_${serverName}_${toolName}`,
        message: `Error executing MCP tool "${toolName}": ${errMsg}`,
        error: errMsg,
      }
    }
  }

  /**
   * Disconnects a single server and unregisters all of its actions.
   */
  public async disconnectServer(serverName: string): Promise<void> {
    const existing = this.connectedServers.get(serverName)
    if (!existing) return

    console.log(`[MCP:${serverName}] Disconnecting and unregistering tools...`)
    const registry = ActionRegistry.getInstance()

    for (const actionId of existing.registeredActionIds) {
      registry.unregister(actionId)
    }

    try {
      await existing.transport.close()
    } catch (err) {
      console.warn(`[MCP:${serverName}] Error closing transport:`, err)
    }

    this.connectedServers.delete(serverName)
  }

  /**
   * Removes an MCP server completely: disconnects, unregisters tools, and removes from config.
   */
  public async removeServer(serverName: string): Promise<boolean> {
    const cleanName = serverName.toLowerCase().trim()
    console.log(`[MCP] Removing server "${cleanName}"...`)

    await this.disconnectServer(cleanName)
    this.serverStatuses.delete(cleanName)

    const config = this.readConfig()
    if (config.mcpServers && config.mcpServers[cleanName]) {
      delete config.mcpServers[cleanName]
      this.saveConfig(config)
      return true
    }
    return false
  }

  /**
   * Adds a new MCP server or updates an existing one in workbench-mcp.json and connects it live.
   */
  public async upsertServer(
    serverName: string,
    serverCfg: McpServerConfig
  ): Promise<{ success: boolean; error?: string; serverInfo?: McpServerInfo }> {
    const cleanName = serverName.toLowerCase().trim().replace(/\s+/g, '-')
    if (!cleanName) {
      return { success: false, error: 'Server name cannot be empty.' }
    }

    const config = this.readConfig()
    if (!config.mcpServers) config.mcpServers = {}

    const existingCfg = config.mcpServers[cleanName] || {}
    const mergedCfg: McpServerConfig = {
      ...existingCfg,
      ...serverCfg,
      displayName: serverCfg.displayName !== undefined ? serverCfg.displayName : existingCfg.displayName,
      description: serverCfg.description !== undefined ? serverCfg.description : existingCfg.description,
      defaultSelected:
        serverCfg.defaultSelected !== undefined ? Boolean(serverCfg.defaultSelected) : Boolean(existingCfg.defaultSelected),
      disabled: serverCfg.disabled !== undefined ? Boolean(serverCfg.disabled) : false,
    }

    // If URL is specified without an explicit non-npx command, ensure mcp-remote args are synchronized
    if (mergedCfg.url && mergedCfg.url.trim()) {
      const cleanUrl = mergedCfg.url.trim()
      if (!mergedCfg.command || mergedCfg.command === 'npx') {
        mergedCfg.command = 'npx'
        const baseArgs = ['-y', 'mcp-remote', cleanUrl]
        if (mergedCfg.headers) {
          for (const [k, v] of Object.entries(mergedCfg.headers)) {
            if (k.trim() && v.trim()) {
              baseArgs.push('--header', `${k.trim()}: ${v.trim()}`)
            }
          }
        }
        mergedCfg.args = baseArgs
      }
    }

    config.mcpServers[cleanName] = mergedCfg
    this.saveConfig(config)

    if (mergedCfg.disabled) {
      await this.disconnectServer(cleanName)
      const { command, args } = this.resolveCommandAndArgs(cleanName, mergedCfg)
      this.serverStatuses.set(cleanName, {
        name: cleanName,
        displayName: mergedCfg.displayName,
        description: mergedCfg.description,
        command,
        args,
        url: mergedCfg.url,
        headers: mergedCfg.headers,
        env: mergedCfg.env,
        connected: false,
        disabled: true,
        defaultSelected: Boolean(mergedCfg.defaultSelected),
        browser: mergedCfg.browser || this.detectBrowser(args),
        error: 'Server is disabled in configuration',
        toolCount: 0,
        tools: [],
      })
      return { success: true, serverInfo: this.serverStatuses.get(cleanName) }
    }

    const connected = await this.connectServer(cleanName, mergedCfg)
    const info = this.serverStatuses.get(cleanName)
    return { success: connected, error: info?.error, serverInfo: info }
  }

  /**
   * Configures an existing MCP server (e.g. toggle disabled, defaultSelected, update args, or env vars).
   */
  public async configureServer(
    serverName: string,
    updates: Partial<McpServerConfig>
  ): Promise<{ success: boolean; error?: string; serverInfo?: McpServerInfo }> {
    const cleanName = serverName.toLowerCase().trim()
    const config = this.readConfig()
    if (!config.mcpServers || !config.mcpServers[cleanName]) {
      return { success: false, error: `MCP server "${cleanName}" not found in configuration.` }
    }

    const existingCfg = config.mcpServers[cleanName]
    const onlyMetadataChanged =
      updates.disabled === undefined &&
      updates.command === undefined &&
      updates.args === undefined &&
      updates.url === undefined &&
      updates.headers === undefined &&
      updates.env === undefined &&
      updates.browser === undefined

    const mergedCfg: McpServerConfig = {
      ...existingCfg,
      ...updates,
      env: updates.env !== undefined ? updates.env : existingCfg.env,
    }

    if (updates.browser && (cleanName.includes('playwright') || (mergedCfg.args || []).some((a) => a.includes('playwright')))) {
      mergedCfg.args = this.resolvePlaywrightArgs(mergedCfg.args || [], updates.browser)
      mergedCfg.browser = updates.browser
    }

    config.mcpServers[cleanName] = mergedCfg
    this.saveConfig(config)

    // Fast path: if only displayName, description, or defaultSelected was toggled, don't restart the child process
    if (onlyMetadataChanged) {
      const currentStatus = this.serverStatuses.get(cleanName)
      if (currentStatus) {
        currentStatus.displayName = mergedCfg.displayName
        currentStatus.description = mergedCfg.description
        currentStatus.defaultSelected = Boolean(mergedCfg.defaultSelected)
        return { success: true, serverInfo: currentStatus }
      }
    }

    if (mergedCfg.disabled) {
      await this.disconnectServer(cleanName)
      const { command, args } = this.resolveCommandAndArgs(cleanName, mergedCfg)
      this.serverStatuses.set(cleanName, {
        name: cleanName,
        displayName: mergedCfg.displayName,
        description: mergedCfg.description,
        command,
        args,
        url: mergedCfg.url,
        headers: mergedCfg.headers,
        env: mergedCfg.env,
        connected: false,
        disabled: true,
        defaultSelected: Boolean(mergedCfg.defaultSelected),
        browser: mergedCfg.browser || this.detectBrowser(args),
        error: 'Server is disabled in configuration',
        toolCount: 0,
        tools: [],
      })
      return { success: true, serverInfo: this.serverStatuses.get(cleanName) }
    } else {
      const connected = await this.connectServer(cleanName, mergedCfg)
      const info = this.serverStatuses.get(cleanName)
      return { success: connected, error: info?.error, serverInfo: info }
    }
  }

  /**
   * Searches online MCP registries (Official MCP Registry + NPM Registry + local JSON catalog).
   */
  public async searchOnlineServers(rawQuery: string = ''): Promise<McpOnlineServerResult[]> {
    const query = rawQuery.trim().toLowerCase()
    const config = this.readConfig()
    const results: McpOnlineServerResult[] = []
    const seenIds = new Set<string>()

    // 1. Include matching items from the modular JSON catalog in workbench-mcp.json
    const catalog = config.catalog || []
    for (const item of catalog) {
      const hay = `${item.id} ${item.displayName} ${item.description} ${item.publisher || ''}`.toLowerCase()
      if (!query || hay.includes(query)) {
        seenIds.add(item.id.toLowerCase())
        results.push({ ...item, source: 'catalog' })
      }
    }

    // If query is empty, return the JSON catalog immediately
    if (!query) {
      return results
    }

    // 2. Query Official Model Context Protocol Registry + NPM Registry in parallel with a 6s timeout
    const fetchWithTimeout = async (url: string, timeoutMs = 6000): Promise<any> => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { Accept: 'application/json', 'User-Agent': 'Workbench-Desktop/1.0' },
        })
        if (!res.ok) return null
        return await res.json()
      } catch {
        return null
      } finally {
        clearTimeout(timer)
      }
    }

    const mcpRegistryUrl = `https://registry.modelcontextprotocol.io/v0.1/servers?search=${encodeURIComponent(query)}&limit=25`
    const npmSearchUrl = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent('mcp server ' + query)}&size=20`

    const [mcpRegData, npmData] = await Promise.all([
      fetchWithTimeout(mcpRegistryUrl),
      fetchWithTimeout(npmSearchUrl),
    ])

    // Parse Official MCP Registry results
    if (mcpRegData && Array.isArray(mcpRegData.servers)) {
      for (const entry of mcpRegData.servers) {
        const srv = entry?.server || entry
        if (!srv || !srv.name) continue

        const rawName: string = srv.name
        const shortId = (rawName.split('/').pop() || rawName)
          .toLowerCase()
          .replace(/^mcp-server-/, '')
          .replace(/^server-/, '')
          .replace(/[^a-z0-9-_]/g, '-')

        if (seenIds.has(shortId)) continue

        const description = srv.description || `MCP server ${rawName}`
        const homepage = srv.repository?.url || srv.websiteUrl || ''
        const publisher = rawName.includes('/') ? rawName.split('/')[0] : 'MCP Registry'

        // Check packages (npm / pypi) or remotes (streamable-http / sse)
        const pkg = Array.isArray(srv.packages) ? srv.packages[0] : null
        const remote = Array.isArray(srv.remotes) ? srv.remotes[0] : null

        if (pkg && pkg.identifier) {
          const regType = (pkg.registryType || pkg.registry_name || 'npm').toLowerCase()
          const isPypi = regType === 'pypi'
          const envVars: string[] = []
          const envMap: Record<string, string> = {}
          if (Array.isArray(pkg.environmentVariables)) {
            for (const ev of pkg.environmentVariables) {
              if (ev?.name) {
                envVars.push(ev.name)
                envMap[ev.name] = ev.default || `YOUR_${ev.name}`
              }
            }
          }

          seenIds.add(shortId)
          results.push({
            id: shortId,
            displayName: `🔌 MCP: ${srv.title || shortId}`,
            description,
            transport: isPypi ? 'uvx' : 'npx',
            command: isPypi ? 'uvx' : 'npx',
            args: isPypi ? [pkg.identifier] : ['-y', pkg.identifier],
            env: envVars.length > 0 ? envMap : undefined,
            requiredEnvKeys: envVars.length > 0 ? envVars : undefined,
            publisher,
            homepage,
            version: srv.version,
            source: 'mcp-registry',
            defaultSelected: false,
          })
        } else if (remote && remote.url) {
          seenIds.add(shortId)
          results.push({
            id: shortId,
            displayName: `🌐 MCP: ${srv.title || shortId}`,
            description,
            transport: 'remote',
            url: remote.url,
            command: 'npx',
            args: ['-y', 'mcp-remote', remote.url],
            publisher,
            homepage,
            version: srv.version,
            source: 'mcp-registry',
            defaultSelected: false,
          })
        }
      }
    }

    // Parse NPM Registry results
    if (npmData && Array.isArray(npmData.objects)) {
      for (const obj of npmData.objects) {
        const pkg = obj?.package
        if (!pkg || !pkg.name) continue
        const pkgName: string = pkg.name
        const lowerPkg = pkgName.toLowerCase()

        // Filter to packages that look like MCP servers
        if (!lowerPkg.includes('mcp')) continue

        const shortId = (pkgName.split('/').pop() || pkgName)
          .toLowerCase()
          .replace(/^mcp-server-/, '')
          .replace(/^server-/, '')
          .replace(/[^a-z0-9-_]/g, '-')

        if (seenIds.has(shortId)) continue
        seenIds.add(shortId)

        results.push({
          id: shortId,
          displayName: `📦 MCP: ${shortId}`,
          description: pkg.description || `NPM MCP server package (${pkgName})`,
          transport: 'npx',
          command: 'npx',
          args: ['-y', pkgName],
          publisher: pkg.publisher?.username || pkg.author?.name || 'npm',
          homepage: pkg.links?.repository || pkg.links?.homepage || pkg.links?.npm || '',
          version: pkg.version,
          source: 'npm',
          defaultSelected: false,
        })
      }
    }

    return results
  }

  /**
   * Reloads all MCP servers from configuration.
   */
  public async reload(): Promise<McpServerInfo[]> {
    console.log('[MCP] Reloading all MCP servers...')
    const serverNames = Array.from(this.connectedServers.keys())
    for (const name of serverNames) {
      await this.disconnectServer(name)
    }
    this.serverStatuses.clear()
    await this.initialize()
    return this.getStatus()
  }

  /**
   * Returns current status of all servers.
   */
  public getStatus(): McpServerInfo[] {
    const config = this.readConfig()
    const statuses: McpServerInfo[] = []

    for (const [serverName, cfg] of Object.entries(config.mcpServers || {})) {
      const existing = this.serverStatuses.get(serverName)
      if (existing) {
        statuses.push({
          ...existing,
          displayName: cfg.displayName || existing.displayName,
          description: cfg.description || existing.description,
          defaultSelected: Boolean(cfg.defaultSelected),
          url: cfg.url || existing.url,
          headers: cfg.headers || existing.headers,
          env: cfg.env || existing.env,
        })
      } else {
        const { command, args } = this.resolveCommandAndArgs(serverName, cfg)
        statuses.push({
          name: serverName,
          displayName: cfg.displayName,
          description: cfg.description,
          command,
          args,
          url: cfg.url,
          headers: cfg.headers,
          env: cfg.env,
          connected: false,
          disabled: Boolean(cfg.disabled),
          defaultSelected: Boolean(cfg.defaultSelected),
          browser: cfg.browser || this.detectBrowser(args),
          error: cfg.disabled ? 'Server is disabled in configuration' : 'Not connected',
          toolCount: 0,
          tools: [],
        })
      }
    }

    return statuses
  }

  /**
   * Converts an MCP JSON Schema object to Workbench ActionParameter record.
   */
  private convertMcpSchemaToParameters(schema: any): Record<string, ActionParameter> {
    const params: Record<string, ActionParameter> = {}
    if (!schema || typeof schema !== 'object') return params

    const properties = schema.properties || {}
    const requiredList = Array.isArray(schema.required) ? schema.required : []

    for (const [key, prop] of Object.entries<any>(properties)) {
      params[key] = {
        type: prop.type || 'string',
        description: prop.description || `Parameter ${key}`,
        required: requiredList.includes(key),
        default: prop.default,
      }
    }

    return params
  }

  /**
   * Generates a sample payload for the AI model documentation guide.
   */
  private generateSamplePayload(actionId: string, schema: any): Record<string, any> {
    const sampleParameters: Record<string, any> = {}
    const properties = schema?.properties || {}
    const required = Array.isArray(schema?.required) ? schema.required : Object.keys(properties).slice(0, 2)

    for (const key of required) {
      const prop = properties[key]
      if (prop?.type === 'number' || prop?.type === 'integer') {
        sampleParameters[key] = prop.default !== undefined ? prop.default : 10
      } else if (prop?.type === 'boolean') {
        sampleParameters[key] = prop.default !== undefined ? prop.default : true
      } else if (prop?.type === 'array') {
        sampleParameters[key] = []
      } else {
        sampleParameters[key] = prop?.description || `sample_${key}`
      }
    }

    return {
      action: actionId,
      parameters: sampleParameters,
    }
  }

  /**
   * Graceful cleanup when Electron app quits.
   */
  public async shutdown(): Promise<void> {
    console.log('[MCP] Shutting down MCP manager...')
    const serverNames = Array.from(this.connectedServers.keys())
    for (const name of serverNames) {
      await this.disconnectServer(name)
    }
  }
}
