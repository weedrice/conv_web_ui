/**
 * claude.js - Claude DOM adapter
 *
 * reference/claude/*.html 기준 DOM:
 * - turn wrapper: [data-test-render-count]
 * - user message: [data-testid="user-message"] 또는 .font-user-message
 * - assistant body: [data-is-streaming], .font-claude-response, .standard-markdown/.progressive-markdown
 */
(function () {
  'use strict';

  var ns = (window.AIChatSkin = window.AIChatSkin || {});
  ns.platforms = ns.platforms || {};

  var USER_SELECTORS = '[data-testid="user-message"], .font-user-message';
  var ASSISTANT_BODY_SELECTORS = [
    '[data-is-streaming]',
    '.font-claude-response',
    'div[class*="font-claude-response"]',
    '.standard-markdown',
    '.progressive-markdown'
  ];

  function isSkinNode(el) {
    return !!(el && el.closest && el.closest('.skin-bubble-wrap'));
  }

  function getRootContainer() {
    return document.querySelector('[data-autoscroll-container]') ||
           document.querySelector('main') ||
           document.querySelector('[role="main"]') ||
           document.body;
  }

  function getTurnContainers() {
    var root = getRootContainer();
    var turns = root.querySelectorAll('[data-test-render-count]');
    if (turns.length > 0) return turns;

    // 폴백: group 블록을 turn 후보로 사용
    return root.querySelectorAll('.group');
  }

  function getFirstNonSkinBySelector(root, selector) {
    if (!root) return null;
    var list = root.querySelectorAll(selector);
    for (var i = 0; i < list.length; i++) {
      if (!isSkinNode(list[i])) return list[i];
    }
    return null;
  }

  function getUserMessageFromTurn(turnEl) {
    var user = getFirstNonSkinBySelector(turnEl, USER_SELECTORS);
    if (!user) return null;
    var text = (user.textContent || '').trim();
    return text.length > 0 ? user : null;
  }

  function getUserBodyNode(el) {
    if (!el) return null;

    if (hasSelector(el, '.font-user-message, div[class*="font-user-message"]')) {
      return el;
    }

    var userRoot = hasSelector(el, USER_SELECTORS) ? el : getFirstNonSkinBySelector(el, USER_SELECTORS);
    if (!userRoot) return null;

    return getFirstNonSkinBySelector(userRoot, '.font-user-message, div[class*="font-user-message"]') || userRoot;
  }

  function getAssistantMessageFromTurn(turnEl) {
    for (var i = 0; i < ASSISTANT_BODY_SELECTORS.length; i++) {
      var selector = ASSISTANT_BODY_SELECTORS[i];
      var list = turnEl.querySelectorAll(selector);
      for (var j = 0; j < list.length; j++) {
        var el = list[j];
        if (isSkinNode(el)) continue;
        if (el.closest && el.closest(USER_SELECTORS)) continue;
        var text = (el.textContent || '').trim();
        if (text.length < 2) continue;
        return el;
      }
    }
    return null;
  }

  function sortDomOrder(elements) {
    elements.sort(function (a, b) {
      var position = a.compareDocumentPosition(b);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });
    return elements;
  }

  function uniqueElements(elements) {
    var out = [];
    for (var i = 0; i < elements.length; i++) {
      if (out.indexOf(elements[i]) === -1) out.push(elements[i]);
    }
    return out;
  }

  function getMessagesByTurn() {
    var turns = getTurnContainers();
    var out = [];

    for (var i = 0; i < turns.length; i++) {
      var turn = turns[i];
      if (isSkinNode(turn)) continue;

      var user = getUserMessageFromTurn(turn);
      if (user) {
        out.push(user);
      }

      var assistant = getAssistantMessageFromTurn(turn);
      if (assistant) out.push(assistant);
    }

    return out;
  }

  function getMessagesFallback() {
    var root = getRootContainer();
    var all = [];

    var users = root.querySelectorAll(USER_SELECTORS);
    for (var i = 0; i < users.length; i++) {
      if (!isSkinNode(users[i])) all.push(users[i]);
    }

    for (var s = 0; s < ASSISTANT_BODY_SELECTORS.length; s++) {
      var assistants = root.querySelectorAll(ASSISTANT_BODY_SELECTORS[s]);
      for (var j = 0; j < assistants.length; j++) {
        var el = assistants[j];
        if (isSkinNode(el)) continue;
        if (el.closest && el.closest(USER_SELECTORS)) continue;
        var text = (el.textContent || '').trim();
        if (text.length < 2) continue;
        all.push(el);
      }
    }

    return sortDomOrder(uniqueElements(all));
  }

  function hasSelector(el, selector) {
    return !!(el && el.matches && el.matches(selector));
  }

  function closestSelector(el, selector) {
    return el && el.closest ? el.closest(selector) : null;
  }

  function getAssistantBodyNode(el) {
    if (!el) return null;
    return hasSelector(el, '.standard-markdown, .progressive-markdown, .font-claude-response, div[class*="font-claude-response"]')
      ? el
      : getFirstNonSkinBySelector(el, '.standard-markdown, .progressive-markdown, .font-claude-response, div[class*="font-claude-response"]');
  }

  function getClaudeUserBubbleShell(el) {
    var userRoot = hasSelector(el, '[data-testid="user-message"]')
      ? el
      : closestSelector(el, '[data-testid="user-message"]');

    if (!userRoot) {
      var turn = closestSelector(el, '[data-test-render-count]') || closestSelector(el, '.group') || el;
      userRoot = getFirstNonSkinBySelector(turn, '[data-testid="user-message"]');
    }
    if (!userRoot) return null;

    var turnRoot = closestSelector(userRoot, '[data-test-render-count]') || closestSelector(userRoot, '.group');
    var node = userRoot;

    while (node && node !== turnRoot && node.parentElement) {
      var cls = typeof node.className === 'string' ? node.className : '';
      // Claude user bubble visual shell:
      // e.g. "inline-flex ... bg-bg-300 rounded-xl ...".
      if (/\bbg-bg-\d+\b/.test(cls) && /\brounded/.test(cls)) {
        return node;
      }
      node = node.parentElement;
    }

    return userRoot;
  }

  function getClaudeActionArea(el) {
    var turn = closestSelector(el, '[data-test-render-count]') || closestSelector(el, '.group') || el;
    if (!turn || !turn.querySelector) return null;

    return turn.querySelector(
      '[role="group"][aria-label*="Message"], [role="group"][aria-label*="message"], [data-testid^="action-bar"], [data-testid="action-bar-copy"], [data-testid="action-bar-retry"]'
    );
  }

  ns.platforms.claude = {
    name: 'claude',

    matches: function (hostname) {
      return hostname === 'claude.ai' || hostname === 'www.claude.ai';
    },

    getMessages: function () {
      var byTurn = getMessagesByTurn();
      if (byTurn.length > 0) {
        return sortDomOrder(uniqueElements(byTurn));
      }
      return getMessagesFallback();
    },

    getRole: function (el) {
      if (!el || isSkinNode(el)) return null;

      if (hasSelector(el, USER_SELECTORS) || closestSelector(el, USER_SELECTORS)) {
        return 'user';
      }

      for (var i = 0; i < ASSISTANT_BODY_SELECTORS.length; i++) {
        var selector = ASSISTANT_BODY_SELECTORS[i];
        if (hasSelector(el, selector) || closestSelector(el, selector)) {
          return 'assistant';
        }
      }

      // turn 안에서 user가 아니면 assistant로 처리
      var turn = closestSelector(el, '[data-test-render-count]');
      if (turn) {
        var user = getUserMessageFromTurn(turn);
        if (user && user.contains(el)) return 'user';
        if (!user) return 'assistant';
      }

      return null;
    },

    isStreaming: function (el) {
      try {
        if (!el) return false;

        var streamNode = hasSelector(el, '[data-is-streaming]') ? el : closestSelector(el, '[data-is-streaming]');
        if (streamNode) {
          var attr = streamNode.getAttribute('data-is-streaming');
          if (attr === 'true') return true;
          if (attr === 'false') return false;
        }

        if (el.querySelector && el.querySelector('[data-is-streaming="true"], [aria-busy="true"]')) {
          return true;
        }
        if (el.getAttribute && el.getAttribute('aria-busy') === 'true') return true;

        var loading = el.querySelector && el.querySelector('[class*="loading"], [class*="pending"], [class*="streaming"], [class*="cursor"], [class*="caret"]');
        if (loading && !isSkinNode(loading)) return true;

        // 액션바 버튼이 보이면 보통 생성 완료 상태
        if (el.querySelector && el.querySelector('[data-testid="action-bar-copy"], [data-testid="action-bar-retry"]')) {
          return false;
        }
      } catch (e) {
        console.warn('[AIChatSkin] Claude isStreaming error:', e);
      }

      return false;
    },

    getTextContent: function (el) {
      if (!el) return '';
      var role = this.getRole(el);

      if (role === 'user') {
        var user = hasSelector(el, USER_SELECTORS) ? el : getFirstNonSkinBySelector(el, USER_SELECTORS);
        if (user) return user.textContent || '';
      }

      var body = getAssistantBodyNode(el);
      if (body) return body.textContent || '';

      return el.textContent || '';
    },

    getInnerHTML: function (el) {
      if (!el) return '';

      var markdown = getFirstNonSkinBySelector(el, '.standard-markdown, .progressive-markdown');
      if (markdown) {
        return markdown.innerHTML;
      }

      var responseEl = hasSelector(el, '.font-claude-response') ? el : getFirstNonSkinBySelector(el, '.font-claude-response, div[class*="font-claude-response"]');
      if (responseEl) {
        var responseClone = responseEl.cloneNode(true);
        var removeTargets = responseClone.querySelectorAll('[data-testid^="action-bar"], button, [role="group"][aria-label*="Message"]');
        for (var i = 0; i < removeTargets.length; i++) {
          removeTargets[i].remove();
        }
        return responseClone.innerHTML;
      }

      var clone = el.cloneNode(true);
      var removable = clone.querySelectorAll('[data-testid^="action-bar"], button');
      for (var j = 0; j < removable.length; j++) {
        removable[j].remove();
      }
      return clone.innerHTML;
    },

    getConversationContainer: function () {
      var auto = document.querySelector('[data-autoscroll-container]');
      if (auto) return auto;

      var firstTurn = document.querySelector('[data-test-render-count]');
      if (firstTurn && firstTurn.parentElement) return firstTurn.parentElement;

      return getRootContainer();
    },

    getMessageWrapper: function (el) {
      var role = this.getRole(el);
      if (role === 'user') {
        var userBody = getUserBodyNode(el);
        if (userBody) {
          return closestSelector(userBody, '[data-testid="user-message"]') || userBody;
        }
      }

      if (role === 'assistant') {
        var assistantBody = getAssistantBodyNode(el);
        if (assistantBody) return assistantBody;
      }

      var turn = closestSelector(el, '[data-test-render-count]') || closestSelector(el, '.group');
      if (turn) return turn;

      return el;
    },

    // 원본 숨김 대상을 본문 노드로 제한해 액션 영역/클로드 마크는 그대로 유지
    getHideTarget: function (el, role) {
      if (role === 'assistant') {
        var turn = closestSelector(el, '[data-test-render-count]') || closestSelector(el, '.group') || el;
        return getAssistantBodyNode(turn) || turn;
      }

      if (role === 'user') {
        var userBody = getUserBodyNode(el);
        if (userBody) return userBody;

        var userShell = getClaudeUserBubbleShell(el);
        return userShell || el;
      }

      return el;
    },

    // 액션 영역을 별도 분리해 버블 아래에 유지할 수 있게 제공
    getActionArea: function (el) {
      return getClaudeActionArea(el);
    }
  };
})();
