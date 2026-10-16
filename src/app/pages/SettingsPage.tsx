import { Check, TriangleAlert } from 'lucide-react';
import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, userMessage } from '../../api/httpClient';
import { useAuth } from '../../auth/AuthProvider';
import { accountRoleLabel, toAccountRole } from '../../auth/roles';
import { Alert, Button, LanguageSwitch, TextField } from '../../components/ui';
import { Badge, PageHeader, Skeleton, useToast } from '../../components/ui/kit';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { codeText, formatNumber, useLanguage } from '../../i18n';
import { account, StorageUsage } from '../api';
import { formatBytes } from '../fusion';
import { useLoad } from '../useLoad';
import '../../i18n/app';
import './settings.css';

const NAME_MAX = 50;
/** Same rule as sign-up (FR-AUTH-01): at least 8 characters. */
const PASSWORD_MIN = 8;
/** At or above this share of the quota the meter and its words turn to the warning tone. */
export const NEAR_LIMIT = 0.9;

/** S11 계정 설정: profile, language, password and storage usage, as ruled sections of one sheet. */
export default function SettingsPage() {
  const { t } = useLanguage();
  useDocumentTitle(t('titles.settings'));
  const toast = useToast();
  return (
    <div className="settings-page">
      <PageHeader title={t('titles.settings')} description={t('settings.description')} />
      <div className="settings">
        <ProfileSection onSaved={toast.show} />
        <Section id="settings-language" title={t('settings.language.title')} text={t('settings.language.text')}>
          <div className="settings__lang"><LanguageSwitch /></div>
        </Section>
        <PasswordSection onChanged={toast.show} />
        <StorageSection />
      </div>
      {toast.node}
    </div>
  );
}

/** One ruled row of the sheet: what it is on the left, the controls on the right (stacked on phones). */
function Section({ id, title, text, children }: { id: string; title: string; text: string; children: ReactNode }) {
  return (
    <section className="settings__section" aria-labelledby={id}>
      <div className="settings__intro">
        <h2 id={id} className="settings__title">{title}</h2>
        <p className="settings__text">{text}</p>
      </div>
      <div className="settings__body">{children}</div>
    </section>
  );
}

function ProfileSection({ onSaved }: { onSaved: (text: string) => void }) {
  const { lang, t } = useLanguage();
  const { user, updateUser } = useAuth();
  const accountName = user?.name ?? '';
  // The last saved name (the account's, until this page saves a new one).
  const [current, setCurrent] = useState(accountName);
  useEffect(() => setCurrent(accountName), [accountName]);
  const [name, setName] = useState(accountName);
  const [shown, setShown] = useState(false);
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [failure, setFailure] = useState<unknown>(null);
  const [serverNameError, setServerNameError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const [focusTick, setFocusTick] = useState(0);
  useEffect(() => { if (focusTick) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); }, [focusTick]);
  const role = toAccountRole(user?.role);
  const trimmed = name.trim();
  const invalid = !trimmed ? t('settings.profile.nameRequired') : trimmed.length > NAME_MAX ? t('settings.profile.nameTooLong', { count: trimmed.length }) : undefined;
  const unchanged = trimmed === current;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setShown(true);
    if (invalid) { setFocusTick((value) => value + 1); return; }
    if (unchanged) return;
    setState('saving');
    setFailure(null);
    setServerNameError('');
    try {
      const updated = await account.updateProfile({ name: trimmed });
      const savedName = updated?.name ?? trimmed;
      updateUser({ name: savedName });
      setCurrent(savedName);
      setName(savedName);
      setState('saved');
      onSaved(t('settings.profile.savedToast'));
    } catch (cause) {
      setState('idle');
      if (cause instanceof ApiError && cause.code === 'INVALID_NAME') { setServerNameError(userMessage(cause, lang)); setFocusTick((value) => value + 1); }
      else setFailure(cause);
    }
  };

  const label = state === 'saving' ? t('settings.profile.saving') : state === 'saved' && unchanged ? t('settings.profile.saved') : t('settings.profile.save');
  return (
    <Section id="settings-profile" title={t('settings.profile.title')} text={t('settings.profile.text')}>
      <form ref={formRef} className="settings__form" onSubmit={submit} noValidate aria-labelledby="settings-profile">
        <div className="settings__readonly">
          <span className="settings__label">{t('settings.profile.username')}</span>
          <span className="settings__value">{user?.email ?? '—'}</span>
          <span className="xc-hint">{t('settings.profile.usernameHelp')}</span>
        </div>
        {/* The account role (UR-59) is read-only here: an admin sets it in the admin console (/admin, UR-62). */}
        <div className="settings__readonly" data-testid="settings-role">
          <span className="settings__label">{t('settings.profile.role')}</span>
          <span className="settings__value">{user?.role ? accountRoleLabel(user.role, lang) : '—'}</span>
          <span className="xc-hint">
            {role ? `${t(`settings.profile.roleHelp.${role}`)} ` : ''}{t('settings.profile.roleReadonly')}
          </span>
        </div>
        <TextField
          label={t('settings.profile.name')}
          name="name"
          autoComplete="name"
          help={t('settings.profile.nameHelp')}
          value={name}
          onChange={(event) => { setName(event.target.value); setServerNameError(''); if (state === 'saved') setState('idle'); }}
          onBlur={() => { if (name !== current) setShown(true); }}
          error={(shown ? invalid : undefined) || serverNameError || undefined}
        />
        {failure != null && <Alert tone="danger">{userMessage(failure, lang)}</Alert>}
        <div className="settings__actions">
          <Button type="submit" variant={state === 'saved' && unchanged ? 'line' : 'ink'} disabled={state === 'saving' || (unchanged && !invalid)}>
            {state === 'saved' && unchanged && <Check size={15} aria-hidden />}{label}
          </Button>
        </div>
      </form>
    </Section>
  );
}

type PasswordField = 'current' | 'next' | 'confirm';
/** Server codes shown under a field rather than above the form. */
const FIELD_OF_CODE: Record<string, PasswordField> = { CURRENT_PASSWORD_INCORRECT: 'current', PASSWORD_POLICY: 'next', PASSWORD_UNCHANGED: 'next' };

function PasswordSection({ onChanged }: { onChanged: (text: string) => void }) {
  const { lang, t } = useLanguage();
  const { user } = useAuth();
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<Record<PasswordField, string>>({ current: '', next: '', confirm: '' });
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<{ field: PasswordField; text: string } | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  useEffect(() => { if (focusTick) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); }, [focusTick]);

  const errors: Partial<Record<PasswordField, string>> = {
    current: !values.current ? t('settings.password.currentRequired') : undefined,
    next: !values.next ? t('settings.password.nextRequired')
      : values.next.length < PASSWORD_MIN ? t('auth.errors.passwordShort')
        : values.next === values.current ? codeText('PASSWORD_UNCHANGED', undefined, lang) : undefined,
    confirm: !values.confirm ? t('auth.errors.confirmRequired') : values.confirm !== values.next ? t('auth.errors.mismatch') : undefined,
  };
  const shown = (field: PasswordField) => (submitted ? errors[field] : undefined) ?? (serverError?.field === field ? serverError.text : undefined);

  const update = (field: PasswordField) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setValues((current) => ({ ...current, [field]: value }));
    if (serverError?.field === field) setServerError(null);
    setDone(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    setFailure(null);
    if (Object.values(errors).some(Boolean)) { setFocusTick((value) => value + 1); return; }
    setBusy(true);
    setServerError(null);
    try {
      await account.changePassword({ currentPassword: values.current, newPassword: values.next });
      setValues({ current: '', next: '', confirm: '' });
      setSubmitted(false);
      setDone(true);
      onChanged(t('settings.password.done'));
    } catch (cause) {
      const field = cause instanceof ApiError ? FIELD_OF_CODE[cause.code] : undefined;
      if (field) {
        // The policy sentence needs the server's limits; without them, the sign-up rule says the same.
        const policyWithoutLimits = cause instanceof ApiError && cause.code === 'PASSWORD_POLICY' && cause.params?.min == null;
        setServerError({ field, text: policyWithoutLimits ? t('auth.errors.passwordShort') : userMessage(cause, lang) });
        setFocusTick((value) => value + 1);
      } else {
        setFailure(cause);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section id="settings-password" title={t('settings.password.title')} text={t('settings.password.text')}>
      <form ref={formRef} className="settings__form" onSubmit={submit} noValidate aria-labelledby="settings-password">
        {/* Lets password managers file the new password under this account. */}
        <input type="text" name="username" autoComplete="username" value={user?.email ?? ''} readOnly hidden />
        <TextField label={t('settings.password.current')} name="current-password" type="password" autoComplete="current-password" value={values.current} onChange={update('current')} error={shown('current')} />
        <TextField label={t('settings.password.next')} name="new-password" type="password" autoComplete="new-password" help={t('auth.signup.passwordHelp')} value={values.next} onChange={update('next')} error={shown('next')} />
        <TextField label={t('settings.password.confirm')} name="confirm-password" type="password" autoComplete="new-password" value={values.confirm} onChange={update('confirm')} error={shown('confirm')} />
        {failure != null && <Alert tone="danger">{userMessage(failure, lang)}</Alert>}
        {done && <Alert tone="success"><strong>{t('settings.password.done')}</strong> {t('settings.password.otherDevices')}</Alert>}
        <div className="settings__actions">
          <Button type="submit" disabled={busy}>{busy ? t('settings.password.busy') : t('settings.password.submit')}</Button>
        </div>
      </form>
    </Section>
  );
}

/** Whole percent; a small non-zero use reads "<1" rather than 0. */
function percentOf(used: number, quota: number, lang: 'ko' | 'en') {
  const ratio = used / quota;
  if (ratio > 0 && ratio < 0.01) return '<1';
  return formatNumber(Math.floor(ratio * 100), { maximumFractionDigits: 0 }, lang);
}

function StorageSection() {
  const { lang, t } = useLanguage();
  const usage = useLoad<StorageUsage>(() => account.storageUsage());
  return (
    <Section id="settings-storage" title={t('settings.storage.title')} text={t('settings.storage.text')}>
      {usage.loading && !usage.data ? <Skeleton lines={3} label={t('settings.storage.loading')} />
        : usage.error ? (
          <Alert tone="danger">{usage.error} <Button variant="line" size="sm" onClick={usage.reload}>{t('common.retry')}</Button></Alert>
        ) : usage.data ? <StorageReport usage={usage.data} lang={lang} /> : null}
    </Section>
  );
}

function StorageReport({ usage, lang }: { usage: StorageUsage; lang: 'ko' | 'en' }) {
  const { t } = useLanguage();
  const used = formatBytes(usage.usedBytes);
  const hasQuota = usage.quotaBytes > 0;
  const quota = hasQuota ? formatBytes(usage.quotaBytes) : '';
  const ratio = hasQuota ? usage.usedBytes / usage.quotaBytes : 0;
  const percent = hasQuota ? percentOf(usage.usedBytes, usage.quotaBytes, lang) : '';
  const level = !hasQuota ? 'ok' : ratio >= 1 ? 'over' : ratio >= NEAR_LIMIT ? 'near' : 'ok';
  const kinds = [
    ['ORIGINAL', 'kinds.original'],
    ['FUSION', 'kinds.fusion'],
    ['AI_RESULT', 'kinds.ai'],
  ] as const;
  return (
    <div className={`storage storage--${level}`}>
      <div className="storage__head">
        <p className="storage__value">
          {hasQuota ? t('settings.storage.usedOf', { used, quota }) : t('settings.storage.usedOnly', { used })}
        </p>
        {hasQuota && <p className="storage__percent">{t('settings.storage.percent', { percent })}</p>}
        {level === 'near' && <Badge tone="warning">{t('settings.storage.nearTag')}</Badge>}
        {level === 'over' && <Badge tone="danger">{t('settings.storage.overTag')}</Badge>}
      </div>
      {hasQuota && (
        <div
          className="storage__meter"
          role="meter"
          aria-label={t('settings.storage.meter')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(100, Math.round(ratio * 100))}
          aria-valuetext={t('settings.storage.meterValue', { used, quota, percent })}
        >
          <span className="storage__fill" style={{ width: `${Math.min(100, ratio * 100)}%` }} />
        </div>
      )}
      {level !== 'ok' && (
        <p className="storage__warning" role="status">
          <TriangleAlert size={15} aria-hidden />
          {t(level === 'over' ? 'settings.storage.over' : 'settings.storage.near', { percent })}{' '}
          <Link to="/app/data?scope=owned">{t('settings.storage.toData')}</Link>
        </p>
      )}
      <dl className="storage__rows" aria-label={t('settings.storage.kinds')}>
        {kinds.map(([kind, label]) => (
          <div key={kind} className="storage__row"><dt>{t(label)}</dt><dd>{formatBytes(usage.byKind?.[kind] ?? 0)}</dd></div>
        ))}
        <div className="storage__row storage__row--count"><dt>{t('settings.storage.datasets')}</dt><dd>{t('settings.storage.datasetCount', { count: usage.datasetCount })}</dd></div>
      </dl>
      {usage.unknownSizeCount > 0 && <p className="xc-hint">{t('settings.storage.unknown', { count: usage.unknownSizeCount })}</p>}
      {hasQuota && <p className="xc-hint">{t('settings.storage.guide', { quota })}</p>}
    </div>
  );
}
