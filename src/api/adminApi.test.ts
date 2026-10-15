/* Admin API mapping (UR-59, ADM contract §2): paths, bodies and lenient reading of the answers. */
import { adminApi, readPage, toAdminSystem, toAuditEntry, toUserSummary as adminApiSummary } from './adminApi';
import { session } from './httpClient';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
beforeEach(() => { sessionStorage.clear(); session.setToken('jwt'); jest.restoreAllMocks(); });

test('사용자 목록: 인증 서버 경로·필터·0부터 세는 page, {items,total}과 빠진 필드를 받아들인다', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(json({
    items: [
      { id: 7, loginId: 'kim', name: '김', role: 'PROJECT_USER', status: 'ACTIVE', language: 'ko', createdAt: '2026-10-01T00:00:00Z', lastLoginAt: null },
      { id: 8, username: 'old', role: 'USER' },
    ],
    total: 51,
  }));
  const page = await adminApi.listUsers({ q: ' ki ', role: 'PROJECT_USER', status: 'ACTIVE', page: 1 });
  expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8081/api/v1/admin/users?q=ki&role=PROJECT_USER&status=ACTIVE&page=1&size=50');
  expect(new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers).get('Authorization')).toBe('Bearer jwt');
  expect(page.total).toBe(51);
  expect(page.items[0]).toEqual({ id: '7', loginId: 'kim', name: '김', role: 'PROJECT_USER', status: 'ACTIVE', language: 'ko', createdAt: '2026-10-01T00:00:00Z', lastLoginAt: null, deletedAt: null });
  // An older answer: username instead of loginId, no status, name or dates.
  expect(page.items[1]).toMatchObject({ id: '8', loginId: 'old', name: '', status: 'ACTIVE', language: null, createdAt: null, lastLoginAt: null });
});

test('Spring page({content,totalElements})와 배열도 목록으로 읽는다', () => {
  expect(readPage({ content: [{ id: 1 }], totalElements: 9 })).toEqual({ items: [{ id: 1 }], total: 9 });
  expect(readPage([{ id: 1 }, { id: 2 }])).toEqual({ items: [{ id: 1 }, { id: 2 }], total: 2 });
  expect(readPage(null)).toEqual({ items: [], total: 0 });
  expect(readPage({ jobs: [{ id: 3 }] }, 'jobs')).toEqual({ items: [{ id: 3 }], total: 1 });
});

test('등급·상태 변경은 PATCH, 비밀번호 초기화는 POST이고 임시 비밀번호만 돌려준다, 탈퇴는 DELETE', async () => {
  const fetchMock = jest.spyOn(global, 'fetch')
    .mockResolvedValueOnce(json({ id: 7, loginId: 'kim', role: 'USER', status: 'ACTIVE' }))
    .mockResolvedValueOnce(json({ temporaryPassword: 'Tmp-abcdefgh123' }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  const updated = await adminApi.updateUser('7', { role: 'USER' });
  expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8081/api/v1/admin/users/7');
  expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('PATCH');
  expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({ role: 'USER' });
  expect(updated.role).toBe('USER');
  await expect(adminApi.resetPassword('7')).resolves.toEqual({ temporaryPassword: 'Tmp-abcdefgh123' });
  expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:8081/api/v1/admin/users/7/password-reset');
  expect((fetchMock.mock.calls[1][1] as RequestInit).method).toBe('POST');
  await adminApi.deleteUser('7');
  expect(fetchMock.mock.calls[2][0]).toBe('http://localhost:8081/api/v1/admin/users/7');
  expect((fetchMock.mock.calls[2][1] as RequestInit).method).toBe('DELETE');
});

test('Backoffice: 요약은 ids를 쉼표로, 한도는 PUT {quotaBytes|null}, 데이터 삭제는 관리자 경로', async () => {
  const fetchMock = jest.spyOn(global, 'fetch')
    .mockResolvedValueOnce(json([{ userId: 7, datasetCount: 3, projectCount: '1', usedBytes: 1024, quotaBytes: null, customQuota: true }]))
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  const summaries = await adminApi.userSummaries(['7', '8']);
  expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8082/api/v1/admin/backoffice/users/summary?ids=7,8');
  expect(summaries[0]).toEqual({ userId: '7', datasetCount: 3, projectCount: 1, usedBytes: 1024, quotaBytes: null, quotaIsDefault: false });
  expect(adminApiSummary({ userId: 8, customQuota: false }).quotaIsDefault).toBe(true);
  await adminApi.setQuota('7', 100 * 1024 ** 3);
  expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:8082/api/v1/admin/backoffice/users/7/quota');
  expect((fetchMock.mock.calls[1][1] as RequestInit).method).toBe('PUT');
  expect(JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))).toEqual({ quotaBytes: 107374182400 });
  await adminApi.setQuota('7', null);
  expect(JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body))).toEqual({ quotaBytes: null });
  await adminApi.deleteDataset('101');
  expect(fetchMock.mock.calls[3][0]).toBe('http://localhost:8082/api/v1/admin/backoffice/datasets/101');
  expect((fetchMock.mock.calls[3][1] as RequestInit).method).toBe('DELETE');
  // No ids, no request.
  await expect(adminApi.userSummaries([])).resolves.toEqual([]);
  expect(fetchMock).toHaveBeenCalledTimes(4);
});

test('데이터 목록은 소유자 id(ownerUserId)와 크기를 읽는다', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(json({ content: [{ datacubeId: 101, name: '대청호', kind: 'ORIGINAL', ownerUserId: 3, availabilityStatus: 'AVAILABLE' }], totalElements: 1 }));
  const page = await adminApi.listDatasets({ ownerId: '3', kind: 'ORIGINAL' });
  expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8082/api/v1/admin/backoffice/datasets?ownerId=3&kind=ORIGINAL&page=0&size=50');
  expect(page.items[0]).toEqual({ id: '101', name: '대청호', kind: 'ORIGINAL', ownerId: '3', ownerLoginId: null, xcubeDatasetId: null, sizeBytes: null, createdAt: null, status: 'AVAILABLE' });
});

test('작업: 세 서비스의 관리자 경로를 합치고, 응답하지 않는 서비스는 unavailable로, 취소는 그 작업의 서비스로', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.startsWith('http://localhost:8083')) return json([{ id: 1, name: 'gee', type: 'GEE_TO_ZARR', status: 'RUNNING', ownerUserId: 3, createdAt: '2026-10-02T00:00:00Z' }]);
    if (url.startsWith('http://localhost:8084')) return json({ items: [{ id: 5, name: 'ndwi', status: 'FAILED', ownerId: 4, createdAt: '2026-10-03T00:00:00Z' }] });
    return json({ code: 'INTERNAL_ERROR' }, 500);
  });
  const list = await adminApi.listJobs({ status: 'QUEUED,RUNNING' });
  expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
    'http://localhost:8083/api/v1/admin/generation/jobs?status=QUEUED%2CRUNNING&page=0&size=100',
    'http://localhost:8084/api/v1/admin/analysis/jobs?status=QUEUED%2CRUNNING&page=0&size=100',
    'http://localhost:8085/api/v1/admin/ai/jobs?status=QUEUED%2CRUNNING&page=0&size=100',
  ]);
  expect(list.items.map((job) => [job.id, job.type, job.ownerId, job.service])).toEqual([['5', 'FUSION', '4', 'FUSION'], ['1', 'GEE_TO_ZARR', '3', 'GENERATION']]);
  expect(list.unavailable).toEqual(['AI_WATER']);
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  await adminApi.cancelJob({ id: '5', type: 'FUSION' });
  expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('http://localhost:8084/api/v1/admin/analysis/jobs/5/cancel');
  await adminApi.cancelJob({ id: '9', type: 'AI_WATER' });
  expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('http://localhost:8085/api/v1/admin/ai/jobs/9/cancel');
  await adminApi.cancelJob({ id: '1', type: 'CAS500' });
  expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('http://localhost:8083/api/v1/admin/generation/jobs/1/cancel');
});

test('작업: 세 서비스가 모두 실패하면 첫 오류를 던진다', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue(json({ code: 'ROLE_FORBIDDEN', params: { required: 'ADMIN' } }, 403));
  await expect(adminApi.listJobs()).rejects.toMatchObject({ status: 403, code: 'ROLE_FORBIDDEN' });
});

test('시스템: 로컬 개발처럼 빠진 값은 null, 서비스·Pod 목록은 빈 배열', () => {
  expect(toAdminSystem({ services: [{ name: 'backoffice', ready: true, restarts: 2 }], node: null })).toEqual({
    services: [{ name: 'backoffice', ready: true, restarts: 2, startedAt: null }], xcubePods: [], node: null, disk: null, publicUrl: null,
  });
  expect(toAdminSystem(undefined).services).toEqual([]);
  expect(toAdminSystem({ node: { memoryUsedBytes: 5, memoryTotalBytes: 10, cpuMilli: null }, disk: { dataUsedBytes: 1, dataTotalBytes: 2 }, publicUrl: 'https://x.example' })).toMatchObject({
    node: { memoryUsedBytes: 5, memoryTotalBytes: 10, cpuMilli: null }, disk: { dataUsedBytes: 1, dataTotalBytes: 2 }, publicUrl: 'https://x.example',
  });
});

test('감사 기록: detail이 JSON 문자열이어도 객체로 읽는다', async () => {
  expect(toAuditEntry({ id: 1, adminUserId: 1, action: 'USER_ROLE_CHANGE', targetType: 'USER', targetId: 7, detail: '{"from":"USER","to":"ADMIN"}', createdAt: 'x' }).detail).toEqual({ from: 'USER', to: 'ADMIN' });
  const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input) => (String(input).startsWith('http://localhost:8081')
    ? json({ items: [{ id: 3, action: 'USER_UPDATE', createdAt: '2026-10-15T09:20:00Z' }], total: 3 })
    : json({ items: [{ id: 3, action: 'DATASET_DELETE', createdAt: '2026-10-15T10:00:00Z' }], total: 1 })));
  const page = await adminApi.listAudit(2);
  expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(['http://localhost:8081/api/v1/admin/audit?page=2&size=50', 'http://localhost:8082/api/v1/admin/backoffice/audit?page=2&size=50']);
  // Both records, newest first, ids kept apart by service.
  expect(page.items.map((entry) => [entry.id, entry.action])).toEqual([['backoffice:3', 'DATASET_DELETE'], ['auth:3', 'USER_UPDATE']]);
  expect(page.total).toBe(3);
});

test('ADM1 시스템 응답: 로컬처럼 services·xcubePods·node가 null이어도 빈 목록·null로 읽는다', () => {
  expect(toAdminSystem({ services: null, xcubePods: null, node: null, disk: { dataUsedBytes: 1, dataTotalBytes: 4 }, publicUrl: 'https://a.example' })).toEqual({
    services: [], xcubePods: [], node: null, disk: { dataUsedBytes: 1, dataTotalBytes: 4 }, publicUrl: 'https://a.example',
  });
});

test('접속 기록(MON1): 인증 서버 /api/v1/admin/access 경로·필터, 세션 강제 로그아웃은 POST, 빠진 값은 null·0', async () => {
  const fetchMock = jest.spyOn(global, 'fetch')
    .mockResolvedValueOnce(json({ items: [{ id: 5, userId: 2, loginId: 'kim', event: 'LOGIN_FAIL', reason: 'BAD_PASSWORD', ip: '203.0.113.1', country: 'KR', device: 'MOBILE', bot: false, createdAt: '2026-10-15T00:00:00Z' }], total: 31 }))
    .mockResolvedValueOnce(json({ items: [{ familyId: 'f-1', userId: 2, loginId: 'kim', current: true }], total: 1 }))
    .mockResolvedValueOnce(json({ loginId: 'kim' }))
    .mockResolvedValueOnce(json({ days: 7, totals: { success: 3 }, daily: [{ date: '2026-10-15', success: 3, fail: 0, uniqueIps: 1 }], warnings: [{ ip: '198.51.100.9', count: 21 }] }));
  const page = await adminApi.listLogins({ q: ' kim ', event: 'LOGIN_FAIL', from: '2026-10-01', to: '2026-10-15', page: 2 });
  expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8081/api/v1/admin/access/logins?q=kim&event=LOGIN_FAIL&from=2026-10-01&to=2026-10-15&page=2&size=50');
  expect(page.total).toBe(31);
  expect(page.items[0]).toMatchObject({ id: '5', userId: '2', reason: 'BAD_PASSWORD', os: null, browser: null, userAgent: null, bot: false });
  const sessions = await adminApi.listSessions();
  expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:8081/api/v1/admin/access/sessions');
  expect(sessions[0]).toMatchObject({ familyId: 'f-1', userId: '2', current: true, ip: null, bot: false });
  await adminApi.revokeSession('f-1');
  expect(fetchMock.mock.calls[2][0]).toBe('http://localhost:8081/api/v1/admin/access/sessions/f-1/revoke');
  expect((fetchMock.mock.calls[2][1] as RequestInit).method).toBe('POST');
  const summary = await adminApi.accessSummary(7);
  expect(fetchMock.mock.calls[3][0]).toBe('http://localhost:8081/api/v1/admin/access/summary?days=7');
  expect(summary.totals).toEqual({ success: 3, fail: 0, uniqueIps: 0, uniqueUsers: 0, botEvents: 0, activeSessions: 0 });
  expect(summary.warnings[0]).toEqual({ ip: '198.51.100.9', country: null, count: 21, from: null, to: null });
  expect(summary.rule).toEqual({ failCount: 20, windowMinutes: 10 });
  expect(summary.countries).toEqual([]);
});

test('Grafana 외부 접속 대시보드 주소는 기본 주소가 있을 때만 만든다', () => {
  const { grafanaAccessUrl } = jest.requireActual('./adminApi');
  expect(grafanaAccessUrl('')).toBe('');
  expect(grafanaAccessUrl(undefined)).toBe('');
  expect(grafanaAccessUrl('/grafana/')).toBe('/grafana/d/xcube-access');
  expect(grafanaAccessUrl('https://example.org/grafana')).toBe('https://example.org/grafana/d/xcube-access');
});
