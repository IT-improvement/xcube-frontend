// GEE area of interest (AOI): the wizard's area state and the pure rules that turn it into a request.
import { AdminArea, AreaGeometry, AreaRequest, Bbox, EstimateBlocker, SavedArea } from '../../api/generationApi';

export type AreaTab = 'point' | 'admin' | 'box' | 'shape';
export const AREA_TABS: Array<{ id: AreaTab; label: string }> = [
  { id: 'point', label: '지점 + 크기' },
  { id: 'admin', label: '행정구역' },
  { id: 'box', label: '사각형' },
  { id: 'shape', label: '내 영역(Shape)' },
];
/** Side length chips; 30 km is the research default (`center.buffer(15_000)` → its 30 × 30 km outer box, FR-GEE-15). */
export const SIZE_CHIPS = [10, 20, 30, 40] as const;
export const DEFAULT_SIZE_KM = 30;
export const KM_PER_DEGREE = 111.32;
export const SIZE_LIMITS = { min: 1, max: 200 } as const;
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
export function resolveArea(state: AreaState): ResolvedArea {
  const common = { fullCoverOnly: state.fullCoverOnly };
  if (state.tab === 'point') {
    const modeLabel = '지점 + 크기';
    if (!numberOk(state.lon) || !numberOk(state.lat)) return { error: '지도를 눌러 중심을 고르거나 경도·위도를 입력하세요.', label: '', modeLabel, clipLabel: '' };
    const lon = Number(state.lon); const lat = Number(state.lat); const sizeKm = sizeKmOf(state);
    if (lon < -180 || lon > 180 || lat < -85 || lat > 85) return { error: '경도는 -180~180, 위도는 -85~85 사이여야 합니다.', label: '', modeLabel, clipLabel: '' };
    if (!Number.isFinite(sizeKm) || sizeKm < SIZE_LIMITS.min || sizeKm > SIZE_LIMITS.max) return { error: `한 변 크기는 ${SIZE_LIMITS.min}~${SIZE_LIMITS.max} km로 입력하세요.`, label: '', modeLabel, clipLabel: '' };
    const bbox = pointBbox(lon, lat, sizeKm);
    return {
      error: '', bbox, areaKm2: sizeKm * sizeKm, label: `중심 ${lon.toFixed(4)}, ${lat.toFixed(4)} · 한 변 ${sizeKm} km`, modeLabel, clipLabel: '사각형',
      request: { mode: 'point', point: { lon, lat, sizeKm }, clip: 'bbox', maskVariable: false, ...common },
    };
  }
  if (state.tab === 'box') {
    const modeLabel = '사각형';
    const keys = ['west', 'south', 'east', 'north'] as const;
    if (!keys.every((key) => numberOk(state[key]))) return { error: '영역 좌표 네 개를 모두 입력하세요.', label: '', modeLabel, clipLabel: '' };
    const [west, south, east, north] = keys.map((key) => Number(state[key]));
    if (west >= east || south >= north) return { error: '좌하단 좌표는 우상단 좌표보다 작아야 합니다.', label: '', modeLabel, clipLabel: '' };
    const bbox: Bbox = [west, south, east, north];
    return { error: '', bbox, areaKm2: bboxAreaKm2(bbox), label: `${west}, ${south} → ${east}, ${north}`, modeLabel, clipLabel: '사각형', request: { mode: 'box', box: { west, south, east, north }, clip: 'bbox', maskVariable: false, ...common } };
  }
  const isAdmin = state.tab === 'admin';
  const modeLabel = isAdmin ? '행정구역' : '내 영역';
  const picked = isAdmin ? state.admin : state.shape;
  if (!picked) return { error: isAdmin ? '행정구역을 검색해 고르세요.' : '영역을 고르거나 Shapefile을 올리세요.', label: '', modeLabel, clipLabel: '' };
  const clip = state.clip;
  const label = isAdmin ? [(picked as AdminArea).parentName, picked.name].filter(Boolean).join(' ') : picked.name;
  return {
    error: '', bbox: picked.bbox, geojson: picked.geojson, areaKm2: picked.areaKm2, label, modeLabel, clipLabel: clip === 'shape' ? '경계로 자르기' : '사각형 그대로',
    request: {
      mode: isAdmin ? 'admin' : 'shape',
      ...(isAdmin ? { admin: { code: (picked as AdminArea).code, level: (picked as AdminArea).level } } : { shape: { areaId: (picked as SavedArea).id } }),
      clip, maskVariable: clip === 'shape' && state.maskVariable, ...common,
    },
  };
}

export const hasPolygonOptions = (tab: AreaTab) => polygonTab(tab);

export const bboxBounds = (bbox: Bbox) => ({ west: bbox[0], south: bbox[1], east: bbox[2], north: bbox[3] });
export const bboxText = (bbox: Bbox) => `경도 ${bbox[0].toFixed(4)} ~ ${bbox[2].toFixed(4)}, 위도 ${bbox[1].toFixed(4)} ~ ${bbox[3].toFixed(4)}`;
export const km2Text = (value: number) => `${value >= 100 ? Math.round(value).toLocaleString('ko-KR') : value.toFixed(1)} km²`;

export const NO_MATCH_TEXT = '영역을 덮는 레이더(Sentinel-1) 영상이 날짜 차이 안에 하나도 없습니다. 기간을 넓히거나 날짜 차이를 늘려 보세요.';
const BLOCKER_TEXT: Record<string, string> = {
  NO_S1_MATCH: NO_MATCH_TEXT,
  DATE_LIST_UNAVAILABLE: 'GEE에서 날짜 목록을 받지 못했습니다. 잠시 뒤 다시 시도하거나 기간을 줄여 보세요. 목록 없이는 만들 수 없습니다.',
  NO_FULL_COVER_DATE: '고른 기간에 이 위치를 100% 덮는 영상이 없습니다. 기간을 넓히거나 위치를 옮겨 보세요.',
  QUOTA_EXCEEDED: '저장 용량 한도를 넘어 만들 수 없습니다. 영역·기간을 줄이거나 쓰지 않는 데이터를 정리하세요.',
  NO_SCENES: '고른 영역과 기간에 조건에 맞는 장면이 없습니다. 기간이나 구름량 조건을 넓혀 보세요.',
  AREA_TOO_LARGE: '영역이 너무 큽니다. 영역을 줄여 주세요.',
  INVALID_AREA: '영역이 올바르지 않습니다. 영역을 다시 지정하세요.',
};
/** Blockers in plain Korean; unknown codes keep the server's message. */
/** Estimate warnings in words. Size and the date list are judged again from the picked dates (`estimateWarnings`). */
const WARNING_TEXT: Record<string, string> = {
  SIDE_EXCEEDS_100_KM: '영역 한 변이 100 km를 넘습니다. 받는 데 오래 걸릴 수 있습니다.',
  ESTIMATED_SIZE_EXCEEDS_5_GIB: '예상 용량이 5 GB를 넘습니다. 날짜나 영역을 줄이면 빨라집니다.',
  MAX_SCENES_LIMIT: '날짜가 많아 앞쪽 날짜까지만 만듭니다(최대 시점 수 제한).',
  ESTIMATE_USES_MAX_SCENES: '장면 수를 몰라 최대 시점 수로 어림했습니다.',
  STORAGE_USAGE_UNAVAILABLE: '지금 쓰고 있는 저장 용량을 확인하지 못했습니다.',
  NOISE_UNAVAILABLE: '영역 안 구름·그림자를 계산하지 못해 장면 전체의 구름 값으로 정렬합니다.',
  DATE_LIST_TRUNCATED: '날짜가 366개를 넘어 앞쪽 366개만 보여 줍니다.',
};
export const warningText = (code: string) => WARNING_TEXT[code] ?? code;

/** Warnings worth showing now: with a date list, size and the scene-count fallbacks follow the picked dates. */
export function estimateWarnings(warnings: string[], picked: { bytes: number } | null, blocked: boolean): string[] {
  const shown = warnings.filter((code) => !(picked && (code === 'ESTIMATED_SIZE_EXCEEDS_5_GIB' || code === 'MAX_SCENES_LIMIT'))
    && !(blocked && (code === 'GEE_SCENE_COUNT_UNAVAILABLE' || code === 'ESTIMATE_USES_MAX_SCENES')));
  if (picked && picked.bytes > 5 * 1024 ** 3) shown.push('ESTIMATED_SIZE_EXCEEDS_5_GIB');
  return shown;
}

export const blockerText = (blocker: EstimateBlocker) => {
  const code = typeof blocker === 'string' ? blocker : blocker.code;
  const message = typeof blocker === 'string' ? '' : blocker.message ?? '';
  return BLOCKER_TEXT[code] ?? (message || `진행할 수 없는 조건입니다. (${code})`);
};
