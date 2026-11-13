import { WebContentsView, BrowserWindow, session, Rectangle, Menu } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { AuthCoordinator } from '../auth/authCoordinator'
import { CHROME_DESKTOP_UA } from '../auth/strategies/defaultAuthStrategy'
import { BookSourceManager, BookSource } from '../services/bookSourceManager'
import { getViewPreloadPath } from '../utils/preloadPath'
import { Logger } from '../services/logger'
import type { BookMaterialType } from '../utils/bookCommandParser'

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

export type { BookMaterialType }

export interface BookVideoContext {
  hasVideo: boolean
  platform: 'oreilly-video' | 'youtube' | 'coursera' | 'udemy' | 'html5' | 'unknown'
  videoTitle: string
  currentTimeSec: number
  durationSec: number
  currentTimestampFormatted: string
  paused: boolean
  transcriptSource: 'dom-transcript' | 'text-track' | 'none'
  nearbyCues: Array<{ time: string; text: string; isCurrent?: boolean }>
  fullTranscript: string
  chapters: Array<{ time?: string; title: string; isCurrent?: boolean }>
}

export interface BookPageDesignInfo {
  materialType: BookMaterialType
  platformHint?: string
  containerSelector: string
  breadcrumbs: string[]
  inPageOutline: string[]
  hasSidebarToc: boolean
  paginationLabel?: string
  headingOutline: Array<{ level: number; text: string; inViewport: boolean }>
  figures: Array<{ caption: string; alt: string; kind: 'img' | 'svg' | 'figure' | 'chart'; inViewport: boolean }>
  callouts: Array<{ kind: string; text: string; inViewport: boolean }>
  tableCount: number
  interactiveWidgets: Array<{ kind: 'tabs' | 'details' | 'quiz' | 'sandbox' | 'video'; label: string }>
  video?: BookVideoContext
}

export interface BookMaterialClassification {
  materialType: BookMaterialType
  platformHint: string
  pageUrl: string
  documentTitle: string
  activeFilePath?: string
  activeTabTitle?: string
  hasVideo: boolean
  hasReaderIframe: boolean
  selectedText: string
}

export interface BookPageExtractionResult {
  success: boolean
  mode: 'web' | 'local'
  title: string
  chapter: string
  url: string
  activeFilePath?: string
  scrollPercent: number
  selectedText: string
  visibleText: string
  fullText: string
  headings: string[]
  codeBlocks: Array<{ language: string; code: string }>
  inputs: BookInputItem[]
  links: BookLinkItem[]
  pageDesign?: BookPageDesignInfo
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
        } catch (_) { }
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
          } catch (_) { }
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
        } catch (_) { }
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
        this.view.webContents.loadURL(source.url).catch(() => { })
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
              .catch(() => { })
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
   * Stage 1: Fast Material Classifier.
   * Classifies what kind of learning material is active in BookView BEFORE running extraction,
   * so each format routes to a dedicated, chrome-free extractor.
   */
  private async classifyBookMaterial(
    wc: Electron.WebContents,
    isLocalMode: boolean
  ): Promise<BookMaterialClassification> {
    const fallbackUrl = isLocalMode ? 'workbench://local-books' : (!wc.isDestroyed() ? wc.getURL() : '')
    const fallbackTitle = !wc.isDestroyed() ? wc.getTitle() : ''

    try {
      return await this.execJsWithTimeout<BookMaterialClassification>(
        wc,
        `
        (function(isLocalMode, fallbackUrl) {
          var pageUrl = isLocalMode ? 'workbench://local-books' : (window.location.href || fallbackUrl || '');
          var docTitle = document.title || '';
          var sel = window.getSelection();
          var selectedText = sel ? sel.toString().trim() : '';

          if (isLocalMode) {
            var root = document.querySelector('.book-pane') || document.querySelector('.note-pane') || document.body;
            var activeTab = root ? root.querySelector('.wb-doc-tab.active, [class*="tab"][class*="active"]') : null;
            var activeFilePath = activeTab ? (activeTab.getAttribute('title') || '') : '';
            var activeTabTitle = activeTab && activeTab.innerText ? activeTab.innerText.trim() : '';
            var lowerPath = activeFilePath.toLowerCase();
            var materialType = 'local-doc';
            var platformHint = 'local-doc';
            if (lowerPath.endsWith('.pdf')) {
              materialType = 'local-pdf';
              platformHint = 'local-pdf';
            } else if (lowerPath.endsWith('.epub') || lowerPath.endsWith('.mobi') || lowerPath.endsWith('.azw3')) {
              materialType = 'local-ebook';
              platformHint = lowerPath.endsWith('.epub') ? 'local-epub' : 'local-mobi';
            } else if (root && root.querySelector('.epub-reader-content')) {
              materialType = 'local-ebook';
              platformHint = 'local-epub';
            }
            return {
              materialType: materialType,
              platformHint: platformHint,
              pageUrl: pageUrl,
              documentTitle: activeTabTitle || docTitle,
              activeFilePath: activeFilePath,
              activeTabTitle: activeTabTitle,
              hasVideo: false,
              hasReaderIframe: false,
              selectedText: selectedText
            };
          }

          var lowerUrl = pageUrl.toLowerCase();
          var videos = Array.from(document.querySelectorAll('video')).filter(function(v) {
            var r = v.getBoundingClientRect();
            return r.width > 80 && r.height > 60;
          });
          var hasVideo = videos.length > 0;
          var hasTranscriptDom = Boolean(
            document.querySelector(
              '[class*="transcript" i], ytd-transcript-renderer, ytd-transcript-segment-renderer, .rc-Transcript, [data-purpose*="transcript"]'
            )
          );
          var isKnownVideoUrl =
            /learning\\.oreilly\\.com\\/videos\\//i.test(lowerUrl) ||
            /youtube\\.com\\/watch/i.test(lowerUrl) ||
            /youtu\\.be\\//i.test(lowerUrl) ||
            /coursera\\.org\\/learn\\/[^/]+\\/lecture/i.test(lowerUrl) ||
            /udemy\\.com\\/course\\/[^/]+\\/learn\\/lecture/i.test(lowerUrl) ||
            /pluralsight\\.com\\/courses\\/player/i.test(lowerUrl);

          if (isKnownVideoUrl || (hasVideo && (hasTranscriptDom || document.querySelectorAll('article p').length < 5))) {
            var vPlat = 'html5';
            if (/oreilly\\.com/i.test(lowerUrl)) vPlat = 'oreilly-video';
            else if (/youtube\\.com|youtu\\.be/i.test(lowerUrl)) vPlat = 'youtube';
            else if (/coursera\\.org/i.test(lowerUrl)) vPlat = 'coursera';
            else if (/udemy\\.com/i.test(lowerUrl)) vPlat = 'udemy';
            return {
              materialType: 'video-course',
              platformHint: vPlat,
              pageUrl: pageUrl,
              documentTitle: docTitle,
              hasVideo: true,
              hasReaderIframe: false,
              selectedText: selectedText
            };
          }

          var hasKindleIframe = Boolean(
            document.querySelector('#KindleReaderIFrame, iframe[id*="Kindle" i], iframe[src*="kindle" i], .kg-client-root')
          );
          if (/read\\.amazon\\./i.test(lowerUrl) || hasKindleIframe) {
            return {
              materialType: 'ereader-spa',
              platformHint: 'kindle',
              pageUrl: pageUrl,
              documentTitle: docTitle,
              hasVideo: hasVideo,
              hasReaderIframe: true,
              selectedText: selectedText
            };
          }

          if (
            /learning\\.oreilly\\.com\\/library\\//i.test(lowerUrl) ||
            document.querySelector('#sbo-rt-content, [data-testid="reader-content"]')
          ) {
            return {
              materialType: 'ebook-web',
              platformHint: 'oreilly-book',
              pageUrl: pageUrl,
              documentTitle: docTitle,
              hasVideo: hasVideo,
              hasReaderIframe: false,
              selectedText: selectedText
            };
          }

          var isCourseDocs = Boolean(
            document.querySelector(
              '.bd-sidebar-primary, .bd-article-container, .bd-sidebar-secondary, .theme-doc-markdown, .markdown-section, .book-summary, .sphinxsidebar, .nav-chapters, #main-content'
            ) ||
            (/cs\\.cornell\\.edu|docs\\.|readthedocs|gitbook|github\\.io/i.test(lowerUrl) && document.querySelector('article, main'))
          );
          if (isCourseDocs) {
            return {
              materialType: 'course-docs',
              platformHint: 'course-docs',
              pageUrl: pageUrl,
              documentTitle: docTitle,
              hasVideo: hasVideo,
              hasReaderIframe: false,
              selectedText: selectedText
            };
          }

          return {
            materialType: 'generic-article',
            platformHint: 'web',
            pageUrl: pageUrl,
            documentTitle: docTitle,
            hasVideo: hasVideo,
            hasReaderIframe: document.querySelectorAll('iframe').length > 0,
            selectedText: selectedText
          };
        })(${JSON.stringify(isLocalMode)}, ${JSON.stringify(fallbackUrl)})
      `,
        1800
      )
    } catch (_) {
      return {
        materialType: isLocalMode ? 'local-doc' : 'generic-article',
        platformHint: isLocalMode ? 'local' : 'web',
        pageUrl: fallbackUrl,
        documentTitle: fallbackTitle,
        hasVideo: false,
        hasReaderIframe: false,
        selectedText: '',
      }
    }
  }

  /**
   * Route A: Specialized Local PDF Extractor (leaves PdfEditor.tsx completely untouched).
   */
  private async extractLocalPdfMaterial(
    classification: BookMaterialClassification,
    scope: 'viewport' | 'full' | 'both',
    pageRangeHint?: { startPage: number; endPage: number }
  ): Promise<BookPageExtractionResult> {
    const filePath = classification.activeFilePath || ''
    const title = classification.activeTabTitle || path.basename(filePath || 'Document.pdf')

    if (!filePath || !fs.existsSync(filePath)) {
      return {
        success: false,
        mode: 'local',
        title,
        chapter: title,
        url: filePath || 'workbench://local-books',
        activeFilePath: filePath,
        scrollPercent: 0,
        selectedText: classification.selectedText || '',
        visibleText: '',
        fullText: '',
        headings: [],
        codeBlocks: [],
        inputs: [],
        links: [],
        error: 'Active PDF file path could not be resolved',
      }
    }

    const pdfBuffer = await fs.promises.readFile(filePath)
    const pdfParseModule: any = await import('pdf-parse')
    let extractedPages: Array<{ num: number; text: string }> = []
    let fallbackText = ''
    let totalPages = 0

    if (pdfParseModule.PDFParse) {
      const parser = new pdfParseModule.PDFParse({ data: pdfBuffer })
      try {
        // If explicit page range requested above page 30, parse full page objects cleanly; otherwise limit initial parse for speed
        const parseOpts = pageRangeHint
          ? pageRangeHint.endPage <= 40
            ? { first: pageRangeHint.endPage }
            : undefined
          : { first: scope === 'full' ? 30 : 8 }
        const textResult = await parser.getText(parseOpts)
        totalPages = Number(textResult.total || (Array.isArray(textResult.pages) ? textResult.pages.length : 0))
        if (Array.isArray(textResult.pages) && textResult.pages.length > 0) {
          extractedPages = textResult.pages.map((p: any, idx: number) => ({
            num: Number(p.num || idx + 1),
            text: String(p.text || '').trim(),
          }))
        } else {
          fallbackText = String(textResult.text || '').trim()
        }
      } finally {
        if (typeof parser.destroy === 'function') {
          try {
            await parser.destroy()
          } catch (_) { }
        }
      }
    } else {
      const parseFn = typeof pdfParseModule.default === 'function' ? pdfParseModule.default : pdfParseModule
      const parsedPdf = await parseFn(pdfBuffer, { max: pageRangeHint ? pageRangeHint.endPage : scope === 'full' ? 30 : 8 })
      totalPages = Number(parsedPdf.numpages || 0)
      fallbackText = String(parsedPdf.text || '').trim()
    }

    let selectedSliceText = ''
    let paginationLabel = totalPages > 0 ? `Pages 1–${Math.min(totalPages, scope === 'full' ? 30 : 8)} of ${totalPages}` : 'PDF Document'

    if (extractedPages.length > 0) {
      const startP = pageRangeHint ? pageRangeHint.startPage : 1
      const endP = pageRangeHint ? pageRangeHint.endPage : scope === 'full' ? Math.min(extractedPages.length, 30) : Math.min(extractedPages.length, 8)
      const slice = extractedPages.filter((p) => p.num >= startP && p.num <= endP)
      selectedSliceText = (slice.length > 0 ? slice : extractedPages.slice(0, 8))
        .map((p) => `-- Page ${p.num}${totalPages ? ` / ${totalPages}` : ''} --\n${p.text}`)
        .join('\n\n')
      paginationLabel = `Pages ${startP}${endP > startP ? `–${endP}` : ''}${totalPages ? ` of ${totalPages}` : ''}`
    } else {
      selectedSliceText = fallbackText
    }

    const cleanPdfText = selectedSliceText.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()

    return {
      success: true,
      mode: 'local',
      title,
      chapter: `${title} (${paginationLabel})`,
      url: filePath,
      activeFilePath: filePath,
      scrollPercent: 0,
      selectedText: classification.selectedText || '',
      visibleText: cleanPdfText.slice(0, 12000),
      fullText: cleanPdfText.slice(0, 50000),
      headings: [],
      codeBlocks: [],
      inputs: [],
      links: [],
      pageDesign: {
        materialType: 'local-pdf',
        platformHint: 'local-pdf',
        containerSelector: 'pdf-parse',
        breadcrumbs: [path.basename(path.dirname(filePath)), title],
        inPageOutline: [],
        hasSidebarToc: false,
        paginationLabel,
        headingOutline: [],
        figures: [],
        callouts: [],
        tableCount: 0,
        interactiveWidgets: [],
      },
    }
  }

  /**
   * Route B: Specialized Video Course Extractor (O'Reilly Video, YouTube, Coursera, Udemy, HTML5 <video>).
   * Inspects active video player timing, closed-caption TextTracks, transcript panels, and lesson syllabus.
   */
  private async extractVideoCourseMaterial(
    wc: Electron.WebContents,
    classification: BookMaterialClassification,
    opts: { scope: string; includeLinks: boolean; includeInputs: boolean; showBadges: boolean }
  ): Promise<BookPageExtractionResult> {
    const extractVideoScript = `
      (function(opts) {
        function fmtTime(sec) {
          sec = Math.max(0, Math.floor(sec || 0));
          var h = Math.floor(sec / 3600);
          var m = Math.floor((sec % 3600) / 60);
          var s = sec % 60;
          var pad = function(n) { return n < 10 ? '0' + n : String(n); };
          return h > 0 ? (h + ':' + pad(m) + ':' + pad(s)) : (pad(m) + ':' + pad(s));
        }

        function parseTimestampToSec(str) {
          var m = String(str || '').match(/(\\d{1,2}:)?\\d{1,2}:\\d{2}/);
          if (!m) return -1;
          var parts = m[0].split(':').map(Number);
          if (parts.length === 2) return parts[0] * 60 + parts[1];
          if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
          return -1;
        }

        var videos = Array.from(document.querySelectorAll('video'));
        var bestVideo = null;
        var bestArea = -1;
        videos.forEach(function(v) {
          var r = v.getBoundingClientRect();
          var area = r.width * r.height;
          if (area > bestArea) {
            bestArea = area;
            bestVideo = v;
          }
        });

        var currentTimeSec = bestVideo ? (bestVideo.currentTime || 0) : 0;
        var durationSec = bestVideo && isFinite(bestVideo.duration) ? (bestVideo.duration || 0) : 0;
        var paused = bestVideo ? Boolean(bestVideo.paused) : true;
        var videoTitle = '';
        var titleEl = document.querySelector('h1.title, ytd-watch-metadata h1, [data-testid="video-title"], .video-title, main h1, h1');
        if (titleEl && titleEl.innerText) videoTitle = titleEl.innerText.trim();
        if (!videoTitle) videoTitle = document.title || '';

        var cues = [];
        var transcriptSource = 'none';

        // 1. Check DOM Transcript containers first (O'Reilly, YouTube, Coursera, Udemy, generic)
        var transcriptSelectors = [
          '[data-testid*="transcript" i] li, [data-testid*="transcript" i] [role="button"], [data-testid*="transcript" i] p',
          'ytd-transcript-segment-renderer',
          '.rc-Transcript .phrases span, .rc-Transcript [class*="cue" i]',
          '[data-purpose*="transcript-cue" i]',
          '[class*="transcript" i] [class*="cue" i], [class*="transcript" i] [class*="segment" i], [class*="transcript" i] [class*="line" i], [class*="transcript" i] li, [class*="transcript" i] p'
        ];
        for (var ts = 0; ts < transcriptSelectors.length; ts++) {
          var nodes = document.querySelectorAll(transcriptSelectors[ts]);
          if (nodes && nodes.length > 0) {
            nodes.forEach(function(n) {
              var txt = (n.innerText || n.textContent || '').replace(/\\s+/g, ' ').trim();
              if (!txt || txt.length < 2) return;
              var sec = parseTimestampToSec(txt);
              var timeAttr = n.getAttribute('data-start') || n.getAttribute('data-time') || '';
              if (sec < 0 && timeAttr && !isNaN(Number(timeAttr))) sec = Number(timeAttr);
              var cleanedCueText = txt.replace(/^(\\d{1,2}:)?\\d{1,2}:\\d{2}\\s*[-–:]?\\s*/, '').trim();
              if (cleanedCueText) {
                cues.push({
                  sec: sec >= 0 ? sec : -1,
                  time: sec >= 0 ? fmtTime(sec) : '',
                  text: cleanedCueText
                });
              }
            });
            if (cues.length > 0) {
              transcriptSource = 'dom-transcript';
              break;
            }
          }
        }

        // 2. Fallback to HTML5 Video TextTracks (.vtt captions/subtitles)
        if (cues.length === 0 && bestVideo && bestVideo.textTracks) {
          for (var ti = 0; ti < bestVideo.textTracks.length; ti++) {
            var track = bestVideo.textTracks[ti];
            if (track && track.cues && track.cues.length > 0) {
              for (var ci = 0; ci < track.cues.length; ci++) {
                var cue = track.cues[ci];
                var cText = String(cue.text || '').replace(/<[^>]+>/g, '').replace(/\\s+/g, ' ').trim();
                if (cText) {
                  cues.push({
                    sec: Number(cue.startTime || 0),
                    time: fmtTime(cue.startTime || 0),
                    text: cText
                  });
                }
              }
              if (cues.length > 0) {
                transcriptSource = 'text-track';
                break;
              }
            }
          }
        }

        // Build nearbyCues (+-90s around current playback timestamp) and fullTranscript
        var nearbyCues = [];
        if (cues.length > 0) {
          var hasTimed = cues.some(function(c) { return c.sec >= 0; });
          if (hasTimed && durationSec > 0) {
            var minSec = Math.max(0, currentTimeSec - 60);
            var maxSec = currentTimeSec + 90;
            cues.forEach(function(c) {
              if (c.sec >= minSec && c.sec <= maxSec) {
                nearbyCues.push({
                  time: c.time,
                  text: c.text,
                  isCurrent: Math.abs(c.sec - currentTimeSec) <= 8
                });
              }
            });
          }
          if (nearbyCues.length === 0) {
            nearbyCues = cues.slice(0, 20).map(function(c) { return { time: c.time, text: c.text }; });
          }
        }

        var fullTranscript = cues.map(function(c) {
          return (c.time ? '[' + c.time + '] ' : '') + c.text;
        }).join('\\n');

        // Also capture visible video description / overview when transcript isn't expanded
        var overviewEl = document.querySelector('#description, [class*="description" i], [data-testid="overview"], article, main');
        var overviewText = overviewEl ? (overviewEl.innerText || '').trim().slice(0, 4000) : '';

        // Chapters / playlist items
        var chapters = [];
        document.querySelectorAll('[class*="playlist" i] a, [class*="curriculum" i] li, [class*="toc" i] a, ytd-macro-markers-list-item-renderer').forEach(function(ch) {
          var chText = (ch.innerText || '').replace(/\\s+/g, ' ').trim();
          if (chText && chText.length > 2 && chText.length < 140 && chapters.length < 35) {
            chapters.push({ title: chText });
          }
        });

        var currentTimestampFormatted = durationSec > 0
          ? (fmtTime(currentTimeSec) + ' / ' + fmtTime(durationSec))
          : (currentTimeSec > 0 ? fmtTime(currentTimeSec) : '00:00');

        return {
          hasVideo: Boolean(bestVideo),
          videoTitle: videoTitle,
          currentTimeSec: currentTimeSec,
          durationSec: durationSec,
          currentTimestampFormatted: currentTimestampFormatted,
          paused: paused,
          transcriptSource: transcriptSource,
          nearbyCues: nearbyCues.slice(0, 40),
          fullTranscript: fullTranscript.slice(0, 50000),
          chapters: chapters,
          overviewText: overviewText
        };
      })(${JSON.stringify(opts)})
    `

    // Scan top frame and child frames in case the <video> is hosted inside a player iframe
    const mainRes = await this.execJsWithTimeout<any>(wc, extractVideoScript, 2500).catch(() => null)
    let bestVideoData = mainRes

    if ((!bestVideoData || !bestVideoData.hasVideo || bestVideoData.transcriptSource === 'none') && wc.mainFrame?.framesInSubtree) {
      const subframes = wc.mainFrame.framesInSubtree.filter((f) => {
        if (f === wc.mainFrame) return false
        const u = (f.url || '').toLowerCase()
        return u && !u.includes('doubleclick') && !u.includes('googlesyndication') && !u.includes('adsystem')
      })
      const subResults = await Promise.allSettled(
        subframes.slice(0, 6).map((f) =>
          Promise.race([
            f.executeJavaScript(extractVideoScript),
            new Promise((_, rej) => setTimeout(() => rej(new Error('frame timeout')), 1400)),
          ])
        )
      )
      for (const r of subResults) {
        if (r.status === 'fulfilled' && r.value) {
          const v = r.value as any
          if (!bestVideoData?.hasVideo && v.hasVideo) {
            bestVideoData = {
              ...bestVideoData,
              hasVideo: true,
              currentTimeSec: v.currentTimeSec,
              durationSec: v.durationSec,
              currentTimestampFormatted: v.currentTimestampFormatted,
              paused: v.paused,
              nearbyCues: bestVideoData?.nearbyCues?.length ? bestVideoData.nearbyCues : v.nearbyCues,
              fullTranscript: bestVideoData?.fullTranscript || v.fullTranscript,
              transcriptSource: bestVideoData?.transcriptSource !== 'none' ? bestVideoData.transcriptSource : v.transcriptSource,
            }
          } else if (v.fullTranscript && (!bestVideoData?.fullTranscript || v.fullTranscript.length > bestVideoData.fullTranscript.length)) {
            bestVideoData = {
              ...bestVideoData,
              nearbyCues: v.nearbyCues,
              fullTranscript: v.fullTranscript,
              transcriptSource: v.transcriptSource,
            }
          }
        }
      }
    }

    const vData = bestVideoData || {
      hasVideo: true,
      videoTitle: classification.documentTitle,
      currentTimeSec: 0,
      durationSec: 0,
      currentTimestampFormatted: '00:00',
      paused: true,
      transcriptSource: 'none',
      nearbyCues: [],
      fullTranscript: '',
      chapters: [],
      overviewText: '',
    }

    const nearbyText =
      vData.nearbyCues && vData.nearbyCues.length > 0
        ? vData.nearbyCues
          .map((c: any) => `${c.isCurrent ? '▶ ' : ''}${c.time ? `[${c.time}] ` : ''}${c.text}`)
          .join('\n')
        : vData.overviewText || '(No live transcript or captions detected on this video page)'

    const fullText =
      vData.fullTranscript ||
      vData.overviewText ||
      nearbyText

    const scrollPct =
      vData.durationSec > 0 ? Math.min(100, Math.round((vData.currentTimeSec / vData.durationSec) * 100)) : 0

    return {
      success: true,
      mode: 'web',
      title: vData.videoTitle || classification.documentTitle,
      chapter: `${vData.videoTitle || classification.documentTitle} [${vData.currentTimestampFormatted}]`,
      url: classification.pageUrl,
      scrollPercent: scrollPct,
      selectedText: classification.selectedText || '',
      visibleText: nearbyText,
      fullText,
      headings: (vData.chapters || []).map((c: any) => c.title),
      codeBlocks: [],
      inputs: [],
      links: [],
      pageDesign: {
        materialType: 'video-course',
        platformHint: classification.platformHint,
        containerSelector: 'video-player',
        breadcrumbs: [],
        inPageOutline: (vData.chapters || []).map((c: any) => c.title),
        hasSidebarToc: (vData.chapters || []).length > 0,
        paginationLabel: `Playback ${vData.currentTimestampFormatted}`,
        headingOutline: (vData.chapters || []).map((c: any) => ({ level: 2, text: c.title, inViewport: true })),
        figures: [],
        callouts: [],
        tableCount: 0,
        interactiveWidgets: [{ kind: 'video', label: `${classification.platformHint} (${vData.currentTimestampFormatted})` }],
        video: {
          hasVideo: Boolean(vData.hasVideo),
          platform: (classification.platformHint as any) || 'html5',
          videoTitle: vData.videoTitle || classification.documentTitle,
          currentTimeSec: vData.currentTimeSec || 0,
          durationSec: vData.durationSec || 0,
          currentTimestampFormatted: vData.currentTimestampFormatted || '00:00',
          paused: Boolean(vData.paused),
          transcriptSource: vData.transcriptSource || 'none',
          nearbyCues: vData.nearbyCues || [],
          fullTranscript: vData.fullTranscript || '',
          chapters: vData.chapters || [],
        },
      },
    }
  }

  /**
   * Route C: Specialized E-Reader SPA Extractor (Amazon Kindle Cloud Reader).
   * Traverses child frames via wc.mainFrame.framesInSubtree with strict timeouts so paginated iframe pages are extracted.
   */
  private async extractEReaderSpaMaterial(
    wc: Electron.WebContents,
    classification: BookMaterialClassification,
    opts: { scope: string; includeLinks: boolean; includeInputs: boolean; showBadges: boolean; isLocalMode: boolean }
  ): Promise<BookPageExtractionResult> {
    const outerData = await this.extractStructuredDomMaterial(wc, classification, opts)
    const cleanOuterLen = (outerData.visibleText || '').trim().length

    // Kindle Cloud Reader often renders pages inside child reader iframes (#KindleReaderIFrame)
    if (wc.mainFrame?.framesInSubtree && cleanOuterLen < 400) {
      const candidateFrames = wc.mainFrame.framesInSubtree.filter((f) => {
        if (f === wc.mainFrame) return false
        const u = (f.url || '').toLowerCase()
        if (!u || u.includes('doubleclick') || u.includes('googlesyndication') || u.includes('adsystem') || u === 'about:blank') {
          return false
        }
        return true
      })

      const frameScript = `
        (function() {
          var rect = document.documentElement ? document.documentElement.getBoundingClientRect() : { width: 0, height: 0 };
          if (rect.width < 120 || rect.height < 120) return null;
          var text = (document.body ? (document.body.innerText || '') : '').replace(/\\n{3,}/g, '\\n\\n').trim();
          if (!text || text.length < 60) return null;
          var headings = [];
          document.querySelectorAll('h1, h2, h3, [role="heading"]').forEach(function(h) {
            var ht = (h.innerText || '').trim();
            if (ht && headings.indexOf(ht) === -1) headings.push(ht);
          });
          var figures = [];
          document.querySelectorAll('img').forEach(function(img) {
            var alt = (img.getAttribute('alt') || img.getAttribute('title') || '').trim();
            if (alt && figures.length < 8) figures.push({ caption: '', alt: alt, kind: 'img', inViewport: true });
          });
          var sel = window.getSelection();
          return {
            text: text,
            headings: headings,
            figures: figures,
            selectedText: sel ? sel.toString().trim() : ''
          };
        })()
      `

      const results = await Promise.allSettled(
        candidateFrames.slice(0, 8).map((f) =>
          Promise.race([
            f.executeJavaScript(frameScript),
            new Promise((_, rej) => setTimeout(() => rej(new Error('Kindle frame timeout')), 1500)),
          ])
        )
      )

      let richest: any = null
      for (const r of results) {
        const val = r.status === 'fulfilled' ? (r.value as any) : null
        if (val && val.text) {
          if (!richest || val.text.length > richest.text.length) {
            richest = val
          }
        }
      }

      if (richest) {
        return {
          ...outerData,
          selectedText: richest.selectedText || outerData.selectedText,
          visibleText: richest.text.slice(0, 12000),
          fullText: richest.text.slice(0, 50000),
          headings: richest.headings?.length ? richest.headings : outerData.headings,
          pageDesign: {
            ...(outerData.pageDesign || {
              materialType: 'ereader-spa',
              platformHint: 'kindle',
              containerSelector: 'reader-iframe',
              breadcrumbs: [],
              inPageOutline: [],
              hasSidebarToc: false,
              headingOutline: [],
              figures: [],
              callouts: [],
              tableCount: 0,
              interactiveWidgets: [],
            }),
            materialType: 'ereader-spa',
            platformHint: 'kindle',
            containerSelector: 'reader-iframe',
            figures: richest.figures?.length ? richest.figures : (outerData.pageDesign?.figures || []),
          },
        }
      }
    }

    if (outerData.pageDesign) {
      outerData.pageDesign.materialType = 'ereader-spa'
      outerData.pageDesign.platformHint = 'kindle'
    }
    return outerData
  }

  /**
   * Extracts visible viewport text, full chapter/article text, headings, code blocks,
   * form inputs, and interactive links from the active BookView pane (Classifier-First Pipeline).
   */
  public async extractVisiblePage(options?: {
    scope?: 'viewport' | 'full' | 'inputs' | 'links' | 'both'
    includeLinks?: boolean
    includeInputs?: boolean
    showBadges?: boolean
    pageRangeHint?: { startPage: number; endPage: number }
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

    const scopeNorm = options?.scope === 'inputs' || options?.scope === 'links' ? 'viewport' : (options?.scope || 'both')
    const opts = {
      scope: scopeNorm,
      includeLinks: options?.includeLinks !== false,
      includeInputs: options?.includeInputs !== false,
      showBadges: Boolean(options?.showBadges),
      isLocalMode,
    }

    try {
      // Stage 1: Classify Material First
      const classification = await this.classifyBookMaterial(wc, isLocalMode)

      // Stage 2: Dispatch to Specialized Extractor
      let data: BookPageExtractionResult
      if (classification.materialType === 'local-pdf') {
        data = await this.extractLocalPdfMaterial(classification, scopeNorm, options?.pageRangeHint)
      } else if (classification.materialType === 'video-course') {
        data = await this.extractVideoCourseMaterial(wc, classification, opts)
      } else if (classification.materialType === 'ereader-spa') {
        data = await this.extractEReaderSpaMaterial(wc, classification, opts)
      } else {
        data = await this.extractStructuredDomMaterial(wc, classification, opts)
      }

      if (options?.showBadges) {
        await this.renderOrClearBadges(true)
      }
      return data
    } catch (err: any) {
      console.error('[BookView] extractVisiblePage error:', err)
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
   * Route D: Structured DOM Extractor for Course Docs, O'Reilly Web Books, Local Readers, & Web Articles.
   * Extracts only the primary teaching container (excluding sidebars/drawers), preserves Markdown headings,
   * fenced code blocks (gutter line-numbers stripped), Markdown tables, callout boxes, and figure/chart labels.
   */
  private async extractStructuredDomMaterial(
    wc: Electron.WebContents,
    classification: BookMaterialClassification,
    opts: { scope: string; includeLinks: boolean; includeInputs: boolean; showBadges: boolean; isLocalMode: boolean }
  ): Promise<BookPageExtractionResult> {
    const payloadOpts = {
      ...opts,
      materialType: classification.materialType,
      platformHint: classification.platformHint,
    }
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

            // 3. Identify primary content container tailored to classified materialType
            var contentSelectors = opts.materialType === 'ebook-web'
              ? ['#sbo-rt-content', '[data-testid="reader-content"]', 'main article', 'article', 'main', '[role="main"]']
              : opts.materialType === 'course-docs'
              ? ['#main-content article', '.bd-article-container', '#main-content', '.theme-doc-markdown', '.markdown-section', '.page-inner', 'main article', 'article', 'main', '[role="main"]']
              : [
                  '.epub-reader-content',
                  '.wb-doc-editor',
                  '#sbo-rt-content',
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
            var matchedContainerSelector = 'body';
            for (var cs = 0; cs < contentSelectors.length; cs++) {
              var cand = root.querySelector(contentSelectors[cs]);
              if (cand && isElementVisible(cand) && (cand.innerText || '').trim().length > 40) {
                contentRoot = cand;
                matchedContainerSelector = contentSelectors[cs];
                break;
              }
            }

            var hasSidebarToc = Boolean(
              root.querySelector('nav, aside, #sidebar, .sidebar, .bd-sidebar-primary, .bd-sidebar-secondary, .book-summary, [class*="drawer" i]')
            );

            function isInsideNavigationChrome(el) {
              if (!el || !el.closest) return false;
              if (opts.isLocalMode) {
                return Boolean(el.closest('.pane-toolbar, .wb-editor-toolbar, .wb-doc-tabs, .local-explorer-sidebar'));
              }
              var navAnc = el.closest(
                'nav, [role="navigation"], aside, #sidebar, .sidebar, .bd-sidebar-primary, .bd-sidebar-secondary, .sphinxsidebar, .book-summary, .nav-chapters, .toc-container, [class*="drawer" i], [data-testid*="drawer"], [class*="toc" i], #wb-book-link-badges-host, #workbench-selection-bubble-host, .pane-toolbar'
              );
              return Boolean(navAnc && navAnc !== contentRoot);
            }

            // Capture breadcrumbs & in-page right-hand "On this page" outline separately
            var breadcrumbs = [];
            root.querySelectorAll('nav[aria-label*="breadcrumb" i] a, nav[aria-label*="breadcrumb" i] li, .breadcrumb a, .breadcrumb-segment').forEach(function(b) {
              var bt = (b.innerText || '').trim();
              if (bt && breadcrumbs.indexOf(bt) === -1 && breadcrumbs.length < 8) breadcrumbs.push(bt);
            });

            var inPageOutline = [];
            root.querySelectorAll('.bd-sidebar-secondary a, [class*="toc" i] a, nav[aria-label*="on this page" i] a').forEach(function(a) {
              if (isElementVisible(a)) {
                var ot = (a.innerText || '').trim();
                if (ot && ot.length > 1 && ot.length < 100 && inPageOutline.indexOf(ot) === -1 && inPageOutline.length < 25) {
                  inPageOutline.push(ot);
                }
              }
            });

            // 4. Structured Headings Outline
            var headings = [];
            var headingOutline = [];
            contentRoot.querySelectorAll('h1, h2, h3, h4').forEach(function(h) {
              if (isElementVisible(h) && !isInsideNavigationChrome(h)) {
                var hText = (h.innerText || '').replace(/\\s+/g, ' ').trim();
                var lvl = parseInt((h.tagName || 'H2').slice(1), 10) || 2;
                if (hText && headings.indexOf(hText) === -1) {
                  headings.push(hText);
                  if (headingOutline.length < 30) {
                    headingOutline.push({ level: lvl, text: hText, inViewport: isInViewport(h.getBoundingClientRect()) });
                  }
                }
              }
            });

            // Helper: Extract clean code without visual line-number gutters
            function extractCleanCodeFromPre(pre) {
              var clone = pre.cloneNode(true);
              clone.querySelectorAll(
                '.hljs-ln-numbers, .hljs-ln-n, .line-numbers-rows, [class*="gutter" i], [class*="line-num" i], [data-line-number], button, [aria-hidden="true"]'
              ).forEach(function(rem) { rem.remove(); });
              var txt = (clone.innerText || clone.textContent || '').replace(/\\r\\n/g, '\\n').trim();
              // Remove standalone leading line-number block if an outer wrapper rendered lines "1\\n2\\n3\\n..." above code
              var lines = txt.split('\\n');
              while (lines.length > 3 && /^\\d+$/.test(lines[0].trim()) && /^\\d+$/.test(lines[1].trim())) {
                lines.shift();
              }
              return lines.join('\\n').trim();
            }

            function tableToMarkdown(tbl) {
              var rows = Array.from(tbl.querySelectorAll('tr')).slice(0, 20);
              if (rows.length === 0) return '';
              var mdRows = [];
              rows.forEach(function(tr, rIdx) {
                var cells = Array.from(tr.querySelectorAll('th, td')).slice(0, 10).map(function(c) {
                  return (c.innerText || '').replace(/\\s+/g, ' ').replace(/\\|/g, '\\\\|').trim();
                });
                if (cells.some(Boolean)) {
                  mdRows.push('| ' + cells.join(' | ') + ' |');
                  if (rIdx === 0) {
                    mdRows.push('| ' + cells.map(function() { return '---'; }).join(' | ') + ' |');
                  }
                }
              });
              return mdRows.join('\\n');
            }

            // 5. Extract Structural Content Blocks cleanly (preserving Headings, Code Fences, Tables, Callouts, Figures)
            var visibleBlocks = [];
            var fullBlocks = [];
            var seenBlockNodes = new Set();
            var callouts = [];
            var figures = [];
            var tableCount = 0;

            var blockEls = Array.from(
              contentRoot.querySelectorAll('h1, h2, h3, h4, p, pre, code-block, table, blockquote, figure, ul, ol, .callout, .admonition, [role="note"], [role="alert"]')
            );

            blockEls.forEach(function(el) {
              if (!isElementVisible(el) || isInsideNavigationChrome(el)) return;
              // Skip nested blocks whose parent container block was already serialized (e.g. p inside blockquote or li inside ul)
              var anc = el.parentElement ? el.parentElement.closest('pre, code-block, table, blockquote, figure, .callout, .admonition, ul, ol') : null;
              if (anc && anc !== contentRoot && seenBlockNodes.has(anc)) return;

              var tag = (el.tagName || '').toLowerCase();
              var rect = el.getBoundingClientRect();
              var inVp = isInViewport(rect);
              var mdChunk = '';

              if (tag === 'pre' || tag === 'code-block') {
                seenBlockNodes.add(el);
                var codeEl = el.querySelector('code');
                var cls = ((codeEl ? codeEl.className : '') + ' ' + (el.className || '')).toLowerCase();
                var m = cls.match(/language-([a-z0-9_\\-#+]+)/i);
                var lang = m ? m[1] : '';
                var cleanCode = extractCleanCodeFromPre(el);
                if (cleanCode && cleanCode.length > 3) {
                  mdChunk = '\`\`\`' + lang + '\\n' + cleanCode.slice(0, 5000) + '\\n\`\`\`';
                }
              } else if (tag === 'table') {
                seenBlockNodes.add(el);
                tableCount++;
                mdChunk = tableToMarkdown(el);
              } else if (tag === 'blockquote' || el.matches('.callout, .admonition, [role="note"], [role="alert"]')) {
                seenBlockNodes.add(el);
                var cText = (el.innerText || '').replace(/\\n{2,}/g, '\\n').trim();
                if (cText) {
                  var cKind = el.className && /warn/i.test(el.className) ? 'WARNING' : (/tip/i.test(el.className || '') ? 'TIP' : 'NOTE');
                  mdChunk = '> **[' + cKind + ']** ' + cText.replace(/\\n/g, '\\n> ');
                  if (callouts.length < 8) {
                    callouts.push({ kind: cKind, text: cText.slice(0, 280), inViewport: inVp });
                  }
                }
              } else if (tag === 'figure') {
                seenBlockNodes.add(el);
                var capEl = el.querySelector('figcaption');
                var imgEl = el.querySelector('img');
                var svgTitle = el.querySelector('svg title');
                var cap = capEl ? (capEl.innerText || '').trim() : '';
                var alt = imgEl ? (imgEl.getAttribute('alt') || imgEl.getAttribute('title') || '').trim() : (svgTitle ? (svgTitle.textContent || '').trim() : '');
                if (cap || alt) {
                  if (figures.length < 12) figures.push({ caption: cap, alt: alt, kind: 'figure', inViewport: inVp });
                  mdChunk = '[Figure: ' + (cap || alt) + (cap && alt && cap !== alt ? ' (' + alt + ')' : '') + ']';
                }
              } else if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4') {
                var level = parseInt(tag.slice(1), 10) || 2;
                var ht = (el.innerText || '').replace(/\\s+/g, ' ').trim();
                if (ht) mdChunk = '#'.repeat(level) + ' ' + ht;
              } else if (tag === 'ul' || tag === 'ol') {
                seenBlockNodes.add(el);
                var items = Array.from(el.children).filter(function(li) { return li.tagName && li.tagName.toLowerCase() === 'li'; });
                mdChunk = items.slice(0, 40).map(function(li, idx) {
                  var lt = (li.innerText || '').replace(/\\s+/g, ' ').trim();
                  return lt ? (tag === 'ol' ? (idx + 1) + '. ' + lt : '- ' + lt) : '';
                }).filter(Boolean).join('\\n');
              } else {
                var pText = (el.innerText || '').replace(/\\s+/g, ' ').trim();
                if (pText) mdChunk = pText;
              }

              if (mdChunk) {
                if (opts.scope === 'full' || opts.scope === 'both') fullBlocks.push(mdChunk);
                if (inVp) visibleBlocks.push(mdChunk);
              }
            });

            // Capture standalone visible <img> / <svg> diagrams not inside <figure>
            contentRoot.querySelectorAll('img, svg').forEach(function(vis) {
              if (!isElementVisible(vis) || isInsideNavigationChrome(vis) || vis.closest('figure')) return;
              var vr = vis.getBoundingClientRect();
              if (vr.width < 64 || vr.height < 48) return;
              var alt = (vis.getAttribute('alt') || vis.getAttribute('aria-label') || vis.getAttribute('title') || '').trim();
              if (!alt && vis.tagName.toLowerCase() === 'svg') {
                var st = vis.querySelector('title');
                if (st && st.textContent) alt = st.textContent.trim();
              }
              if (alt && figures.length < 12) {
                figures.push({
                  caption: '',
                  alt: alt.slice(0, 200),
                  kind: vis.tagName.toLowerCase() === 'svg' ? 'chart' : 'img',
                  inViewport: isInViewport(vr)
                });
              }
            });

            var visibleText = visibleBlocks.join('\\n\\n').trim();
            var fullText = fullBlocks.join('\\n\\n').trim();

            // Fallback to clean text if a non-standard SPA uses custom <div> paragraphs without <p>/<h1> tags
            if (!fullText && (opts.scope === 'full' || opts.scope === 'both')) {
              fullText = (contentRoot.innerText || '').replace(/\\n{3,}/g, '\\n\\n').trim();
            }
            if (!visibleText && fullText) {
              visibleText = fullText.slice(0, 8000);
            }
            if (fullText.length > 60000) {
              fullText = fullText.slice(0, 60000) + '\\n... [truncated at 60,000 chars]';
            }

            // Interactive Widgets count
            var interactiveWidgets = [];
            if (contentRoot.querySelector('details')) interactiveWidgets.push({ kind: 'details', label: 'Expandable Sections' });
            if (contentRoot.querySelector('[role="tablist"]')) interactiveWidgets.push({ kind: 'tabs', label: 'Tabbed Code/Content' });

            // 7. Code Blocks array
            var codeBlocks = [];
            contentRoot.querySelectorAll('pre, code-block').forEach(function(pre) {
              if (!isElementVisible(pre) || isInsideNavigationChrome(pre)) return;
              var rect = pre.getBoundingClientRect();
              if (opts.scope === 'viewport' && !isInViewport(rect)) return;
              var cleanCode = extractCleanCodeFromPre(pre);
              if (cleanCode && cleanCode.length > 3) {
                var codeEl = pre.querySelector('code');
                var cls = ((codeEl ? codeEl.className : '') + ' ' + (pre.className || '')).toLowerCase();
                var m = cls.match(/language-([a-z0-9_\\-#+]+)/i);
                codeBlocks.push({
                  language: m ? m[1] : 'text',
                  code: cleanCode.slice(0, 8000)
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
              links: links.slice(0, 120),
              pageDesign: {
                materialType: opts.materialType,
                platformHint: opts.platformHint,
                containerSelector: matchedContainerSelector,
                breadcrumbs: breadcrumbs,
                inPageOutline: inPageOutline,
                hasSidebarToc: hasSidebarToc,
                paginationLabel: scrollPercent > 0 ? ('~' + scrollPercent + '% scrolled') : undefined,
                headingOutline: headingOutline,
                figures: figures,
                callouts: callouts,
                tableCount: tableCount,
                interactiveWidgets: interactiveWidgets
              }
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
        })(${JSON.stringify(payloadOpts)})
      `,
      4000
    )
    return data
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
    } catch (_) { }
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
