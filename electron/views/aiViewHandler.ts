import { WebContentsView, BrowserWindow, session, clipboard, Menu, Rectangle } from 'electron'
import fs from 'node:fs'
import { AuthCoordinator } from '../auth/authCoordinator'
import { AISourceManager, AISource } from '../services/aiSourceManager'
import { getViewPreloadPath } from '../utils/preloadPath'

export const CHATGPT_START_URL = 'https://chatgpt.com/'

export class AIViewHandler {
  private view: WebContentsView | null = null
  private mainWindow: BrowserWindow
  private aiSourceManager: AISourceManager
  private currentUrl: string = CHATGPT_START_URL

  constructor(mainWindow: BrowserWindow, aiSourceManager: AISourceManager) {
    this.mainWindow = mainWindow
    this.aiSourceManager = aiSourceManager
    this.initView()
  }

  private initView() {
    const chatgptSession = session.fromPartition('persist:workbench-chatgpt')
    const authCoordinator = AuthCoordinator.getInstance()
    authCoordinator.attachToSession(chatgptSession)

    const viewPreload = getViewPreloadPath()
    this.view = new WebContentsView({
      webPreferences: {
        session: chatgptSession,
        preload: fs.existsSync(viewPreload) ? viewPreload : undefined,
        contextIsolation: true,
        sandbox: true,
      },
    })

    const wc = this.view.webContents

    // Delegate OAuth, SSO, and login popups to AuthCoordinator
    wc.setWindowOpenHandler((details) =>
      authCoordinator.handleWindowOpen(details, this.view, this.mainWindow)
    )

    // Wire navigation event state updates to React renderer
    this.wireNavEvents()

    // Initial URL load from active AI source
    const activeSource = this.aiSourceManager.getActiveSource()
    this.currentUrl = activeSource.url
    wc.loadURL(this.currentUrl).catch((err) => {
      console.error(`[AIView] Failed to load initial URL for '${activeSource.name}':`, err)
    })
  }

  private wireNavEvents() {
    if (!this.view) return
    const wc = this.view.webContents

    const sendState = () => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
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

    wc.on('did-start-loading', sendState)
    wc.on('did-stop-loading', sendState)
    wc.on('did-finish-load', sendState)
    wc.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      console.warn(`[AIView] Load failed (${errorCode}):`, errorDescription, validatedURL)
      sendState()
    })
    wc.on('did-navigate', sendState)
    wc.on('did-navigate-in-page', sendState)
    wc.on('page-title-updated', sendState)
  }

  public getView(): WebContentsView | null {
    return this.view
  }

  public setBounds(bounds: Rectangle) {
    if (this.view) {
      this.view.setBounds(bounds)
    }
  }

  public setVisible(visible: boolean) {
    if (this.view) {
      this.view.setVisible(visible)
    }
  }

  public handleNavAction(command: 'back' | 'forward' | 'reload' | 'home' | 'zoom-in' | 'zoom-out' | 'zoom-reset') {
    if (!this.view) return
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
    if (!this.view || this.view.webContents.isDestroyed()) return
    this.currentUrl = source.url
    try {
      this.view.webContents.stop()
      this.view.webContents.loadURL(source.url).catch((err) => {
        console.error(`[AIView] Failed to load source '${source.name}':`, err)
      })
    } catch (err) {
      console.error(`[AIView] Error navigating to source '${source.name}':`, err)
    }
  }

  public async doAskAI(
    templateKey: string,
    customPrompt?: string,
    extractSelection?: () => Promise<string>
  ) {
    if (!this.view || this.view.webContents.isDestroyed()) {
      return { success: false, error: 'ChatGPT view is not ready' }
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

      // Inject into ChatGPT prompt input field
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
      return { success: false, error: err.message || 'Failed to communicate with ChatGPT' }
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

  public async clearSession(): Promise<{ success: boolean; error?: string }> {
    try {
      const activeSource = this.aiSourceManager.getActiveSource()
      const reloadUrl = activeSource?.url || this.currentUrl || CHATGPT_START_URL
      console.log(`[AIView] Isolated delete login: Clearing credentials for '${activeSource?.name || 'AI'}' ONLY...`)
      const targetSession = session.fromPartition('persist:workbench-chatgpt')

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

      if (this.view && !this.view.webContents.isDestroyed()) {
        this.view.webContents.stop()
        this.view.webContents.loadURL(reloadUrl).catch(console.error)

        this.view.webContents.once('did-finish-load', () => {
          this.view?.webContents
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

      return { success: true }
    } catch (err: any) {
      console.error('[AIView] Clear session error:', err)
      return { success: false, error: err.message || 'Failed to clear ChatGPT session' }
    }
  }
}
