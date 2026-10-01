export type ApiErrorBody = { code?: string; message?: string; timestamp?: string; traceId?: string };
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public traceId?: string) { super(message); }
}

const TOKEN_KEY = 'xcube-access-token';
const AUTH_API_BASE_URL = process.env.REACT_APP_AUTH_API_URL ?? 'http://localhost:8081';
let refreshInFlight: Promise<string> | null = null;
export const session = {
  getToken: () => { try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; } },
  setToken: (token: string) => { try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* unavailable */ } },
  clear: () => { try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* unavailable */ } },
  clearIfCurrent: (token: string | null) => {
    try {
      if (token && sessionStorage.getItem(TOKEN_KEY) === token) {
        sessionStorage.removeItem(TOKEN_KEY);
        window.dispatchEvent(new CustomEvent('xcube:unauthorized'));
      }
    } catch { /* unavailable */ }
  },
};

/** Refresh is shared by every 401 handler and the periodic activity timer. */
export function refreshSession(): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const response = await fetch(`${AUTH_API_BASE_URL}/api/v1/auth/refresh`, { method: 'POST', credentials: 'include' });
      const body: any = response.headers.get('content-type')?.includes('json') ? await response.json().catch(() => ({})) : {};
      if (!response.ok || typeof body.accessToken !== 'string') {
        throw new ApiError(response.status, body.code ?? `HTTP_${response.status}`, body.message ?? response.statusText);
      }
      session.setToken(body.accessToken);
      return body.accessToken as string;
    })().finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

export async function request<T>(baseUrl: string, path: string, init: RequestInit = {}, authenticated = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const token = session.getToken();
  if (authenticated && token) headers.set('Authorization', `Bearer ${token}`);
  let response: Response;
  try { response = await fetch(`${baseUrl}${path}`, { ...init, headers }); }
  catch { throw new ApiError(0, 'NETWORK_ERROR', '서버에 연결할 수 없습니다.'); }
  if (authenticated && token && response.status === 401) {
    try {
      const refreshed = await refreshSession();
      headers.set('Authorization', `Bearer ${refreshed}`);
      response = await fetch(`${baseUrl}${path}`, { ...init, headers });
    } catch { session.clearIfCurrent(token); }
  }
  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get('content-type') ?? '';
  const body: any = contentType.includes('json') ? await response.json().catch(() => ({})) : {};
  if (!response.ok) {
    // A response from an older request must never erase a token issued by a
    // newer login. This can otherwise leave the UI looking logged in while
    // every following API call is unauthenticated.
    if (authenticated && response.status === 401) session.clearIfCurrent(token);
    throw new ApiError(response.status, body.code ?? `HTTP_${response.status}`, body.message ?? response.statusText, body.traceId);
  }
  return body as T;
}

export async function requestBlob(baseUrl: string, path: string): Promise<Blob> {
  const token = session.getToken();
  let response: Response;
  try { response = await fetch(`${baseUrl}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }); }
  catch { throw new ApiError(0, 'NETWORK_ERROR', '서버에 연결할 수 없습니다.'); }
  if (!response.ok && response.status === 401 && token) {
    try {
      const refreshed = await refreshSession();
      response = await fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${refreshed}` } });
    } catch { session.clearIfCurrent(token); }
  }
  if (!response.ok) { if (response.status === 401) session.clearIfCurrent(token); let body: ApiErrorBody = {}; try { body = await response.json(); } catch { /* binary error */ } throw new ApiError(response.status, body.code ?? `HTTP_${response.status}`, body.message ?? response.statusText, body.traceId); }
  return response.blob();
}

export function userMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return '예상하지 못한 오류가 발생했습니다.';
  if (error.status === 0) return '서버에 연결할 수 없습니다. 실행 상태를 확인해 주세요.';
  if (error.status === 401) return '세션이 만료되었습니다. 다시 로그인해 주세요.';
  if (error.status === 409) return error.code === 'DATASET_NOT_REGISTERED' ? 'XCube 등록을 동기화하는 중입니다. 잠시 후 다시 시도해 주세요.' : '이미 존재하거나 현재 상태와 충돌합니다.';
  if (error.status === 503) return 'XCube Server를 사용할 수 없습니다.';
  if (error.status === 504) return 'XCube Server 응답 시간이 초과되었습니다.';
  return error.message || '요청을 처리하지 못했습니다.';
}
