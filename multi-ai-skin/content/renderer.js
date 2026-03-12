/**
 * renderer.js - Bubble rendering layer
 *
 * Replaces native chat message nodes with character-styled bubble UI while
 * preserving platform-specific layout and action areas.
 */
(function () {
  'use strict';

  var ns = (window.AIChatSkin = window.AIChatSkin || {});
  var BUILTIN_CHARACTERS = ns.BUILTIN_CHARACTERS || [];

  /**
   * Cached settings/user character state used as a fallback when the extension
   * context becomes unavailable.
   */
  var cachedSettings = null;
  var cachedUserChars = null;

  function loadSettings(callback) {
    try {
      chrome.storage.sync.get({
        enabled: true,
        assistantCharacterId: 'aemeath',
        assistantDisplayName: '',
        userCharacterId: 'rober_f',
        userDisplayName: '',
        splitMaxChars: 180
      }, function (settings) {
        cachedSettings = settings;
        try {
          chrome.storage.local.get({ userCharacters: [] }, function (data) {
            cachedUserChars = data.userCharacters;
            callback(settings, data.userCharacters);
          });
        } catch (e2) {
          // Extension context invalidated: use the last known local characters.
          callback(settings, cachedUserChars || []);
        }
      });
    } catch (e) {
      // Extension context invalidated: fall back to the last cached settings.
      if (cachedSettings) {
        callback(cachedSettings, cachedUserChars || []);
      }
      // No cache available: leave rendering unchanged.
    }
  }

  /** Returns the current Chrome UI language code, e.g. 'ko' or 'en'. */
  function getUILanguage() {
    try {
      if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getUILanguage) {
        return chrome.i18n.getUILanguage();
      }
    } catch (e) {}
    return (navigator.language || navigator.userLanguage || 'en').split('-')[0];
  }

  /** Resolves the localized character name using the current UI language. */
  function getLocalizedName(charInfo) {
    if (!charInfo) return '';
    if (charInfo.nameKo != null && charInfo.nameEn != null) {
      return getUILanguage().toLowerCase().indexOf('ko') === 0 ? charInfo.nameKo : charInfo.nameEn;
    }
    return charInfo.name || charInfo.nameEn || charInfo.nameKo || '';
  }

  function getCharacterInfo(charId, userChars, role) {
    // Prefer built-in characters first.
    for (var i = 0; i < BUILTIN_CHARACTERS.length; i++) {
      if (BUILTIN_CHARACTERS[i].id === charId) {
        return BUILTIN_CHARACTERS[i];
      }
    }

    // Then look in user-created characters.
    if (userChars) {
      for (var j = 0; j < userChars.length; j++) {
        if (userChars[j].id === charId) {
          return userChars[j];
        }
      }
    }

    // Fall back to the first built-in character matching the requested role.
    role = role || 'assistant';
    for (var k = 0; k < BUILTIN_CHARACTERS.length; k++) {
      if (BUILTIN_CHARACTERS[k].role === role) {
        return BUILTIN_CHARACTERS[k];
      }
    }
    return BUILTIN_CHARACTERS[0];
  }

  /**
   * Builds the avatar source URL.
   * Prefer avatarBase64, then avatarFile, then the default avatar.png path.
   */
  function getExtensionAssetUrl(path) {
    if (
      typeof chrome !== 'undefined' &&
      chrome.runtime &&
      typeof chrome.runtime.getURL === 'function'
    ) {
      return chrome.runtime.getURL(path);
    }
    return path;
  }

  function getAvatarSrc(charInfo) {
    if (charInfo.avatarBase64) {
      return charInfo.avatarBase64;
    }
    if (charInfo.avatarFile) {
      return getExtensionAssetUrl('assets/characters/' + charInfo.avatarFile);
    }
    return getExtensionAssetUrl('assets/characters/' + charInfo.id + '/avatar.png');
  }

  function normalizeVisibleText(text) {
    return String(text || '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function sanitizeAssistantChunkHTML(html) {
    var temp = document.createElement('div');
    temp.innerHTML = html || '';

    var removable = temp.querySelectorAll(
      'message-actions, copy-button, button, [class*="action"], [class*="menu"], [class*="toolbar"], [class*="feedback"], [class*="chip"], mat-icon, [class*="icon"], .cdk-visually-hidden, [aria-hidden="true"]'
    );
    for (var i = 0; i < removable.length; i++) {
      removable[i].remove();
    }

    return temp.innerHTML;
  }

  function hasMeaningfulAssistantContent(html) {
    var temp = document.createElement('div');
    temp.innerHTML = sanitizeAssistantChunkHTML(html);

    var text = normalizeVisibleText(temp.textContent || '');
    if (text.length > 0) return true;

    // Keep non-text assistant content such as images, code blocks, tables, etc.
    return !!temp.querySelector('img, pre, code, table, ul, ol, blockquote, hr, svg, video, audio, canvas, iframe');
  }

  /** Creates the transient typing bubble shown while the assistant streams. */
  function createTypingBubble(charInfo, displayName) {
    var wrap = document.createElement('div');
    wrap.className = 'skin-bubble-wrap skin-bubble-wrap-assistant';
    wrap.setAttribute('data-skin-rendered', 'typing');

    var avatar = document.createElement('img');
    avatar.className = 'skin-avatar';
    avatar.src = getAvatarSrc(charInfo);
    avatar.alt = getLocalizedName(charInfo);

    var contentCol = document.createElement('div');
    contentCol.className = 'skin-content-col';

    var nameEl = document.createElement('div');
    nameEl.className = 'skin-char-name';
    nameEl.textContent = displayName || getLocalizedName(charInfo);

    var bubble = document.createElement('div');
    bubble.className = 'skin-bubble skin-typing';
    bubble.innerHTML = '<span>.</span><span>.</span><span>.</span>';

    contentCol.appendChild(nameEl);
    contentCol.appendChild(bubble);
    wrap.appendChild(avatar);
    wrap.appendChild(contentCol);

    return wrap;
  }

  /**
   * Creates fully rendered assistant bubbles, splitting long content into chunks.
   */
  function createAssistantBubbles(htmlContent, charInfo, displayName, maxChars) {
    var chunks = ns.splitter.split(htmlContent, maxChars);
    var fragment = document.createDocumentFragment();

    for (var i = 0; i < chunks.length; i++) {
      // Drop empty chunks produced by action/menu markup or placeholder nodes.
      var cleanedChunk = sanitizeAssistantChunkHTML(chunks[i]);
      if (!hasMeaningfulAssistantContent(cleanedChunk)) {
        continue;
      }

      var wrap = document.createElement('div');
      wrap.className = 'skin-bubble-wrap skin-bubble-wrap-assistant';
      wrap.setAttribute('data-skin-rendered', 'complete');
      wrap.style.animationDelay = (i * 120) + 'ms';
      wrap.classList.add('skin-fade-in');

      var avatar = document.createElement('img');
      avatar.className = 'skin-avatar';
      avatar.src = getAvatarSrc(charInfo);
      avatar.alt = getLocalizedName(charInfo);

      var contentCol = document.createElement('div');
      contentCol.className = 'skin-content-col';

      var nameEl = document.createElement('div');
      nameEl.className = 'skin-char-name';
      nameEl.textContent = displayName || getLocalizedName(charInfo);

      var bubble = document.createElement('div');
      bubble.className = 'skin-bubble';
      bubble.innerHTML = cleanedChunk;
      // Tint the bubble outline with the selected character color.
      bubble.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px ' + charInfo.color + '10';

      contentCol.appendChild(nameEl);
      contentCol.appendChild(bubble);
      wrap.appendChild(avatar);
      wrap.appendChild(contentCol);
      fragment.appendChild(wrap);
    }

    return fragment;
  }

  /** Creates a rendered user bubble. */
  function createUserBubble(textContent, charInfo, displayName) {
    var wrap = document.createElement('div');
    wrap.className = 'skin-bubble-wrap skin-bubble-wrap-user';
    wrap.setAttribute('data-skin-rendered', 'complete');

    var avatar = document.createElement('img');
    avatar.className = 'skin-avatar';
    avatar.src = getAvatarSrc(charInfo);
    avatar.alt = getLocalizedName(charInfo);

    var contentCol = document.createElement('div');
    contentCol.className = 'skin-content-col skin-content-col-user';

    var nameEl = document.createElement('div');
    nameEl.className = 'skin-char-name skin-char-name-user';
    nameEl.textContent = displayName || getLocalizedName(charInfo);

    var bubble = document.createElement('div');
    bubble.className = 'skin-bubble skin-bubble-user';
    bubble.textContent = textContent;

    contentCol.appendChild(nameEl);
    contentCol.appendChild(bubble);
    wrap.appendChild(avatar);
    wrap.appendChild(contentCol);

    return wrap;
  }

  /**
   * Finds the DOM node that should act as the insertion anchor for a message.
   * Usually this is the message wrapper or turn-local content node.
   */
  function findInsertionTarget(msgEl, adapter) {
    var wrapper = adapter.getMessageWrapper(msgEl);
    return wrapper || msgEl;
  }

  function isNodeAfter(baseNode, candidateNode) {
    if (!baseNode || !candidateNode || baseNode === candidateNode) return false;
    var pos = baseNode.compareDocumentPosition(candidateNode);
    return !!(pos & Node.DOCUMENT_POSITION_FOLLOWING);
  }

  function getHideTargets(msgEl, adapter, role) {
    var targets = [];

    if (adapter && adapter.getHideTarget) {
      try {
        var target = adapter.getHideTarget(msgEl, role);
        if (target && target.classList) targets.push(target);
      } catch (e) {}
    }

    if (adapter && adapter.getExtraHideTargets) {
      try {
        var extras = adapter.getExtraHideTargets(msgEl, role) || [];
        for (var i = 0; i < extras.length; i++) {
          if (extras[i] && extras[i].classList) targets.push(extras[i]);
        }
      } catch (e2) {}
    }

    if (targets.length === 0) targets.push(msgEl);

    var unique = [];
    for (var j = 0; j < targets.length; j++) {
      if (unique.indexOf(targets[j]) === -1) unique.push(targets[j]);
    }
    return unique;
  }

  function hideOriginal(msgEl, adapter, role) {
    var targets = getHideTargets(msgEl, adapter, role);
    for (var i = 0; i < targets.length; i++) {
      if (targets[i] && targets[i].classList) targets[i].classList.add('skin-original-hidden');
    }
  }

  function showOriginal(msgEl, adapter, role) {
    if (msgEl && msgEl.classList) msgEl.classList.remove('skin-original-hidden');

    var targets = getHideTargets(msgEl, adapter, role);
    for (var i = 0; i < targets.length; i++) {
      if (targets[i] && targets[i].classList) targets[i].classList.remove('skin-original-hidden');
    }
  }

  /** Removes already rendered skin bubbles linked to a source message. */
  function removeExistingSkinBubbles(msgEl) {
    var skinId = msgEl.getAttribute('data-skin-id');
    if (skinId) {
      var existing = document.querySelectorAll('.skin-bubble-wrap[data-skin-source="' + skinId + '"]');
      var container = existing.length > 0 ? existing[0].closest('.skin-bubble-container') : null;
      if (container) container.remove();
    }
  }

  /**
   * Renders one source message into the skin UI.
   *
   * @param {Element} msgEl Source message element.
   * @param {Object} adapter Platform adapter.
   * @param {boolean} forceComplete If true, bypass streaming state and render as complete.
   */
  function renderMessage(msgEl, adapter, forceComplete, preloadedSettings, preloadedUserChars) {
    // Skip messages that were already processed unless a full re-render is requested.
    if (msgEl.getAttribute('data-skin-processed') === 'true') {
      // forceComplete is used when a stale typing bubble must become a final bubble.
      if (forceComplete) {
        removeExistingSkinBubbles(msgEl);
        msgEl.removeAttribute('data-skin-processed');
        // Continue into the normal complete render path.
      } else {
        // Normal duplicate guard.
        var skinId = msgEl.getAttribute('data-skin-id');
        if (skinId) {
          var existingWraps = document.querySelectorAll('.skin-bubble-wrap[data-skin-source="' + skinId + '"]');
          if (existingWraps.length > 0) {
            var firstWrap = existingWraps[0];
            var isTyping = firstWrap.getAttribute('data-skin-rendered') === 'typing';
            var isStillStreaming = adapter.isStreaming(msgEl);

            // Still streaming and already showing typing UI.
            if (isStillStreaming && isTyping) return;

            // Streaming finished but typing bubble still exists: re-render complete bubble.
            if (!isStillStreaming && isTyping) {
              removeExistingSkinBubbles(msgEl);
              msgEl.removeAttribute('data-skin-processed');
              // Re-run below as a complete render.
            } else {
              return; // Already rendered.
            }
          } else {
            return;
          }
        } else {
          return;
        }
      }
    }

    // Mark early to reduce observer/polling races that can trigger duplicate renders.
    var role = adapter.getRole(msgEl);
    if (!role) return;

    // forceComplete forces the non-streaming render path.
    var isStreaming = forceComplete ? false : adapter.isStreaming(msgEl);

    // Assign a stable source id for matching bubble containers to source nodes.
    var skinId = msgEl.getAttribute('data-skin-id');
    if (!skinId) {
      skinId = 'skin_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      msgEl.setAttribute('data-skin-id', skinId);
    }

    // Mark before async settings load so concurrent renders can detect in-flight work.
    msgEl.setAttribute('data-skin-processed', 'true');

    function cancelRender() {
      msgEl.removeAttribute('data-skin-processed');
      msgEl.removeAttribute('data-skin-id');
      showOriginal(msgEl, adapter, role);
    }

    function proceedRender(settings, userChars) {
      if (!settings.enabled) {
        // Skin disabled: restore native UI and stop.
        cancelRender();
        return;
      }

      // Skip duplicate insertion if another render call already inserted this source bubble.
      var existingBubbleCount = document.querySelectorAll('.skin-bubble-wrap[data-skin-source="' + skinId + '"]').length;
      if (existingBubbleCount > 0) {
        // Another render call already inserted the bubble.
        return;
      }

      // Resolve the insertion anchor once settings are available.
      var wrapper = findInsertionTarget(msgEl, adapter);
      if (!wrapper || !wrapper.parentNode) {
        cancelRender();
        return;
      }

      if (role === 'assistant') {
        var aCharInfo = getCharacterInfo(settings.assistantCharacterId, userChars, 'assistant');
        var aDisplayName = getLocalizedName(aCharInfo);
        var insertPoint = wrapper.nextSibling;
        var insertParent = wrapper.parentNode;

        // If the adapter exposes an action area after the content, insert before it
        // so platform buttons stay visually attached to the rendered bubble.
        if (adapter && adapter.getActionArea) {
          try {
            var actionArea = adapter.getActionArea(msgEl);
            var isDescendantAnchor = !!(wrapper && wrapper.contains && wrapper.contains(actionArea));
            if (actionArea && actionArea.parentNode && (isNodeAfter(wrapper, actionArea) || isDescendantAnchor)) {
              insertParent = actionArea.parentNode;
              insertPoint = actionArea;
            }
          } catch (e0) {}
        }

        if (isStreaming) {
          // Hide the native assistant content while streaming.
          hideOriginal(msgEl, adapter, role);

          var typingBubble = createTypingBubble(aCharInfo, aDisplayName);
          typingBubble.setAttribute('data-skin-source', skinId);
          var wrap = document.createElement('div');
          wrap.className = 'skin-bubble-container';
          wrap.appendChild(typingBubble);
          insertParent.insertBefore(wrap, insertPoint);
        } else {
          var htmlContent = adapter.getInnerHTML(msgEl);
          if (!hasMeaningfulAssistantContent(htmlContent)) {
            cancelRender();
            return;
          }
          var bubbles = createAssistantBubbles(htmlContent, aCharInfo, aDisplayName, settings.splitMaxChars);
          var bubbleChildren = Array.from(bubbles.children);

          // Abort if sanitization removed everything useful from the assistant response.
          if (bubbleChildren.length === 0) {
            cancelRender();
            return;
          }

          // Hide native assistant content once the replacement bubbles are ready.
          hideOriginal(msgEl, adapter, role);

          for (var bc = 0; bc < bubbleChildren.length; bc++) {
            bubbleChildren[bc].setAttribute('data-skin-source', skinId);
          }
          var wrap = document.createElement('div');
          wrap.className = 'skin-bubble-container';
          for (var c = 0; c < bubbleChildren.length; c++) {
            wrap.appendChild(bubbleChildren[c]);
          }
          insertParent.insertBefore(wrap, insertPoint);
        }
      } else if (role === 'user') {
        var uCharInfo = getCharacterInfo(settings.userCharacterId, userChars, 'user');
        var uDisplayName = getLocalizedName(uCharInfo);
        var textContent = adapter.getTextContent(msgEl);
        var userInsertPoint = wrapper.nextSibling;
        var userInsertParent = wrapper.parentNode;

        // User bubble anchor stays immediately after the message wrapper.
        // Using platform action areas for user turns can move hover/button hit-area above the message.

        if (!textContent || !String(textContent).trim()) {
          cancelRender();
          return;
        }

        // Hide the native user message once the replacement bubble is ready.
        hideOriginal(msgEl, adapter, role);

        var userBubble = createUserBubble(textContent, uCharInfo, uDisplayName);
        userBubble.setAttribute('data-skin-source', skinId);
        var wrap = document.createElement('div');
        wrap.className = 'skin-bubble-container';
        wrap.appendChild(userBubble);
        userInsertParent.insertBefore(wrap, userInsertPoint);
      }
    }

    if (preloadedSettings) {
      proceedRender(preloadedSettings, preloadedUserChars || []);
    } else {
      loadSettings(proceedRender);
    }
  }

  /** Keeps the native page title unchanged. */
  function updatePageTitle() {
    // Keep original page title unchanged.
  }

  /** Renders all currently discoverable messages for the active adapter. */
  function renderAll(adapter) {
    loadSettings(function (settings, userChars) {
      if (!settings.enabled) {
        // Skin disabled: remove rendered bubbles and restore native content.
        restoreAll();
        return;
      }

      var messages = adapter.getMessages();
      for (var i = 0; i < messages.length; i++) {
        renderMessage(messages[i], adapter, false, settings, userChars);
      }
    });
  }

  /** Removes all rendered bubbles and restores the original message DOM. */
  function restoreAll() {
    // Remove all rendered bubble containers.
    var containers = document.querySelectorAll('.skin-bubble-container');
    for (var i = 0; i < containers.length; i++) {
      containers[i].remove();
    }

    // Unhide any source nodes that were hidden during rendering.
    var hiddenEls = document.querySelectorAll('.skin-original-hidden');
    for (var k = 0; k < hiddenEls.length; k++) {
      hiddenEls[k].classList.remove('skin-original-hidden');
    }

    // Clear render bookkeeping attributes.
    var processed = document.querySelectorAll('[data-skin-processed="true"]');
    for (var j = 0; j < processed.length; j++) {
      processed[j].removeAttribute('data-skin-processed');
      processed[j].removeAttribute('data-skin-id');
    }
  }

  /** Restores everything, then renders again from the current DOM state. */
  function reRenderAll(adapter) {
    restoreAll();
    renderAll(adapter);
  }

  /**
   * Removes stale bubble containers left behind by DOM churn or placeholder turns.
   * Also upgrades stale typing bubbles to completed bubbles when streaming ends.
   */
  function cleanupStaleBubbles(adapter) {
    var containers = document.querySelectorAll('.skin-bubble-container');

    for (var i = 0; i < containers.length; i++) {
      var container = containers[i];
      var wraps = container.querySelectorAll('.skin-bubble-wrap[data-skin-source]');
      if (wraps.length === 0) continue;

      var hasLiveSource = false;
      var removeContainer = false;

      for (var j = 0; j < wraps.length; j++) {
        var wrap = wraps[j];
        var sourceId = wrap.getAttribute('data-skin-source');
        if (!sourceId) continue;

        var sourceEl = document.querySelector('[data-skin-id="' + sourceId + '"]');
        if (!sourceEl) {
          continue; // Source node disappeared.
        }

        hasLiveSource = true;

        // If a typing bubble remains after streaming ended, treat it as stale.
        var isTyping = wrap.getAttribute('data-skin-rendered') === 'typing';
        if (isTyping && adapter && adapter.isStreaming) {
          var stillStreaming = false;
          try {
            stillStreaming = adapter.isStreaming(sourceEl);
          } catch (e) {}

          if (!stillStreaming) {
            removeContainer = true;
            // Remove the stale typing container and trigger a completed re-render.
            try {
              renderMessage(sourceEl, adapter, true);
            } catch (e2) {}
          }
        }
      }

      // Remove containers whose source disappeared or that were marked stale above.
      if (!hasLiveSource || removeContainer) {
        container.remove();
        continue;
      }

      // Drop complete bubbles whose content is now empty after sanitization.
      var completeWraps = container.querySelectorAll('.skin-bubble-wrap[data-skin-rendered="complete"]');
      for (var k = 0; k < completeWraps.length; k++) {
        var bubble = completeWraps[k].querySelector('.skin-bubble');
        if (!bubble) {
          completeWraps[k].remove();
          continue;
        }

        if (!hasMeaningfulAssistantContent(bubble.innerHTML)) {
          completeWraps[k].remove();
        }
      }

      if (container.querySelectorAll('.skin-bubble-wrap').length === 0) {
        container.remove();
      }
    }
  }

  // Public renderer API
  ns.renderer = {
    renderMessage: renderMessage,
    renderAll: renderAll,
    restoreAll: restoreAll,
    reRenderAll: reRenderAll,
    cleanupStaleBubbles: cleanupStaleBubbles,
    updatePageTitle: updatePageTitle,
    loadSettings: loadSettings,
    getCharacterInfo: getCharacterInfo,
    getAvatarSrc: getAvatarSrc,
    getLocalizedName: getLocalizedName,
    BUILTIN_CHARACTERS: BUILTIN_CHARACTERS
  };

})();
