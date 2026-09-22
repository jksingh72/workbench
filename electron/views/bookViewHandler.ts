import { WebContentsView, BrowserWindow, session, Rectangle } from 'electron'
import { AuthCoordinator } from '../auth/authCoordinator'
import { CHROME_DESKTOP_UA } from '../auth/strategies/defaultAuthStrategy'

export { CHROME_DESKTOP_UA }

export const OREILLY_START_URL = 'https://www.oreilly.com/member/login/'

export class BookViewHandler {
  private view: WebContentsView | null = null
  private mainWindow: BrowserWindow

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow
    this.initView()
  }

  private initView() {
    const oreillySession = session.fromPartition('persist:workbench-oreilly')
    const authCoordinator = AuthCoordinator.getInstance()
    authCoordinator.attachToSession(oreillySession)

    this.view = new WebContentsView({
      webPreferences: {
        session: oreillySession,
        contextIsolation: true,
        sandbox: true,
      },
    })

    const wc = this.view.webContents

    // Delegate OAuth, login, and reader popups to AuthCoordinator
    wc.setWindowOpenHandler((details) =>
      authCoordinator.handleWindowOpen(details, this.view, this.mainWindow)
    )

    // Wire navigation event state updates to React renderer
    this.wireNavEvents()

    // Initial URL load
    wc.loadURL(OREILLY_START_URL).catch((err) => {
      console.error('[BookView] Failed to load initial URL:', err)
    })
  }

  private wireNavEvents() {
    if (!this.view) return
    const wc = this.view.webContents

    const sendState = () => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
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

    wc.on('did-start-loading', sendState)
    wc.on('did-stop-loading', sendState)
    wc.on('did-finish-load', sendState)
    wc.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      console.warn(`[BookView] Load failed (${errorCode}):`, errorDescription, validatedURL)
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
          console.error('[BookView] Reload error:', err)
        }
        break
      case 'home':
        try {
          wc.stop()
          wc.loadURL(OREILLY_START_URL).catch((err) => {
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

  public async clearSession(): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('[BookView] Isolated delete login: Clearing O\'Reilly credentials ONLY...')
      const targetSession = session.fromPartition('persist:workbench-oreilly')

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
        this.view.webContents.loadURL(OREILLY_START_URL).catch(console.error)

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
      console.error('[BookView] Clear session error:', err)
      return { success: false, error: err.message || 'Failed to clear O\'Reilly session' }
    }
  }
}
