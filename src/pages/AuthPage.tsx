import { ArrowLeft } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../api/authApi';
import { userMessage } from '../api/httpClient';
import { useAuth } from '../auth/AuthProvider';
import { Alert, Button, Logo, TextField } from '../components/ui';
import './auth.css';

const DEFAULT_REDIRECT = '/app/viewer';
const USERNAME_PATTERN = '[A-Za-z0-9_.\\-]{3,50}';

/** Only same-origin app paths are allowed as a post-login destination. */
export function safeRedirect(value: string | null) {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : DEFAULT_REDIRECT;
}

type LoginState = { username?: string; notice?: string } | null;

function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="xc auth">
      <aside className="auth__brand" aria-hidden>
        <Logo />
        <div className="auth__brand-copy">
          <p className="auth__brand-title">위성 데이터에서<br />물의 변화를 읽습니다</p>
          <p className="auth__brand-text">위성 영상을 Zarr 데이터큐브로 만들고, 시계열로 탐색하고, 수체를 추출해 비교합니다.</p>
        </div>
        <svg className="auth__brand-map" viewBox="0 0 320 180">
          <rect width="320" height="180" rx="12" fill="#fff" />
          <path d="M0 120 C60 96 92 140 150 118 S250 70 320 92 V180 H0Z" fill="#e8eef9" />
          <path d="M40 70 C70 54 110 66 120 84 S96 120 70 112 34 92 40 70Z" fill="var(--color-water)" opacity=".75" />
          <path d="M170 40 C190 30 228 34 236 52 S220 82 196 78 160 58 170 40Z" fill="var(--color-water)" opacity=".55" />
          <path d="M130 150 C170 132 214 146 256 128" fill="none" stroke="var(--color-water)" strokeWidth="5" strokeLinecap="round" opacity=".7" />
          <circle cx="196" cy="58" r="5" fill="var(--color-primary)" stroke="#fff" strokeWidth="2" />
        </svg>
      </aside>
      <main className="auth__main" id="main">
        <div className="auth__panel">
          <Link to="/" className="auth__back"><ArrowLeft size={16} aria-hidden />홈으로</Link>
          <div className="auth__mobile-logo"><Logo /></div>
          <h1 className="auth__title" id="auth-title">{title}</h1>
          <p className="auth__subtitle">{subtitle}</p>
          {children}
        </div>
      </main>
    </div>
  );
}

export function LoginPage() {
  const { user, signIn } = useAuth();
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LoginState;
  const redirect = safeRedirect(params.get('redirect'));
  const [username, setUsername] = useState(state?.username ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (user) return <Navigate to={redirect} replace />;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await authApi.login({ email: username, password });
      signIn(await authApi.me());
      navigate(redirect, { replace: true });
    } catch (cause) {
      setError(userMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const signupLink = params.get('redirect') ? `/signup?redirect=${encodeURIComponent(redirect)}` : '/signup';
  return (
    <AuthLayout title="로그인" subtitle="XCube 계정으로 로그인하세요.">
      {params.get('reason') === 'idle' && <Alert tone="warning">장시간 사용하지 않아 로그아웃되었습니다. 다시 로그인해 주세요.</Alert>}
      {state?.notice && <Alert tone="success">{state.notice}</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}
      <form className="auth__form" onSubmit={submit} aria-labelledby="auth-title">
        <TextField
          label="아이디"
          name="username"
          required
          pattern={USERNAME_PATTERN}
          title="영문, 숫자, 밑줄, 점, 하이픈을 3~50자로 사용할 수 있습니다."
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
        <TextField
          label="비밀번호"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <Button type="submit" size="lg" block disabled={busy}>{busy ? '로그인하는 중…' : '로그인'}</Button>
      </form>
      <p className="auth__switch">계정이 없나요? <Link to={signupLink}>회원가입</Link></p>
    </AuthLayout>
  );
}

export function SignupPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', username: '', password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mismatch = form.confirm.length > 0 && form.confirm !== form.password;

  if (user) return <Navigate to={safeRedirect(params.get('redirect'))} replace />;

  const update = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (form.password !== form.confirm) return;
    setBusy(true);
    setError('');
    try {
      await authApi.signup({ email: form.username, password: form.password, name: form.name });
      const loginPath = params.get('redirect') ? `/login?redirect=${encodeURIComponent(safeRedirect(params.get('redirect')))}` : '/login';
      navigate(loginPath, { state: { username: form.username, notice: '회원가입이 완료되었습니다. 로그인해 주세요.' } });
    } catch (cause) {
      setError(userMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="회원가입" subtitle="몇 가지 정보만 입력하면 바로 시작할 수 있습니다.">
      {error && <Alert tone="danger">{error}</Alert>}
      <form className="auth__form" onSubmit={submit} aria-labelledby="auth-title">
        <TextField label="이름" name="name" required maxLength={100} autoComplete="name" value={form.name} onChange={update('name')} />
        <TextField
          label="아이디"
          name="username"
          required
          pattern={USERNAME_PATTERN}
          title="영문, 숫자, 밑줄, 점, 하이픈을 3~50자로 사용할 수 있습니다."
          help="영문·숫자·밑줄(_)·점(.)·하이픈(-) 3~50자"
          autoComplete="username"
          value={form.username}
          onChange={update('username')}
        />
        <TextField
          label="비밀번호"
          name="password"
          type="password"
          required
          minLength={8}
          help="8자 이상"
          autoComplete="new-password"
          value={form.password}
          onChange={update('password')}
        />
        <TextField
          label="비밀번호 확인"
          name="confirm"
          type="password"
          required
          autoComplete="new-password"
          value={form.confirm}
          onChange={update('confirm')}
          error={mismatch ? '비밀번호가 일치하지 않습니다.' : undefined}
        />
        <Button type="submit" size="lg" block disabled={busy || mismatch}>{busy ? '가입하는 중…' : '회원가입'}</Button>
      </form>
      <p className="auth__switch">이미 계정이 있나요? <Link to={params.get('redirect') ? `/login?redirect=${encodeURIComponent(safeRedirect(params.get('redirect')))}` : '/login'}>로그인</Link></p>
    </AuthLayout>
  );
}
