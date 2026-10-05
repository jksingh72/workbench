import { ActionDefinition, ActionContext, ActionResult } from './types'
import { McpManager, McpServerConfig } from '../services/mcpManager'
import { ActionDispatcher } from '../services/actionDispatcher'

export const configureMcpServerAction: ActionDefinition = {
  id: 'configure_mcp_server',
  aliases: ['update_mcp_server', 'toggle_mcp_server', 'disable_mcp_server', 'enable_mcp_server'],
  description:
    'Configures or toggles an existing MCP server in Workbench (e.g. enabling, disabling, updating environment variables/API keys, or command arguments) in real-time.',
  parameters: {
    name: {
      type: 'string',
      required: true,
      description: 'The name/identifier of the MCP server to configure (e.g. "sqlite", "github", "playwright")',
    },
    disabled: {
      type: 'boolean',
      required: false,
      description: 'Set to true to disable and unload the server, or false to enable and start it',
    },
    command: {
      type: 'string',
      required: false,
      description: 'Optional updated command to spawn the server',
    },
    args: {
      type: 'array',
      required: false,
      description: 'Optional updated command line arguments for the server',
    },
    env: {
      type: 'object',
      required: false,
      description: 'Optional updated environment variables or API keys (e.g. { "GITHUB_PERSONAL_ACCESS_TOKEN": "..." })',
    },
    description: {
      type: 'string',
      required: false,
      description: 'Optional updated description of what the server provides',
    },
    browser: {
      type: 'string',
      required: false,
      description: 'Browser type or executable path for Playwright (e.g. "comet" [default], "chrome", "msedge", "firefox", "webkit")',
    },
  },
  example: {
    action: 'configure_mcp_server',
    parameters: {
      name: 'playwright',
      browser: 'comet',
    },
  },
  async execute(ctx: ActionContext, payload: any): Promise<ActionResult> {
    const params = payload.params || payload.parameters || payload
    const name = (params.name || '').trim().toLowerCase()

    if (!name) {
      return {
        success: false,
        action: 'configure_mcp_server',
        message: 'Missing required parameter "name" for MCP server to configure.',
        error: 'Missing name',
      }
    }

    const updates: Partial<McpServerConfig> = {}
    if (typeof params.disabled === 'boolean') updates.disabled = params.disabled
    if (typeof params.command === 'string' && params.command.trim()) updates.command = params.command.trim()
    if (Array.isArray(params.args)) updates.args = params.args
    if (typeof params.env === 'object' && params.env !== null) updates.env = params.env
    if (typeof params.description === 'string') updates.description = params.description
    if (typeof params.browser === 'string' && params.browser.trim()) updates.browser = params.browser.trim().toLowerCase()

    ctx.notify(`⚙️ Configuring MCP server: "${name}"...`)
    const manager = McpManager.getInstance()
    const result = await manager.configureServer(name, updates)

    if (!result.success && result.error) {
      ctx.notify(`⚠️ Failed to configure "${name}": ${result.error}`)
      return {
        success: false,
        action: 'configure_mcp_server',
        message: `Failed to configure MCP server "${name}": ${result.error}`,
        error: result.error,
      }
    }

    // Automatically re-prime active chat so the prompt reflects updated/disabled tools
    try {
      await ActionDispatcher.getInstance().reprimeActiveChat()
    } catch (err) {
      console.warn('[configureMcpServerAction] Failed to re-prime chat:', err)
    }

    const info = result.serverInfo
    const stateStr = info?.connected
      ? `Enabled and connected (${info.toolCount} tools active)`
      : updates.disabled
      ? 'Disabled and unloaded'
      : info?.error || 'Updated'

    ctx.notify(`✅ Configured MCP: "${name}" (${stateStr})`)
    return {
      success: true,
      action: 'configure_mcp_server',
      message: `MCP server "${name}" updated successfully. Status: ${stateStr}`,
      details: {
        serverName: name,
        serverInfo: info,
      },
    }
  },
}
