// AI Processing API (수체 추출, M7). Contract: docs/Backend/technical-guide.md "M7 계약".
import { request } from './httpClient';
import type { JobSummary } from './generationApi';
import type { ServerItem } from '../i18n/serverText';

export const AI_API_BASE_URL = process.env.REACT_APP_AI_API_URL ?? 'http://localhost:8085';

export type AiModelInput = { name: string; aliases: string[] };
export type AiModel = {
  id: string; name: string; kind: 'index' | 'deep'; description: string;
  inputs: AiModelInput[]; defaultThreshold: number; note?: string | null;
};
export type AiCheck = {
  ready: boolean; matched: Record<string, string>; missing: string[];
  unitDecisions?: Record<string, string>; timeCount: number;
  grid?: { width: number; height: number }; warnings?: string[];
  /** `warnings` with codes and values, same order (UR-53 stage 5): S1_S2_DATE_GAP, UNIT_DECISION, UNITS_VARY_BY_TIME, MODEL_CHECKPOINT_UNAVAILABLE. */
  warningItems?: ServerItem[];
};
export type AiJobRequest = {
  datacubeId: number | string; modelId: string; threshold?: number;
  timeStart?: string; timeEnd?: string; name?: string; projectId?: number | string | null;
};
export type AiTimeStat = { time: string; waterAreaKm2: number | null; waterRatio: number | null; validAreaKm2?: number | null };
export type AiMetrics = { iou: number; f1: number; precision: number; recall: number };
export type AiCurvePoint = { threshold: number; waterAreaKm2: number | null };
/** Water area per time at thresholds 0.05–0.95 (step 0.05). */
export type AiCurve = Array<{ time: string; points: AiCurvePoint[] }>;
export type AiResearchBest = { threshold: number; iou?: number; f1?: number };
export type AiResult = {
  times: AiTimeStat[];
  thresholdCurve: AiCurve;
  /** Present only when the input had `water_gt`; computed at the threshold the job used. */
  metrics?: { overall?: AiMetrics; times?: Array<AiMetrics & { time: string }> } | null;
  researchBestThreshold?: AiResearchBest | null;
  threshold?: number; modelId?: string;
};
export type AiWaterJob = JobSummary & { input?: Partial<AiJobRequest> & Record<string, unknown>; result?: AiResult | null };

const base = '/api/v1/ai';
const id = (value: string | number) => encodeURIComponent(String(value));
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/**
 * The contract fixes the fields but not every nesting, so a result is read leniently:
 * per-time stats under `times`/`perTime`, the curve as [{time, points[]}] or {thresholds[], times[{time, waterAreaKm2[]}]},
 * metrics under `metrics`/`waterGt`, and `researchBestThreshold` as a number or {threshold, iou, f1}.
 */
export function normalizeResult(raw: unknown): AiResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, any>;
  // AI Processing returns per-time stats under `timeSeries` (each with its own metrics when water_gt exists).
  const stats: any[] = value.timeSeries ?? value.times ?? value.perTime ?? value.timeStats ?? [];
  const times: AiTimeStat[] = Array.isArray(stats)
    ? stats.map((item) => ({ time: String(item.time), waterAreaKm2: num(item.waterAreaKm2), waterRatio: num(item.waterRatio), validAreaKm2: num(item.validAreaKm2) }))
    : [];
  const rawCurve = value.thresholdCurve;
  let thresholdCurve: AiCurve = [];
  if (Array.isArray(rawCurve)) {
    thresholdCurve = rawCurve.map((entry: any) => ({
      time: String(entry.time),
      points: (entry.values ?? entry.points ?? entry.thresholds ?? []).map((point: any) => ({ threshold: Number(point.threshold), waterAreaKm2: num(point.waterAreaKm2) })),
    }));
  } else if (rawCurve && Array.isArray(rawCurve.thresholds)) {
    const thresholds: number[] = rawCurve.thresholds;
    thresholdCurve = (rawCurve.times ?? []).map((entry: any) => ({
      time: String(entry.time),
      points: thresholds.map((threshold, index) => ({ threshold, waterAreaKm2: num(entry.waterAreaKm2?.[index]) })),
    }));
  }
  const rawMetrics = value.metrics ?? value.waterGt ?? value.water_gt ?? null;
  const perTimeMetrics = Array.isArray(stats) ? stats.filter((item) => item?.metrics).map((item) => ({ time: String(item.time), ...item.metrics })) : [];
  // The service sends overall metrics flat ({iou, f1, ...}) and per-time metrics inside timeSeries.
  const metrics = rawMetrics && (rawMetrics.overall || rawMetrics.times)
    ? rawMetrics
    : rawMetrics || perTimeMetrics.length ? { overall: rawMetrics ?? undefined, times: perTimeMetrics } : null;
  const best = value.researchBestThreshold ?? (Array.isArray(stats) ? stats.find((item) => item?.researchBestThreshold)?.researchBestThreshold : undefined);
  const researchBestThreshold: AiResearchBest | null =
    typeof best === 'number' ? { threshold: best } : best && typeof best.threshold === 'number' ? best : null;
  return { times, thresholdCurve, metrics, researchBestThreshold, threshold: num(value.threshold) ?? undefined, modelId: value.modelId };
}

/** Catalog ids arrive as strings; the AI service expects numeric datacube ids. */
const numericId = (id: number | string) => (typeof id === 'string' && /^\d+$/.test(id) ? Number(id) : id);

const withResult = (job: AiWaterJob): AiWaterJob => ({ ...job, result: job.result ? normalizeResult(job.result) : job.result });

export const aiApi = {
  listModels() {
    return request<AiModel[]>(AI_API_BASE_URL, `${base}/models`);
  },
  check(input: { datacubeId: number | string; modelId: string }) {
    return request<AiCheck>(AI_API_BASE_URL, `${base}/check`, { method: 'POST', body: JSON.stringify({ ...input, datacubeId: numericId(input.datacubeId) }) });
  },
  createJob(input: AiJobRequest) {
    return request<AiWaterJob>(AI_API_BASE_URL, `${base}/jobs`, { method: 'POST', body: JSON.stringify({ ...input, datacubeId: numericId(input.datacubeId) }) });
  },
  async listJobs(filter: { status?: string; datacubeId?: string | number } = {}) {
    const params = new URLSearchParams();
    if (filter.status) params.set('status', filter.status);
    if (filter.datacubeId != null && filter.datacubeId !== '') params.set('datacubeId', String(filter.datacubeId));
    const jobs = await request<AiWaterJob[]>(AI_API_BASE_URL, `${base}/jobs${params.toString() ? `?${params}` : ''}`);
    return jobs.map(withResult);
  },
  async getJob(jobId: string | number) {
    return withResult(await request<AiWaterJob>(AI_API_BASE_URL, `${base}/jobs/${id(jobId)}`));
  },
  cancelJob(jobId: string | number) {
    return request<unknown>(AI_API_BASE_URL, `${base}/jobs/${id(jobId)}/cancel`, { method: 'POST' });
  },
  retryJob(jobId: string | number) {
    return request<AiWaterJob>(AI_API_BASE_URL, `${base}/jobs/${id(jobId)}/retry`, { method: 'POST' });
  },
};
