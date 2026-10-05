// Data Analysis API (수식 융합, M6). Contract: docs/Backend/technical-guide.md "M6 계약".
import { request } from './httpClient';
import type { JobSummary } from './generationApi';

export const ANALYSIS_API_BASE_URL = process.env.REACT_APP_ANALYSIS_API_URL ?? 'http://localhost:8084';

export type Normalization = 'auto' | 'none' | { scale: number; offset: number };
export type FusionBinding = { datacubeId: number | string; variable: string; normalization: Normalization };
export type GridReference = 'coarsest' | 'finest' | 'datacube';
export type Resampling = 'nearest' | 'bilinear' | 'average';
export type ExtentRule = 'intersection' | 'union';
export type TimeMode = 'exact' | 'nearest' | 'aggregate';
export type FusionRequest = {
  name: string;
  formula: string;
  bindings: Record<string, FusionBinding>;
  grid: { reference: GridReference; datacubeId: number | string | null; resampling: Resampling };
  extent: ExtentRule;
  time: { mode: TimeMode; toleranceDays: number | null; period: 'day' | 'month' | 'year' | null; agg: 'mean' | 'max' | 'min' | 'median' | null };
  outputVariable: string;
  projectId: number | string | null;
};

export type FormulaError = { code: string; message: string; position: number; length: number };
export type ValidateResult = { valid: boolean; errors: FormulaError[] };
export type BlockerCode = 'NO_OVERLAP' | 'NO_TIMES' | 'QUOTA_EXCEEDED' | 'FORMULA_INVALID' | 'INPUT_NOT_FOUND' | 'VARIABLE_NOT_FOUND';
/** The contract lists only the codes, so a blocker may arrive as a bare code or as {code, message}. */
export type Blocker = string | { code: string; message?: string };
export type DryRun = {
  times: string[]; timeCount: number;
  grid: { width: number; height: number; resolution: number; bbox: [number, number, number, number] };
  dtype: string; estimatedBytes: number;
  quota: { usedBytes: number; limitBytes: number; allowed: boolean };
  normalization: Array<{ binding: string; sensor?: string | null; band?: string | null; expression?: string | null; applied: boolean }>;
  warnings: string[]; blockers: Blocker[];
};
export type FusionJob = JobSummary & { type: 'FUSION'; input?: Partial<FusionRequest> };

const base = '/api/v1/fusion';
const id = (value: string | number) => encodeURIComponent(String(value));

export const analysisApi = {
  validate(input: { formula: string; variables: string[] }) {
    return request<ValidateResult>(ANALYSIS_API_BASE_URL, `${base}/validate`, { method: 'POST', body: JSON.stringify(input) });
  },
  dryRun(input: FusionRequest) {
    return request<DryRun>(ANALYSIS_API_BASE_URL, `${base}/dry-run`, { method: 'POST', body: JSON.stringify(input) });
  },
  createJob(input: FusionRequest) {
    return request<JobSummary>(ANALYSIS_API_BASE_URL, `${base}/jobs`, { method: 'POST', body: JSON.stringify(input) });
  },
  listJobs(filter: { status?: string } = {}) {
    return request<JobSummary[]>(ANALYSIS_API_BASE_URL, `${base}/jobs${filter.status ? `?status=${encodeURIComponent(filter.status)}` : ''}`);
  },
  getJob(jobId: string | number) {
    return request<JobSummary>(ANALYSIS_API_BASE_URL, `${base}/jobs/${id(jobId)}`);
  },
  cancelJob(jobId: string | number) {
    return request<unknown>(ANALYSIS_API_BASE_URL, `${base}/jobs/${id(jobId)}/cancel`, { method: 'POST' });
  },
  retryJob(jobId: string | number) {
    return request<JobSummary>(ANALYSIS_API_BASE_URL, `${base}/jobs/${id(jobId)}/retry`, { method: 'POST' });
  },
};

/** Normalises blockers to {code, message}; unknown codes keep their code as text. */
export const blockerCode = (blocker: Blocker) => (typeof blocker === 'string' ? blocker : blocker.code);
