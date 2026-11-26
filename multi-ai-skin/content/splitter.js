(function () {
  'use strict';

  const ns = window.AIChatSkin = window.AIChatSkin || {};

  // Split plain prose at sentence boundaries. Keep structured markup (links, code,
  // tables, lists and media) intact and always serialize text through the DOM.
  function split(html, maxChars = 180) {
    const root = document.createElement('div');
    root.innerHTML = html;
    const output = [];
    const inline = document.createElement('div');
    function flushInline() {
      if (inline.innerHTML.trim()) output.push(inline.innerHTML);
      inline.replaceChildren();
    }
    function append(node) {
      if (node.nodeType !== Node.ELEMENT_NODE || !node.matches('div, p, section, article, h1, h2, h3, h4, h5, h6, pre, table, ul, ol, blockquote, figure, hr, details')) {
        inline.appendChild(node.cloneNode(true));
        return;
      }
      flushInline();
      if (node.matches('div, section, article') && node.querySelector('p, pre, table, ul, ol') &&
          !node.matches('[role], [contenteditable]') && !node.querySelector('button, input, iframe')) {
        for (const child of node.childNodes) append(child);
        flushInline();
        return;
      }
      if (node.children.length || !node.matches('p, div') || node.textContent.length <= maxChars) {
        output.push(node.outerHTML);
        return;
      }
      const sentences = node.textContent.match(/[^。.!?！？]+[。.!?！？]*\s*|[。.!?！？]+\s*/gu) || [node.textContent];
      let part = '';
      function emit() {
        const block = node.cloneNode(false);
        block.textContent = part;
        output.push(block.outerHTML);
      }
      for (const sentence of sentences) {
        if (part && part.length + sentence.length > maxChars) {
          emit();
          part = '';
        }
        part += sentence;
      }
      if (part) emit();
    }
    for (const child of root.childNodes) append(child);
    flushInline();
    return output;
  }

  ns.splitter = { split };
})();
