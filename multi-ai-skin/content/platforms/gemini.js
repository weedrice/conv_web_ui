/**
 * gemini.js - Gemini DOM adapter
 *
 * reference/gemini/*.html 기준 DOM:
 * - conversation container: .conversation-container
 * - user turn: <user-query> (내부 .user-query-container / .query-text)
 * - assistant turn: <model-response> (내부 .markdown-main-panel / .model-response-text)
 */
(function () {
  'use strict';

  var ns = (window.AIChatSkin = window.AIChatSkin || {});
  ns.platforms = ns.platforms || {};

  function isSkinNode(el) {
    return !!(el && el.closest && el.closest('.skin-bubble-wrap'));
  }

  function uniqueElements(elements) {
    var out = [];
    for (var i = 0; i < elements.length; i++) {
      if (out.indexOf(elements[i]) === -1) out.push(elements[i]);
    }
    return out;
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

  function toUserTurn(el) {
    if (!el) return null;
    if (el.tagName && el.tagName.toLowerCase() === 'user-query') return el;
    if (el.closest) return el.closest('user-query');
    return null;
  }

  function toAssistantTurn(el) {
    if (!el) return null;
    if (el.tagName && el.tagName.toLowerCase() === 'model-response') return el;
    if (el.closest) return el.closest('model-response');
    return null;
  }

  function collectUserTurns() {
    var turns = document.querySelectorAll('user-query');
    if (turns.length > 0) return turns;

    // 폴백: user-query 태그를 못 찾는 경우 class 기반으로 상위 turn 수집
    var containers = document.querySelectorAll('.user-query-container');
    var out = [];
    for (var i = 0; i < containers.length; i++) {
      var turn = toUserTurn(containers[i]) || containers[i];
      if (!isSkinNode(turn)) out.push(turn);
    }
    return uniqueElements(out);
  }

  function collectAssistantTurns() {
    return document.querySelectorAll('model-response');
  }

  function getAssistantActionArea(assistantTurn) {
    if (!assistantTurn) return null;

    var contentNode = getAssistantContentNode(assistantTurn);
    var actionWraps = assistantTurn.querySelectorAll('message-actions');
    if (actionWraps.length > 0) {
      // Prefer the first action area that comes after content.
      if (contentNode && contentNode.compareDocumentPosition) {
        for (var i = 0; i < actionWraps.length; i++) {
          var pos = contentNode.compareDocumentPosition(actionWraps[i]);
          if (pos & Node.DOCUMENT_POSITION_FOLLOWING) {
            return actionWraps[i];
          }
        }
      }

      // Fallback: use the last action block to avoid top/header controls.
      return actionWraps[actionWraps.length - 1];
    }

    var actionBtn = assistantTurn.querySelector(
      '[data-test-id="copy-button"], [data-test-id="more-menu-button"], [data-test-id="actions-menu-button"], [data-test-id="conversation-actions-menu-icon-button"]'
    );
    if (!actionBtn) return null;
    return actionBtn.closest('message-actions') || actionBtn;
  }

  function getUserActionArea(userTurn) {
    if (!userTurn || !userTurn.querySelector) return null;
    var actionButton = userTurn.querySelector(
      '[data-test-id*="copy"], [data-testid*="copy"], [data-test-id*="edit"], [data-testid*="edit"], [aria-label*="복사"], [aria-label*="수정"], [aria-label*="편집"], [aria-label*="Copy"], [aria-label*="Edit"]'
    );
    if (!actionButton) return null;
    return actionButton.closest('.query-content, .user-query-content, .user-query-container, [class*="query-content"], [class*="query-container"]') ||
      actionButton.parentElement ||
      actionButton;
  }

  function getUserBubbleVisualNode(userTurn) {
    if (!userTurn || !userTurn.querySelector) return null;
    // Use the real bubble shell as the primary anchor to keep hover controls aligned.
    return userTurn.querySelector('.user-query-bubble-with-background') ||
      userTurn.querySelector('.query-text-line') ||
      userTurn.querySelector('.query-text') ||
      userTurn.querySelector('.query-content') ||
      userTurn.querySelector('.user-query-container') ||
      userTurn.querySelector('.user-query-content');
  }

  function getUserHideNode(userTurn) {
    if (!userTurn || !userTurn.querySelector) return null;
    return userTurn.querySelector('.user-query-bubble-with-background') ||
      userTurn.querySelector('.query-text-line') ||
      userTurn.querySelector('.query-text') ||
      userTurn.querySelector('.user-query-content');
  }

  function getAssistantAvatarGutter(assistantTurn) {
    if (!assistantTurn || !assistantTurn.querySelector) return null;
    return assistantTurn.querySelector('.presented-response-container .avatar-gutter, .avatar-gutter');
  }

  function isGeminiActionAreaElement(el) {
    if (!el) return false;

    if (el.tagName && el.tagName.toLowerCase() === 'message-actions') return true;
    if (el.closest && el.closest('message-actions')) return true;

    var testId = (el.getAttribute && (el.getAttribute('data-test-id') || el.getAttribute('data-testid'))) || '';
    if (/copy-button|more-menu-button|actions-menu|conversation-actions/i.test(testId)) return true;

    var className = String(el.className || '');
    if (/actions?-menu|menu-button|icon-button/.test(className)) return true;

    return false;
  }

  function getAssistantContentNode(el) {
    if (!el) return null;

    // querySelector의 콤마 셀렉터는 "문서 순서상 첫 매치"를 반환하므로
    // message-content 같은 상위 래퍼가 먼저 잡히는 문제를 피하기 위해 우선순위를 분리한다.
    var prioritySelectors = [
      '.markdown.markdown-main-panel',
      '.markdown-main-panel',
      '.model-response-text',
      '.response-content'
    ];

    // Shadow DOM 우선 탐색
    if (el.shadowRoot) {
      for (var i = 0; i < prioritySelectors.length; i++) {
        var shadowNode = el.shadowRoot.querySelector(prioritySelectors[i]);
        if (shadowNode) return shadowNode;
      }
    }

    // Light DOM 탐색
    for (var j = 0; j < prioritySelectors.length; j++) {
      var node = el.querySelector(prioritySelectors[j]);
      if (node) return node;
    }

    return null;
  }

  function getUserContentNode(el) {
    if (!el) return null;

    // query-text-line이 실제 사용자 입력 텍스트에 가장 가깝다.
    var line = el.querySelector('.query-text-line');
    if (line) return line;

    return el.querySelector('.query-text, [class*="query-text"], .user-query-text, [class*="query-content"]') ||
      el.querySelector('p');
  }

  function sanitizeText(text) {
    return String(text || '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function sanitizeAssistantText(text) {
    var cleaned = sanitizeText(text);

    // Gemini 보조 라벨 제거
    cleaned = cleaned
      .replace(/^Gemini의 응답\s*/g, '')
      .replace(/^응답\s*/g, '')
      .replace(/^답변\s*/g, '')
      .trim();

    return cleaned;
  }

  function isMeaningfulAssistantText(text) {
    var cleaned = sanitizeAssistantText(text);
    if (!cleaned) return false;

    // 라벨만 남은 경우는 의미 없는 텍스트로 처리
    if (/^(Gemini의 응답|응답|답변)$/i.test(cleaned)) return false;
    return true;
  }

  function getUserCleanText(userTurn) {
    if (!userTurn) return '';

    // 줄 단위 텍스트를 우선 수집 (시각숨김 라벨 제외)
    var lines = userTurn.querySelectorAll('.query-text-line');
    if (lines.length > 0) {
      var lineTexts = [];
      for (var i = 0; i < lines.length; i++) {
        var t = sanitizeText(lines[i].textContent || '');
        if (t) lineTexts.push(t);
      }
      if (lineTexts.length > 0) return lineTexts.join('\n');
    }

    // 폴백: query-text 영역에서 시각숨김 라벨 제거 후 추출
    var queryText = userTurn.querySelector('.query-text, [class*="query-text"], .user-query-text, [class*="query-content"]');
    if (queryText) {
      var qtClone = queryText.cloneNode(true);
      var hidden = qtClone.querySelectorAll('.cdk-visually-hidden, [aria-hidden="true"]');
      for (var h = 0; h < hidden.length; h++) {
        hidden[h].remove();
      }
      return sanitizeText(qtClone.textContent || '');
    }

    var plainNode = getUserContentNode(userTurn);
    if (plainNode) return sanitizeText(plainNode.textContent || '');

    return sanitizeText(userTurn.textContent || '');
  }

  function getAssistantCleanText(assistantTurn) {
    if (!assistantTurn) return '';

    if (getAssistantActionArea(assistantTurn) && !getAssistantContentNode(assistantTurn)) {
      return '';
    }

    var contentNode = getAssistantContentNode(assistantTurn);
    if (contentNode) {
      var contentClone = contentNode.cloneNode(true);
      var hidden = contentClone.querySelectorAll(
        '.cdk-visually-hidden, [aria-hidden="true"], message-actions, copy-button, button, [data-test-id], [class*="action"], [class*="menu"], [class*="feedback"], [class*="toolbar"], [class*="chip"], mat-icon, [class*="icon"]'
      );
      for (var i = 0; i < hidden.length; i++) {
        hidden[i].remove();
      }
      return sanitizeAssistantText(contentClone.textContent || '');
    }

    var clone = assistantTurn.cloneNode(true);
    var removeNodes = clone.querySelectorAll('message-actions, button, [class*="action"], [class*="menu"], [class*="feedback"], mat-icon, [class*="icon"], .cdk-visually-hidden, [aria-hidden="true"]');
    for (var r = 0; r < removeNodes.length; r++) {
      removeNodes[r].remove();
    }
    return sanitizeAssistantText(clone.textContent || '');
  }

  function shouldUseAssistantTurn(adapter, assistantTurn) {
    if (!assistantTurn || isSkinNode(assistantTurn)) return false;
    if (adapter.isStreaming(assistantTurn)) return true;

    // 비어 있는 placeholder model-response는 제외
    return isMeaningfulAssistantText(getAssistantCleanText(assistantTurn));
  }

  ns.platforms.gemini = {
    name: 'gemini',

    matches: function (hostname) {
      return hostname === 'gemini.google.com' || hostname === 'www.gemini.google.com';
    },

    getMessages: function () {
      var allMsgs = [];

      try {
        var userTurns = collectUserTurns();
        for (var i = 0; i < userTurns.length; i++) {
          if (!isSkinNode(userTurns[i])) allMsgs.push(userTurns[i]);
        }

        var assistantTurns = collectAssistantTurns();
        for (var j = 0; j < assistantTurns.length; j++) {
          if (shouldUseAssistantTurn(this, assistantTurns[j])) {
            allMsgs.push(assistantTurns[j]);
          }
        }
      } catch (e) {
        console.warn('[AIChatSkin] Gemini getMessages error:', e);
      }

      return sortDomOrder(uniqueElements(allMsgs));
    },

    getRole: function (el) {
      var userTurn = toUserTurn(el);
      if (userTurn) return 'user';

      var assistantTurn = toAssistantTurn(el);
      if (assistantTurn) return 'assistant';

      return null;
    },

    isStreaming: function (el) {
      try {
        var assistantTurn = toAssistantTurn(el);
        if (!assistantTurn) return false;

        // 속성 기반 신호
        if (assistantTurn.getAttribute('data-is-loading') === 'true') return true;
        if (assistantTurn.hasAttribute('is-loading') || assistantTurn.hasAttribute('loading')) return true;
        if (assistantTurn.getAttribute('aria-busy') === 'true') return true;
        if (assistantTurn.querySelector('[aria-busy="true"], [data-is-loading="true"]')) return true;

        // Shadow DOM 내부 신호
        if (assistantTurn.shadowRoot) {
          var shadowBusy = assistantTurn.shadowRoot.querySelector('[aria-busy="true"], [class*="loading"], [class*="pending"], [class*="progress"], [class*="streaming"]');
          if (shadowBusy) return true;
        }

        // 완성 상태에서 자주 보이는 액션 버튼이 있으면 우선 false
        if (assistantTurn.querySelector('[data-test-id="copy-button"], [data-test-id="more-menu-button"]')) {
          return false;
        }

        // 클래스 기반 로딩 신호
        var loadingEl = assistantTurn.querySelector('[class*="loading"], [class*="pending"], [class*="progress"], [class*="streaming"]');
        if (loadingEl && !isSkinNode(loadingEl)) return true;
      } catch (e) {
        console.warn('[AIChatSkin] Gemini isStreaming error:', e);
      }

      return false;
    },

    getTextContent: function (el) {
      var role = this.getRole(el);
      if (!role) return '';

      if (role === 'user') {
        var userTurn = toUserTurn(el) || el;
        return getUserCleanText(userTurn);
      }

      var assistantTurn = toAssistantTurn(el) || el;
      return getAssistantCleanText(assistantTurn);
    },

    getInnerHTML: function (el) {
      var assistantTurn = toAssistantTurn(el) || el;

      try {
        if (assistantTurn.shadowRoot) {
          var shadowNode = getAssistantContentNode(assistantTurn);
          if (shadowNode) return shadowNode.innerHTML;
        }
      } catch (e) {
        console.warn('[AIChatSkin] Gemini getInnerHTML shadow error:', e);
      }

      var contentNode = getAssistantContentNode(assistantTurn);
      if (contentNode) return contentNode.innerHTML;

      var clone = assistantTurn.cloneNode(true);
      var removable = clone.querySelectorAll('message-actions, button, [class*="action"], [class*="feedback"], [class*="menu"], [class*="toolbar"], [class*="chip"], mat-icon, [class*="icon"]');
      for (var i = 0; i < removable.length; i++) {
        removable[i].remove();
      }
      return clone.innerHTML;
    },

    getConversationContainer: function () {
      return document.querySelector('.conversation-container') ||
             document.querySelector('[data-test-id="chat-history-container"]') ||
             document.querySelector('[class*="chat-history"]') ||
             document.querySelector('chat-window-content') ||
             document.querySelector('main') ||
             document.body;
    },

    getMessageWrapper: function (el) {
      var userTurn = toUserTurn(el);
      if (userTurn) {
        return getUserBubbleVisualNode(userTurn) || userTurn;
      }

      var assistantTurn = toAssistantTurn(el);
      if (assistantTurn) {
        return getAssistantContentNode(assistantTurn) || assistantTurn;
      }

      return el;
    },

    // 원본 숨김 대상을 본문으로 제한해 하단 액션 영역은 그대로 노출
    getHideTarget: function (el, role) {
      if (role === 'assistant') {
        var assistantTurn = toAssistantTurn(el) || el;
        return getAssistantContentNode(assistantTurn) || assistantTurn;
      }

      if (role === 'user') {
        var userTurn = toUserTurn(el) || el;
        return getUserHideNode(userTurn) || userTurn;
      }

      return el;
    },

    getExtraHideTargets: function (el, role) {
      if (role !== 'assistant') return [];
      var assistantTurn = toAssistantTurn(el) || el;
      var avatarGutter = getAssistantAvatarGutter(assistantTurn);
      return avatarGutter ? [avatarGutter] : [];
    },

    // 디버깅/후처리를 위해 액션 영역을 메시지 본문과 분리 조회
    getActionArea: function (el) {
      var userTurn = toUserTurn(el);
      // Gemini user hover controls are positioned near the message (left/top area).
      // Using them as insertion anchors moves layout below the bubble and inflates height.
      if (userTurn) return null;

      var assistantTurn = toAssistantTurn(el);
      if (!assistantTurn) return null;
      return getAssistantActionArea(assistantTurn);
    },

    isActionAreaElement: function (el) {
      return isGeminiActionAreaElement(el);
    }
  };
})();
