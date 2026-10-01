import { Project, TimePoint, ViewerAdapter, ZarrDataset, AiJob } from './viewerAdapter';
import { request, requestBlob } from './httpClient';
export const BACKOFFICE_API_BASE_URL = process.env.REACT_APP_BACKOFFICE_API_URL ?? 'http://localhost:8082';
export const XCUBE_API_BASE_URL = process.env.REACT_APP_XCUBE_URL ?? 'http://localhost:8080';
type SpringPage<T> = { content: T[]; totalElements: number; totalPages: number; number: number; size: number };
type CatalogPage<T> = { content: T[]; page: number; size: number; totalElements: number; totalPages: number };
type ProjectDto = { id: number; name: string; description?: string; createdAt: string; updatedAt: string; ownerUserId?: number; ownerUsername?: string; accessRole?: 'OWNER' | 'EDITOR' | 'VIEWER'; canEdit?: boolean; canDelete?: boolean; canShare?: boolean };
type InferLink = { id: number; name: string; status: string; storageUri?: string };
type DatacubeDto = { datacubeId: number; id?: number; projectId?: number | null; name: string; kind: 'ORIGINAL' | 'AI_RESULT'; status: string; sourceDatacubeId?: number; timeCoordinateName?: string; timeStart?: string; timeEnd?: string; metadata?: Record<string, any>; xcubeDatasetId?: string; linkedSuccessfulInferResults?: InferLink[] };
type DatasetSummaryDto = { datacubeId: number; xcubeDatasetId: string; ownerUserId: number; accessType: 'OWNED' | 'SHARED'; projectId?: number; projectName?: string; name: string; kind: string; integrationStatus: string; availabilityStatus: string; lastSyncedAt?: string; bbox?: number[]; time?: { dimension?: string; start?: string; end?: string; coordinates?: string[] }; variables?: Array<{ name: string; title?: string; units?: string }>; defaultVariable?: string; rgbAvailable?: boolean; rgbSchema?: unknown };
type DatasetDetailDto = DatasetSummaryDto & { linkedSuccessfulInferResults?: Array<{ datacubeId: number; xcubeDatasetId: string; name: string; status: string }> };
export type SeriesPoint = { time: string; value: number | null };
export type ProjectMember = { userId: string; role: 'OWNER' | 'EDITOR' | 'VIEWER'; sharedByUserId?: string; createdAt?: string };
const toProject = (item: ProjectDto): Project => ({ id: String(item.id), name: item.name, description: item.description, createdAt: item.createdAt, updatedAt: item.updatedAt, ownerUserId: item.ownerUserId == null ? undefined : String(item.ownerUserId), ownerUsername: item.ownerUsername, accessRole: item.accessRole, canEdit: item.canEdit, canDelete: item.canDelete, canShare: item.canShare });

const timesFrom = (dto: DatacubeDto | DatasetDetailDto): TimePoint[] => {
  if ('time' in dto && dto.time?.coordinates) return dto.time.coordinates.map((iso) => ({ iso, label: new Date(iso).toLocaleDateString('ko-KR') }));
  if ('timeStart' in dto && dto.timeStart) return [{ iso: dto.timeStart, label: new Date(dto.timeStart).toLocaleDateString('ko-KR') }, ...(dto.timeEnd && dto.timeEnd !== dto.timeStart ? [{ iso: dto.timeEnd, label: new Date(dto.timeEnd).toLocaleDateString('ko-KR') }] : [])];
  return [];
};
const toDataset = (dto: DatacubeDto, projectId = dto.projectId == null ? '' : String(dto.projectId)): ZarrDataset => ({ id: String(dto.datacubeId ?? dto.id), projectId, name: dto.name, subtitle: dto.status, xcubeDatasetId: dto.xcubeDatasetId ?? '', defaultVariable: String(dto.metadata?.defaultVariable ?? dto.metadata?.variables?.[0] ?? ''), variables: Array.isArray(dto.metadata?.variables) ? dto.metadata!.variables : [], times: timesFrom(dto) });
const summaryToDataset = (dto: DatasetSummaryDto): ZarrDataset => ({ id: String(dto.datacubeId), projectId: dto.projectId == null ? '' : String(dto.projectId), projectName: dto.projectName, accessType: dto.accessType, name: dto.name, subtitle: `${dto.integrationStatus} · ${dto.availabilityStatus}`, xcubeDatasetId: dto.xcubeDatasetId, defaultVariable: dto.defaultVariable ?? dto.variables?.[0]?.name ?? '', variables: dto.variables?.map((item) => item.name) ?? [], variableMetadata: Object.fromEntries((dto.variables ?? []).map((item) => [item.name, { title: item.title, units: item.units }])), times: timesFrom(dto), timeDimension: dto.time?.dimension ?? 'time', bbox: dto.bbox?.length === 4 ? dto.bbox as [number, number, number, number] : undefined, rgbAvailable: dto.rgbAvailable });
function parseSeries(body: any): SeriesPoint[] {
  const candidates = body?.points ?? body?.series ?? body?.results ?? body?.result;
  if (Array.isArray(candidates)) return candidates.map((item: any) => ({ time: String(item.time ?? item.date ?? item.timestamp ?? ''), value: typeof item.value === 'number' ? item.value : null }));
  if (Array.isArray(body?.values)) return body.values.map((value: any, index: number) => ({ time: String(body.times?.[index] ?? body.coordinates?.[index] ?? index), value: typeof value === 'number' ? value : null }));
  return [];
}

export const backofficeAdapter: ViewerAdapter & {
  createProject(input: { name: string; description?: string }): Promise<Project>;
  getProject(id: string): Promise<Project>;
  updateProject(id: string, input: { name: string; description?: string }): Promise<Project>;
  deleteProject(id: string): Promise<void>;
  getProjectMembers(id: string): Promise<ProjectMember[]>;
  addProjectMember(id: string, input: { userId: string; role: 'EDITOR' | 'VIEWER' }): Promise<ProjectMember>;
  updateProjectMember(id: string, userId: string, input: { role: 'EDITOR' | 'VIEWER' }): Promise<ProjectMember>;
  removeProjectMember(id: string, userId: string): Promise<void>;
  registerDatacube(input: { name: string; storageUri?: string; metadata?: Record<string, unknown> }): Promise<ZarrDataset>;
  deleteDatacube(id: string): Promise<void>;
  getLinkableDatacubes(): Promise<ZarrDataset[]>;
  linkProjectDataset(projectId: string, datasetId: string): Promise<void>;
  unlinkProjectDataset(projectId: string, datasetId: string): Promise<void>;
  getDatasetDetail(id: string): Promise<ZarrDataset>;
  tileUrl(id: string, variable: string, time?: string): string;
  legendUrl(id: string, variable: string): string;
  getLegend(id: string, variable: string): Promise<Blob>;
  getCoordinates(id: string, dimension: string): Promise<{ name?: string; size?: number; dtype?: string; coordinates?: string[] }>;
  getStatistics(id: string, variable: string, query: { lon: number; lat: number; time?: string }): Promise<{ value: number | null }>;
  getTimeseries(id: string, variable: string, input: { lon: number; lat: number; startDate?: string; endDate?: string; aggMethods?: string; maxValids?: number }): Promise<SeriesPoint[]>;
  checkXcubeStatus(): Promise<boolean>;
} = {
  async getProjects() { const page = await request<SpringPage<ProjectDto>>(BACKOFFICE_API_BASE_URL, '/api/v1/projects?page=0&size=100'); return page.content.map(toProject); },
  async createProject(input) { return toProject(await request<ProjectDto>(BACKOFFICE_API_BASE_URL, '/api/v1/projects', { method: 'POST', body: JSON.stringify(input) })); },
  async getProject(id) { return toProject(await request<ProjectDto>(BACKOFFICE_API_BASE_URL, `/api/v1/projects/${encodeURIComponent(id)}`)); },
  async updateProject(id, input) { return toProject(await request<ProjectDto>(BACKOFFICE_API_BASE_URL, `/api/v1/projects/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) })); },
  async deleteProject(id) { await request<void>(BACKOFFICE_API_BASE_URL, `/api/v1/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }); },
  async getProjectMembers(id) { const items = await request<Array<{ userId: number; role: 'OWNER' | 'EDITOR' | 'VIEWER'; sharedByUserId?: number; createdAt?: string }>>(BACKOFFICE_API_BASE_URL, `/api/v1/projects/${encodeURIComponent(id)}/members`); return items.map((item) => ({ ...item, userId: String(item.userId), sharedByUserId: item.sharedByUserId == null ? undefined : String(item.sharedByUserId) })); },
  async addProjectMember(id, input) { const item = await request<{ userId: number; role: 'EDITOR' | 'VIEWER'; sharedByUserId?: number; createdAt?: string }>(BACKOFFICE_API_BASE_URL, `/api/v1/projects/${encodeURIComponent(id)}/members`, { method: 'POST', body: JSON.stringify({ userId: Number(input.userId), role: input.role }) }); return { ...item, userId: String(item.userId), sharedByUserId: item.sharedByUserId == null ? undefined : String(item.sharedByUserId) }; },
  async updateProjectMember(id, userId, input) { const item = await request<{ userId: number; role: 'EDITOR' | 'VIEWER'; sharedByUserId?: number; createdAt?: string }>(BACKOFFICE_API_BASE_URL, `/api/v1/projects/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, { method: 'PATCH', body: JSON.stringify(input) }); return { ...item, userId: String(item.userId), sharedByUserId: item.sharedByUserId == null ? undefined : String(item.sharedByUserId) }; },
  async removeProjectMember(id, userId) { await request<void>(BACKOFFICE_API_BASE_URL, `/api/v1/projects/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' }); },
  async getDatasets(projectId) { const path = projectId ? `/api/v1/datasets?scope=all&page=0&size=100&projectId=${encodeURIComponent(projectId)}` : '/api/v1/datasets?scope=all&page=0&size=100'; const page = await request<CatalogPage<DatasetSummaryDto>>(BACKOFFICE_API_BASE_URL, path); return page.content.filter((item) => item.kind === 'ORIGINAL' && (!projectId || item.projectId === Number(projectId))).map(summaryToDataset); },
  async getProjectDatasets(projectId) { const page = await request<SpringPage<DatacubeDto>>(BACKOFFICE_API_BASE_URL, `/api/v1/projects/${encodeURIComponent(projectId)}/datacubes?page=0&size=100`); return page.content.filter((item) => item.kind === 'ORIGINAL').map((item) => toDataset(item, projectId)); },
  async registerDatacube(input) { const dto = await request<DatacubeDto>(BACKOFFICE_API_BASE_URL, '/api/v1/datacubes', { method: 'POST', body: JSON.stringify({ ...input, kind: 'ORIGINAL', metadata: input.metadata ?? {} }) }); return toDataset(dto); },
  async deleteDatacube(id) { await request<void>(BACKOFFICE_API_BASE_URL, `/api/v1/datacubes/${encodeURIComponent(id)}`, { method: 'DELETE' }); },
  async getLinkableDatacubes() { const page = await request<SpringPage<DatacubeDto>>(BACKOFFICE_API_BASE_URL, '/api/v1/datacubes?page=0&size=100'); return page.content.filter((item) => item.kind === 'ORIGINAL').map((item) => toDataset(item)); },
  async linkProjectDataset(projectId, datasetId) { await request<void>(BACKOFFICE_API_BASE_URL, `/api/v1/projects/${encodeURIComponent(projectId)}/datasets/${encodeURIComponent(datasetId)}`, { method: 'POST' }); },
  async unlinkProjectDataset(projectId, datasetId) { await request<void>(BACKOFFICE_API_BASE_URL, `/api/v1/projects/${encodeURIComponent(projectId)}/datasets/${encodeURIComponent(datasetId)}`, { method: 'DELETE' }); },
  async getDatasetDetail(id) { const dto = await request<DatasetDetailDto>(BACKOFFICE_API_BASE_URL, `/api/v1/datasets/${id}`); return summaryToDataset(dto); },
  async getJobs(datasetId) { const dto = await request<DatasetDetailDto>(BACKOFFICE_API_BASE_URL, `/api/v1/datasets/${datasetId}`); return (dto.linkedSuccessfulInferResults ?? []).map<AiJob>((item) => ({ id: String(item.datacubeId), inputDatacubeId: datasetId, outputDatacubeId: String(item.datacubeId), outputType: 'INFER_ZARR', status: item.status === 'READY' ? 'SUCCEEDED' : 'RUNNING', period: 'Backend 결과' })); },
  async runWaterExtraction() { throw new Error('AI_EXECUTION_API_UNAVAILABLE'); },
  // Raster tiles are served directly by the official XCube Server.
  tileUrl(id, variable, time) { const params = new URLSearchParams({ crs: 'EPSG:3857', format: 'png', ...(time ? { time } : {}) }); return `${XCUBE_API_BASE_URL}/tiles/${encodeURIComponent(id)}/${encodeURIComponent(variable)}/{z}/{y}/{x}?${params}`; },
  legendUrl(id, variable) { return `${BACKOFFICE_API_BASE_URL}/api/v1/datasets/${id}/legend/${encodeURIComponent(variable)}`; },
  getLegend(id, variable) { return requestBlob(BACKOFFICE_API_BASE_URL, `/api/v1/datasets/${id}/legend/${encodeURIComponent(variable)}`); },
  getCoordinates(id, dimension) { return request(BACKOFFICE_API_BASE_URL, `/api/v1/datasets/${id}/coordinates/${encodeURIComponent(dimension)}`); },
  async getStatistics(id, variable, query) { const params = new URLSearchParams({ lon: String(query.lon), lat: String(query.lat), ...(query.time ? { time: query.time } : {}) }); const body = await request<any>(BACKOFFICE_API_BASE_URL, `/api/v1/datasets/${id}/statistics/${encodeURIComponent(variable)}?${params}`); return { value: typeof body?.result?.value === 'number' ? body.result.value : typeof body?.value === 'number' ? body.value : null }; },
  async getTimeseries(id, variable, input) { const body = await request<any>(BACKOFFICE_API_BASE_URL, `/api/v1/datasets/${id}/timeseries/${encodeURIComponent(variable)}`, { method: 'POST', body: JSON.stringify({ lon: input.lon, lat: input.lat, startDate: input.startDate ?? null, endDate: input.endDate ?? null, aggMethods: input.aggMethods ?? null, maxValids: input.maxValids ?? null }) }); return parseSeries(body); },
  async checkXcubeStatus() { try { const response = await fetch(`${XCUBE_API_BASE_URL}/`); return response.ok; } catch { return false; } },
};
