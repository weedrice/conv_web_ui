(function () {
  'use strict';

  var ns = (window.AIChatSkin = window.AIChatSkin || {});
  var VIEW_HOME_CLASS = 'skin-view-home';
  var VIEW_CHAT_CLASS = 'skin-view-chat';

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

  function updateViewState(adapter) {
    if (!adapter || !document.body) return;

    var messages = [];
    try {
      messages = adapter.getMessages() || [];
    } catch (e) {
      messages = [];
    }

    var nextIsChat = messages.length > 0;
    var nextIsHome = messages.length === 0;
    var prevIsChat = document.body.classList.contains(VIEW_CHAT_CLASS);
    var prevIsHome = document.body.classList.contains(VIEW_HOME_CLASS);

    document.body.classList.add('skin-platform-' + adapter.name);
    document.body.classList.toggle(VIEW_CHAT_CLASS, nextIsChat);
    document.body.classList.toggle(VIEW_HOME_CLASS, nextIsHome);

    if (prevIsChat !== nextIsChat || prevIsHome !== nextIsHome) {
      console.log('[AIChatSkin] View state changed:', {
        platform: adapter.name,
        path: window.location.pathname,
        messages: messages.length,
        nextView: nextIsHome ? 'home' : 'chat',
        bodyClasses: document.body.className
      });
    } else {
      console.log('[AIChatSkin] View state check:', {
        platform: adapter.name,
        path: window.location.pathname,
        messages: messages.length,
        currentView: nextIsHome ? 'home' : 'chat'
      });
    }
  }

  function setupStorageListener(adapter) {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === 'sync' || area === 'local') {
        console.log('[AIChatSkin] Settings changed, re-rendering.');
        updateViewState(adapter);
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
    ns.updateViewState = updateViewState;

    updateViewState(adapter);

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
        updateViewState(adapter);
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
