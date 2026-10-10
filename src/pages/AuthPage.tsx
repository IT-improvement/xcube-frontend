import { ArrowLeft } from 'lucide-react';
import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../api/authApi';
import { userMessage } from '../api/httpClient';
import { useAuth } from '../auth/AuthProvider';
import { Alert, Button, Logo, TextField } from '../components/ui';
import './auth.css';

const DEFAULT_REDIRECT = '/app';
const USERNAME_RULE = /^[A-Za-z0-9_.-]{3,50}$/;
/** iOS would otherwise capitalise or "correct" the first letter of the id. */
const ID_INPUT = { autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false } as const;

/**
 * Only same-origin app paths are allowed as a post-login destination: it must start with one "/".
 * "//host" and "/\\host" are rejected because browsers read both as another site.
 */
export function safeRedirect(value: string | null) {
  return value && value.startsWith('/') && !/^\/[/\\]/.test(value) ? value : DEFAULT_REDIRECT;
}

type LoginState = { username?: string; notice?: string } | null;
type Errors<K extends string> = Partial<Record<K, string>>;

/**
 * Inline validation without browser bubbles: errors show under the fields after the first submit
 * (or after leaving a filled field), the submit button stays enabled, and a failed submit moves focus
 * to the first field with an error.
 */
function useFormErrors<K extends string>(validate: () => Errors<K>) {
  const formRef = useRef<HTMLFormElement>(null);
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<K, boolean>>>({});
  const [focusTick, setFocusTick] = useState(0);
  const errors = validate();
  useEffect(() => {
    if (focusTick) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusTick]);
  return {
    formRef,
    shown: (key: K) => (submitted || touched[key] ? errors[key] : undefined),
    blur: (key: K, value: string) => () => { if (value) setTouched((current) => ({ ...current, [key]: true })); },
    /** Returns true when the form may be sent. */
    check: () => {
      setSubmitted(true);
      if (Object.values(errors).some(Boolean)) { setFocusTick((value) => value + 1); return false; }
      return true;
    },
  };
}

function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="xc auth">
      <aside className="auth__brand" aria-label="XCube 소개">
        <Logo />
        <div className="auth__brand-copy">
          <p className="auth__brand-title">위성 영상은 작게 보관하고, 필요한 곳과 날짜만 지도에서 봅니다</p>
          <p className="auth__brand-text">파일을 올리면 지도에서 바로 열리는 데이터로 바꾸고, AI가 찾은 물을 원본 옆에 놓아 줍니다.</p>
        </div>
        <figure className="auth__brand-shot">
          <img
            src={`${process.env.PUBLIC_URL ?? ''}/landing/daecheong-swipe.webp`}
            width={780}
            height={1148}
            decoding="async"
            alt="실제 Viewer 화면: 대청호를 구분선으로 나눠 왼쪽은 위성 원본, 오른쪽은 AI가 물로 찾은 곳을 파란 물색으로 표시"
          />
          <figcaption>대청호, 2024년 8월 14일 · 원본과 AI 결과</figcaption>
        </figure>
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
  // Login only checks that both fields are filled: older accounts may not follow today's sign-up rules.
  const form = useFormErrors<'username' | 'password'>(() => ({
    username: username.trim() ? undefined : '아이디를 입력하세요.',
    password: password ? undefined : '비밀번호를 입력하세요.',
  }));

  if (user) return <Navigate to={redirect} replace />;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.check()) return;
    setBusy(true);
    setError('');
    try {
      await authApi.login({ email: username.trim(), password });
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
      <form ref={form.formRef} className="auth__form" onSubmit={submit} aria-labelledby="auth-title" noValidate>
        <TextField
          label="아이디"
          name="username"
          required
          autoComplete="username"
          {...ID_INPUT}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          error={form.shown('username')}
        />
        <TextField
          label="비밀번호"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={form.shown('password')}
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
  const [values, setValues] = useState({ name: '', username: '', password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const form = useFormErrors<keyof typeof values>(() => ({
    name: values.name.trim() ? undefined : '이름을 입력하세요.',
    username: !values.username ? '아이디를 입력하세요.' : USERNAME_RULE.test(values.username) ? undefined : '영문·숫자·밑줄(_)·점(.)·하이픈(-)으로 3~50자를 입력하세요.',
    password: !values.password ? '비밀번호를 입력하세요.' : values.password.length >= 8 ? undefined : '비밀번호는 8자 이상이어야 합니다.',
    confirm: !values.confirm ? '비밀번호를 한 번 더 입력하세요.' : values.confirm === values.password ? undefined : '비밀번호가 일치하지 않습니다.',
  }));

  if (user) return <Navigate to={safeRedirect(params.get('redirect'))} replace />;

  const update = (key: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.check()) return;
    setBusy(true);
    setError('');
    try {
      await authApi.signup({ email: values.username, password: values.password, name: values.name.trim() });
      const loginPath = params.get('redirect') ? `/login?redirect=${encodeURIComponent(safeRedirect(params.get('redirect')))}` : '/login';
      navigate(loginPath, { state: { username: values.username, notice: '회원가입이 완료되었습니다. 로그인해 주세요.' } });
    } catch (cause) {
      setError(userMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="회원가입" subtitle="몇 가지 정보만 입력하면 바로 시작할 수 있습니다.">
      {error && <Alert tone="danger">{error}</Alert>}
      <form ref={form.formRef} className="auth__form" onSubmit={submit} aria-labelledby="auth-title" noValidate>
        <TextField label="이름" name="name" required maxLength={100} autoComplete="name" help="이름은 화면 표시에만 씁니다." value={values.name} onChange={update('name')} onBlur={form.blur('name', values.name)} error={form.shown('name')} />
        <TextField
          label="아이디"
          name="username"
          required
          maxLength={50}
          help="영문·숫자·밑줄(_)·점(.)·하이픈(-) 3~50자"
          autoComplete="username"
          {...ID_INPUT}
          value={values.username}
          onChange={update('username')}
          onBlur={form.blur('username', values.username)}
          error={form.shown('username')}
        />
        <TextField
          label="비밀번호"
          name="password"
          type="password"
          required
          help="8자 이상"
          autoComplete="new-password"
          value={values.password}
          onChange={update('password')}
          onBlur={form.blur('password', values.password)}
          error={form.shown('password')}
        />
        <TextField
          label="비밀번호 확인"
          name="confirm"
          type="password"
          required
          autoComplete="new-password"
          value={values.confirm}
          onChange={update('confirm')}
          onBlur={form.blur('confirm', values.confirm)}
          error={form.shown('confirm')}
        />
        <Button type="submit" size="lg" block disabled={busy}>{busy ? '가입하는 중…' : '회원가입'}</Button>
      </form>
      <p className="auth__switch">이미 계정이 있나요? <Link to={params.get('redirect') ? `/login?redirect=${encodeURIComponent(safeRedirect(params.get('redirect')))}` : '/login'}>로그인</Link></p>
    </AuthLayout>
  );
}
