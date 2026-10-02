export type ProjectRole = 'OWNER' | 'EDITOR' | 'VIEWER';
export type Project = { id: string; name: string; description?: string; createdAt?: string; updatedAt?: string; ownerUserId?: string; ownerUsername?: string; accessRole?: ProjectRole; canEdit?: boolean; canDelete?: boolean; canShare?: boolean };
export type TimePoint = { iso: string; label: string };
export type ZarrDataset = { id: string; projectId: string; projectName?: string; accessType?: 'OWNED' | 'SHARED'; name: string; subtitle: string; xcubeDatasetId: string; defaultVariable: string; variables: string[]; variableMetadata?: Record<string, { title?: string; units?: string; colorBarName?: string; colorBarMin?: number; colorBarMax?: number }>; times: TimePoint[]; timeDimension?: string; bbox?: [number, number, number, number]; rgbAvailable?: boolean; /** xcube instance serving this dataset (the owner's pod, M2); absent = main server. */ tileBaseUrl?: string; /** Generation job that created it (M4 생성 이력). */ generationJobId?: string };
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
  async getProjectDatasets(id: string) { await pause(); return datasets.filter((item) => (links[id] ?? []).includes(item.id)); },
  async getLinkableDatacubes() { await pause(); return [...datasets]; },
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
  async getProjects() { await pause(); return [...projects]; },
  async createProject(input) { await pause(); const project: Project = { id: `demo-project-${projects.length + 1}`, name: input.name, accessRole: 'OWNER' }; projects.push(project); return project; },
  async getDatasets(projectId) { await pause(); return projectId ? datasets.filter((item) => item.projectId === projectId) : datasets; },
  async getProjectDatasets(projectId) { await pause(); return datasets.filter((item) => item.projectId === projectId); },
  async getJobs(datasetId) { await pause(); return jobs.filter((job) => job.inputDatacubeId === datasetId); },
  async registerDatacube(input) { await pause(); const item: ZarrDataset = { id: `demo-zarr-${datasets.length + 1}`, projectId: '', name: input.name, subtitle: 'REGISTERED', xcubeDatasetId: `demo-${datasets.length + 1}`, defaultVariable: 'rgb', variables: ['rgb'], times }; datasets.push(item); return item; },
  async deleteDatacube(id) { const index = datasets.findIndex((item) => item.id === id); if (index >= 0) datasets.splice(index, 1); await pause(); },
  async runWaterExtraction(datasetId, period) { await pause(1400); const id = String(25 + jobs.length); const job: AiJob = { id, inputDatacubeId: datasetId, outputDatacubeId: `${datasetId}-infer-${id}`, outputType: 'INFER_ZARR', status: 'SUCCEEDED', period }; jobs.unshift(job); return job; },
};
