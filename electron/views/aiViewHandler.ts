import { WebContentsView, BrowserWindow, session, clipboard, Menu, Rectangle } from 'electron'
import fs from 'node:fs'
import { AuthCoordinator } from '../auth/authCoordinator'
import { AISourceManager, AISource } from '../services/aiSourceManager'
import { getViewPreloadPath } from '../utils/preloadPath'

export const CHATGPT_START_URL = 'https://chatgpt.com/'

export class AIViewHandler {
  private view: WebContentsView | null = null
  private views: Map<string, WebContentsView> = new Map()
  private mainWindow: BrowserWindow
  private aiSourceManager: AISourceManager
  private currentSourceId: string = ''
  private currentUrl: string = CHATGPT_START_URL
  private currentBounds: Rectangle = { x: 0, y: 0, width: 0, height: 0 }
  private isVisible: boolean = true

  constructor(mainWindow: BrowserWindow, aiSourceManager: AISourceManager) {
    this.mainWindow = mainWindow
    this.aiSourceManager = aiSourceManager
    this.initView()
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
    wc.setWindowOpenHandler((details) =>
      authCoordinator.handleWindowOpen(details, newView, this.mainWindow)
    )

    this.wireNavEventsForView(newView, source.id)

    wc.loadURL(source.url).catch((err) => {
      console.error(`[AIView] Failed to load initial URL for '${source.name}':`, err)
    })

    this.views.set(source.id, newView)

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.contentView.addChildView(newView)
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
        this.sendNavState(wc)
      }
    }

    wc.on('did-start-loading', onStateChange)
    wc.on('did-stop-loading', onStateChange)
    wc.on('did-finish-load', onStateChange)
    wc.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      if (this.currentSourceId === sourceId) {
        console.warn(`[AIView] Load failed (${errorCode}):`, errorDescription, validatedURL)
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
    this.currentBounds = bounds
    if (this.view) {
      this.view.setBounds(bounds)
    }
  }

  public setVisible(visible: boolean) {
    this.isVisible = visible
    if (this.view) {
      this.view.setVisible(visible)
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

  public loadAISource(source: AISource) {
    if (this.currentSourceId === source.id && this.view) {
      return
    }

    // Hide previous view
    if (this.view && !this.view.webContents.isDestroyed()) {
      this.view.setVisible(false)
    }

    this.currentSourceId = source.id
    this.currentUrl = source.url
    this.view = this.getOrCreateView(source)

    if (this.currentBounds.width > 0 && this.currentBounds.height > 0) {
      this.view.setBounds(this.currentBounds)
    }
    this.view.setVisible(this.isVisible)

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

      // Inject into prompt input field
      const injected = await this.view.webContents.executeJavaScript(`
        (function(textToInsert) {
          try {
            const input = document.querySelector('#prompt-textarea') || 
                          document.querySelector('div[contenteditable="true"]') || 
                          document.querySelector('textarea');
            if (!input) return false;

            input.focus();

            if (input.tagName && input.tagName.toLowerCase() === 'textarea') {
              input.value = textToInsert;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              return true;
            }

            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(input);
            selection.removeAllRanges();
            selection.addRange(range);

            document.execCommand('insertText', false, textToInsert);
            input.dispatchEvent(new InputEvent('input', { bubbles: true, data: textToInsert }));
            return true;
          } catch (e) {
            console.error('Injection error:', e);
            return false;
          }
        })(${JSON.stringify(prompt)})
      `)

      this.view.webContents.focus()

      return {
        success: true,
        text,
        prompt,
        injected: Boolean(injected),
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
}
