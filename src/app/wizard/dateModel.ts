// "날짜 고르기" (UR-43, FR-GEE-14): the estimate lists every date of the period; the user checks the ones to make.
// Pure rules shared by the wizard, the date table and the tests. Totals are computed here, without a new estimate request.
import { EstimateDate, GeeEstimate } from '../../api/generationApi';

/** Above this many minutes the estimate suggests picking fewer dates. */
export const LONG_MINUTES = 10;

/** The estimate's date list, or null when the server sends none (older backend: no table, wizard works as before). */
export const estimateDates = (data?: GeeEstimate): EstimateDate[] | null => (Array.isArray(data?.dates) ? data!.dates! : null);

/** Dates the user picked for one area/period (`scope`), with the full list they were picked from. */
export type DateSelection = { scope: string; all: string[]; picked: string[] };

/** The selection that applies now: the stored one for this scope, else every date of the estimate (default all checked). */
export function activeSelection(stored: DateSelection | null, scope: string, dates: EstimateDate[] | null): DateSelection | null {
  if (stored && stored.scope === scope) return stored;
  if (!dates) return null;
  const all = dates.map((item) => item.date);
  return { scope, all, picked: all };
}

/** Request field: the sorted picked dates only when something was left out; all picked = omitted (same as before UR-43). */
export function selectedDatesField(selection: DateSelection | null): { selectedDates?: string[] } {
  if (!selection || selection.picked.length >= selection.all.length) return {};
  return { selectedDates: [...selection.picked].sort() };
}

/** How cloudy a date is for ranking (UR-47): the share of the area its mask drops (cloud, shadow, snow…),
 *  else the scene's cloud property, which is for the whole ~110 km tile. No value ranks last. */
export const cloudRank = (item: EstimateDate) => item.noisePercent ?? item.cloudPercent ?? Infinity;

/** Dates from the least cloudy to the most (ties by date). */
export const byLeastCloud = (dates: EstimateDate[]) => [...dates].sort((a, b) => cloudRank(a) - cloudRank(b) || a.date.localeCompare(b.date));

/** The `n` dates with the least cloud (no cloud value last, ties by date), in the list's order. */
export function leastCloudy(dates: EstimateDate[], n: number): string[] {
  const count = Math.max(0, Math.min(Math.floor(n), dates.length));
  const ranked = byLeastCloud(dates);
  const keep = new Set(ranked.slice(0, count).map((item) => item.date));
  return dates.filter((item) => keep.has(item.date)).map((item) => item.date);
}

export type SelectionTotals = { count: number; total: number; scenes: number; bytes: number; seconds: number | null; unpaired: number };

/** Times, scenes, bytes and seconds for the picked dates: `bytesPerDate × n`, `estimatedSeconds × n / m`. */
export function selectionTotals(data: GeeEstimate, picked: string[]): SelectionTotals {
  const dates = estimateDates(data) ?? [];
  const chosen = new Set(picked);
  const rows = dates.filter((item) => chosen.has(item.date));
  const total = dates.length;
  const count = rows.length;
  const bytes = data.bytesPerDate != null ? data.bytesPerDate * count : total ? (data.estimatedBytes * count) / total : 0;
  const seconds = data.estimatedSeconds != null && total ? (data.estimatedSeconds * count) / total : null;
  return {
    count, total, bytes, seconds,
    scenes: rows.reduce((sum, item) => sum + (item.sceneCount ?? 0), 0),
    unpaired: rows.filter((item) => item.s1 === null).length,
  };
}

/** "약 n분" (rounded up, at least 1 minute); "—" when nothing will be made. */
export const minutesText = (seconds: number | null | undefined) => (seconds == null || !Number.isFinite(seconds) ? '—' : seconds <= 0 ? '—' : `약 ${Math.max(1, Math.ceil(seconds / 60))}분`);
export const isLong = (seconds: number | null | undefined) => seconds != null && seconds > LONG_MINUTES * 60;
export const cloudText = (value: number | null | undefined) => (value == null || !Number.isFinite(value) ? '—' : String(Math.round(value * 10) / 10));

/** Why the picked dates cannot be made, or ''. With "빼기", picking only dates without a radar pass leaves nothing. */
export function selectionProblem(selection: DateSelection | null, dates: EstimateDate[] | null, pairing: { keepUnpaired: boolean } | null): string {
  if (!selection) return '';
  if (!selection.picked.length) return '날짜를 하나 이상 고르세요.';
  if (pairing && !pairing.keepUnpaired && dates) {
    const chosen = new Set(selection.picked);
    const rows = dates.filter((item) => chosen.has(item.date));
    if (rows.length && rows.every((item) => item.s1 === null)) return '고른 날짜에 레이더 짝이 없어 만들 시점이 없습니다. 짝이 있는 날짜를 고르세요.';
  }
  return '';
}
