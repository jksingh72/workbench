const { webFrame } = require('electron')

// Execute in the webpage's main world (World ID 0) before any site scripts run
webFrame.executeJavaScriptInIsolatedWorld(0, [
  {
    code: `
      (function() {
        try {
          if (window.navigator && window.navigator.credentials) {
            window.navigator.credentials.get = function() {
              return Promise.reject(new DOMException('WebAuthn disabled', 'NotAllowedError'));
            };
            window.navigator.credentials.create = function() {
              return Promise.reject(new DOMException('WebAuthn disabled', 'NotAllowedError'));
            };
          }
          if (window.PublicKeyCredential) {
            window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = function() {
              return Promise.resolve(false);
            };
            window.PublicKeyCredential.isConditionalMediationAvailable = function() {
              return Promise.resolve(false);
            };
          }
        } catch (err) {
          // ignore
        }
      })();
    `,
  },
])
