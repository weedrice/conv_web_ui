(function () {
  'use strict';

  var ns = (window.AIChatSkin = window.AIChatSkin || {});
  var VIEW_HOME_CLASS = 'skin-view-home';
  var VIEW_CHAT_CLASS = 'skin-view-chat';
  var CHATGPT_PROFILE_BG_FALLBACK = 'rgba(63, 69, 77, 0.95)';
  var projectThemeIntervalId = null;

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

  function isTransparent(color) {
    if (!color) return true;
    return color === 'transparent' || color === 'rgba(0, 0, 0, 0)' || color === 'rgba(0,0,0,0)';
  }

  function syncChatGPTProfileFooterBackground(adapter) {
    if (!adapter || adapter.name !== 'chatgpt') return;

    var profileButtons = document.querySelectorAll('[data-testid="accounts-profile-button"]');
    if (!profileButtons || profileButtons.length === 0) return;

    for (var i = 0; i < profileButtons.length; i++) {
      var button = profileButtons[i];
      var sidebar = button.closest('aside') || document.querySelector('aside');
      var bg = '';

      if (sidebar && window.getComputedStyle) {
        bg = window.getComputedStyle(sidebar).backgroundColor;
      }
      if (isTransparent(bg)) {
        bg = CHATGPT_PROFILE_BG_FALLBACK;
      }

      var stickyContainer =
        button.closest('.sticky.bottom-0') ||
        button.closest('.bg-token-bg-elevated-secondary') ||
        button.closest('[class*="bg-token-bg-elevated-secondary"]') ||
        button.parentElement;

      if (!stickyContainer || !stickyContainer.style) continue;

      stickyContainer.style.setProperty('background', bg, 'important');
      stickyContainer.style.setProperty('background-color', bg, 'important');

      var relativeContainer = stickyContainer.querySelector(':scope > .relative');
      if (relativeContainer && relativeContainer.style) {
        relativeContainer.style.setProperty('background', bg, 'important');
        relativeContainer.style.setProperty('background-color', bg, 'important');
      }
    }
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

  function syncGeminiUserActionButtons(adapter) {
    if (!adapter || adapter.name !== 'gemini') return;

    var queryContents = document.querySelectorAll('user-query[data-skin-processed="true"] .query-content');
    if (!queryContents || queryContents.length === 0) return;

    for (var i = 0; i < queryContents.length; i++) {
      var queryContent = queryContents[i];
      if (!queryContent || !queryContent.style) continue;

      queryContent.style.setProperty('position', 'relative', 'important');

      var bubbleCol = queryContent.querySelector('.skin-bubble-wrap-user .skin-content-col-user');
      if (!bubbleCol) continue;

      var qcRect = queryContent.getBoundingClientRect();
      var bubbleRect = bubbleCol.getBoundingClientRect();
      if (!qcRect || !bubbleRect) continue;

      var wrappers = [];
      var children = queryContent.children;
      for (var c = 0; c < children.length; c++) {
        if (children[c] && children[c].querySelector && children[c].querySelector('button.action-button')) {
          wrappers.push(children[c]);
        }
      }
      if (wrappers.length === 0) continue;

      var bubbleTop = Math.max(0, bubbleRect.top - qcRect.top);
      var bubbleHeight = Math.max(0, bubbleRect.height);
      var bubbleLeft = Math.max(0, bubbleRect.left - qcRect.left);
      var gap = 6;
      var widths = [];
      var heights = [];
      var totalWidth = 0;

      for (var w0 = 0; w0 < wrappers.length; w0++) {
        var btn0 = wrappers[w0].querySelector('button.action-button');
        var btnWidth0 = 28;
        if (btn0) {
          var btnRect0 = btn0.getBoundingClientRect();
          if (btnRect0 && btnRect0.width) btnWidth0 = btnRect0.width;
        }
        widths.push(btnWidth0);
        heights.push(28);
        if (btn0) {
          var btnRectH = btn0.getBoundingClientRect();
          if (btnRectH && btnRectH.height) heights[w0] = btnRectH.height;
        }
        totalWidth += btnWidth0;
      }
      if (wrappers.length > 1) totalWidth += gap * (wrappers.length - 1);

      var cursorLeft = Math.max(0, bubbleLeft - totalWidth - 8);

      for (var w = 0; w < wrappers.length; w++) {
        var wrap = wrappers[w];
        var btn = wrap.querySelector('button.action-button');
        var btnWidth = widths[w] || 28;
        var btnHeight = heights[w] || 28;
        var centeredTop = Math.max(0, bubbleTop + (bubbleHeight - btnHeight) / 2);
        if (wrap.style) {
          wrap.style.setProperty('position', 'absolute', 'important');
          wrap.style.setProperty('top', centeredTop + 'px', 'important');
          wrap.style.setProperty('left', Math.max(0, cursorLeft) + 'px', 'important');
          wrap.style.setProperty('right', 'auto', 'important');
          wrap.style.setProperty('margin', '0', 'important');
          wrap.style.setProperty('padding', '0', 'important');
          wrap.style.setProperty('z-index', '3', 'important');
        }
        cursorLeft += btnWidth + gap;
      }
    }
  }

  function startChatGPTProjectThemeSync(adapter) {
    if (!adapter || adapter.name !== 'chatgpt') return;

    if (projectThemeIntervalId) {
      clearInterval(projectThemeIntervalId);
    }
    projectThemeIntervalId = setInterval(function () {
      syncChatGPTProjectHomeBackground(adapter);
    }, 700);
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
    syncChatGPTProfileFooterBackground(adapter);
    syncChatGPTProjectHomeBackground(adapter);
    syncGeminiUserActionButtons(adapter);

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
    startChatGPTProjectThemeSync(adapter);

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
