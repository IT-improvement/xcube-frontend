import { ApiError, request, session } from './httpClient';

export const GENERATION_API_BASE_URL = process.env.REACT_APP_GENERATION_API_URL ?? 'http://localhost:8083';
export const BACKOFFICE_API_BASE_URL = process.env.REACT_APP_BACKOFFICE_API_URL ?? 'http://localhost:8082';
export type GeeCollection = { id: string; name?: string; title?: string; bands: Array<string | { id?: string; name: string; description?: string }> };
export type GenerationJob = { id: string | number; status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'; [key: string]: unknown };
export type BandStyle = { variable: string; colorBar: string; valueMin: number; valueMax: number };
export type RgbStyle = { red: { variable: string; valueMin: number; valueMax: number }; green: { variable: string; valueMin: number; valueMax: number }; blue: { variable: string; valueMin: number; valueMax: number } };
export type ColorBarOption = { id: string; category?: string; preview?: string };
export type SpatialInspection = { sourceType: 'GEOTIFF' | 'SHAPEFILE' | 'CAS500'; fileName: string; bands: string[]; bounds: { west: number; south: number; east: number; north: number } | null; width?: number; height?: number; files: string[]; message: string };

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
