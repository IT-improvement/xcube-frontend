import { ApiError, errorFromBody, request, session } from './httpClient';
import type { TKey } from '../i18n/types';
import type { ServerItem, ServerParams } from '../i18n/serverText';

export const GENERATION_API_BASE_URL = process.env.REACT_APP_GENERATION_API_URL ?? 'http://localhost:8083';
export const BACKOFFICE_API_BASE_URL = process.env.REACT_APP_BACKOFFICE_API_URL ?? 'http://localhost:8082';
export type GeeCollection = { id: string; name?: string; title?: string; bands: Array<string | { id?: string; name: string; description?: string }> };
export type GenerationJob = { id: string | number; status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'; [key: string]: unknown };
export type JobStatus = GenerationJob['status'];
/** One row of the job center (generation API GET /generation-jobs). */
export type JobSummary = {
  id: string; name: string; type: 'GEE_TO_ZARR' | 'GEOTIFF_BANDS' | 'CAS500' | 'SHAPEFILE' | string; status: JobStatus;
  progress?: number | null; stage?: string | null; createdAt?: string; startedAt?: string | null; finishedAt?: string | null;
  /** Why it failed: `errorCode` with `errorParams` (UR-53 stage 5), and the Korean `errorMessage`. */
  errorCode?: string | null; errorMessage?: string | null; errorParams?: ServerParams;
  registration?: { datacubeId?: number | string; xcubeDatasetId?: string; error?: string; errorCode?: string | null; errorParams?: ServerParams } | null; zarrUri?: string | null;
  warnings?: string[]; warningItems?: ServerItem[];
  input?: Record<string, unknown>;
};
export type BandStyle = { variable: string; colorBar: string; valueMin: number; valueMax: number };
export type RgbStyle = { red: { variable: string; valueMin: number; valueMax: number }; green: { variable: string; valueMin: number; valueMax: number }; blue: { variable: string; valueMin: number; valueMax: number } };
export type ColorBarOption = { id: string; category?: string; preview?: string };
export type ValueStats = { min: number; max: number; p2?: number; p98?: number };
/** Band or attribute details from the inspect API (FR-GEN-10·11). Older servers send only `bands`. */
export type InspectionField = { name: string; type?: 'integer' | 'real' | 'string'; approxStats?: ValueStats; categories?: Array<{ value: string | number; count: number }> };
export type FileInput = { kind?: string; uri?: string; path?: string; fileName?: string; [key: string]: unknown };
/** What the inspect API reads: the existing file kinds and the satellite product packages (UR-55). */
export type InspectType = 'geotiff' | 'shapefile' | 'cas500' | 'sentinel2' | 'landsat';
/** A product package's band (Backend guide "위성 원본 제품 업로드"): `name` is the registry name AI and band math use. */
export type ProductBand = { source: string; name: string; resolution: number; kind: 'continuous' | 'categorical'; default: boolean;
  /** Not in the contract yet; used for the display range when a server sends it. */
  approxStats?: ValueStats };
/** `footprint` is an EPSG:4326 bbox; both `[w, s, e, n]` and `{west, south, east, north}` are read. */
export type ProductInfo = {
  sensor: 'SENTINEL2_L2A' | 'LANDSAT_C2_L2' | string; platform: string; productId: string; acquiredAt: string;
  tile?: string | null; pathRow?: string | null; processingBaseline?: string | null; boaAddOffset?: number | null; cloudCover?: number | null;
  footprint?: Bbox | { west: number; south: number; east: number; north: number } | null;
  bands: ProductBand[];
};
export type SpatialInspection = { sourceType: 'GEOTIFF' | 'SHAPEFILE' | 'CAS500' | 'SENTINEL2_L2A' | 'LANDSAT_C2L2' | string; fileName: string; bands: string[]; fields?: InspectionField[]; bounds: { west: number; south: number; east: number; north: number } | null; width?: number; height?: number; files: string[]; message: string; inputs?: FileInput[];
  /** `GEOTIFF_CHECKED`·`SHAPEFILE_CHECKED`·`CAS500_CHECKED` with values (UR-53 stage 5); older servers send only `message`. */
  messageCode?: string; messageParams?: ServerParams;
  /** Satellite product packages only (`SENTINEL2_CHECKED`·`LANDSAT_CHECKED`). */
  product?: ProductInfo };
/** One output variable of a generation job: only selected bands/attributes become Zarr variables. */
export type VariableSpec = { source: string; name: string; kind: 'continuous' | 'categorical'; style: { colorBar: string; min?: number; max?: number } };
export type FileJobType = 'GEOTIFF_BANDS' | 'CAS500' | 'SHAPEFILE' | 'SENTINEL2_L2A' | 'LANDSAT_C2L2';
export type FileJobInput = { type: FileJobType; name: string; inputs: FileInput[]; variables: VariableSpec[]; params?: Record<string, unknown>; projectId?: string };


/** GEE area of interest (AOI), Backend guide "GEE 관심 영역(AOI)". */
export type Bbox = [number, number, number, number];
export type AreaGeometry = { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown };
export type AreaRequest = {
  mode: 'point' | 'box' | 'shape' | 'admin';
  point?: { lon: number; lat: number; sizeKm: number };
  box?: { west: number; south: number; east: number; north: number };
  shape?: { areaId: string | number };
  admin?: { code: string; level: 'sido' | 'sigungu' };
  clip: 'bbox' | 'shape';
  fullCoverOnly: boolean;
  maskVariable: boolean;
};
export type SavedArea = { id: string | number; name: string; bbox: Bbox; areaKm2: number; geojson?: AreaGeometry; source?: 'upload' | 'shape_dataset' | 'drawn'; createdAt?: string };
export type AdminLevel = 'sido' | 'sigungu';
export type AdminArea = { code: string; level: AdminLevel; name: string; parentCode?: string | null; parentName?: string | null; bbox: Bbox; areaKm2: number; geojson?: AreaGeometry };
/** `attributionCode` (`SGIS_ADMDONGKOR`) names the boundary source; older servers send only the Korean `attribution`. */
export type AdminSearch = { items: AdminArea[]; attribution?: string; attributionCode?: string };
/** `POST /areas` answers either with the saved area or, when the Shapefile holds several polygons, with the choices to make. */
export type AreaChoice = { polygonCount: number; attributes: Array<{ name: string; values?: Array<string | number> }> };
export type AreaUpload = { area: SavedArea; choice?: undefined } | { area?: undefined; choice: AreaChoice };
export type AreaPick = { dissolve?: boolean; attribute?: string; value?: string };
export type EstimateBlocker = string | { code: string; message?: string; params?: ServerParams };
/** Sentinel-1 pairing for an S2 request (Backend guide "GEE Sentinel-1 짝 맞춤", UR-41): location first, the date only needs to be near. */
export type OrbitPass = 'ANY' | 'ASCENDING' | 'DESCENDING';
export type SarPairing = { enabled: boolean; maxDaysApart: number; orbitPass: OrbitPass; minCoverage: number; dropUnpaired: boolean };
export type WaterReference = { enabled: boolean; occurrenceThreshold: number };
/** One S2 time of the estimate and the S1 pass picked for it (`s1Date` null = no pass covers the area within `maxDaysApart`). */
export type SarPair = { s2Date: string; s1Date: string | null; daysApart?: number | null; orbitPass?: string | null; coverage?: number | null };
/** One UTC date of the estimate (Backend guide "GEE 날짜 고르기", UR-43): scenes of that date are merged into one time. `s1` only with pairing (null = no pass). */
export type EstimateDate = {
  date: string; time?: string; sceneCount: number; cloudPercent: number | null; coverage: number;
  /** Share of the area the mask drops on that date (cloud, shadow, snow…), percent; null/absent when unknown (UR-47). */
  noisePercent?: number | null;
  s1?: { date: string; daysApart: number; orbitPass?: string | null; coverage?: number | null } | null;
};
export type GeeEstimate = { excludedDates?: { date: string; coverage: number }[];
  bounds?: { west: number; south: number; east: number; north: number }; areaKm2: number; grid: { width: number; height: number }; scenes: number | null; estimatedBytes: number; requestTiles: number; warnings: string[]; blockers: EstimateBlocker[];
  /** The same lists with values (UR-53 stage 5); older servers send only the strings. */
  warningItems?: ServerItem[]; blockerItems?: Array<{ code: string; message?: string; params?: ServerParams }>;
  pairs?: SarPair[]; pairedCount?: number; unpairedCount?: number;
  /** Every date in the period (older servers send none). */
  dates?: EstimateDate[]; bytesPerDate?: number; estimatedSeconds?: number;
};
export type GeeJobBody = { name: string; collectionId: string; bands: string[]; startDate: string; endDate: string; maxCloudPercent: number; bounds: { west: number; south: number; east: number; north: number }; area?: AreaRequest; scaleMeters: number; bandStyles: BandStyle[]; rgbStyle?: RgbStyle; variables?: VariableSpec[]; sarPairing?: SarPairing; waterReference?: WaterReference;
  /** Only the picked dates (`YYYY-MM-DD`, sorted); omitted = every date, as before. */
  selectedDates?: string[] };

/** A failed upload; with no server sentence, `fallback` (a dictionary key) words it. */
function uploadError(status: number, body: any, fallback: TKey) {
  const error = errorFromBody(status, body);
  if (!body?.message) error.fallbackKey = fallback;
  return error;
}

/** Upload progress of one request body (bytes sent so far and in all). */
export type UploadProgress = { loaded: number; total: number };
/**
 * Progress and cancel for a file upload (audit W9). With either one the upload goes through XMLHttpRequest
 * (fetch can't report upload progress); the request itself (path, headers, form fields) is the same.
 * Cancelling rejects with a DOMException named `AbortError`, as fetch does.
 */
export type UploadOptions = { onProgress?: (progress: UploadProgress) => void; signal?: AbortSignal };
export const isAbortError = (error: unknown) => (error as { name?: unknown } | null)?.name === 'AbortError';
const abortError = () => (typeof DOMException !== 'undefined' ? new DOMException('Upload cancelled', 'AbortError') : Object.assign(new Error('Upload cancelled'), { name: 'AbortError' }));
const bodySize = (data: FormData) => {
  let size = 0;
  data.forEach((value) => { size += typeof value === 'string' ? value.length : value.size; });
  return size;
};

/** POST `data` with XHR so the sent bytes can be reported and the upload aborted. Resolves with status and JSON body. */
function sendWithProgress(url: string, data: FormData, token: string | null, options: UploadOptions): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) { reject(abortError()); return; }
    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    const done = () => options.signal?.removeEventListener('abort', onAbort);
    xhr.open('POST', url);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (event) => options.onProgress?.({ loaded: event.loaded, total: event.lengthComputable && event.total ? event.total : bodySize(data) });
    xhr.onload = () => {
      done();
      let body: any = {};
      try { body = xhr.responseText ? JSON.parse(xhr.responseText) : {}; } catch { body = {}; }
      resolve({ status: xhr.status, body });
    };
    xhr.onerror = () => { done(); reject(new ApiError(0, 'NETWORK_ERROR', '서버에 연결할 수 없습니다.')); };
    xhr.onabort = () => { done(); reject(abortError()); };
    options.signal?.addEventListener('abort', onAbort);
    xhr.send(data);
  });
}

async function multipart<T>(path: string, data: FormData, fallback: TKey, accept: (status: number, body: any) => T | undefined, options: UploadOptions = {}): Promise<T> {
  const token = session.getToken();
  const url = `${GENERATION_API_BASE_URL}${path}`;
  let status: number;
  let body: any;
  if ((options.onProgress || options.signal) && typeof XMLHttpRequest !== 'undefined') {
    ({ status, body } = await sendWithProgress(url, data, token, options));
  } else {
    let response: Response;
    try { response = await fetch(url, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: data }); }
    catch { throw new ApiError(0, 'NETWORK_ERROR', '서버에 연결할 수 없습니다.'); }
    status = response.status;
    body = await response.json().catch(() => ({}));
  }
  const accepted = accept(status, body);
  if (accepted !== undefined) return accepted;
  throw uploadError(status, body, fallback);
}
const areaResult = (status: number, body: any): AreaUpload | undefined => {
  if (status >= 200 && status < 300) return { area: body as SavedArea };
  if (Array.isArray(body?.attributes) || typeof body?.polygonCount === 'number') return { choice: { polygonCount: body.polygonCount ?? 0, attributes: body.attributes ?? [] } };
  return undefined;
};

export const generationApi = {
  /** `signal` lets the wizard drop a request whose inputs changed (the body is unchanged). */
  estimateGee(input: GeeJobBody, signal?: AbortSignal) {
    return request<GeeEstimate>(GENERATION_API_BASE_URL, '/api/v1/generation-jobs/gee/estimate', { method: 'POST', body: JSON.stringify(input), signal });
  },
  async searchAdminAreas(query: string, level?: AdminLevel): Promise<AdminSearch> {
    const params = new URLSearchParams({ q: query });
    if (level) params.set('level', level);
    const body = await request<AdminArea[] | AdminSearch>(GENERATION_API_BASE_URL, `/api/v1/admin-areas?${params}`);
    return Array.isArray(body) ? { items: body } : { items: body.items ?? [], attribution: body.attribution, attributionCode: body.attributionCode };
  },
  getAdminArea(code: string) {
    return request<AdminArea>(GENERATION_API_BASE_URL, `/api/v1/admin-areas/${encodeURIComponent(code)}`);
  },
  async listAreas(): Promise<SavedArea[]> {
    const body = await request<SavedArea[] | { items: SavedArea[] }>(GENERATION_API_BASE_URL, '/api/v1/areas');
    return Array.isArray(body) ? body : body.items ?? [];
  },
  getArea(id: string | number) {
    return request<SavedArea>(GENERATION_API_BASE_URL, `/api/v1/areas/${encodeURIComponent(String(id))}`);
  },
  deleteArea(id: string | number) {
    return request<unknown>(GENERATION_API_BASE_URL, `/api/v1/areas/${encodeURIComponent(String(id))}`, { method: 'DELETE' });
  },
  uploadArea(file: File, name: string, pick: AreaPick = {}, options: UploadOptions = {}): Promise<AreaUpload> {
    const data = new FormData();
    data.append('file', file); data.append('name', name);
    if (pick.dissolve) data.append('dissolve', 'true');
    if (pick.attribute) { data.append('attribute', pick.attribute); data.append('value', pick.value ?? ''); }
    return multipart('/api/v1/areas', data, 'wizard.upload.areaSaveFailed', areaResult, options);
  },
  areaFromJob(jobId: string | number, name: string, pick: AreaPick = {}): Promise<AreaUpload> {
    const data = new FormData();
    data.append('name', name);
    if (pick.dissolve) data.append('dissolve', 'true');
    if (pick.attribute) { data.append('attribute', pick.attribute); data.append('value', pick.value ?? ''); }
    return multipart(`/api/v1/areas/from-job/${encodeURIComponent(String(jobId))}`, data, 'wizard.upload.areaImportFailed', areaResult);
  },
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
  createGeeJob(input: GeeJobBody) {
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
  /** Upload a file and read it (the existing kinds and, UR-55, `sentinel2`·`landsat` product packages). `options` adds progress and cancel. */
  inspectSpatialFile(type: InspectType, file: File, options: UploadOptions = {}): Promise<SpatialInspection> {
    const data = new FormData(); data.append('file', file);
    return multipart(`/api/v1/spatial-files/inspect/${type}`, data, 'wizard.upload.inspectFailed', (status, body) => (status >= 200 && status < 300 ? body as SpatialInspection : undefined), options);
  },
};
