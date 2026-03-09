/**
 * splitter.js — 문단 분리 알고리즘
 * 
 * AI 응답을 메신저 스타일 버블로 분리하기 위한 로직.
 * 코드블록과 테이블은 분리하지 않고 하나의 버블로 유지.
 */
(function () {
  'use strict';

  const ns = (window.AIChatSkin = window.AIChatSkin || {});

  /**
   * HTML 문자열을 문단 단위로 분리한다.
   * 
   * @param {string} html - 원본 HTML 문자열
   * @param {number} maxChars - 최대 문자 수 (기본: 180)
   * @returns {string[]} 분리된 HTML 청크 배열
   */
  function split(html, maxChars) {
    if (maxChars === undefined || maxChars === null) {
      maxChars = 180;
    }
    if (!html || !html.trim()) {
      return [];
    }

    // HTML을 파싱하기 위한 임시 컨테이너
    var tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    var chunks = [];
    var currentChunk = '';

    // 자식 노드를 순회하면서 분리
    var children = Array.from(tempDiv.childNodes);

    for (var i = 0; i < children.length; i++) {
      var node = children[i];

      // 코드 블록인지 확인 (pre, code 태그)
      if (isCodeBlock(node)) {
        // 현재 누적된 청크 먼저 저장
        if (currentChunk.trim()) {
          var subChunks = splitTextChunk(currentChunk, maxChars);
          for (var s = 0; s < subChunks.length; s++) {
            chunks.push(subChunks[s]);
          }
          currentChunk = '';
        }
        // 코드 블록은 통째로 하나의 청크
        chunks.push(getOuterHTML(node));
        continue;
      }

      // 테이블인지 확인
      if (isTable(node)) {
        if (currentChunk.trim()) {
          var tableSubChunks = splitTextChunk(currentChunk, maxChars);
          for (var ts = 0; ts < tableSubChunks.length; ts++) {
            chunks.push(tableSubChunks[ts]);
          }
          currentChunk = '';
        }
        chunks.push(getOuterHTML(node));
        continue;
      }

      // 일반 노드: 블록 레벨 요소인지 확인
      if (isBlockElement(node)) {
        // 이전 누적분이 있으면 먼저 처리
        if (currentChunk.trim()) {
          var blockSubChunks = splitTextChunk(currentChunk, maxChars);
          for (var bs = 0; bs < blockSubChunks.length; bs++) {
            chunks.push(blockSubChunks[bs]);
          }
          currentChunk = '';
        }
        // 블록 요소 내의 HTML을 새로운 청크의 시작으로
        var blockHTML = getOuterHTML(node);
        var blockSubChunks2 = splitTextChunk(blockHTML, maxChars);
        for (var bs2 = 0; bs2 < blockSubChunks2.length; bs2++) {
          chunks.push(blockSubChunks2[bs2]);
        }
        continue;
      }

      // 인라인 노드나 텍스트 노드는 누적
      currentChunk += getOuterHTML(node);
    }

    // 마지막 남은 청크 처리
    if (currentChunk.trim()) {
      var finalSubChunks = splitTextChunk(currentChunk, maxChars);
      for (var f = 0; f < finalSubChunks.length; f++) {
        chunks.push(finalSubChunks[f]);
      }
    }

    // 빈 청크 제거
    return chunks.filter(function (chunk) {
      return chunk.trim().length > 0;
    });
  }

  /**
   * 텍스트 기반 청크를 maxChars 기준으로 문장 단위 분리
   */
  function splitTextChunk(html, maxChars) {
    var textContent = stripHTML(html);

    // maxChars 이하이면 분리하지 않음
    if (textContent.length <= maxChars) {
      return [html];
    }

    // 더블 뉴라인으로 먼저 분리 시도
    var paragraphs = html.split(/(<br\s*\/?>\s*<br\s*\/?>|\n\n)/i);
    var results = [];
    var current = '';

    for (var i = 0; i < paragraphs.length; i++) {
      var para = paragraphs[i];

      // 구분자 자체인 경우 스킵
      if (/^(<br\s*\/?>\s*<br\s*\/?>|\n\n)$/i.test(para)) {
        continue;
      }

      if (!para.trim()) continue;

      var combinedText = stripHTML(current + para);
      if (combinedText.length <= maxChars) {
        current += para;
      } else {
        if (current.trim()) {
          results.push(current.trim());
        }
        // para 자체가 maxChars 초과이면 문장 단위로 분리
        if (stripHTML(para).length > maxChars) {
          var sentenceChunks = splitBySentence(para, maxChars);
          for (var sc = 0; sc < sentenceChunks.length; sc++) {
            results.push(sentenceChunks[sc]);
          }
          current = '';
        } else {
          current = para;
        }
      }
    }

    if (current.trim()) {
      results.push(current.trim());
    }

    return results.length > 0 ? results : [html];
  }

  /**
   * 문장 종료 구두점 기준으로 분리
   */
  function splitBySentence(html, maxChars) {
    // 문장 종료 문자 패턴: 。 . ! ? ！ ？
    var sentenceEndPattern = /([。.!?！？])\s*/g;
    var textContent = stripHTML(html);
    var sentences = [];
    var lastIndex = 0;
    var match;

    while ((match = sentenceEndPattern.exec(textContent)) !== null) {
      sentences.push(textContent.substring(lastIndex, match.index + match[1].length));
      lastIndex = match.index + match[0].length;
    }

    // 마지막 남은 부분
    if (lastIndex < textContent.length) {
      sentences.push(textContent.substring(lastIndex));
    }

    if (sentences.length === 0) {
      return [html];
    }

    // 문장들을 maxChars 기준으로 병합
    var results = [];
    var current = '';

    for (var i = 0; i < sentences.length; i++) {
      if ((current + sentences[i]).length <= maxChars) {
        current += sentences[i];
      } else {
        if (current.trim()) {
          results.push(current.trim());
        }
        current = sentences[i];
      }
    }

    if (current.trim()) {
      results.push(current.trim());
    }

    // 순수 텍스트로 분리된 결과를 반환 (원본 HTML 포맷 보존이 어려운 경우)
    // HTML 태그를 포함한 원본을 최대한 보존하려고 시도
    if (results.length > 1) {
      return results;
    }

    return [html];
  }

  /**
   * HTML 태그 제거하여 순수 텍스트 추출
   */
  function stripHTML(html) {
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }

  /**
   * 노드의 outerHTML (텍스트 노드의 경우 textContent)
   */
  function getOuterHTML(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent;
    }
    return node.outerHTML || '';
  }

  /**
   * 코드 블록 노드인지 확인
   */
  function isCodeBlock(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    var tagName = node.tagName.toLowerCase();
    if (tagName === 'pre') return true;
    if (tagName === 'code' && node.parentElement && node.parentElement.tagName.toLowerCase() !== 'pre') {
      // 인라인 code는 코드블록이 아님
      return false;
    }
    // div 안에 pre가 있는 경우 (ChatGPT 스타일)
    if (node.querySelector && node.querySelector('pre')) return true;
    return false;
  }

  /**
   * 테이블 노드인지 확인
   */
  function isTable(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    var tagName = node.tagName.toLowerCase();
    if (tagName === 'table') return true;
    if (node.querySelector && node.querySelector('table')) return true;
    return false;
  }

  /**
   * 블록 레벨 요소인지 확인
   */
  function isBlockElement(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    var blockTags = [
      'div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'blockquote', 'section', 'article',
      'header', 'footer', 'nav', 'main', 'aside', 'details',
      'summary', 'figure', 'figcaption', 'hr'
    ];
    return blockTags.indexOf(node.tagName.toLowerCase()) !== -1;
  }

  // 공개 API
  ns.splitter = {
    split: split
  };

})();
