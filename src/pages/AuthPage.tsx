import { ArrowLeft } from 'lucide-react';
import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../api/authApi';
import { ApiError, userMessage } from '../api/httpClient';
import { useAuth } from '../auth/AuthProvider';
import { Alert, Button, LanguageSwitch, Logo, TextField } from '../components/ui';
import './auth.css';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Lang, TFunction, useLanguage } from '../i18n';
import { caseDate } from './caseDate';

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

/** `notice: 'signedUp'` shows the sign-up confirmation (a key, so it follows the language). */
type LoginState = { username?: string; notice?: 'signedUp' } | null;
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

/**
 * Known auth server codes get our own sentence; a lost connection says so. Anything else keeps the
 * shared Korean message, or a plain English one (server sentences are not translated yet).
 */
function authError(cause: unknown, t: TFunction, lang: Lang) {
  if (cause instanceof ApiError) {
    if (cause.code === 'INVALID_CREDENTIALS') return t('auth.errors.invalidCredentials');
    if (cause.code === 'EMAIL_ALREADY_EXISTS') return t('auth.errors.usernameTaken');
    if (cause.status === 0) return t('auth.errors.network');
  }
  return lang === 'ko' ? userMessage(cause) : t('auth.errors.unexpected');
}

function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const { lang, t } = useLanguage();
  return (
    <div className="xc auth">
      <aside className="auth__brand" aria-label={t('auth.brandLabel')}>
        <Logo />
        <div className="auth__brand-copy">
          <p className="auth__brand-title">{t('landing.hero.title')}</p>
          <p className="auth__brand-text">{t('auth.brandText')}</p>
        </div>
        <figure className="auth__brand-shot">
          <img
            src={`${process.env.PUBLIC_URL ?? ''}/landing/daecheong-swipe.webp`}
            width={780}
            height={1148}
            decoding="async"
            alt={t('auth.brandAlt')}
          />
          <figcaption>{t('auth.brandCaption', { date: caseDate(lang) })}</figcaption>
        </figure>
      </aside>
      <main className="auth__main" id="main">
        <div className="auth__panel">
          <div className="auth__top">
            <Link to="/" className="auth__back"><ArrowLeft size={16} aria-hidden />{t('auth.back')}</Link>
            <LanguageSwitch />
          </div>
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
  const { lang, t } = useLanguage();
  useDocumentTitle(t('titles.login'));
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
    username: username.trim() ? undefined : t('auth.errors.usernameRequired'),
    password: password ? undefined : t('auth.errors.passwordRequired'),
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
      setError(authError(cause, t, lang));
    } finally {
      setBusy(false);
    }
  };

  const signupLink = params.get('redirect') ? `/signup?redirect=${encodeURIComponent(redirect)}` : '/signup';
  return (
    <AuthLayout title={t('auth.login.title')} subtitle={t('auth.login.subtitle')}>
      {params.get('reason') === 'idle' && <Alert tone="warning">{t('auth.login.idle')}</Alert>}
      {state?.notice === 'signedUp' && <Alert tone="success">{t('auth.signup.done')}</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}
      <form ref={form.formRef} className="auth__form" onSubmit={submit} aria-labelledby="auth-title" noValidate>
        <TextField
          label={t('auth.username')}
          name="username"
          required
          autoComplete="username"
          {...ID_INPUT}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          error={form.shown('username')}
        />
        <TextField
          label={t('auth.password')}
          name="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={form.shown('password')}
        />
        <Button type="submit" size="lg" block disabled={busy}>{busy ? t('auth.login.busy') : t('auth.login.submit')}</Button>
      </form>
      <p className="auth__switch">{t('auth.login.noAccount')} <Link to={signupLink}>{t('auth.login.toSignup')}</Link></p>
    </AuthLayout>
  );
}

export function SignupPage() {
  const { lang, t } = useLanguage();
  useDocumentTitle(t('titles.signup'));
  const { user } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [values, setValues] = useState({ name: '', username: '', password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const form = useFormErrors<keyof typeof values>(() => ({
    name: values.name.trim() ? undefined : t('auth.errors.nameRequired'),
    username: !values.username ? t('auth.errors.usernameRequired') : USERNAME_RULE.test(values.username) ? undefined : t('auth.errors.usernameRule'),
    password: !values.password ? t('auth.errors.passwordRequired') : values.password.length >= 8 ? undefined : t('auth.errors.passwordShort'),
    confirm: !values.confirm ? t('auth.errors.confirmRequired') : values.confirm === values.password ? undefined : t('auth.errors.mismatch'),
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
      navigate(loginPath, { state: { username: values.username, notice: 'signedUp' } as LoginState });
    } catch (cause) {
      setError(authError(cause, t, lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title={t('auth.signup.title')} subtitle={t('auth.signup.subtitle')}>
      {error && <Alert tone="danger">{error}</Alert>}
      <form ref={form.formRef} className="auth__form" onSubmit={submit} aria-labelledby="auth-title" noValidate>
        <TextField label={t('auth.signup.name')} name="name" required maxLength={100} autoComplete="name" help={t('auth.signup.nameHelp')} value={values.name} onChange={update('name')} onBlur={form.blur('name', values.name)} error={form.shown('name')} />
        <TextField
          label={t('auth.username')}
          name="username"
          required
          maxLength={50}
          help={t('auth.signup.usernameHelp')}
          autoComplete="username"
          {...ID_INPUT}
          value={values.username}
          onChange={update('username')}
          onBlur={form.blur('username', values.username)}
          error={form.shown('username')}
        />
        <TextField
          label={t('auth.password')}
          name="password"
          type="password"
          required
          help={t('auth.signup.passwordHelp')}
          autoComplete="new-password"
          value={values.password}
          onChange={update('password')}
          onBlur={form.blur('password', values.password)}
          error={form.shown('password')}
        />
        <TextField
          label={t('auth.signup.confirm')}
          name="confirm"
          type="password"
          required
          autoComplete="new-password"
          value={values.confirm}
          onChange={update('confirm')}
          onBlur={form.blur('confirm', values.confirm)}
          error={form.shown('confirm')}
        />
        <Button type="submit" size="lg" block disabled={busy}>{busy ? t('auth.signup.busy') : t('auth.signup.submit')}</Button>
      </form>
      <p className="auth__switch">{t('auth.signup.haveAccount')} <Link to={params.get('redirect') ? `/login?redirect=${encodeURIComponent(safeRedirect(params.get('redirect')))}` : '/login'}>{t('auth.signup.toLogin')}</Link></p>
    </AuthLayout>
  );
}
