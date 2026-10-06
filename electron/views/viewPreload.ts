import { webFrame, ipcRenderer } from 'electron'

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

try {
  webFrame.executeJavaScriptInIsolatedWorld(0, [{ code: injectionCode }])
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
} catch (_) {}

// =========================================================================
// Modular Section: Workbench Action Observer
// Watches the chat DOM in real-time for ```workbench:action code blocks,
// extracts the JSON payload, and routes it to Workbench ActionDispatcher.
// =========================================================================
try {
  (function initWorkbenchActionObserver() {
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
          margin: 6px 0 14px 0;
          padding: 12px 14px;
          background: rgba(15, 23, 42, 0.85);
          border: 1px solid ${isSuccess ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'};
          border-radius: 8px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          backdrop-filter: blur(8px);
          transition: all 0.2s ease;
        `

        // Header
        const header = document.createElement('div')
        header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;'
        header.innerHTML = `
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
          hintText.innerHTML = `⚠️ ${escapeHtml(data.stagnationReason || 'Action cycle detected. Check before continuing.')}`
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
        continueBtn.innerHTML = `<span>▶</span><span>Continue to Next Step</span>`

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
          continueBtn.innerHTML = `<span>⏳</span><span>Submitting to AI...</span>`

          ipcRenderer.send('workbench:submit-action-feedback', {
            actionId,
            feedbackText: data.feedbackText,
          })
        })

        footer.appendChild(continueBtn)
        card.appendChild(footer)

        // Insert card into DOM right after badge
        if (badge && badge.parentNode) {
          if (badge.nextSibling) {
            badge.parentNode.insertBefore(card, badge.nextSibling)
          } else {
            badge.parentNode.appendChild(card)
          }
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
          btn.innerHTML = `<span>✓</span><span>Next Step Submitted</span>`
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
      const selectors = [
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

    function extractActionsFromText(fullText: string): Array<{ payload: any; raw: string }> {
      const actions: Array<{ payload: any; raw: string }> = []
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
          if (ch === '"') {
            inString = true
          } else if (ch === '{') {
            if (depth === 0) startIdx = i
            depth++
          } else if (ch === '}') {
            depth--
            if (depth === 0 && startIdx !== -1) {
              const candidate = fullText.substring(startIdx, i + 1).trim()
              try {
                let parsed: any = null
                try {
                  parsed = JSON.parse(candidate)
                } catch (_) {
                  // Fallback: fix unescaped backslashes in Windows paths (e.g. \O, \D, \0)
                  const sanitized = candidate.replace(/\\(?!["\\/bfnrtu]|u[0-9a-fA-F]{4})/g, '\\\\')
                  parsed = JSON.parse(sanitized)
                }
                if (parsed && typeof parsed === 'object' && (parsed.action || parsed.type)) {
                  actions.push({ payload: parsed, raw: candidate })
                }
              } catch (_) {}
              startIdx = -1
            }
          }
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

      // D. Quarantine system prompt guide text
      const text = el.innerText || el.textContent || ''
      if (
        text.includes('You are integrated with Workbench Desktop') ||
        text.includes('Available Workbench Actions') ||
        text.includes('### Available Workbench Actions') ||
        text.includes('workbench:action code block') ||
        text.includes('Custom User Instructions') ||
        text.includes('<folder_name>') ||
        text.includes('<file_path>')
      ) {
        return false
      }

      // E. Must be inside an AI chat view
      if (!isChatSite()) {
        return false
      }

      return true
    }

    function hideFeedbackBubbles() {
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
          const text = htmlEl.innerText || ''
          if (keywords.some((k) => text.includes(k))) {
            htmlEl.setAttribute('data-wb-hidden', 'true')
            htmlEl.style.display = 'none'
          }
        })
      } catch (_) {}
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
        !rawText.includes('"action"')
      ) {
        return
      }

      const extracted = extractActionsFromText(rawText)
      if (extracted.length === 0) return

      // Tag container immediately
      executedElements.add(containerEl)
      containerEl.setAttribute('data-workbench-executed', 'true')

      // Target full code wrapper across Gemini, Claude, ChatGPT, Grok, etc.
      const targetBox =
        containerEl.closest('pre') ||
        containerEl.closest('code-block') ||
        containerEl.closest('[class*="code-container"]') ||
        containerEl.closest('[class*="code-block"]') ||
        (containerEl.closest('div.rounded-md') && containerEl.closest('div.rounded-md')?.querySelector('code') ? (containerEl.closest('div.rounded-md') as HTMLElement) : null) ||
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
          const actionParam = item.payload.path || item.payload.folderName || item.payload.filePath || item.payload.targetDirectory || '.'
          const badge = document.createElement('div')
          badge.className = 'workbench-action-badge'
          badge.setAttribute('data-action-id', actionId)
          badge.style.cssText =
            'display:flex;align-items:center;justify-content:space-between;padding:4px 10px;margin:6px 0;background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.3);border-radius:6px;font-size:12px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#60a5fa;font-weight:500;cursor:pointer;user-select:none;transition:all 0.15s ease;'
          badge.title = 'Click to show / hide raw action JSON'
          badge.innerHTML = `
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
        const stopSelectors = [
          'button[data-testid="stop-button"]',
          'button[aria-label*="Stop generating" i]',
          'button[aria-label*="Stop Response" i]',
          'button[aria-label*="Stop streaming" i]',
          'button[aria-label="Stop" i]'
        ]
        for (const sel of stopSelectors) {
          const btn = document.querySelector(sel)
          if (btn && (btn as HTMLElement).offsetParent !== null && !(btn as HTMLButtonElement).disabled) {
            const rect = btn.getBoundingClientRect()
            if (rect.width > 0 && rect.height > 0) {
              const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase()
              if (ariaLabel.includes('read') || ariaLabel.includes('voice') || ariaLabel.includes('speech') || ariaLabel.includes('audio')) {
                continue
              }
              return true
            }
          }
        }
        if (document.querySelector('.result-streaming, [data-is-streaming="true"], .cursor-blinking')) {
          return true
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
          scanTimeout = setTimeout(scanForActions, 300)
          return
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
            ((targetContainer.closest && targetContainer.closest('article, [data-testid*="conversation-turn"]')) ||
              targetContainer)) ||
          document
        const codeElements: HTMLElement[] = []
        searchScope.querySelectorAll(
          'code-block, pre, code, [class*="code-container"], [class*="code-block"], div[class*="overflow-y-auto"] code, [class*="language-workbench"]'
        ).forEach((el) => {
          codeElements.push(el as HTMLElement)
          if ((el as any).shadowRoot) {
            try {
              (el as any).shadowRoot.querySelectorAll('pre, code, div').forEach((s: any) => codeElements.push(s))
            } catch (_) {}
          }
        })
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
          const text = (document.body ? (document.body.innerText || document.body.textContent || '') : '')
          const hasPromptGuide =
            hasHiddenPrompt ||
            text.includes('You are integrated with Workbench Desktop') ||
            text.includes('Available Workbench Actions')

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
      }, 300)
    }

    // Set up MutationObserver on document
    const observer = new MutationObserver(() => {
      scanForActions()
      checkPrimedStatus()
      hideFeedbackBubbles()
    })

    function markHistoricalActions() {
      try {
        const blocks = document.querySelectorAll(
          'code-block, pre, code, [class*="code-container"], [class*="code-block"], div[class*="overflow-y-auto"] code, [class*="language-workbench"]'
        )
        const now = Date.now()
        blocks.forEach((el) => {
          const htmlEl = el as HTMLElement
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
      } catch (_) {}
    }

    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true, characterData: true })
      checkPrimedStatus()
      hideFeedbackBubbles()
      setTimeout(markHistoricalActions, 400)
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        observer.observe(document.body, { childList: true, subtree: true, characterData: true })
        checkPrimedStatus()
        hideFeedbackBubbles()
        setTimeout(markHistoricalActions, 400)
      })
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

    // Capture Escape key to abort in-flight actions, and Enter to detect new human prompt
    window.addEventListener(
      'keydown',
      (e: KeyboardEvent) => {
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
    try {
      ipcRenderer.on('workbench:action-mode-changed', (_e, dataOrBool: any) => {
        const enabled = typeof dataOrBool === 'boolean' ? dataOrBool : Boolean(dataOrBool?.enabled)
        isActionModeGloballyEnabled = enabled
        const existing = document.getElementById('wb-chat-status-card')
        if (existing) {
          renderStatusCard('status')
        }
      })
    } catch (_) {}

    function getInputField(): HTMLElement | null {
      return (
        document.querySelector('#prompt-textarea') ||
        document.querySelector('div[contenteditable="true"].ProseMirror') ||
        document.querySelector('rich-textarea div[contenteditable="true"]') ||
        document.querySelector('.ql-editor') ||
        document.querySelector('#chat-input') ||
        document.querySelector('div[contenteditable="true"]') ||
        document.querySelector('textarea')
      ) as HTMLElement | null
    }

    function getInputValue(el: HTMLElement): string {
      if (el.tagName === 'TEXTAREA') {
        return (el as HTMLTextAreaElement).value || ''
      }
      return el.innerText || el.textContent || ''
    }

    function clearInputField(el: HTMLElement) {
      if (el.tagName === 'TEXTAREA') {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
        if (nativeSetter) {
          nativeSetter.call(el, '')
        } else {
          (el as HTMLTextAreaElement).value = ''
        }
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      } else {
        el.textContent = ''
        el.dispatchEvent(new InputEvent('input', { bubbles: true, data: '' }))
      }
    }

    function checkIsPrimed(): boolean {
      try {
        if (document.querySelector('.wb-hidden-action-prompt')) return true
        const text = document.body ? document.body.innerText || document.body.textContent || '' : ''
        return (
          text.includes('You are integrated with Workbench Desktop') ||
          text.includes('Available Workbench Actions')
        )
      } catch (_) {
        return false
      }
    }

    async function renderStatusCard(type: 'status' | 'connected') {
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

      const isPrimed = type === 'connected' ? true : (isActionModeGloballyEnabled && checkIsPrimed())
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
        display: block;
        margin: 10px auto;
        max-width: 680px;
        width: calc(100% - 24px);
        background: linear-gradient(135deg, rgba(15, 23, 42, 0.96), rgba(30, 41, 59, 0.96));
        border: 1px solid ${isPrimed ? 'rgba(52, 211, 153, 0.4)' : 'rgba(245, 158, 11, 0.4)'};
        border-radius: 8px;
        padding: 12px 16px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.45);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #f1f5f9;
        font-size: 13px;
        line-height: 1.5;
        z-index: 9999;
        animation: wbFadeIn 0.2s ease-out;
      `

      if (!document.getElementById('wb-chat-cmd-styles')) {
        const style = document.createElement('style')
        style.id = 'wb-chat-cmd-styles'
        style.textContent = `
          @keyframes wbFadeIn {
            from { opacity: 0; transform: translateY(6px); }
            to { opacity: 1; transform: translateY(0); }
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

      if (isPrimed) {
        card.innerHTML = `
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
            <div style="display:flex; align-items:center; gap:6px; font-weight:600; color:#34d399;">
              <span>⚡</span> <span>Workbench</span>
              <span style="font-size:11px; background:rgba(52,211,153,0.15); border:1px solid rgba(52,211,153,0.4); padding:1px 6px; border-radius:3px;">● Primed</span>
            </div>
            <button class="wb-cmd-close-btn" id="wb-card-close-btn" title="Close">✕</button>
          </div>
          <div style="font-size:12px; color:#cbd5e1; margin-bottom:4px;">
            <strong>Target:</strong> <code style="background:rgba(255,255,255,0.08); padding:1px 5px; border-radius:3px; color:#a7f3d0;">${targetLabel}: ${folderName}</code>
            <span style="color:#64748b; font-size:11px; margin-left:6px;">(${currentActiveDir || 'No path'})</span>
          </div>
          <div style="font-size:11.5px; color:#94a3b8; margin-bottom:8px;">
            This chat is primed and connected to local files.
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <button class="wb-cmd-btn-disable" id="wb-cmd-trigger-disable-btn">Disable</button>
          </div>
        `
      } else {
        card.innerHTML = `
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
            <div style="display:flex; align-items:center; gap:6px; font-weight:600; color:#f59e0b;">
              <span>⚡</span> <span>Workbench</span>
              <span style="font-size:11px; background:rgba(245,158,11,0.15); border:1px solid rgba(245,158,11,0.4); padding:1px 6px; border-radius:3px; color:#fbbf24;">○ Unprimed</span>
            </div>
            <button class="wb-cmd-close-btn" id="wb-card-close-btn" title="Close">✕</button>
          </div>
          <div style="font-size:12px; color:#cbd5e1; margin-bottom:6px;">
            <strong>Target:</strong> <code style="background:rgba(255,255,255,0.08); padding:1px 5px; border-radius:3px; color:#fde68a;">${targetLabel}: ${folderName}</code>
            <span style="color:#64748b; font-size:11px; margin-left:6px;">(${currentActiveDir || 'No path'})</span>
          </div>
          <div style="font-size:11.5px; color:#94a3b8; margin-bottom:8px;">
            This chat is not connected to local files yet.
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <button class="wb-cmd-btn-prime" id="wb-cmd-trigger-prime-btn">⚡ Prime Chat</button>
            <span style="font-size:11px; color:#64748b;">or type <code style="color:#cbd5e1;">/connect</code></span>
          </div>
        `
      }

      const inputEl = getInputField()
      const formEl = inputEl
        ? inputEl.closest('form') || inputEl.closest('fieldset') || inputEl.closest('div[class*="relative"]')
        : null
      if (formEl && formEl.parentNode) {
        formEl.parentNode.insertBefore(card, formEl)
      } else {
        document.body.appendChild(card)
      }

      const closeBtn = card.querySelector('#wb-card-close-btn')
      if (closeBtn) {
        closeBtn.addEventListener('click', () => card.remove())
      }

      const primeBtn = card.querySelector('#wb-cmd-trigger-prime-btn')
      if (primeBtn) {
        primeBtn.addEventListener('click', () => {
          primeBtn.textContent = '⚡ Priming...'
          ;(primeBtn as HTMLButtonElement).disabled = true
          isActionModeGloballyEnabled = true
          ipcRenderer.send('workbench:prime-active-chat', {})
          setTimeout(() => {
            renderStatusCard('connected')
          }, 1200)
        })
      }

      const disableBtn = card.querySelector('#wb-cmd-trigger-disable-btn')
      if (disableBtn) {
        disableBtn.addEventListener('click', () => {
          disableBtn.textContent = 'Disabling...'
          ;(disableBtn as HTMLButtonElement).disabled = true
          isActionModeGloballyEnabled = false
          ipcRenderer.invoke('workbench:set-action-mode', { enabled: false })
          setTimeout(() => {
            renderStatusCard('status')
          }, 300)
        })
      }
    }

    function handleCommand(cmd: string) {
      if (cmd === '/status') {
        renderStatusCard('status')
      } else if (cmd === '/connect' || cmd === '/prime') {
        isActionModeGloballyEnabled = true
        ipcRenderer.send('workbench:prime-active-chat', {})
        renderStatusCard('connected')
      }
    }

    window.addEventListener(
      'keydown',
      (e: KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
          if (!isChatSite()) return
          const inputEl = getInputField()
          if (!inputEl) return
          const val = getInputValue(inputEl).trim().toLowerCase()
          if (val === '/status' || val === '/connect' || val === '/prime') {
            e.preventDefault()
            e.stopPropagation()
            e.stopImmediatePropagation()
            clearInputField(inputEl)
            handleCommand(val)
          }
        }
      },
      true
    )

    window.addEventListener(
      'click',
      (e: MouseEvent) => {
        const target = e.target as HTMLElement | null
        const sendBtn = target?.closest(
          'button[data-testid*="send"], button[aria-label*="Send"], button[aria-label*="send"], button[type="submit"]'
        )
        if (sendBtn) {
          if (!isChatSite()) return
          const inputEl = getInputField()
          if (!inputEl) return
          const val = getInputValue(inputEl).trim().toLowerCase()
          if (val === '/status' || val === '/connect' || val === '/prime') {
            e.preventDefault()
            e.stopPropagation()
            e.stopImmediatePropagation()
            clearInputField(inputEl)
            handleCommand(val)
          }
        }
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
      bubbleEl.innerHTML = `
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

