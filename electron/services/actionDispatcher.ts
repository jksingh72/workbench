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
  private aiHandler: any = null
  private registry: ActionRegistry
  private actionModeEnabled: boolean = true
  private autoFeedbackLoopEnabled: boolean = true
  private activeTarget: 'book' | 'note' | 'custom' = 'book'
  private customDirectory: string = ''
  private recentDispatchedHashes: Map<string, number> = new Map()

  public setAIHandler(handler: any) {
    this.aiHandler = handler
  }

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

  public setAutoFeedbackLoop(enabled: boolean) {
    this.autoFeedbackLoopEnabled = enabled
    console.log(`[ActionDispatcher] Action feedback loop is now: ${enabled ? 'ENABLED' : 'DISABLED'}`)
  }

  public isAutoFeedbackLoopEnabled(): boolean {
    return this.autoFeedbackLoopEnabled && this.actionModeEnabled
  }

  public setActiveTarget(target: 'book' | 'note' | 'custom', customPath?: string) {
    this.activeTarget = target
    if (customPath && fs.existsSync(customPath)) {
      const normalized = path.normalize(customPath)
      if (target === 'book') {
        this.activeDirectories.book = normalized
      } else if (target === 'note') {
        this.activeDirectories.note = normalized
      } else {
        this.customDirectory = normalized
      }
    }
    console.log(`[ActionDispatcher] Active target switched to: ${target} (${this.getActiveDirectory()})`)
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('workbench:action-target-changed', this.getWorkspaceFolders())
      if (customPath && (target === 'book' || target === 'note')) {
        this.mainWindow.webContents.send('workbench:navigate-to-folder', {
          target,
          path: path.normalize(customPath),
        })
      }
    }
  }

  public getActiveTarget(): 'book' | 'note' | 'custom' {
    return this.activeTarget
  }

  public getWorkspaceFolders(): {
    activeTarget: 'book' | 'note' | 'custom'
    activeDirectory: string
    bookDirectory: string
    noteDirectory: string
    customDirectory: string
  } {
    const bookDir = this.activeDirectories.book || this.activeRoots.book || ''
    const noteDir = this.activeDirectories.note || this.activeRoots.note || ''
    let activeDir = ''

    if (this.activeTarget === 'note') {
      activeDir = noteDir || bookDir
    } else if (this.activeTarget === 'custom' && this.customDirectory) {
      activeDir = this.customDirectory
    } else {
      activeDir = bookDir || noteDir
    }

    if (!activeDir || !fs.existsSync(activeDir)) {
      activeDir = process.platform === 'win32'
        ? path.join(process.env.USERPROFILE || 'C:\\', 'Documents')
        : path.join(process.env.HOME || '/', 'Documents')
    }

    return {
      activeTarget: this.activeTarget,
      activeDirectory: activeDir,
      bookDirectory: bookDir,
      noteDirectory: noteDir,
      customDirectory: this.customDirectory || '',
    }
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
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('workbench:action-target-changed', this.getWorkspaceFolders())
    }
  }

  public getActiveDirectory(targetPane?: 'book' | 'note' | 'custom'): string {
    const target = targetPane || this.activeTarget
    if (target === 'note') {
      const dir = this.activeDirectories.note || this.activeRoots.note
      if (dir && fs.existsSync(dir)) return dir
    } else if (target === 'custom' && this.customDirectory && fs.existsSync(this.customDirectory)) {
      return this.customDirectory
    } else if (target === 'book') {
      const dir = this.activeDirectories.book || this.activeRoots.book
      if (dir && fs.existsSync(dir)) return dir
    }

    return this.getWorkspaceFolders().activeDirectory
  }

  /**
   * Resolves a relative or absolute path safely.
   */
  public resolveSafePath(inputPath: string, targetPane?: 'book' | 'note' | 'custom'): string {
    const trimmed = (inputPath || '').trim()
    if (!trimmed) {
      throw new Error('Path cannot be empty')
    }

    let resolved = ''
    if (path.isAbsolute(trimmed)) {
      resolved = path.normalize(trimmed)
    } else {
      const baseDir = this.getActiveDirectory(targetPane || this.activeTarget)
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
      resolveSafePath: (inputPath: string, targetPane?: 'book' | 'note' | 'custom') =>
        this.resolveSafePath(inputPath, targetPane || this.activeTarget),
      getActiveDirectory: (targetPane?: 'book' | 'note' | 'custom') =>
        this.getActiveDirectory(targetPane || this.activeTarget),
      notify: (message: string) => this.notify(message),
      refreshExplorer: (targetPane?: 'book' | 'note') =>
        this.refreshExplorer(targetPane || (this.activeTarget === 'note' ? 'note' : 'book')),
      openInTab: (filePath: string) => this.openInTab(filePath),
      dispatch: (action: any, targetPane?: 'book' | 'note' | 'custom') =>
        this.dispatch(action, targetPane || this.activeTarget),
      confirm: (options) => this.confirm(options),
      getWorkspaceFolders: () => this.getWorkspaceFolders(),
      setActiveTarget: (target: 'book' | 'note' | 'custom', customPath?: string) =>
        this.setActiveTarget(target, customPath),
      attachToChat: async (filePath: string, customInstruction?: string) => {
        if (this.aiHandler && typeof this.aiHandler.sendFileToAI === 'function') {
          return await this.aiHandler.sendFileToAI(filePath, customInstruction)
        }
        return { success: false, error: 'AI View handler is not connected' }
      },
    }
  }

  /**
   * Main Dispatcher: Parses and routes action payloads to modular action handlers
   */
  public async dispatch(
    rawPayload: any,
    targetPane?: 'book' | 'note' | 'custom'
  ): Promise<ActionResult> {
    const effectivePane: 'book' | 'note' = (targetPane || this.activeTarget) === 'note' ? 'note' : 'book'
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

      // Deduplication Guard: Ignore identical payloads dispatched within 10 seconds to prevent feedback loops
      const payloadHash = typeof rawPayload === 'string' ? rawPayload.trim() : JSON.stringify(payload)
      const now = Date.now()
      const lastDispatched = this.recentDispatchedHashes.get(payloadHash)
      if (lastDispatched && now - lastDispatched < 10000) {
        console.log(`[ActionDispatcher] Suppressed duplicate action execution (dispatched ${now - lastDispatched}ms ago)`)
        return {
          success: false,
          message: 'Duplicate action suppressed (already executed in current turn)',
          error: 'Duplicate action suppressed',
        }
      }
      this.recentDispatchedHashes.set(payloadHash, now)
      if (this.recentDispatchedHashes.size > 100) {
        for (const [k, v] of this.recentDispatchedHashes.entries()) {
          if (now - v > 30000) this.recentDispatchedHashes.delete(k)
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
          return await batchHandler.execute(ctx, { actions: payload }, effectivePane)
        }
      }

      const actionType = (payload.type || payload.action || '').trim().toLowerCase()
      if (!actionType) {
        console.warn('[ActionDispatcher] Missing "action" or "type" in payload:', payload)
        return {
          success: false,
          message: 'Missing "action" or "type" in action block payload',
          error: 'Missing action identifier',
        }
      }

      const handler = this.registry.get(actionType)
      if (!handler) {
        const available = this.registry.getAll().map((a) => a.id).join(', ')
        console.warn(`[Action:UNKNOWN] Action "${actionType}" not registered. Available: ${available}`)
        return {
          success: false,
          action: actionType,
          message: `Unknown action: "${actionType}". Supported actions: ${available}`,
          error: 'Unknown action type',
        }
      }

      const startTime = performance.now()
      console.log(`[Action:START] [${actionType}] (Handler: ${handler.id}) Target: "${effectivePane}" | Payload:`, JSON.stringify(payload))

      const ctx = this.createContext()
      const result = await handler.execute(ctx, payload, effectivePane)
      const durationMs = Math.round(performance.now() - startTime)

      if (result.success) {
        console.log(`[Action:SUCCESS] [${actionType}] Completed in ${durationMs}ms | Message: ${result.message}`)
      } else {
        console.warn(`[Action:FAILED] [${actionType}] Finished with failure in ${durationMs}ms | Error: ${result.error || result.message}`)
      }

      return result
    } catch (err: any) {
      console.error(`[Action:EXCEPTION] Execution error: ${err.message}`, err)
      this.notify(`❌ Action failed: ${err.message}`)
      return {
        success: false,
        message: err.message || 'Action execution failed',
        error: err.message,
      }
    }
  }

  /**
   * Generates prompt guide for AI models with both Book and Note folder context
   */
  public getPromptGuide(_targetPane?: 'book' | 'note', customInstructions?: string): string {
    return this.registry.generatePromptGuide(this.getWorkspaceFolders(), customInstructions)
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

  public clearRecentDispatched(): void {
    this.recentDispatchedHashes.clear()
  }
}
