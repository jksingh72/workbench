import { AuthStrategy } from '../types'

const chromeVersion = process.versions.chrome || '134.0.0.0'
const majorVer = chromeVersion.split('.')[0]

export const CHROME_DESKTOP_UA =
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`

export class DefaultAuthStrategy implements AuthStrategy {
  public readonly name = 'Default'

  private allowedHosts = [
    'auth.openai.com',
    'auth0.openai.com',
    'chatgpt.com',
    'oreilly.com',
    'learning.oreilly.com',
    'github.com',
    'okta.com',
    'pingidentity.com',
    'onelogin.com',
    'icloud.com',
    'apple.com',
  ]

  public matches(_url: string): boolean {
    // Default fallback matches all other requests
    return true
  }

  public modifyHeaders(headers: Record<string, string>, _url: string): Record<string, string> {
    const updated = { ...headers }
    updated['User-Agent'] = CHROME_DESKTOP_UA
    updated['sec-ch-ua'] = `"Google Chrome";v="${majorVer}", "Chromium";v="${majorVer}", "Not_A Brand";v="24"`
    updated['sec-ch-ua-mobile'] = '?0'
    updated['sec-ch-ua-platform'] = '"Windows"'
    // Do not inject high-entropy platform version without server Accept-CH; prevents Akamai/Cloudflare bot flags
    delete updated['sec-ch-ua-platform-version']
    updated['upgrade-insecure-requests'] = '1'
    return updated
  }

  public isAllowedPopupUrl(url: string): boolean {
    try {
      const parsed = new URL(url)
      const host = parsed.hostname.toLowerCase()
      const path = parsed.pathname.toLowerCase()

      return (
        this.allowedHosts.some((h) => host === h || host.endsWith('.' + h)) ||
        path.includes('login') ||
        path.includes('signin') ||
        path.includes('auth') ||
        path.includes('oauth') ||
        path.includes('sso')
      )
    } catch {
      return (
        url.includes('login') ||
        url.includes('signin') ||
        url.includes('auth') ||
        url.includes('oauth') ||
        url.includes('sso')
      )
    }
  }
}
