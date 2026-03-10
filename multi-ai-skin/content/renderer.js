/**
 * renderer.js ??踰꾨툝 ?뚮뜑留?濡쒖쭅
 * 
 * ?먮낯 硫붿떆吏 ?붿냼瑜??④린怨? 罹먮┃??湲곕컲 硫붿떊? 踰꾨툝 UI瑜??쎌엯?쒕떎.
 */
(function () {
  'use strict';

  var ns = (window.AIChatSkin = window.AIChatSkin || {});
  var BUILTIN_CHARACTERS = ns.BUILTIN_CHARACTERS || [];

  /**
   * ?ㅼ젙 遺덈윭?ㅺ린 (罹먯떆 ?ы븿)
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
          // Extension context invalidated ??罹먯떆 ?ъ슜
          callback(settings, cachedUserChars || []);
        }
      });
    } catch (e) {
      // Extension context invalidated ??罹먯떆???ㅼ젙 ?ъ슜
      if (cachedSettings) {
        callback(cachedSettings, cachedUserChars || []);
      }
      // 罹먯떆???놁쑝硫?議곗슜??醫낅즺
    }
  }

  /** Chrome UI ?몄뼱 (?? 'ko', 'en') */
  function getUILanguage() {
    try {
      if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getUILanguage) {
        return chrome.i18n.getUILanguage();
      }
    } catch (e) {}
    return (navigator.language || navigator.userLanguage || 'en').split('-')[0];
  }

  /** 罹먮┃???쒖떆 ?대쫫 ??UI ?몄뼱???곕씪 nameKo / nameEn 諛섑솚 */
  function getLocalizedName(charInfo) {
    if (!charInfo) return '';
    if (charInfo.nameKo != null && charInfo.nameEn != null) {
      return getUILanguage().toLowerCase().indexOf('ko') === 0 ? charInfo.nameKo : charInfo.nameEn;
    }
    return charInfo.name || charInfo.nameEn || charInfo.nameKo || '';
  }

  function getCharacterInfo(charId, userChars, role) {
    // 鍮뚰듃?몄뿉??李얘린
    for (var i = 0; i < BUILTIN_CHARACTERS.length; i++) {
      if (BUILTIN_CHARACTERS[i].id === charId) {
        return BUILTIN_CHARACTERS[i];
      }
    }
    // ?ъ슜???뺤쓽?먯꽌 李얘린
    if (userChars) {
      for (var j = 0; j < userChars.length; j++) {
        if (userChars[j].id === charId) {
          return userChars[j];
        }
      }
    }
    // 湲곕낯媛? ??븷??留욌뒗 泥?踰덉㎏ 鍮뚰듃??    role = role || 'assistant';
    for (var k = 0; k < BUILTIN_CHARACTERS.length; k++) {
      if (BUILTIN_CHARACTERS[k].role === role) {
        return BUILTIN_CHARACTERS[k];
      }
    }
    return BUILTIN_CHARACTERS[0];
  }

  /**
   * ?꾨컮? ?대?吏 URL 諛섑솚
   * avatarFile ?덉쑝硫??⑥씪 ?뚯씪(?? .webp), ?놁쑝硫??대뜑 ??avatar.png ?ъ슜
   */
  function getAvatarSrc(charInfo) {
    if (charInfo.avatarBase64) {
      return charInfo.avatarBase64;
    }
    if (charInfo.avatarFile) {
      return chrome.runtime.getURL('assets/characters/' + charInfo.avatarFile);
    }
    return chrome.runtime.getURL('assets/characters/' + charInfo.id + '/avatar.png');
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

    // ?띿뒪????肄섑뀗痢??대?吏/肄붾뱶/???????좏슚 硫붿떆吏濡?蹂몃떎.
    return !!temp.querySelector('img, pre, code, table, ul, ol, blockquote, hr, svg, video, audio, canvas, iframe');
  }

  /**
   * ??댄븨 ?몃뵒耳?댄꽣 踰꾨툝 ?앹꽦
   */
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
   * ?댁떆?ㅽ꽩??硫붿떆吏 踰꾨툝 ?앹꽦 (臾몃떒 遺꾨━ ?곸슜)
   */
  function createAssistantBubbles(htmlContent, charInfo, displayName, maxChars) {
    var chunks = ns.splitter.split(htmlContent, maxChars);
    var fragment = document.createDocumentFragment();

    for (var i = 0; i < chunks.length; i++) {
      // ?≪뀡/?④? ?몃뱶瑜??쒓굅?????ㅼ쭏 肄섑뀗痢좉? ?녿뒗 泥?겕???쒖쇅
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
      // 罹먮┃???뚮쭏 ?됱긽?쇰줈 湲濡쒖슦 ?④낵
      bubble.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px ' + charInfo.color + '10';

      contentCol.appendChild(nameEl);
      contentCol.appendChild(bubble);
      wrap.appendChild(avatar);
      wrap.appendChild(contentCol);
      fragment.appendChild(wrap);
    }

    return fragment;
  }

  /**
   * ?ъ슜??硫붿떆吏 踰꾨툝 ?앹꽦
   */
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
   * 硫붿떆吏瑜?媛먯떥???섑띁(article/turn) 李얘린
   * ?섑띁瑜?湲곗??쇰줈 踰꾨툝???쎌엯?섏뿬 ?쇨????덈퉬 蹂댁옣
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

  /**
   * ?뱀젙 硫붿떆吏 ?붿냼???곌껐??湲곗〈 ?ㅽ궓 踰꾨툝???쒓굅
   */
  function removeExistingSkinBubbles(msgEl) {
    var skinId = msgEl.getAttribute('data-skin-id');
    if (skinId) {
      var existing = document.querySelectorAll('.skin-bubble-wrap[data-skin-source="' + skinId + '"]');
      var container = existing.length > 0 ? existing[0].closest('.skin-bubble-container') : null;
      if (container) container.remove();
    }
  }

  /**
   * 硫붿떆吏 ?붿냼???ㅽ궓 ?곸슜
   * 
   * @param {Element} msgEl - ?먮낯 硫붿떆吏 ?붿냼
   * @param {Object} adapter - ?뚮옯???대뙌??   * @param {boolean} forceComplete - true?대㈃ isStreaming 泥댄겕瑜?臾댁떆?섍퀬 ?꾨즺 ?곹깭濡??뚮뜑留?   */
  function renderMessage(msgEl, adapter, forceComplete) {
    // ?대? 泥섎━???붿냼?몄? ?뺤씤
    if (msgEl.getAttribute('data-skin-processed') === 'true') {
      // forceComplete濡??몄텧??寃쎌슦: 湲곗〈 ??댄븨 踰꾨툝???꾨즺 ?곹깭濡?援먯껜
      if (forceComplete) {
        removeExistingSkinBubbles(msgEl);
        msgEl.removeAttribute('data-skin-processed');
        // ?꾨옒?먯꽌 ?ㅼ떆 complete ?뚮뜑留곷맖
      } else {
        // ?ㅽ듃由щ컢 ?곹깭 蹂寃??뺤씤
        var skinId = msgEl.getAttribute('data-skin-id');
        if (skinId) {
          var existingWraps = document.querySelectorAll('.skin-bubble-wrap[data-skin-source="' + skinId + '"]');
          if (existingWraps.length > 0) {
            var firstWrap = existingWraps[0];
            var isTyping = firstWrap.getAttribute('data-skin-rendered') === 'typing';
            var isStillStreaming = adapter.isStreaming(msgEl);

            // ?꾩쭅 ?ㅽ듃由щ컢 以묒씠硫??좎?
            if (isStillStreaming && isTyping) return;

            // Streaming finished but typing bubble still exists: re-render complete bubble.
            if (!isStillStreaming && isTyping) {
              removeExistingSkinBubbles(msgEl);
              msgEl.removeAttribute('data-skin-processed');
              // ?꾨옒?먯꽌 ?ㅼ떆 ?뚮뜑留곷맖
            } else {
              return; // ?대? ?꾨즺
            }
          } else {
            return;
          }
        } else {
          return;
        }
      }
    }

    // ???듭떖: 鍮꾨룞湲?肄쒕갚 ?꾩뿉 利됱떆 'processing' 留덊겕 ??race condition 諛⑹?
    // Observer? polling???숈떆???몄텧?대룄 以묐났 ?ㅽ뻾?섏? ?딆쓬
    var role = adapter.getRole(msgEl);
    if (!role) return;

    // forceComplete媛 true硫?isStreaming??臾댁떆
    var isStreaming = forceComplete ? false : adapter.isStreaming(msgEl);

    // ?ㅽ궓 ID 遺??(?꾩쭅 ?놁쑝硫?
    var skinId = msgEl.getAttribute('data-skin-id');
    if (!skinId) {
      skinId = 'skin_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      msgEl.setAttribute('data-skin-id', skinId);
    }

    // 利됱떆 processed ?쒖떆?섏뿬 ?ㅻⅨ ?몄텧?먯꽌 以묐났 泥섎━ 諛⑹?
    msgEl.setAttribute('data-skin-processed', 'true');

    function cancelRender() {
      msgEl.removeAttribute('data-skin-processed');
      msgEl.removeAttribute('data-skin-id');
      showOriginal(msgEl, adapter, role);
    }

    loadSettings(function (settings, userChars) {
      if (!settings.enabled) {
        // 鍮꾪솢?깊솕 ???대? ?ㅼ젙??留덊겕 ?쒓굅
        cancelRender();
        return;
      }

      // Skip duplicate insertion if another render call already inserted this source bubble.
      var existingBubbleCount = document.querySelectorAll('.skin-bubble-wrap[data-skin-source="' + skinId + '"]').length;
      if (existingBubbleCount > 0) {
        // ?대? 踰꾨툝???덉쓬 ??以묐났 ?쎌엯 諛⑹?
        return;
      }

      // ?섑띁 ?붿냼 寃곗젙 (?쎌엯 ?꾩튂 怨꾩궛??
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

        // ?대뙌?곌? ?≪뀡 ?곸뿭???쒓났?섎㈃ 踰꾨툝??action area ?욎뿉 ?쎌엯?쒕떎.
        // (Claude/Gemini?먯꽌 ?≪뀡 踰꾪듉??踰꾨툝 ?꾩뿉 ?⑤뒗 臾몄젣 諛⑹?)
        if (adapter && adapter.getActionArea) {
          try {
            var actionArea = adapter.getActionArea(msgEl);
            if (actionArea && actionArea.parentNode && isNodeAfter(wrapper, actionArea)) {
              insertParent = actionArea.parentNode;
              insertPoint = actionArea;
            }
          } catch (e0) {}
        }

        if (isStreaming) {
          // Gemini??肄섑뀗痢??녿뒗 placeholder model-response媛 ?⑤뒗 寃쎌슦媛 ?덉뼱
          // ?ㅼ쭏 肄섑뀗痢좉? 媛먯????뚮쭔 ??댄븨 踰꾨툝???앹꽦?쒕떎.
          if (adapter && adapter.name === 'gemini') {
            var streamingHtml = '';
            var streamingText = '';
            try {
              streamingHtml = adapter.getInnerHTML(msgEl) || '';
            } catch (e1) {}
            try {
              streamingText = adapter.getTextContent(msgEl) || '';
            } catch (e2) {}

            if (!hasMeaningfulAssistantContent(streamingHtml) && !normalizeVisibleText(streamingText)) {
              cancelRender();
              return;
            }
          }

          // ?먮낯 硫붿떆吏 ?붿냼留??④린湲?(?≪뀡 踰꾪듉? ?좎?)
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

          // ?댁슜 ?녿뒗 assistant 硫붿떆吏???뚮뜑留곹븯吏 ?딆쓬 (Gemini 鍮?踰꾨툝 諛⑹?)
          if (bubbleChildren.length === 0) {
            cancelRender();
            return;
          }

          // ?먮낯 硫붿떆吏 ?붿냼留??④린湲?(?≪뀡 踰꾪듉? ?좎?)
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

        // ?먮낯 硫붿떆吏 ?붿냼留??④린湲?(?≪뀡 踰꾪듉? ?좎?)
        hideOriginal(msgEl, adapter, role);

        var userBubble = createUserBubble(textContent, uCharInfo, uDisplayName);
        userBubble.setAttribute('data-skin-source', skinId);
        var wrap = document.createElement('div');
        wrap.className = 'skin-bubble-container';
        wrap.appendChild(userBubble);
        userInsertParent.insertBefore(wrap, userInsertPoint);
      }
    });
  }

  /**
   * ???쒕ぉ???좏깮???곷? 罹먮┃???대쫫?쇰줈 ?ㅼ젙 (?붾㈃ ??????곷? ?대쫫 ?쒖떆)
   */
  function updatePageTitle() {
    // Keep original page title unchanged.
  }

  /**
   * 紐⑤뱺 硫붿떆吏???ㅽ궓 ?곸슜
   */
  function renderAll(adapter) {
    loadSettings(function (settings, userChars) {
      if (!settings.enabled) {
        // 鍮꾪솢?깊솕 ??紐⑤뱺 ?ㅽ궓 ?쒓굅 諛??먮낯 蹂듭썝
        restoreAll();
        return;
      }

      var messages = adapter.getMessages();
      for (var i = 0; i < messages.length; i++) {
        renderMessage(messages[i], adapter);
      }
    });
  }

  /**
   * 紐⑤뱺 ?ㅽ궓 ?쒓굅?섍퀬 ?먮낯 蹂듭썝
   */
  function restoreAll() {
    // ?ㅽ궓 而⑦뀒?대꼫(?대? 踰꾨툝 ?ы븿) ?쒓굅
    var containers = document.querySelectorAll('.skin-bubble-container');
    for (var i = 0; i < containers.length; i++) {
      containers[i].remove();
    }

    // ?④꺼吏??먮낯 ?붿냼 蹂듭썝 (?섑띁 ?ы븿)
    var hiddenEls = document.querySelectorAll('.skin-original-hidden');
    for (var k = 0; k < hiddenEls.length; k++) {
      hiddenEls[k].classList.remove('skin-original-hidden');
    }

    // data-skin-processed ?띿꽦 ?뺣━
    var processed = document.querySelectorAll('[data-skin-processed="true"]');
    for (var j = 0; j < processed.length; j++) {
      processed[j].removeAttribute('data-skin-processed');
      processed[j].removeAttribute('data-skin-id');
    }
  }

  /**
   * 紐⑤뱺 硫붿떆吏瑜??ㅼ떆 ?뚮뜑留?(?ㅼ젙 蹂寃???
   */
  function reRenderAll(adapter) {
    restoreAll();
    renderAll(adapter);
  }

  /**
   * 硫붿떆吏 ?먮낯怨??곌껐???딄릿(?먮뒗 ?좏슚?섏? ?딆?) 怨좎븘 ?ㅽ궓 踰꾨툝 ?뺣━
   * Gemini?먯꽌 placeholder turn???щ씪吏????⑤뒗 鍮?踰꾨툝/??댄븨 踰꾨툝 諛⑹???
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
          continue; // 怨좎븘 ?꾨낫
        }

        hasLiveSource = true;

        // ??댄븨 踰꾨툝?몃뜲 ?ㅼ젣 ?ㅽ듃由щ컢???앸궗?ㅻ㈃ stale濡??먮떒
        var isTyping = wrap.getAttribute('data-skin-rendered') === 'typing';
        if (isTyping && adapter && adapter.isStreaming) {
          var stillStreaming = false;
          try {
            stillStreaming = adapter.isStreaming(sourceEl);
          } catch (e) {}

          if (!stillStreaming) {
            removeContainer = true;
            // 媛?ν븳 寃쎌슦 ?꾨즺 ?뚮뜑 ?쒕룄 (?댁슜???놁쑝硫??대??곸쑝濡?cancelRender??
            try {
              renderMessage(sourceEl, adapter, true);
            } catch (e2) {}
          }
        }
      }

      // ?뚯뒪媛 ?щ씪吏?怨좎븘 而⑦뀒?대꼫???쒓굅
      if (!hasLiveSource || removeContainer) {
        container.remove();
        continue;
      }

      // ?꾨즺 踰꾨툝 以??섎? ?녿뒗 踰꾨툝? 媛쒕퀎 ?쒓굅
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

  // 怨듦컻 API
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
