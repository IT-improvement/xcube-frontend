// Small pieces the admin tabs share (S13): an icon action that stays focusable with its reason when off, a pager,
// a ruled meter, the URL filters and the one user directory for owner names.
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ReactNode, useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../auth/AuthProvider';
import { Button } from '../../../components/ui';
import { formatNumber, useLanguage } from '../../../i18n';
import { admin, AdminUser } from '../../api';
import { formatBytes } from '../../fusion';
import { useLoad } from '../../useLoad';

/** Rows per page on every admin list. */
export const PAGE_SIZE = 50;

/**
 * Icon button for a row action. With `reason` it is off but still focusable (aria-disabled), and the reason is its
 * tooltip and description, so "why not" is never only a greyed icon.
 */
export function IconAction({ label, reason, onClick, children }: { label: string; reason?: string; onClick: () => void; children: ReactNode }) {
  const id = useId();
  return (
    <>
      <button
        type="button"
        className="xc-icon-btn"
        aria-label={label}
        title={reason ? `${label} — ${reason}` : label}
        aria-disabled={reason ? true : undefined}
        aria-describedby={reason ? id : undefined}
        onClick={reason ? undefined : onClick}
      >
        {children}
      </button>
      {reason && <span id={id} className="sr-only">{reason}</span>}
    </>
  );
}

/** "1–50 / 120" with previous and next; nothing when everything fits on one page. */
export function Pager({ page, total, size = PAGE_SIZE, onPage }: { page: number; total: number; size?: number; onPage: (page: number) => void }) {
  const { lang, t } = useLanguage();
  if (total <= size && page === 0) return null;
  const from = total ? page * size + 1 : 0;
  const to = Math.min(total, (page + 1) * size);
  const last = Math.max(0, Math.ceil(total / size) - 1);
  return (
    <nav className="admin-pager" aria-label={t('admin.pager.label')}>
      <span className="xc-hint tabular">{t('admin.pager.range', { from: formatNumber(from, {}, lang), to: formatNumber(to, {}, lang), total: formatNumber(total, {}, lang) })}</span>
      <Button variant="line" size="sm" disabled={page <= 0} onClick={() => onPage(page - 1)}><ChevronLeft size={14} aria-hidden />{t('admin.pager.previous')}</Button>
      <Button variant="line" size="sm" disabled={page >= last} onClick={() => onPage(page + 1)}>{t('admin.pager.next')}<ChevronRight size={14} aria-hidden /></Button>
    </nav>
  );
}

/** Share of `used` in `total` as a whole percent ("<1" for a small non-zero share). */
export function percentText(used: number, total: number, lang: 'ko' | 'en') {
  const ratio = used / total;
  if (ratio > 0 && ratio < 0.01) return '<1';
  return formatNumber(Math.floor(ratio * 100), { maximumFractionDigits: 0 }, lang);
}

/**
 * Ruled meter (same look as the storage meter in S11): ink-2 fill, warn from 90 %, bad at 100 %, always with the
 * words "5.6 GB / 7.8 GB · 71%" beside it. Missing numbers read "알 수 없음" without a bar.
 */
export function Meter({ label, used, total, format = formatBytes }: { label: string; used: number | null | undefined; total: number | null | undefined; format?: (value: number) => string }) {
  const { lang, t } = useLanguage();
  if (used == null || total == null || total <= 0) {
    return (
      <div className="admin-meter">
        <p className="admin-meter__label">{label}</p>
        <p className="admin-meter__value admin-meter__value--unknown">{t('admin.unknown')}</p>
      </div>
    );
  }
  const ratio = used / total;
  const level = ratio >= 1 ? 'over' : ratio >= 0.9 ? 'near' : 'ok';
  const percent = percentText(used, total, lang);
  const words = t('admin.meterValue', { used: format(used), total: format(total), percent });
  return (
    <div className={`admin-meter admin-meter--${level}`}>
      <p className="admin-meter__label">{label}</p>
      <p className="admin-meter__value">{words}</p>
      <div className="admin-meter__bar" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(ratio * 100))} aria-valuetext={words}>
        <span style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </div>
    </div>
  );
}

/** Filters kept in the address (`?tab=users&q=…`), so a reload or a shared link keeps the view. */
export function useParam(key: string, fallback = ''): [string, (value: string, reset?: string[]) => void] {
  const [params, setParams] = useSearchParams();
  const value = params.get(key) ?? fallback;
  const set = useCallback((next: string, reset: string[] = []) => setParams((current) => {
    const copy = new URLSearchParams(current);
    if (next && next !== fallback) copy.set(key, next); else copy.delete(key);
    reset.forEach((name) => copy.delete(name));
    return copy;
  }, { replace: true }), [key, fallback, setParams]);
  return [value, set];
}

/** A search box that writes to the address 300 ms after typing stops (and resets the page). */
export function useSearchParam(key = 'q'): [string, (value: string) => void, string] {
  const [committed, commit] = useParam(key);
  const [text, setText] = useState(committed);
  useEffect(() => {
    if (text.trim() === committed) return undefined;
    const timer = window.setTimeout(() => commit(text.trim(), ['page']), 300);
    return () => window.clearTimeout(timer);
  }, [text, committed, commit]);
  return [text, setText, committed];
}

/** Every account once (the first 100, the server's page limit), for owner names in the data, job, pod and audit lists. */
export function useUserDirectory() {
  const { user } = useAuth();
  const users = useLoad(() => admin.listUsers({ size: 100 }, user));
  const byId = useMemo(() => new Map((users.data?.items ?? []).map((user) => [user.id, user] as const)), [users.data]);
  return { users: users.data?.items ?? [], byId, loading: users.loading };
}
export type Directory = ReturnType<typeof useUserDirectory>;

/** "kim.water" when known, else "사용자 #7" / "User #7"; "—" without an id. */
export function ownerLabel(directory: Directory, ownerId: string | null | undefined, loginId: string | null | undefined, t: (key: 'admin.userNumber', vars: { id: string }) => string) {
  if (loginId) return loginId;
  if (!ownerId) return '—';
  const user: AdminUser | undefined = directory.byId.get(ownerId);
  return user?.loginId || t('admin.userNumber', { id: ownerId });
}
