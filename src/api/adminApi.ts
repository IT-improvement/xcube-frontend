// Admin APIs (UR-59). Contract: docs/PM/codex-prompts/ADM-contract.md §2, with the service-prefixed paths of the
// ADM1 report §4 (one origin in deployment: Backoffice under /api/v1/admin/backoffice/…, jobs under
// /api/v1/admin/{generation|analysis|ai}/jobs; auth stays /api/v1/admin/users… and /api/v1/admin/audit). Every call
// needs the ADMIN role (403 otherwise). The services are being built alongside this screen, so responses are read leniently: a list may come
// as an array, `{items, total}` or a Spring page `{content, totalElements}`, ids as numbers or strings, and any
// optional field may be missing (null). Pages are 0-based (`page=0` is the first).
import { request } from './httpClient';
import { AUTH_API_BASE_URL } from './authApi';
import { BACKOFFICE_API_BASE_URL } from './backofficeApi';
import { GENERATION_API_BASE_URL, JobSummary } from './generationApi';
import { ANALYSIS_API_BASE_URL } from './analysisApi';
import { AI_API_BASE_URL } from './aiApi';
import type { Lang } from '../i18n/types';

export type AdminUserStatus = 'ACTIVE' | 'BLOCKED' | string;
export type AdminUser = {
  id: string; loginId: string; name: string; role: string; status: AdminUserStatus; language: Lang | null;
  createdAt: string | null; lastLoginAt: string | null;
  /** Set when the account was removed (탈퇴): the row stays, blocked, and its data is kept. */
  deletedAt: string | null;
};
export type Paged<T> = { items: T[]; total: number };
export type AdminUserFilter = { q?: string; role?: string; status?: string; page?: number; size?: number };
/** Backoffice numbers for one user; null where the server sent none. `quotaBytes` null = the default quota. */
export type AdminUserSummary = { userId: string; datasetCount: number | null; projectCount: number | null; usedBytes: number | null; quotaBytes: number | null; quotaIsDefault: boolean };
export type AdminDataset = {
  id: string; name: string; kind: string; ownerId: string | null; ownerLoginId: string | null;
  xcubeDatasetId: string | null; sizeBytes: number | null; createdAt: string | null; status: string | null;
};
export type AdminProject = {
  id: string; name: string; description: string | null; ownerId: string | null; ownerLoginId: string | null;
  memberCount: number | null; datasetCount: number | null; createdAt: string | null; updatedAt: string | null;
};
export type AdminJobService = 'GENERATION' | 'FUSION' | 'AI_WATER';
export type AdminJob = JobSummary & { ownerId: string | null; service: AdminJobService };
export type AdminJobFilter = { status?: string; type?: string; ownerId?: string; page?: number; size?: number };
export type AdminService = { name: string; ready: boolean | null; restarts: number | null; startedAt: string | null };
export type AdminPod = { name: string; userId: string | null; phase: string | null; ready: boolean | null; memoryBytes: number | null };
export type AdminSystem = {
  services: AdminService[];
  xcubePods: AdminPod[];
  node: { memoryUsedBytes: number | null; memoryTotalBytes: number | null; cpuMilli: number | null } | null;
  disk: { dataUsedBytes: number | null; dataTotalBytes: number | null } | null;
  publicUrl: string | null;
};
export type AuditEntry = {
  id: string; adminUserId: string | null; adminLoginId: string | null; action: string;
  targetType: string | null; targetId: string | null; detail: Record<string, unknown> | null; createdAt: string | null;
};

type Raw = Record<string, any>;
const str = (value: unknown): string | null => (value == null || value === '' ? null : String(value));
const num = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
};
const bool = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : value === 'true' ? true : value === 'false' ? false : null);
const pick = (raw: Raw, ...keys: string[]) => { for (const key of keys) if (raw?.[key] != null) return raw[key]; return undefined; };

/** Array, `{items, total}`, `{content, totalElements}` or `{users|datasets|projects|jobs|entries: […]}` → items and total. */
export function readPage(body: unknown, ...keys: string[]): { items: Raw[]; total: number } {
  if (Array.isArray(body)) return { items: body, total: body.length };
  const raw = (body ?? {}) as Raw;
  const list = [raw.items, raw.content, ...keys.map((key) => raw[key])].find(Array.isArray) as Raw[] | undefined;
  const items = list ?? [];
  const total = num(raw.total) ?? num(raw.totalElements) ?? num(raw.totalCount) ?? items.length;
  return { items, total };
}

const query = (params: Record<string, string | number | undefined | null>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value != null && value !== '') search.set(key, String(value));
  const text = search.toString();
  return text ? `?${text}` : '';
};
const id = (value: string | number) => encodeURIComponent(String(value));

export const toAdminUser = (raw: Raw): AdminUser => {
  const language = str(raw.language);
  return {
    id: String(pick(raw, 'id', 'userId') ?? ''),
    loginId: String(pick(raw, 'loginId', 'username', 'email') ?? ''),
    name: String(raw.name ?? ''),
    role: String(raw.role ?? ''),
    status: String(raw.status ?? 'ACTIVE'),
    language: language === 'ko' || language === 'en' ? language : null,
    createdAt: str(raw.createdAt),
    lastLoginAt: str(raw.lastLoginAt),
    deletedAt: str(raw.deletedAt),
  };
};

export const toUserSummary = (raw: Raw): AdminUserSummary => ({
  userId: String(pick(raw, 'userId', 'id') ?? ''),
  datasetCount: num(raw.datasetCount),
  projectCount: num(raw.projectCount),
  usedBytes: num(raw.usedBytes),
  quotaBytes: num(raw.quotaBytes),
  // ADM1 sends `customQuota`; older drafts `quotaIsDefault`.
  quotaIsDefault: bool(raw.quotaIsDefault) ?? (bool(raw.customQuota) == null ? false : !bool(raw.customQuota)),
});

export const toAdminDataset = (raw: Raw): AdminDataset => ({
  id: String(pick(raw, 'id', 'datacubeId') ?? ''),
  name: String(raw.name ?? ''),
  kind: String(raw.kind ?? 'ORIGINAL'),
  ownerId: str(pick(raw, 'ownerId', 'ownerUserId', 'userId')),
  ownerLoginId: str(pick(raw, 'ownerLoginId', 'ownerUsername')),
  xcubeDatasetId: str(raw.xcubeDatasetId),
  sizeBytes: num(pick(raw, 'sizeBytes', 'usedBytes', 'storageBytes')),
  createdAt: str(pick(raw, 'createdAt', 'registeredAt')),
  status: str(pick(raw, 'availabilityStatus', 'status')),
});

export const toAdminProject = (raw: Raw): AdminProject => ({
  id: String(raw.id ?? ''),
  name: String(raw.name ?? ''),
  description: str(raw.description),
  ownerId: str(pick(raw, 'ownerId', 'ownerUserId')),
  ownerLoginId: str(pick(raw, 'ownerLoginId', 'ownerUsername')),
  memberCount: num(raw.memberCount),
  datasetCount: num(pick(raw, 'datasetCount', 'datacubeCount')),
  createdAt: str(raw.createdAt),
  updatedAt: str(raw.updatedAt),
});

/** Generation keeps its own job types; band math and AI jobs may come without `type`, so the service sets it. */
export const toAdminJob = (raw: Raw, service: AdminJobService): AdminJob => ({
  ...(raw as JobSummary),
  id: String(raw.id ?? ''),
  name: String(raw.name ?? ''),
  type: service === 'GENERATION' ? String(raw.type ?? '') : service,
  status: String(raw.status ?? 'QUEUED') as JobSummary['status'],
  ownerId: str(pick(raw, 'ownerId', 'ownerUserId', 'userId')),
  service,
});

export const toAdminSystem = (raw: Raw | null | undefined): AdminSystem => {
  const body = raw ?? {};
  const node = body.node && typeof body.node === 'object' ? body.node : null;
  const disk = body.disk && typeof body.disk === 'object' ? body.disk : null;
  return {
    services: (Array.isArray(body.services) ? body.services : []).map((item: Raw) => ({
      name: String(item.name ?? ''), ready: bool(item.ready), restarts: num(item.restarts), startedAt: str(item.startedAt),
    })),
    xcubePods: (Array.isArray(body.xcubePods) ? body.xcubePods : []).map((item: Raw) => ({
      name: String(item.name ?? ''), userId: str(item.userId), phase: str(item.phase), ready: bool(item.ready), memoryBytes: num(item.memoryBytes),
    })),
    node: node ? { memoryUsedBytes: num(node.memoryUsedBytes), memoryTotalBytes: num(node.memoryTotalBytes), cpuMilli: num(node.cpuMilli) } : null,
    disk: disk ? { dataUsedBytes: num(disk.dataUsedBytes), dataTotalBytes: num(disk.dataTotalBytes) } : null,
    publicUrl: str(body.publicUrl),
  };
};

const detailOf = (value: unknown): Record<string, unknown> | null => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === 'string' && value.trim().startsWith('{')) { try { return JSON.parse(value); } catch { /* not JSON */ } }
  return null;
};
export const toAuditEntry = (raw: Raw): AuditEntry => ({
  id: String(raw.id ?? ''),
  adminUserId: str(pick(raw, 'adminUserId', 'adminId')),
  adminLoginId: str(pick(raw, 'adminLoginId', 'adminUsername')),
  action: String(raw.action ?? ''),
  targetType: str(raw.targetType),
  targetId: str(raw.targetId),
  detail: detailOf(raw.detail),
  createdAt: str(raw.createdAt),
});

/** Service, base URL and its prefixed admin jobs path (ADM1 report §4). */
const JOB_SERVICES: Array<[AdminJobService, string, string]> = [
  ['GENERATION', GENERATION_API_BASE_URL, '/api/v1/admin/generation/jobs'],
  ['FUSION', ANALYSIS_API_BASE_URL, '/api/v1/admin/analysis/jobs'],
  ['AI_WATER', AI_API_BASE_URL, '/api/v1/admin/ai/jobs'],
];
const serviceOf = (service: AdminJobService) => JOB_SERVICES.find(([name]) => name === service)!;
const BACKOFFICE_ADMIN = '/api/v1/admin/backoffice';
/** Which service owns a job row (generation types are every type that is not band math or AI). */
export const jobService = (job: Pick<JobSummary, 'type'>): AdminJobService => (job.type === 'FUSION' ? 'FUSION' : job.type === 'AI_WATER' ? 'AI_WATER' : 'GENERATION');

export type AdminJobList = { items: AdminJob[]; unavailable: AdminJobService[] };

export const adminApi = {
  // ---- Authentication (/api/v1/admin/users…, /api/v1/admin/audit) ----
  async listUsers(filter: AdminUserFilter = {}): Promise<Paged<AdminUser>> {
    const body = await request<unknown>(AUTH_API_BASE_URL, `/api/v1/admin/users${query({ q: filter.q?.trim(), role: filter.role, status: filter.status, page: filter.page ?? 0, size: filter.size ?? 50 })}`);
    const page = readPage(body, 'users');
    return { items: page.items.map(toAdminUser), total: page.total };
  },
  async updateUser(userId: string, patch: { role?: string; status?: 'ACTIVE' | 'BLOCKED' }): Promise<AdminUser> {
    return toAdminUser(await request<Raw>(AUTH_API_BASE_URL, `/api/v1/admin/users/${id(userId)}`, { method: 'PATCH', body: JSON.stringify(patch) }) ?? {});
  },
  /** The temporary password is shown once; it is never kept in the client beyond the dialog that shows it. */
  async resetPassword(userId: string): Promise<{ temporaryPassword: string }> {
    const body = await request<Raw>(AUTH_API_BASE_URL, `/api/v1/admin/users/${id(userId)}/password-reset`, { method: 'POST' });
    return { temporaryPassword: String(body?.temporaryPassword ?? '') };
  },
  async deleteUser(userId: string): Promise<void> {
    await request<void>(AUTH_API_BASE_URL, `/api/v1/admin/users/${id(userId)}`, { method: 'DELETE' });
  },
  /**
   * The admin record of both services (auth: accounts; Backoffice: data deletes and quotas), the same page of each,
   * merged newest first. One service failing leaves the other's entries; both failing throws.
   */
  async listAudit(page = 0, size = 50): Promise<Paged<AuditEntry>> {
    const path = query({ page, size });
    const outcomes = await Promise.allSettled([
      request<unknown>(AUTH_API_BASE_URL, `/api/v1/admin/audit${path}`).then((body) => ({ source: 'auth' as const, page: readPage(body, 'entries') })),
      request<unknown>(BACKOFFICE_API_BASE_URL, `${BACKOFFICE_ADMIN}/audit${path}`).then((body) => ({ source: 'backoffice' as const, page: readPage(body, 'entries') })),
    ]);
    if (outcomes.every((outcome) => outcome.status === 'rejected')) throw (outcomes[0] as PromiseRejectedResult).reason;
    const done = outcomes.flatMap((outcome) => (outcome.status === 'fulfilled' ? [outcome.value] : []));
    const items = done.flatMap(({ source, page: result }) => result.items.map((raw) => ({ ...toAuditEntry(raw), id: `${source}:${raw.id ?? ''}` })));
    items.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    // Paged by the larger of the two lists (each service pages its own record).
    return { items, total: Math.max(0, ...done.map(({ page: result }) => result.total)) };
  },

  // ---- Backoffice (/api/v1/admin/…) ----
  async userSummaries(userIds: string[]): Promise<AdminUserSummary[]> {
    if (!userIds.length) return [];
    const body = await request<unknown>(BACKOFFICE_API_BASE_URL, `${BACKOFFICE_ADMIN}/users/summary?ids=${userIds.map((value) => encodeURIComponent(value)).join(',')}`);
    return readPage(body, 'users', 'summaries').items.map(toUserSummary);
  },
  async setQuota(userId: string, quotaBytes: number | null): Promise<void> {
    await request<unknown>(BACKOFFICE_API_BASE_URL, `${BACKOFFICE_ADMIN}/users/${id(userId)}/quota`, { method: 'PUT', body: JSON.stringify({ quotaBytes }) });
  },
  async listDatasets(filter: { q?: string; ownerId?: string; kind?: string; page?: number; size?: number } = {}): Promise<Paged<AdminDataset>> {
    const body = await request<unknown>(BACKOFFICE_API_BASE_URL, `${BACKOFFICE_ADMIN}/datasets${query({ q: filter.q?.trim(), ownerId: filter.ownerId, kind: filter.kind, page: filter.page ?? 0, size: filter.size ?? 50 })}`);
    const page = readPage(body, 'datasets');
    return { items: page.items.map(toAdminDataset), total: page.total };
  },
  async deleteDataset(datasetId: string): Promise<void> {
    await request<void>(BACKOFFICE_API_BASE_URL, `${BACKOFFICE_ADMIN}/datasets/${id(datasetId)}`, { method: 'DELETE' });
  },
  async listProjects(filter: { q?: string; page?: number; size?: number } = {}): Promise<Paged<AdminProject>> {
    const body = await request<unknown>(BACKOFFICE_API_BASE_URL, `${BACKOFFICE_ADMIN}/projects${query({ q: filter.q?.trim(), page: filter.page ?? 0, size: filter.size ?? 50 })}`);
    const page = readPage(body, 'projects');
    return { items: page.items.map(toAdminProject), total: page.total };
  },
  async system(): Promise<AdminSystem> {
    return toAdminSystem(await request<Raw>(BACKOFFICE_API_BASE_URL, `${BACKOFFICE_ADMIN}/system`));
  },

  // ---- Generation · Analysis · AI (/api/v1/admin/jobs on each) ----
  /**
   * Every user's jobs from the three services, newest first. A service that does not answer is listed in
   * `unavailable` (the others still show); when none answers the first error is thrown.
   */
  async listJobs(filter: AdminJobFilter = {}): Promise<AdminJobList> {
    const search = query({ status: filter.status, type: filter.type, ownerId: filter.ownerId, page: filter.page ?? 0, size: filter.size ?? 100 });
    const outcomes = await Promise.allSettled(JOB_SERVICES.map(([service, base, path]) =>
      request<unknown>(base, `${path}${search}`).then((body) => readPage(body, 'jobs').items.map((raw) => toAdminJob(raw, service)))));
    if (outcomes.every((outcome) => outcome.status === 'rejected')) throw (outcomes[0] as PromiseRejectedResult).reason;
    const items = outcomes.flatMap((outcome) => (outcome.status === 'fulfilled' ? outcome.value : []));
    items.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    const unavailable = outcomes.map((outcome, index) => (outcome.status === 'rejected' ? JOB_SERVICES[index][0] : null)).filter((value): value is AdminJobService => !!value);
    return { items, unavailable };
  },
  async cancelJob(job: Pick<AdminJob, 'id' | 'type'>): Promise<void> {
    const [, base, path] = serviceOf(jobService(job));
    await request<unknown>(base, `${path}/${id(job.id)}/cancel`, { method: 'POST' });
  },
};

/** Grafana (ADM3) behind the same sign-in, when the deployment sets its address. */
export const GRAFANA_URL = process.env.REACT_APP_GRAFANA_URL ?? '';
