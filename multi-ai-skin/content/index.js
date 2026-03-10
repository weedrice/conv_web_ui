(function () {
  'use strict';

  var ns = (window.AIChatSkin = window.AIChatSkin || {});

  function detectPlatform() {
    var hostname = window.location.hostname;
    var platformKeys = Object.keys(ns.platforms || {});

    for (var i = 0; i < platformKeys.length; i++) {
      var platform = ns.platforms[platformKeys[i]];
      if (platform && platform.matches(hostname)) {
        return platform;
      }
    }

    return null;
  }

  function setupStorageListener(adapter) {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === 'sync' || area === 'local') {
        console.log('[AIChatSkin] Settings changed, re-rendering.');
        ns.renderer.reRenderAll(adapter);
      }
    });
  }

  function init() {
    var adapter = detectPlatform();

    if (!adapter) {
      console.log('[AIChatSkin] Unsupported platform: ' + window.location.hostname);
      return;
    }

    console.log('[AIChatSkin] Platform detected: ' + adapter.name);
    ns.currentAdapter = adapter;

    setupStorageListener(adapter);
    ns.observer.startObserving(adapter);

    chrome.storage.sync.get({ enabled: true }, function (settings) {
      if (!settings.enabled) {
        console.log('[AIChatSkin] Skin is disabled.');
        return;
      }

      var retryCount = 0;
      var maxRetries = 5;

      function tryRender() {
        var messages = adapter.getMessages();
        if (messages.length > 0 || retryCount >= maxRetries) {
          ns.renderer.renderAll(adapter);
          console.log('[AIChatSkin] Initial render complete (' + messages.length + ' messages, try ' + (retryCount + 1) + ').');
        } else {
          retryCount += 1;
          setTimeout(tryRender, 500);
        }
      }

      setTimeout(tryRender, 300);
    });
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
