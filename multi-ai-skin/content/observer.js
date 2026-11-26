(function () {
  'use strict';

  const ns = window.AIChatSkin = window.AIChatSkin || {};

  function startObserving(adapter) {
    const signal = ns.renderer.signal;
    if (signal.aborted) return;
    const changed = new Set();
    let timer;
    function flush() {
      timer = undefined;
      const nodes = Array.from(changed);
      changed.clear();
      ns.renderer.renderAll(adapter, nodes);
    }
    const observer = new MutationObserver(records => {
      for (const record of records) {
        const target = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
        if (!target || target.closest('.skin-bubble-container')) continue;
        if (record.type === 'childList' && [...record.addedNodes, ...record.removedNodes]
          .every(node => node.nodeType === Node.ELEMENT_NODE && node.matches('.skin-bubble-container'))) continue;
        changed.add(target);
      }
      // Throttle instead of resetting the timer on each streamed token.
      if (changed.size && timer === undefined) timer = setTimeout(flush, 100);
    });
    observer.observe(document.body, {
      subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ['data-talvt-turn-state', 'data-is-streaming', 'aria-busy', 'data-message-finished',
        'data-is-loading', 'loading', 'is-loading', 'contenteditable']
    });
    // Covers SPA navigation and platform changes signalled only through CSS classes.
    const reconcile = () => { if (!document.hidden) ns.renderer.renderAll(adapter); };
    const interval = setInterval(reconcile, 4000);
    document.addEventListener('visibilitychange', reconcile, { signal });
    window.addEventListener('popstate', reconcile, { signal });
    window.addEventListener('resize', reconcile, { signal });
    signal.addEventListener('abort', () => {
      observer.disconnect();
      clearTimeout(timer);
      clearInterval(interval);
      changed.clear();
    }, { once: true });
  }

  ns.observer = { startObserving };
})();
