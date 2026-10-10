// GEE area of interest (AOI): the wizard's area state and the pure rules that turn it into a request.
// Words come from the wizard dictionary (UR-53 stage 3); each helper takes the screen language (default: current).
import { AdminArea, AreaGeometry, AreaRequest, Bbox, EstimateBlocker, GeeEstimate, SavedArea } from '../../api/generationApi';
import { codeText, formatNumber, getLanguage, serverItems, serverText, shownSentence, translate } from '../../i18n';
import type { Lang, ServerItem, TKey, TVars } from '../../i18n';

export type AreaTab = 'point' | 'admin' | 'box' | 'shape';
export const AREA_TAB_IDS: readonly AreaTab[] = ['point', 'admin', 'box', 'shape'];
/** Tabs with their labels in `lang`. */
export const areaTabs = (lang: Lang = getLanguage()): Array<{ id: AreaTab; label: string }> =>
  AREA_TAB_IDS.map((id) => ({ id, label: translate(lang, `wizard.area.tabs.${id}` as TKey) }));
/** Side length chips; 30 km is the research default (`center.buffer(15_000)` → its 30 × 30 km outer box, FR-GEE-15). */
export const SIZE_CHIPS = [10, 20, 30, 40] as const;
export const DEFAULT_SIZE_KM = 30;
export const KM_PER_DEGREE = 111.32;
export const SIZE_LIMITS = { min: 1, max: 200 } as const;
/** Boundary source as the server words it (the demo answers with it); screens show the `SGIS_ADMDONGKOR` code's text. */
export const ADMIN_ATTRIBUTION = '경계: 통계청 SGIS(공공누리 1유형), admdongkor(CC BY 4.0)';

export type AreaState = {
  tab: AreaTab;
  lon: string; lat: string; sizeChip: '10' | '20' | '30' | '40' | 'custom'; customSize: string;
  west: string; south: string; east: string; north: string;
  admin: AdminArea | null;
  shape: SavedArea | null;
  clip: 'shape' | 'bbox';
  maskVariable: boolean;
  fullCoverOnly: boolean;
};
export const emptyArea = (): AreaState => ({
  tab: 'point', lon: '', lat: '', sizeChip: String(DEFAULT_SIZE_KM) as AreaState['sizeChip'], customSize: '',
  west: '', south: '', east: '', north: '', admin: null, shape: null, clip: 'shape', maskVariable: false, fullCoverOnly: false,
});

const numberOk = (value: string) => value.trim() !== '' && Number.isFinite(Number(value));
const round = (value: number, digits = 6) => Number(value.toFixed(digits));

/** Square of `sizeKm` per side around a point; the longitude width is corrected for latitude (cos φ). */
export function pointBbox(lon: number, lat: number, sizeKm: number): Bbox {
  const half = sizeKm / 2;
  const dLat = half / KM_PER_DEGREE;
  const dLon = half / (KM_PER_DEGREE * Math.cos((lat * Math.PI) / 180));
  return [round(lon - dLon), round(lat - dLat), round(lon + dLon), round(lat + dLat)];
}

/** Approximate area of a lon/lat box in km². */
export function bboxAreaKm2(bbox: Bbox) {
  const [west, south, east, north] = bbox;
  const midLat = ((south + north) / 2) * (Math.PI / 180);
  return (north - south) * KM_PER_DEGREE * (east - west) * KM_PER_DEGREE * Math.cos(midLat);
}

export const sizeKmOf = (state: AreaState) => Number(state.sizeChip === 'custom' ? state.customSize : state.sizeChip);

export type ResolvedArea = {
  /** Why the area cannot be used yet (empty when valid). */
  error: string;
  bbox?: Bbox;
  geojson?: AreaGeometry;
  areaKm2?: number;
  request?: AreaRequest;
  /** Human-readable name of the area for summaries. */
  label: string;
  modeLabel: string;
  clipLabel: string;
};

const polygonTab = (tab: AreaTab) => tab === 'admin' || tab === 'shape';

/** The area the active tab currently describes: outer box, polygon, request `area` object and a validation message. */
export function resolveArea(state: AreaState, lang: Lang = getLanguage()): ResolvedArea {
  const say = (key: TKey, vars?: TVars) => translate(lang, key, vars);
  const common = { fullCoverOnly: state.fullCoverOnly };
  if (state.tab === 'point') {
    const modeLabel = say('wizard.area.mode.point');
    if (!numberOk(state.lon) || !numberOk(state.lat)) return { error: say('wizard.area.errors.pointMissing'), label: '', modeLabel, clipLabel: '' };
    const lon = Number(state.lon); const lat = Number(state.lat); const sizeKm = sizeKmOf(state);
    if (lon < -180 || lon > 180 || lat < -85 || lat > 85) return { error: say('wizard.area.errors.pointRange'), label: '', modeLabel, clipLabel: '' };
    if (!Number.isFinite(sizeKm) || sizeKm < SIZE_LIMITS.min || sizeKm > SIZE_LIMITS.max) return { error: say('wizard.area.errors.size', SIZE_LIMITS), label: '', modeLabel, clipLabel: '' };
    const bbox = pointBbox(lon, lat, sizeKm);
    return {
      error: '', bbox, areaKm2: sizeKm * sizeKm, label: say('wizard.area.pointLabel', { lon: lon.toFixed(4), lat: lat.toFixed(4), size: sizeKm }), modeLabel, clipLabel: say('wizard.area.mode.box'),
      request: { mode: 'point', point: { lon, lat, sizeKm }, clip: 'bbox', maskVariable: false, ...common },
    };
  }
  if (state.tab === 'box') {
    const modeLabel = say('wizard.area.mode.box');
    const keys = ['west', 'south', 'east', 'north'] as const;
    if (!keys.every((key) => numberOk(state[key]))) return { error: say('wizard.area.errors.boxMissing'), label: '', modeLabel, clipLabel: '' };
    const [west, south, east, north] = keys.map((key) => Number(state[key]));
    if (west >= east || south >= north) return { error: say('wizard.area.errors.boxOrder'), label: '', modeLabel, clipLabel: '' };
    const bbox: Bbox = [west, south, east, north];
    return { error: '', bbox, areaKm2: bboxAreaKm2(bbox), label: say('wizard.area.boxLabel', { west, south, east, north }), modeLabel, clipLabel: modeLabel, request: { mode: 'box', box: { west, south, east, north }, clip: 'bbox', maskVariable: false, ...common } };
  }
  const isAdmin = state.tab === 'admin';
  const modeLabel = say(isAdmin ? 'wizard.area.mode.admin' : 'wizard.area.mode.shape');
  const picked = isAdmin ? state.admin : state.shape;
  if (!picked) return { error: say(isAdmin ? 'wizard.area.errors.adminMissing' : 'wizard.area.errors.shapeMissing'), label: '', modeLabel, clipLabel: '' };
  const clip = state.clip;
  const label = isAdmin ? [(picked as AdminArea).parentName, picked.name].filter(Boolean).join(' ') : picked.name;
  return {
    error: '', bbox: picked.bbox, geojson: picked.geojson, areaKm2: picked.areaKm2, label, modeLabel, clipLabel: say(clip === 'shape' ? 'wizard.area.clip.shape' : 'wizard.area.clip.bbox'),
    request: {
      mode: isAdmin ? 'admin' : 'shape',
      ...(isAdmin ? { admin: { code: (picked as AdminArea).code, level: (picked as AdminArea).level } } : { shape: { areaId: (picked as SavedArea).id } }),
      clip, maskVariable: clip === 'shape' && state.maskVariable, ...common,
    },
  };
}

export const hasPolygonOptions = (tab: AreaTab) => polygonTab(tab);

export const bboxBounds = (bbox: Bbox) => ({ west: bbox[0], south: bbox[1], east: bbox[2], north: bbox[3] });
export const bboxText = (bbox: Bbox, lang: Lang = getLanguage()) =>
  translate(lang, 'wizard.area.bboxText', { west: bbox[0].toFixed(4), east: bbox[2].toFixed(4), south: bbox[1].toFixed(4), north: bbox[3].toFixed(4) });
export const km2Text = (value: number, lang: Lang = getLanguage()) => `${value >= 100 ? formatNumber(Math.round(value), {}, lang) : value.toFixed(1)} km²`;

/** Blocker codes the wizard words itself, with advice (other codes: the server code dictionary, then the server's sentence). */
const BLOCKER_CODES = ['NO_S1_MATCH', 'DATE_LIST_UNAVAILABLE', 'NO_FULL_COVER_DATE', 'QUOTA_EXCEEDED', 'NO_SCENES', 'AREA_TOO_LARGE', 'INVALID_AREA'];
/** Estimate warning codes the wizard words itself. Size and the date list are judged again from the picked dates (`estimateWarnings`). */
const WARNING_CODES = ['SIDE_EXCEEDS_100_KM', 'ESTIMATED_SIZE_EXCEEDS_5_GIB', 'MAX_SCENES_LIMIT', 'ESTIMATE_USES_MAX_SCENES', 'STORAGE_USAGE_UNAVAILABLE', 'NOISE_UNAVAILABLE', 'DATE_LIST_TRUNCATED', 'GEE_SCENE_COUNT_UNAVAILABLE', 'ESTIMATE_USES_SELECTED_DATES'];

type EstimateWarning = string | ServerItem;
const itemOf = (warning: EstimateWarning): ServerItem => (typeof warning === 'string' ? serverItems(null, [warning])[0] : warning);
const codeOf = (warning: EstimateWarning) => (typeof warning === 'string' ? warning : warning.code ?? '');

/** The estimate's warnings as items: `warningItems` (codes with values), else the plain `warnings` (older servers). */
export const estimateWarningItems = (data: GeeEstimate): ServerItem[] => serverItems(data.warningItems, data.warnings);
/** The estimate's blockers: `blockerItems` (codes with values) when the server sends them, else the plain `blockers`. */
export const estimateBlockers = (data: GeeEstimate | undefined): EstimateBlocker[] =>
  data?.blockerItems?.length ? data.blockerItems : data?.blockers ?? [];

/** A warning in words: the wizard's own text for its codes, else the server code dictionary or sentence (UR-53 stage 5). */
export const warningText = (warning: EstimateWarning, lang: Lang = getLanguage()) => {
  const code = codeOf(warning);
  if (WARNING_CODES.includes(code)) return translate(lang, `wizard.estimate.warnings.${code}` as TKey);
  return serverText(itemOf(warning), lang);
};

/**
 * Warnings worth showing now: with a date list, size and the scene-count fallbacks follow the picked dates.
 * The estimate's note that it used the picked dates is not shown (the user picked them).
 */
export function estimateWarnings<T extends EstimateWarning>(warnings: T[], picked: { bytes: number } | null, blocked: boolean): Array<T | string> {
  const shown: Array<T | string> = warnings.filter((warning) => {
    const code = codeOf(warning);
    return code !== 'ESTIMATE_USES_SELECTED_DATES'
      && !(picked && (code === 'ESTIMATED_SIZE_EXCEEDS_5_GIB' || code === 'MAX_SCENES_LIMIT'))
      && !(blocked && (code === 'GEE_SCENE_COUNT_UNAVAILABLE' || code === 'ESTIMATE_USES_MAX_SCENES'));
  });
  if (picked && picked.bytes > 5 * 1024 ** 3) shown.push('ESTIMATED_SIZE_EXCEEDS_5_GIB');
  return shown;
}

/**
 * Blockers in plain words: the wizard's own text (with advice) for its codes, else the server code
 * dictionary, else the server's sentence (Korean only in Korean), else a generic sentence with the code.
 */
export const blockerText = (blocker: EstimateBlocker, lang: Lang = getLanguage()) => {
  const code = typeof blocker === 'string' ? blocker : blocker.code;
  if (BLOCKER_CODES.includes(code)) return translate(lang, `wizard.estimate.blockers.${code}` as TKey);
  const item = typeof blocker === 'string' ? { code } : blocker;
  const sentence = item.message && item.message !== code ? shownSentence(item.message, lang) : undefined;
  return codeText(code, item.params, lang) ?? sentence ?? translate(lang, 'wizard.estimate.blockers.unknown', { code });
};
