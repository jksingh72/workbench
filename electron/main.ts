import { app, BrowserWindow, ipcMain, shell, Menu, dialog } from 'electron'
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
import { AISourceManager, AISource } from './services/aiSourceManager'
import { NoteSourceManager, NoteSource } from './services/noteSourceManager'

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
      layoutManager?.applyBounds()
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
      layoutManager?.applyBounds()
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
          layoutManager?.applyBounds()
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

      // Sort directories first, then alphabetical by name
      items.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1
        if (!a.isDirectory && b.isDirectory) return 1
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
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

      const driveLetters = ['C', 'D', 'E', 'F', 'G']
      for (const letter of driveLetters) {
        const drivePath = `${letter}:\\`
        try {
          if (fs.existsSync(drivePath)) {
            roots.push({ name: `Local Disk (${letter}:)`, path: drivePath, icon: 'drive' })
          }
        } catch (_) {}
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
