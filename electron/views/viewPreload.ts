import { webFrame, ipcRenderer } from 'electron'
import {
  parseBookChatCommand,
  ParsedBookChatCommand,
  SUMMARY_STYLE_PRESETS,
  EXPLAIN_STYLE_PRESETS,
  resolveBookInstructionWithPresets,
} from '../utils/bookCommandParser'
import { setSafeInnerHTML } from '../utils/safeDom'

/**
 * Isolated View Preload Script
 *
 * Runs for guest WebContentsViews (AI ChatView and BookView) and OAuth popups.
 * Injects genuine desktop Google Chrome runtime APIs into the main world (World ID 0)
 * before any webpage scripts (specifically Google Accounts anti-bot verification) run.
 */

const injectionCode = `
(function() {
  try {
    // 1. Emulate window.chrome and sub-APIs (csi, loadTimes, app)
    if (!window.chrome) {
      window.chrome = {};
    }

    if (!window.chrome.app) {
      window.chrome.app = {
        isInstalled: false,
        InstallState: {
          DISABLED: 'disabled',
          INSTALLED: 'installed',
          NOT_INSTALLED: 'not_installed'
        },
        RunningState: {
          CANNOT_RUN: 'cannot_run',
          READY_TO_RUN: 'ready_to_run',
          RUNNING: 'running'
        },
        getDetails: function() { return null; },
        getIsInstalled: function() { return false; },
        installState: function(cb) { if (typeof cb === 'function') cb('not_installed'); },
        runningState: function() { return 'cannot_run'; }
      };
    }

    if (!window.chrome.csi) {
      window.chrome.csi = function() {
        return {
          startE: Date.now(),
          onloadT: Date.now(),
          pageT: (performance && performance.now) ? performance.now() : 0,
          tran: 15
        };
      };
    }

    if (!window.chrome.loadTimes) {
      window.chrome.loadTimes = function() {
        var nowSec = Date.now() / 1000;
        return {
          commitLoadTime: nowSec,
          connectionInfo: 'h2',
          finishDocumentLoadTime: nowSec,
          finishLoadTime: nowSec,
          firstPaintAfterLoadTime: 0,
          firstPaintTime: nowSec,
          navigationType: 'Other',
          npnNegotiatedProtocol: 'h2',
          requestTime: nowSec - 0.05,
          startLoadTime: nowSec - 0.05,
          wasAlternateProtocolAvailable: false,
          wasFetchedViaSpdy: true,
          wasNpnNegotiated: true
        };
      };
    }

    // 2. Extract authentic Chrome versions from userAgent
    var ua = navigator.userAgent;
    var match = ua.match(/Chrome\\/([0-9]+)\\.([0-9.]+)/);
    var majorVer = match ? match[1] : '134';
    var fullVer = match ? (match[1] + '.' + match[2]) : '134.0.0.0';

    var brands = [
      { brand: 'Google Chrome', version: majorVer },
      { brand: 'Chromium', version: majorVer },
      { brand: 'Not_A Brand', version: '24' }
    ];

    var fullVersionList = [
      { brand: 'Google Chrome', version: fullVer },
      { brand: 'Chromium', version: fullVer },
      { brand: 'Not_A Brand', version: '24.0.0.0' }
    ];

    var userAgentDataObj = {
      brands: brands,
      mobile: false,
      platform: 'Windows',
      getHighEntropyValues: function(hints) {
        return Promise.resolve({
          architecture: 'x86',
          bitness: '64',
          brands: brands,
          fullVersionList: fullVersionList,
          mobile: false,
          model: '',
          platform: 'Windows',
          platformVersion: '15.0.0',
          uaFullVersion: fullVer,
          wow64: false
        });
      },
      toJSON: function() {
        return {
          brands: brands,
          mobile: false,
          platform: 'Windows'
        };
      }
    };

    try {
      Object.defineProperty(Object.getPrototypeOf(navigator), 'userAgentData', {
        get: function() { return userAgentDataObj; },
        enumerable: true,
        configurable: true
      });
    } catch (_) {
      try {
        Object.defineProperty(navigator, 'userAgentData', {
          get: function() { return userAgentDataObj; },
          enumerable: true,
          configurable: true
        });
      } catch (__) {}
    }

    // 3. Conceal automation / webdriver flags
    try {
      Object.defineProperty(Object.getPrototypeOf(navigator), 'webdriver', {
        get: function() { return false; },
        enumerable: true,
        configurable: true
      });
    } catch (_) {
      try {
        Object.defineProperty(navigator, 'webdriver', {
          get: function() { return false; },
          enumerable: true,
          configurable: true
        });
      } catch (__) {}
    }

    // 4. Ensure navigator.plugins is populated (normal Chrome PDF plugins)
    try {
      if (!navigator.plugins || navigator.plugins.length === 0) {
        var pluginNames = [
          { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Microsoft Edge PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'WebKit built-in PDF', filename: 'internal-pdf-viewer', description: 'Portable Document Format' }
        ];
        var pluginsArr = pluginNames.map(function(p) {
          return Object.assign(Object.create(Plugin.prototype || {}), {
            description: p.description,
            filename: p.filename,
            name: p.name,
            length: 1,
            0: {
              type: 'application/pdf',
              suffixes: 'pdf',
              description: 'Portable Document Format',
              enabledPlugin: null
            }
          });
        });
        var pluginArray = Object.create(PluginArray.prototype || {});
        pluginNames.forEach(function(p, i) {
          pluginArray[i] = pluginsArr[i];
          pluginArray[p.name] = pluginsArr[i];
        });
        Object.defineProperty(pluginArray, 'length', { value: pluginsArr.length });
        pluginArray.item = function(index) { return pluginsArr[index] || null; };
        pluginArray.namedItem = function(name) { return pluginArray[name] || null; };
        pluginArray.refresh = function() {};

        Object.defineProperty(Object.getPrototypeOf(navigator), 'plugins', {
          get: function() { return pluginArray; },
          enumerable: true,
          configurable: true
        });
      }
    } catch (_) {}

    // 4. Intercept file drops to prevent browser from inserting file path into prompt textareas
    window.addEventListener('dragover', function(e) {
      if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    }, true);

    window.addEventListener('drop', function(e) {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        e.preventDefault();
        e.stopPropagation();

        var fileInput = document.querySelector('input[type="file"]');
        if (fileInput) {
          try {
            fileInput.files = e.dataTransfer.files;
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            fileInput.dispatchEvent(new Event('input', { bubbles: true }));
          } catch (_) {}
        }
      }
    }, true);

  } catch (err) {
    // Fail silently so as not to break page loading
  }
})();
`

// Prevent duplicate initialization if both session.setPreloads and webPreferences.preload load viewPreload.cjs
const __wbShouldInitPreload = !(window as any).__workbenchViewPreloadInitialized
if (__wbShouldInitPreload) {
  ;(window as any).__workbenchViewPreloadInitialized = true
}

try {
  if (__wbShouldInitPreload) {
    webFrame.executeJavaScriptInIsolatedWorld(0, [{ code: injectionCode }])
  }
} catch (err) {
  console.error('[viewPreload] Failed to inject emulation script:', err)
}

// =========================================================================
// Modular Section: Drag & Drop and File Paste Interceptor
// Intercepts file drops/pastes on guest chat pages (ChatGPT / Claude)
// to prevent Chromium from pasting raw text paths into the textarea,
// and ensures the file is uploaded to the chatbot.
// =========================================================================
try {
  if (__wbShouldInitPreload) {
    window.addEventListener('dragover', (e: DragEvent) => {
    if (e.dataTransfer) {
      const types = Array.from(e.dataTransfer.types || [])
      if (types.includes('Files') || types.includes('application/x-workbench-file')) {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }
    }
  }, true)

  window.addEventListener('drop', (e: DragEvent) => {
    // Intercept drops with files or workbench file tags
    const hasFiles = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0
    const hasWbFile = e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('application/x-workbench-file')

    if (hasFiles || hasWbFile) {
      e.preventDefault()
      e.stopPropagation()

      let filePath = ''
      let fileName = ''
      if (hasFiles && e.dataTransfer!.files[0]) {
        const file = e.dataTransfer!.files[0]
        fileName = file.name
        filePath = (file as any).path || ''
      }

      try {
        ipcRenderer.send('workbench:chatview-file-dropped', {
          fileName,
          filePath,
        })
      } catch (_) {}
    }
  }, true)

  // Single-File Staging Tracker:
  // When a file is copied in NoteView, main process signals 'workbench:staged-file-copied'.
  // When the user pastes in ChatView, this intercepts the paste, blocks any stale files
  // lingering in the OS clipboard from being pasted by the web page, and uploads only
  // the exact single file from the latest copy event.
  let hasPendingWorkbenchFile = false

  ipcRenderer.on('workbench:staged-file-copied', () => {
    hasPendingWorkbenchFile = true
  })

  window.addEventListener('paste', (e: ClipboardEvent) => {
    if (hasPendingWorkbenchFile) {
      e.preventDefault()
      e.stopImmediatePropagation()
      hasPendingWorkbenchFile = false

      try {
        ipcRenderer.send('workbench:chatview-file-pasted', {})
      } catch (_) {}
    }
  }, true)
  }
} catch (_) {}

// =========================================================================
// Modular Section: Workbench Action Observer
// Watches the chat DOM in real-time for ```workbench:action code blocks,
// extracts the JSON payload, and routes it to Workbench ActionDispatcher.
// =========================================================================
try {
  (function initWorkbenchActionObserver() {
    if (!__wbShouldInitPreload) return
    if (typeof window === 'undefined' || typeof document === 'undefined') return

    let actionModeEnabled = true
    let userExplicitlyDisabled = false
    try {
      ipcRenderer.invoke('workbench:get-action-mode').then((res) => {
        if (res && typeof res.enabled === 'boolean') {
          actionModeEnabled = res.enabled
          if (!res.enabled) userExplicitlyDisabled = true
          checkPrimedStatus()
        }
      }).catch(() => {})

      ipcRenderer.on('workbench:action-mode-changed', (_e, dataOrBool: any) => {
        const enabled = typeof dataOrBool === 'boolean' ? dataOrBool : Boolean(dataOrBool?.enabled)
        actionModeEnabled = enabled
        userExplicitlyDisabled = !enabled
        checkPrimedStatus()
        if (enabled) {
          scanForActions()
        }
      })
    } catch (_) {}

    let isAiChatView = false
    try {
      ipcRenderer.invoke('workbench:is-ai-view').then((res) => {
        if (res === true) {
          isAiChatView = true
          scanForActions()
          checkPrimedStatus()
        }
      }).catch(() => {})

      ipcRenderer.on('workbench:set-view-role', (_e, role) => {
        if (role === 'ai') {
          isAiChatView = true
          scanForActions()
          checkPrimedStatus()
        }
      })

      ipcRenderer.on('workbench:action-result-ready', (_e, data) => {
        renderActionResultCard(data)
      })

      ipcRenderer.on('workbench:action-feedback-submitted', (_e, data) => {
        handleActionFeedbackSubmitted(data)
      })
    } catch (_) {}

    function escapeHtml(str: any): string {
      if (!str) return ''
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
    }

    function renderActionResultCard(data: {
      actionId?: string
      actionType: string
      payload: any
      result: any
      feedbackText: string
      turnCount?: number
      canContinue?: boolean
      stagnationReason?: string
    }) {
      try {
        const actionId = data.actionId
        if (actionId && document.querySelector(`.workbench-action-result-card[data-action-id="${actionId}"]`)) {
          return
        }

        // Find corresponding badge
        let badge: HTMLElement | null = null
        if (actionId) {
          badge = document.querySelector(`.workbench-action-badge[data-action-id="${actionId}"]`)
        }
        if (!badge) {
          // Check shadow roots of code-block custom elements
          const customBlocks = document.querySelectorAll('code-block, [class*="code-block"]')
          for (const block of customBlocks) {
            if ((block as any).shadowRoot) {
              const sb = (block as any).shadowRoot.querySelector(
                actionId ? `.workbench-action-badge[data-action-id="${actionId}"]` : '.workbench-action-badge'
              )
              if (sb) {
                badge = sb as HTMLElement
                break
              }
            }
          }
        }
        if (!badge) {
          const badges = document.querySelectorAll('.workbench-action-badge')
          if (badges.length > 0) {
            badge = badges[badges.length - 1] as HTMLElement
          }
        }

        const isSuccess = Boolean(data.result?.success)
        const actionType = data.actionType || data.payload?.action || 'action'
        const targetParam =
          data.payload?.path ||
          data.payload?.folderName ||
          data.payload?.filePath ||
          data.payload?.targetDirectory ||
          data.payload?.text ||
          data.payload?.command ||
          data.payload?.scope ||
          (data.payload?.id !== undefined ? `#${data.payload.id}` : '') ||
          data.result?.createdPath ||
          ''

        // Update badge appearance & status label
        if (badge) {
          const statusSpan = badge.querySelector('.wb-badge-status')
          if (statusSpan) {
            statusSpan.textContent = isSuccess ? 'Executed' : 'Failed'
          }
          if (isSuccess) {
            badge.style.background = 'rgba(16,185,129,0.12)'
            badge.style.borderColor = 'rgba(16,185,129,0.3)'
            badge.style.color = '#34d399'
            const nameSpan = badge.querySelector('span[style*="font-weight:600"]') as HTMLElement
            if (nameSpan) nameSpan.style.color = '#10b981'
          } else {
            badge.style.background = 'rgba(239,68,68,0.12)'
            badge.style.borderColor = 'rgba(239,68,68,0.3)'
            badge.style.color = '#f87171'
            const nameSpan = badge.querySelector('span[style*="font-weight:600"]') as HTMLElement
            if (nameSpan) nameSpan.style.color = '#ef4444'
          }
        }

        // Prepare human-readable result text
        let outputPreview = ''
        if (data.result?.message) {
          outputPreview += data.result.message
        }
        if (data.result?.createdPath) {
          outputPreview += `\nTarget: ${data.result.createdPath}`
        }
        if (data.result?.details?.folders || data.result?.details?.files) {
          const folders = data.result.details.folders || []
          const files = data.result.details.files || []
          outputPreview += `\n\nFolders (${folders.length}):\n${folders.map((f: string) => '  📁 ' + f).join('\n') || '  (none)'}`
          outputPreview += `\n\nFiles (${files.length}):\n${files.map((f: string) => '  📄 ' + f).join('\n') || '  (none)'}`
        }
        if (data.result?.details?.content) {
          let c = String(data.result.details.content)
          if (c.length > 5000) c = c.slice(0, 5000) + `\n... [truncated ${c.length} chars]`
          outputPreview += `\n\nContent:\n${c}`
        }
        if (data.result?.details?.stdout && !outputPreview.includes(data.result.details.stdout)) {
          let s = String(data.result.details.stdout)
          if (s.length > 8000) s = s.slice(0, 8000) + `\n... [truncated ${s.length} chars]`
          outputPreview += `\n\n${s}`
        }
        if (!isSuccess && data.result?.error) {
          outputPreview += `\nError Details: ${data.result.error}`
        }
        if (!outputPreview.trim()) {
          outputPreview = data.feedbackText || (isSuccess ? 'Action completed successfully.' : 'Action failed.')
        }

        // Build the in-chat Result Card
        const card = document.createElement('div')
        card.className = 'workbench-action-result-card'
        if (actionId) card.setAttribute('data-action-id', actionId)
        card.style.cssText = `
          display: flex;
          flex-direction: column;
          margin: 8px 0 16px 0;
          padding: 14px 16px;
          background: #0f172a;
          border: 1px solid ${isSuccess ? 'rgba(16, 185, 129, 0.45)' : 'rgba(239, 68, 68, 0.45)'};
          border-radius: 8px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.45);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          transition: all 0.2s ease;
          position: relative;
          z-index: 100;
        `

        // Header
        const header = document.createElement('div')
        header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;'
        setSafeInnerHTML(
          header,
          `
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:13px;">${isSuccess ? '✅' : '❌'}</span>
            <span style="font-weight:600;font-size:12px;color:${isSuccess ? '#34d399' : '#f87171'};">
              ${escapeHtml(actionType)} Result
            </span>
            ${targetParam ? `<span style="color:#94a3b8;font-size:11px;font-family:monospace;">(${escapeHtml(targetParam)})</span>` : ''}
          </div>
          <span style="font-size:10px;font-weight:600;text-transform:uppercase;padding:2px 8px;border-radius:12px;background:${isSuccess ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'};color:${isSuccess ? '#10b981' : '#ef4444'};border:1px solid ${isSuccess ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'};">
            ${isSuccess ? 'Success' : 'Failed'}
          </span>
        `
        )
        card.appendChild(header)

        // Body (scrollable preview)
        const bodyBox = document.createElement('div')
        bodyBox.style.cssText = `
          background: rgba(0, 0, 0, 0.45);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 6px;
          padding: 10px 12px;
          margin-bottom: 10px;
          max-height: 220px;
          overflow-y: auto;
          font-family: "JetBrains Mono", "Fira Code", Consolas, monospace;
          font-size: 11.5px;
          line-height: 1.5;
          color: #e2e8f0;
          white-space: pre-wrap;
          word-break: break-word;
        `
        bodyBox.textContent = outputPreview
        card.appendChild(bodyBox)

        // Footer with action button
        const footer = document.createElement('div')
        footer.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;'

        const hintText = document.createElement('div')
        hintText.style.cssText = 'font-size:11px;color:#94a3b8;'
        if (data.canContinue === false) {
          hintText.style.color = '#fbbf24'
          hintText.textContent = `⚠️ ${data.stagnationReason || 'Action cycle detected. Check before continuing.'}`
        } else {
          hintText.textContent = isSuccess ? 'Output ready. Click to proceed.' : 'Error recorded. Click to submit error to AI.'
        }
        footer.appendChild(hintText)

        const continueBtn = document.createElement('button')
        continueBtn.className = 'wb-continue-step-btn'
        continueBtn.style.cssText = `
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 16px;
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: #ffffff;
          border: none;
          border-radius: 6px;
          font-weight: 600;
          font-size: 12px;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(16, 185, 129, 0.35);
          transition: all 0.15s ease;
          user-select: none;
          white-space: nowrap;
        `
        setSafeInnerHTML(continueBtn, `<span>▶</span><span>Continue to Next Step</span>`)

        continueBtn.addEventListener('mouseenter', () => {
          if (!continueBtn.disabled) {
            continueBtn.style.filter = 'brightness(1.1)'
            continueBtn.style.transform = 'translateY(-1px)'
          }
        })
        continueBtn.addEventListener('mouseleave', () => {
          continueBtn.style.filter = 'none'
          continueBtn.style.transform = 'none'
        })

        continueBtn.addEventListener('click', (e) => {
          e.stopPropagation()
          if (continueBtn.disabled) return

          continueBtn.disabled = true
          continueBtn.style.cursor = 'default'
          continueBtn.style.opacity = '0.75'
          setSafeInnerHTML(continueBtn, `<span>⏳</span><span>Submitting to AI...</span>`)

          ipcRenderer.send('workbench:submit-action-feedback', {
            actionId,
            feedbackText: data.feedbackText,
          })
        })

        footer.appendChild(continueBtn)
        card.appendChild(footer)

        // Resilient 4-tier DOM insertion guarantee
        let inserted = false

        // Strategy 1: Insert right after badge in light DOM
        if (badge && badge.parentNode && badge.getRootNode() === document) {
          try {
            if (badge.nextSibling) {
              badge.parentNode.insertBefore(card, badge.nextSibling)
            } else {
              badge.parentNode.appendChild(card)
            }
            inserted = true
          } catch (_) {}
        }

        // Strategy 2: If badge was inside shadow root or custom element, insert after host
        if (!inserted && badge) {
          const host =
            ((badge.getRootNode && (badge.getRootNode() as any).host) || badge.closest('code-block')) as HTMLElement | null
          if (host && host.parentNode) {
            try {
              if (host.nextSibling) {
                host.parentNode.insertBefore(card, host.nextSibling)
              } else {
                host.parentNode.appendChild(card)
              }
              inserted = true
            } catch (_) {}
          }
        }

        // Strategy 3: Insert after the code block in the latest assistant container
        if (!inserted) {
          const assistantTurn = getLatestAssistantContainer()
          if (assistantTurn) {
            try {
              const codeBlock = assistantTurn.querySelector(
                'code-block:last-of-type, pre:last-of-type, [class*="code-block"]:last-of-type'
              )
              if (codeBlock && codeBlock.parentNode) {
                codeBlock.parentNode.insertBefore(card, codeBlock.nextSibling)
                inserted = true
              } else {
                assistantTurn.appendChild(card)
                inserted = true
              }
            } catch (_) {}
          }
        }

        // Strategy 4: Fallback to document main or body
        if (!inserted) {
          const fallbackContainer =
            document.querySelector(
              'model-response:last-of-type, [data-message-author-role="assistant"]:last-of-type, main, [role="main"]'
            ) || document.body
          if (fallbackContainer) {
            fallbackContainer.appendChild(card)
            inserted = true
          }
        }

        if (inserted) {
          try {
            card.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          } catch (_) {}
        }
      } catch (err) {
        console.warn('[AIView:ResultCard] Error rendering action result card:', err)
      }
    }

    function handleActionFeedbackSubmitted(data: { actionId?: string; submitted?: boolean }) {
      try {
        const card = data.actionId
          ? document.querySelector(`.workbench-action-result-card[data-action-id="${data.actionId}"]`)
          : null
        const btn = card
          ? (card.querySelector('.wb-continue-step-btn') as HTMLButtonElement)
          : (document.querySelector('.wb-continue-step-btn:last-of-type') as HTMLButtonElement)
        if (btn) {
          btn.disabled = true
          btn.style.cursor = 'default'
          btn.style.background = 'rgba(16, 185, 129, 0.2)'
          btn.style.color = '#34d399'
          btn.style.border = '1px solid rgba(16, 185, 129, 0.4)'
          btn.style.boxShadow = 'none'
          btn.style.opacity = '1'
          setSafeInnerHTML(btn, `<span>✓</span><span>Next Step Submitted</span>`)
        }
      } catch (_) {}
    }

    function isChatSite(): boolean {
      if (isAiChatView) return true
      const host = (window.location?.hostname || '').toLowerCase()
      if (!host) return false
      return (
        host.includes('chatgpt') ||
        host.includes('openai') ||
        host.includes('claude') ||
        host.includes('anthropic') ||
        host.includes('gemini') ||
        host.includes('perplexity') ||
        host.includes('deepseek') ||
        host.includes('grok') ||
        host.includes('x.ai') ||
        host.includes('copilot') ||
        host.includes('microsoft') ||
        host.includes('poe') ||
        host.includes('mistral') ||
        host.includes('localhost') ||
        host.includes('127.0.0.1')
      )
    }

    const executedElements = new WeakSet<HTMLElement>()
    const executedActionTimestamps: Map<string, number> =
      (window as any).__wbExecutedActionTimestamps ||
      ((window as any).__wbExecutedActionTimestamps = new Map<string, number>())

    let isUserCancelled = false
    let lastCancelTimestamp = 0

    function getLatestAssistantContainer(): HTMLElement | null {
      const host = (window.location?.hostname || '').toLowerCase()
      const selectors = host.includes('gemini')
        ? [
            'model-response',
            '.model-response-text',
            'message-content',
            '[data-message-author-role="assistant"]',
            'div[data-is-streaming]',
            '[data-is-streaming]',
          ]
        : [
            '[data-message-author-role="assistant"]',
            'div.font-claude-message',
            '.font-claude-message',
            '.standard-markdown',
            'div[class*="font-claude"]',
            'div[class*="message"][class*="assistant"]',
            'div[data-is-streaming]',
            '[data-is-streaming]',
            'model-response',
            '.model-response-text',
            'div[data-testid*="assistant-message"]',
            'div[data-testid="chat-message-assistant"]',
            'article[data-testid*="conversation-turn"]:has([data-message-author-role="assistant"])',
            'div[class*="chat-message"][class*="assistant"]',
            'div[class*="response-message"]',
            'div[class*="ChatMessage"][data-role="assistant"]'
          ]
      for (const sel of selectors) {
        try {
          const nodes = document.querySelectorAll(sel)
          if (nodes && nodes.length > 0) {
            return nodes[nodes.length - 1] as HTMLElement
          }
        } catch (_) {}
      }

      // Check articles / conversation turns
      try {
        const turns = document.querySelectorAll('article, div[data-testid*="conversation-turn"], div[class*="conversation-item"]')
        if (turns && turns.length > 0) {
          const lastTurn = turns[turns.length - 1] as HTMLElement
          if (
            !lastTurn.querySelector('[data-message-author-role="user"]') &&
            !lastTurn.querySelector('.font-user-message') &&
            !lastTurn.querySelector('[data-user-message="true"]') &&
            !lastTurn.classList.contains('font-user-message')
          ) {
            return lastTurn
          }
        }
      } catch (_) {}

      // Claude fallback: find the last container holding code/pre blocks that is not a user message
      try {
        const allCode = document.querySelectorAll('pre, code-block, [class*="code-block"]')
        if (allCode && allCode.length > 0) {
          for (let i = allCode.length - 1; i >= 0; i--) {
            const el = allCode[i] as HTMLElement
            if (
              !el.closest('[data-message-author-role="user"]') &&
              !el.closest('.font-user-message') &&
              !el.closest('[data-user-message="true"]') &&
              !el.closest('#prompt-textarea') &&
              !el.closest('form')
            ) {
              return el.closest('div.grid, [class*="message"], article') || el
            }
          }
        }
      } catch (_) {}

      return null
    }

    function extractActionsFromText(fullText: string): Array<{ payload: any; raw: string; error?: string }> {
      const actions: Array<{ payload: any; raw: string; error?: string }> = []
      if (!fullText || fullText.length < 10) return actions

      let depth = 0
      let startIdx = -1
      let inString = false
      let escape = false

      for (let i = 0; i < fullText.length; i++) {
        const ch = fullText[i]
        if (inString) {
          if (escape) {
            escape = false
          } else if (ch === '\\') {
            escape = true
          } else if (ch === '"') {
            inString = false
          }
        } else {
          if (ch === '"' && depth > 0) {
            inString = true
          } else if (ch === '{') {
            if (depth === 0) startIdx = i
            depth++
          } else if (ch === '}') {
            depth--
            if (depth === 0 && startIdx !== -1) {
              const candidate = fullText.substring(startIdx, i + 1).trim()
              if (candidate.length > 500000) {
                actions.push({ payload: null, raw: candidate.slice(0, 1000), error: 'Action payload exceeds 500 KB limit' })
              } else {
                try {
                  let parsed: any = null
                  try {
                    parsed = JSON.parse(candidate)
                  } catch (parseErr: any) {
                    // Fallback: fix unescaped backslashes in Windows paths (e.g. \O, \D, \0)
                    const sanitized = candidate.replace(/\\(?!["\\/bfnrtu]|u[0-9a-fA-F]{4})/g, '\\\\')
                    try {
                      parsed = JSON.parse(sanitized)
                    } catch (_) {
                      if (candidate.includes('"action"') || candidate.includes('"type"')) {
                        actions.push({ payload: null, raw: candidate, error: `Malformed JSON: ${parseErr?.message || 'Syntax error'}` })
                      }
                    }
                  }
                  if (parsed && typeof parsed === 'object' && (parsed.action || parsed.type)) {
                    actions.push({ payload: parsed, raw: candidate })
                  }
                } catch (e: any) {
                  if (candidate.includes('"action"') || candidate.includes('"type"')) {
                    actions.push({ payload: null, raw: candidate, error: `Parse error: ${e?.message || 'Unknown error'}` })
                  }
                }
              }
              startIdx = -1
            }
          }
        }
      }

      if (depth > 0 && startIdx !== -1) {
        const trailing = fullText.substring(startIdx).trim()
        if (trailing.includes('"action"') || trailing.includes('"type"') || fullText.includes('workbench:action')) {
          actions.push({ payload: null, raw: trailing, error: 'Incomplete or unclosed JSON block' })
        }
      }

      return actions
    }

    function isSafeAssistantBlock(el: HTMLElement): boolean {
      if (!el) return false
      // A. Skip hidden elements or hidden action prompt bubbles
      if (el.classList.contains('wb-hidden-action-prompt') || el.closest('.wb-hidden-action-prompt')) {
        return false
      }
      const isShadowChild = Boolean(el.getRootNode && el.getRootNode() !== document)
      if (!isShadowChild && el.offsetParent === null && el.tagName !== 'BODY') {
        const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 0, height: 0 }
        if (rect.width === 0 && rect.height === 0) return false
      }
      try {
        if (window.getComputedStyle(el).display === 'none') return false
      } catch (_) {}

      // B. Skip input forms, textareas, and contenteditables across all platforms
      if (
        el.closest('#prompt-textarea') ||
        el.closest('form') ||
        el.closest('[contenteditable="true"]') ||
        el.closest('textarea') ||
        el.closest('input') ||
        el.closest('.ql-editor') ||
        el.closest('rich-textarea')
      ) {
        return false
      }

      // C. Skip user messages across all platforms (check ancestors, self, AND descendants)
      if (
        el.closest('[data-message-author-role="user"]') ||
        el.querySelector('[data-message-author-role="user"]') ||
        el.closest('[data-user-message="true"]') ||
        el.querySelector('[data-user-message="true"]') ||
        el.closest('.font-user-message') ||
        el.querySelector('.font-user-message') ||
        el.closest('[data-testid="user-message"]') ||
        el.querySelector('[data-testid="user-message"]') ||
        el.closest('user-query') ||
        el.closest('[class*="user-message"]') ||
        el.closest('[data-is-user="true"]')
      ) {
        return false
      }

      // D. Quarantine system prompt guide text (prevent executing template examples from the initial system prompt)
      const text = el.innerText || el.textContent || ''
      if (
        text.includes('You are integrated with Workbench Desktop') &&
        (text.includes('Operational Directives') ||
          text.includes('Available Actions') ||
          text.includes('Available Workbench Actions') ||
          text.includes('SINGLE-SHOT & UPLOAD CEILING') ||
          text.includes('<folder_name>') ||
          text.includes('<file_path>'))
      ) {
        return false
      }
      if (text.includes('Custom User Instructions') && (text.includes('Available Actions') || text.includes('Available Workbench Actions'))) {
        return false
      }

      // E. Must be inside an AI chat view
      if (!isChatSite()) {
        return false
      }

      return true
    }

    let hideFeedbackTimeout: any = null
    function hideFeedbackBubbles() {
      if (hideFeedbackTimeout) clearTimeout(hideFeedbackTimeout)
      hideFeedbackTimeout = setTimeout(() => {
        try {
          const keywords = [
            '[Workbench Action Result:',
            'You are integrated with Workbench Desktop',
            'Available Workbench Actions'
          ]
          const userTurnSelectors = [
            'user-query',
            '[data-message-author-role="user"]',
            'div[data-testid="user-message"]',
            'div.font-user-message',
            '[data-user-message="true"]',
            '[class*="user-message"]'
          ]
          const candidateElements = document.querySelectorAll(userTurnSelectors.join(', '))
          candidateElements.forEach((el) => {
            const htmlEl = el as HTMLElement
            // Never hide assistant messages or responses!
            if (
              htmlEl.closest('[data-message-author-role="assistant"]') ||
              htmlEl.closest('model-response') ||
              htmlEl.closest('.font-claude-message')
            ) {
              return
            }
            if (htmlEl.getAttribute('data-wb-hidden') === 'true') return
            const text = htmlEl.textContent || ''
            if (keywords.some((k) => text.includes(k))) {
              htmlEl.setAttribute('data-wb-hidden', 'true')
              htmlEl.style.display = 'none'
            }
          })
        } catch (_) {}
      }, 250)
    }

    function checkAndExecuteAction(containerEl: HTMLElement) {
      if (!actionModeEnabled) return
      if (!isChatSite()) return
      if (isUserCancelled && Date.now() - lastCancelTimestamp < 15000) {
        return
      }
      if (
        containerEl.getAttribute('data-workbench-executed') === 'true' ||
        containerEl.getAttribute('data-workbench-cancelled') === 'true' ||
        executedElements.has(containerEl) ||
        containerEl.closest('[data-workbench-executed="true"]') ||
        containerEl.closest('[data-workbench-cancelled="true"]') ||
        containerEl.parentElement?.querySelector('.workbench-action-badge')
      ) {
        return
      }

      if (!isSafeAssistantBlock(containerEl)) {
        return
      }

      const rawText = (containerEl.innerText || containerEl.textContent || '').trim()
      if (!rawText || rawText.length < 10) return

      if (
        !rawText.includes('workbench:action') &&
        !rawText.includes('create_folder') &&
        !rawText.includes('write_file') &&
        !rawText.includes('"action"') &&
        !rawText.includes('"type"')
      ) {
        return
      }

      let extracted = extractActionsFromText(rawText)
      if (extracted.length === 0) {
        if (
          rawText.includes('workbench:action') ||
          (rawText.startsWith('{') && rawText.includes('"action"') && rawText.length > 20)
        ) {
          extracted = [{ payload: null, raw: rawText, error: 'Malformed action block: invalid JSON syntax or unclosed structure' }]
        } else {
          return
        }
      }

      // If the block is still actively streaming / unclosed and has no complete JSON payload yet,
      // wait for streaming to finish instead of prematurely marking the element as executed!
      const validActions = extracted.filter((item) => item.payload && !item.error)
      const hasIncompleteError = extracted.some((item) => item.error === 'Incomplete or unclosed JSON block')
      if (validActions.length === 0 && hasIncompleteError) {
        const nowMs = Date.now()
        const firstIncompleteStr = containerEl.getAttribute('data-wb-incomplete-since')
        const firstIncompleteAt = firstIncompleteStr ? parseInt(firstIncompleteStr, 10) : nowMs
        if (!firstIncompleteStr) {
          containerEl.setAttribute('data-wb-incomplete-since', String(nowMs))
        }
        if (nowMs - firstIncompleteAt < 8000) {
          if (scanTimeout) clearTimeout(scanTimeout)
          scanTimeout = setTimeout(scanForActions, 250)
          return
        }
      }

      // Tag container immediately
      executedElements.add(containerEl)
      containerEl.setAttribute('data-workbench-executed', 'true')

      // Target full code wrapper across Gemini, Claude, ChatGPT, Grok, etc.
      const targetBox: HTMLElement | null =
        (containerEl.closest('code-block') as HTMLElement) ||
        (containerEl.closest('pre') as HTMLElement) ||
        (containerEl.closest('[class*="code-container"]') as HTMLElement) ||
        (containerEl.closest('[class*="code-block"]') as HTMLElement) ||
        (containerEl.closest('div.rounded-md') && containerEl.closest('div.rounded-md')?.querySelector('code')
          ? (containerEl.closest('div.rounded-md') as HTMLElement)
          : null) ||
        containerEl

      if (targetBox) {
        executedElements.add(targetBox)
        targetBox.setAttribute('data-workbench-executed', 'true')
        targetBox.querySelectorAll('code, pre').forEach((c) => {
          executedElements.add(c as HTMLElement)
          c.setAttribute('data-workbench-executed', 'true')
        })
      }

      const now = Date.now()
      for (const [h, t] of executedActionTimestamps.entries()) {
        if (now - t > 30000) executedActionTimestamps.delete(h)
      }

      for (const item of extracted) {
        if (item.error || !item.payload) {
          try {
            const badge = document.createElement('div')
            badge.className = 'workbench-action-badge workbench-action-error-badge'
            badge.style.cssText =
              'display:flex;align-items:center;justify-content:space-between;padding:6px 12px;margin:6px 0;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.35);border-radius:6px;font-size:12px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#f87171;font-weight:500;cursor:pointer;user-select:none;transition:all 0.15s ease;'
            badge.title = 'Click to show / hide raw block'
            setSafeInnerHTML(
              badge,
              `
              <div style="display:flex;align-items:center;gap:6px;">
                <span style="font-size:13px;">⚠️</span>
                <span style="font-weight:600;color:#ef4444;">Workbench Action Error:</span>
                <span style="color:#fca5a5;font-size:11px;">${escapeHtml(item.error || 'Action parsing failed')}</span>
              </div>
              <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#fca5a5;">
                <span class="wb-badge-arrow" style="font-size:9px;opacity:0.7;">▼</span>
              </div>
            `
            )
            const collapseTarget = targetBox || containerEl
            badge.addEventListener('click', () => {
              const isHidden = collapseTarget.style.display === 'none'
              collapseTarget.style.display = isHidden ? 'block' : 'none'
              const arrow = badge.querySelector('.wb-badge-arrow')
              if (arrow) arrow.textContent = isHidden ? '▲' : '▼'
            })
            if (collapseTarget.parentNode && !collapseTarget.parentNode.querySelector('.workbench-action-error-badge')) {
              collapseTarget.parentNode.insertBefore(badge, collapseTarget)
            }
          } catch (_) {}
          continue
        }

        const payloadHash = JSON.stringify(item.payload)
        const lastRan = executedActionTimestamps.get(payloadHash)
        if (lastRan && now - lastRan < 15000) {
          continue
        }
        executedActionTimestamps.set(payloadHash, now)

        const actionName = item.payload.action || item.payload.type || 'unknown'
        const actionId = 'wb-act-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8)
        item.payload.__wbActionId = actionId

        console.log(`[Workbench Bridge:DOM] Action detected in chat DOM: "${actionName}" (ID: ${actionId}) -> Dispatching to main process:`, item.payload)

        // Send to main process
        ipcRenderer.send('workbench:action-triggered', item.payload)

        // Inject sleek collapsible tool badge & auto-collapse raw JSON code block
        try {
          const actionType = item.payload.action || item.payload.type || 'action'
          const actionParam =
            item.payload.path ||
            item.payload.folderName ||
            item.payload.filePath ||
            item.payload.targetDirectory ||
            item.payload.text ||
            item.payload.command ||
            item.payload.scope ||
            (item.payload.id !== undefined ? `#${item.payload.id}` : '') ||
            '.'
          const badge = document.createElement('div')
          badge.className = 'workbench-action-badge'
          badge.setAttribute('data-action-id', actionId)
          badge.style.cssText =
            'display:flex;align-items:center;justify-content:space-between;padding:4px 10px;margin:6px 0;background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.3);border-radius:6px;font-size:12px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#60a5fa;font-weight:500;cursor:pointer;user-select:none;transition:all 0.15s ease;'
          badge.title = 'Click to show / hide raw action JSON'
          setSafeInnerHTML(
            badge,
            `
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="font-size:12px;">⚡</span>
              <span style="font-weight:600;color:#3b82f6;">${escapeHtml(actionType)}</span>
              <span style="color:#94a3b8;font-size:11px;font-family:monospace;">(${escapeHtml(actionParam)})</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#93c5fd;">
              <span class="wb-badge-status">Running...</span>
              <span class="wb-badge-arrow" style="font-size:9px;opacity:0.7;">▼</span>
            </div>
          `
          )

          const collapseTarget = targetBox || containerEl
          collapseTarget.style.display = 'none'
          badge.addEventListener('click', () => {
            const isHidden = collapseTarget.style.display === 'none'
            collapseTarget.style.display = isHidden ? 'block' : 'none'
            const arrow = badge.querySelector('.wb-badge-arrow')
            if (arrow) arrow.textContent = isHidden ? '▲' : '▼'
          })
          if (collapseTarget.parentNode) {
            collapseTarget.parentNode.insertBefore(badge, collapseTarget)
          }
        } catch (_) {}
      }
    }

    function isStreamingActive(): boolean {
      try {
        function isVisibleElement(el: HTMLElement | null): el is HTMLElement {
          if (!el || (el as any).disabled || el.getAttribute('aria-disabled') === 'true' || el.getAttribute('aria-hidden') === 'true') {
            return false
          }
          const rect = el.getBoundingClientRect()
          if (rect.width <= 0 || rect.height <= 0) return false
          const style = window.getComputedStyle(el)
          return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
        }

        // 1. Check for active Stop buttons FIRST (on Gemini, Stop button has class "send-button stop")
        const stopSelectors = [
          'button.send-button.stop',
          'button[data-testid="stop-button"]',
          'button[aria-label*="Stop generating" i]',
          'button[aria-label*="Stop Response" i]',
          'button[aria-label*="Stop streaming" i]',
          'form button[aria-label="Stop" i]',
          'rich-textarea ~ * button[aria-label="Stop" i]',
          '.chat-input button[aria-label="Stop" i]',
          '[class*="input"] button[aria-label="Stop" i]'
        ]
        for (const sel of stopSelectors) {
          const btn = document.querySelector(sel) as HTMLElement | null
          if (isVisibleElement(btn)) {
            const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase()
            if (
              ariaLabel.includes('read') ||
              ariaLabel.includes('voice') ||
              ariaLabel.includes('speech') ||
              ariaLabel.includes('audio') ||
              ariaLabel.includes('listen')
            ) {
              continue
            }
            return true
          }
        }

        // 2. If Send/Submit button is visible, active, and NOT in stop mode, the AI turn has finished.
        const sendSelectors = [
          'button[aria-label*="Send" i]',
          'button[data-testid="send-button"]',
          'button[aria-label*="Submit" i]',
          'button.send-button:not(.stop)'
        ]
        for (const sel of sendSelectors) {
          const btn = document.querySelector(sel) as HTMLElement | null
          if (isVisibleElement(btn)) {
            const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase()
            if (!ariaLabel.includes('stop') && !btn.classList.contains('stop')) {
              return false
            }
          }
        }

        // 3. Check for streaming indicator strictly on the latest assistant turn
        const targetContainer = getLatestAssistantContainer()
        if (targetContainer) {
          if (
            targetContainer.matches('.result-streaming, [data-is-streaming="true"], .streaming') ||
            targetContainer.querySelector('.result-streaming, [data-is-streaming="true"], .cursor-blinking, .streaming')
          ) {
            return true
          }
        }
      } catch (_) {}
      return false
    }

    let scanTimeout: any = null
    function scanForActions() {
      if (!actionModeEnabled) return
      if (!isChatSite()) return
      if (scanTimeout) clearTimeout(scanTimeout)
      scanTimeout = setTimeout(() => {
        // If user cancelled recently, drop actions from aborted turn
        if (isUserCancelled && Date.now() - lastCancelTimestamp < 15000) {
          const targetContainer = getLatestAssistantContainer()
          if (targetContainer) {
            targetContainer.setAttribute('data-workbench-cancelled', 'true')
            targetContainer.querySelectorAll('code, pre, code-block, [class*="code-block"]').forEach((c) => {
              c.setAttribute('data-workbench-cancelled', 'true')
              c.setAttribute('data-workbench-executed', 'true')
            })
          }
          return
        }

        // Defer action execution if AI is actively streaming response tokens
        if (isStreamingActive()) {
          try {
            const targetContainer = getLatestAssistantContainer() || document
            const codeElements = targetContainer.querySelectorAll('code-block, pre, code, [class*="code-container"], [class*="code-block"]')
            codeElements.forEach((el) => {
              const htmlEl = el as HTMLElement
              if (htmlEl.getAttribute('data-workbench-executed') === 'true') return
              const txt = (htmlEl.innerText || htmlEl.textContent || '').trim()
              if (txt.includes('workbench:action') || (txt.includes('"action"') && txt.length > 30)) {
                let streamBadge = htmlEl.parentElement?.querySelector('.wb-streaming-badge') as HTMLElement | null
                const sizeKb = (txt.length / 1024).toFixed(1)
                if (!streamBadge) {
                  streamBadge = document.createElement('div')
                  streamBadge.className = 'wb-streaming-badge'
                  streamBadge.style.cssText =
                    'display:inline-flex;align-items:center;gap:6px;padding:3px 8px;margin:4px 0;background:rgba(59,130,246,0.1);border:1px dashed rgba(59,130,246,0.4);border-radius:4px;font-size:11px;font-family:sans-serif;color:#60a5fa;'
                  if (htmlEl.parentNode) {
                    htmlEl.parentNode.insertBefore(streamBadge, htmlEl)
                  }
                }
                if (streamBadge.getAttribute('data-kb') !== sizeKb) {
                  streamBadge.setAttribute('data-kb', sizeKb)
                  setSafeInnerHTML(streamBadge, `<span style="animation:pulse 1s infinite;">⚡</span> Receiving action (${sizeKb} KB)...`)
                }
              }
            })
          } catch (_) {}
          scanTimeout = setTimeout(scanForActions, 300)
          return
        } else {
          try {
            document.querySelectorAll('.wb-streaming-badge').forEach((b) => b.remove())
          } catch (_) {}
        }

        const targetContainer = getLatestAssistantContainer()
        if (targetContainer) {
          // If container has stopped or cancelled indicators, skip it
          if (
            targetContainer.getAttribute('data-workbench-cancelled') === 'true' ||
            targetContainer.querySelector('[data-workbench-cancelled="true"]') ||
            targetContainer.querySelector('.result-stopped') ||
            targetContainer.getAttribute('data-is-stopped') === 'true'
          ) {
            return
          }
        }

        const searchScope =
          (targetContainer &&
            ((targetContainer.closest &&
              targetContainer.closest(
                'model-response, message-content, article, [data-testid*="conversation-turn"], .conversation-container'
              )) ||
              targetContainer)) ||
          document
        const codeQuery =
          'code-block, pre, code, [class*="code-container"], [class*="code-block"], div[class*="overflow-y-auto"] code, [class*="language-workbench"]'
        let codeElements: HTMLElement[] = []
        searchScope.querySelectorAll(codeQuery).forEach((el) => {
          codeElements.push(el as HTMLElement)
          if ((el as any).shadowRoot) {
            try {
              (el as any).shadowRoot.querySelectorAll('pre, code, div').forEach((s: any) => codeElements.push(s))
            } catch (_) {}
          }
        })

        // Fallback: If narrowed searchScope found 0 code elements, search latest assistant containers across document
        if (codeElements.length === 0 && searchScope !== document) {
          document
            .querySelectorAll(`model-response ${codeQuery}, [data-message-author-role="assistant"] ${codeQuery}`)
            .forEach((el) => {
              codeElements.push(el as HTMLElement)
            })
        }

        codeElements.forEach((el) => {
          checkAndExecuteAction(el)
        })
      }, 150)
    }

    let lastReportedPrimed: boolean | null = null
    let primeCheckTimeout: any = null

    function checkPrimedStatus() {
      if (!isChatSite()) return
      if (primeCheckTimeout) clearTimeout(primeCheckTimeout)
      primeCheckTimeout = setTimeout(() => {
        try {
          const hasHiddenPrompt = Boolean(document.querySelector('.wb-hidden-action-prompt'))
          const hasBadge = Boolean(document.querySelector('.workbench-action-badge'))
          const text = document.body ? document.body.textContent || '' : ''
          const hasPromptGuide =
            hasHiddenPrompt ||
            hasBadge ||
            text.includes('Connected to Workbench') ||
            text.includes('Connection Status') ||
            text.includes('You are integrated with Workbench') ||
            text.includes('Available Workbench Actions') ||
            text.includes('Available Actions') ||
            text.includes('workbench:action')

          // If the chat conversation already has the prompt guide in its history,
          // ensure action execution is active so existing chats work immediately.
          if (hasPromptGuide && !actionModeEnabled && !userExplicitlyDisabled) {
            actionModeEnabled = true
            ipcRenderer.invoke('workbench:set-action-mode', { enabled: true }).catch(() => {})
          }

          const isPrimed = hasPromptGuide && actionModeEnabled

          if (isPrimed !== lastReportedPrimed) {
            lastReportedPrimed = isPrimed
            ipcRenderer.send('workbench:chat-prime-status-changed', { isPrimed })
          }
        } catch (_) {}
      }, 600)
    }

    function isWorkbenchUiMutationNode(node: Node | null): boolean {
      if (!node || !(node instanceof Element)) return false
      return Boolean(
        node.closest(
          '#wb-chat-status-card, .wb-streaming-badge, .workbench-action-badge, .workbench-action-result-card, #workbench-selection-bubble-host, #wb-chat-cmd-styles'
        )
      )
    }

    // Set up MutationObserver on document
    const observer = new MutationObserver((mutations) => {
      if (
        mutations.length > 0 &&
        mutations.every(
          (m) =>
            isWorkbenchUiMutationNode(m.target) ||
            (m.addedNodes.length > 0 &&
              Array.from(m.addedNodes).every((n) => isWorkbenchUiMutationNode(n)))
        )
      ) {
        return
      }
      scanForActions()
      checkPrimedStatus()
      hideFeedbackBubbles()
    })

    function markHistoricalActions() {
      try {
        const latestAssistant = getLatestAssistantContainer()
        const blocks = document.querySelectorAll(
          'code-block, pre, code, [class*="code-container"], [class*="code-block"], div[class*="overflow-y-auto"] code, [class*="language-workbench"]'
        )
        const now = Date.now()
        blocks.forEach((el) => {
          const htmlEl = el as HTMLElement
          // Never pre-emptively mark code blocks inside the latest assistant turn
          if (latestAssistant && (latestAssistant === htmlEl || latestAssistant.contains(htmlEl))) {
            return
          }
          // Never mark user messages
          if (htmlEl.closest('user-query, [data-message-author-role="user"], [data-user-message="true"]')) {
            return
          }
          const rawText = (htmlEl.innerText || htmlEl.textContent || '').trim()
          if (
            rawText.includes('workbench:action') ||
            rawText.includes('create_folder') ||
            rawText.includes('write_file') ||
            rawText.includes('"action"')
          ) {
            const extracted = extractActionsFromText(rawText)
            for (const item of extracted) {
              const hash = JSON.stringify(item.payload)
              executedActionTimestamps.set(hash, now)
            }
            htmlEl.setAttribute('data-workbench-executed', 'true')
            executedElements.add(htmlEl)
          }
        })
        scanForActions()
      } catch (_) {}
    }

    const attachObserver = () => {
      const rootNode = document.documentElement || document.body
      if (rootNode) {
        observer.observe(rootNode, { childList: true, subtree: true })
      }
      checkPrimedStatus()
      hideFeedbackBubbles()
      setTimeout(markHistoricalActions, 400)
    }

    if (document.body || document.documentElement) {
      attachObserver()
    } else {
      document.addEventListener('DOMContentLoaded', attachObserver)
    }

    window.addEventListener('popstate', checkPrimedStatus)
    try {
      const origPush = history.pushState
      history.pushState = function(...args) {
        const ret = origPush.apply(this, args)
        checkPrimedStatus()
        return ret
      }
      const origReplace = history.replaceState
      history.replaceState = function(...args) {
        const ret = origReplace.apply(this, args)
        checkPrimedStatus()
        return ret
      }
    } catch (_) {}

    // -------------------------------------------------------------------------
    // User Stop / Cancel & New Prompt Interceptors
    // -------------------------------------------------------------------------
    function handleUserCancel(source: string) {
      console.log(`[viewPreload] User cancelled generation via ${source}. Suppressing actions.`)
      isUserCancelled = true
      lastCancelTimestamp = Date.now()
      const targetContainer = getLatestAssistantContainer()
      if (targetContainer) {
        targetContainer.setAttribute('data-workbench-cancelled', 'true')
        targetContainer.querySelectorAll('code, pre, code-block, [class*="code-block"]').forEach((c) => {
          c.setAttribute('data-workbench-cancelled', 'true')
          c.setAttribute('data-workbench-executed', 'true')
        })
      }
      ipcRenderer.send('workbench:user-cancelled-generation')
    }

    function handleUserPromptStart() {
      if (isUserCancelled) {
        console.log('[viewPreload] User submitted new message. Resetting cancellation state.')
      }
      isUserCancelled = false
      ipcRenderer.send('workbench:user-started-prompt')
    }

    // Capture click on native Stop / Cancel generation buttons
    window.addEventListener(
      'click',
      (e: MouseEvent) => {
        try {
          const target = e.target as HTMLElement | null
          if (!target) return
          const btn = target.closest('button')
          if (!btn) return
          const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase()
          const testId = (btn.getAttribute('data-testid') || '').toLowerCase()
          const text = (btn.textContent || '').trim().toLowerCase()

          if (
            testId === 'stop-button' ||
            ariaLabel.includes('stop generating') ||
            ariaLabel.includes('stop response') ||
            ariaLabel.includes('stop streaming') ||
            ariaLabel === 'stop' ||
            ariaLabel.includes('cancel') ||
            text === 'stop generating' ||
            text === 'stop response'
          ) {
            handleUserCancel('Stop button click')
          } else if (
            testId.includes('send') ||
            ariaLabel.includes('send message') ||
            ariaLabel.includes('send prompt')
          ) {
            handleUserPromptStart()
          }
        } catch (_) {}
      },
      true
    )

    // Capture genuine hardware Escape key to abort in-flight actions, and Enter to detect new human prompt
    window.addEventListener(
      'keydown',
      (e: KeyboardEvent) => {
        if (!e.isTrusted) return
        if (e.key === 'Escape') {
          handleUserCancel('Escape key')
        } else if (e.key === 'Enter' && !e.shiftKey) {
          const activeEl = document.activeElement
          if (
            activeEl &&
            (activeEl.tagName === 'TEXTAREA' ||
              activeEl.getAttribute('contenteditable') === 'true' ||
              activeEl.getAttribute('role') === 'textbox')
          ) {
            handleUserPromptStart()
          }
        }
      },
      true
    )

    // Periodic sweep for safety
    setInterval(() => {
      scanForActions()
      checkPrimedStatus()
    }, 1500)
  })()
} catch (_) {}

// =========================================================================
// Modular Section: In-Chat Workbench Commands (/status, /connect, /prime)
// Intercepts /status and /connect commands right in the chat prompt box,
// rendering live connection state and allowing 1-click priming directly in chat.
// =========================================================================
try {
  (function initInChatCommands() {
    if (!__wbShouldInitPreload) return
    if (typeof window === 'undefined' || typeof document === 'undefined') return

    function isChatSite(): boolean {
      const host = (window.location?.hostname || '').toLowerCase()
      if (!host) return true
      return (
        host.includes('chatgpt') ||
        host.includes('openai') ||
        host.includes('claude') ||
        host.includes('anthropic') ||
        host.includes('gemini') ||
        host.includes('perplexity') ||
        host.includes('deepseek') ||
        host.includes('grok') ||
        host.includes('copilot') ||
        host.includes('localhost') ||
        host.includes('127.0.0.1')
      )
    }

    let isActionModeGloballyEnabled = true
    let isChatPrimedStatus = false
    try {
      ipcRenderer.on('workbench:action-mode-changed', (_e, dataOrBool: any) => {
        const enabled = typeof dataOrBool === 'boolean' ? dataOrBool : Boolean(dataOrBool?.enabled)
        isActionModeGloballyEnabled = enabled
        if (!enabled) {
          isChatPrimedStatus = false
        }
        const existing = document.getElementById('wb-chat-status-card')
        if (existing) {
          renderStatusCard('status')
        }
      })

      ipcRenderer.on('workbench:chat-prime-status-changed', (_e, data: { isPrimed: boolean }) => {
        const primed = Boolean(data?.isPrimed)
        isChatPrimedStatus = primed
        const existing = document.getElementById('wb-chat-status-card')
        if (existing) {
          renderStatusCard(primed ? 'connected' : 'status')
        }
      })
    } catch (_) {}

    function isElementVisible(el: HTMLElement | null): el is HTMLElement {
      if (!el || (el as any).disabled || el.getAttribute('aria-disabled') === 'true' || el.getAttribute('aria-hidden') === 'true') {
        return false
      }
      const rect = el.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return false
      const style = window.getComputedStyle(el)
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
    }

    function getInputField(): HTMLElement | null {
      // 1. Prefer the currently focused element if it is a valid chat editor
      const activeEl = document.activeElement as HTMLElement | null
      if (
        activeEl &&
        isElementVisible(activeEl) &&
        (activeEl.tagName === 'TEXTAREA' ||
          activeEl.isContentEditable ||
          activeEl.getAttribute('contenteditable') === 'true' ||
          activeEl.getAttribute('role') === 'textbox')
      ) {
        return activeEl
      }

      // 2. Otherwise search known chat composer selectors and return the visible composer
      const selectors = [
        '#prompt-textarea',
        'div[contenteditable="true"].ProseMirror',
        'rich-textarea div[contenteditable="true"]',
        'div.ql-editor[contenteditable="true"]',
        '.ql-editor',
        '#chat-input',
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"]',
        'textarea',
      ]
      for (const sel of selectors) {
        const matches = Array.from(document.querySelectorAll(sel)) as HTMLElement[]
        const visibleMatches = matches.filter(isElementVisible)
        if (visibleMatches.length > 0) {
          return visibleMatches[visibleMatches.length - 1]
        }
      }
      return null
    }

    function getInputValue(el: HTMLElement): string {
      if (el.tagName === 'TEXTAREA') {
        return (el as HTMLTextAreaElement).value || ''
      }
      return el.innerText || el.textContent || ''
    }

    function escapeHtml(text: string): string {
      return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
    }

    function clearInputField(el: HTMLElement) {
      try {
        // Send Escape on the input element to dismiss any slash-command popup in Claude/ProseMirror
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }))
        el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }))
      } catch (_) {}

      if (el.tagName === 'TEXTAREA') {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
        if (nativeSetter) {
          nativeSetter.call(el, '')
        } else {
          ;(el as HTMLTextAreaElement).value = ''
        }
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      } else {
        try {
          el.focus()
          document.execCommand('selectAll', false)
          document.execCommand('delete', false)
        } catch (_) {}
        if ((el.innerText || el.textContent || '').trim().length > 0) {
          try {
            const sel = window.getSelection()
            if (sel) {
              const range = document.createRange()
              range.selectNodeContents(el)
              sel.removeAllRanges()
              sel.addRange(range)
            }
            document.execCommand('delete', false)
          } catch (_) {}
          if ((el.innerText || el.textContent || '').trim().length > 0) {
            el.textContent = ''
          }
        }
        el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'deleteContentBackward' }))
        el.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
        el.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
      }
    }

    function checkIsPrimed(): boolean {
      try {
        if (document.querySelector('.wb-hidden-action-prompt')) return true
        if (document.querySelector('.workbench-action-badge')) return true
        const text = document.body ? document.body.innerText || document.body.textContent || '' : ''
        return (
          text.includes('Connected to Workbench') ||
          text.includes('Connection Status') ||
          text.includes('You are integrated with Workbench') ||
          text.includes('Available Workbench Actions') ||
          text.includes('Available Actions') ||
          text.includes('workbench:action')
        )
      } catch (_) {
        return false
      }
    }

    async function renderStatusCard(type: 'status' | 'connected' | 'priming') {
      const existing = document.getElementById('wb-chat-status-card')
      if (existing) existing.remove()

      let currentActionTarget = 'note'
      let currentActiveDir = ''
      try {
        const wf = await ipcRenderer.invoke('workbench:get-workspace-folders')
        if (wf) {
          currentActionTarget = wf.activeTarget || 'note'
          currentActiveDir = wf.activeDirectory || ''
        }
      } catch (_) {}

      const isPriming = type === 'priming'
      const isPrimed = isPriming ? false : (type === 'connected' ? true : (isActionModeGloballyEnabled && (isChatPrimedStatus || checkIsPrimed())))
      const folderName = currentActiveDir
        ? currentActiveDir.split(/[/\\]/).filter(Boolean).pop() || currentActiveDir
        : 'None'
      const targetLabel =
        currentActionTarget === 'note'
          ? 'Note View'
          : currentActionTarget === 'custom'
          ? 'Custom Directory'
          : 'Book View'

      const card = document.createElement('div')
      card.id = 'wb-chat-status-card'
      card.style.cssText = `
        position: fixed;
        bottom: 95px;
        left: 50%;
        transform: translateX(-50%);
        max-width: 680px;
        width: calc(100% - 32px);
        background: linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.98));
        border: 1px solid ${isPrimed ? 'rgba(52, 211, 153, 0.5)' : (isPriming ? 'rgba(245, 158, 11, 0.7)' : 'rgba(245, 158, 11, 0.5)')};
        border-radius: 10px;
        padding: 14px 18px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.65), 0 0 1px rgba(255, 255, 255, 0.2);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #f1f5f9;
        font-size: 13px;
        line-height: 1.5;
        z-index: 999999;
        backdrop-filter: blur(12px);
        animation: wbFadeIn 0.2s ease-out;
      `

      if (!document.getElementById('wb-chat-cmd-styles')) {
        const style = document.createElement('style')
        style.id = 'wb-chat-cmd-styles'
        style.textContent = `
          @keyframes wbFadeIn {
            from { opacity: 0; transform: translate(-50%, 8px); }
            to { opacity: 1; transform: translate(-50%, 0); }
          }
          @keyframes wbPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
          .wb-cmd-btn-prime {
            background: rgba(245, 158, 11, 0.22);
            border: 1px solid rgba(245, 158, 11, 0.5);
            color: #fbbf24;
            padding: 4px 12px;
            border-radius: 4px;
            font-size: 11.5px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s ease;
          }
          .wb-cmd-btn-prime:hover {
            background: rgba(245, 158, 11, 0.38);
            color: #fef08a;
          }
          .wb-cmd-btn-prime:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }
          .wb-cmd-btn-disable {
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.15);
            color: #94a3b8;
            padding: 4px 12px;
            border-radius: 4px;
            font-size: 11.5px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s ease;
          }
          .wb-cmd-btn-disable:hover {
            background: rgba(239, 68, 68, 0.2);
            border-color: rgba(239, 68, 68, 0.4);
            color: #fca5a5;
          }
          .wb-cmd-close-btn {
            background: transparent;
            border: none;
            color: #94a3b8;
            font-size: 14px;
            cursor: pointer;
            padding: 2px 6px;
            line-height: 1;
            border-radius: 3px;
          }
          .wb-cmd-close-btn:hover {
            color: #f1f5f9;
            background: rgba(255, 255, 255, 0.1);
          }
        `
        document.head.appendChild(style)
      }

      if (isPriming) {
        setSafeInnerHTML(
          card,
          `
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
            <div style="display:flex; align-items:center; gap:6px; font-weight:600; color:#fbbf24;">
              <span>⚡</span> <span>Workbench</span>
              <span style="font-size:11px; background:rgba(245,158,11,0.15); border:1px solid rgba(245,158,11,0.4); padding:1px 6px; border-radius:3px; animation:wbPulse 1.2s infinite ease-in-out;">⚡ Priming...</span>
            </div>
            <button class="wb-cmd-close-btn" id="wb-card-close-btn" title="Close">✕</button>
          </div>
          <div style="font-size:12px; color:#cbd5e1; margin-bottom:4px;">
            <strong>Target:</strong> <code style="background:rgba(255,255,255,0.08); padding:1px 5px; border-radius:3px; color:#fde68a;">${escapeHtml(targetLabel)}: ${escapeHtml(folderName)}</code>
            <span style="color:#64748b; font-size:11px; margin-left:6px;">(${escapeHtml(currentActiveDir || 'No path')})</span>
          </div>
          <div style="font-size:11.5px; color:#94a3b8; margin-bottom:8px;">
            Connecting chat to Workbench and injecting action system...
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <button class="wb-cmd-btn-prime" disabled style="opacity:0.7;">⚡ Priming Chat...</button>
          </div>
        `
        )
      } else if (isPrimed) {
        setSafeInnerHTML(
          card,
          `
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
            <div style="display:flex; align-items:center; gap:6px; font-weight:600; color:#34d399;">
              <span>⚡</span> <span>Workbench</span>
              <span style="font-size:11px; background:rgba(52,211,153,0.15); border:1px solid rgba(52,211,153,0.4); padding:1px 6px; border-radius:3px;">● Primed</span>
            </div>
            <button class="wb-cmd-close-btn" id="wb-card-close-btn" title="Close">✕</button>
          </div>
          <div style="font-size:12px; color:#cbd5e1; margin-bottom:4px;">
            <strong>Target:</strong> <code style="background:rgba(255,255,255,0.08); padding:1px 5px; border-radius:3px; color:#a7f3d0;">${escapeHtml(targetLabel)}: ${escapeHtml(folderName)}</code>
            <span style="color:#64748b; font-size:11px; margin-left:6px;">(${escapeHtml(currentActiveDir || 'No path')})</span>
          </div>
          <div style="font-size:11.5px; color:#94a3b8; margin-bottom:8px;">
            This chat is primed and connected to local files.
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <button class="wb-cmd-btn-disable" id="wb-cmd-trigger-disable-btn">Disable</button>
            <button class="wb-cmd-btn-disable" id="wb-cmd-trigger-help-btn">❓ Commands & Help</button>
          </div>
        `
        )
      } else {
        setSafeInnerHTML(
          card,
          `
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
            <div style="display:flex; align-items:center; gap:6px; font-weight:600; color:#f59e0b;">
              <span>⚡</span> <span>Workbench</span>
              <span style="font-size:11px; background:rgba(245,158,11,0.15); border:1px solid rgba(245,158,11,0.4); padding:1px 6px; border-radius:3px; color:#fbbf24;">○ Unprimed</span>
            </div>
            <button class="wb-cmd-close-btn" id="wb-card-close-btn" title="Close">✕</button>
          </div>
          <div style="font-size:12px; color:#cbd5e1; margin-bottom:6px;">
            <strong>Target:</strong> <code style="background:rgba(255,255,255,0.08); padding:1px 5px; border-radius:3px; color:#fde68a;">${escapeHtml(targetLabel)}: ${escapeHtml(folderName)}</code>
            <span style="color:#64748b; font-size:11px; margin-left:6px;">(${escapeHtml(currentActiveDir || 'No path')})</span>
          </div>
          <div style="font-size:11.5px; color:#94a3b8; margin-bottom:8px;">
            This chat is not connected to local files yet.
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <button class="wb-cmd-btn-prime" id="wb-cmd-trigger-prime-btn">⚡ Prime Chat</button>
            <button class="wb-cmd-btn-disable" id="wb-cmd-trigger-help-btn">❓ Commands & Help</button>
            <span style="font-size:11px; color:#64748b;">or type <code style="color:#cbd5e1;">/help</code> / <code style="color:#cbd5e1;">!status</code></span>
          </div>
        `
        )
      }

      // Always append directly to body with high z-index overlay so it is never clipped or unmounted by chat frameworks
      document.body.appendChild(card)

      const closeBtn = card.querySelector('#wb-card-close-btn')
      if (closeBtn) {
        closeBtn.addEventListener('click', () => card.remove())
      }

      const helpBtn = card.querySelector('#wb-cmd-trigger-help-btn')
      if (helpBtn) {
        helpBtn.addEventListener('click', () => renderBookHelpCard())
      }

      const primeBtn = card.querySelector('#wb-cmd-trigger-prime-btn')
      if (primeBtn) {
        primeBtn.addEventListener('click', () => {
          isActionModeGloballyEnabled = true
          renderStatusCard('priming')
          ipcRenderer.send('workbench:prime-active-chat', {})
        })
      }

      const disableBtn = card.querySelector('#wb-cmd-trigger-disable-btn')
      if (disableBtn) {
        disableBtn.addEventListener('click', () => {
          disableBtn.textContent = 'Disabling...'
          ;(disableBtn as HTMLButtonElement).disabled = true
          isActionModeGloballyEnabled = false
          isChatPrimedStatus = false
          ipcRenderer.invoke('workbench:set-action-mode', { enabled: false })
          setTimeout(() => {
            renderStatusCard('status')
          }, 300)
        })
      }
    }

    function ensureCmdStyles() {
      if (!document.getElementById('wb-chat-cmd-styles')) {
        const style = document.createElement('style')
        style.id = 'wb-chat-cmd-styles'
        style.textContent = `
          @keyframes wbFadeIn {
            from { opacity: 0; transform: translate(-50%, 8px); }
            to { opacity: 1; transform: translate(-50%, 0); }
          }
          @keyframes wbPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
          .wb-cmd-btn-prime {
            background: rgba(245, 158, 11, 0.22);
            border: 1px solid rgba(245, 158, 11, 0.5);
            color: #fbbf24;
            padding: 4px 12px;
            border-radius: 4px;
            font-size: 11.5px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s ease;
          }
          .wb-cmd-btn-prime:hover {
            background: rgba(245, 158, 11, 0.38);
            color: #fef08a;
          }
          .wb-cmd-btn-prime:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }
          .wb-cmd-btn-emerald {
            background: rgba(16, 185, 129, 0.22);
            border: 1px solid rgba(16, 185, 129, 0.5);
            color: #34d399;
            padding: 4px 10px;
            border-radius: 5px;
            font-size: 11.5px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s ease;
          }
          .wb-cmd-btn-emerald:hover {
            background: rgba(16, 185, 129, 0.38);
            color: #a7f3d0;
          }
          .wb-cmd-btn-disable {
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.15);
            color: #94a3b8;
            padding: 4px 10px;
            border-radius: 5px;
            font-size: 11.5px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s ease;
          }
          .wb-cmd-btn-disable:hover {
            background: rgba(255, 255, 255, 0.14);
            color: #f1f5f9;
          }
          .wb-cmd-close-btn {
            background: transparent;
            border: none;
            color: #94a3b8;
            font-size: 14px;
            cursor: pointer;
            padding: 2px 6px;
            line-height: 1;
            border-radius: 3px;
          }
          .wb-cmd-close-btn:hover {
            color: #f1f5f9;
            background: rgba(255, 255, 255, 0.1);
          }
          .wb-book-link-pill {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            padding: 5px 9px;
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 6px;
            color: #e2e8f0;
            font-size: 11.5px;
            cursor: pointer;
            text-align: left;
            transition: all 0.12s ease;
          }
          .wb-book-link-pill:hover {
            background: rgba(16, 185, 129, 0.16);
            border-color: rgba(16, 185, 129, 0.45);
            color: #ffffff;
          }
        `
        document.head.appendChild(style)
      }
    }

    function createHudCardContainer(borderColor: string = 'rgba(52, 211, 153, 0.5)'): HTMLDivElement {
      ensureCmdStyles()
      const existing = document.getElementById('wb-chat-status-card')
      if (existing) existing.remove()

      const card = document.createElement('div')
      card.id = 'wb-chat-status-card'
      card.style.cssText = `
        position: fixed;
        bottom: 95px;
        left: 50%;
        transform: translateX(-50%);
        max-width: 720px;
        width: calc(100% - 32px);
        background: linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.98));
        border: 1px solid ${borderColor};
        border-radius: 10px;
        padding: 14px 18px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.65), 0 0 1px rgba(255, 255, 255, 0.2);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #f1f5f9;
        font-size: 13px;
        line-height: 1.5;
        z-index: 999999;
        backdrop-filter: blur(12px);
        animation: wbFadeIn 0.2s ease-out;
      `
      return card
    }

    async function invokeWithTimeout<T = any>(channel: string, payload?: any, timeoutMs: number = 6000): Promise<T> {
      return await Promise.race([
        ipcRenderer.invoke(channel, payload) as Promise<T>,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(`IPC "${channel}" timed out after ${timeoutMs}ms`)), timeoutMs)
        ),
      ])
    }

    async function renderBookExtractCard(scope: 'viewport' | 'full' | 'inputs' = 'viewport') {
      const loadingCard = createHudCardContainer('rgba(16, 185, 129, 0.55)')
      setSafeInnerHTML(
        loadingCard,
        `
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div style="display:flex;align-items:center;gap:8px;color:#34d399;font-weight:600;">
            <span>📖</span><span>Reading BookView (${escapeHtml(scope)})...</span>
          </div>
          <button class="wb-cmd-close-btn" id="wb-card-close-btn">✕</button>
        </div>
      `
      )
      document.body.appendChild(loadingCard)
      loadingCard.querySelector('#wb-card-close-btn')?.addEventListener('click', () => loadingCard.remove())

      try {
        const res = await invokeWithTimeout('workbench:book-extract-page', {
          scope,
          includeLinks: true,
          includeInputs: true,
        }, 6500)
        if (!res || !res.success) {
          setSafeInnerHTML(
            loadingCard,
            `
            <div style="display:flex;align-items:center;justify-content:space-between;color:#f87171;">
              <span>⚠️ ${escapeHtml(res?.error || 'Failed to read BookView page')}</span>
              <button class="wb-cmd-close-btn" id="wb-card-close-btn">✕</button>
            </div>
          `
          )
          loadingCard.querySelector('#wb-card-close-btn')?.addEventListener('click', () => loadingCard.remove())
          return
        }

        const presetData = await invokeWithTimeout('workbench:get-book-prompt-presets', {}, 2500).catch(() => null)
        const rawSummaryPresets: any[] =
          Array.isArray(presetData?.summaryPresets) && presetData.summaryPresets.length > 0
            ? presetData.summaryPresets
            : Array.isArray(presetData?.presets) && presetData.presets.length > 0
              ? presetData.presets
              : SUMMARY_STYLE_PRESETS
        const summaryPresets = rawSummaryPresets.filter((p: any) => !['eli5', 'code'].includes(String(p.id)))
        const explainPresets: any[] =
          Array.isArray(presetData?.explainPresets) && presetData.explainPresets.length > 0
            ? presetData.explainPresets
            : EXPLAIN_STYLE_PRESETS
        const allUserTemplates: any[] = Array.isArray(presetData?.userTemplates) ? presetData.userTemplates : []
        const customUserTemplates: any[] = allUserTemplates.filter(
          (t: any) => !['explain', 'summarize', 'code', 'quiz', 'raw'].includes(String(t.id).toLowerCase())
        )
        const baseCmd = scope === 'full' ? '/chapter' : scope === 'inputs' ? '/inputs' : '/page'

        const summaryPillsHtml =
          `<button class="wb-cmd-btn-emerald" data-raw-cmd="${escapeHtml(`${baseCmd} summarize`)}" title="4-Part Structured Technical Summary" style="padding:3px 9px;font-size:11px;">📝 Default</button>` +
          summaryPresets
            .map(
              (p: any) =>
                `<button class="wb-cmd-btn-disable" data-raw-cmd="${escapeHtml(`${baseCmd} summarize:${p.id}`)}" title="${escapeHtml(p.description || '')}" style="padding:3px 8px;font-size:11px;border-color:rgba(16,185,129,0.35);color:#a7f3d0;">${escapeHtml(p.icon || '📝')} ${escapeHtml(p.label)}</button>`
            )
            .join('')

        const explainPillsHtml =
          `<button class="wb-cmd-btn-prime" data-raw-cmd="${escapeHtml(`${baseCmd} explain`)}" title="4-Part Tutor Explanation (Intuition, How & Why, Walkthrough, Gotchas)" style="padding:3px 9px;font-size:11px;">💡 Default</button>` +
          explainPresets
            .map(
              (p: any) =>
                `<button class="wb-cmd-btn-disable" data-raw-cmd="${escapeHtml(`${baseCmd} explain:${p.id}`)}" title="${escapeHtml(p.description || '')}" style="padding:3px 8px;font-size:11px;border-color:rgba(245,158,11,0.38);color:#fde68a;">${escapeHtml(p.icon || '💡')} ${escapeHtml(p.label)}</button>`
            )
            .join('')

        const customPillsHtml = customUserTemplates
          .slice(0, 6)
          .map(
            (t: any) =>
              `<button class="wb-cmd-btn-disable" data-raw-cmd="${escapeHtml(`${baseCmd} #${t.id}`)}" title="${escapeHtml(t.description || t.prompt || '')}" style="padding:3px 8px;font-size:11px;border-color:rgba(168,85,247,0.4);color:#d8b4fe;">✨ ${escapeHtml(t.name)}</button>`
          )
          .join('')

        const card = createHudCardContainer('rgba(16, 185, 129, 0.55)')
        let rawBodyPreview = (scope === 'full' ? res.fullText : res.visibleText) || '(No visible text found)'
        if (scope === 'full' && res.chapter && rawBodyPreview) {
          const chTitle = String(res.chapter).trim()
          const firstIdx = rawBodyPreview.indexOf(chTitle)
          const secondIdx = firstIdx >= 0 ? rawBodyPreview.indexOf(chTitle, firstIdx + chTitle.length) : -1
          if (secondIdx > 0 && secondIdx < 4500) {
            rawBodyPreview = rawBodyPreview.slice(secondIdx).trim()
          }
        }
        const previewText =
          scope === 'inputs'
            ? (res.inputs || [])
                .map((i: any) => `[Input #${i.id}] ${i.label || i.placeholder || i.name || i.tag} (${i.type}) = "${i.value}"`)
                .join('\n') || '(No form inputs detected on visible BookView page)'
            : rawBodyPreview

        setSafeInnerHTML(
          card,
          `
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
            <div style="display:flex; align-items:center; gap:6px; font-weight:600; color:#34d399;">
              <span>📖</span> <span>BookView ${scope === 'full' ? 'Chapter' : scope === 'inputs' ? 'Inputs' : 'Page'} Extracted</span>
              <span style="font-size:11px; background:rgba(16,185,129,0.15); border:1px solid rgba(16,185,129,0.4); padding:1px 6px; border-radius:4px;">~${res.scrollPercent || 0}%</span>
            </div>
            <div style="display:flex; align-items:center; gap:6px;">
              <button class="wb-cmd-btn-disable" id="wb-book-customize-templates-btn" style="padding:2px 8px;font-size:10.5px;" title="Customize summary & Ask AI templates">⚙️ Customize</button>
              <button class="wb-cmd-btn-disable" id="wb-book-help-btn" style="padding:2px 8px;font-size:10.5px;" title="Show ChatView ↔ BookView command reference">❓ Help</button>
              <button class="wb-cmd-close-btn" id="wb-card-close-btn" title="Close">✕</button>
            </div>
          </div>
          <div style="font-size:12px; color:#cbd5e1; margin-bottom:6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            <strong>${escapeHtml(res.title || 'BookView')}</strong>
            ${res.chapter && res.chapter !== res.title ? `<span style="color:#94a3b8;"> · ${escapeHtml(res.chapter)}</span>` : ''}
            <span style="color:#64748b; font-size:11px; margin-left:6px;">(${(res.links || []).length} links, ${(res.inputs || []).length} inputs)</span>
          </div>
          <div style="background:rgba(0,0,0,0.4); border:1px solid rgba(255,255,255,0.08); border-radius:6px; padding:8px 10px; max-height:105px; overflow-y:auto; font-family:monospace; font-size:11px; color:#e2e8f0; white-space:pre-wrap; margin-bottom:8px;">${escapeHtml(previewText.slice(0, 1500))}${previewText.length > 1500 ? '\n... [truncated preview]' : ''}</div>
          <div style="display:flex; flex-direction:column; gap:6px; margin-bottom:8px; background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.06); border-radius:7px; padding:7px 9px;">
            <div style="display:flex; flex-wrap:wrap; align-items:center; gap:5px;">
              <span style="font-size:11px; color:#34d399; font-weight:700; min-width:86px;">📝 Summarize:</span>
              ${summaryPillsHtml}
            </div>
            <div style="display:flex; flex-wrap:wrap; align-items:center; gap:5px; border-top:1px solid rgba(255,255,255,0.06); padding-top:6px;">
              <span style="font-size:11px; color:#fbbf24; font-weight:700; min-width:86px;">💡 Explain:</span>
              ${explainPillsHtml}
            </div>
          </div>
          <div style="display:flex; flex-wrap:wrap; align-items:center; gap:6px;">
            ${customPillsHtml}
            <button class="wb-cmd-btn-emerald" data-raw-cmd="${escapeHtml(`${baseCmd} quiz`)}">❓ Quiz Me</button>
            <button class="wb-cmd-btn-emerald" data-prompt="Extract all parameters, inputs, and actionable steps from this page:">🎛️ Extract Inputs</button>
            <button class="wb-cmd-btn-disable" id="wb-book-insert-raw-btn">📋 Insert in Prompt</button>
            <button class="wb-cmd-btn-disable" id="wb-book-show-links-btn">🔗 Links (${(res.links || []).length})</button>
          </div>
          <div style="font-size:10.5px; color:#64748b; margin-top:6px;">
            Tip: Type <code style="color:#94a3b8;">${escapeHtml(baseCmd)} summarize:deep</code>, <code style="color:#94a3b8;">${escapeHtml(baseCmd)} explain:why</code>, <code style="color:#94a3b8;">${escapeHtml(baseCmd)} explain:trace</code>, or <code style="color:#94a3b8;">${escapeHtml(baseCmd)} explain:compare</code>!
          </div>
        `
        )
        document.body.appendChild(card)
        card.querySelector('#wb-card-close-btn')?.addEventListener('click', () => card.remove())

        card.querySelector('#wb-book-customize-templates-btn')?.addEventListener('click', () => {
          ipcRenderer.send('workbench:open-ask-ai-templates-from-chat')
        })

        card.querySelector('#wb-book-help-btn')?.addEventListener('click', () => {
          renderBookHelpCard()
        })

        card.querySelectorAll('button[data-raw-cmd]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const rawCmd = btn.getAttribute('data-raw-cmd') || `${baseCmd} summarize`
            const subParsed = parseBookChatCommand(rawCmd)
            let promptToSend = rawCmd
            if (subParsed && subParsed.kind === 'book-prompt-expansion' && !subParsed.hasInlineMacros) {
              const resolvedInstr = resolveBookInstructionWithPresets(subParsed.instruction, allUserTemplates)
              promptToSend = `${baseCmd} ${resolvedInstr}`
            }
            card.remove()
            await invokeWithTimeout('workbench:book-expand-and-submit', {
              rawPrompt: promptToSend,
              autoSubmit: true,
            }, 8000).catch(() => {})
          })
        })

        card.querySelectorAll('button[data-prompt]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const instr = btn.getAttribute('data-prompt') || 'Analyze this page:'
            card.remove()
            await invokeWithTimeout('workbench:book-expand-and-submit', {
              rawPrompt: `${baseCmd} ${instr}`,
              autoSubmit: true,
            }, 8000).catch(() => {})
          })
        })

        card.querySelector('#wb-book-insert-raw-btn')?.addEventListener('click', async () => {
          card.remove()
          await invokeWithTimeout('workbench:book-expand-and-submit', {
            rawPrompt: `${baseCmd} `,
            autoSubmit: false,
          }, 8000).catch(() => {})
        })

        card.querySelector('#wb-book-show-links-btn')?.addEventListener('click', () => {
          renderBookLinksCard()
        })
      } catch (err: any) {
        const msg = err?.message || String(err || 'Failed to read BookView')
        const needsRestartHint = msg.includes('No handler registered')
          ? ' (Please restart Workbench so new IPC handlers are active)'
          : ''
        setSafeInnerHTML(
          loadingCard,
          `
          <div style="display:flex;align-items:center;justify-content:space-between;color:#f87171;">
            <span>⚠️ ${escapeHtml(msg + needsRestartHint)}</span>
            <button class="wb-cmd-close-btn" id="wb-card-close-btn">✕</button>
          </div>
        `
        )
        loadingCard.querySelector('#wb-card-close-btn')?.addEventListener('click', () => loadingCard.remove())
      }
    }

    async function renderBookLinksCard(filter?: string) {
      const loadingCard = createHudCardContainer('rgba(16, 185, 129, 0.55)')
      setSafeInnerHTML(
        loadingCard,
        `
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div style="display:flex;align-items:center;gap:8px;color:#34d399;font-weight:600;">
            <span>🔗</span><span>Indexing links in BookView...</span>
          </div>
          <button class="wb-cmd-close-btn" id="wb-card-close-btn">✕</button>
        </div>
      `
      )
      document.body.appendChild(loadingCard)
      loadingCard.querySelector('#wb-card-close-btn')?.addEventListener('click', () => loadingCard.remove())

      try {
        const res = await invokeWithTimeout('workbench:book-get-links', {
          viewportOnly: false,
          showBadges: true,
          filter,
        }, 6500)
        const links = res?.links || []
        const card = createHudCardContainer('rgba(16, 185, 129, 0.55)')

        const linksHtml =
          links.length > 0
            ? links
                .slice(0, 40)
                .map(
                  (l: any) => `
              <button class="wb-book-link-pill" data-link-id="${l.id}" title="${escapeHtml(l.href || l.text)}">
                <span style="display:flex;align-items:center;gap:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                  <span style="background:rgba(16,185,129,0.2);color:#34d399;border:1px solid rgba(16,185,129,0.4);padding:0 5px;border-radius:4px;font-family:monospace;font-size:10.5px;font-weight:700;">#${l.id}</span>
                  <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(l.text)}</span>
                </span>
                <span style="font-size:10px;color:#64748b;flex-shrink:0;">${l.inViewport ? '👁️' : ''} ${escapeHtml(l.type.toUpperCase())}</span>
              </button>
            `
                )
                .join('')
            : `<div style="color:#94a3b8;font-size:12px;padding:8px;">No matching links found on the current BookView page.</div>`

        setSafeInnerHTML(
          card,
          `
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
            <div style="display:flex; align-items:center; gap:6px; font-weight:600; color:#34d399;">
              <span>🔗</span> <span>BookView Links (${links.length})</span>
              ${filter ? `<span style="font-size:11px;color:#94a3b8;">filter: "${escapeHtml(filter)}"</span>` : ''}
            </div>
            <div style="display:flex; align-items:center; gap:6px;">
              <button class="wb-cmd-btn-disable" id="wb-book-clear-badges-btn" style="padding:2px 8px;font-size:10.5px;">Hide Badges</button>
              <button class="wb-cmd-close-btn" id="wb-card-close-btn" title="Close">✕</button>
            </div>
          </div>
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(210px, 1fr)); gap:5px; max-height:190px; overflow-y:auto; margin-bottom:10px; padding-right:2px;">
            ${linksHtml}
          </div>
          <div style="display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:6px;">
            <div style="display:flex; align-items:center; gap:5px;">
              <button class="wb-cmd-btn-disable" data-nav="back">◀ Back</button>
              <button class="wb-cmd-btn-disable" data-nav="forward">Forward ▶</button>
              <button class="wb-cmd-btn-disable" data-nav="scroll-up">⬆ Up</button>
              <button class="wb-cmd-btn-disable" data-nav="scroll-down">⬇ Down</button>
              <button class="wb-cmd-btn-emerald" data-nav="prev">⏮ Prev</button>
              <button class="wb-cmd-btn-emerald" data-nav="next">Next ⏭</button>
            </div>
            <button class="wb-cmd-btn-emerald" id="wb-book-read-page-btn">📖 Read Page</button>
          </div>
          <div style="font-size:10.5px; color:#64748b; margin-top:6px;">
            Click any link above or type <code style="color:#94a3b8;">/click #id</code> or <code style="color:#94a3b8;">/click &lt;text&gt;</code> in chat.
          </div>
        `
        )
        document.body.appendChild(card)

        card.querySelector('#wb-card-close-btn')?.addEventListener('click', () => {
          ipcRenderer.invoke('workbench:book-navigate', { command: 'clear-badges' }).catch(() => {})
          card.remove()
        })

        card.querySelector('#wb-book-clear-badges-btn')?.addEventListener('click', () => {
          ipcRenderer.invoke('workbench:book-navigate', { command: 'clear-badges' }).catch(() => {})
        })

        card.querySelector('#wb-book-read-page-btn')?.addEventListener('click', () => {
          renderBookExtractCard('viewport')
        })

        card.querySelectorAll('.wb-book-link-pill').forEach((pill) => {
          pill.addEventListener('click', async () => {
            const idAttr = pill.getAttribute('data-link-id')
            if (!idAttr) return
            const id = parseInt(idAttr, 10)
            ;(pill as HTMLButtonElement).style.opacity = '0.6'
            const clickRes = await invokeWithTimeout('workbench:book-click-link', { id }, 6000).catch(() => null)
            if (clickRes?.success) {
              setTimeout(() => renderBookLinksCard(), 350)
            }
          })
        })

        card.querySelectorAll('button[data-nav]').forEach((navBtn) => {
          navBtn.addEventListener('click', async () => {
            const cmd = navBtn.getAttribute('data-nav')
            if (!cmd) return
            await invokeWithTimeout('workbench:book-navigate', { command: cmd }, 6000).catch(() => {})
            setTimeout(() => renderBookLinksCard(filter), 350)
          })
        })
      } catch (err: any) {
        const msg = err?.message || String(err || 'Failed to index BookView links')
        setSafeInnerHTML(
          loadingCard,
          `
          <div style="display:flex;align-items:center;justify-content:space-between;color:#f87171;">
            <span>⚠️ ${escapeHtml(msg)}</span>
            <button class="wb-cmd-close-btn" id="wb-card-close-btn">✕</button>
          </div>
        `
        )
        loadingCard.querySelector('#wb-card-close-btn')?.addEventListener('click', () => loadingCard.remove())
      }
    }

    function renderBookHelpCard() {
      const card = createHudCardContainer('rgba(56, 189, 248, 0.55)')
      setSafeInnerHTML(
        card,
        `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
          <div style="display:flex; align-items:center; gap:6px; font-weight:600; color:#38bdf8;">
            <span>📘</span> <span>Workbench ChatView ↔ BookView Command & Style Reference</span>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <button class="wb-cmd-btn-disable" id="wb-help-customize-btn" style="padding:2px 8px;font-size:10.5px;">⚙️ Customize Templates</button>
            <button class="wb-cmd-close-btn" id="wb-card-close-btn" title="Close">✕</button>
          </div>
        </div>
        <div style="max-height:260px; overflow-y:auto; padding-right:4px; font-size:11.5px; color:#cbd5e1; display:flex; flex-direction:column; gap:8px;">
          <div style="background:rgba(0,0,0,0.35); border:1px solid rgba(255,255,255,0.08); border-radius:6px; padding:8px 10px;">
            <div style="font-weight:600; color:#34d399; margin-bottom:4px;">📖 Reading & Extraction (No Priming Required — supports / or ! prefix)</div>
            <div><code style="color:#fde68a;">/page</code> or <code style="color:#fde68a;">/chapter</code> — Open interactive BookView HUD card with 1-click style pills</div>
            <div><code style="color:#fde68a;">/page &lt;question&gt;</code> or <code style="color:#fde68a;">/chapter &lt;question&gt;</code> — Extract visible viewport or full chapter/PDF &amp; ask AI</div>
            <div><code style="color:#fde68a;">/inputs [question]</code> — Extract form inputs/configs from BookView</div>
            <div><code style="color:#fde68a;">@page</code>, <code style="color:#fde68a;">@chapter</code>, <code style="color:#fde68a;">@inputs</code>, <code style="color:#fde68a;">@links</code>, <code style="color:#fde68a;">@selection</code> — Inline context macros in any sentence</div>
          </div>
          <div style="background:rgba(0,0,0,0.35); border:1px solid rgba(255,255,255,0.08); border-radius:6px; padding:8px 10px;">
            <div style="font-weight:600; color:#34d399; margin-bottom:4px;">📝 Summarization Styles (Condense &amp; Organize — /chapter summarize:&lt;style&gt;)</div>
            <div><code style="color:#a7f3d0;">/chapter summarize</code> — 4-part structured digest (or your custom <em>Summarize</em> template)</div>
            <div><code style="color:#a7f3d0;">/chapter summarize:brief</code> — ⚡ 1-sentence thesis + 3–5 concise bullets (<code style="color:#94a3b8;">:tldr</code>, <code style="color:#94a3b8;">:short</code>)</div>
            <div><code style="color:#a7f3d0;">/chapter summarize:deep</code> — 🔬 Section-by-section technical digest (<code style="color:#94a3b8;">:detailed</code>, <code style="color:#94a3b8;">:technical</code>)</div>
            <div><code style="color:#a7f3d0;">/chapter summarize:steps</code> — 🔢 Sequential algorithm &amp; variable summary (<code style="color:#94a3b8;">:algo</code>)</div>
            <div><code style="color:#a7f3d0;">/chapter summarize:study</code> — 🎓 Study guide, rules, pitfalls &amp; 3 quiz Q&amp;As (<code style="color:#94a3b8;">:notes</code>, <code style="color:#94a3b8;">:cheatsheet</code>)</div>
            <div><code style="color:#a7f3d0;">/chapter summarize:table</code> — 📊 Markdown reference/comparison matrix (<code style="color:#94a3b8;">:matrix</code>)</div>
          </div>
          <div style="background:rgba(0,0,0,0.35); border:1px solid rgba(255,255,255,0.08); border-radius:6px; padding:8px 10px;">
            <div style="font-weight:600; color:#fbbf24; margin-bottom:4px;">💡 Explanation Styles (Teach &amp; Clarify — /chapter explain:&lt;style&gt;)</div>
            <div><code style="color:#fde68a;">/chapter explain</code> — 4-part tutor explanation (Intuition, How &amp; Why, Walkthrough, Gotchas)</div>
            <div><code style="color:#fde68a;">/chapter explain:eli5</code> — 🧠 Everyday analogy mapped 1-to-1 to formal terms (<code style="color:#94a3b8;">:intuition</code>, <code style="color:#94a3b8;">:simple</code>)</div>
            <div><code style="color:#fde68a;">/chapter explain:why</code> — 🧱 First-principles design rationale &amp; invariants (<code style="color:#94a3b8;">:first-principles</code>, <code style="color:#94a3b8;">:design</code>)</div>
            <div><code style="color:#fde68a;">/chapter explain:trace</code> — 🔍 Step-by-step ASCII visual state trace (<code style="color:#94a3b8;">:visual</code>, <code style="color:#94a3b8;">:walkthrough</code>)</div>
            <div><code style="color:#fde68a;">/chapter explain:code</code> — 💻 Annotated runnable code tutorial &amp; output (<code style="color:#94a3b8;">:demo</code>, <code style="color:#94a3b8;">:example</code>)</div>
            <div><code style="color:#fde68a;">/chapter explain:compare</code> — ⚖️ Compare &amp; contrast against alternatives (<code style="color:#94a3b8;">:vs</code>, <code style="color:#94a3b8;">:tradeoffs</code>)</div>
            <div><code style="color:#fde68a;">/chapter explain:pitfalls</code> — 🧑‍🏫 Top misconceptions, boundary traps &amp; Q&amp;A (<code style="color:#94a3b8;">:socratic</code>, <code style="color:#94a3b8;">:bugs</code>)</div>
            <div><code style="color:#e9d5ff;">/chapter #&lt;template-id&gt;</code> — Run any custom template from ⚙️ Customize or <code style="color:#94a3b8;">prompts/</code></div>
          </div>
          <div style="background:rgba(0,0,0,0.35); border:1px solid rgba(255,255,255,0.08); border-radius:6px; padding:8px 10px;">
            <div style="font-weight:600; color:#38bdf8; margin-bottom:4px;">🔗 Link Clicking, Navigation &amp; Status</div>
            <div><code style="color:#bae6fd;">/links [filter]</code> — Show numbered <code style="color:#34d399;">#id</code> badges on BookView links &amp; open clickable list</div>
            <div><code style="color:#bae6fd;">/click #3</code> or <code style="color:#bae6fd;">/click Next</code> — Click a link/button inside BookView by badge #id or text</div>
            <div><code style="color:#bae6fd;">/next</code>, <code style="color:#bae6fd;">/prev</code>, <code style="color:#bae6fd;">/scroll-down</code>, <code style="color:#bae6fd;">/scroll-up</code>, <code style="color:#bae6fd;">/book back</code> — Navigate BookView</div>
            <div><code style="color:#bae6fd;">/status</code> (<code style="color:#94a3b8;">!status</code>) · <code style="color:#bae6fd;">/connect</code> (<code style="color:#94a3b8;">!connect</code>) · <code style="color:#bae6fd;">/help</code> (<code style="color:#94a3b8;">!help</code>)</div>
          </div>
        </div>
        <div style="display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:6px; margin-top:8px;">
          <div style="display:flex; flex-wrap:wrap; align-items:center; gap:5px;">
            <button class="wb-cmd-btn-emerald" id="wb-help-open-page">📖 /page</button>
            <button class="wb-cmd-btn-emerald" id="wb-help-open-chapter">📚 /chapter</button>
            <button class="wb-cmd-btn-emerald" id="wb-help-open-links">🔗 /links</button>
            <button class="wb-cmd-btn-disable" id="wb-help-open-status">⚡ /status</button>
          </div>
          <span style="font-size:10.5px; color:#64748b;">Full guide: <code style="color:#94a3b8;">docs/CHATVIEW_BOOKVIEW_BRIDGE_GUIDE.md</code></span>
        </div>
      `
      )
      document.body.appendChild(card)
      card.querySelector('#wb-card-close-btn')?.addEventListener('click', () => card.remove())
      card.querySelector('#wb-help-customize-btn')?.addEventListener('click', () => {
        ipcRenderer.send('workbench:open-ask-ai-templates-from-chat')
      })
      card.querySelector('#wb-help-open-page')?.addEventListener('click', () => renderBookExtractCard('viewport'))
      card.querySelector('#wb-help-open-chapter')?.addEventListener('click', () => renderBookExtractCard('full'))
      card.querySelector('#wb-help-open-links')?.addEventListener('click', () => renderBookLinksCard())
      card.querySelector('#wb-help-open-status')?.addEventListener('click', () => renderStatusCard('status'))
    }

    async function executeBookChatCommand(parsed: ParsedBookChatCommand) {
      if (parsed.kind === 'help') {
        renderBookHelpCard()
        return
      }
      if (parsed.kind === 'status') {
        renderStatusCard('status')
        return
      }
      if (parsed.kind === 'connect') {
        isActionModeGloballyEnabled = true
        renderStatusCard('priming')
        ipcRenderer.send('workbench:prime-active-chat', {})
        return
      }
      if (parsed.kind === 'book-extract-card') {
        await renderBookExtractCard(parsed.scope)
        return
      }
      if (parsed.kind === 'book-links') {
        await renderBookLinksCard(parsed.filter)
        return
      }
      if (parsed.kind === 'book-badges') {
        await ipcRenderer.invoke('workbench:book-navigate', {
          command: parsed.show ? 'show-badges' : 'clear-badges',
        })
        if (parsed.show) {
          await renderBookLinksCard()
        }
        return
      }
      if (parsed.kind === 'book-click') {
        const card = createHudCardContainer('rgba(16, 185, 129, 0.55)')
        setSafeInnerHTML(
          card,
          `
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <span style="color:#34d399;font-weight:600;">🖱️ Clicking "${escapeHtml(parsed.text || '#' + parsed.id)}" in BookView...</span>
            <button class="wb-cmd-close-btn" id="wb-card-close-btn">✕</button>
          </div>
        `
        )
        document.body.appendChild(card)
        card.querySelector('#wb-card-close-btn')?.addEventListener('click', () => card.remove())

        try {
          const res = await invokeWithTimeout('workbench:book-click-link', {
            id: parsed.id,
            text: parsed.text,
          }, 6500)
          setSafeInnerHTML(
            card,
            `
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
              <span style="color:${res?.success ? '#34d399' : '#f87171'};font-weight:600;">
                ${res?.success ? '✅ ' + escapeHtml(res.message) : '⚠️ ' + escapeHtml(res?.message || res?.error || 'Click failed')}
              </span>
              <button class="wb-cmd-close-btn" id="wb-card-close-btn">✕</button>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
              <button class="wb-cmd-btn-emerald" id="wb-after-click-read">📖 Read Visible Page</button>
              <button class="wb-cmd-btn-disable" id="wb-after-click-links">🔗 Show Links</button>
            </div>
          `
          )
          card.querySelector('#wb-card-close-btn')?.addEventListener('click', () => card.remove())
          card.querySelector('#wb-after-click-read')?.addEventListener('click', () => renderBookExtractCard('viewport'))
          card.querySelector('#wb-after-click-links')?.addEventListener('click', () => renderBookLinksCard())
        } catch (err: any) {
          setSafeInnerHTML(
            card,
            `
            <div style="display:flex;align-items:center;justify-content:space-between;color:#f87171;">
              <span>⚠️ ${escapeHtml(err?.message || 'Click command failed')}</span>
              <button class="wb-cmd-close-btn" id="wb-card-close-btn">✕</button>
            </div>
          `
          )
          card.querySelector('#wb-card-close-btn')?.addEventListener('click', () => card.remove())
        }
        setTimeout(() => {
          if (document.body.contains(card)) card.remove()
        }, 6500)
        return
      }
      if (parsed.kind === 'book-nav') {
        const card = createHudCardContainer('rgba(16, 185, 129, 0.55)')
        try {
          const res = await invokeWithTimeout('workbench:book-navigate', {
            command: parsed.command,
            url: parsed.url,
          }, 6500)
          setSafeInnerHTML(
            card,
            `
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <span style="color:${res?.success ? '#34d399' : '#f87171'};font-weight:600;">
                ${res?.success ? '🧭 ' + escapeHtml(res.message) : '⚠️ ' + escapeHtml(res?.message || res?.error || 'Navigation failed')}
              </span>
              <div style="display:flex;align-items:center;gap:6px;">
                <button class="wb-cmd-btn-emerald" id="wb-after-nav-read" style="padding:2px 8px;font-size:11px;">📖 Read Page</button>
                <button class="wb-cmd-close-btn" id="wb-card-close-btn">✕</button>
              </div>
            </div>
          `
          )
          document.body.appendChild(card)
          card.querySelector('#wb-card-close-btn')?.addEventListener('click', () => card.remove())
          card.querySelector('#wb-after-nav-read')?.addEventListener('click', () => renderBookExtractCard('viewport'))
        } catch (err: any) {
          setSafeInnerHTML(
            card,
            `
            <div style="display:flex;align-items:center;justify-content:space-between;color:#f87171;">
              <span>⚠️ ${escapeHtml(err?.message || 'Navigation command failed')}</span>
              <button class="wb-cmd-close-btn" id="wb-card-close-btn">✕</button>
            </div>
          `
          )
          document.body.appendChild(card)
          card.querySelector('#wb-card-close-btn')?.addEventListener('click', () => card.remove())
        }
        setTimeout(() => {
          if (document.body.contains(card)) card.remove()
        }, 4500)
        return
      }
      if (parsed.kind === 'book-prompt-expansion') {
        const card = createHudCardContainer('rgba(16, 185, 129, 0.55)')
        setSafeInnerHTML(
          card,
          `
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <span style="color:#34d399;font-weight:600;animation:wbPulse 1.2s infinite ease-in-out;">
              📖 Extracting BookView ${escapeHtml(parsed.scope)} into prompt...
            </span>
            <button class="wb-cmd-close-btn" id="wb-card-close-btn">✕</button>
          </div>
        `
        )
        document.body.appendChild(card)
        card.querySelector('#wb-card-close-btn')?.addEventListener('click', () => card.remove())

        try {
          const res = await invokeWithTimeout('workbench:book-expand-and-submit', {
            rawPrompt: parsed.rawPrompt,
            autoSubmit: true,
          }, 8000)
          if (!res?.success) {
            setSafeInnerHTML(
              card,
              `
              <div style="display:flex;align-items:center;justify-content:space-between;color:#f87171;">
                <span>⚠️ ${escapeHtml(res?.error || 'Failed to expand BookView prompt')}</span>
                <button class="wb-cmd-close-btn" id="wb-card-close-btn">✕</button>
              </div>
            `
            )
            card.querySelector('#wb-card-close-btn')?.addEventListener('click', () => card.remove())
            return
          }
        } catch (err: any) {
          setSafeInnerHTML(
            card,
            `
            <div style="display:flex;align-items:center;justify-content:space-between;color:#f87171;">
              <span>⚠️ ${escapeHtml(err?.message || 'Failed to expand BookView prompt')}</span>
              <button class="wb-cmd-close-btn" id="wb-card-close-btn">✕</button>
            </div>
          `
          )
          card.querySelector('#wb-card-close-btn')?.addEventListener('click', () => card.remove())
          return
        }
        setTimeout(() => {
          if (document.body.contains(card)) card.remove()
        }, 1800)
      }
    }

    let lastInterceptTimestamp = 0

    function checkAndInterceptCommand(e: Event) {
      if (!e.isTrusted) return
      if (!isChatSite()) return
      const now = Date.now()
      if (now - lastInterceptTimestamp < 300) return
      const inputEl = getInputField()
      if (!inputEl) return
      const raw = getInputValue(inputEl)
      const parsed = parseBookChatCommand(raw)
      if (parsed) {
        lastInterceptTimestamp = now
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        clearInputField(inputEl)
        executeBookChatCommand(parsed)
      }
    }

    window.addEventListener(
      'keydown',
      (e: KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
          checkAndInterceptCommand(e)
        }
      },
      true
    )

    function isSendButtonTarget(e: Event): boolean {
      try {
        const selector =
          'button[data-testid*="send"], button[aria-label*="Send" i], button[aria-label*="Submit" i], button.send-button, .send-button-container button, button[type="submit"]'
        const path = typeof (e as any).composedPath === 'function' ? ((e as any).composedPath() as EventTarget[]) : [e.target]
        for (const node of path) {
          if (node && node instanceof Element) {
            const btn = (node.matches(selector) ? node : node.closest(selector)) as HTMLElement | null
            if (btn) {
              const aria = (btn.getAttribute('aria-label') || '').toLowerCase()
              if (aria.includes('stop') || btn.classList.contains('stop')) return false
              return true
            }
          }
        }
      } catch (_) {}
      return false
    }

    window.addEventListener(
      'pointerdown',
      (e: PointerEvent) => {
        try {
          if (isSendButtonTarget(e)) {
            checkAndInterceptCommand(e)
          }
        } catch (_) {}
      },
      true
    )

    window.addEventListener(
      'click',
      (e: MouseEvent) => {
        try {
          if (isSendButtonTarget(e)) {
            checkAndInterceptCommand(e)
          }
        } catch (_) {}
      },
      true
    )
  })()
} catch (_) {}

// =========================================================================
// Floating Selection Action Bubble (In-Book Instant Tooltip)
// =========================================================================
try {
  (function initSelectionBubble() {
    if (!__wbShouldInitPreload) return
    if (typeof window === 'undefined' || typeof document === 'undefined') return

    let bubbleHost: HTMLDivElement | null = null
    let shadowRoot: ShadowRoot | null = null
    let bubbleEl: HTMLDivElement | null = null
    let isMouseInsideBubble = false
    let hideTimeout: any = null

    function getBookMetadata() {
      const pageTitle = document.title || ''
      const pageUrl = window.location.href || ''
      let chapter = ''
      const selectors = [
        'h1.title',
        '[data-testid="header-title"]',
        '.chapter-title',
        'header h1',
        'article h1',
        'h1',
        'h2.title',
        'h2'
      ]
      for (const s of selectors) {
        const el = document.querySelector(s) as HTMLElement | null
        if (el && el.innerText && el.innerText.trim()) {
          chapter = el.innerText.trim()
          break
        }
      }
      return { title: pageTitle, chapter, url: pageUrl }
    }

    function createBubbleDOM() {
      if (bubbleHost) return
      bubbleHost = document.createElement('div')
      bubbleHost.id = 'workbench-selection-bubble-host'
      bubbleHost.style.position = 'fixed'
      bubbleHost.style.top = '0'
      bubbleHost.style.left = '0'
      bubbleHost.style.width = '0'
      bubbleHost.style.height = '0'
      bubbleHost.style.zIndex = '2147483647'
      bubbleHost.style.pointerEvents = 'none'

      shadowRoot = bubbleHost.attachShadow({ mode: 'open' })

      const style = document.createElement('style')
      style.textContent = `
        .wb-bubble {
          position: fixed;
          display: flex;
          align-items: center;
          gap: 3px;
          padding: 4px 6px;
          background: rgba(15, 23, 42, 0.95);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 9999px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.7), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
          opacity: 0;
          transform: scale(0.92) translateY(4px);
          transition: opacity 0.15s cubic-bezier(0.16, 1, 0.3, 1), transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
          pointer-events: auto;
          user-select: none;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          font-size: 11.5px;
          color: #f1f5f9;
          visibility: hidden;
        }
        .wb-bubble.visible {
          opacity: 1;
          transform: scale(1) translateY(0);
          visibility: visible;
        }
        .wb-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 5px 9px;
          background: transparent;
          border: none;
          border-radius: 9999px;
          color: #e2e8f0;
          cursor: pointer;
          font-size: 11.5px;
          font-weight: 500;
          line-height: 1;
          white-space: nowrap;
          transition: background 0.12s ease, color 0.12s ease, transform 0.1s ease;
        }
        .wb-btn:hover {
          background: rgba(255, 255, 255, 0.16);
          color: #ffffff;
          transform: translateY(-1px);
        }
        .wb-btn:active {
          transform: translateY(0);
        }
        .wb-btn-primary {
          background: rgba(16, 185, 129, 0.22);
          color: #34d399;
        }
        .wb-btn-primary:hover {
          background: rgba(16, 185, 129, 0.38);
          color: #6ee7b7;
        }
        .wb-btn-note {
          background: rgba(168, 85, 247, 0.22);
          color: #c084fc;
        }
        .wb-btn-note:hover {
          background: rgba(168, 85, 247, 0.38);
          color: #d8b4fe;
        }
        .wb-divider {
          width: 1px;
          height: 14px;
          background: rgba(255, 255, 255, 0.16);
          margin: 0 1px;
        }
        .wb-icon {
          display: inline-block;
          flex-shrink: 0;
        }
      `
      shadowRoot.appendChild(style)

      bubbleEl = document.createElement('div')
      bubbleEl.className = 'wb-bubble'
      setSafeInnerHTML(
        bubbleEl,
        `
        <button class="wb-btn wb-btn-primary" data-action="explain" title="Ask AI to explain this excerpt">
          <svg class="wb-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>
          <span>Explain</span>
        </button>
        <button class="wb-btn" data-action="code" title="Ask AI for a practical code example">
          <svg class="wb-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
          <span>Code</span>
        </button>
        <div class="wb-divider"></div>
        <button class="wb-btn wb-btn-note" data-action="clip" title="Clip highlighted text directly into Notes with citation">
          <svg class="wb-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10"/><path d="M6 10h10"/></svg>
          <span>Clip to Note</span>
        </button>
        <div class="wb-divider"></div>
        <button class="wb-btn" data-action="quiz" title="Quiz yourself on this excerpt">
          <svg class="wb-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
          <span>Quiz</span>
        </button>
      `
      )

      bubbleEl.addEventListener('mouseenter', () => { isMouseInsideBubble = true })
      bubbleEl.addEventListener('mouseleave', () => { isMouseInsideBubble = false })
      bubbleEl.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
      })

      bubbleEl.addEventListener('click', (e) => {
        const target = (e.target as HTMLElement)?.closest('button')
        if (!target) return
        const action = target.getAttribute('data-action')
        if (!action) return

        const sel = window.getSelection()
        const text = (sel ? sel.toString() : '').trim() || currentSelectionText
        if (!text) return

        const metadata = getBookMetadata()

        if (action === 'clip') {
          try {
            ipcRenderer.send('workbench:book-bubble-action', {
              action: 'clip-note',
              text,
              metadata,
            })
            flashHighlight()
          } catch (_) {}
        } else if (action === 'explain' || action === 'code' || action === 'quiz') {
          try {
            ipcRenderer.send('workbench:book-bubble-action', {
              action: 'ask-ai',
              templateKey: action,
              text,
              metadata,
            })
          } catch (_) {}
        }

        hideBubble()
      })

      shadowRoot.appendChild(bubbleEl)
      if (document.body) {
        document.body.appendChild(bubbleHost)
      } else {
        document.documentElement.appendChild(bubbleHost)
      }
    }

    let currentSelectionText = ''
    let currentSelectionRange: Range | null = null

    function flashHighlight() {
      try {
        const sel = window.getSelection()
        const range = (sel && sel.rangeCount > 0) ? sel.getRangeAt(0) : currentSelectionRange
        if (!range) return
        const span = document.createElement('span')
        span.style.background = 'rgba(168, 85, 247, 0.35)'
        span.style.borderRadius = '3px'
        span.style.transition = 'background 0.8s ease'
        range.surroundContents(span)
        setTimeout(() => {
          span.style.background = 'rgba(168, 85, 247, 0.15)'
        }, 500)
      } catch (_) {}
    }

    function hideBubble() {
      if (bubbleEl) {
        bubbleEl.classList.remove('visible')
      }
    }

    function handleSelectionCheck() {
      if (isMouseInsideBubble) return
      if (hideTimeout) clearTimeout(hideTimeout)

      hideTimeout = setTimeout(() => {
        const activeEl = document.activeElement as HTMLElement | null
        if (activeEl && (activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'INPUT' || activeEl.isContentEditable)) {
          hideBubble()
          return
        }

        // Avoid showing inside chat interfaces (ChatGPT, Claude, Gemini, Grok)
        const host = window.location.hostname.toLowerCase()
        if (host.includes('chatgpt') || host.includes('claude') || host.includes('gemini') || host.includes('grok')) {
          hideBubble()
          return
        }

        const sel = window.getSelection()
        const text = (sel ? sel.toString() : '').trim()

        if (!text || text.length < 2 || !sel || sel.isCollapsed || !sel.rangeCount) {
          hideBubble()
          return
        }

        const range = sel.getRangeAt(0)
        const rect = range.getBoundingClientRect()
        if (!rect || (rect.width === 0 && rect.height === 0)) {
          hideBubble()
          return
        }

        currentSelectionText = text
        try {
          currentSelectionRange = range.cloneRange()
        } catch (_) {}

        createBubbleDOM()
        if (!bubbleEl) return

        const bubbleWidth = bubbleEl.offsetWidth || 315
        const bubbleHeight = bubbleEl.offsetHeight || 36

        let left = rect.left + (rect.width / 2) - (bubbleWidth / 2)
        let top = rect.top - bubbleHeight - 8

        if (left < 10) left = 10
        if (left + bubbleWidth > window.innerWidth - 10) {
          left = window.innerWidth - bubbleWidth - 10
        }

        if (top < 10) {
          top = rect.bottom + 8
        }

        bubbleEl.style.left = `${Math.round(left)}px`
        bubbleEl.style.top = `${Math.round(top)}px`
        bubbleEl.classList.add('visible')
      }, 60)
    }

    document.addEventListener('mouseup', handleSelectionCheck, true)
    document.addEventListener('keyup', handleSelectionCheck, true)
    document.addEventListener('mousedown', () => {
      if (isMouseInsideBubble) return
      hideBubble()
    }, true)
    window.addEventListener('scroll', () => {
      if (!isMouseInsideBubble) hideBubble()
    }, { passive: true })
  })()
} catch (_) {}

