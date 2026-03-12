/**
 * observer.js - MutationObserver manager
 *
 * Watches DOM changes and renders new messages or updates streaming state.
 */
(function () {
  'use strict';

  var ns = (window.AIChatSkin = window.AIChatSkin || {});

  var mainObserver = null;
  var debounceTimer = null;
  var pollIntervalId = null;
  var streamCheckTimers = {};
  var DEBOUNCE_MS = 150;
  var STREAM_COMPLETE_DEBOUNCE_MS = 300;
  var STREAM_STABLE_MS = 1400; // stable window after stream stops
  var MAX_STREAM_WAIT_MS = 12000; // hard timeout fallback
  var POLL_INTERVAL_MS = 2000; // base polling interval
  var IDLE_POLL_MULTIPLIER = 4; // idle polling every 8s (2s * 4)
  var streamStartTimes = {};
  var streamLastTexts = {};
  var streamStableSince = {};
  var navigationSetup = false;
  var idlePollTicks = 0;

  function normalizeVisibleText(text) {
    return String(text || '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getRenderedTextBySkinId(skinId) {
    if (!skinId) return '';
    var wraps = document.querySelectorAll('.skin-bubble-wrap[data-skin-source="' + skinId + '"]');
    if (!wraps || wraps.length === 0) return '';

    var text = '';
    for (var i = 0; i < wraps.length; i++) {
      var bubbles = wraps[i].querySelectorAll('.skin-bubble');
      for (var j = 0; j < bubbles.length; j++) {
        text += ' ' + (bubbles[j].textContent || '');
      }
    }
    return normalizeVisibleText(text);
  }

  function clearStreamState(elId) {
    if (!elId) return;
    if (streamCheckTimers[elId]) {
      clearTimeout(streamCheckTimers[elId]);
      delete streamCheckTimers[elId];
    }
    delete streamStartTimes[elId];
    delete streamLastTexts[elId];
    delete streamStableSince[elId];
  }

  /**
   * Stream completion check with stability window.
   * We only finalize after content remains unchanged for STREAM_STABLE_MS,
   * or after MAX_STREAM_WAIT_MS if text is also stable.
   */
  function setupStreamCheck(msgEl, adapter) {
    var elId = msgEl.getAttribute('data-skin-stream-id');
    if (!elId) {
      elId = 'stream_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      msgEl.setAttribute('data-skin-stream-id', elId);
    }

    if (!streamStartTimes[elId]) {
      streamStartTimes[elId] = Date.now();
    }

    var now = Date.now();
    var initialText = normalizeVisibleText(adapter.getTextContent(msgEl));
    if (streamLastTexts[elId] == null) {
      streamLastTexts[elId] = initialText;
      streamStableSince[elId] = now;
    }

    if (streamCheckTimers[elId]) {
      clearTimeout(streamCheckTimers[elId]);
    }

    streamCheckTimers[elId] = setTimeout(function checkStream() {
      var currentText = normalizeVisibleText(adapter.getTextContent(msgEl));
      var prevText = streamLastTexts[elId] == null ? '' : streamLastTexts[elId];
      var isStillStreaming = false;
      try {
        isStillStreaming = adapter.isStreaming(msgEl);
      } catch (e) {}

      var elapsed = Date.now() - (streamStartTimes[elId] || Date.now());

      if (currentText !== prevText) {
        streamLastTexts[elId] = currentText;
        streamStableSince[elId] = Date.now();
      }

      var stableFor = Date.now() - (streamStableSince[elId] || Date.now());
      var hasContent = currentText.length > 0;
      var stableEnough = stableFor >= STREAM_STABLE_MS;
      var timedOutStable = elapsed >= MAX_STREAM_WAIT_MS && currentText === prevText;
      var shouldComplete = hasContent && ((!isStillStreaming && stableEnough) || timedOutStable);

      if (shouldComplete) {
        clearStreamState(elId);
        msgEl.removeAttribute('data-skin-stream-id');
        console.log('[AIChatSkin] stream finalize (stableFor: ' + stableFor + 'ms, elapsed: ' + elapsed + 'ms, adapterDone: ' + !isStillStreaming + ')');
        ns.renderer.renderMessage(msgEl, adapter, true);
        return;
      }

      streamCheckTimers[elId] = setTimeout(checkStream, STREAM_COMPLETE_DEBOUNCE_MS);
    }, STREAM_COMPLETE_DEBOUNCE_MS);
  }

  /** MutationObserver callback (debounced). */
  function createObserverCallback(adapter) {
    return function (mutations) {
      var hasRelevantMutation = false;
      for (var i = 0; i < mutations.length; i++) {
        var target = mutations[i].target;
        if (!target.className || typeof target.className !== 'string' || !target.className.includes('skin-')) {
          hasRelevantMutation = true;
          break;
        }
        if (mutations[i].addedNodes && mutations[i].addedNodes.length > 0) {
          for (var j = 0; j < mutations[i].addedNodes.length; j++) {
            var node = mutations[i].addedNodes[j];
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (!node.className || typeof node.className !== 'string' || !node.className.includes('skin-')) {
                hasRelevantMutation = true;
                break;
              }
            }
          }
          if (hasRelevantMutation) break;
        }
      }

      if (!hasRelevantMutation) return;

      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      debounceTimer = setTimeout(function () {
        processNewMessages(adapter);
      }, DEBOUNCE_MS);
    };
  }

  /** Process newly discovered messages and streaming state changes. */
  function processNewMessages(adapter) {
    if (ns.updateViewState) {
      ns.updateViewState(adapter);
    }

    var messages = adapter.getMessages();

    for (var i = 0; i < messages.length; i++) {
      var msgEl = messages[i];
      var isProcessed = msgEl.getAttribute('data-skin-processed') === 'true';
      var role = adapter.getRole(msgEl);

      if (!role) continue;

      if (!isProcessed) {
        var isStreaming = adapter.isStreaming(msgEl);

        if (isStreaming) {
          ns.renderer.renderMessage(msgEl, adapter);
          setupStreamCheck(msgEl, adapter);
        } else {
          ns.renderer.renderMessage(msgEl, adapter);
        }
      } else {
        var skinId = msgEl.getAttribute('data-skin-id');
        if (skinId) {
          var existingWraps = document.querySelectorAll('.skin-bubble-wrap[data-skin-source="' + skinId + '"]');
          if (existingWraps.length > 0) {
            var wasTyping = existingWraps[0].getAttribute('data-skin-rendered') === 'typing';
            var isStillStreaming = adapter.isStreaming(msgEl);
            var sourceText = normalizeVisibleText(adapter.getTextContent(msgEl));
            var renderedText = getRenderedTextBySkinId(skinId);

            if (wasTyping && !isStillStreaming) {
              // Do not finalize immediately; wait for stable window.
              setupStreamCheck(msgEl, adapter);
            } else if (wasTyping && isStillStreaming) {
              setupStreamCheck(msgEl, adapter);
            } else if (!wasTyping && sourceText && sourceText !== renderedText) {
              // Post-completion reconcile also uses stable completion path.
              setupStreamCheck(msgEl, adapter);
            }
          }
        }
      }
    }

    if (ns.renderer && ns.renderer.cleanupStaleBubbles) {
      ns.renderer.cleanupStaleBubbles(adapter);
    }
  }

  /** SPA navigation detection (pushState/replaceState/popstate). */
  function setupNavigationDetection(adapter) {
    if (navigationSetup) return;
    navigationSetup = true;

    var originalPushState = history.pushState;
    history.pushState = function () {
      originalPushState.apply(this, arguments);
      onNavigationChange(adapter);
    };

    var originalReplaceState = history.replaceState;
    history.replaceState = function () {
      originalReplaceState.apply(this, arguments);
      onNavigationChange(adapter);
    };

    window.addEventListener('popstate', function () {
      onNavigationChange(adapter);
    });
  }

  function onNavigationChange(adapter) {
    setTimeout(function () {
      if (ns.updateViewState) {
        ns.updateViewState(adapter);
      }
      ns.renderer.reRenderAll(adapter);
    }, 800);
  }


  function hasActiveStreamingWork() {
    if (Object.keys(streamCheckTimers).length > 0) return true;
    return !!document.querySelector('.skin-bubble-wrap[data-skin-rendered="typing"]');
  }
  function startPolling(adapter) {
    if (pollIntervalId) {
      clearInterval(pollIntervalId);
    }

    idlePollTicks = 0;

    pollIntervalId = setInterval(function () {
      var hasActiveStream = hasActiveStreamingWork();

      if (!hasActiveStream) {
        idlePollTicks += 1;

        var hiddenMultiplier = IDLE_POLL_MULTIPLIER * 3;
        var requiredTicks = document.visibilityState === 'hidden' ? hiddenMultiplier : IDLE_POLL_MULTIPLIER;
        if (idlePollTicks < requiredTicks) {
          return;
        }
      }

      idlePollTicks = 0;
      processNewMessages(adapter);
    }, POLL_INTERVAL_MS);
  }

  function startObserving(adapter) {
    if (mainObserver) {
      mainObserver.disconnect();
    }

    var container = document.body;

    mainObserver = new MutationObserver(createObserverCallback(adapter));
    mainObserver.observe(container, {
      childList: true,
      subtree: true
    });

    setupNavigationDetection(adapter);
    startPolling(adapter);

    console.log('[AIChatSkin] Observer started (platform: ' + adapter.name + ', poll: ' + POLL_INTERVAL_MS + 'ms)');
  }

  function stopObserving() {
    if (mainObserver) {
      mainObserver.disconnect();
      mainObserver = null;
    }

    if (pollIntervalId) {
      clearInterval(pollIntervalId);
      pollIntervalId = null;
    }

    for (var key in streamCheckTimers) {
      if (streamCheckTimers.hasOwnProperty(key)) {
        clearTimeout(streamCheckTimers[key]);
      }
    }
    streamCheckTimers = {};
    streamStartTimes = {};
    streamLastTexts = {};
    streamStableSince = {};
    idlePollTicks = 0;

    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  ns.observer = {
    startObserving: startObserving,
    stopObserving: stopObserving,
    processNewMessages: processNewMessages
  };

})();
