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

