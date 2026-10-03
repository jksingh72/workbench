import { ActionDefinition, ActionContext, ActionResult } from './types'
import { McpManager } from '../services/mcpManager'
import { ActionDispatcher } from '../services/actionDispatcher'

export const removeMcpServerAction: ActionDefinition = {
  id: 'remove_mcp_server',
  aliases: ['delete_mcp_server', 'uninstall_mcp_server', 'disconnect_mcp_server'],
  description:
    'Completely removes, disconnects, and deletes an MCP server from Workbench. Unloads all of its tools from memory and removes it from configuration.',
  parameters: {
    name: {
      type: 'string',
      required: true,
      description: 'The name/identifier of the MCP server to remove (e.g. "sqlite", "playwright", "weather")',
    },
  },
  example: {
    action: 'remove_mcp_server',
    parameters: {
      name: 'playwright',
    },
  },
  async execute(ctx: ActionContext, payload: any): Promise<ActionResult> {
    const params = payload.params || payload.parameters || payload
    const name = (params.name || '').trim().toLowerCase()

    if (!name) {
      return {
        success: false,
        action: 'remove_mcp_server',
        message: 'Missing required parameter "name" for MCP server to remove.',
        error: 'Missing name',
      }
    }

    ctx.notify(`🗑️ Removing MCP server: "${name}"...`)
    const manager = McpManager.getInstance()
    const removed = await manager.removeServer(name)

    if (!removed) {
      return {
        success: false,
        action: 'remove_mcp_server',
        message: `MCP server "${name}" was not found in active servers or configuration.`,
        error: 'Server not found',
      }
    }

    // Automatically re-prime active chat so the prompt reflects tool removal
    try {
      await ActionDispatcher.getInstance().reprimeActiveChat()
    } catch (err) {
      console.warn('[removeMcpServerAction] Failed to re-prime chat:', err)
    }

    ctx.notify(`✅ Removed MCP server: "${name}"`)
    return {
      success: true,
      action: 'remove_mcp_server',
      message: `MCP server "${name}" has been disconnected and removed from Workbench. All associated tools have been unloaded.`,
      details: { serverName: name },
    }
  },
}
