import { app, WebContentsView, BrowserWindow, session, Rectangle, shell, Menu } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { AuthCoordinator } from '../auth/authCoordinator'
import { NoteSourceManager, NoteSource } from '../services/noteSourceManager'
import { getViewPreloadPath } from '../utils/preloadPath'

export class NoteViewHandler {
  private view: WebContentsView | null = null
  private views: Map<string, WebContentsView> = new Map()
  private attachedViews: Set<WebContentsView> = new Set()
  private mainWindow: BrowserWindow | null = null
  private noteSourceManager: NoteSourceManager | null = null
  private currentSourceId: string = ''
  private currentUrl: string = ''
  private sourceBaseUrls: Map<string, string> = new Map()
  private currentBounds: Rectangle = { x: 0, y: 0, width: 0, height: 0 }
  private isVisible: boolean = true
  private notesPath: string

  constructor(mainWindow?: BrowserWindow, noteSourceManager?: NoteSourceManager) {
    this.notesPath = path.join(app.getPath('userData'), 'workbench-notes.json')
    if (mainWindow && noteSourceManager) {
      this.mainWindow = mainWindow
      this.noteSourceManager = noteSourceManager
      this.initView()
    }
  }

  public setContext(mainWindow: BrowserWindow, noteSourceManager: NoteSourceManager) {
    this.mainWindow = mainWindow
    this.noteSourceManager = noteSourceManager
    this.initView()
  }

  private attachView(v: WebContentsView) {
    if (!this.attachedViews.has(v) && this.mainWindow && !this.mainWindow.isDestroyed()) {
      try {
        this.mainWindow.contentView.addChildView(v)
        this.attachedViews.add(v)
      } catch (err) {
        console.warn('[NoteView] attachView error:', err)
      }
    }
  }

  private detachView(v: WebContentsView) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      try {
        this.mainWindow.contentView.removeChildView(v)
      } catch (err) {
        // ignore if not attached
      } finally {
        this.attachedViews.delete(v)
      }
    }
  }

  public isWebSource(source?: NoteSource | null): boolean {
    if (!source) return false
    if (source.isLocal || source.id === 'local-explorer' || source.id === 'local') return false
    return source.url.startsWith('http://') || source.url.startsWith('https://')
  }

  private initView() {
    if (!this.noteSourceManager) return
    const activeSource = this.noteSourceManager.getActiveSource()
    this.currentSourceId = activeSource.id
    this.currentUrl = activeSource.url

    if (this.isWebSource(activeSource)) {
      this.view = this.getOrCreateView(activeSource)
    } else {
      this.view = null
    }
  }

  private getOrCreateView(source: NoteSource): WebContentsView {
    const existing = this.views.get(source.id)
    if (existing && !existing.webContents.isDestroyed()) {
      return existing
    }

    const partitionName = `persist:workbench-note-${source.id}`
    const noteSession = session.fromPartition(partitionName)
    const authCoordinator = AuthCoordinator.getInstance()
    authCoordinator.attachToSession(noteSession)

    const viewPreload = getViewPreloadPath()
    const newView = new WebContentsView({
      webPreferences: {
        session: noteSession,
        preload: fs.existsSync(viewPreload) ? viewPreload : undefined,
        contextIsolation: true,
        sandbox: true,
      },
    })

    const wc = newView.webContents

    // Window open & in-app navigation handling
    wc.setWindowOpenHandler((details) => {
      const { url } = details

      // 1. Check if it's an OAuth / SSO login popup (e.g. Microsoft Authenticator/SSO, Google OAuth, Apple ID)
      if (authCoordinator.isAllowedPopupUrl(url)) {
        return authCoordinator.handleWindowOpen(details, newView, this.mainWindow!)
      }

      // 2. Check if it's in-app navigation for note platforms (e.g. OneNote notebooks, sections, Evernote notes, Notion pages)
      try {
        const parsed = new URL(url)
        const host = parsed.hostname.toLowerCase()
        const isNoteAppDomain =
          host.includes('onenote.com') ||
          host.includes('office.com') ||
          host.includes('officeapps.live.com') ||
          host.includes('live.com') ||
          host.includes('sharepoint.com') ||
          host.includes('microsoft.com') ||
          host.includes('evernote.com') ||
          host.includes('notion.so') ||
          host.includes('notion.site') ||
          host.includes('keep.google.com')

        if (isNoteAppDomain) {
          // Open directly inside this note view pane without popping into a new window
          newView.webContents.loadURL(url).catch((err) => {
            console.error('[NoteView] Failed to navigate to notebook/note URL:', err)
          })
          return { action: 'deny' as const }
        }
      } catch (_) {}

      // 3. True external links open in system default browser
      shell.openExternal(url)
      return { action: 'deny' as const }
    })

    // Restore saved zoom level for this source
    const initialZoom = this.noteSourceManager?.getZoom(source.id) ?? 1.0
    if (initialZoom > 0) {
      wc.setZoomFactor(initialZoom)
    }

    this.wireNavEventsForView(newView, source.id)

    wc.loadURL(source.url).catch((err: any) => {
      if (err?.code !== 'ERR_ABORTED') {
        console.error(`[NoteView] Failed to load initial URL for '${source.name}':`, err)
      }
    })

    this.views.set(source.id, newView)

    if (this.isVisible && this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.attachView(newView)
    }

    return newView
  }

  private sendNavState(wc: Electron.WebContents) {
    if (this.mainWindow && !this.mainWindow.isDestroyed() && !wc.isDestroyed()) {
      this.mainWindow.webContents.send('workbench:nav-state', 'note', {
        canGoBack: wc.navigationHistory.canGoBack(),
        canGoForward: wc.navigationHistory.canGoForward(),
        isLoading: wc.isLoading(),
        url: wc.getURL(),
        title: wc.getTitle(),
        zoomFactor: wc.getZoomFactor(),
      })
    }
  }

  private sendLocalNavState() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      const zoom = this.noteSourceManager?.getZoom(this.currentSourceId) ?? 1.0
      this.mainWindow.webContents.send('workbench:nav-state', 'note', {
        canGoBack: false,
        canGoForward: false,
        isLoading: false,
        url: 'workbench://local-notes',
        title: 'Workbench Local Notes',
        zoomFactor: zoom,
      })
    }
  }

  private wireNavEventsForView(viewInstance: WebContentsView, sourceId: string) {
    const wc = viewInstance.webContents

    const onStateChange = () => {
      if (this.currentSourceId === sourceId) {
        const savedZoom = this.noteSourceManager?.getZoom(sourceId) ?? 1.0
        if (savedZoom > 0 && Math.abs(wc.getZoomFactor() - savedZoom) > 0.01) {
          wc.setZoomFactor(savedZoom)
        }
        this.sendNavState(wc)
      }
    }

    wc.on('did-start-loading', onStateChange)
    wc.on('did-stop-loading', onStateChange)
    wc.on('did-finish-load', onStateChange)
    wc.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      if (this.currentSourceId === sourceId) {
        console.warn(`[NoteView] Load failed (${errorCode}):`, errorDescription, validatedURL)
        onStateChange()
      }
    })
    wc.on('did-navigate', onStateChange)
    wc.on('did-navigate-in-page', onStateChange)
    wc.on('page-title-updated', onStateChange)

    wc.on('context-menu', (_e, params) => {
      const selection = (params.selectionText || '').trim()
      const menuTemplate: Electron.MenuItemConstructorOptions[] = []

      if (selection) {
        menuTemplate.push(
          {
            label: '🤖 Send Selection to AI Chat (Explain)',
            click: () => {
              if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('workbench:ask-ai-with-text', {
                  templateKey: 'explain',
                  text: selection,
                })
              }
            },
          },
          {
            label: '💬 Send Selection to AI Prompt (Raw)',
            click: () => {
              if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('workbench:ask-ai-with-text', {
                  templateKey: 'raw',
                  text: selection,
                })
              }
            },
          },
          { type: 'separator' },
          {
            label: '📋 Copy Selection (Ctrl+C)',
            role: 'copy',
          }
        )
      } else {
        menuTemplate.push(
          { label: 'Back', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() },
          { label: 'Forward', enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() },
          { label: 'Reload', click: () => wc.reload() },
          { type: 'separator' },
          { label: 'Paste', role: 'paste' },
          { label: 'Select All', role: 'selectAll' }
        )
      }

      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        const menu = Menu.buildFromTemplate(menuTemplate)
        menu.popup({ window: this.mainWindow })
      }
    })

    wc.on('before-input-event', async (_e, input) => {
      if (input.type !== 'keyDown') return
      const isCtrlOrMeta = input.control || input.meta
      if (isCtrlOrMeta && input.shift) {
        const key = input.key.toLowerCase()
        if (key === 'a') {
          const text = await this.extractSelection()
          if (text && this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('workbench:ask-ai-with-text', { templateKey: 'explain', text })
          }
        }
      }
    })
  }

  public getView(): WebContentsView | null {
    return this.view
  }

  public setBounds(bounds: Rectangle) {
    if (bounds.width > 0 && bounds.height > 0) {
      this.currentBounds = bounds
    }
    if (this.view && this.isWebSource(this.noteSourceManager?.getActiveSource())) {
      if (!this.isVisible || bounds.width <= 0 || bounds.height <= 0) {
        try {
          this.view.setBounds({ x: -10000, y: -10000, width: 1, height: 1 })
        } catch (_) {}
        this.detachView(this.view)
      } else {
        this.attachView(this.view)
        this.view.setBounds(bounds)
      }
    }
  }

  public setVisible(visible: boolean) {
    this.isVisible = visible
    const activeIsWeb = this.isWebSource(this.noteSourceManager?.getActiveSource())

    for (const v of this.views.values()) {
      if (!v.webContents.isDestroyed()) {
        if (!visible || !activeIsWeb || v !== this.view) {
          v.setVisible(false)
          try {
            v.setBounds({ x: -10000, y: -10000, width: 1, height: 1 })
          } catch (_) {}
          this.detachView(v)
        } else {
          this.attachView(v)
          v.setVisible(true)
          if (this.currentBounds.width > 0 && this.currentBounds.height > 0) {
            v.setBounds(this.currentBounds)
          }
        }
      }
    }
  }

  public handleNavAction(command: 'back' | 'forward' | 'reload' | 'home' | 'zoom-in' | 'zoom-out' | 'zoom-reset') {
    if (!this.view || this.view.webContents.isDestroyed()) {
      if (command === 'zoom-in' || command === 'zoom-out' || command === 'zoom-reset') {
        let currentZoom = this.noteSourceManager?.getZoom(this.currentSourceId) ?? 1.0
        if (command === 'zoom-in') currentZoom = Math.min(Number((currentZoom + 0.1).toFixed(2)), 2.5)
        else if (command === 'zoom-out') currentZoom = Math.max(Number((currentZoom - 0.1).toFixed(2)), 0.5)
        else if (command === 'zoom-reset') currentZoom = 1.0
        this.noteSourceManager?.setZoom(this.currentSourceId, currentZoom)
        this.sendLocalNavState()
      }
      return
    }
    const wc = this.view.webContents

    switch (command) {
      case 'back':
        if (wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack()
        break
      case 'forward':
        if (wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward()
        break
      case 'reload':
        try {
          wc.stop()
          wc.reload()
        } catch (err) {
          console.error('[NoteView] Reload error:', err)
        }
        break
      case 'home':
        try {
          wc.stop()
          const homeUrl = this.currentUrl || this.noteSourceManager?.getActiveSource().url
          if (homeUrl && homeUrl.startsWith('http')) {
            wc.loadURL(homeUrl).catch((err) => {
              console.error('[NoteView] Home load error:', err)
            })
          }
        } catch (err) {
          console.error('[NoteView] Home error:', err)
        }
        break
      case 'zoom-in': {
        const nextZoom = Math.min(Number((wc.getZoomFactor() + 0.1).toFixed(2)), 2.5)
        wc.setZoomFactor(nextZoom)
        this.noteSourceManager?.setZoom(this.currentSourceId, nextZoom)
        this.sendNavState(wc)
        break
      }
      case 'zoom-out': {
        const nextZoom = Math.max(Number((wc.getZoomFactor() - 0.1).toFixed(2)), 0.5)
        wc.setZoomFactor(nextZoom)
        this.noteSourceManager?.setZoom(this.currentSourceId, nextZoom)
        this.sendNavState(wc)
        break
      }
      case 'zoom-reset': {
        wc.setZoomFactor(1.0)
        this.noteSourceManager?.setZoom(this.currentSourceId, 1.0)
        this.sendNavState(wc)
        break
      }
    }
  }

  public loadNoteSource(source: NoteSource) {
    // Hide any existing views cleanly
    for (const v of this.views.values()) {
      if (!v.webContents.isDestroyed()) {
        v.setVisible(false)
        try {
          v.setBounds({ x: -10000, y: -10000, width: 1, height: 1 })
        } catch (_) {}
        this.detachView(v)
      }
    }

    this.currentSourceId = source.id

    if (this.isWebSource(source)) {
      this.isVisible = true
      const isExisting = this.views.has(source.id)
      this.view = this.getOrCreateView(source)

      // Restore saved zoom level for this source
      const savedZoom = this.noteSourceManager?.getZoom(source.id) ?? 1.0
      if (savedZoom > 0) {
        this.view.webContents.setZoomFactor(savedZoom)
      }

      const prevBaseUrl = this.sourceBaseUrls.get(source.id)
      if (isExisting && prevBaseUrl && prevBaseUrl !== source.url) {
        this.view.webContents.loadURL(source.url).catch(() => {})
      }
      this.sourceBaseUrls.set(source.id, source.url)
      this.currentUrl = source.url

      this.attachView(this.view)
      if (this.currentBounds.width > 0 && this.currentBounds.height > 0) {
        this.view.setBounds(this.currentBounds)
      }
      this.view.setVisible(true)
      this.sendNavState(this.view.webContents)
    } else {
      this.currentUrl = source.url
      this.isVisible = false
      this.view = null
      this.sendLocalNavState()
    }
  }

  public getNotesPath(): string {
    return this.notesPath
  }

  public loadNotes(storeEnabled: boolean): any[] {
    try {
      if (!storeEnabled) {
        if (fs.existsSync(this.notesPath)) {
          try { fs.unlinkSync(this.notesPath) } catch (_) {}
        }
        return []
      }
      if (fs.existsSync(this.notesPath)) {
        return JSON.parse(fs.readFileSync(this.notesPath, 'utf-8'))
      }
    } catch (err) {
      console.error('[NoteView] Error loading notes:', err)
    }
    return []
  }

  public saveNotes(notes: any[], storeEnabled: boolean): { success: boolean; error?: string } {
    try {
      if (!storeEnabled) {
        return { success: true }
      }
      fs.writeFileSync(this.notesPath, JSON.stringify(notes, null, 2), 'utf-8')
      return { success: true }
    } catch (err: any) {
      console.error('[NoteView] Error saving notes:', err)
      return { success: false, error: err.message }
    }
  }

  public async clipSelection(extractSelection: () => Promise<string>): Promise<{ success: boolean; text?: string; error?: string }> {
    try {
      const text = await extractSelection()
      if (!text) {
        return { success: false, error: 'No text highlighted in Bookview' }
      }
      return { success: true, text }
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to extract text' }
    }
  }

  public async extractSelection(): Promise<string> {
    if (!this.view || this.view.webContents.isDestroyed()) {
      return ''
    }
    try {
      const selectedText: string = await this.view.webContents.executeJavaScript(`
        (function() {
          const sel = window.getSelection();
          return sel ? sel.toString() : '';
        })()
      `)
      return (selectedText || '').trim()
    } catch (err) {
      console.error('[NoteView] Failed to extract selection:', err)
      return ''
    }
  }

  public async clearSession(scope: string = 'current'): Promise<{ success: boolean; error?: string }> {
    try {
      const activeSource = this.noteSourceManager?.getActiveSource()
      const targetSourceId = scope === 'current' ? (activeSource?.id || 'onenote') : scope

      if (scope === 'all') {
        console.log('[NoteView] Clear session: Clearing credentials for ALL note platforms...')
        const allSources = this.noteSourceManager?.getData().sources || []
        for (const s of allSources) {
          if (s.id !== 'local') {
            const partitionName = `persist:workbench-note-${s.id}`
            const targetSession = session.fromPartition(partitionName)
            await targetSession.clearStorageData({
              storages: [
                'cookies',
                'filesystem',
                'indexdb',
                'localstorage',
                'shadercache',
                'websql',
                'serviceworkers',
                'cachestorage',
              ],
            })
            await targetSession.clearCache()
            await targetSession.clearAuthCache()
            await targetSession.clearHostResolverCache()

            const v = this.views.get(s.id)
            if (v && !v.webContents.isDestroyed()) {
              v.webContents.loadURL(s.url).catch(() => {})
            }
          }
        }

        // Also reset local notes file
        if (fs.existsSync(this.notesPath)) {
          try { fs.unlinkSync(this.notesPath) } catch (_) {}
        }
        return { success: true }
      }

      if (targetSourceId === 'local') {
        console.log('[NoteView] Clear session: Clearing local notes file...')
        if (fs.existsSync(this.notesPath)) {
          try { fs.unlinkSync(this.notesPath) } catch (_) {}
        }
        return { success: true }
      }

      // Clear specific web note platform
      console.log(`[NoteView] Clear session: Clearing credentials for note platform '${targetSourceId}'...`)
      const partitionName = `persist:workbench-note-${targetSourceId}`
      const targetSession = session.fromPartition(partitionName)
      await targetSession.clearStorageData({
        storages: [
          'cookies',
          'filesystem',
          'indexdb',
          'localstorage',
          'shadercache',
          'websql',
          'serviceworkers',
          'cachestorage',
        ],
      })
      await targetSession.clearCache()
      await targetSession.clearAuthCache()
      await targetSession.clearHostResolverCache()

      const targetSource = this.noteSourceManager?.getData().sources.find((s) => s.id === targetSourceId)
      const v = this.views.get(targetSourceId)
      if (v && !v.webContents.isDestroyed() && targetSource) {
        v.webContents.loadURL(targetSource.url).catch(() => {})
      }

      return { success: true }
    } catch (err: any) {
      console.error('[NoteView] Clear session error:', err)
      return { success: false, error: err.message || 'Failed to clear note session' }
    }
  }
}
