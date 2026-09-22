import { webFrame } from 'electron'

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
