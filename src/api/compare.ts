// Comparison analysis (UR-63 F3, S9). Contract: docs/PM/codex-prompts/FX-contract.md "F3 비교 분석 S9".
// POST {Data Analysis}/api/v1/compare runs a comparison; its result is a new Zarr (kind COMPARISON, categorical
// variable `class`, same grid as the input) registered in Backoffice, with the metrics in the job result and in the
// Zarr attributes. This file holds the client, the class colours (the map and every legend use the same ones),
// and the reading of a COMPARISON dataset's metrics. The Viewer and the S9 page share it.
import { useMockApi } from './index';
import { ApiError, request } from './httpClient';
import { ANALYSIS_API_BASE_URL } from './analysisApi';
import type { JobSummary } from './generationApi';
import { DEMO_COMPARISONS } from './compareDemo';
export { DEMO_COMPARISONS };

export type ComparisonType = 'TIME_CHANGE' | 'MODEL_COMPARE' | 'REFERENCE';
export const COMPARISON_TYPES: ComparisonType[] = ['TIME_CHANGE', 'MODEL_COMPARE', 'REFERENCE'];
export type CompareRequest =
  | { type: 'TIME_CHANGE'; resultId: number | string; t1: string; t2: string; name?: string; projectId?: number | string | null }
  | { type: 'MODEL_COMPARE'; aId: number | string; bId: number | string; time: string; name?: string; projectId?: number | string | null }
  | { type: 'REFERENCE'; resultId: number | string; time: string; reference: 'water_gt' | { shapefileDatasetId: number | string }; name?: string; projectId?: number | string | null };
export type CompareJob = JobSummary & {
  /** TIME_CHANGE | MODEL_COMPARE | REFERENCE (Data Analysis `compareType`). */
  compareType?: ComparisonType | string;
  /** Metrics and the recorded comparison (types, times, inputs, classes) once finished; read them with {@link comparisonInfo}. */
  metrics?: Record<string, unknown> | null;
  comparison?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
};
/** POST /api/v1/compare/check: times, grid, estimated size and quota without running. */
export type CompareCheck = { type?: string; times?: Record<string, string>; grid?: { width: number; height: number; bbox: number[] }; estimatedBytes?: number; quota?: { usedBytes: number; limitBytes: number; allowed: boolean }; blockers?: unknown[]; warnings?: unknown[] };

/** One class of the `class` variable: its code, colour and the dictionary key of its name. */
export type ComparisonClass = { code: number; color: string; key: 'unchanged' | 'kept' | 'gained' | 'lost' | 'neither' | 'both' | 'onlyA' | 'onlyB' | 'tn' | 'tp' | 'fp' | 'fn' };
/** Colours fixed by the contract; code 0 is transparent on the map. */
export const COMPARISON_CLASSES: Record<ComparisonType, ComparisonClass[]> = {
  TIME_CHANGE: [
    { code: 1, color: '#3fb4ff', key: 'kept' },
    { code: 2, color: '#1a9850', key: 'gained' },
    { code: 3, color: '#d73027', key: 'lost' },
  ],
  MODEL_COMPARE: [
    { code: 1, color: '#3fb4ff', key: 'both' },
    { code: 2, color: '#7b3294', key: 'onlyA' },
    { code: 3, color: '#e08214', key: 'onlyB' },
  ],
  REFERENCE: [
    { code: 1, color: '#3fb4ff', key: 'tp' },
    { code: 2, color: '#d73027', key: 'fp' },
    { code: 3, color: '#fdae61', key: 'fn' },
  ],
};
/** Class 0 of each type (drawn transparent). */
export const COMPARISON_ZERO: Record<ComparisonType, ComparisonClass['key']> = { TIME_CHANGE: 'unchanged', MODEL_COMPARE: 'neither', REFERENCE: 'tn' };

/** The xcube colour map of a comparison (categorical JSON, as the AI water mask): only codes 1–3 are painted. */
export const comparisonStyle = (type: ComparisonType) => ({
  cmap: JSON.stringify({ name: `xcube_compare_${type.toLowerCase()}`, type: 'categorical', colors: COMPARISON_CLASSES[type].map((item) => [item.code, item.color]) }),
});

export type ComparisonMetrics = {
  /** TIME_CHANGE */
  areaKm2?: { kept?: number | null; gained?: number | null; lost?: number | null };
  changeRate?: number | null;
  /** MODEL_COMPARE */
  iou?: number | null;
  dice?: number | null;
  agreement?: number | null;
  areaDiffKm2?: number | null;
  /** REFERENCE */
  precision?: number | null;
  recall?: number | null;
  f1?: number | null;
  kappa?: number | null;
  confusion?: { tp?: number | null; fp?: number | null; fn?: number | null; tn?: number | null };
};
export type ComparisonInfo = {
  type: ComparisonType | null;
  metrics: ComparisonMetrics;
  /** Inputs as the analysis recorded them (ids and times). */
  resultId?: string; aId?: string; bId?: string; t1?: string; t2?: string; time?: string; reference?: string;
  sourceDatacubeId?: string;
};

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const str = (value: unknown) => (value == null || value === '' ? undefined : String(value));
const typeOf = (value: unknown): ComparisonType | null => {
  const text = String(value ?? '').toUpperCase();
  return (COMPARISON_TYPES as string[]).includes(text) ? (text as ComparisonType) : null;
};

/**
 * Reads the comparison of a COMPARISON dataset or a finished compare job leniently: the metrics may sit at the top
 * or under `metrics`, the inputs at the top or under `input`/`inputs`. Missing numbers stay null.
 */
export function comparisonInfo(raw: unknown): ComparisonInfo {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const metrics = (value.metrics && typeof value.metrics === 'object' ? value.metrics : value) as Record<string, any>;
  // Data Analysis records `inputs` as [{role: result|a|b|reference, datacubeId}] and the times at the top (t1, t2, time).
  const roles: Record<string, any> = Array.isArray(value.inputs)
    ? Object.fromEntries(value.inputs.filter((item: any) => item && typeof item === 'object').map((item: any) => [String(item.role), item.datacubeId]))
    : {};
  const input = (value.input && typeof value.input === 'object' && !Array.isArray(value.input) ? value.input : value) as Record<string, any>;
  const area = metrics.areaKm2 ?? value.areaKm2;
  const confusion = metrics.confusion ?? value.confusion;
  const reference = input.reference ?? value.reference;
  return {
    type: typeOf(value.type ?? value.comparisonType ?? input.type),
    metrics: {
      ...(area && typeof area === 'object' ? { areaKm2: { kept: num(area.kept), gained: num(area.gained), lost: num(area.lost) } } : {}),
      changeRate: num(metrics.changeRatio ?? metrics.changeRate ?? metrics.rate),
      iou: num(metrics.iou ?? metrics.IoU),
      dice: num(metrics.dice),
      agreement: num(metrics.agreement),
      areaDiffKm2: num(metrics.areaDiffKm2),
      precision: num(metrics.precision),
      recall: num(metrics.recall),
      f1: num(metrics.f1),
      kappa: num(metrics.kappa),
      ...(confusion && typeof confusion === 'object' ? { confusion: { tp: num(confusion.tp), fp: num(confusion.fp), fn: num(confusion.fn), tn: num(confusion.tn) } } : {}),
    },
    resultId: str(input.resultId ?? roles.result), aId: str(input.aId ?? roles.a), bId: str(input.bId ?? roles.b),
    t1: str(input.t1 ?? value.t1), t2: str(input.t2 ?? value.t2), time: str(input.time ?? value.time),
    reference: typeof reference === 'string' ? reference : reference?.shapefileDatasetId != null ? `shapefile:${reference.shapefileDatasetId}` : roles.reference != null ? `shapefile:${roles.reference}` : undefined,
    sourceDatacubeId: str(value.sourceDatacubeId ?? input.sourceDatacubeId),
  };
}

/** Comparison type named by the categorical colour map of `class` (`xcube_compare_time_change` …), when metadata is not at hand. */
export function comparisonTypeFromColorBar(colorBarName?: string | null): ComparisonType | null {
  const match = /xcube_compare_([a-z_]+)/.exec(colorBarName ?? '');
  return match ? typeOf(match[1]) : null;
}

/**
 * The recorded comparison of a COMPARISON dataset, from the compare job that registered it (`registration.datacubeId`).
 * Backoffice's dataset API does not show `metadata.comparison` to users, so the owner's job list is read instead
 * (`{...job.comparison, metrics: job.metrics}`); null when no job of this user made it (e.g. shared with them).
 */
export async function comparisonForDataset(datasetId: string | number): Promise<Record<string, unknown> | null> {
  const jobs = await compareApi.listJobs({ status: 'SUCCEEDED' });
  const job = jobs.find((item) => item.registration?.datacubeId != null && String(item.registration.datacubeId) === String(datasetId));
  if (!job) return null;
  const recorded = (job.comparison ?? job.result ?? {}) as Record<string, unknown>;
  return { ...recorded, type: recorded.type ?? job.compareType, metrics: job.metrics ?? recorded.metrics };
}

/**
 * Address of the S9 page with the Viewer's data filled in. Query (read by `/app/analysis/compare`):
 * `type` (TIME_CHANGE|MODEL_COMPARE|REFERENCE, optional), `source` (original datacube id), `result` (AI result datacube id),
 * `t` (time ISO shown in the Viewer).
 */
export function compareHref(input: { source?: string; result?: string; time?: string; type?: ComparisonType }): string {
  const params = new URLSearchParams();
  if (input.type) params.set('type', input.type);
  if (input.source) params.set('source', input.source);
  if (input.result) params.set('result', input.result);
  if (input.time) params.set('t', input.time);
  const query = params.toString();
  return `/app/analysis/compare${query ? `?${query}` : ''}`;
}

// --- Demo (REACT_APP_USE_MOCK_API)
const demoJobs: CompareJob[] = [];
const pause = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export const compareApi = {
  create(input: CompareRequest): Promise<CompareJob> {
    if (useMockApi)
      return pause(300).then(() => {
        const job: CompareJob = { id: `demo-compare-${demoJobs.length + 1}`, name: input.name ?? `compare-${demoJobs.length + 1}`, type: 'COMPARE', status: 'SUCCEEDED', progress: 100, createdAt: new Date().toISOString(), input: { ...input }, compareType: input.type, comparison: DEMO_COMPARISONS[input.type], metrics: (DEMO_COMPARISONS[input.type] as any).metrics, result: DEMO_COMPARISONS[input.type] };
        demoJobs.unshift(job);
        return job;
      });
    return request<CompareJob>(ANALYSIS_API_BASE_URL, '/api/v1/compare', { method: 'POST', body: JSON.stringify(input) });
  },
  /** A compare job with `metrics`·`comparison`·`registration` (Data Analysis `GET /api/v1/compare/jobs/{id}`). */
  get(id: string | number): Promise<CompareJob> {
    if (useMockApi)
      return pause(150).then(() => {
        const job = demoJobs.find((item) => item.id === String(id));
        if (!job) throw new ApiError(404, 'JOB_NOT_FOUND', '작업을 찾을 수 없습니다.');
        return job;
      });
    return request<CompareJob>(ANALYSIS_API_BASE_URL, `/api/v1/compare/jobs/${encodeURIComponent(String(id))}`);
  },
  /** Checks a request without running it (times, grid, size, quota). */
  check(input: CompareRequest): Promise<CompareCheck> {
    if (useMockApi) return pause(200).then(() => ({ type: input.type, estimatedBytes: 11174720, quota: { usedBytes: 0, limitBytes: 53687091200, allowed: true }, blockers: [], warnings: [] }));
    return request<CompareCheck>(ANALYSIS_API_BASE_URL, '/api/v1/compare/check', { method: 'POST', body: JSON.stringify(input) });
  },
  listJobs(filter: { status?: string } = {}): Promise<CompareJob[]> {
    if (useMockApi) return pause(150).then(() => demoJobs.filter((job) => !filter.status || job.status === filter.status));
    return request<CompareJob[]>(ANALYSIS_API_BASE_URL, `/api/v1/compare/jobs${filter.status ? `?status=${encodeURIComponent(filter.status)}` : ''}`);
  },
  cancel(id: string | number): Promise<unknown> {
    if (useMockApi) return pause(120).then(() => { const job = demoJobs.find((item) => item.id === String(id)); if (job) job.status = 'CANCELLED'; });
    return request<unknown>(ANALYSIS_API_BASE_URL, `/api/v1/compare/jobs/${encodeURIComponent(String(id))}/cancel`, { method: 'POST' });
  },
};
