import { ApiError, request, requestBlob, session, userMessage } from './httpClient';

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

const jsonResponse = (status: number, body: object = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
});

describe.each(['json', 'blob'])('%s refresh 실패 처리', (kind) => {
  const run = () => kind === 'json' ? request('', '/resource') : requestBlob('', '/resource');
  test('refresh fetch 네트워크 오류는 세션을 유지하고 NETWORK_ERROR를 반환한다', async () => {
    session.setToken('current');
    const unauthorized = jest.fn();
    window.addEventListener('xcube:unauthorized', unauthorized);
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse(401)).mockRejectedValueOnce(new TypeError('offline'));
    await expect(run()).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
    expect(session.getToken()).toBe('current');
    expect(unauthorized).not.toHaveBeenCalled();
    window.removeEventListener('xcube:unauthorized', unauthorized);
  });
  test('refresh 503은 원래 401 대신 503을 반환하고 세션을 유지한다', async () => {
    session.setToken('current');
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse(401)).mockResolvedValueOnce(jsonResponse(503));
    await expect(run()).rejects.toMatchObject({ status: 503 });
    expect(session.getToken()).toBe('current');
  });
  test.each([401, 403])('refresh %s는 세션 삭제와 unauthorized 이벤트를 발생시킨다', async (status) => {
    session.setToken('current');
    const unauthorized = jest.fn();
    window.addEventListener('xcube:unauthorized', unauthorized);
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse(401)).mockResolvedValueOnce(jsonResponse(status));
    await expect(run()).rejects.toMatchObject({ status });
    expect(session.getToken()).toBeNull();
    expect(unauthorized).toHaveBeenCalledTimes(1);
    window.removeEventListener('xcube:unauthorized', unauthorized);
  });
  test('refresh 성공 후 원래 API의 401만으로 새 세션을 지우지 않는다', async () => {
    session.setToken('current');
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse(401))
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: 'new' })).mockResolvedValueOnce(jsonResponse(401));
    await expect(run()).rejects.toMatchObject({ status: 401 });
    expect(session.getToken()).toBe('new');
  });
});

test.each(['logout', 'login'])('진행 중인 refresh의 늦은 성공은 새 %s 상태를 덮어쓰지 않는다', async (action) => {
  session.setToken('old');
  let finish!: (response: Response) => void;
  let started!: () => void;
  const refreshStarted = new Promise<void>((resolve) => { started = resolve; });
  jest.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse(401))
    .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; started(); }));
  const pending = request('', '/resource');
  await refreshStarted;
  if (action === 'logout') session.clear();
  else session.setToken('new-login');
  finish(jsonResponse(200, { accessToken: 'late-refresh' }));
  await expect(pending).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
  expect(session.getToken()).toBe(action === 'logout' ? null : 'new-login');
});
