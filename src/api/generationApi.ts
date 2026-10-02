import { ApiError, request, session } from './httpClient';

export const GENERATION_API_BASE_URL = process.env.REACT_APP_GENERATION_API_URL ?? 'http://localhost:8083';
export const BACKOFFICE_API_BASE_URL = process.env.REACT_APP_BACKOFFICE_API_URL ?? 'http://localhost:8082';
export type GeeCollection = { id: string; name?: string; title?: string; bands: Array<string | { id?: string; name: string; description?: string }> };
export type GenerationJob = { id: string | number; status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'; [key: string]: unknown };
export type JobStatus = GenerationJob['status'];
/** One row of the job center (generation API GET /generation-jobs). */
export type JobSummary = {
  id: string; name: string; type: 'GEE_TO_ZARR' | 'GEOTIFF_BANDS' | 'CAS500' | 'SHAPEFILE' | string; status: JobStatus;
  progress?: number | null; stage?: string | null; createdAt?: string; startedAt?: string | null; finishedAt?: string | null;
  errorCode?: string | null; errorMessage?: string | null;
  registration?: { datacubeId?: number; xcubeDatasetId?: string; error?: string } | null; zarrUri?: string | null;
  input?: Record<string, unknown>;
};
export type BandStyle = { variable: string; colorBar: string; valueMin: number; valueMax: number };
export type RgbStyle = { red: { variable: string; valueMin: number; valueMax: number }; green: { variable: string; valueMin: number; valueMax: number }; blue: { variable: string; valueMin: number; valueMax: number } };
export type ColorBarOption = { id: string; category?: string; preview?: string };
export type ValueStats = { min: number; max: number; p2?: number; p98?: number };
/** Band or attribute details from the inspect API (FR-GEN-10·11). Older servers send only `bands`. */
export type InspectionField = { name: string; type?: 'integer' | 'real' | 'string'; approxStats?: ValueStats; categories?: Array<{ value: string | number; count: number }> };
export type FileInput = { kind?: string; uri?: string; path?: string; fileName?: string; [key: string]: unknown };
export type SpatialInspection = { sourceType: 'GEOTIFF' | 'SHAPEFILE' | 'CAS500'; fileName: string; bands: string[]; fields?: InspectionField[]; bounds: { west: number; south: number; east: number; north: number } | null; width?: number; height?: number; files: string[]; message: string; inputs?: FileInput[] };
/** One output variable of a generation job: only selected bands/attributes become Zarr variables. */
export type VariableSpec = { source: string; name: string; kind: 'continuous' | 'categorical'; style: { colorBar: string; min?: number; max?: number } };
export type FileJobInput = { type: 'GEOTIFF_BANDS' | 'CAS500' | 'SHAPEFILE'; name: string; inputs: FileInput[]; variables: VariableSpec[]; params?: Record<string, unknown>; projectId?: string };

export const generationApi = {
  async getCollections(): Promise<GeeCollection[]> {
    const body = await request<GeeCollection[] | { collections: GeeCollection[] }>(GENERATION_API_BASE_URL, '/api/v1/gee/collections');
    return Array.isArray(body) ? body : body.collections ?? [];
  },
  async getColorBars(): Promise<string[]> {
    const body = await request<string[] | { colorBars?: string[]; items?: Array<string | { id: string }> }>(BACKOFFICE_API_BASE_URL, '/api/v2/xcube-capabilities/colorbars?target=user');
    if (Array.isArray(body)) return body;
    return body.colorBars ?? (body.items ?? []).map((item) => typeof item === 'string' ? item : item.id);
  },
  async getColorBarOptions(): Promise<ColorBarOption[]> {
    const body = await request<{ items?: ColorBarOption[] } | ColorBarOption[]>(BACKOFFICE_API_BASE_URL, '/api/v2/xcube-capabilities/colorbars?target=user');
    return Array.isArray(body) ? body : body.items ?? [];
  },
  createGeeJob(input: { name: string; collectionId: string; bands: string[]; startDate: string; endDate: string; maxCloudPercent: number; bounds: { west: number; south: number; east: number; north: number }; scaleMeters: number; bandStyles: BandStyle[]; rgbStyle?: RgbStyle }) {
    return request<GenerationJob>(GENERATION_API_BASE_URL, '/api/v1/generation-jobs/gee', { method: 'POST', body: JSON.stringify(input) });
  },
  createFileJob(input: FileJobInput) {
    return request<GenerationJob>(GENERATION_API_BASE_URL, '/api/v1/generation-jobs/files', { method: 'POST', body: JSON.stringify(input) });
  },
  listJobs(filter: { status?: string; type?: string } = {}) {
    const params = new URLSearchParams(Object.entries(filter).filter(([, v]) => !!v) as Array<[string, string]>);
    return request<JobSummary[]>(GENERATION_API_BASE_URL, `/api/v1/generation-jobs${params.toString() ? `?${params}` : ''}`);
  },
  jobSummary(id: string) {
    return request<JobSummary>(GENERATION_API_BASE_URL, `/api/v1/generation-jobs/${encodeURIComponent(id)}/summary`);
  },
  retryJob(id: string) {
    return request<JobSummary>(GENERATION_API_BASE_URL, `/api/v1/generation-jobs/${encodeURIComponent(id)}/retry`, { method: 'POST' });
  },
  cancelJob(id: string) {
    return request<unknown>(GENERATION_API_BASE_URL, `/api/v1/generation-jobs/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
  },
  getJob(id: string | number) {
    return request<GenerationJob>(GENERATION_API_BASE_URL, `/api/v1/generation-jobs/${encodeURIComponent(String(id))}`);
  },
  async inspectSpatialFile(type: 'geotiff' | 'shapefile' | 'cas500', file: File): Promise<SpatialInspection> {
    const data = new FormData(); data.append('file', file);
    const token = session.getToken();
    let response: Response;
    try { response = await fetch(`${GENERATION_API_BASE_URL}/api/v1/spatial-files/inspect/${type}`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: data }); }
    catch { throw new ApiError(0, 'NETWORK_ERROR', '서버에 연결할 수 없습니다.'); }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(response.status, body.code ?? `HTTP_${response.status}`, body.message ?? '파일을 검사하지 못했습니다.');
    return body as SpatialInspection;
  },
};
