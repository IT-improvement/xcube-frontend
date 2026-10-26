// Result export jobs (UR-63 F2). Contract: docs/PM/codex-prompts/FX-contract.md "F2 결과 내보내기".
// The map PNG is made in the browser (src/views/Viewer/mapPng.ts); GeoTIFF, animation and the report PDF are
// Data Generation jobs: POST /api/v1/exports → job (the usual job shape), progress through the job summary,
// the file from GET /api/v1/exports/{jobId}/file (owner only, Content-Disposition).
import { useMockApi } from './index';
import { ApiError, errorFromBody, refreshSession, request, session } from './httpClient';
import { GENERATION_API_BASE_URL } from './generationApi';
import type { JobSummary } from './generationApi';
import type { GeoPolygon } from './areaStats';

export type ExportKind = 'GEOTIFF' | 'ANIMATION' | 'REPORT';
export type ExportRequest = {
  datasetId: number | string;
  kind: ExportKind;
  /** A variable, or "rgb" for the RGB composite. */
  variable: string;
  times: string[] | 'all';
  /** [west, south, east, north] in EPSG:4326. */
  bbox?: [number, number, number, number];
  /** REPORT: area statistics of this shape go into the report. */
  geometry?: GeoPolygon;
  format?: 'gif' | 'mp4';
  /** ANIMATION: frames per second, 1–10. */
  fps?: number;
  title?: string;
};
/** Facts of a finished export (Data Generation job summary `export`; null for other jobs). */
export type ExportFacts = { fileName?: string; contentType?: string; sizeBytes?: number; expiresAt?: string; expired?: boolean; downloadPath?: string; frames?: number; pages?: number; width?: number; height?: number };
export type ExportJob = JobSummary & { type: 'EXPORT_GEOTIFF' | 'EXPORT_ANIMATION' | 'EXPORT_REPORT' | string; export?: ExportFacts | null };
export type ExportFile = { blob: Blob; fileName: string };

export const EXPORT_LIMITS = { maxFrames: 120, fpsMin: 1, fpsMax: 10 } as const;
export const isExportRunning = (job?: Pick<JobSummary, 'status'> | null) => job?.status === 'QUEUED' || job?.status === 'RUNNING';

/** File name from a Content-Disposition header (RFC 5987 `filename*=` first). */
export function fileNameFrom(disposition: string | null | undefined, fallback: string): string {
  if (!disposition) return fallback;
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(disposition);
  if (star) {
    try { return decodeURIComponent(star[1].trim().replace(/^"|"$/g, '')); } catch { /* fall through */ }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/.exec(disposition);
  return plain ? plain[1].trim() : fallback;
}

const EXTENSION: Record<ExportKind, string> = { GEOTIFF: 'tif', ANIMATION: 'gif', REPORT: 'pdf' };
export const exportFallbackName = (kind: ExportKind, format?: string) => `xcube_export.${kind === 'ANIMATION' && format ? format : EXTENSION[kind]}`;

async function fetchFile(path: string): Promise<Response> {
  const token = session.getToken();
  const go = (value: string | null) => fetch(`${GENERATION_API_BASE_URL}${path}`, { headers: value ? { Authorization: `Bearer ${value}` } : {} });
  let response: Response;
  try { response = await go(token); } catch { throw new ApiError(0, 'NETWORK_ERROR', '서버에 연결할 수 없습니다.'); }
  if (response.status === 401 && token && session.getToken() === token) {
    try { response = await go(await refreshSession()); } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(0, 'NETWORK_ERROR', '서버에 연결할 수 없습니다.');
    }
  }
  if (!response.ok) {
    let body = {};
    try { body = await response.json(); } catch { /* binary error */ }
    throw errorFromBody(response.status, body, response.statusText);
  }
  return response;
}

// --- Demo (REACT_APP_USE_MOCK_API): jobs that finish after a few polls and hand back a tiny file.
type DemoJob = ExportJob & { polls: number; request: ExportRequest };
const demoJobs: DemoJob[] = [];
const pause = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const TYPE: Record<ExportKind, ExportJob['type']> = { GEOTIFF: 'EXPORT_GEOTIFF', ANIMATION: 'EXPORT_ANIMATION', REPORT: 'EXPORT_REPORT' };
const view = (job: DemoJob): ExportJob => { const { polls, request: input, ...rest } = job; void polls; void input; return { ...rest }; };

export const exportsDemo = {
  async create(input: ExportRequest): Promise<ExportJob> {
    await pause(250);
    const job: DemoJob = {
      id: `demo-export-${demoJobs.length + 1}`,
      name: input.title || `export-${demoJobs.length + 1}`,
      type: TYPE[input.kind],
      status: 'QUEUED',
      progress: 0,
      stage: 'QUEUED',
      createdAt: new Date().toISOString(),
      input: { ...input },
      polls: 0,
      request: input,
    };
    demoJobs.unshift(job);
    return view(job);
  },
  async get(id: string | number): Promise<ExportJob> {
    await pause(200);
    const job = demoJobs.find((item) => item.id === String(id));
    if (!job) throw new ApiError(404, 'JOB_NOT_FOUND', '작업을 찾을 수 없습니다.');
    if (job.status === 'CANCELLED') return view(job);
    job.polls += 1;
    job.progress = Math.min(100, job.polls * 34);
    job.status = job.progress >= 100 ? 'SUCCEEDED' : 'RUNNING';
    job.stage = job.status === 'SUCCEEDED' ? 'DONE' : 'RENDERING';
    if (job.status === 'SUCCEEDED') {
      job.finishedAt = new Date().toISOString();
      job.export = { fileName: exportFallbackName(job.request.kind, job.request.format).replace('xcube_export', `xcube_demo_${job.id}`), sizeBytes: 2048, expiresAt: new Date(Date.now() + 7 * 864e5).toISOString(), expired: false, downloadPath: `/api/v1/exports/${job.id}/file` };
    }
    return view(job);
  },
  async cancel(id: string | number) {
    await pause(120);
    const job = demoJobs.find((item) => item.id === String(id));
    if (job) Object.assign(job, { status: 'CANCELLED', finishedAt: new Date().toISOString() });
  },
  async file(id: string | number): Promise<ExportFile> {
    await pause(150);
    const job = demoJobs.find((item) => item.id === String(id));
    const kind = job?.request.kind ?? 'GEOTIFF';
    return { blob: new Blob([`XCube demo export ${id}`], { type: 'application/octet-stream' }), fileName: exportFallbackName(kind, job?.request.format).replace('xcube_export', `xcube_demo_${id}`) };
  },
};

export const exportsApi = {
  create(input: ExportRequest): Promise<ExportJob> {
    if (useMockApi) return exportsDemo.create(input);
    const datasetId = typeof input.datasetId === 'string' && /^\d+$/.test(input.datasetId) ? Number(input.datasetId) : input.datasetId;
    return request<ExportJob>(GENERATION_API_BASE_URL, '/api/v1/exports', { method: 'POST', body: JSON.stringify({ ...input, datasetId }) });
  },
  /** Progress: export jobs are Data Generation jobs, so the job center's summary endpoint answers for them. */
  get(id: string | number): Promise<ExportJob> {
    if (useMockApi) return exportsDemo.get(id);
    return request<ExportJob>(GENERATION_API_BASE_URL, `/api/v1/generation-jobs/${encodeURIComponent(String(id))}/summary`);
  },
  cancel(id: string | number): Promise<unknown> {
    if (useMockApi) return exportsDemo.cancel(id);
    return request<unknown>(GENERATION_API_BASE_URL, `/api/v1/generation-jobs/${encodeURIComponent(String(id))}/cancel`, { method: 'POST' });
  },
  async file(id: string | number, fallbackName: string): Promise<ExportFile> {
    if (useMockApi) return exportsDemo.file(id);
    const response = await fetchFile(`/api/v1/exports/${encodeURIComponent(String(id))}/file`);
    // The server names the file (Content-Disposition); the job summary's export.fileName is the fallback the caller passes.
    return { blob: await response.blob(), fileName: fileNameFrom(response.headers.get('content-disposition'), fallbackName) };
  },
};

/** Saves a blob under a name (an object URL on a temporary link). */
export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
