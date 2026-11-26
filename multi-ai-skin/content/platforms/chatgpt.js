(function () {
  'use strict';

  const ns = window.AIChatSkin = window.AIChatSkin || {};
  ns.platforms = ns.platforms || {};
  const legacy = '[data-message-author-role="user"], [data-message-author-role="assistant"]';
  const transcript = '[data-rail-chat-transcript], [data-thread-find-target="conversation"]';
  const userBody = '[data-user-message-bubble]';
  const assistantBody = '[data-response-body]';

  function getRole(el) {
    if (el.matches(userBody)) return 'user';
    if (el.matches(assistantBody)) return 'assistant';
    return el.getAttribute('data-message-author-role');
  }

  function getMessages() {
    const result = [];
    const seen = new Set();
    const candidates = document.querySelectorAll(legacy + ', ' + userBody + ', ' + assistantBody);
    for (const el of candidates) {
      if (el.closest('.skin-bubble-container, form, [contenteditable="true"]')) continue;
      if (!el.matches(legacy)) {
        if (!el.closest(transcript) || el.parentElement.closest(legacy)) continue;
      } else if (el.parentElement.closest(userBody + ', ' + assistantBody)) {
        continue;
      }
      const id = el.getAttribute('data-message-id') || el.getAttribute('data-response-body');
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      result.push(el);
    }
    return result;
  }

  function content(el) {
    return el.querySelector('.markdown') || el;
  }

  ns.platforms.chatgpt = {
    name: 'chatgpt',
    matches: hostname => hostname === 'chatgpt.com' || hostname === 'www.chatgpt.com',
    getMessages,
    getRole,
    getMessageWrapper: el => el,
    getTextContent(el) {
      const text = getRole(el) === 'user' && el.querySelector('.whitespace-pre-wrap');
      return (text || content(el)).textContent;
    },
    getInnerHTML: el => content(el).innerHTML,
    isStreaming(el) {
      if (getRole(el) !== 'assistant') return false;
      const turn = el.closest('[data-talvt-turn-state], [data-testid^="conversation-turn"], article') || el;
      const state = turn.getAttribute('data-talvt-turn-state');
      if (state === 'complete' || el.hasAttribute('data-message-finished')) return false;
      if (['streaming', 'in-progress', 'running', 'pending'].includes(state)) return true;
      return !!turn.querySelector('[data-is-streaming="true"], [aria-busy="true"], .result-streaming, .agent-turn-loading, [class*="cursor-blink"]');
    }
  };
})();
