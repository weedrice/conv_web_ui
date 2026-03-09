/**
 * chatgpt.js — ChatGPT DOM 어댑터
 *
 * reference/gpt/*.html 기준: data-message-author-role, article, group/turn-messages.
 * getMessages: [data-message-author-role="user|assistant"]
 */
(function () {
  'use strict';

  var ns = (window.AIChatSkin = window.AIChatSkin || {});
  ns.platforms = ns.platforms || {};

  function getTurnContainer(el) {
    return el.closest('[data-testid^="conversation-turn-"]') ||
           el.closest('[data-testid^="conversation-turn"]') ||
           el.closest('article') ||
           el;
  }

  function shouldIgnoreElement(el) {
    if (!el) return true;
    if (el.closest && el.closest('.skin-bubble-wrap')) return true;
    return false;
  }

  ns.platforms.chatgpt = {
    name: 'chatgpt',

    /**
     * 현재 호스트명이 ChatGPT인지 확인
     */
    matches: function (hostname) {
      return hostname === 'chatgpt.com' || hostname === 'www.chatgpt.com';
    },

    /**
     * 현재 DOM에 있는 모든 메시지 요소 반환
     */
    getMessages: function () {
      var candidates = document.querySelectorAll(
        '[data-message-author-role="user"], [data-message-author-role="assistant"]'
      );
      var result = [];
      var seen = {};

      for (var i = 0; i < candidates.length; i++) {
        var el = candidates[i];
        if (shouldIgnoreElement(el)) continue;

        var key = el.getAttribute('data-message-id');
        if (!key) {
          // data-message-id가 없는 경우에도 중복 삽입 방지
          var role = el.getAttribute('data-message-author-role') || 'unknown';
          key = role + '::' + (el.textContent || '').slice(0, 60) + '::' + i;
        }
        if (seen[key]) continue;
        seen[key] = true;
        result.push(el);
      }

      return result;
    },

    /**
     * 메시지 요소의 역할(user/assistant) 반환
     */
    getRole: function (el) {
      var role = el.getAttribute('data-message-author-role');
      if (role === 'user') return 'user';
      if (role === 'assistant') return 'assistant';
      return null;
    },

    /**
     * 메시지 요소가 스트리밍 중인지 확인
     * 실제 스트리밍 인디케이터가 DOM에 존재하는 경우에만 true 반환.
     * 주의: 속성 부재만으로 streaming이라 판단하면 안 됨 (완료된 메시지도 해당 속성이 없을 수 있음)
     */
    isStreaming: function (el) {
      try {
        var messageEl = el.closest('[data-message-id]') || el;
        var article = getTurnContainer(el);

        // 확실히 완료된 경우
        if (messageEl.hasAttribute('data-message-finished')) {
          return false;
        }

        // 완성 메시지 액션 버튼이 있으면 스트리밍 종료로 판단
        var searchRoot = article || messageEl;
        var hasTurnActions = searchRoot.querySelector(
          '[data-testid="copy-turn-action-button"], [data-testid="good-response-turn-action-button"], [data-testid="bad-response-turn-action-button"]'
        );
        if (hasTurnActions) return false;

        // 속성 기반 신호
        if (searchRoot.querySelector('[data-is-streaming="true"], [aria-busy="true"]')) return true;

        // 실제 스트리밍 인디케이터 클래스 확인
        if (searchRoot.querySelector('.result-streaming')) return true;
        if (searchRoot.querySelector('.agent-turn-loading')) return true;

        // streaming 관련 CSS 클래스가 있는 요소 확인
        var streamingEls = searchRoot.querySelectorAll('[class*="streaming"]');
        for (var i = 0; i < streamingEls.length; i++) {
          var className = String(streamingEls[i].className || '');
          // skin- 접두사는 우리 것이므로 제외
          if (className.indexOf('skin-') === -1) return true;
        }

        // 커서 깜박임 요소 확인 (스트리밍 중 표시되는 커서)
        if (searchRoot.querySelector('.cursor, [class*="cursor-blink"]')) return true;

      } catch (e) {
        console.warn('[AIChatSkin] ChatGPT isStreaming error:', e);
      }

      // 기본값: 스트리밍 아님 (완료된 메시지를 streaming으로 오판하지 않기 위해)
      return false;
    },

    /**
     * 메시지 요소에서 순수 텍스트 추출
     */
    getTextContent: function (el) {
      // ChatGPT의 메시지 내용은 .markdown 클래스 내부에 있음 (어시스턴트)
      var markdown = el.querySelector('.markdown');
      if (markdown) {
        return markdown.textContent || '';
      }
      // 유저 메시지: .whitespace-pre-wrap 또는 직접 텍스트
      var preWrap = el.querySelector('.whitespace-pre-wrap, [class*="whitespace"]');
      if (preWrap) {
        return preWrap.textContent || '';
      }
      return el.textContent || '';
    },

    /**
     * 메시지 요소에서 렌더링된 HTML 추출 (코드블록, 테이블 보존)
     */
    getInnerHTML: function (el) {
      // ChatGPT의 메시지 내용은 .markdown 클래스 내부에 있음
      var markdown = el.querySelector('.markdown');
      if (markdown) {
        // 마크다운 내부의 복사 버튼 등 UI 요소 제외하여 클론 생성 후 추출
        var clone = markdown.cloneNode(true);
        // 복사 버튼, 액션 링크 등 제거
        clone.querySelectorAll('button, [class*="copy"], [class*="action"]').forEach(function(btn) {
          btn.remove();
        });
        return clone.innerHTML;
      }
      return el.innerHTML;
    },

    /**
     * 대화 컨테이너 요소 반환 (MutationObserver 대상)
     */
    getConversationContainer: function () {
      // ChatGPT의 대화 영역
      var firstTurn = document.querySelector('[data-testid^="conversation-turn-"], [data-testid^="conversation-turn"]');
      if (firstTurn && firstTurn.parentElement) return firstTurn.parentElement;

      return document.querySelector('[class*="react-scroll-to-bottom"]') ||
             document.querySelector('main') ||
             document.body;
    },

    /**
     * 메시지의 래퍼 요소 반환 (버블 삽입 위치 결정용)
     */
    getMessageWrapper: function (el) {
      // ★ ChatGPT DOM: article > div > div > div[data-message-author-role]
      // 버블이 article과 같은 레벨에 삽입되도록 article을 반환
      var turn = getTurnContainer(el);
      if (turn) return turn;
      return el;
    }
  };

})();
