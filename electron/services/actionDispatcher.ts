import { BrowserWindow, dialog } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import {
  ActionContext,
  ActionResult,
  ActionRegistry,
  registerBuiltinActions,
  ActionDefinition,
} from '../actions'

export interface WorkbenchActionPayload {
  type?: string
  action?: string
  params?: Record<string, any>
  name?: string
  path?: string
  content?: string
  source?: string
  target?: string
  folder?: string
  command?: string
  openInTab?: boolean
  files?: Array<{ name: string; path?: string; content: string }>
  actions?: WorkbenchActionPayload[]
  [key: string]: any
}

export type { ActionResult }

export class ActionDispatcher {
  private static instance: ActionDispatcher | null = null
  private mainWindow: BrowserWindow | null = null
  private registry: ActionRegistry
  private actionModeEnabled: boolean = false

  private activeDirectories: {
    book: string
    note: string
  } = {
    book: '',
    note: '',
  }

  private activeRoots: {
    book: string
    note: string
  } = {
    book: '',
    note: '',
  }

  private constructor() {
    this.registry = registerBuiltinActions()
  }

  public static getInstance(): ActionDispatcher {
    if (!ActionDispatcher.instance) {
      ActionDispatcher.instance = new ActionDispatcher()
    }
    return ActionDispatcher.instance
  }

  public setActionMode(enabled: boolean) {
    this.actionModeEnabled = enabled
    console.log(`[ActionDispatcher] Action Mode is now: ${enabled ? 'ENABLED' : 'DISABLED'}`)
  }

  public isActionModeEnabled(): boolean {
    return this.actionModeEnabled
  }

  public setMainWindow(win: BrowserWindow) {
    this.mainWindow = win
  }

  public getRegistry(): ActionRegistry {
    return this.registry
  }

  /**
   * Allows registering new modular actions dynamically
   */
  public registerCustomAction(action: ActionDefinition): void {
    this.registry.register(action)
  }

  /**
   * Sets the active directory reported by LocalExplorer
   */
  public setActiveDirectory(target: 'book' | 'note', dirPath: string, rootPath?: string) {
    if (dirPath && fs.existsSync(dirPath)) {
      this.activeDirectories[target] = path.normalize(dirPath)
    }
    if (rootPath && fs.existsSync(rootPath)) {
      this.activeRoots[target] = path.normalize(rootPath)
    }
  }

  public getActiveDirectory(target: 'book' | 'note' = 'book'): string {
    const dir = this.activeDirectories[target] || this.activeRoots[target]
    if (dir && fs.existsSync(dir)) {
      return dir
    }
    return process.platform === 'win32'
      ? path.join(process.env.USERPROFILE || 'C:\\', 'Documents')
      : path.join(process.env.HOME || '/', 'Documents')
  }

  /**
   * Resolves a relative or absolute path safely.
   */
  public resolveSafePath(inputPath: string, targetPane: 'book' | 'note' = 'book'): string {
    const trimmed = (inputPath || '').trim()
    if (!trimmed) {
      throw new Error('Path cannot be empty')
    }

    let resolved = ''
    if (path.isAbsolute(trimmed)) {
      resolved = path.normalize(trimmed)
    } else {
      const baseDir = this.getActiveDirectory(targetPane)
      const cleanRelative = trimmed.replace(/^[/\\]+/, '')
      resolved = path.resolve(baseDir, cleanRelative)
    }

    // Security check: block modifications to critical operating system directories
    const lower = resolved.toLowerCase()
    const forbidden = [
      'c:\\windows',
      'c:\\program files',
      'c:\\program files (x86)',
      'c:\\recovery',
      'c:\\$recycle.bin',
      '/system',
      '/etc',
      '/usr/bin',
      '/bin',
      '/sbin',
    ]

    for (const f of forbidden) {
      if (lower === f || lower.startsWith(f + path.sep)) {
        throw new Error(`Security Exception: Cannot perform operations inside system directory "${f}"`)
      }
    }

    return resolved
  }

  /**
   * Prompts the user with a native modal dialog to confirm sensitive actions (like deletions)
   */
  public async confirm(options: { title: string; message: string; detail?: string }): Promise<boolean> {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return false
    }
    const result = await dialog.showMessageBox(this.mainWindow, {
      type: 'warning',
      buttons: ['Delete', 'Cancel'],
      defaultId: 1, // Default is Cancel for maximum safety
      cancelId: 1,
      title: options.title || 'Security Confirmation',
      message: options.message,
      detail: options.detail || 'This action cannot be undone.',
    })
    return result.response === 0
  }

  /**
   * Creates an execution context for an action
   */
  private createContext(): ActionContext {
    return {
      resolveSafePath: (inputPath: string, targetPane?: 'book' | 'note') =>
        this.resolveSafePath(inputPath, targetPane),
      getActiveDirectory: (targetPane?: 'book' | 'note') =>
        this.getActiveDirectory(targetPane),
      notify: (message: string) => this.notify(message),
      refreshExplorer: (targetPane?: 'book' | 'note') => this.refreshExplorer(targetPane),
      openInTab: (filePath: string) => this.openInTab(filePath),
      dispatch: (action: any, targetPane?: 'book' | 'note') =>
        this.dispatch(action, targetPane),
      confirm: (options) => this.confirm(options),
    }
  }

  /**
   * Main Dispatcher: Parses and routes action payloads to modular action handlers
   */
  public async dispatch(
    rawPayload: any,
    targetPane: 'book' | 'note' = 'book'
  ): Promise<ActionResult> {
    try {
      if (!this.actionModeEnabled) {
        console.log('[ActionDispatcher] Action blocked: Action Mode is OFF in Workbench.')
        return {
          success: false,
          message: 'Action Mode is currently disabled in Workbench. Toggle ⚡ Action Mode in the toolbar to enable local execution.',
          error: 'Action Mode disabled',
        }
      }

      let payload: any = rawPayload

      // Handle raw string payloads
      if (typeof rawPayload === 'string') {
        try {
          payload = JSON.parse(rawPayload)
        } catch (parseErr: any) {
          return {
            success: false,
            message: `Invalid action JSON: ${parseErr.message}`,
            error: parseErr.message,
          }
        }
      }

      // Guard: Strictly reject documentation schema templates containing placeholder tokens
      const payloadStr = JSON.stringify(payload)
      if (
        payloadStr.includes('<folder') ||
        payloadStr.includes('<file') ||
        payloadStr.includes('<project') ||
        payloadStr.includes('<directory') ||
        payloadStr.includes('<source') ||
        payloadStr.includes('<destination') ||
        payloadStr.includes('<old_name') ||
        payloadStr.includes('<new_name')
      ) {
        console.warn('[ActionDispatcher] Ignored documentation template placeholder action')
        return {
          success: false,
          message: 'Ignored documentation schema template placeholder',
        }
      }

      // Handle array of actions (batch execution)
      if (Array.isArray(payload)) {
        const batchHandler = this.registry.get('batch')
        if (batchHandler) {
          const ctx = this.createContext()
          return await batchHandler.execute(ctx, { actions: payload }, targetPane)
        }
      }

      const actionType = (payload.type || payload.action || '').trim().toLowerCase()
      if (!actionType) {
        return {
          success: false,
          message: 'Missing "action" or "type" in action block payload',
          error: 'Missing action identifier',
        }
      }

      const handler = this.registry.get(actionType)
      if (!handler) {
        const available = this.registry.getAll().map((a) => a.id).join(', ')
        console.warn(`[ActionDispatcher] Unknown action "${actionType}". Available: ${available}`)
        return {
          success: false,
          action: actionType,
          message: `Unknown action: "${actionType}". Supported actions: ${available}`,
          error: 'Unknown action type',
        }
      }

      console.log(`[ActionDispatcher] Executing modular action: ${handler.id} (${actionType})`)
      const ctx = this.createContext()
      const result = await handler.execute(ctx, payload, targetPane)
      return result
    } catch (err: any) {
      console.error('[ActionDispatcher] Execution error:', err)
      this.notify(`❌ Action failed: ${err.message}`)
      return {
        success: false,
        message: err.message || 'Action execution failed',
        error: err.message,
      }
    }
  }

  /**
   * Generates prompt guide for AI models
   */
  public getPromptGuide(targetPane: 'book' | 'note' = 'book', customInstructions?: string): string {
    const activeDir = this.getActiveDirectory(targetPane)
    return this.registry.generatePromptGuide(activeDir, customInstructions)
  }

  public notify(message: string) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('workbench:toast', {
        message,
        type: message.includes('❌') ? 'error' : 'success',
      })
    }
  }

  public refreshExplorer(targetPane: 'book' | 'note' = 'book') {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('workbench:explorer-refresh-needed', {
        target: targetPane,
        activePath: this.getActiveDirectory(targetPane),
      })
    }
  }

  public openInTab(filePath: string) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('workbench:action-open-tab', { filePath })
    }
  }
}
