// Account settings sections added with UR-63: notifications (F4), contact e-mail with a six-digit code (F6) and
// deleting one's own account (F6). Same ruled-row layout as the other S11 sections (SettingsSection).
import { Check, Mail, Trash2 } from 'lucide-react';
import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { accountMail, CODE_RULE, ContactEmail, EMAIL_RULE } from '../../api/accountMail';
import { ApiError, userMessage } from '../../api/httpClient';
import { NotificationPrefs, notificationsApi } from '../../api/notificationsApi';
import { useAuth } from '../../auth/AuthProvider';
import { Alert, Button, TextField } from '../../components/ui';
import { Badge, ConfirmDialog, Dialog, Skeleton } from '../../components/ui/kit';
import { useLanguage } from '../../i18n';
import { browserPermission, BrowserPermission, requestBrowserPermission, setBrowserOff } from '../browserNotify';
import { Load, useLoad } from '../useLoad';
import '../../i18n/fx';

export function SettingsSection({ id, title, text, children, tone }: { id: string; title: string; text: string; children: ReactNode; tone?: 'danger' }) {
  return (
    <section className={`settings__section${tone ? ` settings__section--${tone}` : ''}`} aria-labelledby={id} id={id.replace(/-title$/, '')}>
      <div className="settings__intro">
        <h2 id={id} className="settings__title">{title}</h2>
        <p className="settings__text">{text}</p>
      </div>
      <div className="settings__body">{children}</div>
    </section>
  );
}

// ---- Notifications (F4) -------------------------------------------------------------------------------------

export function NotifySection({ contact }: { contact: ContactEmail | null }) {
  const { lang, t } = useLanguage();
  const prefs = useLoad<NotificationPrefs>(() => notificationsApi.prefs());
  const [permission, setPermission] = useState<BrowserPermission>(() => browserPermission());
  const [saving, setSaving] = useState<'' | 'browser' | 'emailOnDone'>('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const save = async (field: 'browser' | 'emailOnDone', value: boolean) => {
    setSaving(field);
    setSaved(false);
    setError('');
    try {
      const next = await notificationsApi.updatePrefs({ [field]: value });
      prefs.setData(() => next);
      if (field === 'browser') setBrowserOff(!next.browser);
      setSaved(true);
    } catch (cause) { setError(userMessage(cause, lang)); } finally { setSaving(''); }
  };
  const allow = async () => setPermission(await requestBrowserPermission());
  const data = prefs.data;
  return (
    <SettingsSection id="settings-notify-title" title={t('notifySettings.title')} text={t('notifySettings.text')}>
      {prefs.loading && !data ? <Skeleton lines={2} label={t('notifySettings.loading')} />
        : prefs.error ? <Alert tone="danger">{prefs.error} <Button variant="line" size="sm" onClick={prefs.reload}>{t('common.retry')}</Button></Alert>
          : data ? (
            <div className="settings__form">
              <div className="settings-check">
                <label className="xc-check">
                  <input type="checkbox" checked={data.browser} disabled={saving === 'browser'} onChange={(event) => save('browser', event.target.checked)} aria-describedby="notify-browser-help" />
                  <span>{t('notifySettings.browser')}</span>
                </label>
                <p id="notify-browser-help" className="xc-hint">
                  {t(`notifySettings.permission.${permission}`)}
                  {data.browser && permission === 'default' && <> <button type="button" className="xc-btn xc-btn--line xc-btn--sm" onClick={allow}>{t('notifySettings.allow')}</button></>}
                </p>
              </div>
              {data.mailEnabled && (
                <div className="settings-check">
                  <label className="xc-check">
                    <input type="checkbox" checked={data.emailOnDone} disabled={saving === 'emailOnDone'} onChange={(event) => save('emailOnDone', event.target.checked)} aria-describedby="notify-mail-help" />
                    <span>{t('notifySettings.email')}</span>
                  </label>
                  <p id="notify-mail-help" className="xc-hint">
                    {contact?.verified && contact.email ? t('notifySettings.emailTo', { email: contact.email }) : t('notifySettings.emailNeedsAddress')}
                  </p>
                </div>
              )}
              {error && <Alert tone="danger">{error}</Alert>}
              {saved && !error && <p className="settings__saved" role="status"><Check size={14} aria-hidden />{t('notifySettings.saved')}</p>}
            </div>
          ) : null}
    </SettingsSection>
  );
}

// ---- Contact e-mail (F6) ------------------------------------------------------------------------------------

const EMAIL_FIELD_CODES = new Set(['INVALID_EMAIL', 'EMAIL_UNCHANGED', 'EMAIL_IN_USE']);
const CODE_FIELD_CODES = new Set(['CODE_INVALID', 'CODE_ATTEMPTS_EXCEEDED', 'CODE_EXPIRED', 'CODE_NOT_FOUND', 'EMAIL_IN_USE']);

export function ContactEmailSection({ contact, onToast }: { contact: Load<ContactEmail>; onToast: (text: string) => void }) {
  const { lang, t } = useLanguage();
  const data = contact.data;
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [emailError, setEmailError] = useState('');
  const [codeError, setCodeError] = useState('');
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState<'' | 'send' | 'verify'>('');
  const [removing, setRemoving] = useState(false);
  const pending = data?.pendingEmail ?? null;
  useEffect(() => { if (pending) setCode(''); }, [pending]);

  const set = (next: ContactEmail | null) => contact.setData(() => next);
  const send = async (event?: FormEvent, address = email.trim()) => {
    event?.preventDefault();
    setFailure('');
    if (!EMAIL_RULE.test(address)) { setEmailError(t('accountMail.emailInvalid')); return; }
    setEmailError('');
    setBusy('send');
    try {
      set(await accountMail.startVerification(address));
      setEditing(false);
      onToast(t('accountMail.sentToast'));
    } catch (cause) {
      const text = userMessage(cause, lang);
      if (cause instanceof ApiError && EMAIL_FIELD_CODES.has(cause.code)) setEmailError(text); else setFailure(text);
    } finally { setBusy(''); }
  };
  const verify = async (event: FormEvent) => {
    event.preventDefault();
    setFailure('');
    if (!CODE_RULE.test(code.trim())) { setCodeError(t('accountMail.codeRule')); return; }
    setCodeError('');
    setBusy('verify');
    try {
      set(await accountMail.verify(code.trim()));
      setCode('');
      onToast(t('accountMail.verifiedToast'));
    } catch (cause) {
      const text = userMessage(cause, lang);
      if (cause instanceof ApiError && CODE_FIELD_CODES.has(cause.code)) {
        setCodeError(text);
        // A spent code is gone on the server too: read the state again so the form follows.
        if (cause.code === 'CODE_ATTEMPTS_EXCEEDED' || cause.code === 'CODE_EXPIRED') accountMail.contact().then(set, () => {});
      } else setFailure(text);
    } finally { setBusy(''); }
  };
  const remove = async () => {
    await accountMail.remove();
    set(data ? { ...data, email: null, verified: false, pendingEmail: null, attemptsLeft: null } : null);
    setRemoving(false);
    onToast(t('accountMail.removedToast'));
  };

  const mailOff = !!data && !data.mailEnabled;
  return (
    <SettingsSection id="settings-email-title" title={t('accountMail.title')} text={t('accountMail.text')}>
      {contact.loading && !data ? <Skeleton lines={2} label={t('accountMail.loading')} />
        : contact.error ? <Alert tone="danger">{contact.error} <Button variant="line" size="sm" onClick={contact.reload}>{t('common.retry')}</Button></Alert>
          : data ? (
            <div className="settings__form">
              {data.email && data.verified && (
                <div className="settings__readonly">
                  <span className="settings__label">{t('accountMail.current')}</span>
                  <span className="settings__value contact-email"><Mail size={15} aria-hidden />{data.email} <Badge tone="success">{t('accountMail.verified')}</Badge></span>
                </div>
              )}
              {mailOff && <Alert tone="info">{t('accountMail.mailOff')}</Alert>}
              {!mailOff && pending ? (
                <form className="settings__form" onSubmit={verify} noValidate>
                  <p className="settings__value">{t('accountMail.sent', { email: pending })}</p>
                  <TextField
                    label={t('accountMail.code')}
                    name="one-time-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    help={data.attemptsLeft != null ? t('accountMail.codeHelpLeft', { count: data.attemptsLeft }) : t('accountMail.codeHelp')}
                    value={code}
                    onChange={(event) => { setCode(event.target.value.replace(/\D/g, '')); setCodeError(''); }}
                    error={codeError || undefined}
                    className="code-field"
                  />
                  <div className="settings__actions settings__actions--wrap">
                    <Button type="submit" disabled={busy !== ''}>{busy === 'verify' ? t('accountMail.verifying') : t('accountMail.verify')}</Button>
                    <Button variant="line" disabled={busy !== ''} onClick={() => send(undefined, pending)}>{busy === 'send' ? t('accountMail.sending') : t('accountMail.resend')}</Button>
                    <Button variant="quiet" disabled={busy !== ''} onClick={() => setEditing(true)}>{t('accountMail.otherAddress')}</Button>
                  </div>
                </form>
              ) : null}
              {!mailOff && (editing || (!pending && !(data.email && data.verified))) ? (
                <form className="settings__form" onSubmit={send} noValidate>
                  <TextField
                    label={t(data.email ? 'accountMail.newEmail' : 'accountMail.email')}
                    name="email"
                    type="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    help={t('accountMail.emailHelp')}
                    value={email}
                    onChange={(event) => { setEmail(event.target.value); setEmailError(''); }}
                    error={emailError || undefined}
                  />
                  <div className="settings__actions">
                    <Button type="submit" disabled={busy !== ''}>{busy === 'send' ? t('accountMail.sending') : t('accountMail.send')}</Button>
                    {(editing || pending) && <Button variant="quiet" onClick={() => { setEditing(false); setEmail(''); setEmailError(''); setFailure(''); }}>{t('common.cancel')}</Button>}
                  </div>
                </form>
              ) : null}
              {!editing && data.email && data.verified && !pending && (
                <div className="settings__actions">
                  {!mailOff && <Button variant="line" onClick={() => setEditing(true)}>{t('accountMail.change')}</Button>}
                  <Button variant="quiet" onClick={() => setRemoving(true)}><Trash2 size={15} aria-hidden />{t('accountMail.remove')}</Button>
                </div>
              )}
              {failure && <Alert tone="danger">{failure}</Alert>}
            </div>
          ) : null}
      {removing && (
        <ConfirmDialog
          title={t('accountMail.removeTitle')}
          description={t('accountMail.removeText', { email: data?.email ?? '' })}
          confirmLabel={t('accountMail.remove')}
          busyLabel={t('accountMail.removing')}
          onConfirm={remove}
          onClose={() => setRemoving(false)}
        />
      )}
    </SettingsSection>
  );
}

// ---- Delete my account (F6) ---------------------------------------------------------------------------------

export function DangerSection() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  return (
    <SettingsSection id="settings-danger-title" title={t('danger.title')} text={t('danger.text')} tone="danger">
      <div className="settings__form">
        <ul className="danger-facts">
          <li>{t('danger.fact1')}</li>
          <li>{t('danger.fact2')}</li>
          <li>{t('danger.fact3')}</li>
        </ul>
        <div className="settings__actions"><Button variant="line" className="danger-open" onClick={() => setOpen(true)}><Trash2 size={15} aria-hidden />{t('danger.open')}</Button></div>
      </div>
      {open && <DeleteAccountDialog onClose={() => setOpen(false)} />}
    </SettingsSection>
  );
}

function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const { lang, t } = useLanguage();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const loginId = user?.email ?? '';
  const [password, setPassword] = useState('');
  const [typed, setTyped] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [idError, setIdError] = useState('');
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  const matches = typed.trim().toLowerCase() === loginId.trim().toLowerCase() && !!loginId;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFailure('');
    const noPassword = !password;
    setPasswordError(noPassword ? t('settings.password.currentRequired') : '');
    setIdError(matches ? '' : t('danger.idMismatch'));
    if (noPassword || !matches) return;
    setBusy(true);
    try {
      await accountMail.deleteMe({ password, confirmLoginId: typed.trim() });
      signOut();
      navigate('/login?reason=deleted', { replace: true });
    } catch (cause) {
      const text = userMessage(cause, lang);
      if (cause instanceof ApiError && cause.code === 'CURRENT_PASSWORD_INCORRECT') setPasswordError(text);
      else if (cause instanceof ApiError && cause.code === 'CONFIRM_LOGIN_ID_MISMATCH') setIdError(text);
      else setFailure(text);
      setBusy(false);
    }
  };
  return (
    <Dialog
      role="alertdialog"
      size="sm"
      title={t('danger.dialogTitle')}
      description={t('danger.dialogText')}
      onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" form="delete-account-form" variant="danger" disabled={busy || !matches || !password}>{busy ? t('danger.busy') : t('danger.confirm')}</Button></>}
    >
      <form id="delete-account-form" className="form-stack" onSubmit={submit} noValidate>
        <input type="text" name="username" autoComplete="username" value={loginId} readOnly hidden />
        <TextField label={t('settings.password.current')} name="current-password" type="password" autoComplete="current-password" value={password} onChange={(event) => { setPassword(event.target.value); setPasswordError(''); }} error={passwordError || undefined} />
        <TextField
          label={t('danger.idLabel', { id: loginId })}
          name="confirm-login-id"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={typed}
          onChange={(event) => { setTyped(event.target.value); setIdError(''); }}
          error={idError || undefined}
        />
        {failure && <Alert tone="danger">{failure}</Alert>}
      </form>
    </Dialog>
  );
}
