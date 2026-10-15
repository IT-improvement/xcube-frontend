// S13 사용자 tab: every account with its role, status and Backoffice numbers; role change, block, password reset,
// storage quota and removal. The signed-in admin's own row keeps its risky actions off, with the reason.
import { Ban, Check, Copy, HardDrive, KeyRound, RotateCcw, Search, UserX } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { userMessage } from '../../../api/httpClient';
import { useAuth } from '../../../auth/AuthProvider';
import { ACCOUNT_ROLES, accountRoleLabel, toAccountRole } from '../../../auth/roles';
import { Alert, Button, TextField } from '../../../components/ui';
import { Badge, ConfirmDialog, Dialog, EmptyState, Skeleton } from '../../../components/ui/kit';
import { useLanguage } from '../../../i18n';
import type { TKey } from '../../../i18n';
import { admin, AdminUser, AdminUserSummary, formatDate, formatDateTime } from '../../api';
import { formatBytes } from '../../fusion';
import { useLoad } from '../../useLoad';
import { NoValue } from '../DataLibraryPage';
import { IconAction, PAGE_SIZE, Pager, percentText, useParam, useSearchParam } from './shared';

const GIB = 1024 ** 3;
const STATUSES = ['', 'ACTIVE', 'BLOCKED'] as const;

/** 사용 중 · 차단됨 · 탈퇴, always as words; the tone only colours them. */
export function UserStatusBadge({ user }: { user: Pick<AdminUser, 'status' | 'deletedAt'> }) {
  const { t } = useLanguage();
  if (user.deletedAt) return <Badge>{t('admin.users.status.DELETED')}</Badge>;
  if (user.status === 'BLOCKED') return <Badge tone="danger">{t('admin.users.status.BLOCKED')}</Badge>;
  if (user.status === 'ACTIVE') return <Badge tone="success">{t('admin.users.status.ACTIVE')}</Badge>;
  return <Badge>{user.status}</Badge>;
}

type Pending =
  | { kind: 'role'; user: AdminUser; role: string }
  | { kind: 'block' | 'reset'; user: AdminUser }
  | { kind: 'password'; user: AdminUser; password: string }
  | { kind: 'quota'; user: AdminUser; summary?: AdminUserSummary }
  | { kind: 'delete'; user: AdminUser };

export default function UsersTab({ onToast }: { onToast: (text: string) => void }) {
  const { lang, t } = useLanguage();
  const { user: me } = useAuth();
  const selfId = me ? String(me.id) : '';
  const [text, setText, q] = useSearchParam();
  const [role, setRole] = useParam('role');
  const [status, setStatus] = useParam('status');
  const [pageParam, setPage] = useParam('page');
  const page = Math.max(0, Number(pageParam) || 0);
  const users = useLoad(() => admin.listUsers({ q, role, status, page, size: PAGE_SIZE }, me), [q, role, status, page]);
  const items = useMemo(() => users.data?.items ?? [], [users.data]);
  const ids = items.map((item) => item.id).join(',');
  // Backoffice numbers for the rows on screen; their failure leaves dashes and a notice, not an empty table.
  const summaries = useLoad(() => (ids ? admin.userSummaries(ids.split(',')) : Promise.resolve([])), [ids]);
  const summaryOf = useMemo(() => new Map((summaries.data ?? []).map((item) => [item.userId, item] as const)), [summaries.data]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [rowError, setRowError] = useState('');
  const [busyId, setBusyId] = useState('');

  const replace = (next: AdminUser) => users.setData((current) => current && { ...current, items: current.items.map((item) => (item.id === next.id ? next : item)) });
  const filtered = !!(q || role || status);

  /** Why a risky action is off for this row ('' when it can be used). */
  const lockOf = (user: AdminUser, action: 'role' | 'block' | 'reset' | 'delete' | 'quota') => {
    if (user.deletedAt) return t('admin.users.lock.deleted');
    if (user.id === selfId && action !== 'quota') return t(action === 'reset' ? 'admin.users.lock.selfPassword' : 'admin.users.lock.self');
    return '';
  };

  const unblock = async (user: AdminUser) => {
    setBusyId(user.id);
    setRowError('');
    try {
      const updated = await admin.updateUser(user.id, { status: 'ACTIVE' });
      replace({ ...user, ...withFallback(updated, user), status: updated.status || 'ACTIVE' });
      onToast(t('admin.users.unblocked', { loginId: user.loginId }));
    } catch (cause) { setRowError(userMessage(cause, lang)); } finally { setBusyId(''); }
  };

  return (
    <>
      <div className="toolbar">
        <label className="toolbar__search">
          <Search size={16} aria-hidden />
          <input type="search" value={text} onChange={(event) => setText(event.target.value)} placeholder={t('admin.users.searchPlaceholder')} aria-label={t('admin.users.search')} autoComplete="off" spellCheck={false} />
        </label>
        <label>
          <span className="sr-only">{t('admin.users.roleFilter')}</span>
          <select className="xc-select" aria-label={t('admin.users.roleFilter')} value={role} onChange={(event) => setRole(event.target.value, ['page'])}>
            <option value="">{t('admin.users.allRoles')}</option>
            {ACCOUNT_ROLES.map((value) => <option key={value} value={value}>{accountRoleLabel(value, lang)}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">{t('admin.users.statusFilter')}</span>
          <select className="xc-select" aria-label={t('admin.users.statusFilter')} value={status} onChange={(event) => setStatus(event.target.value, ['page'])}>
            {STATUSES.map((value) => <option key={value || 'all'} value={value}>{value ? t(`admin.users.status.${value}` as TKey) : t('admin.users.allStatuses')}</option>)}
          </select>
        </label>
        <span className="toolbar__spacer" />
        {users.data && <span className="xc-hint tabular" aria-live="polite">{t('admin.users.count', { count: users.data.total })}</span>}
      </div>
      {rowError && <div className="inline-error"><Alert tone="danger">{rowError}</Alert></div>}
      {summaries.error && items.length > 0 && (
        <div className="inline-error"><Alert tone="warning">{t('admin.users.summaryFailed')}</Alert><Button variant="line" size="sm" className="inline-error__retry" onClick={summaries.reload}>{t('common.retry')}</Button></div>
      )}
      {users.loading && !users.data ? (
        <Skeleton lines={5} label={t('admin.users.loading')} />
      ) : users.error ? (
        <div className="inline-error"><Alert tone="danger">{t('admin.users.failed', { error: users.error })}</Alert><Button variant="line" size="sm" className="inline-error__retry" onClick={users.reload}>{t('common.retry')}</Button></div>
      ) : !items.length ? (
        <EmptyState title={filtered ? t('admin.users.noMatch') : t('admin.users.none')} />
      ) : (
        <div className="xc-stale" aria-busy={users.loading} data-testid="admin-users">
          {users.loading && <span className="xc-busy-line" aria-hidden />}
          <div className="xc-table-wrap">
            <table className="xc-table xc-table--cards admin-table">
              <thead>
                <tr>
                  <th scope="col">{t('admin.users.account')}</th>
                  <th scope="col">{t('admin.users.role')}</th>
                  <th scope="col">{t('app.status')}</th>
                  <th scope="col" className="num">{t('admin.users.datasets')}</th>
                  <th scope="col" className="num">{t('admin.users.projects')}</th>
                  <th scope="col">{t('admin.users.storage')}</th>
                  <th scope="col" className="hide-sm">{t('admin.users.joined')}</th>
                  <th scope="col">{t('admin.users.lastLogin')}</th>
                  <th scope="col"><span className="sr-only">{t('app.actions')}</span></th>
                </tr>
              </thead>
              <tbody>
                {items.map((user) => {
                  const summary = summaryOf.get(user.id);
                  const roleLock = lockOf(user, 'role');
                  const known = toAccountRole(user.role);
                  return (
                    <tr key={user.id} data-testid={`admin-user-${user.id}`}>
                      <td className="cell-main">
                        <span className="xc-cell-main">
                          <span className="admin-who">
                            <strong>{user.loginId}</strong>
                            {user.id === selfId && <Badge tone="primary">{t('admin.users.me')}</Badge>}
                          </span>
                          <small>{user.name || t('app.noName')}</small>
                        </span>
                      </td>
                      <td data-label={t('admin.users.role')}>
                        <select
                          className="xc-select admin-role"
                          aria-label={t('admin.users.roleOf', { loginId: user.loginId })}
                          value={known ?? user.role}
                          disabled={!!roleLock || busyId === user.id}
                          title={roleLock || undefined}
                          onChange={(event) => setPending({ kind: 'role', user, role: event.target.value })}
                        >
                          {!known && <option value={user.role}>{user.role || '—'}</option>}
                          {ACCOUNT_ROLES.map((value) => <option key={value} value={value}>{accountRoleLabel(value, lang)}</option>)}
                        </select>
                        {roleLock && user.id === selfId && <span className="sr-only">{roleLock}</span>}
                      </td>
                      <td data-label={t('app.status')}><UserStatusBadge user={user} /></td>
                      <td className="num" data-label={t('admin.users.datasets')}>
                        {summary?.datasetCount != null ? <Link to={`/app/admin?tab=data&view=datasets&owner=${encodeURIComponent(user.id)}`} aria-label={t('admin.users.datasetsOf', { loginId: user.loginId, count: summary.datasetCount })}>{summary.datasetCount}</Link> : <NoValue label={t('admin.unknown')} />}
                      </td>
                      <td className="num" data-label={t('admin.users.projects')}>{summary?.projectCount != null ? summary.projectCount : <NoValue label={t('admin.unknown')} />}</td>
                      <td data-label={t('admin.users.storage')}><StorageCell summary={summary} lang={lang} /></td>
                      <td className="hide-sm date">{formatDate(user.createdAt, lang)}</td>
                      <td className="date" data-label={t('admin.users.lastLogin')}>{user.lastLoginAt ? formatDateTime(user.lastLoginAt, lang) : <span className="no-value">{t('admin.users.never')}</span>}</td>
                      <td className="cell-actions">
                        <div className="row-actions">
                          {user.status === 'BLOCKED' && !user.deletedAt ? (
                            <IconAction label={t('admin.users.unblockNamed', { loginId: user.loginId })} reason={busyId === user.id ? t('admin.users.busy') : undefined} onClick={() => unblock(user)}><RotateCcw size={16} aria-hidden /></IconAction>
                          ) : (
                            <IconAction label={t('admin.users.blockNamed', { loginId: user.loginId })} reason={lockOf(user, 'block')} onClick={() => setPending({ kind: 'block', user })}><Ban size={16} aria-hidden /></IconAction>
                          )}
                          <IconAction label={t('admin.users.resetNamed', { loginId: user.loginId })} reason={lockOf(user, 'reset')} onClick={() => setPending({ kind: 'reset', user })}><KeyRound size={16} aria-hidden /></IconAction>
                          <IconAction label={t('admin.users.quotaNamed', { loginId: user.loginId })} reason={lockOf(user, 'quota')} onClick={() => setPending({ kind: 'quota', user, summary })}><HardDrive size={16} aria-hidden /></IconAction>
                          <IconAction label={t('admin.users.deleteNamed', { loginId: user.loginId })} reason={lockOf(user, 'delete')} onClick={() => setPending({ kind: 'delete', user })}><UserX size={16} aria-hidden /></IconAction>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {users.data && <Pager page={page} total={users.data.total} onPage={(next) => setPage(next ? String(next) : '')} />}
        </div>
      )}

      {pending?.kind === 'role' && (
        <ConfirmDialog
          tone="ink"
          title={t('admin.users.roleTitle')}
          description={t('admin.users.roleText', { loginId: pending.user.loginId, from: accountRoleLabel(pending.user.role, lang), to: accountRoleLabel(pending.role, lang) })}
          confirmLabel={t('admin.users.roleConfirm')}
          busyLabel={t('admin.users.busy')}
          onConfirm={async () => {
            const updated = await admin.updateUser(pending.user.id, { role: pending.role });
            replace({ ...pending.user, ...withFallback(updated, pending.user), role: updated.role || pending.role });
            setPending(null);
            onToast(t('admin.users.roleChanged', { loginId: pending.user.loginId, role: accountRoleLabel(pending.role, lang) }));
          }}
          onClose={() => setPending(null)}
        />
      )}
      {pending?.kind === 'block' && (
        <ConfirmDialog
          title={t('admin.users.blockTitle')}
          description={t('admin.users.blockText', { loginId: pending.user.loginId })}
          confirmLabel={t('admin.users.block')}
          busyLabel={t('admin.users.busy')}
          onConfirm={async () => {
            const updated = await admin.updateUser(pending.user.id, { status: 'BLOCKED' });
            replace({ ...pending.user, ...withFallback(updated, pending.user), status: updated.status || 'BLOCKED' });
            setPending(null);
            onToast(t('admin.users.blocked', { loginId: pending.user.loginId }));
          }}
          onClose={() => setPending(null)}
        />
      )}
      {pending?.kind === 'reset' && (
        <ConfirmDialog
          tone="ink"
          title={t('admin.users.resetTitle')}
          description={t('admin.users.resetText', { loginId: pending.user.loginId })}
          confirmLabel={t('admin.users.reset')}
          busyLabel={t('admin.users.busy')}
          onConfirm={async () => {
            const { temporaryPassword } = await admin.resetPassword(pending.user.id);
            if (!temporaryPassword) throw new Error('EMPTY_TEMPORARY_PASSWORD');
            setPending({ kind: 'password', user: pending.user, password: temporaryPassword });
          }}
          onClose={() => setPending(null)}
        />
      )}
      {pending?.kind === 'password' && <TemporaryPasswordDialog loginId={pending.user.loginId} password={pending.password} onClose={() => setPending(null)} />}
      {pending?.kind === 'quota' && (
        <QuotaDialog
          user={pending.user}
          summary={pending.summary}
          onClose={() => setPending(null)}
          onSaved={(text) => { setPending(null); summaries.refresh(); onToast(text); }}
        />
      )}
      {pending?.kind === 'delete' && (
        <DeleteUserDialog
          user={pending.user}
          onClose={() => setPending(null)}
          onDeleted={() => { setPending(null); users.refresh(); onToast(t('admin.users.deleted', { loginId: pending.user.loginId })); }}
        />
      )}
    </>
  );
}

/** A PATCH answer may leave out fields (contract: "바뀐 사용자"); keep what the row already knew. */
const withFallback = (updated: AdminUser, before: AdminUser): AdminUser => ({
  ...before,
  ...Object.fromEntries(Object.entries(updated).filter(([, value]) => value !== '' && value != null)),
});

function StorageCell({ summary, lang }: { summary?: AdminUserSummary; lang: 'ko' | 'en' }) {
  const { t } = useLanguage();
  if (summary?.usedBytes == null) return <NoValue label={t('admin.unknown')} />;
  const quota = summary.quotaBytes;
  const ratio = quota ? summary.usedBytes / quota : 0;
  return (
    <span className="admin-usage">
      <span className="tabular">{quota ? t('admin.users.usedOf', { used: formatBytes(summary.usedBytes), quota: formatBytes(quota) }) : formatBytes(summary.usedBytes)}</span>
      {summary.quotaIsDefault && quota ? <small className="xc-hint">{t('admin.users.defaultQuota')}</small> : null}
      {quota && ratio >= 1 ? <Badge tone="danger">{t('admin.users.over', { percent: percentText(summary.usedBytes, quota, lang) })}</Badge>
        : quota && ratio >= 0.9 ? <Badge tone="warning">{t('admin.users.near', { percent: percentText(summary.usedBytes, quota, lang) })}</Badge> : null}
    </span>
  );
}

/**
 * The temporary password, once. It lives only in this dialog's state; closing it forgets it, and the list never
 * holds it. The copy button says when the copy worked; when the browser refuses, the text is selected instead.
 */
export function TemporaryPasswordDialog({ loginId, password, onClose }: { loginId: string; password: string; onClose: () => void }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => { if (copied !== 'done') return undefined; const timer = window.setTimeout(() => setCopied('idle'), 2400); return () => window.clearTimeout(timer); }, [copied]);
  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard');
      await navigator.clipboard.writeText(password);
      setCopied('done');
    } catch {
      field.current?.select();
      setCopied('failed');
    }
  };
  return (
    <Dialog
      size="sm"
      title={t('admin.users.passwordTitle')}
      description={t('admin.users.passwordText', { loginId })}
      onClose={onClose}
      footer={<Button onClick={onClose}>{t('admin.users.passwordDone')}</Button>}
    >
      <div className="admin-secret">
        <label className="xc-label" htmlFor="admin-temp-password">{t('admin.users.passwordLabel')}</label>
        <div className="admin-secret__row">
          <input ref={field} id="admin-temp-password" className="admin-secret__value" value={password} readOnly spellCheck={false} autoComplete="off" onFocus={(event) => event.currentTarget.select()} />
          <Button variant="line" onClick={copy} aria-describedby="admin-temp-copy-state">
            {copied === 'done' ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}{copied === 'done' ? t('admin.users.copied') : t('admin.users.copy')}
          </Button>
        </div>
        <p id="admin-temp-copy-state" className="xc-hint" role="status">{copied === 'done' ? t('admin.users.copiedText') : copied === 'failed' ? t('admin.users.copyFailed') : ''}</p>
        <Alert tone="warning">{t('admin.users.passwordOnce')}</Alert>
      </div>
    </Dialog>
  );
}

function QuotaDialog({ user, summary, onClose, onSaved }: { user: AdminUser; summary?: AdminUserSummary; onClose: () => void; onSaved: (text: string) => void }) {
  const { lang, t } = useLanguage();
  const custom = summary && !summary.quotaIsDefault && summary.quotaBytes ? summary.quotaBytes : null;
  const [mode, setMode] = useState<'default' | 'custom'>(custom ? 'custom' : 'default');
  const [gb, setGb] = useState(custom ? String(Math.round((custom / GIB) * 10) / 10) : '');
  const [fieldError, setFieldError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const value = Number(gb);
    if (mode === 'custom' && (!gb.trim() || !Number.isFinite(value) || value <= 0)) { setFieldError(t('admin.users.quotaInvalid')); return; }
    setBusy(true);
    try {
      const bytes = mode === 'custom' ? Math.round(value * GIB) : null;
      await admin.setQuota(user.id, bytes);
      onSaved(bytes == null ? t('admin.users.quotaDefaultSaved', { loginId: user.loginId }) : t('admin.users.quotaSaved', { loginId: user.loginId, quota: formatBytes(bytes) }));
    } catch (cause) { setError(userMessage(cause, lang)); setBusy(false); }
  };
  return (
    <Dialog
      size="sm"
      title={t('admin.users.quotaTitle', { loginId: user.loginId })}
      description={summary?.usedBytes != null ? t('admin.users.quotaUsage', { used: formatBytes(summary.usedBytes) }) : undefined}
      onClose={onClose}
      footer={<><Button variant="line" onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" form="admin-quota-form" disabled={busy}>{busy ? t('admin.users.busy') : t('admin.users.quotaSave')}</Button></>}
    >
      <form id="admin-quota-form" className="form-stack" onSubmit={submit} noValidate>
        <fieldset className="admin-choice">
          <legend className="sr-only">{t('admin.users.quotaTitle', { loginId: user.loginId })}</legend>
          <label className="xc-check"><input type="radio" name="quota-mode" checked={mode === 'default'} onChange={() => { setMode('default'); setFieldError(''); }} />{t('admin.users.quotaUseDefault')}</label>
          <label className="xc-check"><input type="radio" name="quota-mode" checked={mode === 'custom'} onChange={() => setMode('custom')} />{t('admin.users.quotaUseCustom')}</label>
        </fieldset>
        {mode === 'custom' && (
          <TextField label={t('admin.users.quotaGb')} type="number" inputMode="decimal" min={1} step={1} value={gb} help={t('admin.users.quotaHelp')} error={fieldError} onChange={(event) => { setGb(event.target.value); setFieldError(''); }} autoFocus />
        )}
        {error && <Alert tone="danger">{error}</Alert>}
      </form>
    </Dialog>
  );
}

/** Removal is typed out: the button turns on only when the login ID is entered exactly. */
function DeleteUserDialog({ user, onClose, onDeleted }: { user: AdminUser; onClose: () => void; onDeleted: () => void }) {
  const { lang, t } = useLanguage();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const matches = typed.trim() === user.loginId;
  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!matches) return;
    setBusy(true);
    setError('');
    try { await admin.deleteUser(user.id); onDeleted(); } catch (cause) { setError(userMessage(cause, lang)); setBusy(false); }
  };
  return (
    <Dialog
      role="alertdialog"
      size="sm"
      title={t('admin.users.deleteTitle')}
      description={t('admin.users.deleteText', { loginId: user.loginId })}
      onClose={onClose}
      footer={<><Button variant="line" onClick={onClose}>{t('common.cancel')}</Button><Button variant="danger" type="submit" form="admin-delete-user" disabled={!matches || busy}>{busy ? t('admin.users.busy') : t('admin.users.deleteConfirm')}</Button></>}
    >
      <form id="admin-delete-user" className="form-stack" onSubmit={submit} noValidate>
        <TextField label={t('admin.users.deleteType', { loginId: user.loginId })} value={typed} autoComplete="off" autoCapitalize="none" spellCheck={false} onChange={(event) => setTyped(event.target.value)} />
        {error && <Alert tone="danger">{error}</Alert>}
      </form>
    </Dialog>
  );
}
