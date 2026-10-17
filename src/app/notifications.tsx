// Job-done notifications in the top bar (UR-63 F4): a bell with the unread count, a drop-down of the latest 20,
// mark one or all read. The count is checked on every tick of the shell's jobs poller (no timer of its own), and a
// notification that arrives while the app is open is also shown as a system notification when allowed.
import { Bell, CheckCheck, CircleAlert, CircleCheck, Download, GitCompareArrows, Settings } from 'lucide-react';
import { createContext, ReactNode, RefObject, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { userMessage } from '../api/httpClient';
import { AppNotification, notificationsApi, safeLink } from '../api/notificationsApi';
import { formatDateTime, useLanguage } from '../i18n';
import type { TKey } from '../i18n';
import { setBrowserOff, showBrowserNotification } from './browserNotify';
import { useJobsFeedTick } from './jobs';
import '../i18n/fx';

const LIST_SIZE = 20;

type NotificationsValue = {
  unread: number | null;
  items: AppNotification[] | null;
  loading: boolean;
  error: string;
  /** Loads the latest 20 (the drop-down calls it when it opens). */
  load: () => void;
  markRead: (item: AppNotification) => Promise<void>;
  markAllRead: () => Promise<void>;
};
const NotificationsContext = createContext<NotificationsValue | null>(null);
export const useNotifications = () => useContext(NotificationsContext);

const numericId = (item: AppNotification) => (typeof item.id === 'number' ? item.id : Number(item.id) || 0);
/** Viewer links open in a new tab, like every other way into the Viewer from the management screens. */
export const opensViewer = (link: string) => link.startsWith('/app/viewer');

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { lang } = useLanguage();
  const tick = useJobsFeedTick();
  const navigate = useNavigate();
  const [unread, setUnread] = useState<number | null>(null);
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  // Highest id seen so far; a larger id that arrives later is "new" and may be shown by the browser.
  const newest = useRef<number | null>(null);
  const lastCount = useRef<number | null>(null);

  // The account's browser switch decides whether system notifications show; cached for the job-start wrappers.
  useEffect(() => {
    let alive = true;
    notificationsApi.prefs().then((prefs) => { if (alive) setBrowserOff(!prefs.browser); }, () => {});
    return () => { alive = false; };
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    notificationsApi.list({ size: LIST_SIZE })
      .then((page) => {
        setItems(page.items);
        setUnread(page.unreadCount);
        setFailure(null);
        const top = page.items.reduce((max, item) => Math.max(max, numericId(item)), 0);
        if (newest.current == null || top > newest.current) newest.current = top;
      })
      .catch(setFailure)
      .finally(() => setLoading(false));
  }, []);

  // On every poller tick (and once at the start): a higher unread count means something new arrived.
  useEffect(() => {
    let alive = true;
    notificationsApi.unreadCount().then(async (count) => {
      if (!alive) return;
      setUnread(count);
      const before = lastCount.current;
      lastCount.current = count;
      if (before == null) {
        // First look: remember the newest id so older notifications are never announced.
        const page = await notificationsApi.list({ size: 1 }).catch(() => null);
        if (alive && page) newest.current = Math.max(newest.current ?? 0, ...page.items.map(numericId));
        return;
      }
      if (count <= before) return;
      const page = await notificationsApi.list({ unread: true, size: LIST_SIZE }).catch(() => null);
      if (!alive || !page) return;
      const since = newest.current ?? 0;
      const fresh = page.items.filter((item) => numericId(item) > since);
      newest.current = Math.max(since, ...page.items.map(numericId));
      setItems((current) => (current ? [...fresh, ...current.filter((item) => !fresh.some((other) => other.id === item.id))].slice(0, LIST_SIZE) : current));
      fresh.slice(0, 3).forEach((item) => {
        const link = safeLink(item.link);
        showBrowserNotification(item.title, item.body ?? undefined, () => {
          void notificationsApi.markRead(item.id).catch(() => {});
          if (link) { if (opensViewer(link)) window.open(link, '_blank', 'noopener'); else navigate(link); }
        });
      });
    }, () => {});
    return () => { alive = false; };
  }, [tick, navigate]);

  const markRead = useCallback(async (item: AppNotification) => {
    if (item.readAt) return;
    const at = new Date().toISOString();
    setItems((current) => current?.map((entry) => (entry.id === item.id ? { ...entry, readAt: at } : entry)) ?? current);
    setUnread((count) => (count == null ? count : Math.max(0, count - 1)));
    lastCount.current = lastCount.current == null ? null : Math.max(0, lastCount.current - 1);
    try { await notificationsApi.markRead(item.id); } catch { /* the next tick corrects the count */ }
  }, []);
  const markAllRead = useCallback(async () => {
    await notificationsApi.markAllRead();
    const at = new Date().toISOString();
    setItems((current) => current?.map((entry) => (entry.readAt ? entry : { ...entry, readAt: at })) ?? current);
    setUnread(0);
    lastCount.current = 0;
  }, []);

  const value = useMemo<NotificationsValue>(() => ({
    unread, items, loading, error: failure ? userMessage(failure, lang) : '', load, markRead, markAllRead,
  }), [unread, items, loading, failure, lang, load, markRead, markAllRead]);
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

const TYPE_KEY: Record<string, TKey> = {
  JOB_SUCCEEDED: 'notify.type.JOB_SUCCEEDED',
  JOB_FAILED: 'notify.type.JOB_FAILED',
  EXPORT_READY: 'notify.type.EXPORT_READY',
  COMPARE_DONE: 'notify.type.COMPARE_DONE',
};
function TypeIcon({ type }: { type: string }) {
  if (type === 'JOB_FAILED') return <CircleAlert size={16} aria-hidden className="notify-item__icon notify-item__icon--bad" />;
  if (type === 'EXPORT_READY') return <Download size={16} aria-hidden className="notify-item__icon" />;
  if (type === 'COMPARE_DONE') return <GitCompareArrows size={16} aria-hidden className="notify-item__icon" />;
  return <CircleCheck size={16} aria-hidden className="notify-item__icon notify-item__icon--ok" />;
}

/** Bell button and its drop-down. `dismiss` is the shell's Escape/outside-press helper. */
export function NotificationBell({ useDismiss }: { useDismiss: (open: boolean, close: () => void, refs: Array<RefObject<HTMLElement | null>>, trigger: RefObject<HTMLElement | null>) => void }) {
  const { lang, t } = useLanguage();
  const state = useNotifications();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, [panel, button], button);
  const load = state?.load;
  // Each opening starts clean: a "mark all read" failure from an earlier opening is not shown again (FIX4).
  useEffect(() => {
    if (!open) return;
    setError('');
    load?.();
  }, [open, load]);
  if (!state) return null;
  const count = state.unread ?? 0;
  const label = count ? t('notify.bellUnread', { count }) : t('notify.bell');

  const follow = (item: AppNotification) => {
    void state.markRead(item);
    const link = safeLink(item.link);
    setOpen(false);
    if (!link) return;
    if (opensViewer(link)) window.open(link, '_blank', 'noopener');
    else navigate(link);
  };
  const readAll = async () => {
    setBusy(true);
    setError('');
    try { await state.markAllRead(); } catch (cause) { setError(userMessage(cause, lang)); } finally { setBusy(false); }
  };

  return (
    <div className="notify">
      <button
        ref={button}
        type="button"
        className="xc-icon-btn notify__button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls="notify-panel"
        onClick={() => setOpen((value) => !value)}
      >
        <Bell size={18} aria-hidden />
        {count > 0 && <span className="notify__count num" aria-hidden>{count > 99 ? '99+' : count}</span>}
      </button>
      {open && (
        <div ref={panel} id="notify-panel" className="notify__panel" role="region" aria-label={t('notify.title')}>
          <div className="notify__head">
            <h2 className="notify__title">{t('notify.title')}</h2>
            {count > 0 && <span className="notify__unread num">{t('notify.unreadCount', { count })}</span>}
            <span className="notify__spacer" />
            <button type="button" className="xc-btn xc-btn--quiet xc-btn--sm" disabled={busy || !count} onClick={readAll}><CheckCheck size={14} aria-hidden />{t('notify.readAll')}</button>
          </div>
          {error && <p className="notify__error" role="alert">{error}</p>}
          {state.error && !state.items ? (
            <p className="notify__empty" role="alert">{state.error} <button type="button" className="xc-btn xc-btn--line xc-btn--sm" onClick={state.load}>{t('common.retry')}</button></p>
          ) : !state.items ? (
            <p className="notify__empty" role="status">{t('notify.loading')}</p>
          ) : !state.items.length ? (
            <p className="notify__empty">{t('notify.empty')}</p>
          ) : (
            <ul className="notify__list">
              {state.items.map((item) => (
                <li key={item.id}>
                  <button type="button" className={`notify-item${item.readAt ? '' : ' is-unread'}`} onClick={() => follow(item)}>
                    <TypeIcon type={item.type} />
                    <span className="notify-item__text">
                      <span className="notify-item__meta">
                        <span>{TYPE_KEY[item.type] ? t(TYPE_KEY[item.type]) : item.type}</span>
                        <span className="tabular">{formatDateTime(item.createdAt, lang)}</span>
                        {!item.readAt && <span className="notify-item__new">{t('notify.new')}</span>}
                      </span>
                      <span className="notify-item__title">{item.title}</span>
                      {item.body && <span className="notify-item__body">{item.body}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="notify__foot">
            <Link to="/app/settings#settings-notify" className="notify__settings" onClick={() => setOpen(false)}><Settings size={14} aria-hidden />{t('notify.settings')}</Link>
          </div>
        </div>
      )}
    </div>
  );
}
