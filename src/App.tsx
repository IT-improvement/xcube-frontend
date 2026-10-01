import './App.css';
import Viewer from './views/Viewer';
import { FormEvent, lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { authApi, authSession, LAST_ACTIVITY_KEY, User } from './api/authApi';
import { isAuthRejection, session, userMessage } from './api/httpClient';
const IDLE_TIMEOUT = 2 * 60 * 60 * 1000;
const TestViewer = lazy(() => import('./views/TestViewer'));

// component: Application 컴포넌트 //
function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [restoreError, setRestoreError] = useState(false);
  const restore = useCallback(async () => {
    setChecking(true);
    setRestoreError(false);
    try {
      const last = authSession.lastActivity();
      if (!last) { session.clear(); return; }
      if (Date.now() - last >= IDLE_TIMEOUT) { void idleLogout(setUser); return; }
      await authApi.refresh();
      setUser(await authApi.me());
    } catch (error) {
      if (isAuthRejection(error)) {
        session.clear();
        authSession.clear();
        setUser(null);
      } else { setRestoreError(true); }
    } finally { setChecking(false); }
  }, []);
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
        void idleLogout(setUser);
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
    }, 10 * 60 * 1000);
    return () => {
      ended = true;
      events.forEach((event) => window.removeEventListener(event, touch));
      window.removeEventListener('focus', checkIdle);
      window.removeEventListener('storage', storage);
      document.removeEventListener('visibilitychange', visibility);
      window.clearInterval(timer);
      window.clearTimeout(idleTimer);
    };
  }, [user]);
  if (window.location.pathname === '/test') return <Suspense fallback={<div className="app-state">테스트 지도를 불러오는 중…</div>}><TestViewer /></Suspense>;
  if (checking) return <div className="app-state" role="status">로그인 상태를 확인하고 있습니다…</div>;
  if (restoreError) return <div className="app-state" role="alert">서버에 연결할 수 없습니다<button onClick={() => void restore()}>다시 시도</button></div>;
  if (!user) return <AuthScreen onAuthenticated={setUser} />;
  return <Viewer user={user} onLogout={() => { void authApi.logout().catch(() => {}); setUser(null); }} />;
}

async function idleLogout(setUser: (user: User | null) => void) {
  // Local expiry must not wait for an unavailable logout endpoint.
  session.clear();
  authSession.clear();
  window.history.replaceState({}, '', '/login?reason=idle');
  setUser(null);
  try { await authApi.logout(); } catch { /* Local logout is already complete. */ }
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError('');
    const data = new FormData(event.currentTarget);
    const username = String(data.get('username') ?? ''); const password = String(data.get('password') ?? '');
    try {
      if (mode === 'signup') { await authApi.signup({ email: username, password, name: String(data.get('name') ?? '') }); setMode('login'); setError('회원가입이 완료되었습니다. 로그인해 주세요.'); }
      else { await authApi.login({ email: username, password }); onAuthenticated(await authApi.me()); }
    } catch (cause) { setError(userMessage(cause)); }
    finally { setBusy(false); }
  };
  return <main className="auth-page"><section className="auth-card" aria-labelledby="auth-title"><div className="auth-logo">◇</div><h1 id="auth-title">{mode === 'login' ? 'XCube 로그인' : 'XCube 회원가입'}</h1><p>시계열 데이터큐브를 탐색하고 분석하세요.</p><form onSubmit={submit}>{mode === 'signup' && <label>이름<input name="name" required maxLength={100} autoComplete="name" /></label>}<label>아이디<input name="username" required pattern="[A-Za-z0-9_.-]{3,50}" title="영문, 숫자, 밑줄, 점, 하이픈을 사용할 수 있습니다." autoComplete="username" /></label><label>비밀번호<input name="password" required type="password" minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>{error && <div className="auth-message" role="status">{error}</div>}<button className="auth-submit" disabled={busy}>{busy ? '처리 중…' : mode === 'login' ? '로그인' : '회원가입'}</button></form><button className="auth-switch" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}>{mode === 'login' ? '계정이 없나요? 회원가입' : '이미 계정이 있나요? 로그인'}</button></section></main>;
}

export default App;
