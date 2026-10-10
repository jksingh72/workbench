import { WebContentsView, BrowserWindow, session, clipboard, Menu, Rectangle } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { AuthCoordinator } from '../auth/authCoordinator'
import { AISourceManager, AISource } from '../services/aiSourceManager'
import { getViewPreloadPath } from '../utils/preloadPath'
import { ActionDispatcher } from '../services/actionDispatcher'
import { LLMProvider } from '../actions/registry'
import { Logger } from '../services/logger'

export const CHATGPT_START_URL = 'https://chatgpt.com/'

export class AIViewHandler {
  private view: WebContentsView | null = null
  private views: Map<string, WebContentsView> = new Map()
  private attachedViews: Set<WebContentsView> = new Set()
  private mainWindow: BrowserWindow
  private aiSourceManager: AISourceManager
  private currentSourceId: string = ''
  private currentUrl: string = CHATGPT_START_URL
  private sourceBaseUrls: Map<string, string> = new Map()
  private currentBounds: Rectangle = { x: 0, y: 0, width: 0, height: 0 }
  private isVisible: boolean = true
  private actionModeEnabled: boolean = true
  private feedbackTurnCount: number = 0
  private executedActionTimestamps: Map<string, number> = new Map()
  private isLoopCancelled: boolean = false
  private actionHistory: Array<{
    action: string
    paramsHash: string
    resultSummary: string
    success: boolean
  }> = []
  private lastUploadKey: string = ''
  private lastUploadTime: number = 0
  private primedSources: Set<string> = new Set()

  constructor(mainWindow: BrowserWindow, aiSourceManager: AISourceManager) {
    this.mainWindow = mainWindow
    this.aiSourceManager = aiSourceManager
    this.initView()
  }

  private attachView(v: WebContentsView) {
    if (!this.attachedViews.has(v) && this.mainWindow && !this.mainWindow.isDestroyed()) {
      try {
        this.mainWindow.contentView.addChildView(v)
        this.attachedViews.add(v)
      } catch (err) {
        console.warn('[AIView] attachView error:', err)
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

  public hasWebContents(wc: Electron.WebContents): boolean {
    if (this.view && !this.view.webContents.isDestroyed() && this.view.webContents.id === wc.id) {
      return true
    }
    for (const v of this.views.values()) {
      if (!v.webContents.isDestroyed() && v.webContents.id === wc.id) {
        return true
      }
    }
    return false
  }

  private getOrCreateView(source: AISource): WebContentsView {
    const existing = this.views.get(source.id)
    if (existing && !existing.webContents.isDestroyed()) {
      return existing
    }

    const partitionName = `persist:workbench-ai-${source.id}`
    const aiSession = session.fromPartition(partitionName)
    const authCoordinator = AuthCoordinator.getInstance()
    authCoordinator.attachToSession(aiSession)

    const viewPreload = getViewPreloadPath()
    const newView = new WebContentsView({
      webPreferences: {
        session: aiSession,
        preload: fs.existsSync(viewPreload) ? viewPreload : undefined,
        contextIsolation: true,
        sandbox: true,
      },
    })

    const wc = newView.webContents
    wc.setMaxListeners(50)
    wc.setWindowOpenHandler((details) =>
      authCoordinator.handleWindowOpen(details, newView, this.mainWindow)
    )
    wc.on('dom-ready', () => {
      if (!wc.isDestroyed()) {
        wc.send('workbench:set-view-role', 'ai')
      }
    })

    // Restore saved zoom level for this source
    const initialZoom = this.aiSourceManager.getZoom(source.id)
    if (initialZoom > 0) {
      wc.setZoomFactor(initialZoom)
    }

    this.wireNavEventsForView(newView, source.id)

    wc.loadURL(source.url).catch((err: any) => {
      if (err?.code !== 'ERR_ABORTED') {
        console.error(`[AIView] Failed to load initial URL for '${source.name}':`, err)
      }
    })

    this.views.set(source.id, newView)

    if (this.isVisible && this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.attachView(newView)
    }

    return newView
  }

  private initView() {
    const activeSource = this.aiSourceManager.getActiveSource()
    this.currentSourceId = activeSource.id
    this.currentUrl = activeSource.url
    this.view = this.getOrCreateView(activeSource)
  }

  private sendNavState(wc: Electron.WebContents) {
    if (this.mainWindow && !this.mainWindow.isDestroyed() && !wc.isDestroyed()) {
      this.mainWindow.webContents.send('workbench:nav-state', 'ai', {
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
        const savedZoom = this.aiSourceManager.getZoom(sourceId)
        if (savedZoom > 0 && Math.abs(wc.getZoomFactor() - savedZoom) > 0.01) {
          wc.setZoomFactor(savedZoom)
        }
        this.sendNavState(wc)
      }
    }

    wc.on('did-start-loading', onStateChange)
    wc.on('did-stop-loading', onStateChange)
    wc.on('did-finish-load', () => {
      onStateChange()
      this.attachDropAndUploadInterceptor(viewInstance)
    })
    wc.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      if (this.currentSourceId === sourceId) {
        onStateChange()
        // Error code -3 is ERR_ABORTED (normal when clicking new links or redirecting)
        if (errorCode !== -3) {
          Logger.warn('AIView', `Page failed to load (${errorCode}): ${errorDescription} for ${validatedURL}`)
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send(
              'workbench:notify',
              `⚠️ AI page failed to load: ${errorDescription || 'Connection issue'}. Click reload to retry.`
            )
          }
        }
      }
    })

    wc.on('render-process-gone', (_event, details) => {
      const reasonStr = details.reason === 'oom' ? 'Out of memory' : details.reason
      Logger.error('AIView', `Render process gone for "${sourceId}": ${details.reason} (code: ${details.exitCode})`, details)
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(
          'workbench:notify',
          `⚠️ The AI chat tab crashed (${reasonStr}). Click the reload button in the toolbar to restore it.`
        )
      }
    })

    wc.on('unresponsive', () => {
      Logger.warn('AIView', `WebContents unresponsive for "${sourceId}"`)
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(
          'workbench:notify',
          '⏳ AI chat tab is taking longer than expected to respond. Please wait or click reload.'
        )
      }
    })
    const checkPrimeDebounced = () => {
      setTimeout(() => this.notifyChatPrimeStatus(), 300)
      setTimeout(() => this.notifyChatPrimeStatus(), 1200)
    }
    wc.on('did-navigate', () => {
      onStateChange()
      checkPrimeDebounced()
    })
    wc.on('did-navigate-in-page', () => {
      onStateChange()
      this.attachDropAndUploadInterceptor(viewInstance)
      checkPrimeDebounced()
    })
    wc.on('page-title-updated', () => {
      onStateChange()
      checkPrimeDebounced()
    })

    wc.on('context-menu', (_e, params) => {
      const selection = (params.selectionText || '').trim()
      const menuTemplate: Electron.MenuItemConstructorOptions[] = []

      if (selection) {
        menuTemplate.push(
          {
            label: '📝 Save Selection to Notes (Ctrl+Shift+S)',
            click: () => {
              if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('workbench:clip-selection-text', {
                  source: 'ai',
                  text: selection,
                })
              }
            },
          },
          {
            label: '💬 Re-insert Selection to Prompt',
            click: () => {
              this.doAskAI('raw', selection)
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
          {
            label: '📥 Save Latest AI Response to Notes (Ctrl+Shift+S)',
            click: async () => {
              const res = await this.extractLastResponse()
              const text = res.fullMarkdown || res.response
              if (text && this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('workbench:clip-selection-text', {
                  source: 'ai',
                  text,
                })
              }
            },
          }
        )
      }

      menuTemplate.push(
        { type: 'separator' },
        {
          label: '💻 Extract Code Blocks to Files...',
          click: () => {
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send('workbench:extract-code-trigger')
            }
          },
        },
        {
          label: '📜 Export Full Chat Transcript...',
          click: () => {
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send('workbench:export-transcript-trigger')
            }
          },
        },
        { type: 'separator' },
        { label: 'Back', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() },
        { label: 'Forward', enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() },
        { label: 'Reload', click: () => wc.reload() },
        { type: 'separator' },
        { label: 'Paste (Ctrl+V)', role: 'paste' },
        { label: 'Select All (Ctrl+A)', role: 'selectAll' }
      )

      const menu = Menu.buildFromTemplate(menuTemplate)
      menu.popup({ window: this.mainWindow })
    })

    wc.on('before-input-event', async (_e, input) => {
      if (input.type !== 'keyDown') return
      const isCtrlOrMeta = input.control || input.meta
      if (isCtrlOrMeta && input.shift) {
        const key = input.key.toLowerCase()
        if (key === 's' || key === 'n' || key === 'c') {
          const res = await this.extractLastResponse()
          const text = res.selectedText || res.fullMarkdown || res.response
          if (text && this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('workbench:clip-selection-text', { source: 'ai', text })
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
          console.error('[AIView] Reload error:', err)
        }
        break
      case 'home':
        try {
          wc.stop()
          const homeUrl = this.currentUrl || this.aiSourceManager.getActiveSource().url
          wc.loadURL(homeUrl).catch((err) => {
            console.error('[AIView] Home load error:', err)
          })
        } catch (err) {
          console.error('[AIView] Home error:', err)
        }
        break
      case 'zoom-in': {
        const nextZoom = Math.min(Number((wc.getZoomFactor() + 0.1).toFixed(2)), 2.5)
        wc.setZoomFactor(nextZoom)
        this.aiSourceManager.setZoom(this.currentSourceId, nextZoom)
        this.sendNavState(wc)
        break
      }
      case 'zoom-out': {
        const nextZoom = Math.max(Number((wc.getZoomFactor() - 0.1).toFixed(2)), 0.5)
        wc.setZoomFactor(nextZoom)
        this.aiSourceManager.setZoom(this.currentSourceId, nextZoom)
        this.sendNavState(wc)
        break
      }
      case 'zoom-reset': {
        wc.setZoomFactor(1.0)
        this.aiSourceManager.setZoom(this.currentSourceId, 1.0)
        this.sendNavState(wc)
        break
      }
    }
  }

  public loadAISource(source: AISource) {
    if (this.currentSourceId === source.id && this.view) {
      if (this.currentUrl !== source.url) {
        this.currentUrl = source.url
        this.view.webContents.loadURL(source.url).catch(() => {})
      }
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
    this.executedActionTimestamps.clear()
    ActionDispatcher.getInstance().clearRecentDispatched()
    const isExisting = this.views.has(source.id)
    this.view = this.getOrCreateView(source)

    // Restore saved zoom level for this source
    const savedZoom = this.aiSourceManager.getZoom(source.id)
    if (savedZoom > 0) {
      this.view.webContents.setZoomFactor(savedZoom)
    }

    const prevBaseUrl = this.sourceBaseUrls.get(source.id)
    if (isExisting && prevBaseUrl && prevBaseUrl !== source.url) {
      this.view.webContents.loadURL(source.url).catch(() => {})
    }
    this.sourceBaseUrls.set(source.id, source.url)
    this.currentUrl = source.url

    if (this.isVisible) {
      this.attachView(this.view)
      if (this.currentBounds.width > 0 && this.currentBounds.height > 0) {
        this.view.setBounds(this.currentBounds)
      }
      this.view.setVisible(true)
    }

    this.sendNavState(this.view.webContents)
  }

  public async doAskAI(
    templateKey: string,
    customPrompt?: string,
    extractSelection?: () => Promise<string>
  ) {
    if (!this.view || this.view.webContents.isDestroyed()) {
      return { success: false, error: 'AI view is not ready' }
    }

    try {
      const text = extractSelection ? await extractSelection() : ''
      if (!text) {
        return {
          success: false,
          error: 'No text is highlighted in Bookview! Please highlight some text first.',
        }
      }

      let prompt = ''
      switch (templateKey) {
        case 'explain':
          prompt = `Please explain the following concept clearly in simple terms with practical examples:\n\n"${text}"`
          break
        case 'summarize':
          prompt = `Please summarize the key takeaways of the following excerpt:\n\n"${text}"`
          break
        case 'code':
          prompt = `Please provide a clean, practical code example demonstrating the following concept:\n\n"${text}"`
          break
        case 'quiz':
          prompt = `Based on the following text, create 3 review questions with detailed answers to test my understanding:\n\n"${text}"`
          break
        case 'raw':
          prompt = text
          break
        case 'custom':
          prompt = customPrompt ? `${customPrompt}\n\n"${text}"` : text
          break
        default:
          prompt = `Please explain the following concept clearly:\n\n"${text}"`
      }

      // Put into system clipboard as backup
      clipboard.writeText(prompt)

      // Inject into prompt input field using native input pipeline
      const injectionResult = await this.injectAndSubmitChatText(prompt, {
        autoSubmit: false,
        waitForStreaming: false,
      })

      return {
        success: injectionResult.success,
        text,
        prompt,
        injected: Boolean(injectionResult.success),
        error: injectionResult.error,
      }
    } catch (err: any) {
      console.error('[AIView] doAskAI error:', err)
      return { success: false, error: err.message || 'Failed to communicate with AI platform' }
    }
  }

  public showAskAIMenu(extractSelection: () => Promise<string>) {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return

    const menu = Menu.buildFromTemplate([
      {
        label: '💡 Explain Concept',
        click: async () => {
          const res = await this.doAskAI('explain', undefined, extractSelection)
          this.mainWindow.webContents.send('workbench:ask-ai-result', res)
        },
      },
      {
        label: '📝 Summarize Key Takeaways',
        click: async () => {
          const res = await this.doAskAI('summarize', undefined, extractSelection)
          this.mainWindow.webContents.send('workbench:ask-ai-result', res)
        },
      },
      {
        label: '💻 Provide Code Example',
        click: async () => {
          const res = await this.doAskAI('code', undefined, extractSelection)
          this.mainWindow.webContents.send('workbench:ask-ai-result', res)
        },
      },
      {
        label: '❓ Quiz Me (3 Questions)',
        click: async () => {
          const res = await this.doAskAI('quiz', undefined, extractSelection)
          this.mainWindow.webContents.send('workbench:ask-ai-result', res)
        },
      },
      { type: 'separator' },
      {
        label: '📋 Paste Raw Selection',
        click: async () => {
          const res = await this.doAskAI('raw', undefined, extractSelection)
          this.mainWindow.webContents.send('workbench:ask-ai-result', res)
        },
      },
    ])

    menu.popup({ window: this.mainWindow })
  }

  public async clearSession(scope: string = 'current'): Promise<{ success: boolean; error?: string }> {
    try {
      const activeSource = this.aiSourceManager.getActiveSource()
      const targetSourceId = scope === 'current' ? activeSource.id : scope

      if (scope === 'all') {
        console.log('[AIView] Clear session: Clearing credentials for ALL AI platforms...')
        const allSources = this.aiSourceManager.getData().sources
        for (const s of allSources) {
          const partitionName = `persist:workbench-ai-${s.id}`
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
          this.aiSourceManager.getData().sources.find((s) => s.id === targetSourceId) || activeSource
        console.log(`[AIView] Isolated delete login: Clearing credentials for '${targetSource.name}' (${targetSource.id}) ONLY...`)
        const partitionName = `persist:workbench-ai-${targetSource.id}`
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
      console.error('[AIView] Clear session error:', err)
      return { success: false, error: err.message || 'Failed to clear AI session' }
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
      console.error('[AIView] Failed to extract selection:', err)
      return ''
    }
  }

  /**
   * Extracts the user's selection or the complete latest AI assistant response,
   * along with the preceding prompt and ready-to-save Markdown formatting.
   */
  public async extractLastResponse(): Promise<{
    selectedText: string
    prompt: string
    response: string
    fullMarkdown: string
  }> {
    if (!this.view || this.view.webContents.isDestroyed()) {
      return { selectedText: '', prompt: '', response: '', fullMarkdown: '' }
    }
    try {
      const data: { selectedText?: string; assistantText?: string; promptText?: string } =
        await this.view.webContents.executeJavaScript(`
          (function() {
            var sel = window.getSelection();
            var selectedText = sel ? sel.toString().trim() : '';

            var assistantText = '';
            var promptText = '';

            // 1. ChatGPT selectors
            var gptAssistant = document.querySelectorAll('[data-message-author-role="assistant"]');
            if (gptAssistant && gptAssistant.length > 0) {
              var lastMsg = gptAssistant[gptAssistant.length - 1];
              assistantText = (lastMsg.innerText || lastMsg.textContent || '').trim();

              var gptUser = document.querySelectorAll('[data-message-author-role="user"]');
              if (gptUser && gptUser.length > 0) {
                promptText = (gptUser[gptUser.length - 1].innerText || '').trim();
              }
            }

            // 2. Claude selectors
            if (!assistantText) {
              var claudeMessages = document.querySelectorAll('.font-claude-message, [data-is-streaming], .standard-markdown');
              if (claudeMessages && claudeMessages.length > 0) {
                var lastClaude = claudeMessages[claudeMessages.length - 1];
                assistantText = (lastClaude.innerText || lastClaude.textContent || '').trim();
              }
              var claudeUser = document.querySelectorAll('.font-user-message');
              if (claudeUser && claudeUser.length > 0) {
                promptText = (claudeUser[claudeUser.length - 1].innerText || '').trim();
              }
            }

            // 3. Gemini selectors
            if (!assistantText) {
              var geminiResponses = document.querySelectorAll('model-response, .model-response-text');
              if (geminiResponses && geminiResponses.length > 0) {
                var lastGemini = geminiResponses[geminiResponses.length - 1];
                assistantText = (lastGemini.innerText || lastGemini.textContent || '').trim();
              }
              var geminiUser = document.querySelectorAll('user-query');
              if (geminiUser && geminiUser.length > 0) {
                promptText = (geminiUser[geminiUser.length - 1].innerText || '').trim();
              }
            }

            // 4. Generic fallback
            if (!assistantText) {
              var articles = document.querySelectorAll('article');
              if (articles && articles.length > 0) {
                assistantText = (articles[articles.length - 1].innerText || '').trim();
              }
            }

            return {
              selectedText: selectedText,
              assistantText: assistantText,
              promptText: promptText
            };
          })()
        `)

      const selectedText = (data?.selectedText || '').trim()
      const prompt = (data?.promptText || '').trim()
      const response = (data?.assistantText || '').trim()

      const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      const dateStr = new Date().toLocaleDateString()

      let fullMarkdown = ''
      if (selectedText) {
        fullMarkdown = `\n\n---\n### 💬 Clipped from AI (${dateStr} ${timestamp})\n> ${selectedText.replace(/\n/g, '\n> ')}\n`
      } else if (response) {
        fullMarkdown = `\n\n---\n`
        if (prompt) {
          fullMarkdown += `### ❓ Prompt (${dateStr} ${timestamp})\n> ${prompt.replace(/\n/g, '\n> ')}\n\n`
        }
        fullMarkdown += `### 🤖 AI Response\n\n${response}\n`
      }

      return {
        selectedText,
        prompt,
        response,
        fullMarkdown,
      }
    } catch (err) {
      console.error('[AIView] Failed to extract last response:', err)
      return { selectedText: '', prompt: '', response: '', fullMarkdown: '' }
    }
  }

  /**
   * Extracts isolated code blocks from the chat along with detected programming languages.
   */
  public async extractCodeBlocks(): Promise<
    Array<{
      index: number
      language: string
      extension: string
      code: string
      suggestedFileName: string
    }>
  > {
    if (!this.view || this.view.webContents.isDestroyed()) {
      return []
    }
    try {
      return await this.view.webContents.executeJavaScript(`
        (function() {
          var blocks = [];
          var preElements = document.querySelectorAll('pre');
          var extMap = {
            python: 'py', py: 'py',
            typescript: 'ts', ts: 'ts',
            javascript: 'js', js: 'js',
            tsx: 'tsx', jsx: 'jsx',
            html: 'html', css: 'css', scss: 'scss',
            json: 'json', yaml: 'yml', yml: 'yml',
            xml: 'xml', sql: 'sql',
            sh: 'sh', bash: 'sh', shell: 'sh',
            powershell: 'ps1', ps1: 'ps1',
            c: 'c', cpp: 'cpp', csharp: 'cs', cs: 'cs',
            java: 'java', rust: 'rs', rs: 'rs',
            go: 'go', ruby: 'rb', rb: 'rb',
            php: 'php', swift: 'swift', kotlin: 'kt', kt: 'kt',
            markdown: 'md', md: 'md', txt: 'txt'
          };

          preElements.forEach(function(pre, idx) {
            var codeEl = pre.querySelector('code');
            var rawCode = (codeEl ? codeEl.innerText : pre.innerText) || '';
            if (!rawCode.trim()) return;

            var lang = 'txt';
            var classStr = ((codeEl ? codeEl.className : '') + ' ' + pre.className).toLowerCase();
            var match = classStr.match(/language-([a-z0-9_\\-#+]+)/i);
            if (match) {
              lang = match[1].toLowerCase();
            } else {
              var headerEl = pre.querySelector('div, span, button');
              if (headerEl && headerEl.innerText && headerEl.innerText.length < 15) {
                var candidate = headerEl.innerText.trim().toLowerCase();
                if (extMap[candidate]) lang = candidate;
              }
            }

            var extension = extMap[lang] || 'txt';
            var suggestedFileName = 'snippet-' + (idx + 1) + '.' + extension;

            blocks.push({
              index: idx + 1,
              language: lang,
              extension: extension,
              code: rawCode.trim(),
              suggestedFileName: suggestedFileName
            });
          });

          return blocks;
        })()
      `)
    } catch (err) {
      console.error('[AIView] Failed to extract code blocks:', err)
      return []
    }
  }

  /**
   * Extracts the full chat conversation into a clean Markdown transcript.
   */
  public async extractFullTranscript(): Promise<string> {
    if (!this.view || this.view.webContents.isDestroyed()) {
      return ''
    }
    try {
      const turns: Array<{ role: string; text: string }> = await this.view.webContents.executeJavaScript(`
        (function() {
          var turns = [];
          var gptTurns = document.querySelectorAll('[data-message-author-role]');
          if (gptTurns && gptTurns.length > 0) {
            gptTurns.forEach(function(node) {
              var role = node.getAttribute('data-message-author-role') === 'assistant' ? '🤖 Assistant' : '👤 User';
              var text = (node.innerText || '').trim();
              if (text) turns.push({ role: role, text: text });
            });
          } else {
            var userNodes = document.querySelectorAll('.font-user-message');
            var assistantNodes = document.querySelectorAll('.font-claude-message');
            var maxLen = Math.max(userNodes.length, assistantNodes.length);
            for (var i = 0; i < maxLen; i++) {
              if (userNodes[i]) {
                var uText = (userNodes[i].innerText || '').trim();
                if (uText) turns.push({ role: '👤 User', text: uText });
              }
              if (assistantNodes[i]) {
                var aText = (assistantNodes[i].innerText || '').trim();
                if (aText) turns.push({ role: '🤖 Assistant', text: aText });
              }
            }
          }
          return turns;
        })()
      `)

      if (!turns || turns.length === 0) return ''

      const dateStr = new Date().toLocaleDateString()
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      const title = `# AI Chat Session (${dateStr} ${timeStr})\n\n`
      const body = turns.map((t) => `### ${t.role}\n\n${t.text}\n\n---`).join('\n\n')

      return title + body
    } catch (err) {
      console.error('[AIView] Failed to extract full transcript:', err)
      return ''
    }
  }

  public async sendFilesToAI(
    filePaths: string[],
    customInstruction?: string
  ): Promise<{ success: boolean; count?: number; uploaded?: boolean; fileNames?: string[]; error?: string }> {
    if (!this.view || this.view.webContents.isDestroyed()) {
      return { success: false, error: 'AI view is not ready' }
    }

    try {
      const validPaths = filePaths.filter((p) => p && fs.existsSync(p))
      if (validPaths.length === 0) {
        return { success: false, error: 'No valid files selected' }
      }

      const uploadKey = validPaths.slice().sort().join('|')
      const now = Date.now()
      if (uploadKey === this.lastUploadKey && now - this.lastUploadTime < 2500) {
        console.log('[AIView] Duplicate sendFilesToAI suppressed within debounce window')
        return { success: true, count: validPaths.length, uploaded: true }
      }
      this.lastUploadKey = uploadKey
      this.lastUploadTime = now

      const textExtensions = [
        'txt', 'md', 'markdown', 'js', 'ts', 'jsx', 'tsx', 'py', 'json', 'html', 'htm',
        'css', 'scss', 'csv', 'xml', 'yaml', 'yml', 'sql', 'sh', 'bat', 'ps1',
        'c', 'cpp', 'h', 'hpp', 'java', 'rs', 'go', 'rb', 'php', 'swift', 'kt', 'log', 'ini', 'env'
      ]

      const mimeTypes: Record<string, string> = {
        pdf: 'application/pdf',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        webp: 'image/webp',
        svg: 'image/svg+xml',
        json: 'application/json',
        csv: 'text/csv',
        txt: 'text/plain',
        md: 'text/markdown',
        js: 'text/javascript',
        ts: 'text/typescript',
        py: 'text/x-python',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        zip: 'application/zip',
      }

      const filesData: Array<{
        base64Data: string
        fileName: string
        mimeType: string
        isText: boolean
        textContent: string
      }> = []

      for (const fp of validPaths) {
        const stat = await fs.promises.stat(fp)
        if (stat.isDirectory()) continue
        if (stat.size > 100 * 1024 * 1024) continue

        const fileName = path.basename(fp)
        const ext = path.extname(fileName).toLowerCase().replace('.', '')
        const isKnownTextExt = textExtensions.includes(ext)
        const fileBuffer = await fs.promises.readFile(fp)
        const base64Data = fileBuffer.toString('base64')

        let isText = false
        let textContent = ''
        if (isKnownTextExt) {
          const sample = fileBuffer.subarray(0, Math.min(fileBuffer.length, 1024))
          if (!sample.includes(0)) {
            isText = true
            try {
              textContent = fileBuffer.toString('utf-8')
            } catch (_) {
              isText = false
            }
          }
        }

        const mimeType = mimeTypes[ext] || 'application/octet-stream'
        filesData.push({ base64Data, fileName, mimeType, isText, textContent })
      }

      if (filesData.length === 0) {
        console.warn('[AIView:Upload:ERROR] No files eligible for upload (folders or files >100MB skipped)')
        return { success: false, error: 'No files eligible for upload (folders or files >100MB skipped)' }
      }

      const userInstruction = (customInstruction || '').trim()
      console.log(`[AIView:Upload:STEP 1] Preparing upload of ${filesData.length} file(s) into AI chat:`, filesData.map(f => f.fileName).join(', '))

      const result = await this.view.webContents.executeJavaScript(`
        (async function(filesList, userInstruction) {
          let fileUploaded = false;
          try {
            const dt = new DataTransfer();
            for (const item of filesList) {
              const byteCharacters = atob(item.base64Data);
              const byteNumbers = new Array(byteCharacters.length);
              for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
              }
              const byteArray = new Uint8Array(byteNumbers);
              const blob = new Blob([byteArray], { type: item.mimeType });
              const file = new File([blob], item.fileName, { type: item.mimeType, lastModified: Date.now() });
              dt.items.add(file);
            }

            // Strategy A: input[type="file"] (primary native upload for Claude, ChatGPT, Gemini)
            const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
            const fileInput = fileInputs.find(function(i) { return !i.disabled; }) || fileInputs[0];
            if (fileInput) {
              fileInput.files = dt.files;
              fileInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
              fileInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
              fileUploaded = true;
            } else {
              // Strategy B: Drag-and-Drop fallback ONLY if no file input exists (on a single target)
              const dropTarget = 
                document.querySelector('#prompt-textarea') || 
                document.querySelector('div[contenteditable="true"]') || 
                document.querySelector('textarea') || 
                document.querySelector('form');
              if (dropTarget) {
                try {
                  dropTarget.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }));
                  dropTarget.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
                  dropTarget.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
                  fileUploaded = true;
                } catch (_) {}
              }
            }
          } catch (e) {
            console.warn('[AIView] Batch file upload injection failed:', e);
          }

          let textToInject = '';
          if (fileUploaded) {
            textToInject = userInstruction;
          } else {
            const textParts = [];
            if (userInstruction) textParts.push(userInstruction);
            for (const item of filesList) {
              if (item.isText && item.textContent) {
                const extName = item.fileName.split('.').pop() || 'txt';
                textParts.push('File: \`' + item.fileName + '\`\\n\`\`\`' + extName + '\\n' + item.textContent + '\\n\`\`\`');
              }
            }
            textToInject = textParts.join('\\n\\n');
          }

          if (textToInject) {
            try {
              const input = document.querySelector('#prompt-textarea') || 
                            document.querySelector('div[contenteditable="true"]') || 
                            document.querySelector('textarea');
              if (input) {
                input.focus();
                if (input.tagName && input.tagName.toLowerCase() === 'textarea') {
                  const existing = input.value ? input.value + '\\n\\n' : '';
                  input.value = existing + textToInject;
                  input.dispatchEvent(new Event('input', { bubbles: true }));
                } else {
                  const selection = window.getSelection();
                  const range = document.createRange();
                  range.selectNodeContents(input);
                  selection.removeAllRanges();
                  selection.addRange(range);
                  document.execCommand('insertText', false, textToInject);
                  input.dispatchEvent(new InputEvent('input', { bubbles: true, data: textToInject }));
                }
              }
            } catch (e) {
              console.warn('[AIView] Text insertion error:', e);
            }
          }

          return { success: true, fileUploaded, count: filesList.length };
        })(${JSON.stringify(filesData)}, ${JSON.stringify(userInstruction)})
      `)

      this.view.webContents.focus()
      console.log(`[AIView:Upload:STEP 2] File injection completed. Native upload status: ${result?.fileUploaded ? 'SUCCESS' : 'TEXT_FALLBACK'}`)
      return {
        success: true,
        count: filesData.length,
        uploaded: result?.fileUploaded,
        fileNames: filesData.map((f) => f.fileName),
      }
    } catch (err: any) {
      console.error('[AIView:Upload:ERROR] sendFilesToAI failed:', err)
      return { success: false, error: err.message || 'Failed to send files to AI' }
    }
  }

  public async sendFileToAI(
    filePath: string,
    customInstruction?: string
  ): Promise<{ success: boolean; uploaded?: boolean; fileName?: string; error?: string }> {
    const res = await this.sendFilesToAI([filePath], customInstruction)
    return {
      success: res.success,
      uploaded: res.uploaded,
      fileName: res.fileNames?.[0] || path.basename(filePath),
      error: res.error,
    }
  }

  // =========================================================================
  // Modular Section: Drag & Drop File Upload Interceptor
  // =========================================================================
  private currentDraggingFiles: string[] = []
  private currentClipboardFiles: string[] = []

  public setDraggingFiles(filePaths: string[]) {
    this.currentDraggingFiles = filePaths.filter(Boolean)
  }

  public setDraggingFile(filePath: string | null) {
    this.currentDraggingFiles = filePath ? [filePath] : []
  }

  public getDraggingFiles(): string[] {
    return this.currentDraggingFiles
  }

  public getDraggingFile(): string | null {
    return this.currentDraggingFiles[0] || null
  }

  public setClipboardFiles(filePaths: string[]) {
    this.currentClipboardFiles = filePaths.filter(Boolean)
    if (this.currentClipboardFiles.length > 0 && this.view && !this.view.webContents.isDestroyed()) {
      this.view.webContents.send('workbench:staged-file-copied', {
        fileName: path.basename(this.currentClipboardFiles[0]),
        count: this.currentClipboardFiles.length,
      })
    }
  }

  public setClipboardFile(filePath: string | null) {
    this.currentClipboardFiles = filePath ? [filePath] : []
    if (filePath && this.view && !this.view.webContents.isDestroyed()) {
      this.view.webContents.send('workbench:staged-file-copied', { fileName: path.basename(filePath), count: 1 })
    }
  }

  public consumeClipboardFiles(): string[] {
    const files = [...this.currentClipboardFiles]
    this.currentClipboardFiles = []
    return files
  }

  public consumeClipboardFile(): string | null {
    const file = this.currentClipboardFiles[0] || null
    this.currentClipboardFiles = []
    return file
  }

  public getClipboardFiles(): string[] {
    return this.currentClipboardFiles
  }

  public getClipboardFile(): string | null {
    return this.currentClipboardFiles[0] || null
  }

  /**
   * Injects drop listeners into the AI guest page (Claude / ChatGPT) so that
   * dropped files are reliably forwarded to the chatbot's file upload input
   * rather than pasting raw text paths into textareas.
   */
  public attachDropAndUploadInterceptor(viewInstance: WebContentsView) {
    if (!viewInstance || viewInstance.webContents.isDestroyed()) return

    viewInstance.webContents
      .executeJavaScript(`
        (function() {
          if (window.__wb_drop_interceptor_active) return;
          window.__wb_drop_interceptor_active = true;

          // Prevent default browser behavior that pastes text paths into inputs
          document.addEventListener('dragover', function(e) {
            if (e.dataTransfer) {
              const types = Array.from(e.dataTransfer.types || []);
              if (types.includes('Files') || types.includes('application/x-workbench-file')) {
                e.dataTransfer.dropEffect = 'copy';
              }
            }
          }, true);

          document.addEventListener('drop', function(e) {
            const hasFiles = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0;
            if (hasFiles) {
              // Direct the dropped file into the chatbot's native file input
              const fileInput = document.querySelector('input[type="file"]');
              if (fileInput) {
                try {
                  fileInput.files = e.dataTransfer.files;
                  fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                  fileInput.dispatchEvent(new Event('input', { bubbles: true }));
                } catch (_) {}
              }
            }
          }, false);
        })();
      `)
      .catch(() => {
        // Silently ignore navigation/unload race conditions
      })
  }

  /**
   * Scans the active AI Chat webview directly for unexecuted workbench:action blocks
   * and dispatches them locally on the user's computer via ActionDispatcher.
   */
  public async scanAndExecutePendingActions(): Promise<{
    success: boolean
    executedCount: number
    message: string
    results?: any[]
  }> {
    if (!this.actionModeEnabled) {
      return { success: false, executedCount: 0, message: 'Action Mode is disabled' }
    }

    if (this.isLoopCancelled) {
      return { success: false, executedCount: 0, message: 'Action loop was cancelled by user' }
    }

    if (!this.view || this.view.webContents.isDestroyed()) {
      return { success: false, executedCount: 0, message: 'AI view is not ready' }
    }

    try {
      const candidates: any[] = await this.view.webContents.executeJavaScript(`
        (function() {
          try {
            // Extract valid JSON objects with 'action' or 'type' from any text string
            function extractActionsFromText(fullText) {
              var actions = [];
              if (!fullText || fullText.length < 10) return actions;
              
              var depth = 0;
              var startIdx = -1;
              var inString = false;
              var escape = false;

              for (var i = 0; i < fullText.length; i++) {
                var ch = fullText[i];
                if (inString) {
                  if (escape) {
                    escape = false;
                  } else if (ch === '\\\\') {
                    escape = true;
                  } else if (ch === '"') {
                    inString = false;
                  }
                } else {
                  if (ch === '"') {
                    inString = true;
                  } else if (ch === '{') {
                    if (depth === 0) startIdx = i;
                    depth++;
                  } else if (ch === '}') {
                    depth--;
                    if (depth === 0 && startIdx !== -1) {
                      var candidate = fullText.substring(startIdx, i + 1).trim();
                      try {
                        var parsed = null;
                        try {
                          parsed = JSON.parse(candidate);
                        } catch (_) {
                          var sanitized = candidate.replace(/\\\\(?!["\\\\/bfnrtu]|u[0-9a-fA-F]{4})/g, '\\\\\\\\');
                          parsed = JSON.parse(sanitized);
                        }
                        if (parsed && typeof parsed === 'object' && (parsed.action || parsed.type)) {
                          actions.push({ payload: parsed, raw: candidate });
                        }
                      } catch (_) {}
                      startIdx = -1;
                    }
                  }
                }
              }
              return actions;
            }

            var results = [];

            function isSafeAssistantBlock(el) {
              if (!el) return false;
              // A. Skip hidden elements or hidden action prompt bubbles
              if (el.classList.contains('wb-hidden-action-prompt') || (el.closest && el.closest('.wb-hidden-action-prompt'))) {
                return false;
              }
              var isShadowChild = Boolean(el.getRootNode && el.getRootNode() !== document);
              if (!isShadowChild && el.offsetParent === null && el.tagName !== 'BODY') {
                var rect = el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 0, height: 0 };
                if (rect.width === 0 && rect.height === 0) return false;
              }
              try {
                if (window.getComputedStyle(el).display === 'none') return false;
              } catch (_) {}

              // B. Skip input forms, textareas, and contenteditables
              if (el.closest && (
                el.closest('#prompt-textarea') ||
                el.closest('form') ||
                el.closest('[contenteditable="true"]') ||
                el.closest('textarea') ||
                el.closest('input') ||
                el.closest('.ql-editor') ||
                el.closest('rich-textarea')
              )) {
                return false;
              }

              // C. Skip user messages (check ancestors, self, AND descendants)
              if (
                (el.closest && (
                  el.closest('[data-message-author-role="user"]') ||
                  el.closest('[data-user-message="true"]') ||
                  el.closest('.font-user-message') ||
                  el.closest('[data-testid="user-message"]') ||
                  el.closest('user-query') ||
                  el.closest('[class*="user-message"]') ||
                  el.closest('[data-is-user="true"]')
                )) ||
                (el.querySelector && (
                  el.querySelector('[data-message-author-role="user"]') ||
                  el.querySelector('[data-user-message="true"]') ||
                  el.querySelector('.font-user-message') ||
                  el.querySelector('[data-testid="user-message"]') ||
                  el.querySelector('user-query') ||
                  el.querySelector('[class*="user-message"]') ||
                  el.querySelector('[data-is-user="true"]')
                ))
              ) {
                return false;
              }

              // D. Quarantine system prompt guide text
              var text = (el.innerText || el.textContent || '');
              if (
                text.includes('You are integrated with Workbench Desktop') ||
                text.includes('Available Workbench Actions') ||
                text.includes('### Available Workbench Actions') ||
                text.includes('workbench:action code block') ||
                text.includes('Custom User Instructions') ||
                text.includes('<folder_name>') ||
                text.includes('<file_path>')
              ) {
                return false;
              }

              // E. Inside active AI view, any visible non-user element is an assistant block
              return true;
            }

            // Helper: Find only the newest assistant message container
            function getLatestAssistantContainer() {
              var selectors = [
                '[data-message-author-role="assistant"]',
                'div.font-claude-message',
                '.font-claude-message',
                '.standard-markdown',
                'div[class*="font-claude"]',
                'div[class*="message"][class*="assistant"]',
                'div[data-is-streaming]',
                '[data-is-streaming]',
                'model-response',
                '.model-response-text',
                'div[data-testid*="assistant-message"]',
                'div[data-testid="chat-message-assistant"]',
                'article[data-testid*="conversation-turn"]:has([data-message-author-role="assistant"])',
                'div[class*="chat-message"][class*="assistant"]',
                'div[class*="response-message"]',
                'div[class*="ChatMessage"][data-role="assistant"]'
              ];
              for (var s = 0; s < selectors.length; s++) {
                try {
                  var nodes = document.querySelectorAll(selectors[s]);
                  if (nodes && nodes.length > 0) {
                    return nodes[nodes.length - 1];
                  }
                } catch (_) {}
              }
              try {
                var turns = document.querySelectorAll('article, div[data-testid*="conversation-turn"], div[class*="conversation-item"]');
                if (turns && turns.length > 0) {
                  var lastTurn = turns[turns.length - 1];
                  if (
                    !lastTurn.querySelector('[data-message-author-role="user"]') &&
                    !lastTurn.querySelector('.font-user-message') &&
                    !lastTurn.querySelector('[data-user-message="true"]') &&
                    !lastTurn.classList.contains('font-user-message')
                  ) {
                    return lastTurn;
                  }
                }
              } catch (_) {}
              try {
                var allCode = document.querySelectorAll('pre, code-block, [class*="code-block"]');
                if (allCode && allCode.length > 0) {
                  for (var i = allCode.length - 1; i >= 0; i--) {
                    var el = allCode[i];
                    if (
                      !el.closest('[data-message-author-role="user"]') &&
                      !el.closest('.font-user-message') &&
                      !el.closest('[data-user-message="true"]') &&
                      !el.closest('#prompt-textarea') &&
                      !el.closest('form')
                    ) {
                      return (el.closest && el.closest('div.grid, [class*="message"], article')) || el;
                    }
                  }
                }
              } catch (_) {}
              return null;
            }

            var targetContainer = getLatestAssistantContainer();
            var searchScope = (targetContainer && ((targetContainer.closest && targetContainer.closest('article, [data-testid*="conversation-turn"]')) || targetContainer)) || document;

            window.__wbExecutedActionTimestamps = window.__wbExecutedActionTimestamps || new Map();
            var now = Date.now();
            for (var [h, t] of window.__wbExecutedActionTimestamps.entries()) {
              if (now - t > 30000) window.__wbExecutedActionTimestamps.delete(h);
            }

            // 1. Scan code and pre containers inside the newest assistant message container
            var codeBlocks = [];
            searchScope.querySelectorAll('code-block, pre, code, [class*="code-container"], [class*="code-block"], div[class*="overflow-y-auto"] code, [class*="language-workbench"]').forEach(function(node) {
              codeBlocks.push(node);
              if (node.shadowRoot) {
                try {
                  node.shadowRoot.querySelectorAll('pre, code, div').forEach(function(s) { codeBlocks.push(s); });
                } catch (_) {}
              }
            });
            for (var c = 0; c < codeBlocks.length; c++) {
              var el = codeBlocks[c];

              // Skip already executed elements
              if (el.getAttribute('data-workbench-executed') === 'true' || el.getAttribute('data-wb-executed') === 'true' || (el.closest && el.closest('[data-workbench-executed="true"], [data-wb-executed="true"]'))) {
                continue;
              }

              if (!isSafeAssistantBlock(el)) {
                continue;
              }

              var text = (el.innerText || el.textContent || '').trim();
              if (text.includes('create_folder') || text.includes('write_file') || text.includes('workbench:action') || text.includes('"action"')) {
                var extracted = extractActionsFromText(text);
                if (extracted.length > 0) {
                  el.setAttribute('data-workbench-executed', 'true');
                  el.setAttribute('data-wb-executed', 'true');

                  var targetBox = el.closest('pre') || el.closest('[class*="code-block"]') || (el.closest('div.rounded-md') && el.closest('div.rounded-md').querySelector('code') ? el.closest('div.rounded-md') : null) || el;
                  if (targetBox) {
                    targetBox.setAttribute('data-workbench-executed', 'true');
                    targetBox.setAttribute('data-wb-executed', 'true');
                    targetBox.style.display = 'none';

                    for (var e = 0; e < extracted.length; e++) {
                      var payloadHash = JSON.stringify(extracted[e].payload);
                      var lastRan = window.__wbExecutedActionTimestamps.get(payloadHash);
                      if (lastRan && (now - lastRan < 15000)) {
                        continue;
                      }
                      window.__wbExecutedActionTimestamps.set(payloadHash, now);

                      results.push(extracted[e].payload);
                      var actionType = extracted[e].payload.action || extracted[e].payload.type || 'action';
                      var actionParam = extracted[e].payload.path || extracted[e].payload.folderName || extracted[e].payload.filePath || extracted[e].payload.targetDirectory || '.';

                      try {
                        var badge = document.createElement('div');
                        badge.className = 'workbench-action-badge';
                        badge.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:4px 10px;margin:6px 0;background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.3);border-radius:6px;font-size:12px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#34d399;font-weight:500;cursor:pointer;user-select:none;';
                        badge.title = 'Click to show / hide raw action JSON';
                        badge.innerHTML = '<div style="display:flex;align-items:center;gap:6px;"><span>⚡</span><span style="font-weight:600;color:#10b981;">' + actionType + '</span><span style="color:#94a3b8;font-size:11px;font-family:monospace;">(' + actionParam + ')</span></div><div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#6ee7b7;"><span>Executed</span><span class="wb-badge-arrow" style="font-size:9px;opacity:0.7;">▼</span></div>';

                        (function(box, b) {
                          b.addEventListener('click', function() {
                            var isHidden = box.style.display === 'none';
                            box.style.display = isHidden ? 'block' : 'none';
                            var arrow = b.querySelector('.wb-badge-arrow');
                            if (arrow) arrow.textContent = isHidden ? '▲' : '▼';
                          });
                        })(targetBox, badge);

                        if (targetBox.parentNode) {
                          targetBox.parentNode.insertBefore(badge, targetBox);
                        }
                      } catch (_) {}
                    }
                  }
                }
              }
            }

            return results;
          } catch (err) {
            return [];
          }
        })()
      `)

      if (!candidates || candidates.length === 0) {
        return {
          success: true,
          executedCount: 0,
          message: 'No pending actions found in chat view',
        }
      }

      console.log(`[AIView] Found ${candidates.length} unexecuted action(s) in chat view! Executing...`)
      const dispatcher = ActionDispatcher.getInstance()
      const executionResults = []

      const now = Date.now()
      for (const [h, t] of this.executedActionTimestamps.entries()) {
        if (now - t > 30000) this.executedActionTimestamps.delete(h)
      }

      for (const payload of candidates) {
        const payloadHash = JSON.stringify(payload)
        const lastRan = this.executedActionTimestamps.get(payloadHash)
        if (lastRan && now - lastRan < 15000) {
          continue
        }
        this.executedActionTimestamps.set(payloadHash, now)

        const res = await dispatcher.dispatch(payload)
        executionResults.push(res)

        // Close the execution feedback loop so the AI can observe the outcome
        // BUT NEVER send feedback if the action was suppressed as a duplicate!
        if (
          dispatcher.isAutoFeedbackLoopEnabled() &&
          !res.message?.includes('Duplicate action suppressed')
        ) {
          await this.handleActionExecutionFeedback(payload, res)
        }
      }

      return {
        success: true,
        executedCount: candidates.length,
        message: `Successfully executed ${candidates.length} action(s)`,
        results: executionResults,
      }
    } catch (err: any) {
      console.error('[AIView] scanAndExecutePendingActions error:', err)
      return {
        success: false,
        executedCount: 0,
        message: err.message || 'Failed to scan and execute actions',
      }
    }
  }

  /**
   * Formats an ActionResult into an observation payload suitable for AI consumption.
   * If any content/stdout/result body exceeds 30,000 characters, spills full content to os.tmpdir()
   * and provides a 4,000-character preview.
   */
  public formatActionFeedback(payload: any, result: any): string {
    const actionType = (payload.action || payload.type || result.action || 'action').toLowerCase()

    if (
      result.message &&
      (result.message.includes('Ignored documentation schema template') ||
       result.message.includes('Duplicate action suppressed'))
    ) {
      return ''
    }

    const handleLargeText = (text: string, label: string): string => {
      const MAX_LEN = 30000
      if (!text) return ''
      if (text.length <= MAX_LEN) {
        return `\n${label}:\n\`\`\`\n${text}\n\`\`\``
      }
      const timestamp = Date.now()
      const rand = Math.random().toString(36).substring(2, 6)
      const spillFile = path.join(os.tmpdir(), `wb_result_${timestamp}_${rand}.txt`)
      const preview = text.slice(0, 4000)
      try {
        fs.writeFileSync(spillFile, text, 'utf-8')
        return `\n${label} (Showing first 4,000 of ${text.length.toLocaleString()} characters):\n\`\`\`\n${preview}\n\`\`\`\n[Output was ${text.length.toLocaleString()} characters; full output saved to: ${spillFile}. Use read_pages or search_text to query specific sections if needed.]`
      } catch (err: any) {
        return `\n${label} (Showing first 4,000 of ${text.length.toLocaleString()} characters):\n\`\`\`\n${preview}\n\`\`\`\n[Output was ${text.length.toLocaleString()} characters; failed to save spill file: ${err?.message || err}]`
      }
    }

    let body = ''
    if (result.success) {
      body = `[Workbench Action Result: ✅ ${result.message}]`

      if (result.createdPath) {
        body += `\nTarget: ${result.createdPath}`
      }

      if (
        (result.details?.folderCount !== undefined || result.details?.fileCount !== undefined) &&
        !result.message?.includes('Directory Listing')
      ) {
        const folders = result.details.folders || []
        const files = result.details.files || []
        const MAX_FILES = 80
        const MAX_FOLDERS = 40
        const shownFolders = folders.slice(0, MAX_FOLDERS).join(', ') + (folders.length > MAX_FOLDERS ? ` ... (+${folders.length - MAX_FOLDERS} more)` : '')
        const shownFiles = files.slice(0, MAX_FILES).join(', ') + (files.length > MAX_FILES ? ` ... (+${files.length - MAX_FILES} more)` : '')
        body += `\nContents:\n`
        body += `- Folders (${folders.length}): ${shownFolders || 'none'}\n`
        body += `- Files (${files.length}): ${shownFiles || 'none'}`
      }

      // Batch execution: format each step once and include any step-level output
      if (Array.isArray(result.details?.results)) {
        for (const step of result.details.results) {
          const stepLabel = step.step || '1/1'
          if (step.details?.content) {
            body += handleLargeText(String(step.details.content), `Step ${stepLabel} Content`)
          }
          if (step.details?.stdout) {
            body += handleLargeText(String(step.details.stdout), `Step ${stepLabel} Output`)
          }
        }
      } else {
        // Extracted RFP files
        if (Array.isArray(result.details?.extractedFiles)) {
          body += `\nExtracted Files (${result.details.extractedFiles.length}):`
          for (const ef of result.details.extractedFiles.slice(0, 30)) {
            body += `\n- ${ef.originalFile} (${ef.pageCount || 1} pages${ef.isScanned ? ', ⚠️ SCANNED/NO OCR' : ''}) -> ${ef.extractedTextFile}`
          }
          if (result.details.extractedFiles.length > 30) {
            body += `\n... (+${result.details.extractedFiles.length - 30} more)`
          }
        }

        // Search matches
        if (Array.isArray(result.details?.matches)) {
          body += `\nMatches (${result.details.matches.length} found):`
          for (const m of result.details.matches.slice(0, 20)) {
            const loc = m.page ? `Page ${m.page}, Line ${m.line}` : `Line ${m.line}`
            body += `\n- [${m.file}:${loc}] ${m.text || m.match}`
          }
          if (result.details.matches.length > 20) {
            body += `\n... (+${result.details.matches.length - 20} more matches)`
          }
        }

        if (result.details?.content) {
          body += handleLargeText(String(result.details.content), 'File Content')
        }

        if (result.details?.stdout) {
          body += handleLargeText(String(result.details.stdout), 'Script Output')
        }
      }
    } else {
      body = `[Workbench Action Result: ❌ Action "${actionType}" failed: ${result.error || result.message}]`
      body += `\nPlease inspect this error, adjust parameters or file paths, and proceed.`
    }

    // Safety check on final body size
    if (body.length > 35000) {
      const timestamp = Date.now()
      const rand = Math.random().toString(36).substring(2, 6)
      const spillFile = path.join(os.tmpdir(), `wb_result_full_${timestamp}_${rand}.txt`)
      try {
        fs.writeFileSync(spillFile, body, 'utf-8')
        const preview = body.slice(0, 4000)
        body = `${preview}\n\n... [Action result text was ${body.length.toLocaleString()} characters; full payload saved to: ${spillFile}. Use read_pages or search_text to query specific sections if needed.]`
      } catch (_) {}
    }

    return body
  }

  public cancelAutonomousLoop(): void {
    console.log('[AIView] Autonomous loop cancelled by user.')
    this.isLoopCancelled = true
    this.actionHistory = []
  }

  public resetAutonomousSession(): void {
    if (this.isLoopCancelled) {
      console.log('[AIView] Resetting autonomous loop cancellation state for new prompt.')
    }
    this.isLoopCancelled = false
    this.actionHistory = []
    this.feedbackTurnCount = 0
  }

  public isLoopCancelledState(): boolean {
    return this.isLoopCancelled
  }

  /**
   * Evaluates action history for cycles, repetitions, or consecutive failures.
   * Allows genuine long-running progress while halting loops in 2-3 turns.
   */
  private checkStagnationAndCycles(
    action: string,
    payload: any,
    result: any
  ): { allowAutoSubmit: boolean; reason?: string; toastMessage?: string } {
    const cleanAction = (action || '').toLowerCase()
    const paramsCopy = { ...payload }
    delete paramsCopy.timestamp
    delete paramsCopy._t
    const paramsHash = JSON.stringify(paramsCopy)
    const resultSummary = (result?.message || result?.error || '').slice(0, 200)
    const success = Boolean(result?.success)
    const currentEntry = { action: cleanAction, paramsHash, resultSummary, success }

    // 1. Immediate Duplicate: Same action called consecutively with identical parameters
    if (this.actionHistory.length >= 1) {
      const last = this.actionHistory[this.actionHistory.length - 1]
      if (last.action === cleanAction && last.paramsHash === paramsHash) {
        this.actionHistory.push(currentEntry)
        return {
          allowAutoSubmit: false,
          reason: `Consecutive duplicate action detected: "${cleanAction}" called with identical parameters`,
          toastMessage: `⚠️ Action loop paused: AI repeated identical "${cleanAction}" action without progressing.`,
        }
      }
    }

    // 2. Ping-Pong Oscillation (A -> B -> A -> B)
    if (this.actionHistory.length >= 3) {
      const len = this.actionHistory.length
      const prev1 = this.actionHistory[len - 1]
      const prev2 = this.actionHistory[len - 2]
      const prev3 = this.actionHistory[len - 3]

      if (
        cleanAction === prev2.action &&
        paramsHash === prev2.paramsHash &&
        prev1.action === prev3.action &&
        prev1.paramsHash === prev3.paramsHash
      ) {
        this.actionHistory.push(currentEntry)
        return {
          allowAutoSubmit: false,
          reason: `Action oscillation detected between "${cleanAction}" and "${prev1.action}"`,
          toastMessage: `⚠️ Action cycle paused: AI is alternating between "${cleanAction}" and "${prev1.action}".`,
        }
      }
    }

    // 3. Consecutive Failure Circuit Breaker: 3 actions failed in a row
    if (!success) {
      const recentFails = this.actionHistory.slice(-2).filter((e) => !e.success).length
      if (recentFails >= 2) {
        this.actionHistory.push(currentEntry)
        return {
          allowAutoSubmit: false,
          reason: '3 consecutive actions failed',
          toastMessage: `⚠️ Action loop paused: 3 consecutive actions failed. Review chat to proceed.`,
        }
      }
    }

    // Normal forward progress: append to history (keep last 20)
    this.actionHistory.push(currentEntry)
    if (this.actionHistory.length > 20) {
      this.actionHistory.shift()
    }

    return { allowAutoSubmit: true }
  }

  /**
   * Closes the action execution feedback loop by sending the result of an executed action
   * back to the AI chat, allowing multi-step reasoning and autonomous task execution.
   */
  public async handleActionExecutionFeedback(
    payload: any,
    result: any,
    senderWebContents?: Electron.WebContents
  ) {
    if (!this.actionModeEnabled) return

    if (this.isLoopCancelled) {
      console.log('[AIView:Feedback] Suppressed feedback because loop was cancelled by user.')
      return
    }

    const actionType = (payload.action || payload.type || result.action || 'action').toLowerCase()
    console.log(`[AIView:Feedback:STEP 1] Formatting action execution feedback for: "${actionType}"`)
    const feedbackText = this.formatActionFeedback(payload, result)
    if (!feedbackText) {
      console.log(`[AIView:Feedback:STEP 1] No feedback required for "${actionType}" (suppressed or template)`)
      return
    }

    // Semantic Stagnation & Cycle Detection
    const stagnationCheck = this.checkStagnationAndCycles(actionType, payload, result)

    if (!stagnationCheck.allowAutoSubmit) {
      console.warn(`[AIView:Feedback:STEP 2] ${stagnationCheck.reason}. Pausing auto-submit.`)
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('workbench:toast', {
          message: stagnationCheck.toastMessage || '⚠️ Action cycle detected. Review card in chat.',
          type: 'warning',
        })
      }
    }

    // Dispatch action result card data to the active chat webview (keeps prompt-textarea clean!)
    const actionId = payload.__wbActionId
    console.log(`[AIView:Feedback:STEP 2] In-Chat Result Card ready for "${actionType}" (actionId: ${actionId}). Waiting for user click.`)

    const cardData = {
      actionId,
      actionType,
      payload,
      result,
      feedbackText,
      turnCount: this.feedbackTurnCount + 1,
      canContinue: stagnationCheck.allowAutoSubmit,
      stagnationReason: stagnationCheck.reason,
    }

    // 1. Direct dispatch to the WebContents that triggered the action
    if (senderWebContents && !senderWebContents.isDestroyed()) {
      senderWebContents.send('workbench:action-result-ready', cardData)
    }

    // 2. Also send to currently active view if distinct
    if (this.view && !this.view.webContents.isDestroyed() && this.view.webContents !== senderWebContents) {
      this.view.webContents.send('workbench:action-result-ready', cardData)
    }

    // 3. Broadcast across all attached views to ensure visibility
    for (const v of this.views.values()) {
      if (
        v.webContents &&
        !v.webContents.isDestroyed() &&
        v.webContents !== senderWebContents &&
        v.webContents !== this.view?.webContents
      ) {
        v.webContents.send('workbench:action-result-ready', cardData)
      }
    }

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('workbench:toast', {
        message: result.success
          ? `✅ Action "${actionType}" finished. Click "Continue to Next Step" in chat to proceed.`
          : `⚠️ Action "${actionType}" failed. Review card in chat to proceed.`,
        type: result.success ? 'success' : 'warning',
      })
    }
  }

  /**
   * Submits the next action turn to the AI when the user explicitly clicks
   * "Continue to Next Step" on the in-chat Result Card.
   */
  public async submitActionStep(
    feedbackText: string,
    actionId?: string
  ): Promise<{ success: boolean; submitted?: boolean; error?: string }> {
    if (this.isLoopCancelled) {
      console.log('[AIView:SubmitStep] Aborted because autonomous loop is cancelled by user.')
      return { success: false, error: 'Cancelled by user' }
    }

    this.feedbackTurnCount++
    console.log(`[AIView:SubmitStep] Delivering feedback for turn ${this.feedbackTurnCount}...`)

    const delivery = await this.sendActionFeedbackToAI(feedbackText, true)

    if (this.view && !this.view.webContents.isDestroyed()) {
      this.view.webContents.send('workbench:action-feedback-submitted', {
        actionId,
        submitted: delivery.submitted,
      })
    }

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      if (delivery.submitted) {
        this.mainWindow.webContents.send('workbench:toast', {
          message: `▶ Submitted next step (${this.feedbackTurnCount}) to AI`,
          type: 'info',
        })
      } else {
        this.mainWindow.webContents.send('workbench:toast', {
          message: `❌ Failed to submit next step: ${delivery.error}`,
          type: 'error',
        })
      }
    }

    return delivery
  }

  /**
   * Universal, resilient chat input text injection & auto-submission engine.
   * Leverages Chromium native WebContents input pipeline (insertText & sendInputEvent)
   * to guarantee that ProseMirror (Claude), React (ChatGPT), and Angular (Gemini)
   * state stores receive trusted events and enable their Send buttons.
   */
  public async injectAndSubmitChatText(
    textToInsert: string,
    options: {
      autoSubmit?: boolean
      waitForStreaming?: boolean
      maxWaitMs?: number
      isPriming?: boolean
    } = {}
  ): Promise<{ success: boolean; submitted?: boolean; error?: string }> {
    if (!this.view || this.view.webContents.isDestroyed()) {
      return { success: false, error: 'AI view is not ready' }
    }

    const {
      autoSubmit = true,
      waitForStreaming = true,
      maxWaitMs = 45000,
      isPriming = false,
    } = options

    try {
      if (isPriming) {
        this.resetAutonomousSession()
      }

      // Step 1: Wait for AI streaming / response generation to complete
      if (waitForStreaming) {
        console.log(`[AIView:Inject:STEP 1] Checking/waiting for AI streaming completion (max: ${maxWaitMs}ms)...`)
        const streamWaitStart = Date.now()
        let streaming = true
        while (streaming && Date.now() - streamWaitStart < maxWaitMs) {
          if (this.isLoopCancelled) {
            console.log('[AIView:Inject] Streaming wait aborted because loop was cancelled by user.')
            return { success: false, error: 'Cancelled by user' }
          }

          if (!this.view || this.view.webContents.isDestroyed()) {
            return { success: false, error: 'AI view closed while waiting' }
          }

          const isStreaming: boolean = await this.view.webContents.executeJavaScript(`
            (function() {
              function isVisible(el) {
                if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
                const rect = el.getBoundingClientRect();
                return (rect.width > 0 && rect.height > 0) || el.getClientRects().length > 0;
              }

              const stopSelectors = [
                'button[data-testid="stop-button"]',
                'button[aria-label*="Stop generating" i]',
                'button[aria-label*="Stop Response" i]',
                'button[aria-label*="Stop streaming" i]',
                'button[aria-label="Stop" i]'
              ];
              for (const sel of stopSelectors) {
                const btn = document.querySelector(sel);
                if (isVisible(btn)) {
                  const rect = btn.getBoundingClientRect();
                  if (rect.width > 0 && rect.height > 0) {
                    const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
                    if (ariaLabel.includes('read') || ariaLabel.includes('voice') || ariaLabel.includes('speech') || ariaLabel.includes('audio')) {
                      continue;
                    }
                    return true;
                  }
                }
              }
              if (document.querySelector('.result-streaming, [data-is-streaming="true"], .cursor-blinking')) {
                return true;
              }
              return false;
            })()
          `).catch(() => false)

          if (isStreaming) {
            await new Promise((r) => setTimeout(r, 300))
          } else {
            streaming = false
          }
        }

        // Give the UI 200ms to settle after streaming finishes
        await new Promise((r) => setTimeout(r, 200))
      }

      if (this.isLoopCancelled) {
        console.log('[AIView:Inject] Chat input focus aborted because loop was cancelled by user.')
        return { success: false, error: 'Cancelled by user' }
      }

      // Step 2: Locate and focus the chat input in DOM across Claude, ChatGPT, Gemini, etc.
      console.log(`[AIView:Inject:STEP 2] Locating & focusing chat input in DOM...`)
      const focusResult: { success: boolean; error?: string; isContentEditable?: boolean; tagName?: string } =
        await this.view.webContents.executeJavaScript(`
        (function() {
          function isVisible(el) {
            if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
            const rect = el.getBoundingClientRect();
            return (rect.width > 0 && rect.height > 0) || el.getClientRects().length > 0;
          }

          const inputSelectors = [
            '#prompt-textarea',
            'div.ProseMirror[contenteditable="true"]',
            'div[contenteditable="true"].ProseMirror',
            'div[contenteditable="true"][role="textbox"]',
            'rich-textarea div[contenteditable="true"]',
            'div.ql-editor[contenteditable="true"]',
            '#chat-input',
            'div[contenteditable="true"]',
            'textarea[data-id="root"]',
            'textarea[placeholder*="Ask" i]',
            'textarea[placeholder*="Message" i]',
            'textarea'
          ];

          let input = null;
          for (const sel of inputSelectors) {
            const el = document.querySelector(sel);
            if (isVisible(el)) {
              input = el;
              break;
            }
          }

          if (!input) {
            const url = window.location.href;
            if (url.includes('/auth/login') || url.includes('/login') || url.includes('accounts.google.com') || url.includes('login.microsoftonline.com')) {
              return { success: false, error: 'Please log in to your AI provider account before connecting Workbench.' };
            }
            if (document.querySelector('.cf-turnstile, #challenge-running, #cf-stage, div[id*="turnstile"]') || (document.title && document.title.includes('Just a moment'))) {
              return { success: false, error: 'Cloudflare verification required in chat pane. Please solve the challenge and retry.' };
            }
            const bodyText = document.body ? document.body.innerText : '';
            if (bodyText.includes('Free message limit reached') || bodyText.includes('limit reached until') || bodyText.includes('rate limit') || bodyText.includes('over capacity')) {
              return { success: false, error: 'AI provider usage limit reached. Priming paused until capacity is restored.' };
            }
            return { success: false, error: 'Chat input field not found. Please ensure the chat interface is open.' };
          }

          input.focus();

          // Select all existing content so native insertText cleanly replaces any draft
          if (input.isContentEditable) {
            const range = document.createRange();
            range.selectNodeContents(input);
            const sel = window.getSelection();
            if (sel) {
              sel.removeAllRanges();
              sel.addRange(range);
            }
          } else if (input.tagName && input.tagName.toLowerCase() === 'textarea') {
            input.select();
          }

          return {
            success: true,
            isContentEditable: Boolean(input.isContentEditable),
            tagName: input.tagName ? input.tagName.toLowerCase() : 'unknown'
          };
        })()
      `)

      if (!focusResult.success) {
        const friendlyError = focusResult.error || 'Failed to locate chat input'
        Logger.warn('AIView', `Priming / action injection blocked: ${friendlyError}`)
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('workbench:notify', `⚠️ ${friendlyError}`)
        }
        return { success: false, error: friendlyError }
      }
      console.log(`[AIView:Inject:STEP 2] Input focused: tagName="${focusResult.tagName}", contentEditable=${focusResult.isContentEditable}`)

      // Step 3: Fast Native Text Injection (Atomic Clipboard Paste)
      console.log(`[AIView:Inject:STEP 3] Inserting text (${textToInsert.length} chars) via Chromium WebContents...`)
      this.view.webContents.focus()

      // For prompts > 300 characters, native clipboard paste executes in <5ms,
      // completely eliminating Chromium IPC buffer saturation, GPU proxy crashes, and ProseMirror freeze.
      if (textToInsert.length > 300) {
        const prevClipboard = clipboard.readText()
        try {
          clipboard.writeText(textToInsert)
          this.view.webContents.paste()
          // Allow 400ms for web page editor to process paste event, then restore user's previous clipboard
          setTimeout(() => {
            try {
              if (prevClipboard) clipboard.writeText(prevClipboard)
            } catch (_) {}
          }, 400)
        } catch (pasteErr) {
          console.warn('[AIView:Inject:STEP 3] webContents.paste failed, using insertText fallback:', pasteErr)
          try {
            await this.view.webContents.insertText(textToInsert)
          } catch (_) {}
        }
      } else {
        try {
          await this.view.webContents.insertText(textToInsert)
        } catch (insertErr) {
          console.warn('[AIView:Inject:STEP 3] webContents.insertText failed, using paste fallback:', insertErr)
          clipboard.writeText(textToInsert)
          this.view.webContents.paste()
        }
      }

      // Step 3.5: Dispatch input and change events on activeElement so React (ChatGPT) and Angular (Gemini) enable their Send buttons
      console.log(`[AIView:Inject:STEP 4] Dispatching input events & waiting for DOM reconciliation...`)
      await this.view.webContents.executeJavaScript(`
        (function() {
          const el = document.activeElement || document.querySelector('#prompt-textarea') || document.querySelector('rich-textarea div[contenteditable="true"]') || document.querySelector('div[contenteditable="true"]');
          if (el) {
            try {
              el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertFromPaste' }));
            } catch (_) {}
            try {
              el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText' }));
            } catch (_) {}
            el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
          }
        })()
      `).catch(() => {})

      // Step 4: Allow 200ms for React/ProseMirror DOM reconciliation & send button enabling
      await new Promise((r) => setTimeout(r, 200))

      if (!autoSubmit) {
        console.log(`[AIView:Inject:STEP 5] autoSubmit is false. Leaving text ready in input.`)
        return { success: true, submitted: false }
      }

      if (this.isLoopCancelled) {
        console.log('[AIView:Inject] Submission aborted because loop was cancelled by user.')
        return { success: false, error: 'Cancelled by user' }
      }

      // Step 5: Multi-layered Submission
      // Layer A: Attempt DOM click on the now-enabled Send button
      console.log(`[AIView:Inject:STEP 5] Submitting prompt: attempting Send button click...`)
      const clickResult: { clicked: boolean; sendBtnFound: boolean } =
        await this.view.webContents.executeJavaScript(`
        (function() {
          function isVisible(el) {
            if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
            const rect = el.getBoundingClientRect();
            return (rect.width > 0 && rect.height > 0) || el.getClientRects().length > 0;
          }

          const sendSelectors = [
            'button[data-testid="send-button"]',
            'button[data-testid="fruitjuice-send-button"]',
            'button[aria-label*="Send message" i]',
            'button[aria-label*="Send prompt" i]',
            'button[aria-label="Send" i]',
            'button[aria-label*="Send" i]',
            'button[aria-label*="Submit query" i]',
            'button[aria-label*="Submit" i]',
            'button[type="submit"]',
            'button.send-button',
            '.send-button-container button',
            'div[role="button"][aria-label*="Send" i]',
            'div[role="button"][aria-label*="Submit" i]'
          ];

          for (const sel of sendSelectors) {
            const btn = document.querySelector(sel);
            if (isVisible(btn)) {
              btn.click();
              return { clicked: true, sendBtnFound: true };
            }
          }
          return { clicked: false, sendBtnFound: false };
        })()
      `).catch(() => ({ clicked: false, sendBtnFound: false }))

      // Layer B: Hardware-level Enter key via Electron sendInputEvent if button wasn't clicked
      if (!clickResult.clicked) {
        console.log(`[AIView:Inject:STEP 5] Send button click not triggered (found: ${clickResult.sendBtnFound}). Falling back to Enter key...`)
        this.view.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' })
        this.view.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' })
      } else {
        console.log(`[AIView:Inject:STEP 5] Successfully clicked Send button`)
      }

      // Step 6: Post-submission verification
      await new Promise((r) => setTimeout(r, 500))

      const verification: { submitted: boolean } = await this.view.webContents.executeJavaScript(`
        (function() {
          function isVisible(el) {
            if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
            const rect = el.getBoundingClientRect();
            return (rect.width > 0 && rect.height > 0) || el.getClientRects().length > 0;
          }

          const inputSelectors = [
            '#prompt-textarea',
            'div.ProseMirror[contenteditable="true"]',
            'div[contenteditable="true"].ProseMirror',
            'div[contenteditable="true"][role="textbox"]',
            'rich-textarea div[contenteditable="true"]',
            'div.ql-editor[contenteditable="true"]',
            '#chat-input',
            'div[contenteditable="true"]',
            'textarea'
          ];
          for (const sel of inputSelectors) {
            const el = document.querySelector(sel);
            if (isVisible(el)) {
              const val = (el.value || el.innerText || el.textContent || '').trim();
              if (val.length === 0) return { submitted: true };
            }
          }

          const stopBtn = document.querySelector('button[data-testid="stop-button"], button[aria-label*="Stop" i]');
          if (isVisible(stopBtn)) {
            return { submitted: true };
          }

          return { submitted: false };
        })()
      `).catch(() => ({ submitted: clickResult.clicked }))
      console.log(`[AIView:Inject:STEP 6] Post-submission verification: submitted = ${verification.submitted}`)

      // If still not submitted, try one more hardware Enter fallback
      if (!verification.submitted && !clickResult.clicked) {
        this.view.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' })
        this.view.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' })
        await new Promise((r) => setTimeout(r, 300))
      }

      if (isPriming) {
        // Run prompt-bubble hiding passes for priming - ONLY targeting user query containers
        await this.view.webContents.executeJavaScript(`
          (function() {
            function hidePromptElement() {
              const keywords = [
                'You are integrated with Workbench Desktop',
                'Available Workbench Actions'
              ];
              const selectors = [
                'user-query',
                '[data-message-author-role="user"]',
                'div[data-testid="user-message"]',
                'div.font-user-message',
                '[class*="user-message"]'
              ];
              const elements = document.querySelectorAll(selectors.join(', '));
              elements.forEach(function(el) {
                const text = el.innerText || '';
                if (keywords.some(function(k) { return text.includes(k); })) {
                  el.classList.add('wb-hidden-action-prompt');
                  el.style.display = 'none';
                }
              });
            }
            setTimeout(hidePromptElement, 150);
            setTimeout(hidePromptElement, 500);
            setTimeout(hidePromptElement, 1200);
          })()
        `).catch(() => {})
      }

      return {
        success: true,
        submitted: verification.submitted || clickResult.clicked,
      }
    } catch (err: any) {
      console.warn('[AIView] injectAndSubmitChatText error:', err)
      return { success: false, error: err.message || 'Injection failed' }
    }
  }

  /**
   * Injects an action execution result back into the AI chat input and submits it
   * after verifying the AI has finished generating its previous response.
   */
  public async sendActionFeedbackToAI(
    feedbackText: string,
    autoSubmit: boolean = true
  ): Promise<{ success: boolean; submitted?: boolean; error?: string }> {
    if (!this.view || this.view.webContents.isDestroyed()) {
      return { success: false, error: 'AI view is not ready' }
    }

    return await this.injectAndSubmitChatText(feedbackText, {
      autoSubmit,
      waitForStreaming: true,
      maxWaitMs: 45000,
      isPriming: false,
    })
  }

  public setActionMode(enabled: boolean) {
    this.actionModeEnabled = enabled
    if (!enabled) {
      this.primedSources.delete(this.currentSourceId)
    }
    if (this.view && !this.view.webContents.isDestroyed()) {
      this.view.webContents.send('workbench:action-mode-changed', enabled)
    }
    for (const v of this.views.values()) {
      if (!v.webContents.isDestroyed()) {
        v.webContents.send('workbench:action-mode-changed', enabled)
      }
    }
  }

  public isActionModeEnabled(): boolean {
    return this.actionModeEnabled
  }

  /**
   * Automatically primes the active AI Chat with the Workbench Action System Prompt,
   * submits it in the background, and hides the prompt bubble from the DOM so the screen remains clean.
   */
  public async enableActionMode(promptText: string, force: boolean = false): Promise<{ success: boolean; error?: string }> {
    if (!this.view || this.view.webContents.isDestroyed()) {
      return { success: false, error: 'AI view is not ready' }
    }

    try {
      // 1. Ensure CSS rule is installed to hide the action prompt bubble
      await this.view.webContents.executeJavaScript(`
        (function() {
          if (!document.getElementById('wb-action-mode-styles')) {
            const style = document.createElement('style');
            style.id = 'wb-action-mode-styles';
            style.textContent = \`
              .wb-hidden-action-prompt {
                display: none !important;
              }
            \`;
            document.head.appendChild(style);
          }

          function hidePromptElement() {
            const keywords = [
              'You are integrated with Workbench Desktop',
              'Available Workbench Actions'
            ];
            const selectors = [
              'user-query',
              '[data-message-author-role="user"]',
              'div[data-testid="user-message"]',
              'div.font-user-message',
              '[class*="user-message"]'
            ];
            const elements = document.querySelectorAll(selectors.join(', '));
            elements.forEach(function(el) {
              const text = el.innerText || '';
              if (keywords.some(function(k) { return text.includes(k); })) {
                el.classList.add('wb-hidden-action-prompt');
                el.style.display = 'none';
              }
            });
          }

          if (!window.__wb_hide_observer) {
            window.__wb_hide_observer = new MutationObserver(hidePromptElement);
            window.__wb_hide_observer.observe(document.body, { childList: true, subtree: true });
          }
        })()
      `).catch(() => {})

      // 2. Check if current conversation is already primed (skip if already primed unless forced)
      if (!force) {
        const isPrimed = await this.isChatPrimed()
        if (isPrimed) {
          console.log('[AIView] Active chat is already primed with Workbench actions. Skipping duplicate injection.')
          return { success: true }
        }
      }

      // 3. Inject and auto-submit the system priming prompt using the hardened pipeline
      this.resetAutonomousSession()
      const res = await this.injectAndSubmitChatText(promptText, {
        autoSubmit: true,
        waitForStreaming: false,
        isPriming: true,
      })

      if (res.success) {
        this.primedSources.add(this.currentSourceId)
      } else {
        this.primedSources.delete(this.currentSourceId)
      }

      await this.notifyChatPrimeStatus()
      setTimeout(() => this.notifyChatPrimeStatus(), 800)
      setTimeout(() => this.notifyChatPrimeStatus(), 2000)

      return res
    } catch (err: any) {
      console.error('[AIView] enableActionMode error:', err)
      return { success: false, error: err.message || 'Failed to enable Action Mode' }
    }
  }

  public async isChatPrimed(): Promise<boolean> {
    if (!this.actionModeEnabled) {
      return false
    }
    if (this.primedSources.has(this.currentSourceId)) {
      return true
    }
    if (!this.view || this.view.webContents.isDestroyed()) {
      return false
    }
    try {
      const primed = await this.view.webContents.executeJavaScript(`
        (function() {
          try {
            if (document.querySelector('.wb-hidden-action-prompt')) return true;
            if (document.querySelector('.workbench-action-badge')) return true;
            const bodyText = (document.body ? (document.body.innerText || document.body.textContent || '') : '');
            return bodyText.includes('Connected to Workbench') ||
                   bodyText.includes('Connection Status') ||
                   bodyText.includes('You are integrated with Workbench') ||
                   bodyText.includes('Available Workbench Actions') ||
                   bodyText.includes('Available Actions') ||
                   bodyText.includes('workbench:action');
          } catch (_) {
            return false;
          }
        })()
      `)
      if (primed) {
        this.primedSources.add(this.currentSourceId)
      }
      return Boolean(primed || this.primedSources.has(this.currentSourceId))
    } catch (_) {
      return this.primedSources.has(this.currentSourceId)
    }
  }

  public broadcastToViews(channel: string, ...args: any[]): void {
    if (this.view && !this.view.webContents.isDestroyed()) {
      try {
        this.view.webContents.send(channel, ...args)
      } catch (_) {}
    }
    for (const v of this.views.values()) {
      if (v.webContents && !v.webContents.isDestroyed() && v.webContents !== this.view?.webContents) {
        try {
          v.webContents.send(channel, ...args)
        } catch (_) {}
      }
    }
  }

  public async notifyChatPrimeStatus(): Promise<void> {
    const isPrimed = await this.isChatPrimed()
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('workbench:chat-prime-status-changed', { isPrimed })
    }
    this.broadcastToViews('workbench:chat-prime-status-changed', { isPrimed })
  }

  public detectActiveProvider(): LLMProvider {
    let url = ''
    try {
      if (this.view && !this.view.webContents.isDestroyed()) {
        url = this.view.webContents.getURL() || ''
      }
    } catch {
      url = this.currentUrl || ''
    }
    if (!url) url = this.currentUrl || ''
    const lower = url.toLowerCase()
    if (lower.includes('perplexity.ai')) return 'perplexity'
    if (lower.includes('chatgpt.com') || lower.includes('openai.com')) return 'chatgpt'
    if (lower.includes('claude.ai') || lower.includes('anthropic.com')) return 'claude'
    if (lower.includes('gemini.google.com') || lower.includes('aistudio.google.com')) return 'gemini'
    if (lower.includes('deepseek.com')) return 'deepseek'
    return 'generic'
  }
}

