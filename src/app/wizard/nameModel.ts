// GEE data name suggestion (UR-54): "{place} {period}", e.g. "대청호 2024-08" or "127.63,36.45 2024-06–08".
// The review step fills the name field with it until the user types their own.
import { AreaState } from './areaModel';

const MAX_NAME = 150;
const coord = (value: number) => value.toFixed(2);

/** The place: the administrative area or saved area name, else the centre as "lon,lat" (two decimals). */
export function placeOf(area: AreaState): string {
  if (area.tab === 'admin') return area.admin?.name ?? '';
  if (area.tab === 'shape') return area.shape?.name ?? '';
  const numbers = area.tab === 'point'
    ? [Number(area.lon), Number(area.lat)]
    : [(Number(area.west) + Number(area.east)) / 2, (Number(area.south) + Number(area.north)) / 2];
  const filled = area.tab === 'point' ? [area.lon, area.lat] : [area.west, area.south, area.east, area.north];
  if (filled.some((value) => value.trim() === '') || numbers.some((value) => !Number.isFinite(value))) return '';
  return `${coord(numbers[0])},${coord(numbers[1])}`;
}

/** The period by month: "2024-08" in one month, "2025" for a whole calendar year, "2024-06–08" in one year, else "2023-11–2024-02". */
export function periodOf(start: string, end: string): string {
  const from = start.slice(0, 7);
  const to = end.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to)) return '';
  if (from === to) return from;
  if (from.slice(0, 4) === to.slice(0, 4) && from.endsWith('-01') && to.endsWith('-12')) return from.slice(0, 4);
  return from.slice(0, 4) === to.slice(0, 4) ? `${from}–${to.slice(5)}` : `${from}–${to}`;
}

/** "{place} {period}" with whatever is known; '' when neither is. */
export const suggestName = (area: AreaState, start: string, end: string) =>
  [placeOf(area), periodOf(start, end)].filter(Boolean).join(' ').slice(0, MAX_NAME);
