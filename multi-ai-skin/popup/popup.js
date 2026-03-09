/**
 * popup.js — 팝업 설정 UI 로직
 * 
 * 캐릭터 선택, 표시 이름 설정, 문단 분리 기준 설정,
 * 사용자 정의 캐릭터 추가/삭제 기능.
 */
(function () {
  'use strict';

  // shared/builtin-characters.js 로드 후 사용
  var BUILTIN_CHARACTERS = (window.AIChatSkin && window.AIChatSkin.BUILTIN_CHARACTERS) ? window.AIChatSkin.BUILTIN_CHARACTERS : [];

  // ========================================
  // DOM 요소 참조
  // ========================================
  var elements = {
    enabledCheckbox: document.getElementById('enabled-checkbox'),
    mainContent: document.getElementById('main-content'),
    assistantGrid: document.getElementById('assistant-char-grid'),
    userGrid: document.getElementById('user-char-grid'),
    splitMaxChars: document.getElementById('split-max-chars'),
    addCharModal: document.getElementById('add-char-modal'),
    newCharName: document.getElementById('new-char-name'),
    newCharColor: document.getElementById('new-char-color'),
    newCharColorLabel: document.getElementById('new-char-color-label'),
    newCharImage: document.getElementById('new-char-image'),
    newCharImageBtn: document.getElementById('new-char-image-btn'),
    newCharPreview: document.getElementById('new-char-preview'),
    newCharPreviewImg: document.getElementById('new-char-preview-img'),
    cancelAddChar: document.getElementById('cancel-add-char'),
    saveAddChar: document.getElementById('save-add-char')
  };

  // 현재 모달이 어느 그리드에서 열렸는지 추적
  var addCharTarget = null; // 'assistant' | 'user'

  // 현재 새 캐릭터 이미지 base64
  var pendingImageBase64 = null;

  // ========================================
  // 유틸리티 함수
  // ========================================

  /**
   * 빌트인 + 사용자 정의 캐릭터 병합 로드
   */
  function loadAllCharacters(callback) {
    chrome.storage.local.get({ userCharacters: [] }, function (data) {
      var allChars = BUILTIN_CHARACTERS.concat(data.userCharacters || []);
      callback(allChars, data.userCharacters || []);
    });
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

  /**
   * 캐릭터 아바타 이미지 URL 반환
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

  /**
   * 설정 저장 (즉시 sync)
   */
  function saveSettings(settings) {
    chrome.storage.sync.set(settings, function () {
      if (chrome.runtime.lastError) {
        console.error('Settings save error:', chrome.runtime.lastError);
      }
    });
  }

  // ========================================
  // 캐릭터 그리드 렌더링
  // ========================================

  /**
   * 캐릭터 카드 DOM 생성
   */
  function createCharCard(charInfo, isSelected, side) {
    var card = document.createElement('div');
    card.className = 'popup-char-card';
    card.setAttribute('data-char-id', charInfo.id);

    if (isSelected) {
      card.classList.add('active');
      card.style.color = charInfo.color;
      card.style.borderColor = charInfo.color;
    }

    // 빌트인 잠금 아이콘
    if (charInfo.builtin) {
      var lockIcon = document.createElement('span');
      lockIcon.className = 'popup-char-card-lock';
      lockIcon.textContent = '🔒';
      card.appendChild(lockIcon);
    } else {
      // 사용자 정의 삭제 버튼
      var deleteBtn = document.createElement('button');
      deleteBtn.className = 'popup-char-card-delete';
      deleteBtn.textContent = '✕';
      deleteBtn.setAttribute('data-char-id', charInfo.id);
      deleteBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        deleteUserCharacter(charInfo.id);
      });
      card.appendChild(deleteBtn);
    }

    // 아바타 이미지
    var avatar = document.createElement('img');
    avatar.className = 'popup-char-card-avatar';
    avatar.src = getAvatarSrc(charInfo);
    avatar.alt = charInfo.name;
    avatar.onerror = function () {
      // 이미지 로드 실패 시 기본 배경 유지
      this.style.display = 'none';
    };
    card.appendChild(avatar);

    // 이름 (UI 언어에 따라 표시)
    var name = document.createElement('span');
    name.className = 'popup-char-card-name';
    name.textContent = getLocalizedName(charInfo);
    card.appendChild(name);

    // 클릭 이벤트: 캐릭터 선택
    card.addEventListener('click', function () {
      selectCharacter(charInfo, side);
    });

    return card;
  }

  /**
   * [+ 추가] 카드 DOM 생성
   */
  function createAddCard(side) {
    var card = document.createElement('div');
    card.className = 'popup-char-card popup-char-card-add';

    var icon = document.createElement('span');
    icon.className = 'popup-char-card-add-icon';
    icon.textContent = '+';
    card.appendChild(icon);

    var label = document.createElement('span');
    label.className = 'popup-char-card-add-label';
    label.textContent = '추가';
    card.appendChild(label);

    card.addEventListener('click', function () {
      openAddCharModal(side);
    });

    return card;
  }

  /**
   * 특정 사이드(assistant/user)의 캐릭터 그리드 렌더링
   */
  function renderCharGrid(gridEl, side, selectedCharId, allChars) {
    gridEl.innerHTML = '';

    for (var i = 0; i < allChars.length; i++) {
      var charInfo = allChars[i];
      var isSelected = charInfo.id === selectedCharId;
      var card = createCharCard(charInfo, isSelected, side);
      gridEl.appendChild(card);
    }

    // 추가 버튼
    var addCard = createAddCard(side);
    gridEl.appendChild(addCard);
  }

  // ========================================
  // 캐릭터 선택
  // ========================================

  function selectCharacter(charInfo, side) {
    if (side === 'assistant') {
      saveSettings({ assistantCharacterId: charInfo.id });
    } else {
      saveSettings({ userCharacterId: charInfo.id });
    }
    reloadUI();
  }

  // ========================================
  // 사용자 정의 캐릭터 관리
  // ========================================

  function openAddCharModal(side) {
    addCharTarget = side;
    pendingImageBase64 = null;

    elements.newCharName.value = '';
    elements.newCharColor.value = '#888888';
    elements.newCharColorLabel.textContent = '#888888';
    elements.newCharImage.value = '';
    elements.newCharPreview.style.display = 'none';
    elements.addCharModal.style.display = 'flex';
  }

  function closeAddCharModal() {
    elements.addCharModal.style.display = 'none';
    addCharTarget = null;
    pendingImageBase64 = null;
  }

  function saveNewCharacter() {
    var name = elements.newCharName.value.trim();
    var color = elements.newCharColor.value;

    if (!name) {
      elements.newCharName.focus();
      elements.newCharName.style.borderColor = '#ff3b30';
      setTimeout(function () {
        elements.newCharName.style.borderColor = '';
      }, 1500);
      return;
    }

    if (!pendingImageBase64) {
      elements.newCharImageBtn.style.borderColor = '#ff3b30';
      setTimeout(function () {
        elements.newCharImageBtn.style.borderColor = '';
      }, 1500);
      return;
    }

    var newChar = {
      id: 'user_char_' + Date.now(),
      name: name,
      color: color,
      avatarBase64: pendingImageBase64,
      builtin: false
    };

    chrome.storage.local.get({ userCharacters: [] }, function (data) {
      var userChars = data.userCharacters || [];
      userChars.push(newChar);
      chrome.storage.local.set({ userCharacters: userChars }, function () {
        closeAddCharModal();

        if (addCharTarget === 'assistant') {
          saveSettings({ assistantCharacterId: newChar.id });
        } else {
          saveSettings({ userCharacterId: newChar.id });
        }
        reloadUI();
      });
    });
  }

  function deleteUserCharacter(charId) {
    if (!confirm('이 캐릭터를 삭제하시겠습니까?')) return;

    chrome.storage.local.get({ userCharacters: [] }, function (data) {
      var userChars = (data.userCharacters || []).filter(function (c) {
        return c.id !== charId;
      });
      chrome.storage.local.set({ userCharacters: userChars }, function () {
        // 삭제된 캐릭터가 현재 선택된 것이었으면 기본값으로 복원
        chrome.storage.sync.get({
          assistantCharacterId: 'aemeath',
          userCharacterId: 'rober_f'
        }, function (settings) {
          var updates = {};
          if (settings.assistantCharacterId === charId) {
            updates.assistantCharacterId = 'aemeath';
          }
          if (settings.userCharacterId === charId) {
            updates.userCharacterId = 'rober_f';
          }
          if (Object.keys(updates).length > 0) {
            saveSettings(updates);
          }
          reloadUI();
        });
      });
    });
  }

  // ========================================
  // 이미지 첨부 처리
  // ========================================

  function handleImageSelect(e) {
    var file = e.target.files[0];
    if (!file) return;

    // 파일 크기 제한 (2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert('이미지 파일이 너무 큽니다 (최대 2MB)');
      return;
    }

    var reader = new FileReader();
    reader.onload = function (evt) {
      pendingImageBase64 = evt.target.result;
      elements.newCharPreviewImg.src = pendingImageBase64;
      elements.newCharPreview.style.display = 'flex';
    };
    reader.readAsDataURL(file);
  }

  // ========================================
  // UI 전체 새로고침
  // ========================================

  function reloadUI() {
    chrome.storage.sync.get({
      enabled: true,
      assistantCharacterId: 'aemeath',
      assistantDisplayName: '',
      userCharacterId: 'rober_f',
      userDisplayName: '',
      splitMaxChars: 180
    }, function (settings) {
      // 토글 스위치
      elements.enabledCheckbox.checked = settings.enabled;
      elements.mainContent.classList.toggle('disabled', !settings.enabled);

      // 문단 분리 기준
      elements.splitMaxChars.value = settings.splitMaxChars;

      // 캐릭터 그리드 (상대는 assistant/both, 나는 user/both만 표시)
      loadAllCharacters(function (allChars) {
        var forAssistant = allChars.filter(function (c) {
          var r = c.role || 'both';
          return r === 'assistant' || r === 'both';
        });
        var forUser = allChars.filter(function (c) {
          var r = c.role || 'both';
          return r === 'user' || r === 'both';
        });
        // 역할과 맞지 않게 저장된 선택이면 기본값으로 보정
        var fix = {};
        if (forAssistant.every(function (c) { return c.id !== settings.assistantCharacterId; })) {
          fix.assistantCharacterId = 'aemeath';
          settings.assistantCharacterId = 'aemeath';
        }
        if (forUser.every(function (c) { return c.id !== settings.userCharacterId; })) {
          fix.userCharacterId = 'rober_f';
          settings.userCharacterId = 'rober_f';
        }
        if (Object.keys(fix).length > 0) {
          saveSettings(fix);
        }
        renderCharGrid(elements.assistantGrid, 'assistant', settings.assistantCharacterId, forAssistant);
        renderCharGrid(elements.userGrid, 'user', settings.userCharacterId, forUser);
      });
    });
  }

  // ========================================
  // 이벤트 리스너 등록
  // ========================================

  // 활성화 토글
  elements.enabledCheckbox.addEventListener('change', function () {
    var enabled = this.checked;
    saveSettings({ enabled: enabled });
    elements.mainContent.classList.toggle('disabled', !enabled);
  });

  // 문단 분리 기준 변경
  elements.splitMaxChars.addEventListener('change', function () {
    var val = parseInt(this.value, 10);
    if (val < 50) val = 50;
    if (val > 1000) val = 1000;
    this.value = val;
    saveSettings({ splitMaxChars: val });
  });

  // 색상 변경
  elements.newCharColor.addEventListener('input', function () {
    elements.newCharColorLabel.textContent = this.value;
  });

  // 파일 선택 버튼
  elements.newCharImageBtn.addEventListener('click', function () {
    elements.newCharImage.click();
  });

  // 이미지 선택
  elements.newCharImage.addEventListener('change', handleImageSelect);

  // 모달 버튼
  elements.cancelAddChar.addEventListener('click', closeAddCharModal);
  elements.saveAddChar.addEventListener('click', saveNewCharacter);

  // 모달 외부 클릭 닫기
  elements.addCharModal.addEventListener('click', function (e) {
    if (e.target === elements.addCharModal) {
      closeAddCharModal();
    }
  });

  // ========================================
  // 초기화
  // ========================================
  reloadUI();

})();
