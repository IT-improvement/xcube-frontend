import { ApiError, request, session, userMessage } from './httpClient';

beforeEach(() => { sessionStorage.clear(); jest.restoreAllMocks(); });

test('인증 요청에 session token을 추가한다', async () => {
  session.setToken('access-token');
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }));
  await request('http://localhost:8082', '/api/v1/projects');
  const init = fetchMock.mock.calls[0][1] as RequestInit;
  expect(new Headers(init.headers).get('Authorization')).toBe('Bearer access-token');
});

test('401이면 session을 지우고 구조화 오류를 반환한다', async () => {
  session.setToken('expired');
  jest.spyOn(global, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ code: 'UNAUTHORIZED', message: 'Authentication required', traceId: 'trace-1' }), { status: 401, headers: { 'content-type': 'application/json' } }));
  await expect(request('http://localhost:8081', '/api/v1/users/me')).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED', traceId: 'trace-1' });
  expect(session.getToken()).toBeNull();
});

test('이전 요청의 늦은 401은 새 로그인 token을 지우지 않는다', async () => {
  session.setToken('old-token');
  let finish!: (response: Response) => void;
  let call = 0;
  jest.spyOn(global, 'fetch').mockImplementation(() => {
    call += 1;
    if (call === 1) return new Promise((resolve) => { finish = resolve; });
    return Promise.resolve(new Response(JSON.stringify({ code: 'UNAUTHORIZED' }), { status: 401, headers: { 'content-type': 'application/json' } }));
  });
  const oldRequest = request('http://localhost:8082', '/api/v1/projects');
  session.setToken('new-token');
  finish(new Response(JSON.stringify({ code: 'UNAUTHORIZED' }), { status: 401, headers: { 'content-type': 'application/json' } }));
  await expect(oldRequest).rejects.toMatchObject({ status: 401 });
  expect(session.getToken()).toBe('new-token');
});

test('401이면 refresh 후 원 요청을 한 번 재시도하고 새 token을 유지한다', async () => {
  session.setToken('expired');
  const fetchMock = jest.spyOn(global, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'UNAUTHORIZED' }), { status: 401, headers: { 'content-type': 'application/json' } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ accessToken: 'refreshed' }), { status: 200, headers: { 'content-type': 'application/json' } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }));
  await expect(request<{ ok: boolean }>('http://localhost:8082', '/api/v1/projects')).resolves.toEqual({ ok: true });
  expect(session.getToken()).toBe('refreshed');
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(new Headers(fetchMock.mock.calls[2][1]?.headers).get('Authorization')).toBe('Bearer refreshed');
});

test('동시에 발생한 401은 refresh 요청 하나만 공유한다', async () => {
  session.setToken('expired');
  const fetchMock = jest.spyOn(global, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'UNAUTHORIZED' }), { status: 401, headers: { 'content-type': 'application/json' } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'UNAUTHORIZED' }), { status: 401, headers: { 'content-type': 'application/json' } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ accessToken: 'refreshed' }), { status: 200, headers: { 'content-type': 'application/json' } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ one: true }), { status: 200, headers: { 'content-type': 'application/json' } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ two: true }), { status: 200, headers: { 'content-type': 'application/json' } }));
  await expect(Promise.all([
    request('http://localhost:8082', '/api/v1/projects'),
    request('http://localhost:8082', '/api/v1/datasets'),
  ])).resolves.toHaveLength(2);
  expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/auth/refresh'))).toHaveLength(1);
});

test('XCube proxy 오류를 사용자 메시지로 구분한다', () => {
  expect(userMessage(new ApiError(409, 'DATASET_NOT_REGISTERED', 'conflict'))).toContain('동기화');
  expect(userMessage(new ApiError(503, 'XCUBE_UNAVAILABLE', 'down'))).toContain('사용할 수 없습니다');
  expect(userMessage(new ApiError(504, 'XCUBE_TIMEOUT', 'timeout'))).toContain('초과');
});
