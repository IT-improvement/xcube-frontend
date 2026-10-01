import { refreshSession, request, session } from './httpClient';
export const AUTH_API_BASE_URL = process.env.REACT_APP_AUTH_API_URL ?? 'http://localhost:8081';
export const LAST_ACTIVITY_KEY = 'xcube-last-activity';
export const authSession = {
  touch: (at = Date.now()) => { try { localStorage.setItem(LAST_ACTIVITY_KEY, String(at)); } catch { /* unavailable */ } },
  lastActivity: () => { try { return Number(localStorage.getItem(LAST_ACTIVITY_KEY) ?? 0); } catch { return 0; } },
  clear: () => { try { localStorage.removeItem(LAST_ACTIVITY_KEY); } catch { /* unavailable */ } },
};
export type User = { id: number; email: string; name: string; role: string; status: string };
type Token = { accessToken: string; tokenType: string; expiresIn: number };
export const authApi = {
  signup: (input: { email: string; password: string; name: string }) => request<User>(AUTH_API_BASE_URL, '/api/v1/auth/signup', { method: 'POST', body: JSON.stringify(input) }, false),
  async login(input: { email: string; password: string }) { const token = await request<Token>(AUTH_API_BASE_URL, '/api/v1/auth/login', { method: 'POST', body: JSON.stringify(input), credentials: 'include' }, false); session.setToken(token.accessToken); authSession.touch(); return token; },
  async refresh() { const accessToken = await refreshSession(); return { accessToken, tokenType: 'Bearer', expiresIn: 900 }; },
  me: () => request<User>(AUTH_API_BASE_URL, '/api/v1/users/me'),
  async logout() { try { await request<void>(AUTH_API_BASE_URL, '/api/v1/auth/logout', { method: 'POST', credentials: 'include' }, false); } finally { session.clear(); authSession.clear(); } },
};
