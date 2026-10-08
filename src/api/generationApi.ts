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
  registration?: { datacubeId?: number | string; xcubeDatasetId?: string; error?: string } | null; zarrUri?: string | null;
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
export type AdminSearch = { items: AdminArea[]; attribution?: string };
/** `POST /areas` answers either with the saved area or, when the Shapefile holds several polygons, with the choices to make. */
export type AreaChoice = { polygonCount: number; attributes: Array<{ name: string; values?: Array<string | number> }> };
export type AreaUpload = { area: SavedArea; choice?: undefined } | { area?: undefined; choice: AreaChoice };
export type AreaPick = { dissolve?: boolean; attribute?: string; value?: string };
export type EstimateBlocker = string | { code: string; message?: string };
/** Sentinel-1 pairing for an S2 request (Backend guide "GEE Sentinel-1 짝 맞춤", UR-41): location first, the date only needs to be near. */
export type OrbitPass = 'ANY' | 'ASCENDING' | 'DESCENDING';
export type SarPairing = { enabled: boolean; maxDaysApart: number; orbitPass: OrbitPass; minCoverage: number; dropUnpaired: boolean };
export type WaterReference = { enabled: boolean; occurrenceThreshold: number };
/** One S2 time of the estimate and the S1 pass picked for it (`s1Date` null = no pass covers the area within `maxDaysApart`). */
export type SarPair = { s2Date: string; s1Date: string | null; daysApart?: number | null; orbitPass?: string | null; coverage?: number | null };
/** One UTC date of the estimate (Backend guide "GEE 날짜 고르기", UR-43): scenes of that date are merged into one time. `s1` only with pairing (null = no pass). */
export type EstimateDate = {
  date: string; time?: string; sceneCount: number; cloudPercent: number | null; coverage: number;
  s1?: { date: string; daysApart: number; orbitPass?: string | null; coverage?: number | null } | null;
};
export type GeeEstimate = {
  bounds?: { west: number; south: number; east: number; north: number }; areaKm2: number; grid: { width: number; height: number }; scenes: number | null; estimatedBytes: number; requestTiles: number; warnings: string[]; blockers: EstimateBlocker[];
  pairs?: SarPair[]; pairedCount?: number; unpairedCount?: number;
  /** Every date in the period (older servers send none). */
  dates?: EstimateDate[]; bytesPerDate?: number; estimatedSeconds?: number;
};
export type GeeJobBody = { name: string; collectionId: string; bands: string[]; startDate: string; endDate: string; maxCloudPercent: number; bounds: { west: number; south: number; east: number; north: number }; area?: AreaRequest; scaleMeters: number; bandStyles: BandStyle[]; rgbStyle?: RgbStyle; variables?: VariableSpec[]; sarPairing?: SarPairing; waterReference?: WaterReference;
  /** Only the picked dates (`YYYY-MM-DD`, sorted); omitted = every date, as before. */
  selectedDates?: string[] };

async function multipart<T>(path: string, data: FormData, fallback: string, accept: (status: number, body: any) => T | undefined): Promise<T> {
  const token = session.getToken();
  let response: Response;
  try { response = await fetch(`${GENERATION_API_BASE_URL}${path}`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: data }); }
  catch { throw new ApiError(0, 'NETWORK_ERROR', '서버에 연결할 수 없습니다.'); }
  const body = await response.json().catch(() => ({}));
  const accepted = accept(response.status, body);
  if (accepted !== undefined) return accepted;
  throw new ApiError(response.status, body.code ?? `HTTP_${response.status}`, body.message ?? fallback);
}
const areaResult = (status: number, body: any): AreaUpload | undefined => {
  if (status >= 200 && status < 300) return { area: body as SavedArea };
  if (Array.isArray(body?.attributes) || typeof body?.polygonCount === 'number') return { choice: { polygonCount: body.polygonCount ?? 0, attributes: body.attributes ?? [] } };
  return undefined;
};

export const generationApi = {
  estimateGee(input: GeeJobBody) {
    return request<GeeEstimate>(GENERATION_API_BASE_URL, '/api/v1/generation-jobs/gee/estimate', { method: 'POST', body: JSON.stringify(input) });
  },
  async searchAdminAreas(query: string, level?: AdminLevel): Promise<AdminSearch> {
    const params = new URLSearchParams({ q: query });
    if (level) params.set('level', level);
    const body = await request<AdminArea[] | AdminSearch>(GENERATION_API_BASE_URL, `/api/v1/admin-areas?${params}`);
    return Array.isArray(body) ? { items: body } : { items: body.items ?? [], attribution: body.attribution };
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
  uploadArea(file: File, name: string, pick: AreaPick = {}): Promise<AreaUpload> {
    const data = new FormData();
    data.append('file', file); data.append('name', name);
    if (pick.dissolve) data.append('dissolve', 'true');
    if (pick.attribute) { data.append('attribute', pick.attribute); data.append('value', pick.value ?? ''); }
    return multipart('/api/v1/areas', data, '영역을 저장하지 못했습니다.', areaResult);
  },
  areaFromJob(jobId: string | number, name: string, pick: AreaPick = {}): Promise<AreaUpload> {
    const data = new FormData();
    data.append('name', name);
    if (pick.dissolve) data.append('dissolve', 'true');
    if (pick.attribute) { data.append('attribute', pick.attribute); data.append('value', pick.value ?? ''); }
    return multipart(`/api/v1/areas/from-job/${encodeURIComponent(String(jobId))}`, data, '영역을 가져오지 못했습니다.', areaResult);
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
