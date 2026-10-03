import { app, BrowserWindow, ipcMain, shell, Menu, dialog, nativeImage, clipboard, protocol, net } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { exec } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { BookViewHandler, CHROME_DESKTOP_UA } from './views/bookViewHandler'
import { AIViewHandler } from './views/aiViewHandler'
import { NoteViewHandler } from './views/noteViewHandler'
import { SessionManager } from './services/sessionManager'
import { LayoutManager } from './services/layoutManager'
import { AuthCoordinator } from './auth/authCoordinator'
import { BookSourceManager, BookSource } from './services/bookSourceManager'
import { AISourceManager, AISource } from './services/aiSourceManager'
import { NoteSourceManager, NoteSource } from './services/noteSourceManager'
import { ActionDispatcher } from './services/actionDispatcher'
import { McpManager } from './services/mcpManager'

const BINARY_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'tiff', 'svgz',
  'zip', 'tar', 'gz', '7z', 'rar', 'bz2', 'xz',
  'exe', 'dll', 'so', 'dylib', 'bin', 'iso', 'dmg',
  'mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a',
  'mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv',
  'ttf', 'otf', 'woff', 'woff2', 'eot'
])

// Register custom protocol scheme for local files (PDFs, images) before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-file',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      corsEnabled: true,
      stream: true,
    },
  },
])

async function isBinaryFile(filePath: string): Promise<boolean> {
  try {
    const ext = path.extname(filePath).toLowerCase().replace('.', '')
    if (BINARY_EXTENSIONS.has(ext)) return true

    // Check first 512 bytes for null byte
    const fd = await fs.promises.open(filePath, 'r')
    const buffer = Buffer.alloc(512)
    const { bytesRead } = await fd.read(buffer, 0, 512, 0)
    await fd.close()

    for (let i = 0; i < bytesRead; i++) {
      if (buffer[i] === 0) return true
    }
    return false
  } catch (_) {
    return false
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Disable automation control flag so Akamai / WAF does not flag the webview as automated
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled')
// Disable native Windows WebAuthn UI to prevent the "Insert your security key into the USB port" dialog
app.commandLine.appendSwitch('disable-features', 'WebAuthenticationUseNativeWinApi')

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

// Globally override default user agent across all windows and popups
app.userAgentFallback = CHROME_DESKTOP_UA

let mainWindow: BrowserWindow | null = null
let bookSourceManager: BookSourceManager | null = null
let aiSourceManager: AISourceManager | null = null
let noteSourceManager: NoteSourceManager | null = null
let bookHandler: BookViewHandler | null = null
let aiHandler: AIViewHandler | null = null
let noteHandler: NoteViewHandler | null = null
let sessionManager: SessionManager | null = null
let layoutManager: LayoutManager | null = null

function getPreloadPath(): string {
  const preloadCjs = path.join(__dirname, 'preload.cjs')
  const preloadMjs = path.join(__dirname, 'preload.mjs')
  const preloadJs = path.join(__dirname, 'preload.js')

  if (fs.existsSync(preloadCjs)) return preloadCjs
  if (fs.existsSync(preloadMjs)) return preloadMjs
  return preloadJs
}

function createWindow() {
  const preloadPath = getPreloadPath()
  console.log('[Workbench] Starting main window with preload:', preloadPath)

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Workbench | O\'Reilly & ChatGPT',
    backgroundColor: '#0b0f17',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      plugins: true,
    },
  })

  // Initialize modular view and service handlers
  bookSourceManager = new BookSourceManager()
  aiSourceManager = new AISourceManager()
  noteSourceManager = new NoteSourceManager()
  bookHandler = new BookViewHandler(mainWindow, bookSourceManager)
  aiHandler = new AIViewHandler(mainWindow, aiSourceManager)
  noteHandler = new NoteViewHandler(mainWindow, noteSourceManager)
  sessionManager = new SessionManager(bookHandler, aiHandler, noteHandler)
  layoutManager = new LayoutManager(mainWindow, bookHandler, aiHandler, noteHandler)
  ActionDispatcher.getInstance().setMainWindow(mainWindow)
  ActionDispatcher.getInstance().setAIHandler(aiHandler)

  // Initialize MCP (Model Context Protocol) Manager in the background
  McpManager.getInstance().initialize().catch((err) => {
    console.error('[Main] Failed to initialize McpManager:', err)
  })

  // Set initial bounds (handlers manage attaching their own views)
  layoutManager.applyBounds()

  // Window resize listeners
  mainWindow.on('resize', () => layoutManager?.applyBounds())
  mainWindow.on('maximize', () => layoutManager?.applyBounds())
  mainWindow.on('unmaximize', () => layoutManager?.applyBounds())

  // Register IPC dispatchers to modular handlers
  registerIpcHandlers()

  // Load UI in main window
  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

function registerIpcHandlers() {
  // Layout & Bounds
  ipcMain.on('workbench:update-bounds', (_, bounds) => {
    layoutManager?.updateMeasuredBounds(bounds)
  })

  ipcMain.on('workbench:set-split', (_, { ratio, isSwapped }) => {
    layoutManager?.setSplit(ratio, isSwapped)
  })

  ipcMain.on('workbench:set-vertical-split', (_, { ratio }) => {
    layoutManager?.setVerticalSplit(ratio)
  })

  ipcMain.on('workbench:set-views-visible', (_, params: boolean | { target?: 'book' | 'ai' | 'note' | 'all'; visible: boolean }) => {
    layoutManager?.setViewsVisible(params)
  })

  ipcMain.on('workbench:set-views-dragging', (_, isDragging: boolean) => {
    layoutManager?.setViewsDragging(isDragging)
  })

  // Navigation
  ipcMain.on('workbench:nav-action', (_, { target, command }) => {
    if (target === 'book') {
      bookHandler?.handleNavAction(command)
    } else if (target === 'ai') {
      aiHandler?.handleNavAction(command)
    } else if (target === 'note') {
      noteHandler?.handleNavAction(command)
    }
  })

  // AI Prompts & Native Menu
  ipcMain.handle('workbench:ask-ai', async (_, { templateKey, customPrompt }) => {
    if (!aiHandler || !bookHandler) return { success: false, error: 'Handlers not initialized' }
    return await aiHandler.doAskAI(templateKey, customPrompt, () => bookHandler!.extractSelection())
  })

  ipcMain.on('workbench:show-ask-ai-menu', () => {
    if (!aiHandler || !bookHandler) return
    aiHandler.showAskAIMenu(() => bookHandler!.extractSelection())
  })

  function formatBookCitation(
    text: string,
    metadata?: { title?: string; chapter?: string; url?: string }
  ): string {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const dateStr = new Date().toLocaleDateString()

    const rawTitle = metadata?.title || ''
    const cleanTitle = rawTitle.replace(/\s*[-–|]\s*(O'Reilly|Amazon Kindle|Book|Learning).*$/i, '').trim() || 'Reading Excerpt'
    const cleanChapter = (metadata?.chapter || '').trim()
    const url = metadata?.url || ''

    const quotedLines = text.split('\n').map((l) => `> ${l}`).join('\n')
    let attr = `> \n> — `
    if (cleanChapter && cleanTitle && cleanChapter !== cleanTitle) {
      attr += `*${cleanTitle}* (${cleanChapter})`
    } else if (cleanTitle) {
      attr += `*${cleanTitle}*`
    } else if (cleanChapter) {
      attr += `*${cleanChapter}*`
    }

    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      attr += ` · [🔗 Open in Book](${url})`
    }
    attr += ` · *${dateStr} ${timestamp}*`

    return `\n\n---\n### 📖 Book Excerpt\n${quotedLines}\n${attr}\n\n`
  }

  // OneNote & Clipping
  ipcMain.handle('workbench:clip-selection', async () => {
    if (!noteHandler || !bookHandler) return { success: false, error: 'Handlers not ready' }
    return await noteHandler.clipSelection(async () => {
      const res = await bookHandler!.extractSelectionWithCitation()
      return res.formattedCitation || res.rawText
    })
  })

  // Cross-Pane: Extract Selection from any active pane
  ipcMain.handle('workbench:extract-selection', async (_, target: 'book' | 'ai' | 'note' = 'book') => {
    try {
      let text = ''
      if (target === 'book' && bookHandler) {
        const res = await bookHandler.extractSelectionWithCitation()
        text = res.formattedCitation || res.rawText
      } else if (target === 'ai' && aiHandler) {
        text = await aiHandler.extractSelection()
      } else if (target === 'note' && noteHandler) {
        text = await noteHandler.extractSelection()
      }
      return { success: true, text }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to extract selection' }
    }
  })

  // BookView In-Page Floating Bubble Action
  ipcMain.on('workbench:book-bubble-action', async (_, data: {
    action: 'clip-note' | 'ask-ai'
    templateKey?: string
    text: string
    metadata?: { title?: string; chapter?: string; url?: string }
  }) => {
    try {
      if (data.action === 'clip-note') {
        const citation = formatBookCitation(data.text, data.metadata)
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('workbench:clip-selection-text', {
            source: 'book',
            text: citation,
            rawText: data.text,
            metadata: data.metadata,
          })
          mainWindow.webContents.send('workbench:notify', '📝 Clipped excerpt to Notes with citation!')
        }
      } else if (data.action === 'ask-ai') {
        const templateKey = data.templateKey || 'explain'
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('workbench:ask-ai-with-text', {
            templateKey,
            text: data.text,
          })
        } else if (aiHandler) {
          await aiHandler.doAskAI(templateKey, undefined, async () => data.text)
        }
      }
    } catch (err: any) {
      console.error('[Main] book-bubble-action error:', err)
    }
  })

  // Cross-Pane: Extract Last AI Response or Selection with Markdown formatting
  ipcMain.handle('workbench:extract-last-response', async () => {
    if (!aiHandler) return { success: false, error: 'AI handler not ready' }
    try {
      const data = await aiHandler.extractLastResponse()
      return { success: true, data }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to extract last response' }
    }
  })

  // Cross-Pane: Extract Code Blocks from Chat
  ipcMain.handle('workbench:extract-ai-code-blocks', async () => {
    if (!aiHandler) return { success: false, error: 'AI handler not ready', blocks: [] }
    try {
      const blocks = await aiHandler.extractCodeBlocks()
      return { success: true, blocks }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to extract code blocks', blocks: [] }
    }
  })

  // Cross-Pane: Extract Full Conversation Transcript
  ipcMain.handle('workbench:extract-ai-transcript', async () => {
    if (!aiHandler) return { success: false, error: 'AI handler not ready' }
    try {
      const transcript = await aiHandler.extractFullTranscript()
      return { success: true, transcript }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to extract transcript' }
    }
  })

  // Cross-Pane: Save AI Response, Code Blocks, or Transcript to NoteView
  ipcMain.handle(
    'workbench:save-ai-content',
    async (
      _,
      {
        type = 'response',
        targetDir,
        activeFilePath,
      }: {
        type?: 'response' | 'code' | 'transcript'
        targetDir?: string
        activeFilePath?: string
      }
    ) => {
      if (!aiHandler) return { success: false, error: 'AI handler not ready' }

      try {
        const effectiveDir =
          targetDir ||
          (activeFilePath ? path.dirname(activeFilePath) : null) ||
          app.getPath('documents')

        if (type === 'response') {
          const res = await aiHandler.extractLastResponse()
          if (!res.fullMarkdown) {
            return { success: false, error: 'No AI response or selection found to save' }
          }

          let savePath = activeFilePath

          if (!savePath || !fs.existsSync(savePath)) {
            savePath = path.join(effectiveDir, 'Clippings.md')
          }

          let existing = ''
          if (fs.existsSync(savePath)) {
            existing = await fs.promises.readFile(savePath, 'utf-8')
          }
          const separator =
            existing.length > 0 && !existing.endsWith('\n\n')
              ? existing.endsWith('\n')
                ? '\n'
                : '\n\n'
              : ''
          await fs.promises.writeFile(savePath, existing + separator + res.fullMarkdown, 'utf-8')

          const fileName = path.basename(savePath)
          return {
            success: true,
            filePath: savePath,
            fileName,
            hasSelection: !!res.selectedText,
            message: `📥 Saved ${res.selectedText ? 'selection' : 'AI response'} to ${fileName}`,
          }
        } else if (type === 'code') {
          const blocks = await aiHandler.extractCodeBlocks()
          if (!blocks || blocks.length === 0) {
            return { success: false, error: 'No code blocks found in current chat view' }
          }

          const savedFiles: string[] = []
          for (const block of blocks) {
            let targetName = block.suggestedFileName
            let targetPath = path.join(effectiveDir, targetName)
            let counter = 1
            while (fs.existsSync(targetPath)) {
              const ext = path.extname(targetName)
              const base = path.basename(targetName, ext)
              targetPath = path.join(effectiveDir, `${base}-${counter}${ext}`)
              counter++
            }
            await fs.promises.writeFile(targetPath, block.code, 'utf-8')
            savedFiles.push(path.basename(targetPath))
          }

          return {
            success: true,
            count: savedFiles.length,
            files: savedFiles,
            message: `💾 Extracted ${savedFiles.length} code file(s) into folder`,
          }
        } else if (type === 'transcript') {
          const transcript = await aiHandler.extractFullTranscript()
          if (!transcript) {
            return { success: false, error: 'No chat messages found to export' }
          }

          const now = new Date()
          const pad = (n: number) => String(n).padStart(2, '0')
          const dateTag = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
          const fileName = `Chat-Session-${dateTag}.md`
          const targetPath = path.join(effectiveDir, fileName)

          await fs.promises.writeFile(targetPath, transcript, 'utf-8')
          return {
            success: true,
            filePath: targetPath,
            fileName,
            message: `📜 Exported full chat transcript to ${fileName}`,
          }
        }

        return { success: false, error: 'Unknown save type' }
      } catch (err: any) {
        console.error('[Main] save-ai-content error:', err)
        return { success: false, error: err?.message || 'Failed to save AI content' }
      }
    }
  )

  // Cross-Pane: Send Text Directly to AI
  ipcMain.handle('workbench:send-text-to-ai', async (_, { text, templateKey = 'raw', customPrompt }: { text: string; templateKey?: string; customPrompt?: string }) => {
    if (!aiHandler) return { success: false, error: 'AI handler not ready' }
    return await aiHandler.doAskAI(templateKey, customPrompt, async () => text)
  })

  // Cross-Pane: Send File from Notes to AI (Upload + Prompt Paste)
  ipcMain.handle('workbench:send-file-to-ai', async (_, { filePath, instruction }: { filePath: string; instruction?: string }) => {
    if (!aiHandler) return { success: false, error: 'AI handler not ready' }
    return await aiHandler.sendFileToAI(filePath, instruction)
  })

  // Cross-Pane: Send Multiple Files to AI (Batch Upload)
  ipcMain.handle('workbench:send-files-to-ai', async (_, { filePaths, instruction }: { filePaths: string[]; instruction?: string }) => {
    if (!aiHandler) return { success: false, error: 'AI handler not ready' }
    return await aiHandler.sendFilesToAI(filePaths, instruction)
  })

  // Workbench Action Model Handlers
  ipcMain.on('workbench:action-triggered', async (_, payload) => {
    const actName = payload?.action || payload?.type || 'unknown'
    console.log(`[Main:IPC] Received "workbench:action-triggered" for action: "${actName}"`)
    try {
      const result = await ActionDispatcher.getInstance().dispatch(payload)
      if (result.message && result.message.includes('Duplicate action suppressed')) {
        console.log(`[Main:IPC] Action "${actName}" suppressed as duplicate`)
        return
      }
      console.log(`[Main:IPC] Action "${actName}" execution finished with status: ${result.success ? 'SUCCESS' : 'FAILED'}`)
      if (aiHandler && ActionDispatcher.getInstance().isAutoFeedbackLoopEnabled()) {
        console.log(`[Main:IPC] Forwarding result of "${actName}" to AI feedback loop`)
        await aiHandler.handleActionExecutionFeedback(payload, result)
      }
    } catch (err: any) {
      console.error(`[Main:IPC] Error executing triggered action "${actName}":`, err)
      if (aiHandler && ActionDispatcher.getInstance().isAutoFeedbackLoopEnabled()) {
        await aiHandler.handleActionExecutionFeedback(payload, {
          success: false,
          message: err.message,
          error: err.message,
        })
      }
    }
  })

  ipcMain.handle('workbench:execute-action', async (_, payload) => {
    const actName = payload?.action || payload?.type || 'unknown'
    console.log(`[Main:IPC] Invoking "workbench:execute-action" for action: "${actName}"`)
    const result = await ActionDispatcher.getInstance().dispatch(payload)
    if (!result.message?.includes('Duplicate action suppressed') && aiHandler && ActionDispatcher.getInstance().isAutoFeedbackLoopEnabled()) {
      await aiHandler.handleActionExecutionFeedback(payload, result)
    }
    return result
  })

  ipcMain.handle('workbench:set-auto-feedback-loop', (_, enabled: boolean) => {
    ActionDispatcher.getInstance().setAutoFeedbackLoop(Boolean(enabled))
    return { success: true, enabled: Boolean(enabled) }
  })

  ipcMain.handle('workbench:get-auto-feedback-loop', () => {
    return ActionDispatcher.getInstance().isAutoFeedbackLoopEnabled()
  })

  ipcMain.handle('workbench:get-workspace-folders', () => {
    return ActionDispatcher.getInstance().getWorkspaceFolders()
  })

  ipcMain.handle('workbench:set-action-target', (_, { target, customPath }: { target: 'book' | 'note' | 'custom'; customPath?: string }) => {
    ActionDispatcher.getInstance().setActiveTarget(target, customPath)
    return ActionDispatcher.getInstance().getWorkspaceFolders()
  })

  ipcMain.handle('workbench:browse-directory', async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return null
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Action Working Directory',
    })
    if (!res.canceled && res.filePaths.length > 0) {
      return res.filePaths[0]
    }
    return null
  })

  ipcMain.handle('workbench:set-action-mode', async (_, params: { enabled: boolean; customInstructions?: string; primeAI?: boolean }) => {
    const enabled = Boolean(params?.enabled)
    ActionDispatcher.getInstance().setActionMode(enabled)
    if (aiHandler) {
      aiHandler.setActionMode(enabled)
      // Only prime AI if explicitly requested (params.primeAI === true).
      // NEVER auto-prime on app launch, component mount, toggle, or settings save!
      if (enabled && params?.primeAI === true) {
        const prompt = ActionDispatcher.getInstance().getPromptGuide(undefined, params?.customInstructions)
        const primeResult = await aiHandler.enableActionMode(prompt, true)
        aiHandler.notifyChatPrimeStatus()
        return { enabled: true, ...primeResult }
      } else {
        aiHandler.notifyChatPrimeStatus()
      }
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('workbench:action-mode-changed', { enabled })
    }
    return { success: true, enabled }
  })

  ipcMain.on('workbench:chat-prime-status-changed', (_, data: { isPrimed: boolean }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('workbench:chat-prime-status-changed', data)
    }
  })

  ipcMain.handle('workbench:is-ai-view', (event) => {
    return Boolean(aiHandler && aiHandler.hasWebContents(event.sender))
  })

  ipcMain.handle('workbench:get-action-mode', async () => {
    return { enabled: ActionDispatcher.getInstance().isActionModeEnabled() }
  })

  ipcMain.handle('workbench:get-chat-prime-status', async () => {
    if (aiHandler) {
      const isPrimed = await aiHandler.isChatPrimed()
      return { isPrimed }
    }
    return { isPrimed: false }
  })

  ipcMain.on('workbench:prime-active-chat', async () => {
    if (aiHandler) {
      ActionDispatcher.getInstance().setActionMode(true)
      aiHandler.setActionMode(true)
      const prompt = ActionDispatcher.getInstance().getPromptGuide()
      await aiHandler.enableActionMode(prompt, true)
      aiHandler.notifyChatPrimeStatus()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('workbench:action-mode-changed', { enabled: true })
        mainWindow.webContents.send('workbench:chat-prime-status-changed', { isPrimed: true })
      }
    }
  })

  ipcMain.handle('workbench:get-action-prompt', async (_, params?: { targetPane?: 'book' | 'note'; customInstructions?: string } | 'book' | 'note') => {
    const customInstructions = typeof params === 'object' ? params?.customInstructions : undefined
    return ActionDispatcher.getInstance().getPromptGuide(undefined, customInstructions)
  })

  ipcMain.on('workbench:report-active-directory', (_, data: { target?: 'book' | 'note'; currentPath: string; rootPath?: string }) => {
    if (data?.currentPath) {
      ActionDispatcher.getInstance().setActiveDirectory(data.target || 'book', data.currentPath, data.rootPath)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('workbench:active-directory-changed', {
          target: data.target || 'book',
          currentPath: data.currentPath,
          rootPath: data.rootPath,
        })
      }
    }
  })

  // MCP (Model Context Protocol) Server Management
  ipcMain.handle('workbench:mcp-get-config', () => {
    const manager = McpManager.getInstance()
    return {
      path: manager.getConfigPath(),
      config: manager.readConfig(),
    }
  })

  ipcMain.handle('workbench:mcp-save-config', async (_, config) => {
    const manager = McpManager.getInstance()
    const saved = manager.saveConfig(config)
    if (saved) {
      await manager.reload()
      ActionDispatcher.getInstance().reprimeActiveChat(false).catch(() => {})
    }
    return { success: saved, status: manager.getStatus() }
  })

  ipcMain.handle('workbench:mcp-get-status', () => {
    return McpManager.getInstance().getStatus()
  })

  ipcMain.handle('workbench:mcp-reload', async () => {
    const manager = McpManager.getInstance()
    const status = await manager.reload()
    ActionDispatcher.getInstance().reprimeActiveChat(false).catch(() => {})
    return { success: true, status }
  })

  ipcMain.handle('workbench:mcp-open-config', async () => {
    const configPath = McpManager.getInstance().getConfigPath()
    if (fs.existsSync(configPath)) {
      shell.showItemInFolder(configPath)
      return { success: true, path: configPath }
    }
    return { success: false, error: 'Config file does not exist' }
  })

  ipcMain.handle('workbench:mcp-remove-server', async (_, serverName: string) => {
    const manager = McpManager.getInstance()
    const removed = await manager.removeServer(serverName)
    if (removed) {
      ActionDispatcher.getInstance().reprimeActiveChat(false).catch(() => {})
    }
    return { success: removed, status: manager.getStatus() }
  })

  ipcMain.handle('workbench:mcp-configure-server', async (_, { serverName, updates }: { serverName: string; updates: any }) => {
    const manager = McpManager.getInstance()
    const result = await manager.configureServer(serverName, updates)
    ActionDispatcher.getInstance().reprimeActiveChat(false).catch(() => {})
    return { ...result, status: manager.getStatus() }
  })

  // Cross-Pane: Native File Drag & Drop (OS-level drag to external apps, AI view, or folders)
  ipcMain.on('workbench:start-drag-file', (event, filePath: string | string[]) => {
    try {
      const paths = Array.isArray(filePath) ? filePath : [filePath]
      const validPaths = paths.filter((p) => p && fs.existsSync(p))
      if (validPaths.length === 0) return

      const dragIcon = nativeImage.createFromDataURL(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAExJREFUWEft0rERwCAMBEEa/TfpvE4LhBhyyD2c9SvdjR2PZfX4mAC4/fEZAOAJAOABAOABAOABAOAJAOABAOABAOABAOABAOAJAOABAODnAX5sUo1k8zI4/AAAAABJRU5ErkJggg=='
      )

      aiHandler?.setDraggingFiles(validPaths)

      event.sender.startDrag({
        file: validPaths[0],
        files: validPaths.length > 1 ? validPaths : undefined,
        icon: dragIcon,
      })

      // Retain the dragged file reference during the drag loop.
      // Auto-clear after 15s if the drag was abandoned without drop
      setTimeout(() => {
        aiHandler?.setDraggingFile(null)
      }, 15000)

      if (!event.sender.isDestroyed()) {
        event.sender.send('workbench:drag-ended')
      }
    } catch (err) {
      console.error('[Main] Failed to start native drag:', err)
      aiHandler?.setDraggingFile(null)
      if (!event.sender.isDestroyed()) {
        event.sender.send('workbench:drag-ended')
      }
    }
  })

  // Modular Handler: ChatView Dropped File Upload (single or multiple)
  ipcMain.on('workbench:chatview-file-dropped', async (_, data: { fileName?: string; filePath?: string; filePaths?: string[] }) => {
    try {
      const targetPaths = data?.filePaths || (data?.filePath ? [data.filePath] : (aiHandler?.getDraggingFiles() || []))
      aiHandler?.setDraggingFile(null)

      if (targetPaths.length > 0 && aiHandler) {
        const res = await aiHandler.sendFilesToAI(targetPaths)
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (res.success) {
            mainWindow.webContents.send(
              'workbench:notify',
              `🚀 Uploaded ${targetPaths.length} file${targetPaths.length > 1 ? 's' : ''} to Chat!`
            )
          } else {
            mainWindow.webContents.send(
              'workbench:notify',
              `⚠️ ${res.error || 'Failed to upload files to Chat'}`
            )
          }
        }
      }
    } catch (err: any) {
      console.error('[Main] chatview-file-dropped error:', err)
    }
  })

  // Modular Handler: ChatView Pasted File Upload (Ctrl+V into ChatView)
  ipcMain.on('workbench:chatview-file-pasted', async (_, data: { fileName?: string; filePath?: string; filePaths?: string[] }) => {
    try {
      const targetPaths = data?.filePaths || (data?.filePath ? [data.filePath] : (aiHandler?.consumeClipboardFiles() || []))
      if (targetPaths.length > 0 && aiHandler) {
        const res = await aiHandler.sendFilesToAI(targetPaths)
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (res.success) {
            mainWindow.webContents.send(
              'workbench:notify',
              `📎 Attached ${targetPaths.length} file${targetPaths.length > 1 ? 's' : ''} to Chat!`
            )
          } else {
            mainWindow.webContents.send(
              'workbench:notify',
              `⚠️ ${res.error || 'Failed to attach files to Chat'}`
            )
          }
        }
      }
    } catch (err: any) {
      console.error('[Main] chatview-file-pasted error:', err)
    }
  })

  // Modular Handler: Copy / Cut Files to System Clipboard (CF_HDROP on Windows)
  ipcMain.handle('workbench:copy-files-to-clipboard', async (_, { paths, isCut: _isCut }: { paths: string[]; isCut?: boolean }) => {
    try {
      const validPaths = paths.filter((p) => p && fs.existsSync(p))
      if (validPaths.length === 0) return { success: false, error: 'No valid files to copy' }

      aiHandler?.setClipboardFiles(validPaths)

      // Fallback plain text in clipboard (one per line)
      clipboard.writeText(validPaths.join('\r\n'))

      // On Windows: Execute PowerShell Set-Clipboard -Path to populate true OS CF_HDROP format
      if (process.platform === 'win32') {
        const escapedPaths = validPaths.map((p) => `'${p.replace(/'/g, "''")}'`).join(',')
        const psCommand = `powershell.exe -NoProfile -Command "Set-Clipboard -Path @(${escapedPaths})"`
        exec(psCommand, { windowsHide: true }, (err) => {
          if (err) console.warn('[Main] Set-Clipboard warning:', err)
        })
      }

      return { success: true, count: validPaths.length }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to copy files to clipboard' }
    }
  })

  // Modular Handler: Read Files from System Clipboard (Windows File Explorer / CF_HDROP / URI-list)
  ipcMain.handle('workbench:get-clipboard-files', async () => {
    try {
      const resultPaths: string[] = []

      // 1. Try reading CF_HDROP buffer directly on Windows
      if (process.platform === 'win32') {
        try {
          const hdrop = clipboard.readBuffer('CF_HDROP')
          if (hdrop && hdrop.length >= 20) {
            const pFiles = hdrop.readUInt32LE(0)
            const fWide = hdrop.readUInt32LE(16)
            if (pFiles < hdrop.length) {
              const sub = hdrop.subarray(pFiles)
              const encoding = fWide !== 0 ? 'utf16le' : 'utf8'
              const rawStr = sub.toString(encoding)
              const parts = rawStr.split('\0').map((s) => s.trim()).filter((s) => s.length > 0)
              for (const p of parts) {
                if (fs.existsSync(p)) {
                  resultPaths.push(path.normalize(p))
                }
              }
            }
          }
        } catch (err) {
          console.warn('[Main] CF_HDROP parse warning:', err)
        }

        // 2. Try FileNameW format
        if (resultPaths.length === 0) {
          try {
            const fileNameW = clipboard.read('FileNameW')
            if (fileNameW && fileNameW.trim() && fs.existsSync(fileNameW.trim())) {
              resultPaths.push(path.normalize(fileNameW.trim()))
            }
          } catch (_) {}
        }
      }

      // 3. Try text/uri-list
      if (resultPaths.length === 0) {
        try {
          const uriList = clipboard.read('text/uri-list')
          if (uriList && uriList.trim()) {
            const lines = uriList.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith('file://'))
            for (const line of lines) {
              try {
                const parsed = new URL(line)
                let filePath = decodeURIComponent(parsed.pathname)
                if (process.platform === 'win32' && filePath.startsWith('/')) {
                  filePath = filePath.slice(1)
                }
                if (fs.existsSync(filePath)) {
                  resultPaths.push(path.normalize(filePath))
                }
              } catch (_) {}
            }
          }
        } catch (_) {}
      }

      // 4. Try plain text lines (in case paths were copied as text)
      if (resultPaths.length === 0) {
        try {
          const text = clipboard.readText()
          if (text && text.trim()) {
            const lines = text.split(/\r?\n/).map((l) => l.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
            for (const l of lines) {
              if (fs.existsSync(l)) {
                resultPaths.push(path.normalize(l))
              }
            }
          }
        } catch (_) {}
      }

      // 5. PowerShell Get-Clipboard -Format FileDropList fallback on Windows
      if (resultPaths.length === 0 && process.platform === 'win32') {
        try {
          const psCommand = `powershell.exe -NoProfile -Command "(Get-Clipboard -Format FileDropList).FullName"`
          const output = await new Promise<string>((resolve) => {
            exec(psCommand, { windowsHide: true, timeout: 2000 }, (err, stdout) => {
              if (err || !stdout) resolve('')
              else resolve(stdout)
            })
          })
          if (output && output.trim()) {
            const psLines = output.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
            for (const p of psLines) {
              if (fs.existsSync(p)) {
                resultPaths.push(path.normalize(p))
              }
            }
          }
        } catch (_) {}
      }

      const uniquePaths = [...new Set(resultPaths)]
      return { success: true, paths: uniquePaths }
    } catch (err: any) {
      console.error('[Main] get-clipboard-files error:', err)
      return { success: false, paths: [], error: err.message || 'Failed to read clipboard files' }
    }
  })

  ipcMain.handle('workbench:load-notes', () => {
    const storeEnabled = sessionManager?.getSettings().storeNoteCredentials ?? true
    return noteHandler?.loadNotes(storeEnabled) ?? []
  })

  ipcMain.handle('workbench:save-notes', (_, notes) => {
    const storeEnabled = sessionManager?.getSettings().storeNoteCredentials ?? true
    return noteHandler?.saveNotes(notes, storeEnabled) ?? { success: false }
  })

  // Session Settings & Isolated Delete Login
  ipcMain.handle('workbench:get-session-settings', () => {
    return sessionManager?.getSettings()
  })

  ipcMain.handle('workbench:update-session-settings', (_, updates) => {
    if (!sessionManager) return { success: false }
    const updated = sessionManager.updateSettings(updates)
    return { success: true, settings: updated }
  })

  ipcMain.handle('workbench:clear-session', async (_, target: 'book' | 'ai' | 'note', scope: string = 'current') => {
    if (!sessionManager) return { success: false, error: 'Session manager not ready' }
    return await sessionManager.clearSession(target, scope)
  })

  // External Links
  ipcMain.on('workbench:open-external', (_, url: string) => {
    if (url) shell.openExternal(url)
  })

  // Book Sources Configuration
  ipcMain.handle('workbench:get-book-sources', () => {
    return bookSourceManager?.getData() ?? { sources: [], activeSourceId: '' }
  })

  ipcMain.handle('workbench:set-active-book-source', (_, sourceId: string) => {
    if (!bookSourceManager || !bookHandler) return { success: false }
    const target = bookSourceManager.setActiveSource(sourceId)
    if (target) {
      bookHandler.loadBookSource(target)
      return { success: true, activeSource: target }
    }
    return { success: false, error: 'Source not found' }
  })

  ipcMain.handle(
    'workbench:save-book-sources',
    (_, { sources, activeSourceId }: { sources: BookSource[]; activeSourceId?: string }) => {
      if (!bookSourceManager || !bookHandler) return { success: false }
      const updated = bookSourceManager.saveSources(sources, activeSourceId)
      const active = bookSourceManager.getActiveSource()
      bookHandler.loadBookSource(active)
      return { success: true, data: updated }
    }
  )

  ipcMain.on('workbench:show-book-source-menu', () => {
    if (!mainWindow || mainWindow.isDestroyed() || !bookSourceManager) return
    const data = bookSourceManager.getData()
    const active = bookSourceManager.getActiveSource()

    const menuTemplate: Electron.MenuItemConstructorOptions[] = [
      { label: 'Reading Platform:', enabled: false },
      { type: 'separator' },
      ...data.sources.map((s) => ({
        label: s.name,
        type: 'radio' as const,
        checked: s.id === active.id,
        click: () => {
          bookSourceManager!.setActiveSource(s.id)
          bookHandler?.loadBookSource(s)
          mainWindow!.webContents.send('workbench:book-source-changed', {
            activeSourceId: s.id,
            activeSource: s,
          })
        },
      })),
      { type: 'separator' },
      {
        label: '⚙️ Configure Book Sites...',
        click: () => {
          mainWindow!.webContents.send('workbench:open-book-source-modal')
        },
      },
    ]

    const menu = Menu.buildFromTemplate(menuTemplate)
    menu.popup({ window: mainWindow })
  })

  // Configurable AI Sources Management
  ipcMain.handle('workbench:get-ai-sources', () => {
    if (!aiSourceManager) return { sources: [], activeSourceId: 'chatgpt' }
    return aiSourceManager.getData()
  })

  ipcMain.handle('workbench:set-active-ai-source', (_, sourceId: string) => {
    if (!aiSourceManager || !aiHandler) return { success: false }
    const target = aiSourceManager.setActiveSource(sourceId)
    if (target) {
      aiHandler.loadAISource(target)
      return { success: true, activeSource: target }
    }
    return { success: false, error: 'Source not found' }
  })

  ipcMain.handle(
    'workbench:save-ai-sources',
    (_, { sources, activeSourceId }: { sources: AISource[]; activeSourceId?: string }) => {
      if (!aiSourceManager || !aiHandler) return { success: false }
      const updated = aiSourceManager.saveSources(sources, activeSourceId)
      const active = aiSourceManager.getActiveSource()
      aiHandler.loadAISource(active)
      return { success: true, data: updated }
    }
  )

  ipcMain.on('workbench:show-ai-source-menu', () => {
    if (!mainWindow || mainWindow.isDestroyed() || !aiSourceManager) return
    const data = aiSourceManager.getData()
    const active = aiSourceManager.getActiveSource()

    const menuTemplate: Electron.MenuItemConstructorOptions[] = [
      { label: 'AI Assistant Platform:', enabled: false },
      { type: 'separator' },
      ...data.sources.map((s) => ({
        label: s.name,
        type: 'radio' as const,
        checked: s.id === active.id,
        click: () => {
          aiSourceManager!.setActiveSource(s.id)
          aiHandler?.loadAISource(s)
          mainWindow!.webContents.send('workbench:ai-source-changed', {
            activeSourceId: s.id,
            activeSource: s,
          })
        },
      })),
      { type: 'separator' },
      {
        label: '⚙️ Configure AI Sites...',
        click: () => {
          mainWindow!.webContents.send('workbench:open-ai-source-modal')
        },
      },
    ]

    const menu = Menu.buildFromTemplate(menuTemplate)
    menu.popup({ window: mainWindow })
  })

  // Configurable Note Sources Management
  ipcMain.handle('workbench:get-note-sources', () => {
    if (!noteSourceManager) return { sources: [], activeSourceId: 'onenote' }
    return noteSourceManager.getData()
  })

  ipcMain.handle('workbench:set-active-note-source', (_, sourceId: string) => {
    if (!noteSourceManager || !noteHandler) return { success: false }
    const target = noteSourceManager.setActiveSource(sourceId)
    if (target) {
      noteHandler.loadNoteSource(target)
      mainWindow!.webContents.send('workbench:note-source-changed', {
        activeSourceId: target.id,
        activeSource: target,
      })
      return { success: true, activeSource: target }
    }
    return { success: false, error: 'Source not found' }
  })

  ipcMain.handle(
    'workbench:save-note-sources',
    (_, { sources, activeSourceId }: { sources: NoteSource[]; activeSourceId?: string }) => {
      if (!noteSourceManager || !noteHandler) return { success: false }
      const updated = noteSourceManager.saveSources(sources, activeSourceId)
      const active = noteSourceManager.getActiveSource()
      noteHandler.loadNoteSource(active)
      mainWindow!.webContents.send('workbench:note-source-changed', {
        activeSourceId: active.id,
        activeSource: active,
      })
      return { success: true, data: updated }
    }
  )

  ipcMain.on('workbench:show-note-source-menu', () => {
    if (!mainWindow || mainWindow.isDestroyed() || !noteSourceManager) return
    const data = noteSourceManager.getData()
    const active = noteSourceManager.getActiveSource()

    const menuTemplate: Electron.MenuItemConstructorOptions[] = [
      { label: 'Note Platform:', enabled: false },
      { type: 'separator' },
      ...data.sources.map((s) => ({
        label: s.name,
        type: 'radio' as const,
        checked: s.id === active.id,
        click: () => {
          noteSourceManager!.setActiveSource(s.id)
          noteHandler?.loadNoteSource(s)
          mainWindow!.webContents.send('workbench:note-source-changed', {
            activeSourceId: s.id,
            activeSource: s,
          })
        },
      })),
      { type: 'separator' },
      {
        label: '⚙️ Configure Note Sites...',
        click: () => {
          mainWindow!.webContents.send('workbench:open-note-source-modal')
        },
      },
    ]

    const menu = Menu.buildFromTemplate(menuTemplate)
    menu.popup({ window: mainWindow })
  })

  ipcMain.on('workbench:show-ai-export-menu', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    const menuTemplate: Electron.MenuItemConstructorOptions[] = [
      { label: 'Chat Export Options', enabled: false },
      { type: 'separator' },
      {
        label: '💻 Extract Code Blocks to Files',
        click: () => {
          mainWindow!.webContents.send('workbench:extract-code-trigger')
        },
      },
      {
        label: '📜 Export Chat Transcript (.md)',
        click: () => {
          mainWindow!.webContents.send('workbench:export-transcript-trigger')
        },
      },
    ]

    const menu = Menu.buildFromTemplate(menuTemplate)
    menu.popup({ window: mainWindow })
  })

  // Local File Explorer IPC Handlers
  ipcMain.handle('workbench:select-folder', async (_, defaultPath?: string) => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Folder for Local Explorer',
      defaultPath: defaultPath && fs.existsSync(defaultPath) ? defaultPath : app.getPath('documents'),
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })

  ipcMain.handle('workbench:read-directory', async (_, dirPath: string) => {
    try {
      let targetPath = dirPath
      if (!targetPath || !fs.existsSync(targetPath)) {
        targetPath = app.getPath('documents')
      }

      const entries = await fs.promises.readdir(targetPath, { withFileTypes: true })
      const rawItems = await Promise.all(
        entries.map(async (entry) => {
          const itemPath = path.join(targetPath, entry.name)
          let size = 0
          let mtime = new Date().toISOString()
          let isDirectory = entry.isDirectory()

          try {
            const stat = await fs.promises.stat(itemPath)
            size = stat.size
            mtime = stat.mtime.toISOString()
            if (stat.isDirectory()) {
              isDirectory = true
            }
          } catch (_) {
            try {
              const lstat = await fs.promises.lstat(itemPath)
              size = lstat.size
              mtime = lstat.mtime.toISOString()
              if (lstat.isDirectory()) {
                isDirectory = true
              }
            } catch (__) {}
          }

          return {
            name: entry.name,
            path: itemPath,
            isDirectory,
            size,
            mtime,
            extension: isDirectory ? '' : path.extname(entry.name).toLowerCase(),
          }
        })
      )

      // Filter out hidden OS / metadata files (desktop.ini, OneDrive GUID metadata, thumbs.db)
      const items = rawItems.filter((item) => {
        const lower = item.name.toLowerCase()
        if (lower === 'desktop.ini' || lower === 'thumbs.db' || lower === '$recycle.bin') return false
        if (item.name.startsWith('.') && item.name.length > 20) return false
        return true
      })

      // Sort directories first, then descending by name
      items.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1
        if (!a.isDirectory && b.isDirectory) return 1
        return b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: 'base' })
      })

      return { success: true, items, currentPath: targetPath }
    } catch (err: any) {
      console.error('[Main] read-directory error:', err)
      return { success: false, error: err?.message || 'Failed to read directory' }
    }
  })

  ipcMain.handle('workbench:open-path', async (_, filePath: string) => {
    try {
      const errMsg = await shell.openPath(filePath)
      if (errMsg) {
        return { success: false, error: errMsg }
      }
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to open file' }
    }
  })

  ipcMain.on('workbench:show-item-in-folder', (_, filePath: string) => {
    try {
      shell.showItemInFolder(filePath)
    } catch (err) {
      console.error('[Main] showItemInFolder error:', err)
    }
  })

  ipcMain.handle('workbench:read-file-content', async (_, filePath: string) => {
    try {
      if (!fs.existsSync(filePath)) return { success: false, error: 'File not found' }
      const stat = await fs.promises.stat(filePath)
      if (stat.isDirectory()) return { success: false, error: 'Cannot read folder as text' }
      if (stat.size > 10 * 1024 * 1024) return { success: false, error: 'File too large (>10MB)' }

      if (await isBinaryFile(filePath)) {
        return {
          success: false,
          isBinary: true,
          error: 'Binary file detected. Use "Copy File" (Ctrl+C) to copy the file itself, or "Send to AI Chat" to upload it.',
        }
      }

      const content = await fs.promises.readFile(filePath, 'utf-8')
      return { success: true, content, fileName: path.basename(filePath) }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to read file' }
    }
  })

  ipcMain.handle('workbench:read-file-buffer', async (_, filePath: string) => {
    try {
      if (!fs.existsSync(filePath)) return { success: false, error: 'File not found' }
      const stat = await fs.promises.stat(filePath)
      if (stat.isDirectory()) return { success: false, error: 'Cannot read folder as binary file' }
      const buffer = await fs.promises.readFile(filePath)
      return { success: true, buffer, fileName: path.basename(filePath) }
    } catch (err: any) {
      console.error('[Main] read-file-buffer error:', err)
      return { success: false, error: err?.message || 'Failed to read file buffer' }
    }
  })

  ipcMain.handle('workbench:append-to-file', async (_, { filePath, content }: { filePath: string; content: string }) => {
    try {
      const dir = path.dirname(filePath)
      if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true })
      }
      let existing = ''
      if (fs.existsSync(filePath)) {
        existing = await fs.promises.readFile(filePath, 'utf-8')
      }
      const separator = existing.length > 0 && !existing.endsWith('\n\n') ? (existing.endsWith('\n') ? '\n' : '\n\n') : ''
      const updated = existing + separator + content
      await fs.promises.writeFile(filePath, updated, 'utf-8')
      return { success: true, filePath, fileName: path.basename(filePath) }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to append to file' }
    }
  })

  ipcMain.handle('workbench:write-file-content', async (_, { filePath, content }: { filePath: string; content: string }) => {
    try {
      const dir = path.dirname(filePath)
      if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true })
      }
      await fs.promises.writeFile(filePath, content, 'utf-8')
      return { success: true, filePath, fileName: path.basename(filePath) }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to write file' }
    }
  })

  let cachedMammoth: any = null

  ipcMain.handle('workbench:read-docx', async (_, filePath: string) => {
    try {
      if (!fs.existsSync(filePath)) return { success: false, error: 'File not found' }
      if (!cachedMammoth) {
        cachedMammoth = await import('mammoth')
      }
      const buffer = await fs.promises.readFile(filePath)

      const cacheDir = path.join(app.getPath('temp'), 'workbench-docx-cache')
      if (!fs.existsSync(cacheDir)) {
        try {
          await fs.promises.mkdir(cacheDir, { recursive: true })
        } catch (_) {}
      }

      const options = {
        convertImage: cachedMammoth.images.imgElement(async (image: any) => {
          try {
            const ext = (image.contentType?.split('/')[1] || 'png').replace('jpeg', 'jpg')
            const id = Math.random().toString(36).slice(2, 9)
            const imgPath = path.join(cacheDir, `img_${Date.now()}_${id}.${ext}`)
            const imgBuffer = await image.read()
            await fs.promises.writeFile(imgPath, imgBuffer)
            return {
              src: `local-file://${encodeURIComponent(imgPath.replace(/\\/g, '/'))}`,
            }
          } catch {
            return { src: '' }
          }
        }),
      }

      const result = await cachedMammoth.convertToHtml({ buffer }, options)
      return { success: true, html: result.value, fileName: path.basename(filePath) }
    } catch (err: any) {
      console.error('[Main] read-docx error:', err)
      return { success: false, error: err?.message || 'Failed to read Word document' }
    }
  })

  ipcMain.handle('workbench:save-docx', async (_, { filePath, html, text }: { filePath: string; html?: string; text?: string }) => {
    try {
      const dir = path.dirname(filePath)
      if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true })
      }
      const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx')
      
      const rawText = (html ? html
        .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n')
        .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n')
        .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n')
        .replace(/<li[^>]*>(.*?)<\/li>/gi, '• $1\n')
        .replace(/<p[^>]*>/gi, '')
        .replace(/<\/p>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '') : text || '')

      const lines = rawText.split('\n')
      const children: any[] = []
      
      for (const rawLine of lines) {
        const line = rawLine.trimEnd()
        if (!line.trim()) {
          children.push(new Paragraph({ children: [new TextRun('')] }))
          continue
        }
        if (line.startsWith('# ')) {
          children.push(new Paragraph({
            text: line.replace('# ', '').trim(),
            heading: HeadingLevel.HEADING_1,
          }))
        } else if (line.startsWith('## ')) {
          children.push(new Paragraph({
            text: line.replace('## ', '').trim(),
            heading: HeadingLevel.HEADING_2,
          }))
        } else if (line.startsWith('### ')) {
          children.push(new Paragraph({
            text: line.replace('### ', '').trim(),
            heading: HeadingLevel.HEADING_3,
          }))
        } else if (line.startsWith('• ') || line.startsWith('- ')) {
          children.push(new Paragraph({
            text: line.replace(/^[•\-]\s*/, '').trim(),
            bullet: { level: 0 },
          }))
        } else {
          children.push(new Paragraph({
            children: [new TextRun(line)],
          }))
        }
      }
      
      const doc = new Document({
        sections: [{
          properties: {},
          children: children.length > 0 ? children : [new Paragraph({ children: [new TextRun('')] })],
        }],
      })

      const docBuffer = await Packer.toBuffer(doc)
      await fs.promises.writeFile(filePath, docBuffer)
      return { success: true, filePath, fileName: path.basename(filePath) }
    } catch (err: any) {
      console.error('[Main] save-docx error:', err)
      return { success: false, error: err?.message || 'Failed to save Word document' }
    }
  })

  ipcMain.handle('workbench:read-spreadsheet', async (_, filePath: string) => {
    try {
      if (!fs.existsSync(filePath)) return { success: false, error: 'File not found' }
      const XLSX = await import('xlsx')
      const buffer = await fs.promises.readFile(filePath)
      const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
      
      const sheets: Record<string, { data: (string | number | null)[][]; rowCount: number; colCount: number }> = {}
      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName]
        const rawAoa = (XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as (string | number | null)[][]) || []
        
        let maxCols = 8
        for (const row of rawAoa) {
          if (row && row.length > maxCols) maxCols = row.length
        }
        const minRows = Math.max(rawAoa.length, 30)
        const filledAoa: (string | number | null)[][] = []
        for (let r = 0; r < minRows; r++) {
          const row = (rawAoa[r] ? [...rawAoa[r]] : [])
          while (row.length < maxCols) {
            row.push('')
          }
          filledAoa.push(row)
        }
        
        sheets[sheetName] = {
          data: filledAoa,
          rowCount: filledAoa.length,
          colCount: maxCols,
        }
      }
      
      return {
        success: true,
        sheetNames: workbook.SheetNames.length > 0 ? workbook.SheetNames : ['Sheet1'],
        sheets,
        fileName: path.basename(filePath),
      }
    } catch (err: any) {
      console.error('[Main] read-spreadsheet error:', err)
      return { success: false, error: err?.message || 'Failed to read spreadsheet' }
    }
  })

  ipcMain.handle('workbench:save-spreadsheet', async (_, { filePath, sheets }: { filePath: string; sheets: Record<string, (string | number | null)[][]> }) => {
    try {
      const dir = path.dirname(filePath)
      if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true })
      }
      const XLSX = await import('xlsx')
      const workbook = XLSX.utils.book_new()
      
      for (const [sheetName, aoa] of Object.entries(sheets)) {
        const trimmedAoa = (aoa || []).map((row) => [...row])
        while (trimmedAoa.length > 0 && trimmedAoa[trimmedAoa.length - 1].every((cell) => cell === '' || cell === null)) {
          trimmedAoa.pop()
        }
        const worksheet = XLSX.utils.aoa_to_sheet(trimmedAoa.length > 0 ? trimmedAoa : [['']])
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
      }

      const ext = path.extname(filePath).toLowerCase()
      const bookType = ext === '.csv' ? 'csv' : (ext === '.tsv' ? 'tsv' : 'xlsx')
      const buf = XLSX.write(workbook, { type: 'buffer', bookType: bookType as any })
      await fs.promises.writeFile(filePath, buf)
      return { success: true, filePath, fileName: path.basename(filePath) }
    } catch (err: any) {
      console.error('[Main] save-spreadsheet error:', err)
      return { success: false, error: err?.message || 'Failed to save spreadsheet' }
    }
  })

  ipcMain.handle('workbench:read-pdf', async (_, params: string | { filePath: string; maxPages?: number }) => {
    try {
      const filePath = typeof params === 'string' ? params : params.filePath
      const maxPages = typeof params === 'object' && params.maxPages !== undefined ? params.maxPages : 10

      if (!fs.existsSync(filePath)) return { success: false, error: 'File not found' }

      const cleanPath = filePath.replace(/\\/g, '/').replace(/^\/+/, '')
      const fileUrl = `local-file:///${cleanPath}`

      let text = ''
      let pageCount = 0
      let truncated = false

      // Run extraction with timeout so large PDFs never block the main Electron event loop
      try {
        const extractPromise = (async () => {
          const buffer = await fs.promises.readFile(filePath)
          const { createRequire } = await import('module')
          const req = createRequire(import.meta.url)
          const pdfModule = req('pdf-parse')

          const effectiveLimit = maxPages > 0 ? maxPages : 0

          if (pdfModule.PDFParse) {
            const parser = new pdfModule.PDFParse({ data: buffer })
            const textResult = await parser.getText(effectiveLimit > 0 ? { first: effectiveLimit } : undefined)
            const extractedText = textResult.text || ''
            const total = textResult.total || textResult.pages?.length || 0
            await parser.destroy()
            return { text: extractedText, pageCount: total, truncated: effectiveLimit > 0 && total > effectiveLimit }
          } else if (typeof pdfModule === 'function') {
            const data = await pdfModule(buffer, { max: effectiveLimit })
            const total = data.numpages || 0
            return { text: data.text || '', pageCount: total, truncated: effectiveLimit > 0 && total > effectiveLimit }
          }
          return { text: '', pageCount: 0, truncated: false }
        })()

        const timeoutPromise = new Promise<{ text: string; pageCount: number; truncated: boolean }>((_, reject) =>
          setTimeout(() => reject(new Error('PDF extraction timed out')), 3000)
        )

        const result = await Promise.race([extractPromise, timeoutPromise])
        text = result.text
        pageCount = result.pageCount
        truncated = result.truncated
      } catch (parseErr: any) {
        console.warn('[Main] PDF text extraction warning:', parseErr?.message)
      }

      return {
        success: true,
        filePath,
        fileName: path.basename(filePath),
        fileUrl,
        text,
        pageCount,
        truncated,
      }
    } catch (err: any) {
      console.error('[Main] read-pdf error:', err)
      return { success: false, error: err?.message || 'Failed to read PDF' }
    }
  })

  ipcMain.handle(
    'workbench:create-file',
    async (_, { parentPath, fileName, content }: { parentPath: string; fileName: string; content?: string }) => {
      try {
        const filePath = path.join(parentPath, fileName)
        if (fs.existsSync(filePath)) {
          return { success: false, error: 'A file with this name already exists' }
        }
        await fs.promises.writeFile(filePath, content || '', 'utf-8')
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err?.message || 'Failed to create file' }
      }
    }
  )

  ipcMain.handle(
    'workbench:create-folder',
    async (_, { parentPath, folderName }: { parentPath: string; folderName: string }) => {
      try {
        const folderPath = path.join(parentPath, folderName)
        if (fs.existsSync(folderPath)) {
          return { success: false, error: 'A folder with this name already exists' }
        }
        await fs.promises.mkdir(folderPath, { recursive: true })
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err?.message || 'Failed to create folder' }
      }
    }
  )

  ipcMain.handle(
    'workbench:rename-item',
    async (_, { oldPath, newPath }: { oldPath: string; newPath: string }) => {
      try {
        await fs.promises.rename(oldPath, newPath)
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err?.message || 'Failed to rename item' }
      }
    }
  )

  ipcMain.handle('workbench:delete-item', async (_, itemPath: string) => {
    try {
      await shell.trashItem(itemPath)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to delete item' }
    }
  })

  ipcMain.handle(
    'workbench:copy-item',
    async (_, { srcPath, destDir }: { srcPath: string; destDir: string }) => {
      try {
        const baseName = path.basename(srcPath)
        const ext = path.extname(baseName)
        const nameWithoutExt = path.basename(baseName, ext)
        let targetName = baseName
        let targetPath = path.join(destDir, targetName)
        let counter = 1

        while (fs.existsSync(targetPath)) {
          if (path.resolve(path.dirname(srcPath)) === path.resolve(destDir) && counter === 1) {
            targetName = `${nameWithoutExt} - Copy${ext}`
          } else {
            targetName = `${nameWithoutExt} - Copy (${counter})${ext}`
          }
          targetPath = path.join(destDir, targetName)
          counter++
        }

        await fs.promises.cp(srcPath, targetPath, { recursive: true })
        return { success: true, targetPath }
      } catch (err: any) {
        return { success: false, error: err?.message || 'Failed to copy item' }
      }
    }
  )

  ipcMain.handle(
    'workbench:move-item',
    async (_, { srcPath, destDir }: { srcPath: string; destDir: string }) => {
      try {
        const baseName = path.basename(srcPath)
        const ext = path.extname(baseName)
        const nameWithoutExt = path.basename(baseName, ext)
        let targetName = baseName
        let targetPath = path.join(destDir, targetName)
        let counter = 1

        if (path.resolve(srcPath) === path.resolve(targetPath)) {
          return { success: true, targetPath }
        }

        while (fs.existsSync(targetPath)) {
          targetName = `${nameWithoutExt} (${counter})${ext}`
          targetPath = path.join(destDir, targetName)
          counter++
        }

        try {
          await fs.promises.rename(srcPath, targetPath)
        } catch (err: any) {
          if (err.code === 'EXDEV') {
            await fs.promises.cp(srcPath, targetPath, { recursive: true })
            await fs.promises.rm(srcPath, { recursive: true, force: true })
          } else {
            throw err
          }
        }
        return { success: true, targetPath }
      } catch (err: any) {
        return { success: false, error: err?.message || 'Failed to move item' }
      }
    }
  )

  ipcMain.handle('workbench:get-system-roots', async () => {
    try {
      const roots: { name: string; path: string; icon: 'documents' | 'downloads' | 'desktop' | 'home' | 'drive' | 'cloud' }[] = []

      // 1. Detect OneDrive
      const oneDrivePath =
        process.env.OneDrive ||
        process.env.OneDriveConsumer ||
        process.env.OneDriveCommercial ||
        'D:\\One-Drive-Base\\OneDrive'

      if (oneDrivePath && fs.existsSync(oneDrivePath)) {
        roots.push({ name: 'OneDrive', path: oneDrivePath, icon: 'cloud' })
      }

      // 2. Documents (check OneDrive or standard user documents)
      try {
        let docs = app.getPath('documents')
        if (oneDrivePath && fs.existsSync(path.join(oneDrivePath, 'Documents'))) {
          // If OneDrive has Documents, prefer it
          docs = path.join(oneDrivePath, 'Documents')
        }
        if (fs.existsSync(docs)) {
          roots.push({ name: 'Documents', path: docs, icon: 'documents' })
        }
      } catch (_) {}

      // 3. Desktop (check OneDrive or standard user desktop)
      try {
        let desk = app.getPath('desktop')
        if ((!fs.existsSync(desk) || fs.readdirSync(desk).length === 0) && oneDrivePath && fs.existsSync(path.join(oneDrivePath, 'Desktop'))) {
          desk = path.join(oneDrivePath, 'Desktop')
        }
        if (fs.existsSync(desk)) {
          roots.push({ name: 'Desktop', path: desk, icon: 'desktop' })
        }
      } catch (_) {}

      try {
        roots.push({ name: 'Downloads', path: app.getPath('downloads'), icon: 'downloads' })
      } catch (_) {}
      try {
        roots.push({ name: 'User Home', path: app.getPath('home'), icon: 'home' })
      } catch (_) {}

      if (process.platform === 'win32') {
        const driveLetters = ['C', 'D', 'E', 'F', 'G']
        for (const letter of driveLetters) {
          const drivePath = `${letter}:\\`
          try {
            if (fs.existsSync(drivePath)) {
              roots.push({ name: `Local Disk (${letter}:)`, path: drivePath, icon: 'drive' })
            }
          } catch (_) {}
        }
      } else {
        roots.push({ name: 'Root Filesystem', path: '/', icon: 'drive' })
        if (fs.existsSync('/Volumes')) {
          try {
            const vols = fs.readdirSync('/Volumes')
            for (const v of vols) {
              roots.push({ name: v, path: path.join('/Volumes', v), icon: 'drive' })
            }
          } catch (_) {}
        }
      }

      return { success: true, roots }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to get system roots', roots: [] }
    }
  })
}

app.on('web-contents-created', (_event, contents) => {
  AuthCoordinator.getInstance().attachToWebContents(contents)
})

app.whenReady().then(() => {
  protocol.handle('local-file', async (request) => {
    try {
      let rawPath = request.url.replace(/^local-file:\/\//i, '')
      let p = decodeURIComponent(rawPath).replace(/^\/+/, '')
      if (process.platform === 'win32') {
        // Restore drive colon if stripped by Chromium host parsing (e.g. 'd/folder' -> 'd:/folder')
        if (/^[a-zA-Z]\//.test(p)) {
          p = p[0] + ':/' + p.slice(2)
        }
      }
      const normalizedPath = path.normalize(p)
      if (!fs.existsSync(normalizedPath)) {
        console.error('[Protocol] local-file not found on disk:', normalizedPath, 'from request:', request.url)
        return new Response('File not found', { status: 404 })
      }

      const fileUrl = pathToFileURL(normalizedPath).toString()
      const ext = path.extname(normalizedPath).toLowerCase()
      const response = await net.fetch(fileUrl)

      if (ext === '.pdf') {
        const headers = new Headers(response.headers)
        headers.set('Content-Type', 'application/pdf')
        headers.set('Accept-Ranges', 'bytes')
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        })
      }

      return response
    } catch (err: any) {
      console.error('[Protocol] local-file error:', err)
      return new Response('File not found', { status: 404 })
    }
  })
  createWindow()
})

app.on('before-quit', async () => {
  McpManager.getInstance().shutdown().catch(() => {})
  const storeNotes = sessionManager?.getSettings().storeNoteCredentials ?? true
  if (!storeNotes && noteHandler) {
    const p = noteHandler.getNotesPath()
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p) } catch (_) {}
    }
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
