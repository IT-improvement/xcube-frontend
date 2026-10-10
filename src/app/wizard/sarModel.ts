// "수체 분석용 S1+S2" (UR-41): S2 optical bands plus the Sentinel-1 pass that covers the same area on a nearby date.
// Pure rules shared by the wizard, the estimate pair table and the tests.
import { EstimateBlocker, GeeEstimate, OrbitPass, SarPair, SarPairing, WaterReference } from '../../api/generationApi';
import { getLanguage, translate } from '../../i18n';
import type { Lang } from '../../i18n';
import { estimateBlockers } from './areaModel';

/** "100% 덮음" (UR-45): footprints are compared with 10 m geometry error, ~0.1 % of a 30 km area. */
export const FULL_COVER = 0.998;
export const S2_COLLECTION = 'COPERNICUS/S2_SR_HARMONIZED';
/** S2 bands the AI models read, and the names the AI registry looks them up by. */
export const WATER_BANDS: Array<{ source: string; name: string }> = [
  { source: 'B2', name: 'blue' },
  { source: 'B3', name: 'green' },
  { source: 'B4', name: 'red' },
  { source: 'B8', name: 'nir' },
  { source: 'B11', name: 'swir' },
];
export const WATER_NAME: Record<string, string> = Object.fromEntries(WATER_BANDS.map((band) => [band.source, band.name]));
/** Variables the server adds; the AI finds them by these exact names. */
export const FIXED_NAMES = ['vv', 'vh', 'water_gt'] as const;
export const MAX_DAYS = { min: 1, max: 30, default: 15 } as const;
/** Pairs further apart than this get a caution mark (the AI check warns from the same value). */
export const CAUTION_DAYS = 7;
export const ORBIT_PASSES: readonly OrbitPass[] = ['ANY', 'ASCENDING', 'DESCENDING'];
/** Orbit words live in the app part (`orbit.*`): the dataset page shows them too. */
export const orbitOption = (pass: OrbitPass, lang: Lang = getLanguage()) => translate(lang, `orbit.${pass}`);
export const orbitLabel = (pass?: string | null, lang: Lang = getLanguage()) =>
  (pass === 'ASCENDING' || pass === 'DESCENDING' ? translate(lang, `orbit.${pass}`) : pass || '—');

export type SarState = { enabled: boolean; maxDaysApart: string; orbitPass: OrbitPass; keepUnpaired: boolean; waterReference: boolean };
export const defaultSar = (waterReference = false): SarState => ({ enabled: true, maxDaysApart: String(MAX_DAYS.default), orbitPass: 'ANY', keepUnpaired: false, waterReference });
export const presetSar = (): SarState => defaultSar(true);
/** AI models were trained on 10 m S2 + S1; the research scenes used a 40 % cloud filter. */
export const PRESET_GEE = { scaleMeters: '10', maxCloudPercent: '40' } as const;

export const isS2 = (collectionId: string) => collectionId === S2_COLLECTION;
export const pairingActive = (collectionId: string, sar: SarState) => isS2(collectionId) && sar.enabled;

/** Problem with the pairing settings, or ''. */
export function sarError(sar: SarState, lang: Lang = getLanguage()): string {
  const days = Number(sar.maxDaysApart);
  if (!sar.enabled) return '';
  if (sar.maxDaysApart.trim() === '' || !Number.isInteger(days) || days < MAX_DAYS.min || days > MAX_DAYS.max) return translate(lang, 'wizard.sar.maxDaysError', { min: MAX_DAYS.min, max: MAX_DAYS.max });
  return '';
}

/** Request fields for the contract; empty for non-S2 collections or when pairing is off (existing requests stay unchanged). */
export function sarRequest(collectionId: string, sar: SarState): { sarPairing?: SarPairing; waterReference?: WaterReference } {
  if (!pairingActive(collectionId, sar) || sarError(sar)) return {};
  return {
    sarPairing: { enabled: true, maxDaysApart: Number(sar.maxDaysApart), orbitPass: sar.orbitPass, minCoverage: FULL_COVER, dropUnpaired: !sar.keepUnpaired },
    ...(sar.waterReference ? { waterReference: { enabled: true, occurrenceThreshold: 50 } } : {}),
  };
}

/** Pairs read from the UR-43 `dates[].s1` when the server sends dates but no `pairs`. */
function datePairs(data?: GeeEstimate): SarPair[] | null {
  const dates = Array.isArray(data?.dates) ? data!.dates! : null;
  if (!dates || !dates.some((item) => item.s1 !== undefined)) return null;
  return dates.map((item) => ({ s2Date: item.date, s1Date: item.s1?.date ?? null, daysApart: item.s1?.daysApart ?? null, orbitPass: item.s1?.orbitPass ?? null, coverage: item.s1?.coverage ?? null }));
}

/** Pairing summary of an estimate; `pairs` is null when the server did not send them (older server). */
export function pairSummary(data?: GeeEstimate): { pairs: SarPair[] | null; paired: number; unpaired: number; noMatch: boolean } {
  const pairs = Array.isArray(data?.pairs) ? data!.pairs : datePairs(data);
  const paired = data?.pairedCount ?? pairs?.filter((pair) => !!pair.s1Date).length ?? 0;
  const unpaired = data?.unpairedCount ?? pairs?.filter((pair) => !pair.s1Date).length ?? 0;
  const blocked = estimateBlockers(data).some((blocker) => (typeof blocker === 'string' ? blocker : blocker.code) === 'NO_S1_MATCH');
  return { pairs, paired, unpaired, noMatch: blocked || (!!pairs && pairs.length > 0 && paired === 0) };
}

/** Blockers with NO_S1_MATCH added when every S2 time is unpaired but the server did not say so itself. */
export function withPairingBlockers(data: GeeEstimate | undefined, active: boolean): EstimateBlocker[] {
  const blockers = estimateBlockers(data);
  if (!active || !data) return blockers;
  const { noMatch } = pairSummary(data);
  const code = (blocker: EstimateBlocker) => (typeof blocker === 'string' ? blocker : blocker.code);
  // No date covers the area at all: that is the one message to show, not a missing radar pass too.
  if (blockers.some((blocker) => code(blocker) === 'NO_FULL_COVER_DATE')) return blockers.filter((blocker) => code(blocker) !== 'NO_S1_MATCH');
  const listed = blockers.some((blocker) => code(blocker) === 'NO_S1_MATCH');
  return noMatch && !listed ? [...blockers, 'NO_S1_MATCH'] : blockers;
}

/** Days as the backend rounds them (one decimal). */
export const daysText = (value?: number | null) => (value == null || !Number.isFinite(value) ? '—' : String(Math.round(value * 10) / 10));
export const coverageText = (value?: number | null) => (value == null || !Number.isFinite(value) ? '—' : `${Math.floor(value * 1000) / 10}`);
export const dateOnly = (value?: string | null) => (value ? value.slice(0, 10) : '');

/** `xcube_pairs[]` root attribute of a paired Zarr (one entry per time). */
export type ZarrPair = { time?: string; s1Time?: string | null; orbitPass?: string | null; daysApart?: number | null; coverage?: number | null };
/** One line per time on the dataset page; its words are in the app part (`dataset.pairLine`), which that page loads. */
export const pairLine = (pair: ZarrPair, lang: Lang = getLanguage()) =>
  pair.s1Time
    ? translate(lang, 'dataset.pairLine', { date: dateOnly(pair.s1Time), orbit: orbitLabel(pair.orbitPass, lang), days: daysText(pair.daysApart) })
    : translate(lang, 'dataset.pairNone');
