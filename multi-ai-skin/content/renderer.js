/**
 * renderer.js — 버블 렌더링 로직
 * 
 * 원본 메시지 요소를 숨기고, 캐릭터 기반 메신저 버블 UI를 삽입한다.
 */
(function () {
  'use strict';

  var ns = (window.AIChatSkin = window.AIChatSkin || {});
  var BUILTIN_CHARACTERS = ns.BUILTIN_CHARACTERS || [];

  /**
   * 설정 불러오기 (캐시 포함)
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
          // Extension context invalidated — 캐시 사용
          callback(settings, cachedUserChars || []);
        }
      });
    } catch (e) {
      // Extension context invalidated — 캐시된 설정 사용
      if (cachedSettings) {
        callback(cachedSettings, cachedUserChars || []);
      }
      // 캐시도 없으면 조용히 종료
    }
  }

  /** Chrome UI 언어 (예: 'ko', 'en') */
  function getUILanguage() {
    try {
      if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getUILanguage) {
        return chrome.i18n.getUILanguage();
      }
    } catch (e) {}
    return (navigator.language || navigator.userLanguage || 'en').split('-')[0];
  }

  /** 캐릭터 표시 이름 — UI 언어에 따라 nameKo / nameEn 반환 */
  function getLocalizedName(charInfo) {
    if (!charInfo) return '';
    if (charInfo.nameKo != null && charInfo.nameEn != null) {
      return getUILanguage().toLowerCase().indexOf('ko') === 0 ? charInfo.nameKo : charInfo.nameEn;
    }
    return charInfo.name || charInfo.nameEn || charInfo.nameKo || '';
  }

  function getCharacterInfo(charId, userChars, role) {
    // 빌트인에서 찾기
    for (var i = 0; i < BUILTIN_CHARACTERS.length; i++) {
      if (BUILTIN_CHARACTERS[i].id === charId) {
        return BUILTIN_CHARACTERS[i];
      }
    }
    // 사용자 정의에서 찾기
    if (userChars) {
      for (var j = 0; j < userChars.length; j++) {
        if (userChars[j].id === charId) {
          return userChars[j];
        }
      }
    }
    // 기본값: 역할에 맞는 첫 번째 빌트인
    role = role || 'assistant';
    for (var k = 0; k < BUILTIN_CHARACTERS.length; k++) {
      if (BUILTIN_CHARACTERS[k].role === role) {
        return BUILTIN_CHARACTERS[k];
      }
    }
    return BUILTIN_CHARACTERS[0];
  }

  /**
   * 아바타 이미지 URL 반환
   * avatarFile 있으면 단일 파일(예: .webp), 없으면 폴더 내 avatar.png 사용
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

    // 텍스트 외 콘텐츠(이미지/코드/표 등)는 유효 메시지로 본다.
    return !!temp.querySelector('img, pre, code, table, ul, ol, blockquote, hr, svg, video, audio, canvas, iframe');
  }

  /**
   * 타이핑 인디케이터 버블 생성
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
   * 어시스턴트 메시지 버블 생성 (문단 분리 적용)
   */
  function createAssistantBubbles(htmlContent, charInfo, displayName, maxChars) {
    var chunks = ns.splitter.split(htmlContent, maxChars);
    var fragment = document.createDocumentFragment();

    for (var i = 0; i < chunks.length; i++) {
      // 액션/숨김 노드를 제거한 뒤 실질 콘텐츠가 없는 청크는 제외
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
      // 캐릭터 테마 색상으로 글로우 효과
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
   * 사용자 메시지 버블 생성
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
   * 메시지를 감싸는 래퍼(article/turn) 찾기
   * 래퍼를 기준으로 버블을 삽입하여 일관된 너비 보장
   */
  function findInsertionTarget(msgEl, adapter) {
    var wrapper = adapter.getMessageWrapper(msgEl);
    return wrapper || msgEl;
  }

  function getHideTarget(msgEl, adapter, role) {
    if (adapter && adapter.getHideTarget) {
      try {
        var target = adapter.getHideTarget(msgEl, role);
        if (target && target.classList) return target;
      } catch (e) {}
    }
    return msgEl;
  }

  function hideOriginal(msgEl, adapter, role) {
    var target = getHideTarget(msgEl, adapter, role);
    if (target && target.classList) target.classList.add('skin-original-hidden');
  }

  function showOriginal(msgEl, adapter, role) {
    // 기본 메시지 노드 복원
    if (msgEl && msgEl.classList) msgEl.classList.remove('skin-original-hidden');

    // 어댑터 지정 숨김 노드 복원
    var target = getHideTarget(msgEl, adapter, role);
    if (target && target !== msgEl && target.classList) {
      target.classList.remove('skin-original-hidden');
    }
  }

  /**
   * 특정 메시지 요소에 연결된 기존 스킨 버블들 제거
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
   * 메시지 요소에 스킨 적용
   * 
   * @param {Element} msgEl - 원본 메시지 요소
   * @param {Object} adapter - 플랫폼 어댑터
   * @param {boolean} forceComplete - true이면 isStreaming 체크를 무시하고 완료 상태로 렌더링
   */
  function renderMessage(msgEl, adapter, forceComplete) {
    // 이미 처리된 요소인지 확인
    if (msgEl.getAttribute('data-skin-processed') === 'true') {
      // forceComplete로 호출된 경우: 기존 타이핑 버블을 완료 상태로 교체
      if (forceComplete) {
        removeExistingSkinBubbles(msgEl);
        msgEl.removeAttribute('data-skin-processed');
        // 아래에서 다시 complete 렌더링됨
      } else {
        // 스트리밍 상태 변경 확인
        var skinId = msgEl.getAttribute('data-skin-id');
        if (skinId) {
          var existingWraps = document.querySelectorAll('.skin-bubble-wrap[data-skin-source="' + skinId + '"]');
          if (existingWraps.length > 0) {
            var firstWrap = existingWraps[0];
            var isTyping = firstWrap.getAttribute('data-skin-rendered') === 'typing';
            var isStillStreaming = adapter.isStreaming(msgEl);

            // 아직 스트리밍 중이면 유지
            if (isStillStreaming && isTyping) return;

            // 스트리밍이 끝났는데 타이핑 상태이면 다시 렌더링
            if (!isStillStreaming && isTyping) {
              removeExistingSkinBubbles(msgEl);
              msgEl.removeAttribute('data-skin-processed');
              // 아래에서 다시 렌더링됨
            } else {
              return; // 이미 완료
            }
          } else {
            return;
          }
        } else {
          return;
        }
      }
    }

    // ★ 핵심: 비동기 콜백 전에 즉시 'processing' 마크 → race condition 방지
    // Observer와 polling이 동시에 호출해도 중복 실행되지 않음
    var role = adapter.getRole(msgEl);
    if (!role) return;

    // forceComplete가 true면 isStreaming을 무시
    var isStreaming = forceComplete ? false : adapter.isStreaming(msgEl);

    // 스킨 ID 부여 (아직 없으면)
    var skinId = msgEl.getAttribute('data-skin-id');
    if (!skinId) {
      skinId = 'skin_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      msgEl.setAttribute('data-skin-id', skinId);
    }

    // 즉시 processed 표시하여 다른 호출에서 중복 처리 방지
    msgEl.setAttribute('data-skin-processed', 'true');

    function cancelRender() {
      msgEl.removeAttribute('data-skin-processed');
      msgEl.removeAttribute('data-skin-id');
      showOriginal(msgEl, adapter, role);
    }

    loadSettings(function (settings, userChars) {
      if (!settings.enabled) {
        // 비활성화 시 이미 설정한 마크 제거
        cancelRender();
        return;
      }

      // 비동기 콜백 실행 시점에 이미 다른 호출이 버블을 삽입했는지 재확인
      var existingBubbleCount = document.querySelectorAll('.skin-bubble-wrap[data-skin-source="' + skinId + '"]').length;
      if (existingBubbleCount > 0) {
        // 이미 버블이 있음 — 중복 삽입 방지
        return;
      }

      // 래퍼 요소 결정 (삽입 위치 계산용)
      var wrapper = adapter.getMessageWrapper ? adapter.getMessageWrapper(msgEl) : msgEl;

      if (role === 'assistant') {
        var aCharInfo = getCharacterInfo(settings.assistantCharacterId, userChars, 'assistant');
        var aDisplayName = getLocalizedName(aCharInfo);
        var insertPoint = wrapper.nextSibling;
        var insertParent = wrapper.parentNode;

        // 어댑터가 액션 영역을 제공하면 버블을 action area 앞에 삽입한다.
        // (Claude/Gemini에서 액션 버튼이 버블 위에 뜨는 문제 방지)
        if (adapter && adapter.getActionArea) {
          try {
            var actionArea = adapter.getActionArea(msgEl);
            if (actionArea && actionArea.parentNode) {
              insertParent = actionArea.parentNode;
              insertPoint = actionArea;
            }
          } catch (e0) {}
        }

        if (isStreaming) {
          // Gemini는 콘텐츠 없는 placeholder model-response가 남는 경우가 있어
          // 실질 콘텐츠가 감지될 때만 타이핑 버블을 생성한다.
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

          // 원본 메시지 요소만 숨기기 (액션 버튼은 유지)
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

          // 내용 없는 assistant 메시지는 렌더링하지 않음 (Gemini 빈 버블 방지)
          if (bubbleChildren.length === 0) {
            cancelRender();
            return;
          }

          // 원본 메시지 요소만 숨기기 (액션 버튼은 유지)
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

        // 어댑터가 액션 영역을 제공하면 사용자 버블도 action area 앞에 삽입한다.
        // (Claude에서 hover 기준 영역과 액션 버튼 위치가 어긋나는 문제 방지)
        if (adapter && adapter.getActionArea) {
          try {
            var userActionArea = adapter.getActionArea(msgEl);
            if (userActionArea && userActionArea.parentNode) {
              userInsertParent = userActionArea.parentNode;
              userInsertPoint = userActionArea;
            }
          } catch (e3) {}
        }

        if (!textContent || !String(textContent).trim()) {
          cancelRender();
          return;
        }

        // 원본 메시지 요소만 숨기기 (액션 버튼은 유지)
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
   * 탭 제목을 선택한 상대 캐릭터 이름으로 설정 (화면 내 대화 상대 이름 표시)
   */
  function updatePageTitle() {
    // Keep original page title unchanged.
  }

  /**
   * 모든 메시지에 스킨 적용
   */
  function renderAll(adapter) {
    loadSettings(function (settings, userChars) {
      if (!settings.enabled) {
        // 비활성화 시 모든 스킨 제거 및 원본 복원
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
   * 모든 스킨 제거하고 원본 복원
   */
  function restoreAll() {
    // 스킨 컨테이너(내부 버블 포함) 제거
    var containers = document.querySelectorAll('.skin-bubble-container');
    for (var i = 0; i < containers.length; i++) {
      containers[i].remove();
    }

    // 숨겨진 원본 요소 복원 (래퍼 포함)
    var hiddenEls = document.querySelectorAll('.skin-original-hidden');
    for (var k = 0; k < hiddenEls.length; k++) {
      hiddenEls[k].classList.remove('skin-original-hidden');
    }

    // data-skin-processed 속성 정리
    var processed = document.querySelectorAll('[data-skin-processed="true"]');
    for (var j = 0; j < processed.length; j++) {
      processed[j].removeAttribute('data-skin-processed');
      processed[j].removeAttribute('data-skin-id');
    }
  }

  /**
   * 모든 메시지를 다시 렌더링 (설정 변경 시)
   */
  function reRenderAll(adapter) {
    restoreAll();
    renderAll(adapter);
  }

  /**
   * 메시지 원본과 연결이 끊긴(또는 유효하지 않은) 고아 스킨 버블 정리
   * Gemini에서 placeholder turn이 사라진 뒤 남는 빈 버블/타이핑 버블 방지용.
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
          continue; // 고아 후보
        }

        hasLiveSource = true;

        // 타이핑 버블인데 실제 스트리밍이 끝났다면 stale로 판단
        var isTyping = wrap.getAttribute('data-skin-rendered') === 'typing';
        if (isTyping && adapter && adapter.isStreaming) {
          var stillStreaming = false;
          try {
            stillStreaming = adapter.isStreaming(sourceEl);
          } catch (e) {}

          if (!stillStreaming) {
            removeContainer = true;
            // 가능한 경우 완료 렌더 시도 (내용이 없으면 내부적으로 cancelRender됨)
            try {
              renderMessage(sourceEl, adapter, true);
            } catch (e2) {}
          }
        }
      }

      // 소스가 사라진 고아 컨테이너는 제거
      if (!hasLiveSource || removeContainer) {
        container.remove();
        continue;
      }

      // 완료 버블 중 의미 없는 버블은 개별 제거
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

  // 공개 API
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
