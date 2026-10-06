// Demo mode (REACT_APP_USE_MOCK_API=true) for the GEE area step: admin boundaries, saved areas, estimate.
import { AdminArea, AdminLevel, AdminSearch, AreaChoice, AreaGeometry, AreaPick, AreaUpload, Bbox, GeeEstimate, GeeJobBody, SavedArea } from '../api/generationApi';
import { ADMIN_ATTRIBUTION, bboxAreaKm2, KM_PER_DEGREE } from './wizard/areaModel';

const pause = (ms = 200) => new Promise((resolve) => window.setTimeout(resolve, ms));

/** A rough ring (irregular octagon) inside a box, enough to show clipping. */
const blob = (bbox: Bbox): AreaGeometry => {
  const [w, s, e, n] = bbox;
  const at = (fx: number, fy: number) => [Number((w + (e - w) * fx).toFixed(5)), Number((s + (n - s) * fy).toFixed(5))];
  const ring = [at(0.15, 0.1), at(0.6, 0), at(0.95, 0.25), at(1, 0.7), at(0.7, 1), at(0.25, 0.9), at(0, 0.55), at(0.15, 0.1)];
  return { type: 'Polygon', coordinates: [ring] };
};
const admin = (code: string, level: AdminLevel, name: string, parentCode: string | null, parentName: string | null, bbox: Bbox): AdminArea => ({
  code, level, name, parentCode, parentName, bbox, areaKm2: Number((bboxAreaKm2(bbox) * 0.72).toFixed(1)), geojson: blob(bbox),
});
const ADMIN: AdminArea[] = [
  admin('11', 'sido', '서울특별시', null, null, [126.76, 37.43, 127.18, 37.7]),
  admin('43', 'sido', '충청북도', null, null, [127.28, 36.0, 128.65, 37.27]),
  admin('50', 'sido', '제주특별자치도', null, null, [126.14, 33.11, 126.97, 33.57]),
  admin('11110', 'sigungu', '종로구', '11', '서울특별시', [126.95, 37.56, 127.02, 37.63]),
  admin('43110', 'sigungu', '청주시', '43', '충청북도', [127.28, 36.45, 127.75, 36.8]),
  admin('50110', 'sigungu', '제주시', '50', '제주특별자치도', [126.14, 33.21, 126.97, 33.57]),
  admin('50130', 'sigungu', '서귀포시', '50', '제주특별자치도', [126.14, 33.11, 126.97, 33.4]),
];

const savedAreas: SavedArea[] = [];
let nextAreaId = 1;
const seedBox: Bbox = [126.4, 33.25, 126.7, 33.45];
savedAreas.push({ id: nextAreaId++, name: '제주 연구 구역', bbox: seedBox, areaKm2: Number((bboxAreaKm2(seedBox) * 0.7).toFixed(1)), geojson: blob(seedBox), source: 'upload', createdAt: '2026-09-20T01:00:00Z' });

const choice: AreaChoice = { polygonCount: 4, attributes: [{ name: 'sgg_nm_k', values: ['제주시', '서귀포시'] }, { name: 'sido_cd', values: ['50'] }] };
const makeArea = (name: string, source: SavedArea['source']): SavedArea => {
  const bbox: Bbox = [128.9, 35.38, 129.2, 35.62];
  const area: SavedArea = { id: nextAreaId++, name, bbox, areaKm2: Number((bboxAreaKm2(bbox) * 0.66).toFixed(1)), geojson: blob(bbox), source, createdAt: new Date().toISOString() };
  savedAreas.unshift(area);
  return area;
};
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });

export const areaDemo = {
  async searchAdmin(query: string, level?: AdminLevel): Promise<AdminSearch> {
    await pause(150);
    const text = query.trim();
    const items = ADMIN.filter((item) => (!level || item.level === level) && (!text || `${item.parentName ?? ''} ${item.name}`.includes(text))).slice(0, 20).map(({ geojson, ...rest }) => rest);
    return { items, attribution: ADMIN_ATTRIBUTION };
  },
  async getAdmin(code: string): Promise<AdminArea> {
    await pause(120);
    const found = ADMIN.find((item) => item.code === code);
    if (!found) throw fail(404, '행정구역을 찾을 수 없습니다.');
    return found;
  },
  async list(): Promise<SavedArea[]> { await pause(120); return savedAreas.map(({ geojson, ...rest }) => rest); },
  async get(id: string | number): Promise<SavedArea> {
    await pause(100);
    const found = savedAreas.find((item) => String(item.id) === String(id));
    if (!found) throw fail(404, '영역을 찾을 수 없습니다.');
    return found;
  },
  async remove(id: string | number): Promise<void> {
    await pause(150);
    const index = savedAreas.findIndex((item) => String(item.id) === String(id));
    if (index >= 0) savedAreas.splice(index, 1);
  },
  /** A file name containing "multi" stands for a Shapefile with several polygons. */
  async upload(file: File, name: string, pick: AreaPick = {}): Promise<AreaUpload> {
    await pause(300);
    if (/multi/i.test(file.name) && !pick.dissolve && !pick.attribute) return { choice };
    return { area: makeArea(name, 'upload') };
  },
  async fromJob(_jobId: string | number, name: string, pick: AreaPick = {}): Promise<AreaUpload> {
    await pause(300);
    if (!pick.dissolve && !pick.attribute && /multi/i.test(name)) return { choice };
    return { area: makeArea(name, 'shape_dataset') };
  },
  async estimate(body: GeeJobBody): Promise<GeeEstimate> {
    await pause(200);
    const { west, south, east, north } = body.bounds;
    const areaKm2 = bboxAreaKm2([west, south, east, north]);
    const scale = Math.max(body.scaleMeters, 1);
    const width = Math.max(1, Math.round(((east - west) * KM_PER_DEGREE * Math.cos((((south + north) / 2) * Math.PI) / 180) * 1000) / scale));
    const height = Math.max(1, Math.round(((north - south) * KM_PER_DEGREE * 1000) / scale));
    const scenes = Math.max(1, Math.round((Date.parse(body.endDate) - Date.parse(body.startDate)) / 86_400_000 / 5));
    const bands = Math.max(body.bands.length, 1);
    const estimatedBytes = width * height * scenes * bands * 2;
    const requestTiles = Math.max(1, Math.ceil((width * height * bands * 2) / (32 * 1024 * 1024)));
    const warnings: string[] = [];
    if (Math.max(east - west, north - south) * KM_PER_DEGREE > 100) warnings.push('영역 한 변이 100 km를 넘어 시간이 오래 걸릴 수 있습니다.');
    if (estimatedBytes > 5 * 1024 ** 3) warnings.push('예상 용량이 5 GB를 넘습니다.');
    const blockers = estimatedBytes > 50 * 1024 ** 3 ? ['QUOTA_EXCEEDED'] : [];
    return { bounds: body.bounds, areaKm2, grid: { width, height }, scenes, estimatedBytes, requestTiles, warnings, blockers };
  },
};
