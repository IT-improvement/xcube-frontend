// In-house i18n (UR-53). Dictionaries: ko.ts (source) and en.ts. See docs/UI-UX/technical-guide.md "언어".
export { LanguageProvider, useLanguage, useT } from './LanguageProvider';
export {
  LANGS, LANGUAGE_NAMES, LOCALES, STORAGE_KEY,
  detectLanguage, pickLanguage, translate, getLanguage,
  formatDate, formatDateTime, formatNumber,
} from './core';
export type { Lang, TKey, TFunction, TVars } from './types';
export { codeKey, codeText, failureText, hasHangul, preferSentence, registrationFailureText, serverItems, serverText, shownSentence } from './serverText';
export type { ServerItem, ServerParams } from './serverText';
