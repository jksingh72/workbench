import { WebContentsView, BrowserWindow, session, clipboard, Menu, Rectangle } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { AuthCoordinator } from '../auth/authCoordinator'
import { AISourceManager, AISource } from '../services/aiSourceManager'
import { getViewPreloadPath } from '../utils/preloadPath'

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
        console.warn(`[AIView] Load failed (${errorCode}):`, errorDescription, validatedURL)
        onStateChange()
      }
    })
    wc.on('did-navigate', onStateChange)
    wc.on('did-navigate-in-page', () => {
      onStateChange()
      this.attachDropAndUploadInterceptor(viewInstance)
    })
    wc.on('page-title-updated', onStateChange)

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
    const isExisting = this.views.has(source.id)
    this.view = this.getOrCreateView(source)

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

            // 3. Generic fallback
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

  public async sendFileToAI(
    filePath: string,
    customInstruction?: string
  ): Promise<{ success: boolean; uploaded?: boolean; fileName?: string; error?: string }> {
    if (!this.view || this.view.webContents.isDestroyed()) {
      return { success: false, error: 'AI view is not ready' }
    }

    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'File does not exist' }
      }

      const stat = await fs.promises.stat(filePath)
      if (stat.isDirectory()) {
        return { success: false, error: 'Cannot send a folder to AI' }
      }

      if (stat.size > 25 * 1024 * 1024) {
        return { success: false, error: 'File is too large (>25MB)' }
      }

      const fileName = path.basename(filePath)
      const ext = path.extname(fileName).toLowerCase().replace('.', '')
      const textExtensions = [
        'txt', 'md', 'markdown', 'js', 'ts', 'jsx', 'tsx', 'py', 'json', 'html', 'htm',
        'css', 'scss', 'csv', 'xml', 'yaml', 'yml', 'sql', 'sh', 'bat', 'ps1',
        'c', 'cpp', 'h', 'hpp', 'java', 'rs', 'go', 'rb', 'php', 'swift', 'kt', 'log', 'ini', 'env'
      ]
      const isKnownTextExt = textExtensions.includes(ext)

      // Read buffer
      const fileBuffer = await fs.promises.readFile(filePath)
      const base64Data = fileBuffer.toString('base64')

      // Detect if strictly text (known extension and no null bytes in sample)
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
      const mimeType = mimeTypes[ext] || 'application/octet-stream'

      // Optional user prompt instruction only (never dump file content if file is uploaded)
      const userInstruction = (customInstruction || '').trim()

      const result = await this.view.webContents.executeJavaScript(`
        (async function(base64Data, fileName, mimeType, isText, textContent, userInstruction) {
          let fileUploaded = false;
          try {
            const fileInput = document.querySelector('input[type="file"]');
            if (fileInput) {
              const byteCharacters = atob(base64Data);
              const byteNumbers = new Array(byteCharacters.length);
              for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
              }
              const byteArray = new Uint8Array(byteNumbers);
              const blob = new Blob([byteArray], { type: mimeType });
              const file = new File([blob], fileName, { type: mimeType, lastModified: Date.now() });

              const dt = new DataTransfer();
              dt.items.add(file);
              fileInput.files = dt.files;
              fileInput.dispatchEvent(new Event('change', { bubbles: true }));
              fileInput.dispatchEvent(new Event('input', { bubbles: true }));
              fileUploaded = true;
            }
          } catch (e) {
            console.warn('[AIView] File upload injection failed:', e);
          }

          // If the file was successfully uploaded, we do NOT dump the file content into the prompt!
          // We only inject userInstruction if one was provided.
          // If file upload failed, we only fall back to text paste if the file is genuinely plain text.
          let textToInject = '';
          if (fileUploaded) {
            textToInject = userInstruction;
          } else if (isText && textContent) {
            const extName = fileName.split('.').pop() || 'txt';
            textToInject = (userInstruction ? userInstruction + '\\n\\n' : '') +
              'File: \`' + fileName + '\`\\n\`\`\`' + extName + '\\n' + textContent + '\\n\`\`\`';
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

          return { success: true, fileUploaded };
        })(${JSON.stringify(base64Data)}, ${JSON.stringify(fileName)}, ${JSON.stringify(mimeType)}, ${isText}, ${JSON.stringify(textContent)}, ${JSON.stringify(userInstruction)})
      `)

      this.view.webContents.focus()
      return { success: true, uploaded: result?.fileUploaded, fileName }
    } catch (err: any) {
      console.error('[AIView] sendFileToAI error:', err)
      return { success: false, error: err.message || 'Failed to send file to AI' }
    }
  }

  // =========================================================================
  // Modular Section: Drag & Drop File Upload Interceptor
  // =========================================================================
  private currentDraggingFile: string | null = null
  private currentClipboardFile: string | null = null

  public setDraggingFile(filePath: string | null) {
    this.currentDraggingFile = filePath
  }

  public getDraggingFile(): string | null {
    return this.currentDraggingFile
  }

  public setClipboardFile(filePath: string | null) {
    this.currentClipboardFile = filePath
    if (filePath && this.view && !this.view.webContents.isDestroyed()) {
      this.view.webContents.send('workbench:staged-file-copied', { fileName: path.basename(filePath) })
    }
  }

  public consumeClipboardFile(): string | null {
    const file = this.currentClipboardFile
    this.currentClipboardFile = null
    return file
  }

  public getClipboardFile(): string | null {
    return this.currentClipboardFile
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
}

