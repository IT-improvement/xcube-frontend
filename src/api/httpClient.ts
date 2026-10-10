import { getLanguage, translate } from '../i18n/core';
import { codeText, preferSentence, serverText } from '../i18n/serverText';
import type { ServerParams } from '../i18n/serverText';
import type { Lang, TKey } from '../i18n/types';
/** Error body of every service (UR-53 stage 5): a stable code, its values and a Korean sentence. */
export type ApiErrorBody = { code?: string; message?: string; params?: ServerParams; timestamp?: string; traceId?: string };
export class ApiError extends Error {
  /** Dictionary text shown when the server sent no sentence (instead of the generic "couldn't be completed"). */
  fallbackKey?: TKey;
  constructor(public status: number, public code: string, message: string, public traceId?: string, public params?: ServerParams) { super(message); }
}

/** An ApiError from a failed response's body; the code, values and trace id are kept for userMessage. */
export const errorFromBody = (status: number, body: ApiErrorBody | null | undefined, fallbackMessage = '') =>
  new ApiError(status, body?.code ?? `HTTP_${status}`, body?.message ?? fallbackMessage, body?.traceId, body?.params ?? undefined);

export const isAuthRejection = (error: unknown): error is ApiError =>
  error instanceof ApiError && (error.status === 401 || error.status === 403);

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
    const token = session.getToken();
    refreshInFlight = (async () => {
      let response: Response;
      try { response = await fetch(`${AUTH_API_BASE_URL}/api/v1/auth/refresh`, { method: 'POST', credentials: 'include' }); }
      catch { throw new ApiError(0, 'NETWORK_ERROR', '서버에 연결할 수 없습니다.'); }
      const body: any = response.headers.get('content-type')?.includes('json') ? await response.json().catch(() => ({})) : {};
      if (!response.ok || typeof body.accessToken !== 'string') {
        throw errorFromBody(response.status, body, response.statusText);
      }
      // A late refresh must not restore a logged-out session or replace a new login.
      if (session.getToken() !== token) throw new ApiError(0, 'SESSION_CHANGED', '세션이 변경되었습니다.');
      session.setToken(body.accessToken);
      return body.accessToken as string;
    })().catch((error) => {
      if (isAuthRejection(error)) session.clearIfCurrent(token);
      throw error;
    }).finally(() => { refreshInFlight = null; });
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
  if (authenticated && token && response.status === 401 && session.getToken() === token) {
    try {
      const refreshed = await refreshSession();
      headers.set('Authorization', `Bearer ${refreshed}`);
      response = await fetch(`${baseUrl}${path}`, { ...init, headers });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(0, 'NETWORK_ERROR', '서버에 연결할 수 없습니다.');
    }
  }
  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get('content-type') ?? '';
  const body: any = contentType.includes('json') ? await response.json().catch(() => ({})) : {};
  if (!response.ok) {
    throw errorFromBody(response.status, body, response.statusText);
  }
  return body as T;
}

export async function requestBlob(baseUrl: string, path: string): Promise<Blob> {
  const token = session.getToken();
  let response: Response;
  try { response = await fetch(`${baseUrl}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }); }
  catch { throw new ApiError(0, 'NETWORK_ERROR', '서버에 연결할 수 없습니다.'); }
  if (!response.ok && response.status === 401 && token && session.getToken() === token) {
    try {
      const refreshed = await refreshSession();
      response = await fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${refreshed}` } });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(0, 'NETWORK_ERROR', '서버에 연결할 수 없습니다.');
    }
  }
  if (!response.ok) { let body: ApiErrorBody = {}; try { body = await response.json(); } catch { /* binary error */ } throw errorFromBody(response.status, body, response.statusText); }
  return response.blob();
}

/**
 * A failed request in plain words, in the current screen language unless one is given (components pass the
 * language of their context). Order (UR-53 stage 5): no connection and an expired session first; then
 * (1) the dictionary text of the server code, filled with its params; (2) the status mappings (409, 503,
 * 504); (3) the server sentence — Korean as given, English only without Hangul; (4) the code ("Something
 * went wrong (code X)"), the request's own fallback text, or a generic sentence. English never shows Korean.
 */
export function userMessage(error: unknown, lang: Lang = getLanguage()): string {
  const say = (key: TKey) => translate(lang, key);
  if (!(error instanceof ApiError)) return say('errors.unexpected');
  if (error.status === 0) return say('errors.network');
  if (error.status === 401) return say('errors.sessionExpired');
  const known = preferSentence(error.code) ? undefined : codeText(error.code, error.params, lang);
  if (known) return known;
  if (error.status === 409) return say(error.code === 'DATASET_NOT_REGISTERED' ? 'errors.syncing' : 'errors.conflict');
  if (error.status === 503) return say('errors.xcubeUnavailable');
  if (error.status === 504) return say('errors.xcubeTimeout');
  return serverText({ code: error.code, params: error.params, message: error.message }, lang, { fallback: 'errors.failed' }) || say(error.fallbackKey ?? 'errors.failed');
}
