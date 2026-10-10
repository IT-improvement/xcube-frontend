// Data access for the management pages (M4). Real mode calls the Backoffice;
// demo mode (REACT_APP_USE_MOCK_API=true) uses the in-memory demo adapter.
import { activeViewerAdapter, useMockApi } from '../api';
import { backofficeAdapter, ProjectMember } from '../api/backofficeApi';
import { demoManagement, viewerAdapter as demoAdapter, Project, ZarrDataset } from '../api/viewerAdapter';
import { analysisApi, DryRun, FusionRequest, ValidateResult } from '../api/analysisApi';
import { dryRunDemo, fusionJobsDemo, validateFormula } from './fusionDemo';
import { AdminArea, AdminLevel, AdminSearch, AreaPick, AreaUpload, ColorBarOption, FileJobInput, GeeCollection, GeeEstimate, GeeJobBody, generationApi, GenerationJob, InspectType, JobSummary, ProductBand, SavedArea, SpatialInspection, UploadOptions } from '../api/generationApi';
import { ApiError } from '../api/httpClient';
import { areaDemo } from './areaDemo';
import { aiApi, AiCheck, AiJobRequest, AiModel, AiWaterJob } from '../api/aiApi';
import { createAiDemo } from './aiDemo';
import { formatDate as i18nFormatDate, getLanguage, translate } from '../i18n';
import type { Lang } from '../i18n';

export type { Project, ZarrDataset, ProjectMember };
export type MemberRole = 'EDITOR' | 'VIEWER';
/** "김철수 (kim)" when the server knows the name, otherwise "사용자 22" / "User 22". */
export const memberLabel = (member: { userId: string; username?: string; name?: string }, lang: Lang = getLanguage()) =>
  member.username ? (member.name && member.name !== member.username ? `${member.name} (${member.username})` : member.username) : translate(lang, 'members.userFallback', { id: member.userId });

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
  { id: 'demo-s', name: '제주 시군구 Shapefile', type: 'SHAPEFILE', status: 'SUCCEEDED', progress: 1, createdAt: '2025-10-20T08:10:00Z', startedAt: '2025-10-20T08:10:03Z', finishedAt: '2025-10-20T08:12:10Z', registration: { datacubeId: 0, xcubeDatasetId: 'jeju_sgg' }, input: { files: ['jeju_sgg.zip'] } },
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
/**
 * Demo upload: progress in four steps over about 0.3 s, then the check; cancel rejects like a real upload.
 * Satellite products (UR-55) answer from the file name, e.g. `S2B_MSIL2A_20240814T021529_N0511_R003_T52SCG_….zip`
 * or `LC09_L2SP_115034_20240816_….tar`.
 */
function demoUpload<T>(file: File, options: UploadOptions, answer: () => T): Promise<T> {
  const total = Math.max(file.size, 1);
  return new Promise<T>((resolve, reject) => {
    const timers: number[] = [];
    const stop = () => { timers.forEach((timer) => window.clearTimeout(timer)); reject(new DOMException('Upload cancelled', 'AbortError')); };
    if (options.signal?.aborted) { stop(); return; }
    options.signal?.addEventListener('abort', stop);
    [1, 2, 3, 4].forEach((step) => timers.push(window.setTimeout(() => options.onProgress?.({ loaded: Math.round((total * step) / 4), total }), step * 70)));
    timers.push(window.setTimeout(() => {
      options.signal?.removeEventListener('abort', stop);
      try { resolve(answer()); } catch (error) { reject(error); }
    }, 400));
  });
}
const S2_BANDS: ProductBand[] = [
  ['B02', 'blue', 10, true], ['B03', 'green', 10, true], ['B04', 'red', 10, true], ['B08', 'nir', 10, true], ['B11', 'swir', 20, true],
  ['B05', 'rededge1', 20, false], ['B06', 'rededge2', 20, false], ['B07', 'rededge3', 20, false], ['B8A', 'nir08', 20, false], ['B12', 'swir2', 20, false],
  ['B01', 'coastal', 60, false], ['B09', 'wv', 60, false],
].map(([source, name, resolution, picked]) => ({ source: source as string, name: name as string, resolution: resolution as number, kind: 'continuous', default: picked as boolean }) as ProductBand)
  .concat([{ source: 'SCL', name: 'scl', resolution: 20, kind: 'categorical', default: true }]);
const LANDSAT_BANDS: ProductBand[] = [
  ['SR_B1', 'coastal', false], ['SR_B2', 'blue', true], ['SR_B3', 'green', true], ['SR_B4', 'red', true], ['SR_B5', 'nir', true], ['SR_B6', 'swir', true], ['SR_B7', 'swir2', false],
].map(([source, name, picked]) => ({ source: source as string, name: name as string, resolution: 30, kind: 'continuous', default: picked as boolean }) as ProductBand)
  .concat([{ source: 'QA_PIXEL', name: 'qa_pixel', resolution: 30, kind: 'categorical', default: true }]);
const iso = (stamp: string) => `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(9, 11) || '02'}:${stamp.slice(11, 13) || '15'}:${stamp.slice(13, 15) || '00'}Z`;
function demoProduct(type: 'sentinel2' | 'landsat', file: File): SpatialInspection {
  const name = file.name;
  const s2 = /^S2([ABC])_MSIL(1C|2A)_(\d{8}T\d{6})_N(\d{2})(\d{2})_R\d{3}_T(\w{5})_/i.exec(name);
  const landsat = /^L[CO]0([89])_(L\w{3})_(\d{6})_(\d{8})_/i.exec(name);
  if ((type === 'sentinel2' && landsat) || (type === 'landsat' && s2)) throw new ApiError(400, 'PRODUCT_TYPE_MISMATCH', '고른 제품 종류와 다른 파일입니다.');
  if ((s2 && s2[2].toUpperCase() === '1C') || (landsat && landsat[2].toUpperCase().startsWith('L1'))) throw new ApiError(400, 'PRODUCT_LEVEL_UNSUPPORTED', 'Level-1 제품은 올릴 수 없습니다.');
  const footprint: [number, number, number, number] = [127.21, 36.04, 128.45, 37.03];
  if (type === 'sentinel2') {
    const baseline = s2 ? `${s2[4]}.${s2[5]}` : '05.11';
    return {
      sourceType: 'SENTINEL2_L2A', fileName: name, bands: S2_BANDS.map((band) => band.source), bounds: { west: footprint[0], south: footprint[1], east: footprint[2], north: footprint[3] }, files: [name],
      message: 'Sentinel-2 L2A 제품을 확인했습니다. (데모)', messageCode: 'SENTINEL2_CHECKED', inputs: [{ kind: 'zip', uri: `file:///demo/${name}` }],
      product: {
        sensor: 'SENTINEL2_L2A', platform: s2 ? `S2${s2[1].toUpperCase()}` : 'S2B', productId: name.replace(/\.zip$/i, ''), acquiredAt: s2 ? iso(s2[3]) : '2024-08-14T02:15:29Z',
        tile: s2 ? s2[6].toUpperCase() : '52SCG', processingBaseline: baseline, boaAddOffset: Number(baseline) >= 4 ? -1000 : 0, cloudCover: 3.2, footprint, bands: S2_BANDS,
      },
    };
  }
  const pathRow = landsat ? landsat[3] : '115034';
  return {
    sourceType: 'LANDSAT_C2L2', fileName: name, bands: LANDSAT_BANDS.map((band) => band.source), bounds: { west: footprint[0], south: footprint[1], east: footprint[2], north: footprint[3] }, files: [name],
    message: 'Landsat Collection 2 Level-2 제품을 확인했습니다. (데모)', messageCode: 'LANDSAT_CHECKED', inputs: [{ kind: 'tar', uri: `file:///demo/${name}` }],
    product: {
      sensor: 'LANDSAT_C2_L2', platform: landsat ? `LC0${landsat[1]}` : 'LC09', productId: name.replace(/\.(tar(\.gz)?|tgz|zip)$/i, ''), acquiredAt: landsat ? iso(`${landsat[4]}T020000`) : '2024-08-16T02:00:00Z',
      pathRow, cloudCover: 12.4, footprint, bands: LANDSAT_BANDS,
    },
  };
}

/** Demo inspection: ten attributes (or four bands) with approximate statistics, as the M1 API will return. */
function demoInspection(type: InspectType, file: File): SpatialInspection {
  if (type === 'sentinel2' || type === 'landsat') return demoProduct(type, file);
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
    return { sourceType: 'SHAPEFILE', fileName: file.name, bands: fields.map((field) => field.name), fields, bounds, files: ['admin.shp', 'admin.shx', 'admin.dbf', 'admin.prj', 'admin.cpg'], message: '필수 구성파일 4개와 추가파일을 확인했습니다. (데모)', messageCode: 'SHAPEFILE_CHECKED' };
  }
  const names = type === 'cas500' ? ['B', 'G', 'R', 'N'] : ['band_1', 'band_2', 'band_3', 'band_4'];
  const fields = names.map((name, index) => ({ name, type: 'integer' as const, approxStats: { min: 0, max: 10000 + index * 500, p2: 180 + index * 40, p98: 3600 + index * 300 } }));
  return { sourceType: type === 'cas500' ? 'CAS500' : 'GEOTIFF', fileName: file.name, bands: names, fields, bounds, width: 4096, height: 3072, files: [file.name], message: 'GDAL로 파일을 확인했습니다. (데모)', ...(type === 'cas500' ? { messageCode: 'CAS500_CHECKED', messageParams: { tiffs: names.length, aux: 1 } } : { messageCode: 'GEOTIFF_CHECKED' }) };
}

/** Generation calls used by the add-data wizard; demo mode answers locally. */
export const generation = {
  colorBars: (): Promise<ColorBarOption[]> => (useMockApi ? pause(150).then(() => DEMO_COLORBARS) : generationApi.getColorBarOptions()),
  collections: (): Promise<GeeCollection[]> => (useMockApi ? pause(150).then(() => DEMO_COLLECTIONS) : generationApi.getCollections()),
  /** Upload and check a file; `options` reports progress and cancels (audit W9). */
  inspect: (type: InspectType, file: File, options: UploadOptions = {}): Promise<SpatialInspection> =>
    (useMockApi ? demoUpload(file, options, () => demoInspection(type, file)) : generationApi.inspectSpatialFile(type, file, options)),
  createGeeJob: (input: Parameters<typeof generationApi.createGeeJob>[0]): Promise<GenerationJob> => (useMockApi ? pause().then(() => demoJob(input.name, 'GEE_TO_ZARR')) : generationApi.createGeeJob(input)),
  estimateGee: (body: GeeJobBody, signal?: AbortSignal): Promise<GeeEstimate> => (useMockApi ? areaDemo.estimate(body) : generationApi.estimateGee(body, signal)),
  searchAdminAreas: (query: string, level?: AdminLevel): Promise<AdminSearch> => (useMockApi ? areaDemo.searchAdmin(query, level) : generationApi.searchAdminAreas(query, level)),
  getAdminArea: (code: string): Promise<AdminArea> => (useMockApi ? areaDemo.getAdmin(code) : generationApi.getAdminArea(code)),
  listAreas: (): Promise<SavedArea[]> => (useMockApi ? areaDemo.list() : generationApi.listAreas()),
  getArea: (id: string | number): Promise<SavedArea> => (useMockApi ? areaDemo.get(id) : generationApi.getArea(id)),
  deleteArea: (id: string | number): Promise<unknown> => (useMockApi ? areaDemo.remove(id) : generationApi.deleteArea(id)),
  uploadArea: (file: File, name: string, pick?: AreaPick): Promise<AreaUpload> => (useMockApi ? areaDemo.upload(file, name, pick) : generationApi.uploadArea(file, name, pick)),
  areaFromJob: (jobId: string | number, name: string, pick?: AreaPick): Promise<AreaUpload> => (useMockApi ? areaDemo.fromJob(jobId, name, pick) : generationApi.areaFromJob(jobId, name, pick)),
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

/** Fusion (M6): the Data Analysis API; demo mode answers locally with the same grammar rules. */
export const fusion = {
  validate: (formula: string, variables: string[]): Promise<ValidateResult> =>
    useMockApi ? pause(120).then(() => validateFormula(formula, variables)) : analysisApi.validate({ formula, variables }),
  dryRun: (request: FusionRequest): Promise<DryRun> =>
    useMockApi ? pause(250).then(() => demoAdapter.getDatasets()).then((datasets) => dryRunDemo(request, datasets)) : analysisApi.dryRun(request),
  createJob: (request: FusionRequest): Promise<JobSummary> => (useMockApi ? fusionJobsDemo.create(request) : analysisApi.createJob(request)),
  listJobs: (filter: { status?: string } = {}): Promise<JobSummary[]> => (useMockApi ? fusionJobsDemo.list(filter) : analysisApi.listJobs(filter)),
  getJob: (id: string): Promise<JobSummary> => (useMockApi ? fusionJobsDemo.get(id) : analysisApi.getJob(id)),
  cancelJob: (id: string): Promise<unknown> => (useMockApi ? fusionJobsDemo.cancel(id) : analysisApi.cancelJob(id)),
  retryJob: (id: string): Promise<JobSummary> => (useMockApi ? fusionJobsDemo.retry(id) : analysisApi.retryJob(id)),
};

/** AI 수체 추출 (M7): the AI Processing API; demo mode answers locally. */
const aiDemo = createAiDemo(() => demoAdapter.getDatasets());
export const ai = {
  models: (): Promise<AiModel[]> => (useMockApi ? aiDemo.models() : aiApi.listModels()),
  check: (datacubeId: string, modelId: string): Promise<AiCheck> => (useMockApi ? aiDemo.check(datacubeId, modelId) : aiApi.check({ datacubeId, modelId })),
  createJob: (input: AiJobRequest): Promise<AiWaterJob> => (useMockApi ? aiDemo.create(input) : aiApi.createJob(input)),
  listJobs: (filter: { status?: string; datacubeId?: string } = {}): Promise<AiWaterJob[]> => (useMockApi ? aiDemo.list(filter) : aiApi.listJobs(filter)),
  getJob: (id: string): Promise<AiWaterJob> => (useMockApi ? aiDemo.get(id) : aiApi.getJob(id)),
  cancelJob: (id: string): Promise<unknown> => (useMockApi ? aiDemo.cancel(id) : aiApi.cancelJob(id)),
  retryJob: (id: string): Promise<AiWaterJob> => (useMockApi ? aiDemo.retry(id) : aiApi.retryJob(id)),
};

export const isFusionJob = (job: Pick<JobSummary, 'type'>) => job.type === 'FUSION';
export const isAiJob = (job: Pick<JobSummary, 'type'>) => job.type === 'AI_WATER';
const SERVICE_TYPES = ['FUSION', 'AI_WATER'];
const newestFirst = (a: JobSummary, b: JobSummary) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '');

export type JobListResult = { items: JobSummary[]; unavailable: Array<'FUSION' | 'AI_WATER'> };
/** Notice for services whose jobs are missing from the merged list. */
export const unavailableJobsNotice = (unavailable: JobListResult['unavailable'], lang: Lang = getLanguage()) => {
  if (!unavailable.length) return '';
  const services = unavailable.map((type) => translate(lang, type === 'FUSION' ? 'jobs.serviceFusion' : 'jobs.serviceAi')).join(translate(lang, 'jobs.serviceSeparator'));
  return translate(lang, 'jobs.unavailable', { services });
};
/** Job center view: generation, fusion and AI jobs together, routed to the service that owns each job. */
export const jobs: { list(filter?: { status?: string; type?: string }): Promise<JobSummary[]>; listWithStatus(filter?: { status?: string; type?: string }): Promise<JobListResult>; cancel(job: JobSummary): Promise<unknown>; retry(job: JobSummary): Promise<JobSummary> } = {
  /**
   * A type filter skips the services it does not name. Generation is the base list: its failure is an error.
   * A fusion or AI outage does not hide the other jobs, unless only those services were asked for.
   */
  async list(filter: { status?: string; type?: string } = {}): Promise<JobSummary[]> {
    return (await jobs.listWithStatus(filter)).items;
  },
  /** Same as `list`, plus the services (FUSION, AI_WATER) whose jobs could not be loaded, so the page can say so. */
  async listWithStatus(filter: { status?: string; type?: string } = {}): Promise<JobListResult> {
    const types = filter.type ? filter.type.split(',') : [];
    const wants = (type: string) => !types.length || types.includes(type);
    const wantsGeneration = !types.length || types.some((type) => !SERVICE_TYPES.includes(type));
    const generationFilter = { ...filter, type: types.filter((type) => !SERVICE_TYPES.includes(type)).join(',') };
    const none = Promise.resolve([] as JobSummary[]);
    const [generated, fused, inferred] = await Promise.allSettled([
      wantsGeneration ? generation.listJobs(generationFilter) : none,
      wants('FUSION') ? fusion.listJobs({ status: filter.status }) : none,
      wants('AI_WATER') ? ai.listJobs({ status: filter.status }) : none,
    ]);
    if (generated.status === 'rejected') throw generated.reason;
    const requested = [wants('FUSION') ? fused : null, wants('AI_WATER') ? inferred : null].filter((outcome): outcome is PromiseSettledResult<JobSummary[]> => !!outcome);
    if (!wantsGeneration && requested.every((outcome) => outcome.status === 'rejected')) throw (requested[0] as PromiseRejectedResult).reason;
    const items = [generated, fused, inferred].flatMap((outcome) => (outcome.status === 'fulfilled' ? outcome.value : []));
    const unavailable = ([['FUSION', fused], ['AI_WATER', inferred]] as const).filter(([, outcome]) => outcome.status === 'rejected').map(([type]) => type);
    return { items: items.sort(newestFirst), unavailable };
  },
  cancel: (job: JobSummary) => (isFusionJob(job) ? fusion.cancelJob(job.id) : isAiJob(job) ? ai.cancelJob(job.id) : generation.cancelJob(job.id)),
  retry: (job: JobSummary) => (isFusionJob(job) ? fusion.retryJob(job.id) : isAiJob(job) ? ai.retryJob(job.id) : generation.retryJob(job.id)),
};

/** OWNER / EDITOR / anything else (VIEWER): 소유자·편집·보기, Owner·Editor·Viewer. */
export const roleLabel = (role?: string, lang: Lang = getLanguage()) =>
  translate(lang, role === 'OWNER' ? 'roles.OWNER' : role === 'EDITOR' ? 'roles.EDITOR' : 'roles.VIEWER');
export const canEditProject = (project?: Project) => project?.accessRole === 'OWNER' || project?.accessRole === 'EDITOR';
export const isOwned = (dataset: ZarrDataset) => dataset.accessType !== 'SHARED';

// Dates on the management screens follow the screen language (UR-53 stage 2). Pass `lang` to pin one;
// the add-data wizard and the Viewer (still Korean) do not use these helpers.
const DATE_EN: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
const DATE_TIME: Intl.DateTimeFormatOptions = { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
const DATE_TIME_EN: Intl.DateTimeFormatOptions = { ...DATE_TIME, month: 'short' };
/** ko "2024. 8. 14.", en "Aug 14, 2024". */
export const formatDate = (value?: string | Date | null, lang: Lang = getLanguage()) => i18nFormatDate(value, lang === 'ko' ? {} : DATE_EN, lang);
/** ko "10. 8. 14:05", en "Oct 8, 14:05" — month, day and 24-hour time for job rows (set on one line with `.date`). */
export const formatDateTime = (value?: string | Date | null, lang: Lang = getLanguage()) => i18nFormatDate(value, lang === 'ko' ? DATE_TIME : DATE_TIME_EN, lang);

/**
 * First and last time of a dataset. Korean keeps the catalog's time labels ("2025. 7. 3. ~ 2025. 10. 22.");
 * other languages format the ISO times ("Jul 3, 2025 – Oct 22, 2025").
 */
export function periodLabel(dataset: ZarrDataset, lang: Lang = getLanguage()) {
  const times = dataset.times;
  if (!times.length) return '—';
  const label = (time: ZarrDataset['times'][number]) => (lang === 'ko' || !time.iso ? time.label : formatDate(time.iso, lang));
  return times.length === 1 ? label(times[0]) : translate(lang, 'app.range', { start: label(times[0]), end: label(times[times.length - 1]) });
}

/** Viewer opens in a new tab, preselecting the dataset. */
export const viewerHref = (datasetId?: string) =>
  datasetId ? `/app/viewer?dataset=${encodeURIComponent(datasetId)}` : '/app/viewer';
/** Viewer on the source dataset with one AI result selected (`ai` = AI job id or result datacube id). */
export const aiViewerHref = (sourceId: string, resultKey: string) => `${viewerHref(sourceId)}&ai=${encodeURIComponent(resultKey)}`;
