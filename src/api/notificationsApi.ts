// Job-done notifications (UR-63 F4). Contract: FX-contract.md "F4", shapes from FX-A-report.md §3.
// Backoffice keeps them; Data Generation, Data Analysis and AI Processing add one when a job ends.
import { useMockApi } from './index';
import { request } from './httpClient';
import { BACKOFFICE_API_BASE_URL } from './backofficeApi';

export type NotificationType = 'JOB_SUCCEEDED' | 'JOB_FAILED' | 'EXPORT_READY' | 'COMPARE_DONE' | string;
export type AppNotification = { id: number | string; type: NotificationType; title: string; body?: string | null; link?: string | null; createdAt: string; readAt?: string | null };
export type NotificationPage = { items: AppNotification[]; total: number; page: number; size: number; unreadCount: number };
/** `mailEnabled`: whether the server can send mail at all (the e-mail switch is shown only then). */
export type NotificationPrefs = { emailOnDone: boolean; browser: boolean; mailEnabled: boolean };

/** Only in-app paths are followed (the server already refuses others; this keeps the screen safe too). */
export const safeLink = (link?: string | null) => (link && link.startsWith('/') && !/^\/[/\\]/.test(link) ? link : null);

// ---- Demo (REACT_APP_USE_MOCK_API)
const pause = (ms = 150) => new Promise((resolve) => window.setTimeout(resolve, ms));
const ago = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString();
const demoItems: AppNotification[] = [
  { id: 3, type: 'COMPARE_DONE', title: '비교 분석 완료: 시점 간 변화', body: '유지 12.84 km², 새로 생김 1.92 km², 사라짐 3.47 km²', link: '/app/viewer?dataset=landsat-change-024', createdAt: ago(4), readAt: null },
  { id: 2, type: 'EXPORT_READY', title: '내보내기 완료', body: 'GeoTIFF · 7일 동안 받을 수 있습니다', link: '/app/jobs', createdAt: ago(32), readAt: null },
  { id: 1, type: 'JOB_FAILED', title: '데이터 만들기 실패', body: '울산 행정구역 Shapefile', link: '/app/jobs', createdAt: ago(60 * 26), readAt: ago(60 * 25) },
];
let demoPrefs: NotificationPrefs = { emailOnDone: false, browser: true, mailEnabled: true };
const demoPage = (unread: boolean): NotificationPage => {
  const items = demoItems.filter((item) => !unread || !item.readAt);
  return { items: items.map((item) => ({ ...item })), total: items.length, page: 0, size: 20, unreadCount: demoItems.filter((item) => !item.readAt).length };
};

export const notificationsApi = {
  list(input: { unread?: boolean; page?: number; size?: number } = {}): Promise<NotificationPage> {
    if (useMockApi) return pause().then(() => demoPage(!!input.unread));
    const params = new URLSearchParams({ page: String(input.page ?? 0), size: String(input.size ?? 20) });
    if (input.unread) params.set('unread', 'true');
    return request<NotificationPage>(BACKOFFICE_API_BASE_URL, `/api/v1/notifications?${params}`);
  },
  unreadCount(): Promise<number> {
    if (useMockApi) return pause(80).then(() => demoItems.filter((item) => !item.readAt).length);
    return request<{ count: number }>(BACKOFFICE_API_BASE_URL, '/api/v1/notifications/unread-count').then((body) => Number(body?.count ?? 0));
  },
  markRead(id: AppNotification['id']): Promise<void> {
    if (useMockApi) return pause(80).then(() => { const item = demoItems.find((entry) => entry.id === id); if (item && !item.readAt) item.readAt = new Date().toISOString(); });
    return request<void>(BACKOFFICE_API_BASE_URL, `/api/v1/notifications/${encodeURIComponent(String(id))}/read`, { method: 'POST' });
  },
  markAllRead(): Promise<number> {
    if (useMockApi) return pause(80).then(() => { let count = 0; demoItems.forEach((item) => { if (!item.readAt) { item.readAt = new Date().toISOString(); count += 1; } }); return count; });
    return request<{ updated: number }>(BACKOFFICE_API_BASE_URL, '/api/v1/notifications/read-all', { method: 'POST' }).then((body) => Number(body?.updated ?? 0));
  },
  prefs(): Promise<NotificationPrefs> {
    if (useMockApi) return pause().then(() => ({ ...demoPrefs }));
    return request<NotificationPrefs>(BACKOFFICE_API_BASE_URL, '/api/v1/notifications/prefs');
  },
  updatePrefs(input: Partial<Pick<NotificationPrefs, 'emailOnDone' | 'browser'>>): Promise<NotificationPrefs> {
    if (useMockApi) return pause().then(() => { demoPrefs = { ...demoPrefs, ...input }; return { ...demoPrefs }; });
    return request<NotificationPrefs>(BACKOFFICE_API_BASE_URL, '/api/v1/notifications/prefs', { method: 'PUT', body: JSON.stringify(input) });
  },
};
