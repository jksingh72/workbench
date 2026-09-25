import { WebContentsView, BrowserWindow, session, Rectangle } from 'electron'
import fs from 'node:fs'
import { AuthCoordinator } from '../auth/authCoordinator'
import { CHROME_DESKTOP_UA } from '../auth/strategies/defaultAuthStrategy'
import { BookSourceManager, BookSource } from '../services/bookSourceManager'
import { getViewPreloadPath } from '../utils/preloadPath'

export { CHROME_DESKTOP_UA }

export const OREILLY_START_URL = 'https://www.oreilly.com/member/login/'

export class BookViewHandler {
  private view: WebContentsView | null = null
  private views: Map<string, WebContentsView> = new Map()
  private attachedViews: Set<WebContentsView> = new Set()
  private mainWindow: BrowserWindow
  private bookSourceManager: BookSourceManager
  private currentSourceId: string = ''
  private currentUrl: string = OREILLY_START_URL
  private currentBounds: Rectangle = { x: 0, y: 0, width: 0, height: 0 }
  private isVisible: boolean = true

  constructor(mainWindow: BrowserWindow, bookSourceManager: BookSourceManager) {
    this.mainWindow = mainWindow
    this.bookSourceManager = bookSourceManager
    this.initView()
  }

  private attachView(v: WebContentsView) {
    if (!this.attachedViews.has(v) && this.mainWindow && !this.mainWindow.isDestroyed()) {
      try {
        this.mainWindow.contentView.addChildView(v)
        this.attachedViews.add(v)
      } catch (err) {
        console.warn('[BookView] attachView error:', err)
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

  private getOrCreateView(source: BookSource): WebContentsView {
    const existing = this.views.get(source.id)
    if (existing && !existing.webContents.isDestroyed()) {
      return existing
    }

    const partitionName = `persist:workbench-book-${source.id}`
    const bookSession = session.fromPartition(partitionName)
    const authCoordinator = AuthCoordinator.getInstance()
    authCoordinator.attachToSession(bookSession)

    const viewPreload = getViewPreloadPath()
    const newView = new WebContentsView({
      webPreferences: {
        session: bookSession,
        preload: fs.existsSync(viewPreload) ? viewPreload : undefined,
        contextIsolation: true,
        sandbox: true,
      },
    })

    const wc = newView.webContents
    wc.setWindowOpenHandler((details) =>
      authCoordinator.handleWindowOpen(details, newView, this.mainWindow)
    )

    this.wireNavEventsForView(newView, source.id)

    wc.loadURL(source.url).catch((err: any) => {
      if (err?.code !== 'ERR_ABORTED') {
        console.error(`[BookView] Failed to load initial URL for '${source.name}':`, err)
      }
    })

    this.views.set(source.id, newView)

    if (this.isVisible && this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.attachView(newView)
    }

    return newView
  }

  private initView() {
    const activeSource = this.bookSourceManager.getActiveSource()
    this.currentSourceId = activeSource.id
    this.currentUrl = activeSource.url
    this.view = this.getOrCreateView(activeSource)
  }

  private sendNavState(wc: Electron.WebContents) {
    if (this.mainWindow && !this.mainWindow.isDestroyed() && !wc.isDestroyed()) {
      this.mainWindow.webContents.send('workbench:nav-state', 'book', {
        canGoBack: wc.navigationHistory.canGoBack(),
        canGoForward: wc.navigationHistory.canGoForward(),
        isLoading: wc.isLoading(),
        url: wc.getURL(),
        title: wc.getTitle(),
        zoomFactor: wc.getZoomFactor(),
      })
    }
  }

  private wireNavEventsForView(viewInstance: WebContentsView, sourceId: string) {
    const wc = viewInstance.webContents

    const onStateChange = () => {
      if (this.currentSourceId === sourceId) {
        this.sendNavState(wc)
      }
    }

    wc.on('did-start-loading', onStateChange)
    wc.on('did-stop-loading', onStateChange)
    wc.on('did-finish-load', onStateChange)
    wc.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      if (this.currentSourceId === sourceId) {
        console.warn(`[BookView] Load failed (${errorCode}):`, errorDescription, validatedURL)
        onStateChange()
      }
    })
    wc.on('did-navigate', onStateChange)
    wc.on('did-navigate-in-page', onStateChange)
    wc.on('page-title-updated', onStateChange)
  }

  public getView(): WebContentsView | null {
    return this.view
  }

  public setBounds(bounds: Rectangle) {
    if (bounds.width > 0 && bounds.height > 0) {
      this.currentBounds = bounds
    }
    if (this.view) {
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
    for (const v of this.views.values()) {
      if (!v.webContents.isDestroyed()) {
        if (!visible || v !== this.view) {
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
    if (!this.view || this.view.webContents.isDestroyed()) return
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
          console.error('[BookView] Reload error:', err)
        }
        break
      case 'home':
        try {
          wc.stop()
          const homeUrl = this.currentUrl || this.bookSourceManager.getActiveSource().url
          wc.loadURL(homeUrl).catch((err) => {
            console.error('[BookView] Home load error:', err)
          })
        } catch (err) {
          console.error('[BookView] Home error:', err)
        }
        break
      case 'zoom-in':
        wc.setZoomFactor(Math.min(wc.getZoomFactor() + 0.1, 2.5))
        break
      case 'zoom-out':
        wc.setZoomFactor(Math.max(wc.getZoomFactor() - 0.1, 0.5))
        break
      case 'zoom-reset':
        wc.setZoomFactor(1.0)
        break
    }
  }

  public loadBookSource(source: BookSource) {
    if (this.currentSourceId === source.id && this.view) {
      return
    }

    // Hide previous view
    if (this.view && !this.view.webContents.isDestroyed()) {
      this.view.setVisible(false)
      try {
        this.view.setBounds({ x: -10000, y: -10000, width: 1, height: 1 })
      } catch (_) {}
      this.detachView(this.view)
    }

    this.currentSourceId = source.id
    this.currentUrl = source.url
    this.view = this.getOrCreateView(source)

    if (this.isVisible) {
      this.attachView(this.view)
      if (this.currentBounds.width > 0 && this.currentBounds.height > 0) {
        this.view.setBounds(this.currentBounds)
      }
      this.view.setVisible(true)
    }

    this.sendNavState(this.view.webContents)
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
      console.error('[BookView] Failed to extract selection:', err)
      return ''
    }
  }

  public async clearSession(scope: string = 'current'): Promise<{ success: boolean; error?: string }> {
    try {
      const activeSource = this.bookSourceManager.getActiveSource()
      const targetSourceId = scope === 'current' ? activeSource.id : scope

      if (scope === 'all') {
        console.log('[BookView] Clear session: Clearing credentials for ALL book platforms...')
        const allSources = this.bookSourceManager.getData().sources
        for (const s of allSources) {
          const partitionName = `persist:workbench-book-${s.id}`
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
            v.webContents.stop()
            v.webContents.loadURL(s.url).catch(console.error)
          }
        }
      } else {
        const targetSource =
          this.bookSourceManager.getData().sources.find((s) => s.id === targetSourceId) || activeSource
        console.log(`[BookView] Isolated delete login: Clearing credentials for '${targetSource.name}' (${targetSource.id}) ONLY...`)
        const partitionName = `persist:workbench-book-${targetSource.id}`
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

        const v =
          this.views.get(targetSource.id) ||
          (targetSource.id === this.currentSourceId ? this.view : null)

        if (v && !v.webContents.isDestroyed()) {
          v.webContents.stop()
          v.webContents.loadURL(targetSource.url).catch(console.error)

          v.webContents.once('did-finish-load', () => {
            v?.webContents
              .executeJavaScript(
                `
              try {
                const inputs = document.querySelectorAll('input');
                inputs.forEach(input => {
                  if (['email', 'password', 'text', 'tel'].includes(input.type)) {
                    input.value = '';
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                });
              } catch (_) {}
            `
              )
              .catch(() => {})
          })
        }
      }

      return { success: true }
    } catch (err: any) {
      console.error('[BookView] Clear session error:', err)
      return { success: false, error: err.message || 'Failed to clear book session' }
    }
  }
}
