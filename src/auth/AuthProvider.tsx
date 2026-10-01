import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { authApi, authSession, LAST_ACTIVITY_KEY, User } from '../api/authApi';
import { isAuthRejection, session } from '../api/httpClient';

export const IDLE_TIMEOUT = 2 * 60 * 60 * 1000;
const REFRESH_INTERVAL = 10 * 60 * 1000;

/** checking: restoring the session · ready: known (user may be null) · unavailable: auth server unreachable */
export type AuthStatus = 'checking' | 'ready' | 'unavailable';

/** Why the last session ended, so guards can show the right login notice. */
export type EndReason = 'idle' | null;

type AuthContextValue = {
  user: User | null;
  status: AuthStatus;
  endReason: EndReason;
  retry: () => void;
  signIn: (user: User) => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

const isProtected = (pathname: string) => pathname.startsWith('/app');

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [endReason, setEndReason] = useState<EndReason>(null);
  const location = useLocation();
  // The current path lives in a ref so session logic does not re-run (restore
  // again, log out twice) just because the user moved between pages.
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;

  const idleLogout = useCallback(async () => {
    // Local expiry must not wait for an unavailable logout endpoint.
    session.clear();
    authSession.clear();
    // Inside the app, RequireAuth sends the user to /login?reason=idle; the
    // reason travels with the user state because React Router applies
    // navigation as a transition, after this urgent state update.
    if (isProtected(pathRef.current)) setEndReason('idle');
    setUser(null);
    try { await authApi.logout(); } catch { /* Local logout is already complete. */ }
  }, []);

  const restore = useCallback(async () => {
    setStatus('checking');
    try {
      const last = authSession.lastActivity();
      if (!last) { session.clear(); setStatus('ready'); return; }
      if (Date.now() - last >= IDLE_TIMEOUT) { setStatus('ready'); void idleLogout(); return; }
      await authApi.refresh();
      setUser(await authApi.me());
      setStatus('ready');
    } catch (error) {
      if (isAuthRejection(error)) {
        session.clear();
        authSession.clear();
        setUser(null);
        setStatus('ready');
      } else {
        setStatus('unavailable');
      }
    }
  }, [idleLogout]);

  useEffect(() => { void restore(); }, [restore]);

  useEffect(() => {
    // Refresh rejection already invalidated the session. Do not revoke the
    // shared cookie here: another tab may already have replaced it.
    const unauthorized = () => setUser(null);
    window.addEventListener('xcube:unauthorized', unauthorized);
    return () => window.removeEventListener('xcube:unauthorized', unauthorized);
  }, []);

  useEffect(() => {
    if (!user) return;
    let lastTouch = 0;
    let idleTimer: number;
    let ended = false;
    const checkIdle = () => {
      if (ended) return true;
      const remaining = authSession.lastActivity() + IDLE_TIMEOUT - Date.now();
      window.clearTimeout(idleTimer);
      if (remaining <= 0) {
        ended = true;
        void idleLogout();
        return true;
      }
      idleTimer = window.setTimeout(checkIdle, remaining);
      return false;
    };
    const touch = () => {
      if (checkIdle()) return;
      const now = Date.now();
      if (now - lastTouch >= 30_000) {
        authSession.touch(now);
        lastTouch = now;
        checkIdle();
      }
    };
    const visibility = () => { if (document.visibilityState === 'visible') checkIdle(); };
    const storage = (event: StorageEvent) => { if (event.key === LAST_ACTIVITY_KEY || event.key === null) checkIdle(); };
    const events: Array<keyof WindowEventMap> = ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'];
    events.forEach((event) => window.addEventListener(event, touch, { passive: true }));
    window.addEventListener('focus', checkIdle);
    window.addEventListener('storage', storage);
    document.addEventListener('visibilitychange', visibility);
    checkIdle();
    const timer = window.setInterval(async () => {
      if (checkIdle()) return;
      const token = session.getToken();
      try { await authApi.refresh(); }
      catch (error) {
        if (isAuthRejection(error) && session.getToken() === token) {
          session.clear(); authSession.clear(); setUser(null);
        }
      }
    }, REFRESH_INTERVAL);
    return () => {
      ended = true;
      events.forEach((event) => window.removeEventListener(event, touch));
      window.removeEventListener('focus', checkIdle);
      window.removeEventListener('storage', storage);
      document.removeEventListener('visibilitychange', visibility);
      window.clearInterval(timer);
      window.clearTimeout(idleTimer);
    };
  }, [user, idleLogout]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    status,
    endReason,
    retry: () => { void restore(); },
    signIn: (next) => { setUser(next); setStatus('ready'); setEndReason(null); },
    signOut: () => { void authApi.logout().catch(() => {}); setUser(null); },
  }), [user, status, endReason, restore]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
