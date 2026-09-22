import { Session, BrowserWindow, WebContents, WebContentsView, HandlerDetails, WindowOpenHandlerResponse, shell } from 'electron'
import { AuthStrategy } from './types'
import { GoogleAuthStrategy } from './strategies/googleAuthStrategy'
import { MicrosoftAuthStrategy } from './strategies/microsoftAuthStrategy'
import { AppleAuthStrategy } from './strategies/appleAuthStrategy'
import { DefaultAuthStrategy, CHROME_DESKTOP_UA } from './strategies/defaultAuthStrategy'

export class AuthCoordinator {
  private static instance: AuthCoordinator | null = null
  private strategies: AuthStrategy[] = []
  private attachedSessions = new WeakSet<Session>()

  constructor() {
    // Register strategies in priority order
    this.strategies = [
      new GoogleAuthStrategy(),
      new MicrosoftAuthStrategy(),
      new AppleAuthStrategy(),
      new DefaultAuthStrategy(), // Fallback for all other URLs
    ]
  }

  public static getInstance(): AuthCoordinator {
    if (!AuthCoordinator.instance) {
      AuthCoordinator.instance = new AuthCoordinator()
    }
    return AuthCoordinator.instance
  }

  /**
   * Attach network request interceptors and header rewriting to a session partition.
   * Enforces 100% consistent Chrome Desktop identity across all views with zero UA flipping.
   */
  public attachToSession(targetSession: Session) {
    if (this.attachedSessions.has(targetSession)) return
    this.attachedSessions.add(targetSession)

    targetSession.setUserAgent(CHROME_DESKTOP_UA)

    // Upgrade any insecure HTTP redirects to HTTPS to prevent CDN blocks
    targetSession.webRequest.onBeforeRequest({ urls: ['http://*/*'] }, (details, callback) => {
      if (details.url.startsWith('http://')) {
        const secureUrl = details.url.replace('http://', 'https://')
        callback({ redirectURL: secureUrl })
        return
      }
      callback({})
    })

    // Dynamic header rewriting per auth strategy
    targetSession.webRequest.onBeforeSendHeaders((details, callback) => {
      let headers = { ...details.requestHeaders }

      for (const strategy of this.strategies) {
        if (strategy.matches(details.url)) {
          if (strategy.modifyHeaders) {
            headers = strategy.modifyHeaders(headers, details.url)
          }
          break
        }
      }

      callback({ requestHeaders: headers })
    })
  }

  /**
   * Attach dynamic navigation listeners to a WebContents instance.
   * Ensures WebContents consistently reports Chrome Desktop UA with zero runtime flipping.
   */
  public attachToWebContents(wc: WebContents) {
    if (!wc || wc.isDestroyed()) return
    wc.setUserAgent(CHROME_DESKTOP_UA)
  }

  /**
   * Handle window.open (popups) from embedded web views.
   * Centers allowed OAuth/SSO popups over the calling pane; opens non-auth links externally.
   */
  public handleWindowOpen(
    details: HandlerDetails,
    callingView: WebContentsView | null,
    parentWindow: BrowserWindow
  ): WindowOpenHandlerResponse {
    const { url } = details

    // Check if any strategy allows this popup URL
    const isAllowed = this.strategies.some((s) => s.isAllowedPopupUrl?.(url))

    if (isAllowed) {
      const viewBounds = callingView?.getBounds() || { x: 0, y: 82, width: 800, height: 600 }
      const winBounds = parentWindow.getContentBounds()

      const popupWidth = Math.min(560, Math.max(380, Math.round(viewBounds.width * 0.9)))
      const popupHeight = Math.min(720, Math.max(450, Math.round(viewBounds.height * 0.9)))
      const popupX = Math.round(winBounds.x + viewBounds.x + (viewBounds.width - popupWidth) / 2)
      const popupY = Math.round(winBounds.y + viewBounds.y + (viewBounds.height - popupHeight) / 2)

      return {
        action: 'allow' as const,
        overrideBrowserWindowOptions: {
          parent: parentWindow,
          modal: false,
          autoHideMenuBar: true,
          width: popupWidth,
          height: popupHeight,
          x: popupX,
          y: popupY,
        },
      }
    }

    // Deny non-auth popups from opening in electron; route to external desktop browser
    shell.openExternal(url)
    return { action: 'deny' as const }
  }
}
