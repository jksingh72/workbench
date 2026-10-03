import { ActionDefinition, ActionContext, ActionResult } from './types'
import { McpManager } from '../services/mcpManager'
import { ActionDispatcher } from '../services/actionDispatcher'

export const addMcpServerAction: ActionDefinition = {
  id: 'add_mcp_server',
  aliases: ['connect_mcp_server', 'install_mcp_server', 'register_mcp_server'],
  description:
    'Dynamically connects and registers an external Model Context Protocol (MCP) server into Workbench in real-time without restarting the application. Automatically loads and exposes all tools provided by that MCP server.',
  parameters: {
    name: {
      type: 'string',
      required: true,
      description: 'Unique name/identifier for the MCP server (e.g. "playwright", "sqlite", "weather", "github")',
    },
    command: {
      type: 'string',
      required: true,
      description: 'Executable command to spawn the server (e.g. "npx", "uvx", "node", "python")',
    },
    args: {
      type: 'array',
      required: false,
      description: 'Command line arguments for the server (e.g. ["-y", "@playwright/mcp@latest"])',
    },
    env: {
      type: 'object',
      required: false,
      description: 'Optional environment variables or API keys for the server (e.g. { "API_KEY": "..." })',
    },
    description: {
      type: 'string',
      required: false,
      description: 'Brief description of what this MCP server provides',
    },
  },
  example: {
    action: 'add_mcp_server',
    parameters: {
      name: 'playwright',
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest'],
      description: 'Playwright browser automation MCP server',
    },
  },
  async execute(ctx: ActionContext, payload: any): Promise<ActionResult> {
    const params = payload.params || payload.parameters || payload
    const name = (params.name || '').trim().toLowerCase()
    const command = (params.command || '').trim()
    const args = Array.isArray(params.args) ? params.args : []
    const env = typeof params.env === 'object' && params.env !== null ? params.env : undefined
    const description = params.description || `MCP Server: ${name}`

    if (!name) {
      return {
        success: false,
        action: 'add_mcp_server',
        message: 'Missing required parameter "name" for MCP server.',
        error: 'Missing name',
      }
    }

    if (!command) {
      return {
        success: false,
        action: 'add_mcp_server',
        message: 'Missing required parameter "command" for MCP server.',
        error: 'Missing command',
      }
    }

    ctx.notify(`⏳ Connecting MCP server: "${name}"...`)
    const manager = McpManager.getInstance()

    // 1. Update config file persistence (workbench-mcp.json)
    const currentConfig = manager.readConfig()
    if (!currentConfig.mcpServers) currentConfig.mcpServers = {}
    currentConfig.mcpServers[name] = {
      command,
      args,
      env,
      disabled: false,
      description,
    }
    manager.saveConfig(currentConfig)

    // 2. Connect live in memory without app restart
    const connected = await manager.connectServer(name, {
      command,
      args,
      env,
      disabled: false,
      description,
    })

    if (!connected) {
      const statuses = manager.getStatus()
      const serverStatus = statuses.find((s) => s.name === name)
      const errorDetail = serverStatus?.error || 'Failed to establish stdio connection'
      ctx.notify(`❌ MCP connection failed for "${name}": ${errorDetail}`)
      return {
        success: false,
        action: 'add_mcp_server',
        message: `Failed to connect MCP server "${name}". Error: ${errorDetail}`,
        error: errorDetail,
      }
    }

    // 3. Retrieve registered tools
    const statuses = manager.getStatus()
    const serverInfo = statuses.find((s) => s.name === name)
    const toolList = serverInfo?.tools || []

    ctx.notify(`⚡ Connected MCP: "${name}" (${toolList.length} tools loaded)`)

    // 4. Automatically re-prime the active AI chat so the model immediately knows the new tools!
    try {
      await ActionDispatcher.getInstance().reprimeActiveChat()
    } catch (primeErr) {
      console.warn('[addMcpServerAction] Failed to re-prime chat:', primeErr)
    }

    const toolSummary = toolList.length > 0
      ? toolList.map((t) => `- \`${t.actionId}\`: ${t.description || t.name}`).join('\n')
      : 'No tools exposed by this server.'

    return {
      success: true,
      action: 'add_mcp_server',
      message: `MCP server "${name}" connected successfully! Discovered and registered ${toolList.length} new tool(s) in memory without restarting Workbench:\n\n${toolSummary}\n\nYou can now call any of these tools directly!`,
      details: {
        serverName: name,
        toolCount: toolList.length,
        tools: toolList,
      },
    }
  },
}
