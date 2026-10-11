// What tells same-name AI results apart on the management screens: model, threshold, period and when it was
// made. Worded like the Viewer's result rows (period · threshold · created, views/Viewer/AiPanel entryDetail),
// with the app dictionary so the Viewer chunk is not pulled into the pages.
import type { AiWaterJob } from '../api/aiApi';
import { formatDate, getLanguage, translate } from '../i18n';
import type { Lang } from '../i18n';
import { aiModelLabel } from './jobs';

export type AiFacts = { modelId?: string; threshold?: number; timeStart?: string; timeEnd?: string; createdAt?: string };

const text = (value: unknown) => (value == null || value === '' ? undefined : String(value));
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : typeof value === 'string' && value.trim() && Number.isFinite(Number(value)) ? Number(value) : undefined);

/** Model, threshold and period from an AI job's request. */
export const aiFactsOf = (job: AiWaterJob): AiFacts => ({
  modelId: text(job.input?.modelId),
  threshold: num(job.input?.threshold),
  timeStart: text(job.input?.timeStart),
  timeEnd: text(job.input?.timeEnd),
  createdAt: job.createdAt ?? undefined,
});

/** AI jobs by the result dataset they registered (`registration.datacubeId`). */
export function aiFactsByResult(jobs: AiWaterJob[]): Map<string, AiFacts> {
  const map = new Map<string, AiFacts>();
  for (const job of jobs) {
    const id = job.registration?.datacubeId;
    if (id != null && !map.has(String(id))) map.set(String(id), aiFactsOf(job));
  }
  return map;
}

/** "0.50" (two places, like the Viewer); empty when the model default was used. */
export const thresholdText = (value?: number) => (value == null ? '' : value.toFixed(2));

const two = (value: number) => String(value).padStart(2, '0');
const SHORT_DATE: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
const SHORT_TIME: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
const SHORT_TIME_YEAR: Intl.DateTimeFormatOptions = { ...SHORT_TIME, year: 'numeric' };
const parse = (iso?: string) => {
  const date = iso ? new Date(iso) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
};
/** ko 2021.11.27, en Nov 27, 2021 (local calendar day). */
export function shortDate(iso?: string, lang: Lang = getLanguage()) {
  const date = parse(iso);
  if (!date) return '';
  return lang === 'ko' ? `${date.getFullYear()}.${two(date.getMonth() + 1)}.${two(date.getDate())}` : formatDate(date, SHORT_DATE, lang);
}
/** ko 10.09 14:32 (this year) or 2025.10.09 14:32; en Oct 9, 14:32 or Oct 9, 2025, 14:32. */
export function shortDateTime(iso?: string, now = new Date(), lang: Lang = getLanguage()) {
  const date = parse(iso);
  if (!date) return '';
  const thisYear = date.getFullYear() === now.getFullYear();
  if (lang !== 'ko') return formatDate(date, thisYear ? SHORT_TIME : SHORT_TIME_YEAR, lang);
  const day = `${two(date.getMonth() + 1)}.${two(date.getDate())}`;
  return `${thisYear ? day : `${date.getFullYear()}.${day}`} ${two(date.getHours())}:${two(date.getMinutes())}`;
}

/** "2021.11.27–2021.12.31", "…부터", "…까지" or "전체 기간" / "All dates". */
export function aiPeriod(facts: AiFacts, lang: Lang = getLanguage()) {
  const start = shortDate(facts.timeStart, lang);
  const end = shortDate(facts.timeEnd, lang);
  if (start && end) return start === end ? start : translate(lang, 'aiFacts.range', { start, end });
  if (start) return translate(lang, 'aiFacts.from', { date: start });
  if (end) return translate(lang, 'aiFacts.until', { date: end });
  return translate(lang, 'aiFacts.all');
}

/** Subtitle of an AI result row: "U-Net (S1+S2 10채널) · 임계값 0.50" (parts that are unknown are left out). */
export function aiSubtitle(facts: AiFacts, lang: Lang = getLanguage()) {
  return [
    facts.modelId ? aiModelLabel(facts.modelId, lang) : '',
    facts.threshold != null ? translate(lang, 'aiFacts.threshold', { value: thresholdText(facts.threshold) }) : '',
  ].filter(Boolean).join(' · ');
}
