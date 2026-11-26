(function () {
  'use strict';

  var ns = (window.AIChatSkin = window.AIChatSkin || {});
  var VIEW_HOME_CLASS = 'skin-view-home';
  var VIEW_CHAT_CLASS = 'skin-view-chat';
  var projectThemeObserver = null;
  var projectThemeDebounceId = null;
  var projectThemeVisibilityHooked = false;

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

  function syncChatGPTProjectHomeBackground(adapter) {
    if (!adapter || adapter.name !== 'chatgpt') return;

    var topArea =
      document.querySelector('.content-fade-top') ||
      document.querySelector('.offset-padding-top-4.sticky.top-0');
    if (!topArea || !topArea.style) return;
    topArea.style.removeProperty('background');
    topArea.style.removeProperty('background-color');

    var topAreaParent = topArea.parentElement;
    if (topAreaParent && topAreaParent.style) {
      topAreaParent.style.removeProperty('background');
      topAreaParent.style.removeProperty('background-color');
    }

    var surface = topArea.querySelector('[data-composer-surface="true"]');
    if (surface && surface.style) {
      surface.style.setProperty('background', 'rgb(248, 250, 252)', 'important');
      surface.style.setProperty('background-color', 'rgb(248, 250, 252)', 'important');
      surface.style.setProperty('border', '1px solid rgb(183, 190, 198)', 'important');
      surface.style.setProperty('box-shadow', '0 8px 18px rgba(24, 31, 40, 0.08)', 'important');
    }

    // Force token-based dark surfaces inside project top area.
    var brightNodes = topArea.querySelectorAll(
      '[data-composer-surface="true"], .bg-token-bg-primary, [class*="bg-token-bg-primary"], [class*="bg-token-bg-elevated-secondary"]'
    );
    for (var j = 0; j < brightNodes.length; j++) {
      var node = brightNodes[j];
      if (!node || !node.style) continue;
      node.style.setProperty('background', 'rgb(248, 250, 252)', 'important');
      node.style.setProperty('background-color', 'rgb(248, 250, 252)', 'important');
      node.style.setProperty('border-color', 'rgb(183, 190, 198)', 'important');
    }

    var tabs = topArea.querySelectorAll('[role="tab"]');
    for (var i = 0; i < tabs.length; i++) {
      var tab = tabs[i];
      var state = tab.getAttribute('data-state');
      if (!tab.style) continue;

      if (state === 'active') {
        tab.style.setProperty('background', 'rgb(255, 255, 255)', 'important');
        tab.style.setProperty('color', 'rgba(22, 27, 33, 0.98)', 'important');
        tab.style.setProperty('border', '1px solid rgb(183, 190, 198)', 'important');
      } else {
        tab.style.removeProperty('background');
        tab.style.removeProperty('background-color');
        tab.style.removeProperty('border');
        tab.style.setProperty('color', 'rgba(78, 89, 102, 0.9)', 'important');
      }
    }

    var title = topArea.querySelector('h1, h2');
    if (title && title.style) {
      title.style.setProperty('color', 'rgba(22, 27, 33, 0.96)', 'important');
    }
  }

  function shouldRunChatGPTProjectThemeSync(adapter) {
    if (!adapter || adapter.name !== 'chatgpt') return false;
    if (!ns.renderer.contextActive(adapter)) return false;
    if (!document.body) return false;
    if (document.visibilityState === 'hidden') return false;
    return document.body.classList.contains(VIEW_HOME_CLASS);
  }

  function queueChatGPTProjectThemeSync(adapter) {
    if (!shouldRunChatGPTProjectThemeSync(adapter)) return;

    if (projectThemeDebounceId) {
      clearTimeout(projectThemeDebounceId);
    }

    projectThemeDebounceId = setTimeout(function () {
      if (shouldRunChatGPTProjectThemeSync(adapter)) syncChatGPTProjectHomeBackground(adapter);
    }, 120);
  }

  function startChatGPTProjectThemeSync(adapter) {
    if (!adapter || adapter.name !== 'chatgpt') return;

    if (projectThemeObserver) {
      projectThemeObserver.disconnect();
      projectThemeObserver = null;
    }

    queueChatGPTProjectThemeSync(adapter);

    if (!document.body) return;

    projectThemeObserver = new MutationObserver(function () {
      queueChatGPTProjectThemeSync(adapter);
    });
    projectThemeObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
    const signal = ns.renderer.signal;
    signal.addEventListener('abort', function () {
      projectThemeObserver.disconnect();
      clearTimeout(projectThemeDebounceId);
    }, { once: true });

    if (!projectThemeVisibilityHooked) {
      document.addEventListener('visibilitychange', function () {
        queueChatGPTProjectThemeSync(adapter);
      }, { signal });
      projectThemeVisibilityHooked = true;
    }
  }

  function updateViewState(adapter, count) {
    const nextIsChat = count > 0;
    const nextIsHome = !nextIsChat;
    document.body.classList.add('skin-platform-' + adapter.name);
    document.body.classList.toggle(VIEW_CHAT_CLASS, nextIsChat);
    document.body.classList.toggle(VIEW_HOME_CLASS, nextIsHome);
    queueChatGPTProjectThemeSync(adapter);
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

    if (!ns.renderer.contextActive(adapter)) return;
    startChatGPTProjectThemeSync(adapter);
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === 'sync' || area === 'local') ns.renderer.reloadSettings(adapter);
    });
    ns.observer.startObserving(adapter);
    ns.renderer.reloadSettings(adapter);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
