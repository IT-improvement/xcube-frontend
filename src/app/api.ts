// Data access for the management pages (M4). Real mode calls the Backoffice;
// demo mode (REACT_APP_USE_MOCK_API=true) uses the in-memory demo adapter.
import { activeViewerAdapter, useMockApi } from '../api';
import { backofficeAdapter, ProjectMember } from '../api/backofficeApi';
import { demoManagement, viewerAdapter as demoAdapter, Project, ZarrDataset } from '../api/viewerAdapter';
import { ColorBarOption, FileJobInput, GeeCollection, generationApi, GenerationJob, JobSummary, SpatialInspection } from '../api/generationApi';

export type { Project, ZarrDataset, ProjectMember };
export type MemberRole = 'EDITOR' | 'VIEWER';
/** "김철수 (kim)" when the server knows the name, otherwise "사용자 22". */
export const memberLabel = (member: { userId: string; username?: string; name?: string }) =>
  member.username ? (member.name && member.name !== member.username ? `${member.name} (${member.username})` : member.username) : `사용자 ${member.userId}`;

const manage = useMockApi ? demoManagement : backofficeAdapter;

export const appApi = {
  demo: useMockApi,
  listDatasets: () => activeViewerAdapter.getDatasets(),
  getDataset: (id: string) => manage.getDatasetDetail(id),
  getAiResults: (id: string) => activeViewerAdapter.getJobs(id),
  deleteDataset: (id: string) => (useMockApi ? demoAdapter : backofficeAdapter).deleteDatacube(id),
  registerDataset: (input: { name: string; storageUri?: string; metadata?: Record<string, unknown> }) =>
    (useMockApi ? demoAdapter : backofficeAdapter).registerDatacube(input),
  listProjects: () => activeViewerAdapter.getProjects(),
  getProject: (id: string) => manage.getProject(id),
  createProject: (input: { name: string; description?: string }) => manage.createProject(input),
  updateProject: (id: string, input: { name: string; description?: string }) => manage.updateProject(id, input),
  deleteProject: (id: string) => manage.deleteProject(id),
  projectDatasets: (id: string) => manage.getProjectDatasets!(id),
  linkableDatasets: () => manage.getLinkableDatacubes(),
  linkDataset: (projectId: string, datasetId: string) => manage.linkProjectDataset(projectId, datasetId),
  unlinkDataset: (projectId: string, datasetId: string) => manage.unlinkProjectDataset(projectId, datasetId),
  members: (id: string): Promise<ProjectMember[]> => manage.getProjectMembers(id),
  addMember: (id: string, input: { username: string; role: MemberRole }) => manage.addProjectMember(id, input),
  updateMember: (id: string, userId: string, role: MemberRole) => manage.updateProjectMember(id, userId, { role }),
  removeMember: (id: string, userId: string) => manage.removeProjectMember(id, userId),
};

const pause = (ms = 400) => new Promise((resolve) => window.setTimeout(resolve, ms));
let demoJobs = 0;
const demoJobList: JobSummary[] = [
  { id: 'demo-a', name: 'Sentinel-2 · 2025 (GEE)', type: 'GEE_TO_ZARR', status: 'SUCCEEDED', progress: 1, createdAt: '2025-10-22T01:00:00Z', startedAt: '2025-10-22T01:00:05Z', finishedAt: '2025-10-22T01:06:40Z', registration: { datacubeId: 0, xcubeDatasetId: 'sentinel_rgb' }, input: { collectionId: 'COPERNICUS/S2_SR_HARMONIZED', bands: ['B2', 'B3', 'B4', 'B8'], startDate: '2025-07-01', endDate: '2025-10-22' } },
  { id: 'demo-b', name: '울산 행정구역 Shapefile', type: 'SHAPEFILE', status: 'FAILED', progress: 0.4, createdAt: '2025-10-21T08:10:00Z', startedAt: '2025-10-21T08:10:03Z', finishedAt: '2025-10-21T08:11:10Z', errorCode: 'INVALID_INPUT', errorMessage: 'No timestamp in ulsan_admin.shp; supply date or timePattern', input: { files: ['ulsan_admin.zip'], variables: [{ source: 'pop_total', name: 'pop_total', kind: 'continuous', style: { colorBar: 'viridis', min: 120, max: 31800 } }], params: { resolution: 0.00025 } } },
];
const demoJob = (name = '새 데이터', type = 'GEOTIFF_BANDS'): GenerationJob => {
  const job: JobSummary = { id: `demo-${++demoJobs}`, name, type, status: 'RUNNING', progress: 0.3, stage: 'convert', createdAt: new Date().toISOString(), startedAt: new Date().toISOString(), input: {} };
  demoJobList.unshift(job);
  return { id: job.id, status: 'QUEUED' };
};
const DEMO_COLORBARS: ColorBarOption[] = ['viridis', 'plasma', 'magma', 'cividis', 'Blues', 'Greens', 'RdYlGn', 'Spectral', 'terrain', 'Greys'].map((id, index) => ({ id, category: index < 4 ? 'Perceptually Uniform Sequential' : index < 6 ? 'Sequential' : 'Diverging' }));
const DEMO_COLLECTIONS: GeeCollection[] = [
  { id: 'COPERNICUS/S2_SR_HARMONIZED', name: 'Sentinel-2 L2A (Harmonized)', bands: ['B2', 'B3', 'B4', 'B8', 'B11', 'B12', 'SCL'] },
  { id: 'LANDSAT/LC09/C02/T1_L2', name: 'Landsat 9 C2 L2', bands: ['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B6', 'SR_B7'] },
  { id: 'LANDSAT/LC08/C02/T1_L2', name: 'Landsat 8 C2 L2', bands: ['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B6', 'SR_B7'] },
];
/** Demo inspection: ten attributes (or four bands) with approximate statistics, as the M1 API will return. */
function demoInspection(type: 'geotiff' | 'shapefile' | 'cas500', file: File): SpatialInspection {
  const bounds = { west: 128.9, south: 35.38, east: 129.42, north: 35.72 };
  if (type === 'shapefile') {
    const fields = [
      { name: 'pop_total', type: 'integer' as const, approxStats: { min: 0, max: 48210, p2: 120, p98: 31800 } },
      { name: 'pop_density', type: 'real' as const, approxStats: { min: 0.4, max: 18250.7, p2: 12.5, p98: 9120.3 } },
      { name: 'area_km2', type: 'real' as const, approxStats: { min: 0.08, max: 312.4, p2: 0.5, p98: 120.2 } },
      { name: 'land_use', type: 'string' as const, categories: [{ value: '주거', count: 412 }, { value: '공업', count: 96 }, { value: '농림', count: 233 }, { value: '녹지', count: 151 }] },
      { name: 'flood_risk', type: 'integer' as const, approxStats: { min: 1, max: 5, p2: 1, p98: 5 } },
      { name: 'ndvi_mean', type: 'real' as const, approxStats: { min: -0.12, max: 0.91, p2: 0.05, p98: 0.82 } },
      { name: 'elev_mean', type: 'real' as const, approxStats: { min: -2.1, max: 1015.3, p2: 3.4, p98: 640.2 } },
      { name: 'water_ratio', type: 'real' as const, approxStats: { min: 0, max: 1, p2: 0, p98: 0.64 } },
      { name: 'adm_code', type: 'string' as const, categories: [{ value: '31110', count: 1 }, { value: '31140', count: 1 }] },
      { name: 'updated_yr', type: 'integer' as const, approxStats: { min: 2015, max: 2026, p2: 2016, p98: 2026 } },
    ];
    return { sourceType: 'SHAPEFILE', fileName: file.name, bands: fields.map((field) => field.name), fields, bounds, files: ['admin.shp', 'admin.shx', 'admin.dbf', 'admin.prj', 'admin.cpg'], message: '필수 구성파일 4개와 추가파일을 확인했습니다. (데모)' };
  }
  const names = type === 'cas500' ? ['B', 'G', 'R', 'N'] : ['band_1', 'band_2', 'band_3', 'band_4'];
  const fields = names.map((name, index) => ({ name, type: 'integer' as const, approxStats: { min: 0, max: 10000 + index * 500, p2: 180 + index * 40, p98: 3600 + index * 300 } }));
  return { sourceType: type === 'cas500' ? 'CAS500' : 'GEOTIFF', fileName: file.name, bands: names, fields, bounds, width: 4096, height: 3072, files: [file.name], message: 'GDAL로 파일을 확인했습니다. (데모)' };
}

/** Generation calls used by the add-data wizard; demo mode answers locally. */
export const generation = {
  colorBars: (): Promise<ColorBarOption[]> => (useMockApi ? pause(150).then(() => DEMO_COLORBARS) : generationApi.getColorBarOptions()),
  collections: (): Promise<GeeCollection[]> => (useMockApi ? pause(150).then(() => DEMO_COLLECTIONS) : generationApi.getCollections()),
  inspect: (type: 'geotiff' | 'shapefile' | 'cas500', file: File): Promise<SpatialInspection> => (useMockApi ? pause().then(() => demoInspection(type, file)) : generationApi.inspectSpatialFile(type, file)),
  createGeeJob: (input: Parameters<typeof generationApi.createGeeJob>[0]): Promise<GenerationJob> => (useMockApi ? pause().then(() => demoJob(input.name, 'GEE_TO_ZARR')) : generationApi.createGeeJob(input)),
  createFileJob: (input: FileJobInput): Promise<GenerationJob> => (useMockApi ? pause().then(() => demoJob(input.name, input.type)) : generationApi.createFileJob(input)),
  getJob: (id: string | number): Promise<GenerationJob> => (useMockApi ? pause().then(() => ({ id, status: 'RUNNING' as const })) : generationApi.getJob(id)),
  listJobs: (filter: { status?: string; type?: string } = {}): Promise<JobSummary[]> =>
    useMockApi
      ? pause(150).then(() => demoJobList.filter((job) => (!filter.status || filter.status.split(',').includes(job.status)) && (!filter.type || filter.type.split(',').includes(job.type))))
      : generationApi.listJobs(filter),
  jobSummary: (id: string): Promise<JobSummary> =>
    useMockApi ? pause(150).then(() => { const job = demoJobList.find((item) => item.id === id); if (!job) throw Object.assign(new Error('작업을 찾을 수 없습니다.'), { status: 404 }); return job; }) : generationApi.jobSummary(id),
  retryJob: (id: string): Promise<JobSummary> =>
    useMockApi ? pause().then(() => { const job = demoJobList.find((item) => item.id === id)!; const again: JobSummary = { ...job, id: `demo-${++demoJobs}`, status: 'QUEUED', progress: 0, errorCode: null, errorMessage: null, createdAt: new Date().toISOString(), finishedAt: null }; demoJobList.unshift(again); return again; }) : generationApi.retryJob(id),
  cancelJob: (id: string): Promise<unknown> =>
    useMockApi ? pause().then(() => { const job = demoJobList.find((item) => item.id === id); if (job) Object.assign(job, { status: 'CANCELLED', finishedAt: new Date().toISOString() }); }) : generationApi.cancelJob(id),
};

export const roleLabel = (role?: string) => (role === 'OWNER' ? '소유자' : role === 'EDITOR' ? '편집' : '보기');
export const canEditProject = (project?: Project) => project?.accessRole === 'OWNER' || project?.accessRole === 'EDITOR';
export const isOwned = (dataset: ZarrDataset) => dataset.accessType !== 'SHARED';

export function formatDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('ko-KR');
}

/** "2025.07.03 ~ 2025.10.22" from the dataset's time labels. */
export function periodLabel(dataset: ZarrDataset) {
  const times = dataset.times;
  if (!times.length) return '—';
  return times.length === 1 ? times[0].label : `${times[0].label} ~ ${times[times.length - 1].label}`;
}

/** Viewer opens in a new tab, preselecting the dataset. */
export const viewerHref = (datasetId?: string) =>
  datasetId ? `/app/viewer?dataset=${encodeURIComponent(datasetId)}` : '/app/viewer';
