/**
 * index.js — Content Script 진입점
 * 
 * 플랫폼을 감지하고, 적절한 어댑터를 선택하여 observer와 renderer를 초기화한다.
 */
(function () {
  'use strict';

  var ns = (window.AIChatSkin = window.AIChatSkin || {});

  /**
   * 현재 호스트명에 맞는 플랫폼 어댑터 찾기
   */
  function detectPlatform() {
    var hostname = window.location.hostname;

    var platformKeys = Object.keys(ns.platforms);
    for (var i = 0; i < platformKeys.length; i++) {
      var platform = ns.platforms[platformKeys[i]];
      if (platform.matches(hostname)) {
        return platform;
      }
    }

    return null;
  }

  /**
   * 설정 변경 리스너
   */
  function setupStorageListener(adapter) {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === 'sync' || area === 'local') {
        console.log('[AIChatSkin] 설정 변경 감지, 다시 렌더링합니다.');
        // 설정 캐시 무효화 후 다시 렌더링
        ns.renderer.reRenderAll(adapter);
      }
    });
  }

  /**
   * 초기화
   */
  function init() {
    var adapter = detectPlatform();

    if (!adapter) {
      console.log('[AIChatSkin] 지원되지 않는 플랫폼입니다: ' + window.location.hostname);
      return;
    }

    console.log('[AIChatSkin] 플랫폼 감지됨: ' + adapter.name);

    // 현재 어댑터 저장 (디버깅용)
    ns.currentAdapter = adapter;

    // 설정 변경 리스너 등록 (활성화/비활성화 동적 전환 지원)
    setupStorageListener(adapter);

    // observer는 항상 시작 (새 메시지 감지를 위해)
    ns.observer.startObserving(adapter);

    // 설정 확인 후 초기 렌더링
    chrome.storage.sync.get({ enabled: true }, function (settings) {
      if (!settings.enabled) {
        console.log('[AIChatSkin] 스킨이 비활성화되어 있습니다.');
        return;
      }

      // DOM이 충분히 로드될 때까지 재시도 (최대 5회, 500ms 간격)
      var retryCount = 0;
      var maxRetries = 5;

      function tryRender() {
        var messages = adapter.getMessages();
        if (messages.length > 0 || retryCount >= maxRetries) {
          ns.renderer.renderAll(adapter);
          console.log('[AIChatSkin] 초기화 완료 (메시지 ' + messages.length + '개, 시도 ' + (retryCount + 1) + '회)');
        } else {
          retryCount++;
          setTimeout(tryRender, 500);
        }
      }

      // 첫 시도는 약간의 지연 후
      setTimeout(tryRender, 300);
    });
  }

  // DOM 로드 완료 확인 후 초기화
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }

})();
