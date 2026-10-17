import { DEMO_COMPARISONS } from './compareDemo';
export type ProjectRole = 'OWNER' | 'EDITOR' | 'VIEWER';
export type Project = { id: string; name: string; description?: string; createdAt?: string; updatedAt?: string; ownerUserId?: string; ownerUsername?: string; accessRole?: ProjectRole; canEdit?: boolean; canDelete?: boolean; canShare?: boolean; /** Datasets linked to it and people in it, the owner included (Backoffice list, FB1). */ datasetCount?: number; memberCount?: number };
export type TimePoint = { iso: string; label: string };
export type ZarrDataset = { id: string; projectId: string; projectName?: string; accessType?: 'OWNED' | 'SHARED'; name: string; subtitle: string; xcubeDatasetId: string; defaultVariable: string; variables: string[]; variableMetadata?: Record<string, { title?: string; units?: string; colorBarName?: string; /** xcube colour norm: lin, log or cat (categorical codes). */ colorBarNorm?: string; colorBarMin?: number; colorBarMax?: number }>; times: TimePoint[]; timeDimension?: string; bbox?: [number, number, number, number]; rgbAvailable?: boolean; /** Variables in the RGB tile, red/green/blue order (xcube rgbSchema). */ rgbBands?: string[]; /** xcube instance serving this dataset (the owner's pod, M2); absent = main server. */ tileBaseUrl?: string; /** Generation job that created it (M4 생성 이력). */ generationJobId?: string; /** ORIGINAL (default), FUSION (수식 융합 결과), AI_RESULT (AI 수체 추출 결과) or COMPARISON (비교 분석 결과). */ kind?: string; /** Input dataset of an AI_RESULT (M7); the AI result a COMPARISON was made from. */ sourceDatacubeId?: string; /** COMPARISON (CMP2): the original whose Viewer `결과 비교` lists it. */ originDatacubeId?: string; ownerUserId?: string; createdAt?: string; /** Formula, bindings and rules kept in metadata.fusion for FUSION datasets. */ fusion?: Record<string, unknown>; /** COMPARISON datasets (UR-63 F3): type, inputs and metrics kept in metadata.comparison. */ comparison?: Record<string, unknown>; /** Whether its xcube server serves it yet: AVAILABLE once the owner's pod has it, else UNKNOWN/… (pod restarting). */ availability?: string; /** Sentinel-1 pass paired with each time (`xcube_pairs`, UR-41). */ pairs?: Array<{ time?: string; s1Time?: string | null; orbitPass?: string | null; daysApart?: number | null; coverage?: number | null }>; /** Last time the catalog entry changed (Backoffice `lastSyncedAt`: registration or the last sync with xcube). */ updatedAt?: string };
export type AiJobStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
/** `name`: the result's own name when Backoffice links it (`linkedSuccessfulInferResults`, e.g. someone else's result of an example source). */
export type AiJob = { id: string; inputDatacubeId: string; outputDatacubeId?: string; outputType?: 'AI_RESULT' | 'INFER_ZARR'; status: AiJobStatus; period: string; name?: string };
export interface ViewerAdapter { getProjects(): Promise<Project[]>; getDatasets(projectId?: string): Promise<ZarrDataset[]>; getProjectDatasets?(projectId: string): Promise<ZarrDataset[]>; getJobs(datasetId: string): Promise<AiJob[]>; runWaterExtraction(datasetId: string, period: string): Promise<AiJob>; }

const pause = (ms = 180) => new Promise((resolve) => window.setTimeout(resolve, ms));
const labels = ['2025.07.03', '2025.07.18', '2025.08.02', '2025.08.21', '2025.09.05', '2025.09.19', '2025.10.04', '2025.10.22'];
const times = labels.map((label, index) => ({ iso: `2025-observation-${index + 1}`, label }));
const projects: Project[] = [{ id: 'han-river', name: '한강 수체 모니터링', accessRole: 'OWNER' }, { id: 'nakdong-river', name: '낙동강 변화 분석', accessRole: 'OWNER' }];
const datasets: ZarrDataset[] = [
  { id: 'sentinel', projectId: 'han-river', name: 'Sentinel-2 · 2025', subtitle: '분석 전', xcubeDatasetId: 'sentinel_rgb', defaultVariable: 'rgb', variables: ['rgb', 'NDWI'], times },
  { id: 'landsat', projectId: 'han-river', name: 'Landsat-8 · 2024', subtitle: '수체 결과 포함', xcubeDatasetId: 'landsat_rgb', defaultVariable: 'rgb', variables: ['rgb', 'NDWI', 'water_probability'], times },
  { id: 'nakdong', projectId: 'nakdong-river', name: 'Nakdong · 2025', subtitle: '분석 전', xcubeDatasetId: 'nakdong_rgb', defaultVariable: 'rgb', variables: ['rgb', 'NDWI'], times, bbox: [126.6, 37.3, 127.3, 37.7] },
  { id: 'landsat-infer-024', projectId: '', name: '수체 추출 결과 · U-Net (데모)', subtitle: 'READY', xcubeDatasetId: 'landsat_water_unet', defaultVariable: 'water_mask', variables: ['water_prob', 'water_mask'], times, kind: 'AI_RESULT', sourceDatacubeId: 'landsat' },
  // Comparison results (UR-63 F3): class map 0–3 with its metrics, as Data Analysis registers it. They are not listed
  // (CMP2): the original's Viewer `결과 비교` shows those whose originDatacubeId is that original.
  { id: 'landsat-change-024', projectId: '', name: '수체 시점 간 변화 (데모 비교)', subtitle: 'READY', xcubeDatasetId: 'landsat_change', defaultVariable: 'class', variables: ['class'], variableMetadata: { class: { colorBarNorm: 'cat', colorBarMin: 0, colorBarMax: 3 } }, times: [times[5]], kind: 'COMPARISON', sourceDatacubeId: 'landsat-infer-024', originDatacubeId: 'landsat', accessType: 'OWNED', createdAt: '2025-10-23T02:10:00Z', comparison: DEMO_COMPARISONS.TIME_CHANGE },
  { id: 'landsat-models-024', projectId: '', name: 'U-Net ↔ DeepLabV3+ 2025.08.02 (데모 비교)', subtitle: 'READY', xcubeDatasetId: 'landsat_models', defaultVariable: 'class', variables: ['class'], variableMetadata: { class: { colorBarNorm: 'cat', colorBarMin: 0, colorBarMax: 3 } }, times: [times[2]], kind: 'COMPARISON', sourceDatacubeId: 'landsat-infer-024', originDatacubeId: 'landsat', accessType: 'OWNED', createdAt: '2025-10-22T05:30:00Z', comparison: DEMO_COMPARISONS.MODEL_COMPARE },
  { id: 'landsat-ref-024', projectId: '', name: '정답 대비 2025.08.02 (데모, 공유받음)', subtitle: 'READY', xcubeDatasetId: 'landsat_ref', defaultVariable: 'class', variables: ['class'], variableMetadata: { class: { colorBarNorm: 'cat', colorBarMin: 0, colorBarMax: 3 } }, times: [times[2]], kind: 'COMPARISON', sourceDatacubeId: 'landsat-infer-024', originDatacubeId: 'landsat', accessType: 'SHARED', createdAt: '2025-10-21T09:00:00Z', comparison: DEMO_COMPARISONS.REFERENCE },
  // Made before CMP2 from a result the catalog no longer has: its original is unknown, so it still opens as data.
  { id: 'legacy-change-001', projectId: '', name: '예전 비교 (원본 모름, 데모)', subtitle: 'READY', xcubeDatasetId: 'legacy_change', defaultVariable: 'class', variables: ['class'], variableMetadata: { class: { colorBarNorm: 'cat', colorBarMin: 0, colorBarMax: 3 } }, times: [times[5]], kind: 'COMPARISON', comparison: { ...DEMO_COMPARISONS.TIME_CHANGE, inputs: [] } },
];
/** Lists leave comparison results out (CMP2); they are read through their original. */
const listed = (items: ZarrDataset[]) => items.filter((item) => item.kind !== 'COMPARISON');
/** Demo answer of `GET /api/v1/datasets/{originId}/comparisons` (contract CMP2 shape), newest first. */
export function demoOriginComparisons(originId: string) {
  if (!datasets.some((item) => item.id === originId && item.kind !== 'COMPARISON')) throw notFound();
  const nameOf = (id?: string) => datasets.find((item) => item.id === id)?.name ?? id ?? '';
  return datasets
    .filter((item) => item.kind === 'COMPARISON' && item.originDatacubeId === originId)
    .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
    .map((item) => {
      const recorded = (item.comparison ?? {}) as Record<string, any>;
      const { areaKm2, ...metrics } = (recorded.metrics ?? {}) as Record<string, any>;
      const inputs: Array<{ role: string; datacubeId: string }> = Array.isArray(recorded.inputs) ? recorded.inputs : [];
      return {
        id: item.id, name: item.name, xcubeDatasetId: item.xcubeDatasetId, tileBaseUrl: null, ownerUserId: item.accessType === 'OWNED' ? 1 : 22, accessType: item.accessType, isExample: false, createdAt: item.createdAt,
        compareType: recorded.type, times: { t1: recorded.t1, t2: recorded.t2, time: recorded.time ?? item.times[0]?.iso },
        sources: inputs.map((input) => ({ id: input.datacubeId, name: nameOf(input.datacubeId), role: input.role })),
        metrics, areaKm2: areaKm2 ?? {}, variables: [{ name: 'class' }], bbox: item.bbox ?? [128.6, 35.3, 129.3, 35.7],
      };
    });
}
const jobs: AiJob[] = [{ id: '024', inputDatacubeId: 'landsat', outputDatacubeId: 'landsat-infer-024', outputType: 'INFER_ZARR', status: 'SUCCEEDED', period: '전체 기간' }, { id: '023', inputDatacubeId: 'landsat', outputDatacubeId: 'landsat-infer-023', outputType: 'AI_RESULT', status: 'SUCCEEDED', period: '현재 시점' }];

type DemoMember = { userId: string; role: ProjectRole; createdAt?: string; username?: string; name?: string };
const members: Record<string, DemoMember[]> = { 'han-river': [{ userId: '1', role: 'OWNER' }, { userId: '22', role: 'VIEWER', createdAt: '2025-09-01T00:00:00Z', username: 'kim', name: '김철수' }] };
const links: Record<string, string[]> = Object.fromEntries(projects.map((project) => [project.id, datasets.filter((item) => item.projectId === project.id).map((item) => item.id)]));
const notFound = () => Object.assign(new Error('대상을 찾을 수 없습니다.'), { status: 404 });

/** Demo-only project, link and member operations used by the M4 pages. */
export const demoManagement = {
  async getProject(id: string) { await pause(); const item = projects.find((project) => project.id === id); if (!item) throw notFound(); return { ...item }; },
  async updateProject(id: string, input: { name: string; description?: string }) { await pause(); const item = projects.find((project) => project.id === id); if (!item) throw notFound(); Object.assign(item, input, { updatedAt: new Date().toISOString() }); return { ...item }; },
  async createProject(input: { name: string; description?: string }) { await pause(); const project: Project = { id: `demo-project-${projects.length + 1}`, ...input, accessRole: 'OWNER', createdAt: new Date().toISOString() }; projects.push(project); links[project.id] = []; return project; },
  async deleteProject(id: string) { await pause(); const index = projects.findIndex((project) => project.id === id); if (index >= 0) projects.splice(index, 1); delete links[id]; },
  async getProjectDatasets(id: string) { await pause(); return listed(datasets.filter((item) => (links[id] ?? []).includes(item.id))); },
  async getLinkableDatacubes() { await pause(); return listed(datasets); },
  async linkProjectDataset(projectId: string, datasetId: string) { await pause(); links[projectId] = Array.from(new Set([...(links[projectId] ?? []), datasetId])); },
  async unlinkProjectDataset(projectId: string, datasetId: string) { await pause(); links[projectId] = (links[projectId] ?? []).filter((id) => id !== datasetId); },
  async getDatasetDetail(id: string) { await pause(); const item = datasets.find((dataset) => dataset.id === id); if (!item) throw notFound(); return { ...item, projectName: projects.find((project) => project.id === item.projectId)?.name, bbox: item.bbox ?? [128.6, 35.3, 129.3, 35.7] as [number, number, number, number] }; },
  async getProjectMembers(id: string) { await pause(); return [...(members[id] ?? [{ userId: '1', role: 'OWNER' as ProjectRole }])]; },
  async addProjectMember(id: string, input: { username: string; role: 'EDITOR' | 'VIEWER' } | { userId: string; role: 'EDITOR' | 'VIEWER' }) {
    await pause();
    // Demo directory: any login ID except "nobody" resolves to a stable fake user.
    const username = 'username' in input ? input.username.trim().toLowerCase() : undefined;
    if (username === 'nobody' || username === '') throw Object.assign(new Error('해당 아이디의 사용자가 없습니다.'), { status: 404 });
    const userId = 'userId' in input ? input.userId : String(100 + (username ?? '').split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 900);
    const member: DemoMember = { userId, role: input.role, createdAt: new Date().toISOString(), username, name: username };
    members[id] = [...(members[id] ?? [{ userId: '1', role: 'OWNER' }]).filter((item) => item.userId !== userId), member];
    return member;
  },
  async updateProjectMember(id: string, userId: string, input: { role: 'EDITOR' | 'VIEWER' }) { await pause(); const list = members[id] ?? []; const member = list.find((item) => item.userId === userId); if (!member) throw notFound(); member.role = input.role; return { ...member }; },
  async removeProjectMember(id: string, userId: string) { await pause(); members[id] = (members[id] ?? []).filter((item) => item.userId !== userId); },
};

/** Backend 연결 전용 demo adapter. UI 컴포넌트에는 실제 dataset/variable ID를 하드코딩하지 않는다. */
export const viewerAdapter: ViewerAdapter & { createProject(input: { name: string }): Promise<Project>; registerDatacube(input: { name: string; storageUri?: string; metadata?: Record<string, unknown> }): Promise<ZarrDataset>; deleteDatacube(id: string): Promise<void> } = {
  async getProjects() { await pause(); return projects.map((project) => ({ ...project, datasetCount: (links[project.id] ?? []).length, memberCount: (members[project.id] ?? [{ userId: '1', role: 'OWNER' }]).length })); },
  async createProject(input) { await pause(); const project: Project = { id: `demo-project-${projects.length + 1}`, name: input.name, accessRole: 'OWNER' }; projects.push(project); return project; },
  async getDatasets(projectId) { await pause(); return listed(projectId ? datasets.filter((item) => item.projectId === projectId) : datasets); },
  async getProjectDatasets(projectId) { await pause(); return listed(datasets.filter((item) => item.projectId === projectId)); },
  async getJobs(datasetId) { await pause(); return jobs.filter((job) => job.inputDatacubeId === datasetId); },
  async registerDatacube(input) { await pause(); const item: ZarrDataset = { id: `demo-zarr-${datasets.length + 1}`, projectId: '', name: input.name, subtitle: 'REGISTERED', xcubeDatasetId: `demo-${datasets.length + 1}`, defaultVariable: 'rgb', variables: ['rgb'], times }; datasets.push(item); return item; },
  async deleteDatacube(id) { const index = datasets.findIndex((item) => item.id === id); if (index >= 0) datasets.splice(index, 1); await pause(); },
  async runWaterExtraction(datasetId, period) { await pause(1400); const id = String(25 + jobs.length); const job: AiJob = { id, inputDatacubeId: datasetId, outputDatacubeId: `${datasetId}-infer-${id}`, outputType: 'INFER_ZARR', status: 'SUCCEEDED', period }; jobs.unshift(job); return job; },
};
