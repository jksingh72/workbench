import { WebContentsView, BrowserWindow, session, Rectangle, Menu } from 'electron'
import fs from 'node:fs'
import { AuthCoordinator } from '../auth/authCoordinator'
import { CHROME_DESKTOP_UA } from '../auth/strategies/defaultAuthStrategy'
import { BookSourceManager, BookSource } from '../services/bookSourceManager'
import { getViewPreloadPath } from '../utils/preloadPath'

export { CHROME_DESKTOP_UA }

export const OREILLY_START_URL = 'https://learning.oreilly.com/home/'

export class BookViewHandler {
  private view: WebContentsView | null = null
  private views: Map<string, WebContentsView> = new Map()
  private attachedViews: Set<WebContentsView> = new Set()
  private mainWindow: BrowserWindow
  private bookSourceManager: BookSourceManager
  private currentSourceId: string = ''
  private currentUrl: string = OREILLY_START_URL
  private sourceBaseUrls: Map<string, string> = new Map()
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

    // Restore saved zoom level for this source
    const initialZoom = this.bookSourceManager.getZoom(source.id)
    if (initialZoom > 0) {
      wc.setZoomFactor(initialZoom)
    }

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

  private isWebSource(source?: BookSource): boolean {
    if (!source) return false
    if (source.isLocal || source.id === 'local-books' || source.id === 'local') return false
    return source.url.startsWith('http://') || source.url.startsWith('https://')
  }

  private initView() {
    const activeSource = this.bookSourceManager.getActiveSource()
    this.currentSourceId = activeSource.id
    this.currentUrl = activeSource.url
    if (this.isWebSource(activeSource)) {
      this.view = this.getOrCreateView(activeSource)
    } else {
      this.view = null
      this.sendLocalNavState()
    }
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

  private sendLocalNavState() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      const zoom = this.bookSourceManager.getZoom(this.currentSourceId)
      this.mainWindow.webContents.send('workbench:nav-state', 'book', {
        canGoBack: false,
        canGoForward: false,
        isLoading: false,
        url: 'workbench://local-books',
        title: 'Workbench Local Books',
        zoomFactor: zoom,
      })
    }
  }

  private wireNavEventsForView(viewInstance: WebContentsView, sourceId: string) {
    const wc = viewInstance.webContents

    const onStateChange = () => {
      if (this.currentSourceId === sourceId) {
        const savedZoom = this.bookSourceManager.getZoom(sourceId)
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
        console.warn(`[BookView] Load failed (${errorCode}):`, errorDescription, validatedURL)
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
            label: '📝 Clip Selection to Notes (Ctrl+Shift+N)',
            click: async () => {
              const res = await this.extractSelectionWithCitation()
              if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('workbench:clip-selection-text', {
                  source: 'book',
                  text: res.formattedCitation || selection,
                  rawText: selection,
                  metadata: res,
                })
              }
            },
          },
          {
            label: '🤖 Ask AI (Explain Concept)',
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
            label: '💬 Send to AI Prompt (Raw)',
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
          { label: 'Select All', role: 'selectAll' }
        )
      }

      const menu = Menu.buildFromTemplate(menuTemplate)
      menu.popup({ window: this.mainWindow })
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
        } else if (key === 'n' || key === 'c') {
          const res = await this.extractSelectionWithCitation()
          const clipText = res.formattedCitation || res.rawText
          if (clipText && this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('workbench:clip-selection-text', {
              source: 'book',
              text: clipText,
              rawText: res.rawText,
              metadata: res,
            })
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
    if (!this.view || this.view.webContents.isDestroyed()) {
      if (command === 'zoom-in' || command === 'zoom-out' || command === 'zoom-reset') {
        let currentZoom = this.bookSourceManager.getZoom(this.currentSourceId)
        if (command === 'zoom-in') currentZoom = Math.min(Number((currentZoom + 0.1).toFixed(2)), 2.5)
        else if (command === 'zoom-out') currentZoom = Math.max(Number((currentZoom - 0.1).toFixed(2)), 0.5)
        else if (command === 'zoom-reset') currentZoom = 1.0
        this.bookSourceManager.setZoom(this.currentSourceId, currentZoom)
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
          console.error('[BookView] Reload error:', err)
        }
        break
      case 'home':
        try {
          wc.stop()
          const homeUrl = this.currentUrl || this.bookSourceManager.getActiveSource().url
          if (homeUrl && homeUrl.startsWith('http')) {
            wc.loadURL(homeUrl).catch((err) => {
              console.error('[BookView] Home load error:', err)
            })
          }
        } catch (err) {
          console.error('[BookView] Home error:', err)
        }
        break
      case 'zoom-in': {
        const nextZoom = Math.min(Number((wc.getZoomFactor() + 0.1).toFixed(2)), 2.5)
        wc.setZoomFactor(nextZoom)
        this.bookSourceManager.setZoom(this.currentSourceId, nextZoom)
        this.sendNavState(wc)
        break
      }
      case 'zoom-out': {
        const nextZoom = Math.max(Number((wc.getZoomFactor() - 0.1).toFixed(2)), 0.5)
        wc.setZoomFactor(nextZoom)
        this.bookSourceManager.setZoom(this.currentSourceId, nextZoom)
        this.sendNavState(wc)
        break
      }
      case 'zoom-reset': {
        wc.setZoomFactor(1.0)
        this.bookSourceManager.setZoom(this.currentSourceId, 1.0)
        this.sendNavState(wc)
        break
      }
    }
  }

  public loadBookSource(source: BookSource) {
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
      const savedZoom = this.bookSourceManager.getZoom(source.id)
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

  public async extractSelectionWithCitation(): Promise<{
    rawText: string
    title: string
    chapter: string
    url: string
    formattedCitation: string
  }> {
    if (!this.view || this.view.webContents.isDestroyed()) {
      return { rawText: '', title: '', chapter: '', url: '', formattedCitation: '' }
    }
    try {
      const data = await this.view.webContents.executeJavaScript(`
        (function() {
          var sel = window.getSelection();
          var rawText = (sel ? sel.toString() : '').trim();
          if (!rawText) return { rawText: '', title: '', chapter: '', url: '' };

          var pageTitle = document.title || '';
          var pageUrl = window.location.href || '';
          
          var chapter = '';
          var selectors = [
            'h1.title',
            '[data-testid="header-title"]',
            '.chapter-title',
            'header h1',
            'article h1',
            'h1',
            'h2.title',
            'h2'
          ];
          for (var i = 0; i < selectors.length; i++) {
            var el = document.querySelector(selectors[i]);
            if (el && el.innerText && el.innerText.trim()) {
              chapter = el.innerText.trim();
              break;
            }
          }

          return {
            rawText: rawText,
            title: pageTitle,
            chapter: chapter,
            url: pageUrl
          };
        })()
      `)

      if (!data || !data.rawText) {
        return { rawText: '', title: '', chapter: '', url: '', formattedCitation: '' }
      }

      const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      const dateStr = new Date().toLocaleDateString()
      
      const cleanTitle = (data.title || '').replace(/\s*[-–|]\s*(O'Reilly|Amazon Kindle|Book|Learning).*$/i, '').trim() || 'Reading Excerpt'
      const cleanChapter = (data.chapter || '').trim()
      const url = data.url || ''
      
      const quotedLines = data.rawText.split('\n').map((l: string) => `> ${l}`).join('\n')
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

      const formattedCitation = `\n\n---\n### 📖 Book Excerpt\n${quotedLines}\n${attr}\n\n`

      return {
        rawText: data.rawText,
        title: cleanTitle,
        chapter: cleanChapter,
        url,
        formattedCitation,
      }
    } catch (err) {
      console.error('[BookView] extractSelectionWithCitation error:', err)
      return { rawText: '', title: '', chapter: '', url: '', formattedCitation: '' }
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
