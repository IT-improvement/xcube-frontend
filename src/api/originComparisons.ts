// Comparison results of an original (CMP2, UR-64). Contract: docs/PM/codex-prompts/CMP2.md "Backend 계약".
// A comparison (S9) stays a COMPARISON datacube registered in Backoffice so xcube can draw it, but it is no longer
// listed on its own: the Viewer's 결과 비교 on the original lists it with the AI results.
//   GET {Backoffice}/api/v1/datasets/{originId}/comparisons → the COMPARISON results the caller can read whose
//   metadata.originDatacubeId is originId, newest first (404 when the original cannot be read).
// Until Backoffice has this API the answer is null and the Viewer shows the AI results only (no error).
import { useMockApi } from './index';
import { backofficeAdapter, BACKOFFICE_API_BASE_URL } from './backofficeApi';
import { request } from './httpClient';
import { demoManagement, demoOriginComparisons } from './viewerAdapter';
import type { ZarrDataset } from './viewerAdapter';
import { COMPARISON_TYPES, comparisonInfo } from './compare';
import type { ComparisonInfo, ComparisonType } from './compare';

/** One item of the API answer as the server sends it (ids may be numbers). */
export type OriginComparisonDto = {
  id: number | string;
  name: string;
  xcubeDatasetId: string;
  tileBaseUrl?: string | null;
  ownerUserId?: number | string | null;
  accessType?: 'OWNED' | 'SHARED' | string;
  isExample?: boolean;
  createdAt?: string;
  compareType?: ComparisonType | string | null;
  times?: { t1?: string | null; t2?: string | null; time?: string | null };
  sources?: Array<{ id: number | string; name?: string; role?: string }>;
  metrics?: Record<string, unknown> | null;
  areaKm2?: Record<string, unknown> | null;
  variables?: Array<{ name: string }>;
  bbox?: number[] | null;
  /** Class list recorded at registration: {value, key, label, labelEn, color}; colours equal FX-contract F3. */
  classes?: Array<{ value?: number; key?: string; label?: string; labelEn?: string; color?: string | null }> | null;
};

export type OriginComparison = {
  id: string;
  name: string;
  xcubeDatasetId: string;
  tileBaseUrl?: string;
  ownerUserId?: string;
  accessType?: string;
  isExample: boolean;
  createdAt?: string;
  type: ComparisonType | null;
  times: { t1?: string; t2?: string; time?: string };
  sources: Array<{ id: string; name: string; role: string }>;
  /** Metrics read the same way as a COMPARISON dataset's (shared with ComparisonMetrics). */
  info: ComparisonInfo;
  /** Raw metrics (CSV and the key number). */
  metrics: Record<string, unknown>;
  /** km² by class key (kept, gained, lost, a, b, tp …) when recorded. */
  classAreas: Record<string, number>;
  /** Colour by class key from the server's class list, when it sends one (else the F3 colours). */
  classColors: Record<string, string>;
  /** Time of the class map (its one time coordinate): t2 for a change, else the compared time. */
  mapTime?: string;
  bbox?: [number, number, number, number];
};

const text = (value: unknown) => (value == null || value === '' ? undefined : String(value));
const typeOf = (value: unknown): ComparisonType | null => {
  const name = String(value ?? '').toUpperCase();
  return (COMPARISON_TYPES as string[]).includes(name) ? (name as ComparisonType) : null;
};

/** Reads one item leniently: missing parts stay empty, numbers that are not finite are dropped. */
export function toOriginComparison(dto: OriginComparisonDto): OriginComparison {
  const type = typeOf(dto.compareType);
  const times = { t1: text(dto.times?.t1), t2: text(dto.times?.t2), time: text(dto.times?.time) };
  const metrics = (dto.metrics && typeof dto.metrics === 'object' ? dto.metrics : {}) as Record<string, unknown>;
  const areas = (dto.areaKm2 && typeof dto.areaKm2 === 'object' ? dto.areaKm2 : {}) as Record<string, unknown>;
  const classAreas = Object.fromEntries(Object.entries(areas).filter(([, value]) => typeof value === 'number' && Number.isFinite(value))) as Record<string, number>;
  // A source the caller cannot read comes without its name.
  const sources = (dto.sources ?? []).filter((item) => item && item.id != null).map((item) => ({ id: String(item.id), name: item.name ?? `#${item.id}`, role: item.role ?? '' }));
  const info = comparisonInfo({ type, ...times, metrics: { ...metrics, areaKm2: Object.keys(areas).length ? areas : metrics.areaKm2 } });
  const resultSource = sources.find((item) => item.role === 'result') ?? sources.find((item) => item.role === 'a');
  const bbox = Array.isArray(dto.bbox) && dto.bbox.length === 4 && dto.bbox.every((value) => typeof value === 'number') ? (dto.bbox as [number, number, number, number]) : undefined;
  return {
    id: String(dto.id),
    name: dto.name,
    xcubeDatasetId: dto.xcubeDatasetId,
    tileBaseUrl: text(dto.tileBaseUrl),
    ownerUserId: text(dto.ownerUserId),
    accessType: text(dto.accessType),
    isExample: dto.isExample === true,
    createdAt: text(dto.createdAt),
    type,
    times,
    sources,
    info: { ...info, resultId: info.resultId ?? resultSource?.id, aId: info.aId ?? sources.find((item) => item.role === 'a')?.id, bId: info.bId ?? sources.find((item) => item.role === 'b')?.id },
    metrics,
    classAreas,
    classColors: Object.fromEntries((dto.classes ?? []).filter((entry) => entry?.key && typeof entry.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(entry.color)).map((entry) => [entry.key as string, entry.color as string])),
    mapTime: type === 'TIME_CHANGE' ? times.t2 ?? times.time : times.time ?? times.t2,
    bbox,
  };
}

/** Viewer address of a comparison on its original, the panel open and the comparison on the map. */
export const comparisonViewerHref = (originId: string | number, comparisonId: string | number) =>
  `/app/viewer?dataset=${encodeURIComponent(String(originId))}&tool=result&comparison=${encodeURIComponent(String(comparisonId))}`;

const pause = (ms = 150) => new Promise((resolve) => window.setTimeout(resolve, ms));

export const originComparisonsApi = {
  /**
   * Comparisons of an original, newest first; null when they cannot be read (no such API yet, the original not
   * readable, the network) — callers then show the AI results only and say nothing.
   */
  async list(originId: string, signal?: AbortSignal): Promise<OriginComparison[] | null> {
    try {
      const body = useMockApi
        ? await pause().then(() => demoOriginComparisons(originId))
        : await request<OriginComparisonDto[]>(BACKOFFICE_API_BASE_URL, `/api/v1/datasets/${encodeURIComponent(originId)}/comparisons`, { signal });
      return Array.isArray(body) ? body.map((item) => toOriginComparison(item as OriginComparisonDto)) : null;
    } catch {
      return null;
    }
  },
  /** Dataset detail (`GET /api/v1/datasets/{id}`): still readable for COMPARISON results (old links, S9). */
  detail(id: string): Promise<ZarrDataset> {
    return useMockApi ? demoManagement.getDatasetDetail(id) : backofficeAdapter.getDatasetDetail(id);
  },
  /**
   * Original of a COMPARISON result for an old `/app/viewer?dataset={comparison}` link: `originDatacubeId` when
   * Backoffice tells it, else the original of the AI result it was made from. Undefined when not known.
   */
  async originOf(comparison: ZarrDataset): Promise<string | undefined> {
    if (comparison.originDatacubeId) return comparison.originDatacubeId;
    const recorded = comparisonInfo(comparison.comparison);
    const resultId = comparison.sourceDatacubeId ?? recorded.resultId ?? recorded.aId;
    if (!resultId) return undefined;
    try {
      const result = await originComparisonsApi.detail(resultId);
      if (result.kind === 'AI_RESULT') return result.sourceDatacubeId;
      return result.kind === 'COMPARISON' ? undefined : result.id;
    } catch {
      return undefined;
    }
  },
};

/** Comparison results never show in lists (CMP2); kept as a guard against an older Backoffice answer. */
export const withoutComparisons = <T extends { kind?: string }>(items: T[]): T[] => items.filter((item) => item.kind !== 'COMPARISON');

/** The one number that tells a comparison apart (contract: change % and km², IoU, F1). */
export function keyMetricOf(item: Pick<OriginComparison, 'type' | 'metrics' | 'classAreas'>): { kind: 'change'; ratio: number | null; km2: number | null } | { kind: 'iou' | 'f1'; value: number | null } | null {
  const m = item.metrics as Record<string, any>;
  const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
  if (item.type === 'TIME_CHANGE') {
    const ratio = num(m.changeRatio) ?? (num(m.changePercent) != null ? (m.changePercent as number) / 100 : num(m.changeRate));
    const water = m.waterAreaKm2 as Record<string, unknown> | undefined;
    const fromWater = num(water?.t2) != null && num(water?.t1) != null ? (water!.t2 as number) - (water!.t1 as number) : null;
    const gained = item.classAreas.gained ?? num((m.areaKm2 as any)?.gained);
    const lost = item.classAreas.lost ?? num((m.areaKm2 as any)?.lost);
    const km2 = num(m.netChangeKm2) ?? fromWater ?? (gained != null && lost != null ? gained - lost : null);
    return { kind: 'change', ratio, km2 };
  }
  if (item.type === 'MODEL_COMPARE') return { kind: 'iou', value: num(m.iou ?? m.IoU) };
  if (item.type === 'REFERENCE') return { kind: 'f1', value: num(m.f1) };
  return null;
}

/** Metrics as CSV rows (key, value), nested objects flattened with dots. UTF-8 BOM so spreadsheet apps read Korean. */
export function comparisonCsv(item: OriginComparison): string {
  const rows: Array<[string, string]> = [
    ['name', item.name],
    ['type', item.type ?? ''],
    ...(item.times.t1 ? [['t1', item.times.t1] as [string, string]] : []),
    ...(item.times.t2 ? [['t2', item.times.t2] as [string, string]] : []),
    ...(item.times.time ? [['time', item.times.time] as [string, string]] : []),
  ];
  const walk = (prefix: string, value: unknown) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) Object.entries(value as Record<string, unknown>).forEach(([key, inner]) => walk(prefix ? `${prefix}.${key}` : key, inner));
    else if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') rows.push([prefix, String(value)]);
  };
  walk('', item.metrics);
  Object.entries(item.classAreas).forEach(([key, value]) => rows.push([`areaKm2.${key}`, String(value)]));
  const cell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const seen = new Set<string>();
  const unique = rows.filter(([key]) => (seen.has(key) ? false : (seen.add(key), true)));
  return `﻿${['metric,value', ...unique.map(([key, value]) => `${cell(key)},${cell(value)}`)].join('\n')}\n`;
}
