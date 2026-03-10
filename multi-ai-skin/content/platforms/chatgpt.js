/**
 * chatgpt.js ??ChatGPT DOM ?대뙌?? *
 * reference/gpt/*.html 湲곗?: data-message-author-role, article, group/turn-messages.
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

  function getChatGPTActionArea(el) {
    var turn = getTurnContainer(el);
    if (!turn || !turn.querySelector) return null;
    var actionBtn = turn.querySelector(
      '[data-testid="copy-turn-action-button"], [data-testid="good-response-turn-action-button"], [data-testid="bad-response-turn-action-button"], [data-testid="retry-button"]'
    );
    if (!actionBtn) return null;
    var actionNode = actionBtn.closest('div[class*="turn-messages"]') || actionBtn.parentElement || actionBtn;

    // Expand to the outer "actions-only" wrapper inside this turn so the renderer
    // inserts skin bubbles in the same vertical stack as normal messages.
    var current = actionNode;
    while (current && current.parentElement && current.parentElement !== turn) {
      var parent = current.parentElement;
      if (parent.querySelector && parent.querySelector('[data-message-author-role]')) {
        break;
      }
      current = parent;
    }

    return current || actionNode;
  }

  ns.platforms.chatgpt = {
    name: 'chatgpt',

    /**
     * ?꾩옱 ?몄뒪?몃챸??ChatGPT?몄? ?뺤씤
     */
    matches: function (hostname) {
      return hostname === 'chatgpt.com' || hostname === 'www.chatgpt.com';
    },

    /**
     * ?꾩옱 DOM???덈뒗 紐⑤뱺 硫붿떆吏 ?붿냼 諛섑솚
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
          // data-message-id媛 ?녿뒗 寃쎌슦?먮룄 以묐났 ?쎌엯 諛⑹?
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
     * 硫붿떆吏 ?붿냼????븷(user/assistant) 諛섑솚
     */
    getRole: function (el) {
      var role = el.getAttribute('data-message-author-role');
      if (role === 'user') return 'user';
      if (role === 'assistant') return 'assistant';
      return null;
    },

    /**
     * 硫붿떆吏 ?붿냼媛 ?ㅽ듃由щ컢 以묒씤吏 ?뺤씤
     * ?ㅼ젣 ?ㅽ듃由щ컢 ?몃뵒耳?댄꽣媛 DOM??議댁옱?섎뒗 寃쎌슦?먮쭔 true 諛섑솚.
     * 二쇱쓽: ?띿꽦 遺?щ쭔?쇰줈 streaming?대씪 ?먮떒?섎㈃ ????(?꾨즺??硫붿떆吏???대떦 ?띿꽦???놁쓣 ???덉쓬)
     */
    isStreaming: function (el) {
      try {
        var messageEl = el.closest('[data-message-id]') || el;
        var article = getTurnContainer(el);

        // ?뺤떎???꾨즺??寃쎌슦
        if (messageEl.hasAttribute('data-message-finished')) {
          return false;
        }

        // ?꾩꽦 硫붿떆吏 ?≪뀡 踰꾪듉???덉쑝硫??ㅽ듃由щ컢 醫낅즺濡??먮떒
        var searchRoot = article || messageEl;
        var hasTurnActions = searchRoot.querySelector(
          '[data-testid="copy-turn-action-button"], [data-testid="good-response-turn-action-button"], [data-testid="bad-response-turn-action-button"]'
        );
        if (hasTurnActions) return false;

        // ?띿꽦 湲곕컲 ?좏샇
        if (searchRoot.querySelector('[data-is-streaming="true"], [aria-busy="true"]')) return true;

        // ?ㅼ젣 ?ㅽ듃由щ컢 ?몃뵒耳?댄꽣 ?대옒???뺤씤
        if (searchRoot.querySelector('.result-streaming')) return true;
        if (searchRoot.querySelector('.agent-turn-loading')) return true;

        // streaming 愿??CSS ?대옒?ㅺ? ?덈뒗 ?붿냼 ?뺤씤
        var streamingEls = searchRoot.querySelectorAll('[class*="streaming"]');
        for (var i = 0; i < streamingEls.length; i++) {
          var className = String(streamingEls[i].className || '');
          // skin- ?묐몢?щ뒗 ?곕━ 寃껋씠誘濡??쒖쇅
          if (className.indexOf('skin-') === -1) return true;
        }

        // 而ㅼ꽌 源쒕컯???붿냼 ?뺤씤 (?ㅽ듃由щ컢 以??쒖떆?섎뒗 而ㅼ꽌)
        if (searchRoot.querySelector('.cursor, [class*="cursor-blink"]')) return true;

      } catch (e) {
        console.warn('[AIChatSkin] ChatGPT isStreaming error:', e);
      }

      // 湲곕낯媛? ?ㅽ듃由щ컢 ?꾨떂 (?꾨즺??硫붿떆吏瑜?streaming?쇰줈 ?ㅽ뙋?섏? ?딄린 ?꾪빐)
      return false;
    },

    /**
     * 硫붿떆吏 ?붿냼?먯꽌 ?쒖닔 ?띿뒪??異붿텧
     */
    getTextContent: function (el) {
      // ChatGPT??硫붿떆吏 ?댁슜? .markdown ?대옒???대????덉쓬 (?댁떆?ㅽ꽩??
      var markdown = el.querySelector('.markdown');
      if (markdown) {
        return markdown.textContent || '';
      }
      // ?좎? 硫붿떆吏: .whitespace-pre-wrap ?먮뒗 吏곸젒 ?띿뒪??      var preWrap = el.querySelector('.whitespace-pre-wrap, [class*="whitespace"]');
      if (preWrap) {
        return preWrap.textContent || '';
      }
      return el.textContent || '';
    },

    /**
     * 硫붿떆吏 ?붿냼?먯꽌 ?뚮뜑留곷맂 HTML 異붿텧 (肄붾뱶釉붾줉, ?뚯씠釉?蹂댁〈)
     */
    getInnerHTML: function (el) {
      // ChatGPT??硫붿떆吏 ?댁슜? .markdown ?대옒???대????덉쓬
      var markdown = el.querySelector('.markdown');
      if (markdown) {
        // 留덊겕?ㅼ슫 ?대???蹂듭궗 踰꾪듉 ??UI ?붿냼 ?쒖쇅?섏뿬 ?대줎 ?앹꽦 ??異붿텧
        var clone = markdown.cloneNode(true);
        // 蹂듭궗 踰꾪듉, ?≪뀡 留곹겕 ???쒓굅
        clone.querySelectorAll('button, [class*="copy"], [class*="action"]').forEach(function(btn) {
          btn.remove();
        });
        return clone.innerHTML;
      }
      return el.innerHTML;
    },

    /**
     * ???而⑦뀒?대꼫 ?붿냼 諛섑솚 (MutationObserver ???
     */
    getConversationContainer: function () {
      // ChatGPT??????곸뿭
      var firstTurn = document.querySelector('[data-testid^="conversation-turn-"], [data-testid^="conversation-turn"]');
      if (firstTurn && firstTurn.parentElement) return firstTurn.parentElement;

      return document.querySelector('[class*="react-scroll-to-bottom"]') ||
             document.querySelector('main') ||
             document.body;
    },

    /**
     * 硫붿떆吏???섑띁 ?붿냼 諛섑솚 (踰꾨툝 ?쎌엯 ?꾩튂 寃곗젙??
     */
    getMessageWrapper: function (el) {
      // ??ChatGPT DOM: article > div > div > div[data-message-author-role]
      // 踰꾨툝??article怨?媛숈? ?덈꺼???쎌엯?섎룄濡?article??諛섑솚
      var turn = getTurnContainer(el);
      if (turn) return turn;
      return el;
    },

    getActionArea: function (el) {
      return getChatGPTActionArea(el);
    }
  };

})();

