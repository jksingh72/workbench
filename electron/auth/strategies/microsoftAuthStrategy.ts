import { AuthStrategy } from '../types'

export class MicrosoftAuthStrategy implements AuthStrategy {
  public readonly name = 'Microsoft'

  private microsoftHostnames = [
    'login.microsoftonline.com',
    'login.live.com',
    'account.live.com',
    'msftauth.net',
    'msauth.net',
    'aadcdn.msauth.net',
  ]

  public matches(url: string): boolean {
    try {
      const parsed = new URL(url)
      return (
        this.microsoftHostnames.some((h) => parsed.hostname === h || parsed.hostname.endsWith('.' + h)) ||
        (parsed.hostname.endsWith('microsoft.com') &&
          (parsed.pathname.includes('oauth') || parsed.pathname.includes('login') || parsed.pathname.includes('sso')))
      )
    } catch {
      return url.includes('login.microsoftonline.com') || url.includes('login.live.com')
    }
  }

  public modifyHeaders(headers: Record<string, string>, _url: string): Record<string, string> {
    // Microsoft / Azure AD SSO functions optimally with standard Desktop Chrome headers
    return headers
  }

  public isAllowedPopupUrl(url: string): boolean {
    return this.matches(url)
  }
}
