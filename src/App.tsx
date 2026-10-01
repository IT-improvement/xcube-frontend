import './App.css';
import Viewer from './views/Viewer';
import { FormEvent, lazy, Suspense, useEffect, useState } from 'react';
import { authApi, authSession, User } from './api/authApi';
import { session, userMessage } from './api/httpClient';
const TestViewer = lazy(() => import('./views/TestViewer'));

// component: Application 컴포넌트 //
function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    const restore = async () => {
      try {
        const last = authSession.lastActivity();
        if (!last || Date.now() - last >= 2 * 60 * 60 * 1000) throw new Error('idle');
        await authApi.refresh();
        setUser(await authApi.me());
      } catch {
        session.clear();
        authSession.clear();
      } finally { setChecking(false); }
    };
    restore();
  }, []);
  useEffect(() => {
    const unauthorized = () => setUser(null);
    window.addEventListener('xcube:unauthorized', unauthorized);
    return () => window.removeEventListener('xcube:unauthorized', unauthorized);
  }, []);
  useEffect(() => {
    if (!user) return;
    let lastTouch = 0;
    const touch = () => {
      const now = Date.now();
      const lastActivity = authSession.lastActivity();
      if (lastActivity && now - lastActivity >= 2 * 60 * 60 * 1000) {
        void idleLogout(setUser);
        return;
      }
      if (now - lastTouch >= 30_000) { authSession.touch(now); lastTouch = now; }
    };
    const events: Array<keyof WindowEventMap> = ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'];
    events.forEach((event) => window.addEventListener(event, touch, { passive: true }));
    const timer = window.setInterval(async () => {
      const idle = Date.now() - authSession.lastActivity();
      if (idle >= 2 * 60 * 60 * 1000) {
        await idleLogout(setUser);
        return;
      }
      try { await authApi.refresh(); }
      catch { session.clear(); authSession.clear(); setUser(null); }
    }, 10 * 60 * 1000);
    return () => {
      events.forEach((event) => window.removeEventListener(event, touch));
      window.clearInterval(timer);
    };
  }, [user]);
  if (window.location.pathname === '/test') return <Suspense fallback={<div className="app-state">테스트 지도를 불러오는 중…</div>}><TestViewer /></Suspense>;
  if (checking) return <div className="app-state" role="status">로그인 상태를 확인하고 있습니다…</div>;
  if (!user) return <AuthScreen onAuthenticated={setUser} />;
  return <Viewer user={user} onLogout={() => { authApi.logout(); setUser(null); }} />;
}

async function idleLogout(setUser: (user: User | null) => void) {
  await authApi.logout();
  setUser(null);
  window.history.replaceState({}, '', '/login?reason=idle');
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
