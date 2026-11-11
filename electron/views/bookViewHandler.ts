import { WebContentsView, BrowserWindow, session, Rectangle, Menu } from 'electron'
import fs from 'node:fs'
import { AuthCoordinator } from '../auth/authCoordinator'
import { CHROME_DESKTOP_UA } from '../auth/strategies/defaultAuthStrategy'
import { BookSourceManager, BookSource } from '../services/bookSourceManager'
import { getViewPreloadPath } from '../utils/preloadPath'
import { Logger } from '../services/logger'

export { CHROME_DESKTOP_UA }

export const OREILLY_START_URL = 'https://learning.oreilly.com/home/'

export interface BookLinkItem {
  id: number
  text: string
  href: string
  type: 'link' | 'button' | 'nav' | 'toc'
  inViewport: boolean
  title?: string
}

export interface BookInputItem {
  id: number
  tag: string
  type: string
  name: string
  label: string
  placeholder: string
  value: string
  options?: string[]
  inViewport: boolean
}

export interface BookPageExtractionResult {
  success: boolean
  mode: 'web' | 'local'
  title: string
  chapter: string
  url: string
  scrollPercent: number
  selectedText: string
  visibleText: string
  fullText: string
  headings: string[]
  codeBlocks: Array<{ language: string; code: string }>
  inputs: BookInputItem[]
  links: BookLinkItem[]
  error?: string
}

export interface BookClickResult {
  success: boolean
  clickedId?: number
  clickedText?: string
  tag?: string
  href?: string
  newTitle?: string
  newUrl?: string
  message: string
  error?: string
}

export interface BookNavResult {
  success: boolean
  command: string
  title?: string
  url?: string
  scrollPercent?: number
  message: string
  error?: string
}

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
        onStateChange()
        if (errorCode !== -3) {
          Logger.warn('BookView', `Reading pane load failed (${errorCode}): ${errorDescription} - ${validatedURL}`)
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send(
              'workbench:notify',
              `⚠️ Reading pane failed to load: ${errorDescription || 'Connection issue'}. Click reload to retry.`
            )
          }
        }
      }
    })

    wc.on('render-process-gone', (_event, details) => {
      const reasonStr = details.reason === 'oom' ? 'Out of memory' : details.reason
      Logger.error('BookView', `Render process gone for "${sourceId}": ${details.reason} (code: ${details.exitCode})`, details)
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(
          'workbench:notify',
          `⚠️ Reading pane tab crashed (${reasonStr}). Click the reload button in the toolbar to restore it.`
        )
      }
    })

    wc.on('unresponsive', () => {
      Logger.warn('BookView', `WebContents unresponsive for "${sourceId}"`)
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(
          'workbench:notify',
          '⏳ Reading pane is taking longer than expected to respond. Please wait or click reload.'
        )
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

  /**
   * Executes JavaScript in a target WebContents with a strict timeout so a loading,
   * detached, or unresponsive frame can never hang IPC callers.
   */
  private async execJsWithTimeout<T = any>(
    wc: Electron.WebContents,
    code: string,
    timeoutMs: number = 3500
  ): Promise<T> {
    if (!wc || wc.isDestroyed()) {
      throw new Error('Target WebContents is destroyed')
    }
    return await Promise.race([
      wc.executeJavaScript(code) as Promise<T>,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`BookView script execution timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ])
  }

  /**
   * Resolves the active WebContents for BookView:
   * - If a web book source (O'Reilly, Kindle, web docs) is active AND its WebContentsView is attached & visible,
   *   returns `this.view.webContents`.
   * - If a local book source (EPUB/PDF/Word/Markdown/Folder in LocalExplorer) is active, returns `this.mainWindow.webContents`
   *   and scopes DOM operations to `.book-pane`.
   */
  private getTargetWebContents(forceLocal?: boolean): { wc: Electron.WebContents | null; isLocalMode: boolean } {
    const activeSource = this.bookSourceManager.getActiveSource()
    const isWebActive =
      !forceLocal &&
      this.isVisible &&
      this.isWebSource(activeSource) &&
      this.view !== null &&
      !this.view.webContents.isDestroyed() &&
      this.attachedViews.has(this.view) &&
      this.currentBounds.width > 0 &&
      this.currentBounds.height > 0

    if (isWebActive && this.view) {
      return { wc: this.view.webContents, isLocalMode: false }
    }
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      return { wc: this.mainWindow.webContents, isLocalMode: true }
    }
    return { wc: null, isLocalMode: false }
  }

  /**
   * Extracts visible viewport text, full chapter/article text, headings, code blocks,
   * form inputs, and interactive links from the active BookView pane (both Web and Local modes).
   */
  public async extractVisiblePage(options?: {
    scope?: 'viewport' | 'full' | 'both'
    includeLinks?: boolean
    includeInputs?: boolean
    showBadges?: boolean
    _forceLocalFallback?: boolean
  }): Promise<BookPageExtractionResult> {
    const { wc, isLocalMode } = this.getTargetWebContents(options?._forceLocalFallback)
    if (!wc) {
      return {
        success: false,
        mode: 'web',
        title: '',
        chapter: '',
        url: '',
        scrollPercent: 0,
        selectedText: '',
        visibleText: '',
        fullText: '',
        headings: [],
        codeBlocks: [],
        inputs: [],
        links: [],
        error: 'BookView is not ready',
      }
    }

    const opts = {
      scope: options?.scope || 'both',
      includeLinks: options?.includeLinks !== false,
      includeInputs: options?.includeInputs !== false,
      showBadges: Boolean(options?.showBadges),
      isLocalMode,
    }

    try {
      const data: BookPageExtractionResult & { activeFilePath?: string } = await this.execJsWithTimeout(
        wc,
        `
        (function(opts) {
          try {
            var root = opts.isLocalMode
              ? (document.querySelector('.book-pane') || document.querySelector('.note-pane') || document.body)
              : document.body;
            if (!root) {
              return {
                success: false,
                mode: opts.isLocalMode ? 'local' : 'web',
                title: '',
                chapter: '',
                url: '',
                scrollPercent: 0,
                selectedText: '',
                visibleText: '',
                fullText: '',
                headings: [],
                codeBlocks: [],
                inputs: [],
                links: [],
                error: 'BookView DOM root not found'
              };
            }

            function isElementVisible(el) {
              if (!el || el.nodeType !== 1) return false;
              if (el.id === 'wb-book-link-badges-host' || el.id === 'workbench-selection-bubble-host') return false;
              var style = window.getComputedStyle(el);
              if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') === 0) {
                return false;
              }
              var rect = el.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            }

            var rootRect = opts.isLocalMode && root !== document.body
              ? root.getBoundingClientRect()
              : { top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth, width: window.innerWidth, height: window.innerHeight };

            var viewTop = Math.max(0, rootRect.top);
            var viewBottom = Math.min(window.innerHeight, rootRect.bottom);
            var viewLeft = Math.max(0, rootRect.left);
            var viewRight = Math.min(window.innerWidth, rootRect.right);

            function isInViewport(rect) {
              if (!rect || rect.width <= 0 || rect.height <= 0) return false;
              return rect.bottom > viewTop + 4 && rect.top < viewBottom - 4 && rect.right > viewLeft && rect.left < viewRight;
            }

            // 1. Metadata: Title, Chapter, URL, Selection
            var sel = window.getSelection();
            var selectedText = sel ? sel.toString().trim() : '';
            var pageUrl = opts.isLocalMode ? 'workbench://local-books' : (window.location.href || '');
            var pageTitle = document.title || '';

            var activeFilePath = '';
            if (opts.isLocalMode) {
              var activeTabEl = root.querySelector('.wb-doc-tab.active, [class*="tab"][class*="active"]');
              if (activeTabEl) {
                if (activeTabEl.innerText) {
                  pageTitle = activeTabEl.innerText.trim();
                }
                activeFilePath = activeTabEl.getAttribute('title') || '';
              }
              if (!pageTitle || pageTitle === 'Explorer') {
                var currentCrumb = root.querySelector('.breadcrumb-segment.current');
                if (currentCrumb && currentCrumb.innerText) {
                  pageTitle = 'Folder: ' + currentCrumb.innerText.trim();
                }
              }
            }

            var chapter = '';
            var chapterSelectors = [
              '.epub-chapter-title',
              'h1.title',
              '[data-testid="header-title"]',
              '.chapter-title',
              'article h1',
              'main h1',
              'header h1',
              'h1',
              'h2.title',
              'h2'
            ];
            for (var c = 0; c < chapterSelectors.length; c++) {
              var chEl = root.querySelector(chapterSelectors[c]);
              if (chEl && isElementVisible(chEl) && chEl.innerText && chEl.innerText.trim()) {
                chapter = chEl.innerText.trim();
                break;
              }
            }

            // 2. Scroll percentage detection
            var scrollPercent = 0;
            var scrollContainer = root.querySelector('.epub-reader-scroll, .wb-editor-body, #sbo-rt-content') || document.scrollingElement || document.documentElement;
            if (scrollContainer && scrollContainer.scrollHeight > scrollContainer.clientHeight) {
              scrollPercent = Math.round((scrollContainer.scrollTop / (scrollContainer.scrollHeight - scrollContainer.clientHeight)) * 100);
            } else if (window.innerHeight && document.documentElement.scrollHeight > window.innerHeight) {
              scrollPercent = Math.round((window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100);
            }

            // 3. Identify primary content container inside BookView (ordered by specificity so article wins over outer wrapper)
            var contentSelectors = [
              '#sbo-rt-content',
              '.epub-reader-content',
              '.wb-doc-editor',
              'main article',
              '[role="main"] article',
              'article',
              '.markdown-section',
              '.theme-doc-markdown',
              '.page-inner',
              '#content main',
              'main',
              '[role="main"]',
              '.local-explorer-content'
            ];
            var contentRoot = root;
            for (var cs = 0; cs < contentSelectors.length; cs++) {
              var cand = root.querySelector(contentSelectors[cs]);
              if (cand && isElementVisible(cand) && (cand.innerText || '').trim().length > 40) {
                contentRoot = cand;
                break;
              }
            }

            function isInsideNavigationChrome(el) {
              if (!el || !el.closest || opts.isLocalMode) return false;
              var navAnc = el.closest(
                'nav, [role="navigation"], aside, #sidebar, .sidebar, .book-summary, .nav-chapters, .toc-container, #wb-book-link-badges-host, #workbench-selection-bubble-host, .pane-toolbar'
              );
              return Boolean(navAnc && navAnc !== contentRoot);
            }

            // 4. Headings
            var headings = [];
            contentRoot.querySelectorAll('h1, h2, h3, h4').forEach(function(h) {
              if (isElementVisible(h) && !isInsideNavigationChrome(h)) {
                var hText = (h.innerText || '').trim();
                if (hText && headings.indexOf(hText) === -1) {
                  headings.push(hText);
                }
              }
            });

            // 5. Extract Viewport-Visible Text & Full Chapter Text via TreeWalker (excluding sidebar/nav chrome)
            var visibleBlocks = [];
            var lastVisBlockEl = null;
            var currentVisParts = [];

            var fullBlocks = [];
            var lastFullBlockEl = null;
            var currentFullParts = [];

            var walker = document.createTreeWalker(contentRoot, NodeFilter.SHOW_TEXT, {
              acceptNode: function(node) {
                var val = (node.nodeValue || '').trim();
                if (!val) return NodeFilter.FILTER_REJECT;
                var parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;
                var tag = parent.tagName ? parent.tagName.toLowerCase() : '';
                if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'svg') {
                  return NodeFilter.FILTER_REJECT;
                }
                if (isInsideNavigationChrome(parent)) {
                  return NodeFilter.FILTER_REJECT;
                }
                if (!isElementVisible(parent)) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
              }
            });

            var tNode;
            while ((tNode = walker.nextNode())) {
              var pEl = tNode.parentElement;
              var blockEl = (pEl && pEl.closest)
                ? (pEl.closest('p, h1, h2, h3, h4, h5, h6, li, pre, blockquote, tr, td, th, dt, dd, figcaption, section, article, div') || pEl)
                : pEl;
              var cleanNodeText = (tNode.nodeValue || '').replace(/\\s+/g, ' ').trim();

              // Always accumulate into full chapter blocks when requested
              if (opts.scope === 'full' || opts.scope === 'both') {
                if (blockEl !== lastFullBlockEl) {
                  if (currentFullParts.length > 0) {
                    fullBlocks.push(currentFullParts.join(' '));
                    currentFullParts = [];
                  }
                  lastFullBlockEl = blockEl;
                }
                currentFullParts.push(cleanNodeText);
              }

              // Check viewport intersection for visibleText
              var range = document.createRange();
              range.selectNodeContents(tNode);
              var rect = range.getBoundingClientRect();
              if (isInViewport(rect)) {
                if (blockEl !== lastVisBlockEl) {
                  if (currentVisParts.length > 0) {
                    visibleBlocks.push(currentVisParts.join(' '));
                    currentVisParts = [];
                  }
                  lastVisBlockEl = blockEl;
                }
                currentVisParts.push(cleanNodeText);
              }
            }
            if (currentVisParts.length > 0) {
              visibleBlocks.push(currentVisParts.join(' '));
            }
            if (currentFullParts.length > 0) {
              fullBlocks.push(currentFullParts.join(' '));
            }

            var visibleText = visibleBlocks.join('\\n').trim();

            // 6. Full Page / Chapter Text
            var fullText = fullBlocks.join('\\n').trim();
            if (!fullText && (opts.scope === 'full' || opts.scope === 'both' || !visibleText)) {
              fullText = (contentRoot.innerText || '').trim();
            }
            if (fullText.length > 60000) {
              fullText = fullText.slice(0, 60000) + '\\n... [truncated at 60,000 chars]';
            }
            if (!visibleText && fullText) {
              visibleText = fullText.slice(0, 8000);
            }

            // 7. Code Blocks
            var codeBlocks = [];
            contentRoot.querySelectorAll('pre, code-block').forEach(function(pre) {
              if (!isElementVisible(pre)) return;
              var rect = pre.getBoundingClientRect();
              if (opts.scope === 'viewport' && !isInViewport(rect)) return;
              var codeText = (pre.innerText || '').trim();
              if (codeText && codeText.length > 3) {
                var codeEl = pre.querySelector('code');
                var cls = ((codeEl ? codeEl.className : '') + ' ' + pre.className).toLowerCase();
                var m = cls.match(/language-([a-z0-9_\\-#+]+)/i);
                codeBlocks.push({
                  language: m ? m[1] : 'text',
                  code: codeText.slice(0, 8000)
                });
              }
            });

            // 8. Form Inputs & Interactive Controls
            var inputs = [];
            if (opts.includeInputs) {
              var inputNodes = root.querySelectorAll(
                'input:not([type="hidden"]), textarea, select, [contenteditable="true"], [role="textbox"], [role="combobox"], [role="searchbox"]'
              );
              var inputIdx = 1;
              inputNodes.forEach(function(inp) {
                if (!isElementVisible(inp)) return;
                if (inp.closest && inp.closest('.pane-toolbar')) return;
                var rect = inp.getBoundingClientRect();
                var inVp = isInViewport(rect);
                var tag = (inp.tagName || '').toLowerCase();
                var type = inp.getAttribute('type') || (tag === 'select' ? 'select' : (tag === 'textarea' ? 'textarea' : 'text'));
                var name = inp.getAttribute('name') || inp.id || '';
                var placeholder = inp.getAttribute('placeholder') || '';

                var label = inp.getAttribute('aria-label') || inp.getAttribute('title') || '';
                if (!label && inp.id) {
                  var lblEl = root.querySelector('label[for="' + CSS.escape(inp.id) + '"]');
                  if (lblEl && lblEl.innerText) label = lblEl.innerText.trim();
                }
                if (!label && inp.closest) {
                  var parentLbl = inp.closest('label');
                  if (parentLbl && parentLbl.innerText) label = parentLbl.innerText.trim();
                }

                var val = '';
                if (type === 'password') {
                  val = inp.value ? '********' : '';
                } else if (type === 'checkbox' || type === 'radio') {
                  val = inp.checked ? 'checked' : 'unchecked';
                } else if (tag === 'select') {
                  var selOpt = inp.options && inp.selectedIndex >= 0 ? inp.options[inp.selectedIndex] : null;
                  val = selOpt ? (selOpt.text || selOpt.value) : (inp.value || '');
                } else {
                  val = (inp.value !== undefined ? inp.value : (inp.innerText || '')).trim();
                }

                var optionsList = undefined;
                if (tag === 'select' && inp.options) {
                  optionsList = Array.from(inp.options).slice(0, 25).map(function(o) { return (o.text || o.value || '').trim(); }).filter(Boolean);
                }

                inp.setAttribute('data-wb-input-id', String(inputIdx));
                inputs.push({
                  id: inputIdx++,
                  tag: tag,
                  type: type,
                  name: name,
                  label: label.slice(0, 120),
                  placeholder: placeholder.slice(0, 120),
                  value: String(val).slice(0, 500),
                  options: optionsList,
                  inViewport: inVp
                });
              });
            }

            // 9. Links & Interactive Navigation Elements
            var links = [];
            if (opts.includeLinks) {
              var candidates = Array.from(
                root.querySelectorAll('a[href], a[data-filepos], button, [role="link"], [role="button"], .wb-file-row, .wb-doc-tab, .details-row, .grid-card, .sidebar-tree-node, .breadcrumb-segment')
              );
              var linkIdx = 1;
              var seenKeys = new Set();

              candidates.forEach(function(el) {
                if (!isElementVisible(el)) return;
                if (el.closest && el.closest('.pane-toolbar, #wb-book-link-badges-host, #workbench-selection-bubble-host')) return;

                var rect = el.getBoundingClientRect();
                var inVp = isInViewport(rect);

                var text = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
                var ariaLabel = (el.getAttribute('aria-label') || el.getAttribute('title') || '').trim();
                var displayLabel = text || ariaLabel;
                if (!displayLabel || displayLabel.length < 1) return;
                if (displayLabel.length > 140) displayLabel = displayLabel.slice(0, 137) + '...';

                var rawHref = el.getAttribute('href') || el.getAttribute('data-filepos') || '';
                var resolvedHref = (el.href && typeof el.href === 'string') ? el.href : rawHref;

                var dedupKey = displayLabel.toLowerCase() + '|' + resolvedHref + '|' + Math.round(rect.top);
                if (seenKeys.has(dedupKey)) return;
                seenKeys.add(dedupKey);

                var linkType = 'link';
                var lowerText = displayLabel.toLowerCase();
                if (
                  el.getAttribute('rel') === 'next' ||
                  el.getAttribute('rel') === 'prev' ||
                  /\\b(next|prev|previous|forward|back|chapter|page)\\b/i.test(lowerText)
                ) {
                  linkType = 'nav';
                } else if (el.closest && el.closest('nav, [role="navigation"], [class*="toc" i], [class*="sidebar" i]')) {
                  linkType = 'toc';
                } else if (el.tagName && el.tagName.toLowerCase() === 'button') {
                  linkType = 'button';
                }

                var assignedId = linkIdx++;
                el.setAttribute('data-wb-link-id', String(assignedId));

                links.push({
                  id: assignedId,
                  text: displayLabel,
                  href: resolvedHref,
                  type: linkType,
                  inViewport: inVp,
                  title: ariaLabel || undefined
                });
              });

              // Sort so viewport-visible links appear first when listed, while keeping stable IDs
              if (opts.showBadges && window.__wbRenderBookBadges) {
                window.__wbRenderBookBadges(root, true);
              }
            }

            return {
              success: true,
              mode: opts.isLocalMode ? 'local' : 'web',
              title: pageTitle,
              chapter: chapter,
              url: pageUrl,
              activeFilePath: activeFilePath,
              scrollPercent: scrollPercent,
              selectedText: selectedText,
              visibleText: visibleText,
              fullText: fullText,
              headings: headings.slice(0, 40),
              codeBlocks: codeBlocks.slice(0, 25),
              inputs: inputs.slice(0, 50),
              links: links.slice(0, 120)
            };
          } catch (innerErr) {
            return {
              success: false,
              mode: opts.isLocalMode ? 'local' : 'web',
              title: '',
              chapter: '',
              url: '',
              scrollPercent: 0,
              selectedText: '',
              visibleText: '',
              fullText: '',
              headings: [],
              codeBlocks: [],
              inputs: [],
              links: [],
              error: innerErr && innerErr.message ? innerErr.message : String(innerErr)
            };
          }
        })(${JSON.stringify(opts)})
      `,
        4000
      )

      // If a PDF tab is open in Local Mode (visual viewer <embed>), enrich visibleText/fullText with actual PDF text
      if (
        isLocalMode &&
        data.success &&
        data.activeFilePath &&
        data.activeFilePath.toLowerCase().endsWith('.pdf') &&
        fs.existsSync(data.activeFilePath) &&
        (data.visibleText || '').length < 300
      ) {
        try {
          const pdfBuffer = await fs.promises.readFile(data.activeFilePath)
          const pdfParseModule: any = await import('pdf-parse')
          let extractedPdfText = ''
          const maxPages = options?.scope === 'full' ? 30 : 8
          if (pdfParseModule.PDFParse) {
            const parser = new pdfParseModule.PDFParse({ data: pdfBuffer })
            const textResult = await parser.getText({ first: maxPages })
            extractedPdfText = textResult.text || ''
            if (typeof parser.destroy === 'function') {
              try {
                await parser.destroy()
              } catch (_) {}
            }
          } else {
            const parseFn = typeof pdfParseModule.default === 'function' ? pdfParseModule.default : pdfParseModule
            const parsedPdf = await parseFn(pdfBuffer, { max: maxPages })
            extractedPdfText = parsedPdf.text || ''
          }
          const cleanPdfText = (extractedPdfText || '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
          if (cleanPdfText) {
            data.visibleText = cleanPdfText.slice(0, 12000)
            data.fullText = cleanPdfText.slice(0, 50000)
            data.url = data.activeFilePath
          }
        } catch (pdfErr) {
          console.warn('[BookView] Local PDF text enrichment warning:', pdfErr)
        }
      }

      if (options?.showBadges) {
        await this.renderOrClearBadges(true)
      }

      return data
    } catch (err: any) {
      console.error('[BookView] extractVisiblePage error:', err)
      // If Web BookView timed out or failed, automatically fall back to Local BookView (.book-pane in mainWindow)
      if (!isLocalMode && !options?._forceLocalFallback && this.mainWindow && !this.mainWindow.isDestroyed()) {
        return await this.extractVisiblePage({ ...options, _forceLocalFallback: true })
      }
      return {
        success: false,
        mode: isLocalMode ? 'local' : 'web',
        title: '',
        chapter: '',
        url: '',
        scrollPercent: 0,
        selectedText: '',
        visibleText: '',
        fullText: '',
        headings: [],
        codeBlocks: [],
        inputs: [],
        links: [],
        error: err?.message || 'Failed to extract BookView page',
      }
    }
  }

  /**
   * Renders or clears Vimium-style numeric link badges (`[1]`, `[2]`, ...) over visible BookView links.
   */
  public async renderOrClearBadges(show: boolean): Promise<void> {
    const { wc, isLocalMode } = this.getTargetWebContents()
    if (!wc) return

    try {
      await this.execJsWithTimeout(
        wc,
        `
        (function(show, isLocalMode) {
          var existingHost = document.getElementById('wb-book-link-badges-host');
          if (existingHost) existingHost.remove();
          if (!show) return;

          var root = isLocalMode ? (document.querySelector('.book-pane') || document.body) : document.body;
          if (!root) return;

          var host = document.createElement('div');
          host.id = 'wb-book-link-badges-host';
          host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483640;pointer-events:none;';

          var rootRect = isLocalMode && root !== document.body
            ? root.getBoundingClientRect()
            : { top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth };

          var indexedEls = root.querySelectorAll('[data-wb-link-id]');
          indexedEls.forEach(function(el) {
            var id = el.getAttribute('data-wb-link-id');
            if (!id) return;
            var rect = el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;
            if (rect.bottom < rootRect.top + 4 || rect.top > rootRect.bottom - 4 || rect.right < rootRect.left || rect.left > rootRect.right) {
              return;
            }

            var badge = document.createElement('div');
            badge.textContent = '#' + id;
            badge.style.cssText = [
              'position:fixed',
              'left:' + Math.max(4, Math.round(rect.left - 4)) + 'px',
              'top:' + Math.max(4, Math.round(rect.top - 8)) + 'px',
              'padding:1px 5px',
              'background:linear-gradient(135deg,#10b981,#059669)',
              'color:#ffffff',
              'font-family:JetBrains Mono,Consolas,monospace',
              'font-size:10px',
              'font-weight:700',
              'line-height:1.3',
              'border-radius:4px',
              'border:1px solid rgba(255,255,255,0.4)',
              'box-shadow:0 2px 6px rgba(0,0,0,0.55)',
              'pointer-events:none',
              'z-index:2147483641'
            ].join(';');
            host.appendChild(badge);
          });

          document.body.appendChild(host);

          // Auto-clear badges on scroll or after 25 seconds so they never get stuck
          var clearFn = function() {
            var h = document.getElementById('wb-book-link-badges-host');
            if (h) h.remove();
            window.removeEventListener('scroll', clearFn, true);
          };
          window.addEventListener('scroll', clearFn, true);
          setTimeout(clearFn, 25000);
        })(${JSON.stringify(show)}, ${JSON.stringify(isLocalMode)})
      `)
    } catch (_) {}
  }

  /**
   * Extracts and indexes all interactive links/buttons in BookView.
   */
  public async extractAndIndexLinks(options?: {
    viewportOnly?: boolean
    showBadges?: boolean
    filter?: string
  }): Promise<{
    success: boolean
    title: string
    url: string
    links: BookLinkItem[]
    error?: string
  }> {
    const page = await this.extractVisiblePage({
      scope: 'viewport',
      includeLinks: true,
      includeInputs: false,
      showBadges: options?.showBadges,
    })

    if (!page.success) {
      return {
        success: false,
        title: page.title,
        url: page.url,
        links: [],
        error: page.error,
      }
    }

    let links = page.links || []
    if (options?.viewportOnly) {
      const vpLinks = links.filter((l) => l.inViewport)
      if (vpLinks.length > 0) links = vpLinks
    }

    if (options?.filter && options.filter.trim()) {
      const q = options.filter.trim().toLowerCase()
      links = links.filter(
        (l) =>
          l.text.toLowerCase().includes(q) ||
          (l.href && l.href.toLowerCase().includes(q)) ||
          (l.title && l.title.toLowerCase().includes(q))
      )
    }

    return {
      success: true,
      title: page.title,
      url: page.url,
      links,
    }
  }

  /**
   * Clicks a link, button, or navigation element inside BookView by numeric ID, text match, or CSS selector.
   */
  public async clickLinkOrElement(target: {
    id?: number
    text?: string
    selector?: string
  }): Promise<BookClickResult> {
    const { wc, isLocalMode } = this.getTargetWebContents()
    if (!wc) {
      return {
        success: false,
        message: 'BookView is not ready',
        error: 'BookView is not ready',
      }
    }

    try {
      // Ensure links are indexed so numeric IDs and attributes are fresh
      await this.extractVisiblePage({ scope: 'viewport', includeLinks: true, includeInputs: false })

      const clickRes: {
        found: boolean
        clickedId?: number
        clickedText?: string
        tag?: string
        href?: string
        shouldLoadUrl?: string
        error?: string
      } = await this.execJsWithTimeout(
        wc,
        `
        (function(target, isLocalMode) {
          try {
            // Clear any floating link badges upon click
            var badgeHost = document.getElementById('wb-book-link-badges-host');
            if (badgeHost) badgeHost.remove();

            var root = isLocalMode
              ? (document.querySelector('.book-pane') || document.querySelector('.note-pane') || document.body)
              : document.body;
            if (!root) return { found: false, error: 'BookView root not found' };

            function isElementVisible(el) {
              if (!el || el.nodeType !== 1) return false;
              var style = window.getComputedStyle(el);
              if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') === 0) {
                return false;
              }
              var rect = el.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            }

            var chosen = null;

            // 1. Lookup by numeric ID (#1, 1, etc.)
            if (typeof target.id === 'number' && !isNaN(target.id)) {
              chosen = root.querySelector('[data-wb-link-id="' + target.id + '"]');
            }

            // 2. Lookup by explicit CSS selector
            if (!chosen && target.selector && typeof target.selector === 'string') {
              try {
                chosen = root.querySelector(target.selector);
              } catch (_) {}
            }

            // 3. Lookup by text / label / href match (or if target.text is a number like "4" or "#4")
            if (!chosen && target.text && typeof target.text === 'string') {
              var cleanQuery = target.text.trim();
              var numMatch = cleanQuery.match(/^#?(\\d+)$/);
              if (numMatch) {
                chosen = root.querySelector('[data-wb-link-id="' + numMatch[1] + '"]');
              }

              if (!chosen) {
                var qLower = cleanQuery.toLowerCase();
                var candidates = Array.from(
                  root.querySelectorAll('a[href], a[data-filepos], button, [role="link"], [role="button"], .wb-file-row, .wb-doc-tab, .details-row, .grid-card, .sidebar-tree-node, .breadcrumb-segment')
                ).filter(isElementVisible);

                var bestScore = 0;
                for (var i = 0; i < candidates.length; i++) {
                  var el = candidates[i];
                  if (el.closest && el.closest('.pane-toolbar')) continue;
                  var txt = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
                  var aria = (el.getAttribute('aria-label') || el.getAttribute('title') || '').trim();
                  var href = el.getAttribute('href') || '';
                  var tLower = txt.toLowerCase();
                  var aLower = aria.toLowerCase();
                  var hLower = href.toLowerCase();

                  var score = 0;
                  if (tLower === qLower || aLower === qLower) {
                    score = 100;
                  } else if (tLower.startsWith(qLower) || aLower.startsWith(qLower)) {
                    score = 80;
                  } else if (tLower.includes(qLower) || aLower.includes(qLower)) {
                    score = 60;
                  } else if (hLower.includes(qLower)) {
                    score = 40;
                  }

                  // Semantic aliases for Next / Previous chapter controls
                  if (score === 0) {
                    if ((qLower === 'next' || qLower === 'next chapter' || qLower === 'next page') &&
                        (el.getAttribute('rel') === 'next' || /\\b(next|forward)\\b/i.test(tLower + ' ' + aLower))) {
                      score = 75;
                    } else if ((qLower === 'prev' || qLower === 'previous' || qLower === 'prev chapter' || qLower === 'previous chapter') &&
                               (el.getAttribute('rel') === 'prev' || /\\b(prev|previous|back)\\b/i.test(tLower + ' ' + aLower))) {
                      score = 75;
                    }
                  }

                  if (score > 0) {
                    var rect = el.getBoundingClientRect();
                    if (rect.top >= 0 && rect.bottom <= window.innerHeight) {
                      score += 10; // Prefer visible viewport matches
                    }
                    if (score > bestScore) {
                      bestScore = score;
                      chosen = el;
                    }
                  }
                }
              }
            }

            if (!chosen) {
              return {
                found: false,
                error: 'No matching link or button found in BookView for ' + JSON.stringify(target)
              };
            }

            var clickedIdAttr = chosen.getAttribute('data-wb-link-id');
            var clickedId = clickedIdAttr ? parseInt(clickedIdAttr, 10) : undefined;
            var clickedText = (chosen.innerText || chosen.textContent || chosen.getAttribute('aria-label') || chosen.getAttribute('title') || '').replace(/\\s+/g, ' ').trim();
            var tag = (chosen.tagName || '').toLowerCase();
            var href = (chosen.href && typeof chosen.href === 'string') ? chosen.href : (chosen.getAttribute('href') || '');

            // Scroll into view & visual emerald highlight ring
            try {
              chosen.scrollIntoView({ behavior: 'smooth', block: 'center' });
              var prevOutline = chosen.style.outline;
              var prevBoxShadow = chosen.style.boxShadow;
              chosen.style.outline = '3px solid #10b981';
              chosen.style.boxShadow = '0 0 18px rgba(16, 185, 129, 0.85)';
              setTimeout(function() {
                try {
                  chosen.style.outline = prevOutline;
                  chosen.style.boxShadow = prevBoxShadow;
                } catch (_) {}
              }, 1200);
            } catch (_) {}

            // If anchor has target="_blank" in Web BookView, remove target="_blank" so it navigates inside BookView
            if (!isLocalMode && tag === 'a' && chosen.getAttribute('target') === '_blank') {
              chosen.removeAttribute('target');
            }

            // Dispatch realistic pointer & mouse events + native click()
            var eventOpts = { bubbles: true, cancelable: true, view: window };
            try {
              chosen.dispatchEvent(new PointerEvent('pointerdown', eventOpts));
              chosen.dispatchEvent(new MouseEvent('mousedown', eventOpts));
              chosen.dispatchEvent(new PointerEvent('pointerup', eventOpts));
              chosen.dispatchEvent(new MouseEvent('mouseup', eventOpts));
            } catch (_) {}

            if (typeof chosen.click === 'function') {
              chosen.click();
            } else {
              chosen.dispatchEvent(new MouseEvent('click', eventOpts));
            }

            // In LocalExplorer (.details-row / .grid-card), double-clicking opens the file or folder
            if (chosen.classList && (chosen.classList.contains('details-row') || chosen.classList.contains('grid-card'))) {
              chosen.dispatchEvent(new MouseEvent('dblclick', eventOpts));
            }

            return {
              found: true,
              clickedId: clickedId,
              clickedText: clickedText.slice(0, 140),
              tag: tag,
              href: href
            };
          } catch (err) {
            return {
              found: false,
              error: err && err.message ? err.message : String(err)
            };
          }
        })(${JSON.stringify(target)}, ${JSON.stringify(isLocalMode)})
      `)

      if (!clickRes.found) {
        return {
          success: false,
          message: clickRes.error || 'Could not find matching link in BookView',
          error: clickRes.error || 'Element not found',
        }
      }

      // Allow brief time for SPA or page navigation to settle
      await new Promise((r) => setTimeout(r, 450))

      const newTitle = !wc.isDestroyed() ? wc.getTitle() : ''
      const newUrl = isLocalMode ? 'workbench://local-books' : (!wc.isDestroyed() ? wc.getURL() : '')

      return {
        success: true,
        clickedId: clickRes.clickedId,
        clickedText: clickRes.clickedText,
        tag: clickRes.tag,
        href: clickRes.href,
        newTitle,
        newUrl,
        message: `Clicked "${clickRes.clickedText || clickRes.href || 'element'}"${clickRes.clickedId ? ` (#${clickRes.clickedId})` : ''} in BookView`,
      }
    } catch (err: any) {
      console.error('[BookView] clickLinkOrElement error:', err)
      return {
        success: false,
        message: err?.message || 'Failed to click link in BookView',
        error: err?.message || 'Click execution error',
      }
    }
  }

  /**
   * Scrolls or navigates BookView (scroll-down, scroll-up, scroll-top, scroll-bottom, next, prev, back, forward, reload, home, url).
   */
  public async scrollOrNavigate(params: {
    command:
      | 'scroll-down'
      | 'scroll-up'
      | 'scroll-top'
      | 'scroll-bottom'
      | 'next'
      | 'prev'
      | 'back'
      | 'forward'
      | 'reload'
      | 'home'
      | 'url'
      | 'clear-badges'
      | 'show-badges'
    url?: string
  }): Promise<BookNavResult> {
    const cmd = params.command

    if (cmd === 'clear-badges' || cmd === 'show-badges') {
      await this.renderOrClearBadges(cmd === 'show-badges')
      return {
        success: true,
        command: cmd,
        message: cmd === 'show-badges' ? 'Displayed link badges in BookView' : 'Cleared link badges in BookView',
      }
    }

    if (cmd === 'back' || cmd === 'forward' || cmd === 'reload' || cmd === 'home') {
      this.handleNavAction(cmd)
      await new Promise((r) => setTimeout(r, 350))
      const { wc, isLocalMode } = this.getTargetWebContents()
      return {
        success: true,
        command: cmd,
        title: wc && !wc.isDestroyed() ? wc.getTitle() : '',
        url: isLocalMode ? 'workbench://local-books' : (wc && !wc.isDestroyed() ? wc.getURL() : ''),
        message: `Executed BookView navigation: ${cmd}`,
      }
    }

    if (cmd === 'url') {
      const targetUrl = (params.url || '').trim()
      if (!targetUrl) {
        return { success: false, command: 'url', message: 'Missing URL parameter', error: 'Missing URL' }
      }
      const normalizedUrl =
        targetUrl.startsWith('http://') || targetUrl.startsWith('https://')
          ? targetUrl
          : `https://${targetUrl}`

      if (this.view && !this.view.webContents.isDestroyed()) {
        await this.view.webContents.loadURL(normalizedUrl).catch((err) => {
          console.warn('[BookView] loadURL warning:', err)
        })
        return {
          success: true,
          command: 'url',
          title: this.view.webContents.getTitle(),
          url: this.view.webContents.getURL(),
          message: `Navigated BookView to ${normalizedUrl}`,
        }
      }
      return {
        success: false,
        command: 'url',
        message: 'BookView is currently in Local Books mode. Switch to a web book source to load URLs.',
        error: 'Local mode active',
      }
    }

    if (cmd === 'next' || cmd === 'prev') {
      const res = await this.clickLinkOrElement({ text: cmd === 'next' ? 'next' : 'previous' })
      return {
        success: res.success,
        command: cmd,
        title: res.newTitle,
        url: res.newUrl,
        message: res.success
          ? `Navigated to ${cmd === 'next' ? 'next' : 'previous'} section (${res.clickedText || ''})`
          : `Could not find a "${cmd}" button or link on the current BookView page`,
        error: res.error,
      }
    }

    // Scroll operations ('scroll-down' | 'scroll-up' | 'scroll-top' | 'scroll-bottom')
    const { wc, isLocalMode } = this.getTargetWebContents()
    if (!wc) {
      return { success: false, command: cmd, message: 'BookView is not ready', error: 'BookView not ready' }
    }

    try {
      const scrollRes: { scrollPercent: number; scrolled: boolean } = await this.execJsWithTimeout(
        wc,
        `
        (function(cmd, isLocalMode) {
          var root = isLocalMode
            ? (document.querySelector('.book-pane') || document.body)
            : document.body;

          // Find active scrollable container
          var scrollTarget = null;
          var knownSelectors = ['.epub-reader-scroll', '.wb-editor-body', '#sbo-rt-content', 'main', 'article'];
          for (var i = 0; i < knownSelectors.length; i++) {
            var el = root.querySelector(knownSelectors[i]);
            if (el && el.scrollHeight > el.clientHeight + 20) {
              var st = window.getComputedStyle(el);
              if (st.overflowY === 'auto' || st.overflowY === 'scroll' || st.overflow === 'auto' || st.overflow === 'scroll') {
                scrollTarget = el;
                break;
              }
            }
          }

          if (!scrollTarget) {
            var allDivs = root.querySelectorAll('div, section, main, article');
            var maxArea = 0;
            allDivs.forEach(function(d) {
              if (d.scrollHeight > d.clientHeight + 40) {
                var st = window.getComputedStyle(d);
                if (st.overflowY === 'auto' || st.overflowY === 'scroll') {
                  var r = d.getBoundingClientRect();
                  var area = r.width * r.height;
                  if (area > maxArea) {
                    maxArea = area;
                    scrollTarget = d;
                  }
                }
              }
            });
          }

          var delta = 0;
          if (scrollTarget) {
            var step = Math.round(scrollTarget.clientHeight * 0.78);
            if (cmd === 'scroll-down') scrollTarget.scrollBy({ top: step, behavior: 'smooth' });
            else if (cmd === 'scroll-up') scrollTarget.scrollBy({ top: -step, behavior: 'smooth' });
            else if (cmd === 'scroll-top') scrollTarget.scrollTo({ top: 0, behavior: 'smooth' });
            else if (cmd === 'scroll-bottom') scrollTarget.scrollTo({ top: scrollTarget.scrollHeight, behavior: 'smooth' });

            var pct = scrollTarget.scrollHeight > scrollTarget.clientHeight
              ? Math.round((scrollTarget.scrollTop / (scrollTarget.scrollHeight - scrollTarget.clientHeight)) * 100)
              : 0;
            return { scrolled: true, scrollPercent: pct };
          } else {
            var winStep = Math.round(window.innerHeight * 0.78);
            if (cmd === 'scroll-down') window.scrollBy({ top: winStep, behavior: 'smooth' });
            else if (cmd === 'scroll-up') window.scrollBy({ top: -winStep, behavior: 'smooth' });
            else if (cmd === 'scroll-top') window.scrollTo({ top: 0, behavior: 'smooth' });
            else if (cmd === 'scroll-bottom') window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });

            var docEl = document.scrollingElement || document.documentElement;
            var pctWin = docEl.scrollHeight > window.innerHeight
              ? Math.round((window.scrollY / (docEl.scrollHeight - window.innerHeight)) * 100)
              : 0;
            return { scrolled: true, scrollPercent: pctWin };
          }
        })(${JSON.stringify(cmd)}, ${JSON.stringify(isLocalMode)})
      `)

      return {
        success: true,
        command: cmd,
        title: !wc.isDestroyed() ? wc.getTitle() : '',
        url: isLocalMode ? 'workbench://local-books' : (!wc.isDestroyed() ? wc.getURL() : ''),
        scrollPercent: scrollRes.scrollPercent,
        message: `Scrolled BookView (${cmd}, ~${scrollRes.scrollPercent}%)`,
      }
    } catch (err: any) {
      return {
        success: false,
        command: cmd,
        message: err?.message || 'Failed to scroll BookView',
        error: err?.message,
      }
    }
  }
}
