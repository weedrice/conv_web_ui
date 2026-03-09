/**
 * builtin-characters.js — 빌트인 캐릭터 단일 정의
 *
 * content script / popup 양쪽에서 공통으로 사용.
 * role: 'assistant' | 'user' — 상대 전용, 사용자 전용
 * nameEn / nameKo: Chrome UI 언어에 따라 표시
 */
(function () {
  'use strict';

  window.AIChatSkin = window.AIChatSkin || {};
  window.AIChatSkin.BUILTIN_CHARACTERS = [
    { id: 'aemeath', nameEn: 'Aemeath', nameKo: '에이메스', color: '#6B7FD7', builtin: true, role: 'assistant', avatarFile: 'aemeath.webp' },
    { id: 'shorekeeper', nameEn: 'Shorekeeper', nameKo: '파수인', color: '#2E86AB', builtin: true, role: 'assistant', avatarFile: 'shorekeeper.webp' },
    { id: 'phrolova', nameEn: 'Phrolova', nameKo: '플로로', color: '#9B59B6', builtin: true, role: 'assistant', avatarFile: 'phrolova.webp' },
    { id: 'rober_f', nameEn: 'Rober F', nameKo: '방순이', color: '#E67E22', builtin: true, role: 'user', avatarFile: 'rober_f.webp' },
    { id: 'rober_m', nameEn: 'Rober M', nameKo: '방돌이', color: '#1ABC9C', builtin: true, role: 'user', avatarFile: 'rober_m.webp' }
  ];
})();
