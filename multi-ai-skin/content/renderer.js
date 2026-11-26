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
  let avatarDirectory;
  let useKoreanNames;

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
      return useKoreanNames ? charInfo.nameKo : charInfo.nameEn;
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
  function getAvatarSrc(charInfo) {
    if (charInfo.avatarBase64) {
      return charInfo.avatarBase64;
    }
    return avatarDirectory + (charInfo.avatarFile || charInfo.id + '/avatar.png');
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
      'script, style, message-actions, copy-button, button, mat-icon, .cdk-visually-hidden'
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


  // A source can outlive its siblings when a platform virtualizes or edits a turn.
  const rendered = new Map();
  const lifetime = new AbortController();
  let settings;
  let characters = [];
  let settingsVersion = 0;

  function restore(source, record) {
    record.container.remove();
    for (const target of record.hidden) target.classList.remove('skin-original-hidden');
    record.wrapper.classList.remove('skin-native-content');
    source.removeAttribute('data-skin-processed');
    rendered.delete(source);
  }

  function stop(adapter) {
    lifetime.abort();
    ++settingsVersion;
    for (const [source, record] of rendered) restore(source, record);
    document.body.classList.remove('skin-platform-' + adapter.name, 'skin-view-home', 'skin-view-chat');
  }

  function contextActive(adapter) {
    if (lifetime.signal.aborted) return false;
    try {
      if (chrome.runtime?.id) {
        if (!avatarDirectory) {
          avatarDirectory = chrome.runtime.getURL('assets/characters/');
          useKoreanNames = getUILanguage().toLowerCase().startsWith('ko');
        }
        return true;
      }
    } catch (error) {
      if (!isInvalidContext(error)) throw error;
    }
    stop(adapter);
    return false;
  }

  function isInvalidContext(error) {
    return /Extension context invalidated/i.test(error.message);
  }

  function renderMessage(source, adapter, dirty) {
    const role = adapter.getRole(source);
    const wrapper = adapter.getMessageWrapper(source);
    const previous = rendered.get(source);
    if (!wrapper || !wrapper.parentElement || !role) {
      if (previous) restore(source, previous);
      return;
    }
    const streaming = role === 'assistant' && adapter.isStreaming(source);
    const editor = wrapper.matches('textarea, [contenteditable="true"]') ||
      wrapper.querySelector('textarea, [contenteditable="true"]');
    if (editor) {
      if (previous) restore(source, previous);
      return;
    }

    const intact = previous && previous.wrapper === wrapper && previous.container.isConnected &&
      previous.container.parentElement === wrapper.parentElement;
    if (intact && previous.streaming === streaming && !dirty) return;

    // Keep native controls, media and their event handlers mounted in rich messages.
    const nativeContent = !!wrapper.querySelector('button, [role="button"], input, video, audio, iframe, canvas, img, [data-d-component="widget"]');
    const value = nativeContent ? '' : role === 'assistant' && !streaming
      ? adapter.getInnerHTML(source) : adapter.getTextContent(source);
    if (intact && previous.value === value && previous.streaming === streaming &&
        previous.nativeContent === nativeContent) return;

    if (previous) restore(source, previous);
    const charId = role === 'user' ? settings.userCharacterId : settings.assistantCharacterId;
    const character = getCharacterInfo(charId, characters, role);
    const name = getLocalizedName(character);
    const container = document.createElement('div');
    container.className = 'skin-bubble-container';

    if (nativeContent) {
      const header = createTypingBubble(character, name);
      header.classList.toggle('skin-bubble-wrap-user', role === 'user');
      header.classList.toggle('skin-bubble-wrap-assistant', role === 'assistant');
      header.querySelector('.skin-typing').remove();
      header.removeAttribute('data-skin-rendered');
      container.appendChild(header);
      wrapper.before(container);
      wrapper.classList.add('skin-native-content');
    } else {
      if (role === 'user') {
        if (!value.trim()) return;
        container.appendChild(createUserBubble(value, character, name));
      } else if (streaming) {
        const bubble = createTypingBubble(character, name);
        if (value.trim()) {
          const text = bubble.querySelector('.skin-typing');
          text.classList.remove('skin-typing');
          text.classList.add('skin-stream-text');
          text.textContent = value;
        }
        container.appendChild(bubble);
      } else {
        container.appendChild(createAssistantBubbles(value, character, name, settings.splitMaxChars));
        if (!container.childElementCount) return;
      }
      // Keep native turn actions in place, outside the hidden content and the skin.
      wrapper.after(container);
    }

    const hidden = [];
    if (!nativeContent) {
      const target = adapter.getHideTarget ? adapter.getHideTarget(source, role) : wrapper;
      for (const el of [target, ...(adapter.getExtraHideTargets?.(source, role) || [])]) {
        if (el && !el.contains(container)) {
          el.classList.add('skin-original-hidden');
          hidden.push(el);
        }
      }
    }
    source.setAttribute('data-skin-processed', 'true');
    rendered.set(source, { wrapper, container, hidden, value, streaming, nativeContent });
  }

  function renderAll(adapter, changedNodes) {
    if (!contextActive(adapter) || !settings || !settings.enabled) return;
    const sources = new Set(adapter.getMessages());
    for (const [source, record] of rendered) {
      if (!sources.has(source)) restore(source, record);
    }
    for (const source of sources) {
      const dirty = !changedNodes || changedNodes.some(node => source.contains(node));
      renderMessage(source, adapter, dirty);
    }
    ns.updateViewState?.(adapter, sources.size);
  }

  function reloadSettings(adapter) {
    if (!contextActive(adapter)) return;
    const version = ++settingsVersion;
    loadSettings(function (nextSettings, nextCharacters) {
      if (version !== settingsVersion || !contextActive(adapter)) return;
      for (const [source, record] of rendered) restore(source, record);
      settings = nextSettings;
      characters = nextCharacters || [];
      if (settings.enabled) renderAll(adapter);
      else document.body.classList.remove('skin-platform-' + adapter.name, 'skin-view-home', 'skin-view-chat');
    });
  }

  ns.renderer = { renderAll, reloadSettings, contextActive, signal: lifetime.signal };
})();
