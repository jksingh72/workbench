import { AuthStrategy } from '../types'
import { CHROME_DESKTOP_UA } from './defaultAuthStrategy'

const chromeVersion = process.versions.chrome || '134.0.0.0'
const majorVer = chromeVersion.split('.')[0]

export class GoogleAuthStrategy implements AuthStrategy {
  public readonly name = 'Google'

  public matches(url: string): boolean {
    try {
      const parsed = new URL(url)
      const host = parsed.hostname.toLowerCase()
      return (
        host === 'google.com' ||
        host.endsWith('.google.com') ||
        host.endsWith('.googleapis.com') ||
        host.endsWith('.gstatic.com') ||
        host.endsWith('.googleusercontent.com') ||
        host.endsWith('.googlevideo.com')
      )
    } catch {
      return url.includes('google.com') || url.includes('accounts.google')
    }
  }

  public modifyHeaders(headers: Record<string, string>, _url: string): Record<string, string> {
    const updated = { ...headers }

    // Maintain 100% consistent Chrome Desktop identity across Google endpoints.
    // Aligns HTTP Client Hints exactly with runtime navigator.userAgentData and window.chrome.
    updated['User-Agent'] = CHROME_DESKTOP_UA
    updated['sec-ch-ua'] = `"Google Chrome";v="${majorVer}", "Chromium";v="${majorVer}", "Not_A Brand";v="24"`
    updated['sec-ch-ua-mobile'] = '?0'
    updated['sec-ch-ua-platform'] = '"Windows"'
    updated['sec-ch-ua-platform-version'] = '"15.0.0"'
    updated['sec-ch-ua-arch'] = '"x86"'
    updated['sec-ch-ua-bitness'] = '"64"'
    updated['sec-ch-ua-model'] = '""'
    updated['sec-ch-ua-full-version-list'] = `"Google Chrome";v="${chromeVersion}", "Chromium";v="${chromeVersion}", "Not_A Brand";v="24.0.0.0"`
    updated['upgrade-insecure-requests'] = '1'

    return updated
  }

  public isAllowedPopupUrl(url: string): boolean {
    return this.matches(url)
  }
}
