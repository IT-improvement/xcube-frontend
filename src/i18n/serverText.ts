// Server messages in the screen language (UR-53 stage 5). Services answer with a stable code, values for it
// and a Korean sentence: errors `{code, message, params}`, warnings `warningItems[{code, params, message}]`,
// estimate `blockerItems`, jobs `errorCode`/`errorParams`/`errorMessage`, file checks `messageCode`/
// `messageParams`/`message`, admin areas `attributionCode`/`attribution`. Contract: Backend guide
// "서버 메시지 코드". Shared codes are in the main dictionary (`errors.code`); one service's codes load with
// the screens that show them (./codes/ai, ./codes/data). Kept small: it is in main, with userMessage.
import { hasText, translate } from './core';
import type { Lang, TKey, TVars } from './types';

export type ServerParams = Record<string, unknown> | null | undefined;
/** One server message: any of code, values and sentence may be missing (older servers send only the sentence). */
export type ServerItem = { code?: string | null; params?: ServerParams; message?: string | null };

/** Hangul jamo, compatibility jamo and syllables. */
const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/;
export const hasHangul = (text: string) => HANGUL.test(text);

/** A code worth naming: SCREAMING_SNAKE, and not the client's own `HTTP_404` stand-in. */
const CODE = /^[A-Z][A-Z0-9_]*$/;
const realCode = (code?: string | null) => (code && CODE.test(code) && !code.startsWith('HTTP_') ? code : undefined);

/** Where a code's text may be: shared codes first, then the parts (registered when their screens load). */
const NAMESPACES = ['errors.code', 'aiCodes', 'dataCodes'];
/**
 * Codes whose server sentence is a diagnostic (a framework validation message, a worker traceback line, the
 * Backoffice's answer): the sentence says more than the code, so it is shown when the language allows.
 */
const DETAIL_CODES = new Set(['INVALID_REQUEST', 'WORKER_FAILED', 'REGISTRATION_FAILED', 'NOT_FOUND']);
export const preferSentence = (code?: string | null) => !!code && DETAIL_CODES.has(code);

/** Server values as text: lists joined, missing values as "—". Numbers stay numbers (count plurals). */
function vars(params: ServerParams): TVars | undefined {
  if (!params) return undefined;
  const out: TVars = {};
  for (const [name, value] of Object.entries(params)) {
    out[name] = typeof value === 'number' ? value
      : Array.isArray(value) ? value.map(String).join(', ')
        : value == null || value === '' ? '—' : String(value);
  }
  return out;
}

/** The dictionary key for `code`, if a loaded part has one. */
export function codeKey(code: string): TKey | undefined {
  for (const namespace of NAMESPACES) {
    const key = `${namespace}.${code}`;
    if (hasText(key)) return key as TKey;
  }
  return undefined;
}

/** The code's text in `lang` filled with the server values, or undefined when no loaded part knows it. */
export function codeText(code: string | null | undefined, params: ServerParams, lang: Lang): string | undefined {
  const known = realCode(code);
  const key = known && codeKey(known);
  return key ? translate(lang, key, vars(params)) : undefined;
}

/** The server sentence if it can be shown in `lang`: Korean shows it as given, other languages only without Hangul. */
export function shownSentence(message: string | null | undefined, lang: Lang): string | undefined {
  const text = message?.trim();
  return text && (lang === 'ko' || !hasHangul(text)) ? text : undefined;
}

/**
 * A server message in words. Order: (1) the dictionary text of its code, with the values; (2) the server
 * sentence — Korean as given, English only when it has no Hangul (diagnostic codes such as WORKER_FAILED
 * check this first, as their sentence says more); (3) the code: `bareCode` shows it as is (a failure reason
 * after "실패 사유:"), else "Something went wrong (code X)"; (4) a sentence that can't be shown: `fallback`
 * (default: "the server added a note…"). Empty when there is nothing at all.
 */
export function serverText(item: ServerItem, lang: Lang, options: { fallback?: TKey; bareCode?: boolean } = {}): string {
  const code = realCode(item.code);
  if (code && !preferSentence(code)) {
    const known = codeText(code, item.params, lang);
    if (known) return known;
  }
  const sentence = shownSentence(item.message, lang);
  if (sentence) return sentence;
  const known = code && codeText(code, item.params, lang);
  if (known) return known;
  if (code) return options.bareCode ? code : translate(lang, 'errors.withCode', { code });
  return item.message?.trim() ? translate(lang, options.fallback ?? 'errors.serverNote') : '';
}

/** A string list sent next to an item list (`warnings` beside `warningItems`), as items. Old strings that look like codes keep them. */
export function serverItems(items: ServerItem[] | null | undefined, plain: string[] | null | undefined): ServerItem[] {
  if (Array.isArray(items) && items.length) return items;
  return (plain ?? []).map((text) => (CODE.test(text) ? { code: text, message: text } : { message: text }));
}

/** Why a job failed: `errorCode` with `errorParams`, else `errorMessage`, else the bare code; empty when none is known. */
export const failureText = (job: { errorCode?: string | null; errorParams?: ServerParams; errorMessage?: string | null }, lang: Lang) =>
  serverText({ code: job.errorCode, params: job.errorParams, message: job.errorMessage }, lang, { bareCode: true, fallback: 'errors.unexpected' });

/** Why the Backoffice registration of a finished job failed (`registration.error`, code `REGISTRATION_FAILED`); empty when it did not. */
export function registrationFailureText(registration: { error?: string | null; errorCode?: string | null; errorParams?: ServerParams } | null | undefined, lang: Lang): string {
  if (!registration?.error && !registration?.errorCode) return '';
  return serverText({ code: registration.errorCode ?? 'REGISTRATION_FAILED', params: registration.errorParams, message: registration.error }, lang);
}
