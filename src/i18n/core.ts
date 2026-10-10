// Language detection, text lookup and Intl formatting. No React here, so plain modules can use it.
import en from './en';
import ko from './ko';
import type { Lang, Plural, TFunction, TKey, TVars } from './types';

export const LANGS: readonly Lang[] = ['ko', 'en'];
/** Each option is named in its own language, so anyone can find theirs. */
export const LANGUAGE_NAMES: Record<Lang, string> = { ko: '한국어', en: 'English' };
export const LOCALES: Record<Lang, string> = { ko: 'ko-KR', en: 'en-US' };
export const STORAGE_KEY = 'xcube.lang';

// Main dictionaries; parts that load later (the app pages' text) are added by registerDictionaries.
const DICTS: Record<Lang, Record<string, unknown>> = { ko, en };

/**
 * Adds a later-loaded part (its top-level namespaces are new, e.g. "jobs") to every language. The app part
 * calls this when an app module loads (./app/index.ts); lookups made after that find its keys.
 */
export function registerDictionaries(parts: Record<Lang, object>) {
  for (const lang of LANGS) DICTS[lang] = { ...DICTS[lang], ...parts[lang] };
}

const isLang = (value: unknown): value is Lang => value === 'ko' || value === 'en';

export function readSavedLanguage(): Lang | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isLang(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveLanguage(lang: Lang) {
  try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* storage unavailable */ }
}

/**
 * The first browser language we support wins: "ko…" is Korean, "en…" is English. A list with
 * neither (e.g. only French) gets English; no list at all (no navigator) gets Korean.
 */
export function pickLanguage(languages: readonly string[] | undefined | null): Lang {
  if (!languages || !languages.length) return 'ko';
  for (const tag of languages) {
    const lower = tag.toLowerCase();
    if (lower.startsWith('ko')) return 'ko';
    if (lower.startsWith('en')) return 'en';
  }
  return 'en';
}

/** Saved choice → browser languages → Korean. */
export function detectLanguage(): Lang {
  const saved = readSavedLanguage();
  if (saved) return saved;
  if (typeof navigator === 'undefined') return 'ko';
  const list = navigator.languages?.length ? navigator.languages : navigator.language ? [navigator.language] : [];
  return pickLanguage(list);
}

// The language the provider last rendered with, for formatting outside components.
let current: Lang = 'ko';
export const getLanguage = () => current;
export const setCurrentLanguage = (lang: Lang) => { current = lang; };

const isPlural = (value: unknown): value is Plural => typeof value === 'object' && value !== null && 'other' in value;

function lookup(dict: Record<string, unknown>, key: string): string | Plural | undefined {
  let node: unknown = dict;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' || isPlural(node) ? node : undefined;
}

const pluralRules: Partial<Record<Lang, Intl.PluralRules>> = {};

/** Looks a key up in `lang` (Korean if missing), picks the count form and fills {placeholders}. */
export function translate(lang: Lang, key: TKey, vars?: TVars): string {
  const found = lookup(DICTS[lang], key) ?? lookup(DICTS.ko, key);
  if (found === undefined) return key;
  let text: string;
  if (isPlural(found)) {
    const count = Number(vars?.count ?? 0);
    const rules = (pluralRules[lang] ??= new Intl.PluralRules(LOCALES[lang]));
    text = rules.select(count) === 'one' ? found.one : found.other;
  } else {
    text = found;
  }
  return vars ? text.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match)) : text;
}

export const createT = (lang: Lang): TFunction => (key, vars) => translate(lang, key, vars);

// ---- Intl formatting -------------------------------------------------------------------------

const formatters = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat>();
function cached<T extends Intl.DateTimeFormat | Intl.NumberFormat>(kind: 'd' | 'n', lang: Lang, options: object, make: () => T): T {
  const id = `${kind}|${lang}|${JSON.stringify(options)}`;
  let formatter = formatters.get(id) as T | undefined;
  if (!formatter) { formatter = make(); formatters.set(id, formatter); }
  return formatter;
}

type DateInput = Date | string | number | null | undefined;
const toDate = (value: DateInput) => (value instanceof Date ? value : value == null || value === '' ? null : new Date(value));

/** Date format: ko "2024. 8. 14.", en "8/14/2024". Pass options for other styles (e.g. month: 'long'). Invalid input is returned as given; empty gives "—". */
export function formatDate(value: DateInput, options: Intl.DateTimeFormatOptions = {}, lang: Lang = current): string {
  const date = toDate(value);
  if (!date) return '—';
  if (Number.isNaN(date.getTime())) return String(value);
  return cached('d', lang, options, () => new Intl.DateTimeFormat(LOCALES[lang], options)).format(date);
}

const DATE_TIME: Intl.DateTimeFormatOptions = { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
/** Month, day and 24-hour time: ko "10. 8. 14:05", en "10/8, 14:05". */
export function formatDateTime(value: DateInput, lang: Lang = current): string {
  return formatDate(value, DATE_TIME, lang);
}

export function formatNumber(value: number, options: Intl.NumberFormatOptions = {}, lang: Lang = current): string {
  return cached('n', lang, options, () => new Intl.NumberFormat(LOCALES[lang], options)).format(value);
}
