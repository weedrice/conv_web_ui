/**
 * observer.js — MutationObserver 관리
 * 
 * DOM 변경을 감지하여 새 메시지가 추가되거나 스트리밍이 완료될 때
 * 렌더러를 호출한다.
 */
(function () {
  'use strict';

  var ns = (window.AIChatSkin = window.AIChatSkin || {});

  var mainObserver = null;
  var debounceTimer = null;
  var pollIntervalId = null;
  var streamCheckTimers = {};
  var DEBOUNCE_MS = 150;
  var STREAM_COMPLETE_DEBOUNCE_MS = 300;
  var MAX_STREAM_WAIT_MS = 10000; // 최대 10초 대기 후 강제 완료
  var POLL_INTERVAL_MS = 2000; // 2초마다 미처리 메시지 폴링
  var streamStartTimes = {};
  var navigationSetup = false; // 중복 설정 방지

  /**
   * 스트리밍 완료 감지를 위한 디바운스 체크
   * 텍스트 변경이 300ms 동안 없으면 스트리밍 완료로 판단
   */
  function setupStreamCheck(msgEl, adapter) {
    var elId = msgEl.getAttribute('data-skin-stream-id');
    if (!elId) {
      elId = 'stream_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      msgEl.setAttribute('data-skin-stream-id', elId);
    }

    var lastText = adapter.getTextContent(msgEl);

    // 이전 타이머 클리어
    if (streamCheckTimers[elId]) {
      clearTimeout(streamCheckTimers[elId]);
    }

    // 스트리밍 시작 시간 기록
    if (!streamStartTimes[elId]) {
      streamStartTimes[elId] = Date.now();
    }

    streamCheckTimers[elId] = setTimeout(function checkStream() {
      var currentText = adapter.getTextContent(msgEl);
      var isStillStreaming = adapter.isStreaming(msgEl);
      var elapsed = Date.now() - (streamStartTimes[elId] || Date.now());

      // 강제 완료 조건: (1) 어댑터가 완료 판단, (2) 텍스트 변경 없음, (3) 최대 대기 시간 초과
      var shouldComplete = !isStillStreaming || currentText === lastText || elapsed > MAX_STREAM_WAIT_MS;

      if (shouldComplete && currentText && currentText.length > 0) {
        // 스트리밍 완료 — forceComplete=true로 렌더링 (어댑터의 isStreaming을 무시)
        delete streamCheckTimers[elId];
        delete streamStartTimes[elId];
        msgEl.removeAttribute('data-skin-stream-id');
        console.log('[AIChatSkin] 스트리밍 완료 감지 (elapsed: ' + elapsed + 'ms, textSame: ' + (currentText === lastText) + ', adapterDone: ' + !isStillStreaming + ')');
        ns.renderer.renderMessage(msgEl, adapter, true);
      } else {
        // 아직 스트리밍 중 — 다시 체크
        lastText = currentText;
        streamCheckTimers[elId] = setTimeout(checkStream, STREAM_COMPLETE_DEBOUNCE_MS);
      }
    }, STREAM_COMPLETE_DEBOUNCE_MS);
  }

  /**
   * MutationObserver 콜백 (디바운스 적용)
   */
  function createObserverCallback(adapter) {
    return function (mutations) {
      // 우리가 삽입한 skin- 요소에 의한 mutation은 무시
      var hasRelevantMutation = false;
      for (var i = 0; i < mutations.length; i++) {
        var target = mutations[i].target;
        // skin- 클래스가 없는 요소의 변경만 관련 있음
        if (!target.className || typeof target.className !== 'string' || !target.className.includes('skin-')) {
          hasRelevantMutation = true;
          break;
        }
        // 추가된 노드 중 skin- 이 아닌 것이 있으면 관련 있음
        if (mutations[i].addedNodes && mutations[i].addedNodes.length > 0) {
          for (var j = 0; j < mutations[i].addedNodes.length; j++) {
            var node = mutations[i].addedNodes[j];
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (!node.className || typeof node.className !== 'string' || !node.className.includes('skin-')) {
                hasRelevantMutation = true;
                break;
              }
            }
          }
          if (hasRelevantMutation) break;
        }
      }

      if (!hasRelevantMutation) return;

      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      debounceTimer = setTimeout(function () {
        processNewMessages(adapter);
      }, DEBOUNCE_MS);
    };
  }

  /**
   * 새로운 메시지 처리
   */
  function processNewMessages(adapter) {
    if (ns.updateViewState) {
      ns.updateViewState(adapter);
    }

    var messages = adapter.getMessages();

    for (var i = 0; i < messages.length; i++) {
      var msgEl = messages[i];
      var isProcessed = msgEl.getAttribute('data-skin-processed') === 'true';
      var role = adapter.getRole(msgEl);

      if (!role) continue;

      if (!isProcessed) {
        var isStreaming = adapter.isStreaming(msgEl);

        if (isStreaming) {
          // 스트리밍 중인 메시지: 타이핑 인디케이터 표시 후 완료 감지 시작
          ns.renderer.renderMessage(msgEl, adapter);
          setupStreamCheck(msgEl, adapter);
        } else {
          // 일반 메시지: 바로 렌더링
          ns.renderer.renderMessage(msgEl, adapter);
        }
      } else {
        // 이미 처리된 메시지: 스트리밍 상태 변경 확인
        var skinId = msgEl.getAttribute('data-skin-id');
        if (skinId) {
          var existingWraps = document.querySelectorAll('.skin-bubble-wrap[data-skin-source="' + skinId + '"]');
          if (existingWraps.length > 0) {
            var wasTyping = existingWraps[0].getAttribute('data-skin-rendered') === 'typing';
            var isStillStreaming = adapter.isStreaming(msgEl);

            if (wasTyping && !isStillStreaming) {
              // 스트리밍 완료됨 — forceComplete로 다시 렌더링
              ns.renderer.renderMessage(msgEl, adapter, true);
            } else if (wasTyping && isStillStreaming) {
              // 아직 스트리밍 중 — 완료 체크 유지
              setupStreamCheck(msgEl, adapter);
            }
          }
        }
      }
    }

    // 렌더 이후 고아/빈 버블 정리 (Gemini placeholder 대응)
    if (ns.renderer && ns.renderer.cleanupStaleBubbles) {
      ns.renderer.cleanupStaleBubbles(adapter);
    }
  }

  /**
   * SPA 내비게이션 감지 (pushState/popstate 인터셉트)
   * 중복 설정 방지: navigationSetup 플래그 사용
   */
  function setupNavigationDetection(adapter) {
    if (navigationSetup) return; // 이미 설정됨
    navigationSetup = true;

    // pushState 인터셉트
    var originalPushState = history.pushState;
    history.pushState = function () {
      originalPushState.apply(this, arguments);
      onNavigationChange(adapter);
    };

    // replaceState 인터셉트
    var originalReplaceState = history.replaceState;
    history.replaceState = function () {
      originalReplaceState.apply(this, arguments);
      onNavigationChange(adapter);
    };

    // popstate 이벤트
    window.addEventListener('popstate', function () {
      onNavigationChange(adapter);
    });
  }

  /**
   * 내비게이션 변경 시 처리
   */
  function onNavigationChange(adapter) {
    // 잠시 대기 후 다시 렌더링 (새 DOM 로딩 대기)
    setTimeout(function () {
      if (ns.updateViewState) {
        ns.updateViewState(adapter);
      }
      ns.renderer.reRenderAll(adapter);
    }, 800);
  }

  /**
   * 주기적 폴링 시작 — MutationObserver를 보완하는 폴백 메커니즘
   * SPA에서 Observer가 놓치는 새 메시지를 잡아냄
   */
  function startPolling(adapter) {
    if (pollIntervalId) {
      clearInterval(pollIntervalId);
    }

    pollIntervalId = setInterval(function () {
      processNewMessages(adapter);
    }, POLL_INTERVAL_MS);
  }

  /**
   * MutationObserver 시작
   * 
   * 항상 document.body를 감시하여 어떤 플랫폼에서든 새 메시지를 감지.
   * attributeFilter 제거하여 모든 DOM 변경 감지.
   */
  function startObserving(adapter) {
    if (mainObserver) {
      mainObserver.disconnect();
    }

    // 항상 document.body를 감시 (각 플랫폼의 대화 컨테이너가 변경되어도 문제 없음)
    var container = document.body;

    mainObserver = new MutationObserver(createObserverCallback(adapter));
    mainObserver.observe(container, {
      childList: true,
      subtree: true
      // attributeFilter 제거 — 모든 자식 추가/삭제 감지
    });

    // SPA 내비게이션 감지 설정
    setupNavigationDetection(adapter);

    // 주기적 폴링 시작 (MutationObserver 보완)
    startPolling(adapter);

    console.log('[AIChatSkin] Observer 시작됨 (플랫폼: ' + adapter.name + ', 폴링: ' + POLL_INTERVAL_MS + 'ms)');
  }

  /**
   * MutationObserver 중지
   */
  function stopObserving() {
    if (mainObserver) {
      mainObserver.disconnect();
      mainObserver = null;
    }

    // 폴링 중지
    if (pollIntervalId) {
      clearInterval(pollIntervalId);
      pollIntervalId = null;
    }

    // 모든 스트림 체크 타이머 정리
    for (var key in streamCheckTimers) {
      if (streamCheckTimers.hasOwnProperty(key)) {
        clearTimeout(streamCheckTimers[key]);
      }
    }
    streamCheckTimers = {};
    streamStartTimes = {};

    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  // 공개 API
  ns.observer = {
    startObserving: startObserving,
    stopObserving: stopObserving,
    processNewMessages: processNewMessages
  };

})();
