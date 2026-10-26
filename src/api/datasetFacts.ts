// Facts that tell datasets apart in lists (FB1 §3): one time or a time series, the period in short form, and
// the kind. Plain functions so the Viewer picker, the data list, the dashboard and the projects share them.
import type { TimePoint, ZarrDataset } from './viewerAdapter';

export type TimeKind = 'series' | 'single';
/** Two or more times make a time series; one time (or none known yet) is a single date. */
export const timeKindOf = (dataset: Pick<ZarrDataset, 'times'>): TimeKind => (dataset.times.length > 1 ? 'series' : 'single');

/** Reads `?time=series|single` (anything else means no filter). */
export const parseTimeKind = (value: string | null | undefined): TimeKind | '' => (value === 'series' || value === 'single' ? value : '');

type Ymd = { y: number; m: number; d: number };
/** Year, month and day of a time: from the ISO time, else from a label like "2025.07.03" or "2025. 7. 3.". */
export function ymdOf(time: TimePoint | undefined): Ymd | null {
  if (!time) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(time.iso ?? '');
  if (iso) return { y: Number(iso[1]), m: Number(iso[2]), d: Number(iso[3]) };
  const label = /(\d{4})\D+(\d{1,2})\D+(\d{1,2})/.exec(time.label ?? '');
  return label ? { y: Number(label[1]), m: Number(label[2]), d: Number(label[3]) } : null;
}

const two = (value: number) => String(value).padStart(2, '0');

/**
 * Period in the field-book short form, the same in every language: "2024.08–2025.10" for a series (one month
 * reads "2024.08"), "2024.08.14" for a single date, "" when the times are unknown.
 */
export function shortPeriod(dataset: Pick<ZarrDataset, 'times'>): string {
  const first = ymdOf(dataset.times[0]);
  if (!first) return '';
  if (dataset.times.length === 1) return `${first.y}.${two(first.m)}.${two(first.d)}`;
  const last = ymdOf(dataset.times[dataset.times.length - 1]) ?? first;
  const start = `${first.y}.${two(first.m)}`;
  const end = `${last.y}.${two(last.m)}`;
  return start === end ? start : `${start}–${end}`;
}

export type KindId = 'original' | 'fusion' | 'ai' | 'compare';
export const kindIdOf = (dataset: Pick<ZarrDataset, 'kind'>): KindId =>
  dataset.kind === 'FUSION' ? 'fusion' : dataset.kind === 'AI_RESULT' ? 'ai' : dataset.kind === 'COMPARISON' ? 'compare' : 'original';
