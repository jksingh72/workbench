# Google Authentication & Embedded WebViews in Workbench

This document captures the technical analysis, challenges, and mitigation strategies regarding **Google Account Authentication (`accounts.google.com`)** within Workbench (affecting Google SSO in Bookview, ChatGPT, and specifically **Google Gemini**).

---

## 1. The Core Problem

When attempting to sign in to any service requiring Google Authentication (such as `gemini.google.com` or Google SSO for O'Reilly/ChatGPT), Google often rejects the login attempt with the error:

> **"Couldn't sign you in. This browser or app may not be secure. Learn more. Try using a different browser."**

Unlike ChatGPT, Anthropic Claude, and O'Reilly—which allow direct **Email & Password** authentication as an alternative to SSO—**Google Gemini is a first-party Google product that exclusively authenticates via Google Accounts (`accounts.google.com`)**.

---

## 2. Why Google Accounts Blocks Embedded WebViews

Google implements an automated client-integrity check designed to prevent credential harvesting and session hijacking in third-party embedded web views (Electron, CEF, Android WebView). 

Google's security scanners check for specific signals:
1. **User-Agent & Client Hints Matching**:
   - Modern Chromium sends Client Hints (`sec-ch-ua`, `sec-ch-ua-mobile`, `sec-ch-ua-platform`).
   - If JavaScript properties (`navigator.userAgentData`) do not precisely match HTTP request headers, Google flags the environment.
2. **Missing `window.chrome` APIs**:
   - In genuine desktop Google Chrome, `window.chrome` exposes internal objects such as `app`, `csi`, `loadTimes`, and `runtime`. In default Electron views, these objects are missing or incomplete.
3. **`navigator.plugins` and Hardware Fingerprinting**:
   - Standard Chrome populates built-in plugin lists (e.g. Chrome PDF Viewer). Default Electron instances often expose an empty `navigator.plugins` list.
4. **Automation Indicators**:
   - Automated browsers or webviews often expose `navigator.webdriver = true` or internal Blink automation flags.

---

## 3. Evaluated Approaches

### Approach A: External System Browser OAuth Flow
- **Standard Use Case**: Used by apps like Slack, Notion, and Figma.
- **Why It Does NOT Work for Gemini Web**:
  - Slack and Notion are registered third-party OAuth applications that receive authorization codes via loopback redirects (`http://localhost:port/callback`).
  - `gemini.google.com` is a private, consumer-facing Google web app. Google does **not** provide an OAuth code grant for third-party access to the Gemini web interface; it requires first-party Google session cookies (`__Secure-1PSID`, `SID`, `HSID`, `SSID`) on the `.google.com` domain.
  - Due to browser Same-Origin Policy and Chrome's App-Bound Encryption on Windows, external Chrome cannot automatically share its Google cookies with Workbench.

### Approach B: Manual / Bookmarklet Cookie Import
- **Concept**: User logs into Gemini in their regular desktop Chrome browser and exports their session string via a helper extension or bookmarklet into Workbench.
- **Pros**: 100% compliant with Google policies.
- **Cons**: Requires manual user steps and maintenance when session cookies expire.

### Approach C: In-App Desktop Chrome Fingerprint Emulation (Chosen Path)
- **Concept**: Align the Electron WebContentsView fingerprint with an authentic desktop Google Chrome installation on Windows so that `accounts.google.com` recognizes Workbench as an authentic, secure browser.
- **Key Implementation Requirements**:
  1. **Clean Desktop User-Agent**: Exact current Chrome version on Windows 10/11 without any Electron, CEF, or framework signatures.
  2. **Aligned Client Hints**: Synchronized `sec-ch-ua`, `sec-ch-ua-platform`, `sec-ch-ua-mobile`, and `sec-ch-ua-full-version-list` headers across all Google network requests.
  3. **`window.chrome` Injection**: Preload stub injection providing `window.chrome.loadTimes()`, `window.chrome.csi()`, and `window.chrome.app`.
  4. **Plugin & Automation Concealment**: Ensure `navigator.webdriver` is strictly undefined and standard Chromium PDF viewer plugins are declared.
  5. **Session Isolation**: Maintain a persistent partition (`persist:workbench-ai` / `persist:workbench-gemini`) that preserves cookies, credentials, and localStorage across app launches.

---

## 4. Current Status & Next Steps
- This issue is actively tracked for resolution in `feature/chatview-ai-configure`.
- Implementation of **In-App Desktop Chrome Fingerprint Emulation** will be researched and applied to the Google Auth Strategy and tested against `gemini.google.com`.
