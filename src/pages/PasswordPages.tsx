// Password reset (UR-63 F6): "비밀번호를 잊었나요?" asks for a reset link by login id or e-mail, and the link in that
// mail opens /reset-password?token=… to set a new password. When the server cannot send mail (mail-status), the
// request page says to ask the administrator instead of offering a form that can only fail.
import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { accountMail, MailStatus } from '../api/accountMail';
import { ApiError, userMessage } from '../api/httpClient';
import { Alert, Button, ButtonLink, TextField } from '../components/ui';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useLanguage } from '../i18n';
import { AuthLayout, useFormErrors } from './AuthPage';
import '../i18n/reset';

const ID_INPUT = { autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false } as const;
const TOKEN_CODES = new Set(['RESET_TOKEN_INVALID', 'RESET_TOKEN_USED', 'RESET_TOKEN_EXPIRED']);

export function ForgotPasswordPage() {
  const { lang, t } = useLanguage();
  useDocumentTitle(t('titles.forgotPassword'));
  const [status, setStatus] = useState<MailStatus | null>(null);
  const [statusFailed, setStatusFailed] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [disabled, setDisabled] = useState(false);
  useEffect(() => {
    let alive = true;
    accountMail.mailStatus().then((answer) => { if (alive) setStatus(answer); }, () => { if (alive) setStatusFailed(true); });
    return () => { alive = false; };
  }, []);
  const form = useFormErrors<'id'>(() => ({ id: value.trim() ? undefined : t('passwordReset.forgot.required') }));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.check()) return;
    setBusy(true);
    setError('');
    try {
      await accountMail.requestReset(value.trim());
      setSent(true);
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'MAIL_DISABLED') setDisabled(true);
      else setError(userMessage(cause, lang));
    } finally { setBusy(false); }
  };
  const off = disabled || status?.passwordResetEnabled === false;
  return (
    <AuthLayout title={t('passwordReset.forgot.title')} subtitle={t('passwordReset.forgot.subtitle')}>
      {!status && !statusFailed && !off ? (
        <p className="auth__note" role="status">{t('passwordReset.forgot.checking')}</p>
      ) : off ? (
        <div className="auth__actions">
          <Alert tone="info"><strong>{t('passwordReset.forgot.offTitle')}</strong> {t('passwordReset.forgot.offText')}</Alert>
          <ButtonLink to="/login" variant="line" size="lg" block>{t('passwordReset.forgot.toLogin')}</ButtonLink>
        </div>
      ) : sent ? (
        <div className="auth__actions">
          <Alert tone="success">{t('passwordReset.forgot.sent')}</Alert>
          <p className="auth__note">{t('passwordReset.forgot.sentHint')}</p>
          <ButtonLink to="/login" variant="line" size="lg" block>{t('passwordReset.forgot.toLogin')}</ButtonLink>
        </div>
      ) : (
        <>
          {error && <Alert tone="danger">{error}</Alert>}
          <form ref={form.formRef} className="auth__form" onSubmit={submit} aria-labelledby="auth-title" noValidate>
            <TextField label={t('passwordReset.forgot.label')} name="username" autoComplete="username" {...ID_INPUT} help={t('passwordReset.forgot.help')} value={value} onChange={(event) => setValue(event.target.value)} error={form.shown('id')} />
            <Button type="submit" size="lg" block disabled={busy}>{busy ? t('passwordReset.forgot.busy') : t('passwordReset.forgot.submit')}</Button>
          </form>
          <p className="auth__switch"><Link to="/login">{t('passwordReset.forgot.toLogin')}</Link></p>
        </>
      )}
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const { lang, t } = useLanguage();
  useDocumentTitle(t('titles.resetPassword'));
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const [values, setValues] = useState({ password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tokenError, setTokenError] = useState('');
  const [policy, setPolicy] = useState('');
  const form = useFormErrors<'password' | 'confirm'>(() => ({
    password: !values.password ? t('auth.errors.passwordRequired') : values.password.length >= 8 ? undefined : t('auth.errors.passwordShort'),
    confirm: !values.confirm ? t('auth.errors.confirmRequired') : values.confirm === values.password ? undefined : t('auth.errors.mismatch'),
  }));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.check()) return;
    setBusy(true);
    setError('');
    setPolicy('');
    try {
      await accountMail.confirmReset(token, values.password);
      navigate('/login', { replace: true, state: { notice: 'passwordReset' } });
    } catch (cause) {
      const text = userMessage(cause, lang);
      if (cause instanceof ApiError && TOKEN_CODES.has(cause.code)) setTokenError(text);
      else if (cause instanceof ApiError && cause.code === 'PASSWORD_POLICY') setPolicy(cause.params?.min == null ? t('auth.errors.passwordShort') : text);
      else setError(text);
      setBusy(false);
    }
  };
  if (!token || tokenError) {
    return (
      <AuthLayout title={t('passwordReset.reset.title')} subtitle={t('passwordReset.reset.subtitle')}>
        <div className="auth__actions">
          <Alert tone="warning">{tokenError || t('passwordReset.reset.noToken')}</Alert>
          <ButtonLink to="/forgot-password" size="lg" block>{t('passwordReset.reset.again')}</ButtonLink>
          <ButtonLink to="/login" variant="line" size="lg" block>{t('passwordReset.forgot.toLogin')}</ButtonLink>
        </div>
      </AuthLayout>
    );
  }
  const update = (key: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement>) => { setValues((current) => ({ ...current, [key]: event.target.value })); if (key === 'password') setPolicy(''); };
  return (
    <AuthLayout title={t('passwordReset.reset.title')} subtitle={t('passwordReset.reset.subtitle')}>
      {error && <Alert tone="danger">{error}</Alert>}
      <form ref={form.formRef} className="auth__form" onSubmit={submit} aria-labelledby="auth-title" noValidate>
        <TextField label={t('passwordReset.reset.newPassword')} name="new-password" type="password" autoComplete="new-password" help={t('auth.signup.passwordHelp')} value={values.password} onChange={update('password')} onBlur={form.blur('password', values.password)} error={form.shown('password') || policy || undefined} />
        <TextField label={t('auth.signup.confirm')} name="confirm-password" type="password" autoComplete="new-password" value={values.confirm} onChange={update('confirm')} onBlur={form.blur('confirm', values.confirm)} error={form.shown('confirm')} />
        <p className="auth__note">{t('passwordReset.reset.signOutAll')}</p>
        <Button type="submit" size="lg" block disabled={busy}>{busy ? t('passwordReset.reset.busy') : t('passwordReset.reset.submit')}</Button>
      </form>
    </AuthLayout>
  );
}
