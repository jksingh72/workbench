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
      description: 'Unique name/identifier for the MCP server (e.g. "playwright", "sqlite", "oreilly", "github")',
    },
    command: {
      type: 'string',
      required: false,
      description: 'Executable command to spawn the server (e.g. "npx", "uvx", "node", "python"). Optional if "url" is provided.',
    },
    url: {
      type: 'string',
      required: false,
      description: 'Remote HTTP/SSE MCP server URL (e.g. "https://api.oreilly.com/api/search/v1/mcp"). Automatically bridged via mcp-remote if command is omitted.',
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
    displayName: {
      type: 'string',
      required: false,
      description: 'Friendly display name shown in UI and Prime Chat modal (e.g. "📚 MCP: O\'Reilly Books")',
    },
    description: {
      type: 'string',
      required: false,
      description: 'Brief description of what this MCP server provides',
    },
    defaultSelected: {
      type: 'boolean',
      required: false,
      description: 'Whether this MCP server should be selected by default when priming AI chats',
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
    const url = (params.url || '').trim()
    const command = (params.command || (url ? 'npx' : '')).trim()
    const args = Array.isArray(params.args)
      ? params.args
      : url && !params.command
      ? ['-y', 'mcp-remote', url]
      : []
    const env = typeof params.env === 'object' && params.env !== null ? params.env : undefined
    const displayName = params.displayName ? String(params.displayName).trim() : `🔌 MCP: ${name}`
    const description = params.description || `MCP Server: ${name}`
    const defaultSelected = Boolean(params.defaultSelected)

    if (!name) {
      return {
        success: false,
        action: 'add_mcp_server',
        message: 'Missing required parameter "name" for MCP server.',
        error: 'Missing name',
      }
    }

    if (!command && !url) {
      return {
        success: false,
        action: 'add_mcp_server',
        message: 'Missing required parameter "command" or "url" for MCP server.',
        error: 'Missing command or url',
      }
    }

    ctx.notify(`⏳ Connecting MCP server: "${name}"...`)
    const manager = McpManager.getInstance()

    const res = await manager.upsertServer(name, {
      displayName,
      command,
      args,
      url: url || undefined,
      env,
      disabled: false,
      defaultSelected,
      description,
    })

    if (!res.success) {
      const errorDetail = res.error || 'Failed to establish stdio connection'
      ctx.notify(`❌ MCP connection failed for "${name}": ${errorDetail}`)
      return {
        success: false,
        action: 'add_mcp_server',
        message: `Failed to connect MCP server "${name}". Error: ${errorDetail}`,
        error: errorDetail,
      }
    }

    const toolList = res.serverInfo?.tools || []
    ctx.notify(`⚡ Connected MCP: "${name}" (${toolList.length} tools loaded)`)

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
