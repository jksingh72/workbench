import { AuthStrategy } from '../types'

export class AppleAuthStrategy implements AuthStrategy {
  public readonly name = 'Apple'

  private appleHostnames = [
    'appleid.apple.com',
    'idmsa.apple.com',
    'icloud.com',
    'apple.com',
  ]

  public matches(url: string): boolean {
    try {
      const parsed = new URL(url)
      return (
        this.appleHostnames.some((h) => parsed.hostname === h || parsed.hostname.endsWith('.' + h)) ||
        (parsed.hostname.endsWith('apple.com') &&
          (parsed.pathname.includes('auth') || parsed.pathname.includes('login')))
      )
    } catch {
      return url.includes('appleid.apple.com')
    }
  }

  public modifyHeaders(headers: Record<string, string>, _url: string): Record<string, string> {
    return headers
  }

  public isAllowedPopupUrl(url: string): boolean {
    return this.matches(url)
  }
}
