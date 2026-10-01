export type ProjectRole = 'OWNER' | 'EDITOR' | 'VIEWER';
export type Project = { id: string; name: string; description?: string; createdAt?: string; updatedAt?: string; ownerUserId?: string; ownerUsername?: string; accessRole?: ProjectRole; canEdit?: boolean; canDelete?: boolean; canShare?: boolean };
export type TimePoint = { iso: string; label: string };
export type ZarrDataset = { id: string; projectId: string; projectName?: string; accessType?: 'OWNED' | 'SHARED'; name: string; subtitle: string; xcubeDatasetId: string; defaultVariable: string; variables: string[]; variableMetadata?: Record<string, { title?: string; units?: string }>; times: TimePoint[]; timeDimension?: string; bbox?: [number, number, number, number]; rgbAvailable?: boolean };
export type AiJobStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
export type AiJob = { id: string; inputDatacubeId: string; outputDatacubeId?: string; outputType?: 'AI_RESULT' | 'INFER_ZARR'; status: AiJobStatus; period: string };
export interface ViewerAdapter { getProjects(): Promise<Project[]>; getDatasets(projectId?: string): Promise<ZarrDataset[]>; getProjectDatasets?(projectId: string): Promise<ZarrDataset[]>; getJobs(datasetId: string): Promise<AiJob[]>; runWaterExtraction(datasetId: string, period: string): Promise<AiJob>; }

const pause = (ms = 180) => new Promise((resolve) => window.setTimeout(resolve, ms));
const labels = ['2025.07.03', '2025.07.18', '2025.08.02', '2025.08.21', '2025.09.05', '2025.09.19', '2025.10.04', '2025.10.22'];
const times = labels.map((label, index) => ({ iso: `2025-observation-${index + 1}`, label }));
const projects: Project[] = [{ id: 'han-river', name: '한강 수체 모니터링', accessRole: 'OWNER' }, { id: 'nakdong-river', name: '낙동강 변화 분석', accessRole: 'OWNER' }];
const datasets: ZarrDataset[] = [
  { id: 'sentinel', projectId: 'han-river', name: 'Sentinel-2 · 2025', subtitle: '분석 전', xcubeDatasetId: 'sentinel_rgb', defaultVariable: 'rgb', variables: ['rgb', 'NDWI'], times },
  { id: 'landsat', projectId: 'han-river', name: 'Landsat-8 · 2024', subtitle: '수체 결과 포함', xcubeDatasetId: 'landsat_rgb', defaultVariable: 'rgb', variables: ['rgb', 'NDWI', 'water_probability'], times },
  { id: 'nakdong', projectId: 'nakdong-river', name: 'Nakdong · 2025', subtitle: '분석 전', xcubeDatasetId: 'nakdong_rgb', defaultVariable: 'rgb', variables: ['rgb', 'NDWI'], times },
];
const jobs: AiJob[] = [{ id: '024', inputDatacubeId: 'landsat', outputDatacubeId: 'landsat-infer-024', outputType: 'INFER_ZARR', status: 'SUCCEEDED', period: '전체 기간' }, { id: '023', inputDatacubeId: 'landsat', outputDatacubeId: 'landsat-infer-023', outputType: 'AI_RESULT', status: 'SUCCEEDED', period: '현재 시점' }];

/** Backend 연결 전용 demo adapter. UI 컴포넌트에는 실제 dataset/variable ID를 하드코딩하지 않는다. */
export const viewerAdapter: ViewerAdapter & { createProject(input: { name: string }): Promise<Project>; registerDatacube(input: { name: string; storageUri?: string; metadata?: Record<string, unknown> }): Promise<ZarrDataset>; deleteDatacube(id: string): Promise<void> } = {
  async getProjects() { await pause(); return [...projects]; },
  async createProject(input) { await pause(); const project: Project = { id: `demo-project-${projects.length + 1}`, name: input.name, accessRole: 'OWNER' }; projects.push(project); return project; },
  async getDatasets(projectId) { await pause(); return projectId ? datasets.filter((item) => item.projectId === projectId) : datasets; },
  async getProjectDatasets(projectId) { await pause(); return datasets.filter((item) => item.projectId === projectId); },
  async getJobs(datasetId) { await pause(); return jobs.filter((job) => job.inputDatacubeId === datasetId); },
  async registerDatacube(input) { await pause(); const item: ZarrDataset = { id: `demo-zarr-${datasets.length + 1}`, projectId: '', name: input.name, subtitle: 'REGISTERED', xcubeDatasetId: `demo-${datasets.length + 1}`, defaultVariable: 'rgb', variables: ['rgb'], times }; datasets.push(item); return item; },
  async deleteDatacube(id) { const index = datasets.findIndex((item) => item.id === id); if (index >= 0) datasets.splice(index, 1); await pause(); },
  async runWaterExtraction(datasetId, period) { await pause(1400); const id = String(25 + jobs.length); const job: AiJob = { id, inputDatacubeId: datasetId, outputDatacubeId: `${datasetId}-infer-${id}`, outputType: 'INFER_ZARR', status: 'SUCCEEDED', period }; jobs.unshift(job); return job; },
};
