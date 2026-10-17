// Area statistics (UR-63 F1). Contract: docs/PM/codex-prompts/FX-contract.md "F1 영역 통계".
// POST {Backoffice}/api/v1/datasets/{id}/area-stats → per-time mean/min/max/std inside a drawn polygon, and for AI
// results (water_mask) the water area per time. Shared by the Viewer and any other screen that needs it.
import { useMockApi } from './index';
import { ApiError, request } from './httpClient';
import { BACKOFFICE_API_BASE_URL } from './backofficeApi';

/** GeoJSON in EPSG:4326 (lon, lat). */
export type GeoPolygon = { type: 'Polygon'; coordinates: number[][][] } | { type: 'MultiPolygon'; coordinates: number[][][][] };
export type AreaStatsRequest = {
  geometry: GeoPolygon;
  variable: string;
  /** "all" or up to {@link MAX_AREA_TIMES} ISO times. */
  times: 'all' | string[];
};
export type AreaStatsPoint = {
  time: string;
  mean: number | null;
  min: number | null;
  max: number | null;
  std: number | null;
  validCount: number | null;
  validAreaKm2: number | null;
  /** Set when this time alone failed (`XCUBE_TIMEOUT` | `XCUBE_UNAVAILABLE`); its numbers are then null. */
  error?: string | null;
};
export type WaterAreaPoint = { time: string; km2: number | null; ratio: number | null };
export type AreaStats = {
  datasetId: string;
  variable: string;
  units?: string | null;
  /** Geodesic area of the drawn shape. */
  areaKm2: number;
  series: AreaStatsPoint[];
  /** Only for AI results (water_mask): the area judged as water and its share. */
  waterAreaKm2?: WaterAreaPoint[];
};

/** Contract limits: vertices of the shape and times per request. */
export const MAX_AREA_VERTICES = 2000;
export const MAX_AREA_TIMES = 120;
/** Error codes of the endpoint, worded by the screens. */
export const AREA_ERROR_CODES = ['GEOMETRY_INVALID', 'GEOMETRY_TOO_LARGE', 'GEOMETRY_OUTSIDE_DATA', 'TOO_MANY_TIMES', 'XCUBE_UNAVAILABLE', 'TIME_NOT_FOUND', 'INVALID_TIMES', 'VARIABLE_NOT_FOUND'] as const;

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** Reads the answer leniently (numbers may be missing or null per time). */
export function normalizeAreaStats(raw: any, fallback: { datasetId: string; variable: string }): AreaStats {
  const series: AreaStatsPoint[] = Array.isArray(raw?.series)
    ? raw.series.map((item: any) => ({
        time: String(item?.time ?? ''),
        mean: num(item?.mean),
        min: num(item?.min),
        max: num(item?.max),
        std: num(item?.std),
        validCount: num(item?.validCount),
        validAreaKm2: num(item?.validAreaKm2),
        error: typeof item?.error === 'string' && item.error ? item.error : null,
      }))
    : [];
  const water = Array.isArray(raw?.waterAreaKm2)
    ? raw.waterAreaKm2.map((item: any) => ({ time: String(item?.time ?? ''), km2: num(item?.km2), ratio: num(item?.ratio) }))
    : undefined;
  return {
    datasetId: String(raw?.datasetId ?? fallback.datasetId),
    variable: String(raw?.variable ?? fallback.variable),
    units: typeof raw?.units === 'string' ? raw.units : null,
    areaKm2: num(raw?.areaKm2) ?? 0,
    series,
    ...(water ? { waterAreaKm2: water } : {}),
  };
}

/** Vertex count of a polygon (outer and inner rings, closing points included). */
export function vertexCount(geometry: GeoPolygon): number {
  const rings = geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat();
  return rings.reduce((sum, ring) => sum + ring.length, 0);
}

/** Times to ask for: "all" when within the limit, else the latest {@link MAX_AREA_TIMES}. */
export function timesFor(isos: string[]): AreaStatsRequest['times'] {
  return isos.length <= MAX_AREA_TIMES ? 'all' : isos.slice(-MAX_AREA_TIMES);
}

// --- Demo (REACT_APP_USE_MOCK_API): a smooth seasonal curve so the panel and chart can be seen without servers.
export type DemoContext = { times: string[]; water: boolean };
let demoContext: DemoContext = { times: [], water: false };
/** The Viewer tells the demo which times the shown dataset has (demo time ids are not ISO dates). */
export const setAreaStatsDemoContext = (context: DemoContext) => { demoContext = context; };
const pause = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/** Shoelace area of a lon/lat ring in km² (good enough for the demo). */
function demoArea(geometry: GeoPolygon) {
  const ring = geometry.type === 'Polygon' ? geometry.coordinates[0] : geometry.coordinates[0][0];
  const lat0 = ((ring.reduce((sum, point) => sum + point[1], 0) / Math.max(ring.length, 1)) * Math.PI) / 180;
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i += 1) sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return Math.abs(sum / 2) * 111.32 * 111.32 * Math.cos(lat0);
}

export async function demoAreaStats(datasetId: string, body: AreaStatsRequest): Promise<AreaStats> {
  await pause(450);
  if (vertexCount(body.geometry) > MAX_AREA_VERTICES) throw new ApiError(400, 'GEOMETRY_TOO_LARGE', '도형의 꼭짓점이 너무 많습니다.');
  const areaKm2 = Number(demoArea(body.geometry).toFixed(3));
  const all = demoContext.times.length ? demoContext.times : Array.from({ length: 8 }, (_, index) => new Date(Date.UTC(2025, 6 + index, 3)).toISOString());
  const times = body.times === 'all' ? all : body.times;
  const series: AreaStatsPoint[] = times.map((time, index) => {
    const mean = 0.18 + 0.12 * Math.sin(index / 1.4) - (index === 2 ? 0.05 : 0);
    const missing = index === 3 && times.length > 4;
    return missing
      ? { time, mean: null, min: null, max: null, std: null, validCount: 0, validAreaKm2: 0 }
      : { time, mean: Number(mean.toFixed(4)), min: Number((mean - 0.31).toFixed(4)), max: Number((mean + 0.27).toFixed(4)), std: Number((0.08 + index * 0.004).toFixed(4)), validCount: 1200 - index * 7, validAreaKm2: Number((areaKm2 * (0.97 - index * 0.01)).toFixed(3)) };
  });
  const water = demoContext.water || body.variable === 'water_mask';
  return {
    datasetId,
    variable: body.variable,
    units: water ? null : '1',
    areaKm2,
    series,
    ...(water
      ? { waterAreaKm2: times.map((time, index) => { const ratio = 0.32 + 0.09 * Math.cos(index / 1.6); return { time, km2: Number((areaKm2 * ratio).toFixed(3)), ratio: Number(ratio.toFixed(4)) }; }) }
      : {}),
  };
}

export const areaStatsApi = {
  async get(datasetId: string, body: AreaStatsRequest): Promise<AreaStats> {
    if (useMockApi) return demoAreaStats(datasetId, body);
    const raw = await request<unknown>(BACKOFFICE_API_BASE_URL, `/api/v1/datasets/${encodeURIComponent(datasetId)}/area-stats`, { method: 'POST', body: JSON.stringify(body) });
    return normalizeAreaStats(raw, { datasetId, variable: body.variable });
  },
};

/** Per-time table as CSV (UTF-8 with BOM so spreadsheet apps read Korean headers). */
export function areaStatsCsv(stats: AreaStats, headers: { time: string; mean: string; min: string; max: string; std: string; validCount: string; validArea: string; waterArea: string; waterRatio: string }): string {
  const water = new Map((stats.waterAreaKm2 ?? []).map((item) => [item.time, item]));
  const hasWater = water.size > 0;
  const cell = (value: number | null | undefined) => (value == null ? '' : String(value));
  const rows = [
    [headers.time, headers.mean, headers.min, headers.max, headers.std, headers.validCount, headers.validArea, ...(hasWater ? [headers.waterArea, headers.waterRatio] : [])],
    ...stats.series.map((point) => [point.time, cell(point.mean), cell(point.min), cell(point.max), cell(point.std), cell(point.validCount), cell(point.validAreaKm2), ...(hasWater ? [cell(water.get(point.time)?.km2), cell(water.get(point.time)?.ratio)] : [])]),
  ];
  // Times only in the water list (no stats row) are still listed.
  if (hasWater) for (const item of stats.waterAreaKm2 ?? []) if (!stats.series.some((point) => point.time === item.time)) rows.push([item.time, '', '', '', '', '', '', cell(item.km2), cell(item.ratio)]);
  const quote = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  return `﻿${rows.map((row) => row.map(quote).join(',')).join('\n')}\n`;
}
