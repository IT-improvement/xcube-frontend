// Demo (REACT_APP_USE_MOCK_API=true) stand-in for the admin APIs (UR-59, ADM contract §2): users, Backoffice
// summaries and quotas, every user's data, projects and jobs, system state and the audit record. Same codes as the
// real services (ADMIN_SELF_CHANGE, LAST_ADMIN). In memory only; real mode never uses this.
import { ApiError } from '../api/httpClient';
import type { AdminDataset, AdminJob, AdminJobFilter, AdminJobList, AdminProject, AdminSystem, AdminUser, AdminUserFilter, AdminUserSummary, AuditEntry, Paged } from '../api/adminApi';

const GIB = 1024 ** 3;
const MIB = 1024 ** 2;
const DEFAULT_QUOTA = 50 * GIB;
const pause = (ms = 250) => new Promise((resolve) => window.setTimeout(resolve, ms));
const iso = (daysAgo: number, hour = 9) => new Date(Date.UTC(2026, 9, 15 - daysAgo, hour, 12)).toISOString();

type Self = { id: string | number; email?: string; name?: string } | null | undefined;

/** Readable fake temporary password (12+ characters, no look-alike letters). Demo only. */
function demoPassword() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  return Array.from({ length: 14 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
}

export function createAdminDemo() {
  const users: AdminUser[] = [
    { id: '1', loginId: 'designqa', name: '디자인 QA', role: 'ADMIN', status: 'ACTIVE', language: 'ko', createdAt: iso(120), lastLoginAt: iso(0, 1), deletedAt: null },
    { id: '2', loginId: 'viewerqa', name: '뷰어 QA', role: 'PROJECT_MANAGER', status: 'ACTIVE', language: 'ko', createdAt: iso(110), lastLoginAt: iso(1, 6), deletedAt: null },
    { id: '3', loginId: 'kim.water', name: '김수자', role: 'PROJECT_MANAGER', status: 'ACTIVE', language: 'ko', createdAt: iso(64), lastLoginAt: iso(2, 4), deletedAt: null },
    { id: '4', loginId: 'lee.gis', name: '이지은', role: 'PROJECT_USER', status: 'ACTIVE', language: 'ko', createdAt: iso(40), lastLoginAt: iso(5, 2), deletedAt: null },
    { id: '5', loginId: 'park.county', name: '박군청', role: 'USER', status: 'ACTIVE', language: 'ko', createdAt: iso(21), lastLoginAt: iso(9, 8), deletedAt: null },
    { id: '6', loginId: 'research.en', name: 'Hannah Reed', role: 'PROJECT_USER', status: 'BLOCKED', language: 'en', createdAt: iso(18), lastLoginAt: iso(17, 3), deletedAt: null },
    { id: '7', loginId: 'intern01', name: '최인턴', role: 'USER', status: 'ACTIVE', language: null, createdAt: iso(3), lastLoginAt: null, deletedAt: null },
  ];
  const quotas = new Map<string, number>([['3', 100 * GIB]]);
  const used: Record<string, number> = { 1: 12.5 * GIB, 2: 3.1 * GIB, 3: 46.8 * GIB, 4: 7.2 * GIB, 5: 0, 6: 51.4 * GIB, 7: 0 };
  const datasets: AdminDataset[] = [
    { id: '101', name: '대청호 S1+S2 2024 여름', kind: 'ORIGINAL', ownerId: '1', ownerLoginId: null, xcubeDatasetId: 'u1-d101', sizeBytes: 4.2 * GIB, createdAt: iso(30), status: 'AVAILABLE' },
    { id: '102', name: '대청호_수체_U-Net_20241001', kind: 'AI_RESULT', ownerId: '1', ownerLoginId: null, xcubeDatasetId: 'u1-d102', sizeBytes: 310 * MIB, createdAt: iso(14), status: 'AVAILABLE' },
    { id: '103', name: '소양강댐 Sentinel-2 2025', kind: 'ORIGINAL', ownerId: '3', ownerLoginId: null, xcubeDatasetId: 'u3-d103', sizeBytes: 18.4 * GIB, createdAt: iso(25), status: 'AVAILABLE' },
    { id: '104', name: '소양강댐 NDWI 융합', kind: 'FUSION', ownerId: '3', ownerLoginId: null, xcubeDatasetId: 'u3-d104', sizeBytes: 2.1 * GIB, createdAt: iso(11), status: 'AVAILABLE' },
    { id: '105', name: '제주 시군구 Shapefile', kind: 'ORIGINAL', ownerId: '4', ownerLoginId: null, xcubeDatasetId: 'u4-d105', sizeBytes: 96 * MIB, createdAt: iso(8), status: 'AVAILABLE' },
    { id: '106', name: 'Landsat 9 낙동강 하구', kind: 'ORIGINAL', ownerId: '6', ownerLoginId: null, xcubeDatasetId: 'u6-d106', sizeBytes: 27.9 * GIB, createdAt: iso(19), status: 'UNAVAILABLE' },
    { id: '107', name: 'CAS500 영산강 2025-08', kind: 'ORIGINAL', ownerId: '2', ownerLoginId: null, xcubeDatasetId: 'u2-d107', sizeBytes: null, createdAt: iso(1), status: 'PENDING' },
  ];
  const projects: AdminProject[] = [
    { id: '11', name: '대청호 수위 모니터링', description: '2024–2025 계절 비교', ownerId: '1', ownerLoginId: null, memberCount: 3, datasetCount: 2, createdAt: iso(60), updatedAt: iso(2) },
    { id: '12', name: '소양강댐 갈수기', description: null, ownerId: '3', ownerLoginId: null, memberCount: 2, datasetCount: 2, createdAt: iso(26), updatedAt: iso(11) },
    { id: '13', name: '제주 행정구역', description: '시군구 경계 참고용', ownerId: '4', ownerLoginId: null, memberCount: 1, datasetCount: 1, createdAt: iso(8), updatedAt: iso(8) },
  ];
  const jobs: AdminJob[] = [
    { id: '901', name: 'CAS500 영산강 2025-08', type: 'CAS500', status: 'RUNNING', progress: 0.42, stage: 'convert', createdAt: iso(0, 0), startedAt: iso(0, 0), ownerId: '2', service: 'GENERATION', input: { files: ['CAS500_20250812.zip'] } },
    { id: '902', name: 'Sentinel-2 · 금강 (GEE)', type: 'GEE_TO_ZARR', status: 'QUEUED', progress: 0, createdAt: iso(0, 1), ownerId: '4', service: 'GENERATION', input: { collectionId: 'COPERNICUS/S2_SR_HARMONIZED' } },
    { id: '31', name: '소양강댐 NDWI 융합', type: 'FUSION', status: 'SUCCEEDED', progress: 1, createdAt: iso(11), startedAt: iso(11), finishedAt: iso(11, 10), ownerId: '3', service: 'FUSION' },
    { id: '77', name: '낙동강 하구 수체 DeepLabV3+', type: 'AI_WATER', status: 'FAILED', progress: 0.6, createdAt: iso(4), startedAt: iso(4), finishedAt: iso(4, 10), errorCode: 'MODEL_CHECKPOINT_UNAVAILABLE', errorMessage: '모델 파일을 찾을 수 없습니다.', ownerId: '6', service: 'AI_WATER', input: { datacubeId: 106, modelId: 'deeplabv3plus-s1s2-10ch' } },
    { id: '903', name: '울산 행정구역 Shapefile', type: 'SHAPEFILE', status: 'FAILED', progress: 0.4, createdAt: iso(6), startedAt: iso(6), finishedAt: iso(6, 10), errorCode: 'INVALID_INPUT', errorMessage: 'No timestamp in ulsan_admin.shp; supply date or timePattern', ownerId: '4', service: 'GENERATION', input: { files: ['ulsan_admin.zip'] } },
  ];
  const audit: AuditEntry[] = [
    { id: '3', adminUserId: '1', adminLoginId: 'designqa', action: 'USER_BLOCK', targetType: 'USER', targetId: '6', detail: { loginId: 'research.en' }, createdAt: iso(3, 5) },
    { id: '2', adminUserId: '1', adminLoginId: 'designqa', action: 'QUOTA_UPDATE', targetType: 'USER', targetId: '3', detail: { loginId: 'kim.water', quotaBytes: 100 * GIB }, createdAt: iso(6, 2) },
    { id: '1', adminUserId: '1', adminLoginId: 'designqa', action: 'USER_ROLE_CHANGE', targetType: 'USER', targetId: '4', detail: { loginId: 'lee.gis', from: 'USER', to: 'PROJECT_USER' }, createdAt: iso(10, 1) },
  ];
  let auditId = audit.length;
  let selfId = '1';
  const record = (action: string, targetType: string, targetId: string, detail: Record<string, unknown>) => {
    const admin = users.find((user) => user.id === selfId);
    audit.unshift({ id: String(++auditId), adminUserId: selfId, adminLoginId: admin?.loginId ?? null, action, targetType, targetId, detail, createdAt: new Date().toISOString() });
  };
  /** The signed-in account takes the first row (id 1, ADMIN), so the self-row guards can be tried. */
  const adopt = (self: Self) => {
    if (!self) return;
    const id = String(self.id);
    if (selfId === id) return;
    const first = users[0];
    users.forEach((user) => { if (user !== first && user.id === id) user.id = `${id}-demo`; });
    for (const list of [datasets, projects, jobs]) list.forEach((item) => { if (item.ownerId === first.id) item.ownerId = id; });
    audit.forEach((entry) => { if (entry.adminUserId === first.id) entry.adminUserId = id; });
    used[id] = used[first.id];
    first.id = id;
    if (self.email) { first.loginId = self.email; audit.forEach((entry) => { entry.adminLoginId = self.email!; }); }
    if (self.name) first.name = self.name;
    selfId = id;
  };
  const find = (userId: string) => {
    const user = users.find((item) => item.id === userId);
    if (!user) throw new ApiError(404, 'NOT_FOUND', '사용자를 찾을 수 없습니다.');
    return user;
  };
  const slice = <T,>(items: T[], page = 0, size = 50): Paged<T> => ({ items: items.slice(page * size, page * size + size), total: items.length });
  const has = (text: string | null | undefined, needle: string) => !!text && text.toLowerCase().includes(needle);

  return {
    async listUsers(filter: AdminUserFilter = {}, self?: Self): Promise<Paged<AdminUser>> {
      adopt(self);
      await pause();
      const needle = filter.q?.trim().toLowerCase() ?? '';
      const items = users.filter((user) =>
        (!needle || has(user.loginId, needle) || has(user.name, needle)) &&
        (!filter.role || user.role === filter.role) &&
        (!filter.status || (filter.status === 'DELETED' ? !!user.deletedAt : user.status === filter.status && !user.deletedAt)));
      return slice(items.map((user) => ({ ...user })), filter.page, filter.size);
    },
    async updateUser(userId: string, patch: { role?: string; status?: 'ACTIVE' | 'BLOCKED' }): Promise<AdminUser> {
      await pause();
      const user = find(userId);
      if (userId === selfId && ((patch.role && patch.role !== 'ADMIN') || patch.status === 'BLOCKED')) throw new ApiError(400, 'ADMIN_SELF_CHANGE', '자기 자신의 관리자 등급을 내리거나 차단할 수 없습니다.');
      const admins = users.filter((item) => item.role === 'ADMIN' && item.status === 'ACTIVE' && !item.deletedAt);
      if (user.role === 'ADMIN' && admins.length <= 1 && ((patch.role && patch.role !== 'ADMIN') || patch.status === 'BLOCKED')) throw new ApiError(409, 'LAST_ADMIN', '마지막 관리자입니다.');
      if (patch.role && patch.role !== user.role) { record('USER_ROLE_CHANGE', 'USER', userId, { loginId: user.loginId, from: user.role, to: patch.role }); user.role = patch.role; }
      if (patch.status && patch.status !== user.status) { record(patch.status === 'BLOCKED' ? 'USER_BLOCK' : 'USER_UNBLOCK', 'USER', userId, { loginId: user.loginId }); user.status = patch.status; }
      return { ...user };
    },
    async resetPassword(userId: string): Promise<{ temporaryPassword: string }> {
      await pause(400);
      const user = find(userId);
      record('USER_PASSWORD_RESET', 'USER', userId, { loginId: user.loginId });
      return { temporaryPassword: demoPassword() };
    },
    async deleteUser(userId: string): Promise<void> {
      await pause();
      const user = find(userId);
      if (userId === selfId) throw new ApiError(400, 'ADMIN_SELF_CHANGE', '자기 자신은 탈퇴 처리할 수 없습니다.');
      user.status = 'BLOCKED';
      user.deletedAt = new Date().toISOString();
      record('USER_DELETE', 'USER', userId, { loginId: user.loginId });
    },
    async listAudit(page = 0, size = 50): Promise<Paged<AuditEntry>> {
      await pause();
      return slice(audit.map((entry) => ({ ...entry })), page, size);
    },
    async userSummaries(userIds: string[]): Promise<AdminUserSummary[]> {
      await pause(200);
      return userIds.map((userId) => ({
        userId,
        datasetCount: datasets.filter((item) => item.ownerId === userId).length,
        projectCount: projects.filter((item) => item.ownerId === userId).length,
        usedBytes: used[userId] ?? 0,
        quotaBytes: quotas.get(userId) ?? DEFAULT_QUOTA,
        quotaIsDefault: !quotas.has(userId),
      }));
    },
    async setQuota(userId: string, quotaBytes: number | null): Promise<void> {
      await pause();
      const user = find(userId);
      if (quotaBytes == null) quotas.delete(userId); else quotas.set(userId, quotaBytes);
      record('QUOTA_UPDATE', 'USER', userId, { loginId: user.loginId, quotaBytes });
    },
    async listDatasets(filter: { q?: string; ownerId?: string; kind?: string; page?: number; size?: number } = {}): Promise<Paged<AdminDataset>> {
      await pause();
      const needle = filter.q?.trim().toLowerCase() ?? '';
      const items = datasets.filter((item) => (!needle || has(item.name, needle) || has(item.xcubeDatasetId, needle)) && (!filter.ownerId || item.ownerId === filter.ownerId) && (!filter.kind || item.kind === filter.kind));
      return slice(items.map((item) => ({ ...item })), filter.page, filter.size);
    },
    async deleteDataset(datasetId: string): Promise<void> {
      await pause();
      const index = datasets.findIndex((item) => item.id === datasetId);
      if (index < 0) throw new ApiError(404, 'NOT_FOUND', '데이터를 찾을 수 없습니다.');
      const [removed] = datasets.splice(index, 1);
      record('DATASET_DELETE', 'DATASET', datasetId, { name: removed.name, ownerId: removed.ownerId });
    },
    async listProjects(filter: { q?: string; page?: number; size?: number } = {}): Promise<Paged<AdminProject>> {
      await pause();
      const needle = filter.q?.trim().toLowerCase() ?? '';
      return slice(projects.filter((item) => !needle || has(item.name, needle) || has(item.description, needle)).map((item) => ({ ...item })), filter.page, filter.size);
    },
    async system(): Promise<AdminSystem> {
      await pause(300);
      const started = iso(2, 3);
      return {
        services: [
          { name: 'authentication', ready: true, restarts: 0, startedAt: started },
          { name: 'backoffice', ready: true, restarts: 1, startedAt: started },
          { name: 'data-generation', ready: true, restarts: 0, startedAt: started },
          { name: 'data-analysis', ready: true, restarts: 0, startedAt: started },
          { name: 'ai-processing', ready: false, restarts: 4, startedAt: iso(0, 0) },
          { name: 'frontend', ready: true, restarts: 0, startedAt: started },
        ],
        xcubePods: [
          { name: 'xcube-main-0', userId: null, phase: 'Running', ready: true, memoryBytes: 812 * MIB },
          { name: 'xcube-main-1', userId: null, phase: 'Running', ready: true, memoryBytes: 790 * MIB },
          { name: `xcube-user-${selfId}`, userId: selfId, phase: 'Running', ready: true, memoryBytes: 402 * MIB },
          { name: 'xcube-user-3', userId: '3', phase: 'Pending', ready: false, memoryBytes: null },
        ],
        node: { memoryUsedBytes: 5.6 * GIB, memoryTotalBytes: 7.8 * GIB, cpuMilli: 1250 },
        disk: { dataUsedBytes: 412 * GIB, dataTotalBytes: 931 * GIB },
        publicUrl: null,
      };
    },
    async listJobs(filter: AdminJobFilter = {}): Promise<AdminJobList> {
      await pause();
      const statuses = filter.status ? filter.status.split(',') : [];
      const items = jobs.filter((job) => (!statuses.length || statuses.includes(job.status)) && (!filter.ownerId || job.ownerId === filter.ownerId));
      return { items: items.map((job) => ({ ...job })), unavailable: [] };
    },
    async cancelJob(job: Pick<AdminJob, 'id' | 'type'>): Promise<void> {
      await pause();
      const found = jobs.find((item) => item.id === job.id && item.type === job.type);
      if (!found) throw new ApiError(404, 'NOT_FOUND', '작업을 찾을 수 없습니다.');
      Object.assign(found, { status: 'CANCELLED', finishedAt: new Date().toISOString() });
      record('JOB_CANCEL', 'JOB', job.id, { name: found.name, type: found.type });
    },
  };
}
