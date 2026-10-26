// Matching a time from the address (`?t=`, `?b=`) to a dataset's times (UXF1).
// The same acquisition is written in several ways: with or without `Z`, with milliseconds or nanoseconds
// (`2025-11-22T02:26:48.000000000`), or as a day only (`2025-11-22`). A link written by another screen can also
// carry the scene time rounded differently (seconds off). Exact text first, then the same instant, then the
// nearest time on the same UTC day.

const ZONE = /([zZ]|[+-]\d{2}:?\d{2})$/;

/** Milliseconds since the epoch, reading a time without a zone as UTC; NaN when it is not a date. */
export function parseUtc(value: string): number {
  const text = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(text)) return Number.NaN;
  if (!text.includes("T")) return Date.parse(`${text.slice(0, 10)}T00:00:00Z`);
  // Keep at most milliseconds: some engines refuse 6–9 fraction digits.
  const trimmed = text.replace(/(\.\d{3})\d+/, "$1");
  return Date.parse(ZONE.test(trimmed) ? trimmed : `${trimmed}Z`);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const utcDay = (ms: number) => Math.floor(ms / DAY_MS);

/** Index of the time the address means, or -1 when no time of the list fits. */
export function matchTimeIndex(times: ReadonlyArray<{ iso: string }>, wanted?: string | null): number {
  if (!wanted) return -1;
  const exact = times.findIndex((time) => time.iso === wanted);
  if (exact >= 0) return exact;
  const target = parseUtc(wanted);
  if (!Number.isFinite(target)) return -1;
  let best = -1;
  let bestGap = Number.POSITIVE_INFINITY;
  times.forEach((time, index) => {
    const at = parseUtc(time.iso);
    if (!Number.isFinite(at)) return;
    const gap = Math.abs(at - target);
    if (gap < bestGap) {
      best = index;
      bestGap = gap;
    }
  });
  if (best < 0) return -1;
  if (bestGap <= 1000) return best; // same instant (fraction or zone written differently)
  return utcDay(parseUtc(times[best].iso)) === utcDay(target) ? best : -1;
}
