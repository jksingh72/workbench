import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { BookViewHandler, CHROME_DESKTOP_UA } from './views/bookViewHandler'
import { AIViewHandler } from './views/aiViewHandler'
import { NoteViewHandler } from './views/noteViewHandler'
import { SessionManager } from './services/sessionManager'
import { LayoutManager } from './services/layoutManager'
import { AuthCoordinator } from './auth/authCoordinator'
import { BookSourceManager, BookSource } from './services/bookSourceManager'

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
    },
  })

  // Initialize modular view and service handlers
  bookSourceManager = new BookSourceManager()
  bookHandler = new BookViewHandler(mainWindow, bookSourceManager)
  aiHandler = new AIViewHandler(mainWindow)
  noteHandler = new NoteViewHandler()
  sessionManager = new SessionManager(bookHandler, aiHandler, noteHandler)
  layoutManager = new LayoutManager(mainWindow, bookHandler, aiHandler)

  // Attach native child views to the window's content view
  const bookView = bookHandler.getView()
  const aiView = aiHandler.getView()
  if (bookView) mainWindow.contentView.addChildView(bookView)
  if (aiView) mainWindow.contentView.addChildView(aiView)

  // Set initial bounds
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

  ipcMain.on('workbench:set-views-visible', (_, params: boolean | { target?: 'book' | 'ai' | 'all'; visible: boolean }) => {
    layoutManager?.setViewsVisible(params)
  })

  // Navigation
  ipcMain.on('workbench:nav-action', (_, { target, command }) => {
    if (target === 'book') {
      bookHandler?.handleNavAction(command)
    } else {
      aiHandler?.handleNavAction(command)
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

  // OneNote & Clipping
  ipcMain.handle('workbench:clip-selection', async () => {
    if (!noteHandler || !bookHandler) return { success: false, error: 'Handlers not ready' }
    return await noteHandler.clipSelection(() => bookHandler!.extractSelection())
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

  ipcMain.handle('workbench:clear-session', async (_, target: 'book' | 'ai' | 'note') => {
    if (!sessionManager) return { success: false, error: 'Session manager not ready' }
    return await sessionManager.clearSession(target)
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
}

app.on('web-contents-created', (_event, contents) => {
  AuthCoordinator.getInstance().attachToWebContents(contents)
})

app.whenReady().then(createWindow)

app.on('before-quit', async () => {
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
