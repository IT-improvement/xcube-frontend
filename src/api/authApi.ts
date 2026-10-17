import { refreshSession, request, session } from './httpClient';
import type { Lang } from '../i18n/types';
export const AUTH_API_BASE_URL = process.env.REACT_APP_AUTH_API_URL ?? 'http://localhost:8081';
export const LAST_ACTIVITY_KEY = 'xcube-last-activity';
export const authSession = {
  touch: (at = Date.now()) => { try { localStorage.setItem(LAST_ACTIVITY_KEY, String(at)); } catch { /* unavailable */ } },
  lastActivity: () => { try { return Number(localStorage.getItem(LAST_ACTIVITY_KEY) ?? 0); } catch { return 0; } },
  clear: () => { try { localStorage.removeItem(LAST_ACTIVITY_KEY); } catch { /* unavailable */ } },
};
/** `language`: the screen language saved to the account (S11), null when none was chosen yet. */
export type User = { id: number; email: string; name: string; role: string; status: string; language?: Lang | null };
/** PATCH /users/me: either field (at least one), name 1–50 characters after trim. */
export type ProfileUpdate = { name?: string; language?: Lang | null };
type Token = { accessToken: string; tokenType: string; expiresIn: number };
export const authApi = {
  /** `contactEmail` (UR-63 F6, optional): a code goes there and the answer names it as `pendingEmail`. */
  signup: (input: { email: string; password: string; name: string; contactEmail?: string }) => request<User & { pendingEmail?: string | null }>(AUTH_API_BASE_URL, '/api/v1/auth/signup', { method: 'POST', body: JSON.stringify(input) }, false),
  async login(input: { email: string; password: string }) { const token = await request<Token>(AUTH_API_BASE_URL, '/api/v1/auth/login', { method: 'POST', body: JSON.stringify(input), credentials: 'include' }, false); session.setToken(token.accessToken); authSession.touch(); return token; },
  async refresh() { const accessToken = await refreshSession(); return { accessToken, tokenType: 'Bearer', expiresIn: 900 }; },
  me: () => request<User>(AUTH_API_BASE_URL, '/api/v1/users/me'),
  updateMe: (input: ProfileUpdate) => request<User>(AUTH_API_BASE_URL, '/api/v1/users/me', { method: 'PATCH', body: JSON.stringify(input) }),
  /**
   * 204 on success. The server signs out the user's other sessions and keeps this one (it knows which from the
   * access token's session id, as the refresh cookie is scoped to /api/v1/auth).
   */
  changePassword: (input: { currentPassword: string; newPassword: string }) =>
    request<void>(AUTH_API_BASE_URL, '/api/v1/users/me/password', { method: 'POST', body: JSON.stringify(input) }),
  async logout() { try { await request<void>(AUTH_API_BASE_URL, '/api/v1/auth/logout', { method: 'POST', credentials: 'include' }, false); } finally { session.clear(); authSession.clear(); } },
};
