import { AuthStrategy } from '../types'
import { CHROME_DESKTOP_UA } from './defaultAuthStrategy'

const chromeVersion = process.versions.chrome || '134.0.0.0'
const majorVer = chromeVersion.split('.')[0]

export class GoogleAuthStrategy implements AuthStrategy {
  public readonly name = 'Google'

  private googleHostnames = [
    'accounts.google.com',
    'myaccount.google.com',
    'passkeys.google.com',
    'gds.google.com',
    'apis.google.com',
    'oauth2.googleapis.com',
    'gstatic.com',
    'googleusercontent.com',
  ]

  public matches(url: string): boolean {
    try {
      const parsed = new URL(url)
      return (
        this.googleHostnames.some((h) => parsed.hostname === h || parsed.hostname.endsWith('.' + h)) ||
        (parsed.hostname.endsWith('google.com') &&
          (parsed.pathname.includes('oauth') ||
            parsed.pathname.includes('signin') ||
            parsed.pathname.includes('accounts') ||
            parsed.pathname.includes('ServiceLogin') ||
            parsed.pathname.includes('CheckCookie') ||
            parsed.pathname.includes('challenge')))
      )
    } catch {
      return url.includes('accounts.google.com') || url.includes('google.com/o/oauth2')
    }
  }

  public modifyHeaders(headers: Record<string, string>, _url: string): Record<string, string> {
    const updated = { ...headers }

    // Maintain 100% consistent Chrome Desktop identity across Google endpoints.
    // Never spoof Firefox or flip identities, which triggers Google's anti-bot webview blocks
    // and breaks OAuth callback return loops.
    updated['User-Agent'] = CHROME_DESKTOP_UA
    updated['sec-ch-ua'] = `"Chromium";v="${majorVer}", "Not:A-Brand";v="24", "Google Chrome";v="${majorVer}"`
    updated['sec-ch-ua-mobile'] = '?0'
    updated['sec-ch-ua-platform'] = '"Windows"'
    updated['upgrade-insecure-requests'] = '1'

    return updated
  }

  public isAllowedPopupUrl(url: string): boolean {
    return this.matches(url)
  }
}
