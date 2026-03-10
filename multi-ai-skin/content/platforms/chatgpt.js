/**
 * chatgpt.js - ChatGPT DOM adapter
 *
 * Reference snapshot:
 * - conversation turn: [data-testid^="conversation-turn-"] (or article turn wrappers)
 * - message nodes: [data-message-author-role="user|assistant"]
 */
(function () {
  'use strict';

  var ns = (window.AIChatSkin = window.AIChatSkin || {});
  ns.platforms = ns.platforms || {};
  var DEBUG_MAX_LOG = 20;
  var debugCount = 0;

  function debugLog(label, payload) {
    if (debugCount >= DEBUG_MAX_LOG) return;
    debugCount += 1;
    try {
      console.log('[AIChatSkin][GPT-Debug]', label, payload);
    } catch (e) {}
  }

  function getTurnContainer(el) {
    return el.closest('[data-testid^="conversation-turn-"]') ||
           el.closest('[data-testid^="conversation-turn"]') ||
           el.closest('article') ||
           el;
  }

  function isValidTurnContainer(turn) {
    if (!turn || !turn.matches) return false;

    // Exclude composer/input region.
    if (turn.closest && turn.closest('[data-testid="composer"], form[aria-label*="message"], form[aria-label*="Message"]')) {
      return false;
    }

    if (turn.matches('[data-testid^="conversation-turn-"], [data-testid^="conversation-turn"]')) {
      return true;
    }
    if (turn.matches('article[data-turn-id], article[data-turn]')) {
      return true;
    }
    return false;
  }

  function getValidTurnContainer(el) {
    var turn = getTurnContainer(el);
    if (!isValidTurnContainer(turn)) {
      debugLog('invalid_turn_container', {
        tag: turn && turn.tagName,
        className: turn && turn.className ? String(turn.className).slice(0, 220) : '',
        dataTestid: turn && turn.getAttribute ? turn.getAttribute('data-testid') : null,
        dataTurnId: turn && turn.getAttribute ? turn.getAttribute('data-turn-id') : null
      });
    }
    return isValidTurnContainer(turn) ? turn : null;
  }

  function shouldIgnoreElement(el) {
    if (!el) return true;
    if (el.closest && el.closest('.skin-bubble-wrap')) return true;
    return false;
  }

  function getChatGPTActionArea(el) {
    var turn = getValidTurnContainer(el);
    if (!turn || !turn.querySelector) {
      debugLog('action_area_no_turn', {
        role: el && el.getAttribute ? el.getAttribute('data-message-author-role') : null,
        messageId: el && el.getAttribute ? el.getAttribute('data-message-id') : null,
        outerHTML: el && el.outerHTML ? el.outerHTML.slice(0, 500) : ''
      });
      return null;
    }

    var actionSelector =
      '[data-testid="copy-turn-action-button"], [data-testid="good-response-turn-action-button"], [data-testid="bad-response-turn-action-button"], [data-testid="retry-button"]';

    // Prefer the nearest sibling block after the message node that contains action buttons.
    // This keeps insertion in the same vertical flow as normal message blocks.
    var messageNode = el.closest('[data-message-author-role]') || el;
    var cursor = messageNode;
    while (cursor && cursor !== turn) {
      var sibling = cursor.nextElementSibling;
      while (sibling) {
        if (sibling.matches && sibling.matches('.skin-bubble-container')) {
          sibling = sibling.nextElementSibling;
          continue;
        }
        if (sibling.querySelector && sibling.querySelector(actionSelector)) {
          return sibling;
        }
        sibling = sibling.nextElementSibling;
      }
      cursor = cursor.parentElement;
    }

    // Fallback: derive from first action button.
    var actionBtn = turn.querySelector(actionSelector);
    if (!actionBtn) {
      debugLog('action_button_not_found', {
        turnTestid: turn.getAttribute && turn.getAttribute('data-testid'),
        turnId: turn.getAttribute && (turn.getAttribute('data-turn-id') || turn.getAttribute('data-turn')),
        turnClass: turn.className ? String(turn.className).slice(0, 220) : ''
      });
      return null;
    }
    return actionBtn.closest('div[class*="turn-messages"]') || actionBtn.parentElement || actionBtn;
  }

  function getChatGPTMessageWrapper(el) {
    if (!el) return null;
    return el.closest('[data-message-author-role]') || el;
  }

  ns.platforms.chatgpt = {
    name: 'chatgpt',

    matches: function (hostname) {
      return hostname === 'chatgpt.com' || hostname === 'www.chatgpt.com';
    },

    getMessages: function () {
      var candidates = document.querySelectorAll(
        '[data-message-author-role="user"], [data-message-author-role="assistant"]'
      );
      var strictResult = [];
      var relaxedResult = [];
      var strictSeen = {};
      var relaxedSeen = {};

      for (var i = 0; i < candidates.length; i++) {
        var el = candidates[i];
        if (shouldIgnoreElement(el)) continue;

        // Skip composer/input area nodes.
        if (el.closest && el.closest('[data-testid="composer"], form[aria-label*="message"], form[aria-label*="Message"]')) continue;

        var key = el.getAttribute('data-message-id');
        if (!key) {
          // Fallback key to avoid duplicate insertion.
          var role = el.getAttribute('data-message-author-role') || 'unknown';
          key = role + '::' + (el.textContent || '').slice(0, 60) + '::' + i;
        }

        if (!relaxedSeen[key]) {
          relaxedSeen[key] = true;
          relaxedResult.push(el);
        }

        // Strict mode: real turn messages only (prevents bottom-fixed typing bubble issue).
        if (!getValidTurnContainer(el)) {
          debugLog('skip_message_outside_turn', {
            role: el.getAttribute('data-message-author-role'),
            messageId: el.getAttribute('data-message-id'),
            className: el.className ? String(el.className).slice(0, 220) : '',
            outerHTML: el.outerHTML ? el.outerHTML.slice(0, 500) : ''
          });
          continue;
        }

        if (strictSeen[key]) continue;
        strictSeen[key] = true;
        strictResult.push(el);
      }

      // Fallback to relaxed mode to avoid "no skin applied" regressions.
      if (strictResult.length === 0 && relaxedResult.length > 0) {
        debugLog('strict_empty_use_relaxed', { relaxedCount: relaxedResult.length });
        return relaxedResult;
      }

      return strictResult;
    },

    getRole: function (el) {
      var role = el.getAttribute('data-message-author-role');
      if (role === 'user') return 'user';
      if (role === 'assistant') return 'assistant';
      return null;
    },

    isStreaming: function (el) {
      try {
        var messageEl = el.closest('[data-message-id]') || el;
        var article = getTurnContainer(el);

        if (messageEl.hasAttribute('data-message-finished')) {
          return false;
        }

        // If turn actions are visible, generation is usually complete.
        var searchRoot = article || messageEl;
        var hasTurnActions = searchRoot.querySelector(
          '[data-testid="copy-turn-action-button"], [data-testid="good-response-turn-action-button"], [data-testid="bad-response-turn-action-button"]'
        );
        if (hasTurnActions) return false;

        if (searchRoot.querySelector('[data-is-streaming="true"], [aria-busy="true"]')) return true;
        if (searchRoot.querySelector('.result-streaming')) return true;
        if (searchRoot.querySelector('.agent-turn-loading')) return true;

        var streamingEls = searchRoot.querySelectorAll('[class*="streaming"]');
        for (var i = 0; i < streamingEls.length; i++) {
          var className = String(streamingEls[i].className || '');
          if (className.indexOf('skin-') === -1) return true;
        }

        if (searchRoot.querySelector('.cursor, [class*="cursor-blink"]')) return true;
      } catch (e) {
        console.warn('[AIChatSkin] ChatGPT isStreaming error:', e);
      }

      return false;
    },

    getTextContent: function (el) {
      var markdown = el.querySelector('.markdown');
      if (markdown) {
        return markdown.textContent || '';
      }

      var preWrap = el.querySelector('.whitespace-pre-wrap, [class*="whitespace"]');
      if (preWrap) {
        return preWrap.textContent || '';
      }
      return el.textContent || '';
    },

    getInnerHTML: function (el) {
      var markdown = el.querySelector('.markdown');
      if (markdown) {
        var clone = markdown.cloneNode(true);
        clone.querySelectorAll('button, [class*="copy"], [class*="action"]').forEach(function (btn) {
          btn.remove();
        });
        return clone.innerHTML;
      }
      return el.innerHTML;
    },

    getConversationContainer: function () {
      var firstTurn = document.querySelector('[data-testid^="conversation-turn-"], [data-testid^="conversation-turn"]');
      if (firstTurn && firstTurn.parentElement) return firstTurn.parentElement;

      return document.querySelector('[class*="react-scroll-to-bottom"]') ||
             document.querySelector('main') ||
             document.body;
    },

    getMessageWrapper: function (el) {
      var wrapper = getChatGPTMessageWrapper(el);
      if (wrapper) return wrapper;
      return el;
    },

    getActionArea: function (el) {
      return getChatGPTActionArea(el);
    }
  };
})();
