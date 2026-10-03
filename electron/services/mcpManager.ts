import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { ActionRegistry } from '../actions/registry'
import { ActionDefinition, ActionContext, ActionResult, ActionParameter } from '../actions/types'

export interface McpServerConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
  disabled?: boolean
  description?: string
}

export interface McpConfigFile {
  mcpServers: Record<string, McpServerConfig>
}

export interface McpServerInfo {
  name: string
  command: string
  args: string[]
  connected: boolean
  disabled?: boolean
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
    const userConfig = path.join(app.getPath('userData'), 'workbench-mcp.json')
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
            // Example configuration: SQLite server (disabled by default)
            sqlite_example: {
              command: 'uvx',
              args: ['mcp-server-sqlite', '--db-path', './workspace.db'],
              disabled: true,
              description: 'Example SQLite MCP Server. Set disabled to false to activate.',
            },
          },
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
        return JSON.parse(raw)
      }
    } catch (err: any) {
      console.error('[MCP] Failed to read config file:', err)
    }
    return { mcpServers: {} }
  }

  public saveConfig(config: McpConfigFile): boolean {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8')
      return true
    } catch (err: any) {
      console.error('[MCP] Failed to save config file:', err)
      return false
    }
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

      for (const [serverName, serverCfg] of serverEntries) {
        if (serverCfg.disabled) {
          console.log(`[MCP] Server "${serverName}" is disabled in config. Skipping.`)
          this.serverStatuses.set(serverName, {
            name: serverName,
            command: serverCfg.command,
            args: serverCfg.args || [],
            connected: false,
            disabled: true,
            error: 'Server is disabled in configuration',
            toolCount: 0,
            tools: [],
          })
          continue
        }

        await this.connectServer(serverName, serverCfg)
      }

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
   * Connects to a single MCP server via Stdio transport and registers its tools into ActionRegistry.
   */
  public async connectServer(serverName: string, cfg: McpServerConfig): Promise<boolean> {
    // If already connected, disconnect first
    await this.disconnectServer(serverName)

    console.log(`[MCP:${serverName}] Connecting via stdio: ${cfg.command} ${(cfg.args || []).join(' ')}...`)

    try {
      const mergedEnv: Record<string, string> = {
        ...(process.env as Record<string, string>),
        ...(cfg.env || {}),
      }

      const resolvedArgs = [...(cfg.args || [])]
      // Ensure Playwright runs headlessly so it doesn't crash in background Electron processes
      if (
        (serverName.toLowerCase().includes('playwright') || resolvedArgs.some((a) => a.includes('playwright'))) &&
        !resolvedArgs.includes('--headless')
      ) {
        console.log(`[MCP:${serverName}] Auto-adding --headless flag for Playwright browser stability in background process.`)
        resolvedArgs.push('--headless')
      }

      const transport = new StdioClientTransport({
        command: cfg.command,
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

      const client = new Client(
        {
          name: 'workbench-desktop',
          version: '1.0.0',
        },
        {
          capabilities: {},
        }
      )

      // Connect with a 15-second timeout guard
      const connectPromise = client.connect(transport)
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Connection timed out after 15 seconds')), 15000)
      )

      await Promise.race([connectPromise, timeoutPromise])

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
            // Clean internal routing fields
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
        command: cfg.command,
        args: cfg.args || [],
        connected: true,
        disabled: false,
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

      this.serverStatuses.set(serverName, {
        name: serverName,
        command: cfg.command,
        args: cfg.args || [],
        connected: false,
        disabled: !!cfg.disabled,
        error: errMsg,
        toolCount: 0,
        tools: [],
      })
      return false
    }
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

      // Self-healing: if the connection closed or child process died, attempt to re-connect once and retry
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

    // 1. Disconnect and unregister in-memory tools
    await this.disconnectServer(cleanName)
    this.serverStatuses.delete(cleanName)

    // 2. Remove from config file
    const config = this.readConfig()
    if (config.mcpServers && config.mcpServers[cleanName]) {
      delete config.mcpServers[cleanName]
      this.saveConfig(config)
      return true
    }
    return false
  }

  /**
   * Configures an existing MCP server (e.g. toggle disabled, update args, or env vars).
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
    const mergedCfg: McpServerConfig = {
      ...existingCfg,
      ...updates,
      env: updates.env !== undefined ? { ...existingCfg.env, ...updates.env } : existingCfg.env,
    }

    config.mcpServers[cleanName] = mergedCfg
    this.saveConfig(config)

    if (mergedCfg.disabled) {
      await this.disconnectServer(cleanName)
      this.serverStatuses.set(cleanName, {
        name: cleanName,
        command: mergedCfg.command,
        args: mergedCfg.args || [],
        connected: false,
        disabled: true,
        error: 'Server is disabled in configuration',
        toolCount: 0,
        tools: [],
      })
      return { success: true, serverInfo: this.serverStatuses.get(cleanName) }
    } else {
      // Reconnect live
      const connected = await this.connectServer(cleanName, mergedCfg)
      const info = this.serverStatuses.get(cleanName)
      return { success: connected, error: info?.error, serverInfo: info }
    }
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
    return Array.from(this.serverStatuses.values())
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
