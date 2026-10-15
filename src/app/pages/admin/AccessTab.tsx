// S13 접속 기록 tab (UR-60, MON-contract §2): the last days at a glance with repeated-failure warnings, the sessions
// signed in now with forced sign-out, and the sign-in record with filters. IPs and devices are personal data: shown
// to administrators only, kept for the retention the server reports.
import { LogOut, RefreshCw, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Alert, Button } from '../../../components/ui';
import { Badge, ConfirmDialog, EmptyState, Segmented, Skeleton } from '../../../components/ui/kit';
import type { BadgeTone } from '../../../components/ui/kit';
import { formatDate, formatNumber, useLanguage } from '../../../i18n';
import type { Lang, TKey } from '../../../i18n';
import { grafanaAccessUrl } from '../../../api/adminApi';
import GrafanaButton from './GrafanaButton';
import { AccessSession, AccessSummary, admin, formatDateTime, LoginEvent } from '../../api';
import { useLoad } from '../../useLoad';
import { NoValue } from '../DataLibraryPage';
import { ListError } from './DataTab';
import { IconAction, PAGE_SIZE, Pager, useParam, useSearchParam } from './shared';

type View = 'summary' | 'sessions' | 'logins';
const VIEWS: View[] = ['summary', 'sessions', 'logins'];
export const LOGIN_EVENTS = ['LOGIN_SUCCESS', 'LOGIN_FAIL', 'LOGOUT', 'REFRESH_REUSE', 'PASSWORD_CHANGE', 'ADMIN_PASSWORD_RESET'] as const;
const EVENT_TONE: Record<string, BadgeTone> = { LOGIN_SUCCESS: 'success', LOGIN_FAIL: 'danger', REFRESH_REUSE: 'warning' };
const STAMP: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };

/** "대한민국 (KR)" / "South Korea (KR)"; the code alone when the browser does not know it; null → "알 수 없음". */
export function countryLabel(code: string | null, lang: Lang, unknown: string) {
  if (!code) return unknown;
  try {
    const name = new Intl.DisplayNames([lang], { type: 'region' }).of(code);
    return name && name !== code ? `${name} (${code})` : code;
  } catch { return code; }
}

/** "모바일 · iOS · Safari" — device kind in words, then what is known. */
export function deviceText(item: Pick<LoginEvent, 'device' | 'os' | 'browser'>, t: (key: TKey) => string) {
  const kind = item.device && ['DESKTOP', 'MOBILE', 'TABLET', 'BOT', 'UNKNOWN'].includes(item.device) ? t(`admin.access.device.${item.device}` as TKey) : item.device;
  return [kind, item.os, item.browser].filter(Boolean).join(' · ') || t('admin.unknown');
}

export function eventLabel(event: string, t: (key: TKey) => string) {
  return (LOGIN_EVENTS as readonly string[]).includes(event) ? t(`admin.access.event.${event}` as TKey) : event || '—';
}

function EventBadge({ item }: { item: Pick<LoginEvent, 'event' | 'reason'> }) {
  const { t } = useLanguage();
  const reason = item.reason && ['UNKNOWN_ID', 'BAD_PASSWORD', 'BLOCKED'].includes(item.reason) ? t(`admin.access.reason.${item.reason}` as TKey) : item.reason;
  return (
    <span className="admin-event">
      <Badge tone={EVENT_TONE[item.event] ?? 'neutral'}>{eventLabel(item.event, t)}</Badge>
      {reason && <small className="xc-hint">{reason}</small>}
    </span>
  );
}

/** Device in words; a bot reads as one "봇" tag followed by what it called itself. The raw user agent is the tooltip. */
function DeviceCell({ item }: { item: Pick<LoginEvent, 'device' | 'os' | 'browser' | 'bot'> & { userAgent?: string | null } }) {
  const { t } = useLanguage();
  if (!item.bot && item.device !== 'BOT') return <span title={item.userAgent ?? undefined}>{deviceText(item, t)}</span>;
  const rest = [item.os, item.browser].filter(Boolean).join(' · ');
  return <span className="admin-who" title={item.userAgent ?? undefined}><Badge tone="warning">{t('admin.access.bot')}</Badge>{rest && <span>{rest}</span>}</span>;
}

function IpCell({ ip, country }: { ip: string | null; country: string | null }) {
  const { lang, t } = useLanguage();
  if (!ip) return <NoValue label={t('admin.unknown')} />;
  return (
    <span className="xc-cell-main">
      <span className="admin-mono">{ip}</span>
      <small>{countryLabel(country, lang, t('admin.access.noCountry'))}</small>
    </span>
  );
}

export default function AccessTab({ onToast }: { onToast: (text: string) => void }) {
  const { t } = useLanguage();
  const [viewParam, setView] = useParam('view', 'summary');
  const view = (VIEWS.includes(viewParam as View) ? viewParam : 'summary') as View;
  const grafana = grafanaAccessUrl();
  return (
    <>
      <div className="toolbar admin-subnav">
        <Segmented
          label={t('admin.access.viewLabel')}
          value={view}
          onChange={(next) => setView(next, ['q', 'page', 'event', 'from', 'to'])}
          items={[{ id: 'summary', label: t('admin.access.views.summary') }, { id: 'sessions', label: t('admin.access.views.sessions') }, { id: 'logins', label: t('admin.access.views.logins') }]}
        />
        <span className="toolbar__spacer" />
        {grafana && (
          <GrafanaButton href={grafana} label={t('admin.access.grafana')} />
        )}
      </div>
      {view === 'summary' ? <SummaryView /> : view === 'sessions' ? <SessionsView onToast={onToast} /> : <LoginsView />}
    </>
  );
}

function SummaryView() {
  const { lang, t } = useLanguage();
  const summary = useLoad<AccessSummary>(() => admin.accessSummary(7));
  const data = summary.data;
  const n = (value: number) => formatNumber(value, {}, lang);
  if (summary.loading && !data) return <Skeleton lines={6} label={t('admin.access.summary.loading')} />;
  if (summary.error && !data) return <ListError text={t('admin.access.summary.failed', { error: summary.error })} onRetry={summary.reload} />;
  if (!data) return null;
  const busiest = Math.max(1, ...data.daily.map((day) => day.success + day.fail));
  return (
    <div className="admin-system__body" data-testid="admin-access-summary">
      <section className="admin-block" aria-labelledby="admin-access-overview">
        <div className="admin-block__head">
          <h3 id="admin-access-overview" className="admin-block__title">{t('admin.access.summary.title', { days: data.days })}</h3>
          <Button variant="line" size="sm" onClick={summary.reload} disabled={summary.loading}><RefreshCw size={14} aria-hidden />{t('admin.refresh')}</Button>
        </div>
        {data.warnings.length > 0 && (
          <div className="admin-warnings" role="group" aria-label={t('admin.access.summary.warningsLabel')}>
            {data.warnings.map((warning) => (
              <Alert key={warning.ip} tone="warning">
                {t('admin.access.summary.warning', {
                  ip: warning.ip,
                  country: countryLabel(warning.country, lang, t('admin.access.noCountry')),
                  count: n(warning.count),
                  minutes: n(data.rule.windowMinutes),
                  from: warning.from ? formatDateTime(warning.from, lang) : '—',
                  to: warning.to ? formatDate(warning.to, STAMP, lang) : '—',
                })}
              </Alert>
            ))}
          </div>
        )}
        <p className="admin-access-totals tabular">
          {t('admin.access.summary.totals', {
            success: n(data.totals.success), fail: n(data.totals.fail), ips: n(data.totals.uniqueIps), sessions: n(data.totals.activeSessions),
          })}
        </p>
        {data.warnings.length === 0 && <p className="xc-hint">{t('admin.access.summary.noWarnings', { count: n(data.rule.failCount), minutes: n(data.rule.windowMinutes) })}</p>}
        <table className="xc-table xc-table--cards admin-table">
          <caption className="sr-only">{t('admin.access.summary.dailyCaption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('admin.access.summary.date')}</th>
              <th scope="col" className="num">{t('admin.access.summary.success')}</th>
              <th scope="col" className="num">{t('admin.access.summary.fail')}</th>
              <th scope="col" className="num">{t('admin.access.summary.uniqueIps')}</th>
              <th scope="col" className="hide-sm"><span className="sr-only">{t('admin.access.summary.share')}</span></th>
            </tr>
          </thead>
          <tbody>
            {data.daily.map((day) => (
              <tr key={day.date}>
                <td className="cell-main date"><strong>{formatDate(`${day.date}T12:00:00Z`, { month: 'short', day: 'numeric', weekday: 'short' }, lang)}</strong></td>
                <td className="num" data-label={t('admin.access.summary.success')}>{n(day.success)}</td>
                <td className="num" data-label={t('admin.access.summary.fail')}><span className={day.fail > 0 ? 'admin-warn-number' : undefined}>{n(day.fail)}</span></td>
                <td className="num" data-label={t('admin.access.summary.uniqueIps')}>{n(day.uniqueIps)}</td>
                <td className="hide-sm admin-access-bar-cell" aria-hidden>
                  <span className="admin-access-bar">
                    <span className="admin-access-bar__ok" style={{ width: `${(day.success / busiest) * 100}%` }} />
                    <span className="admin-access-bar__fail" style={{ width: `${(day.fail / busiest) * 100}%` }} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="admin-access-split">
        <section className="admin-block" aria-labelledby="admin-access-countries">
          <h3 id="admin-access-countries" className="admin-block__title">{t('admin.access.summary.countries')}</h3>
          {!data.countries.length ? <p className="admin-block__empty">{t('admin.access.summary.none')}</p> : (
            <table className="xc-table admin-table admin-table--plain">
              <thead><tr><th scope="col">{t('admin.access.country')}</th><th scope="col" className="num">{t('admin.access.summary.success')}</th><th scope="col" className="num">{t('admin.access.summary.fail')}</th></tr></thead>
              <tbody>
                {data.countries.map((item) => (
                  <tr key={item.country ?? 'unknown'}>
                    <td>{countryLabel(item.country, lang, t('admin.access.noCountry'))}</td>
                    <td className="num">{n(item.success)}</td>
                    <td className="num">{n(item.fail)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="admin-block" aria-labelledby="admin-access-failed-ips">
          <h3 id="admin-access-failed-ips" className="admin-block__title">{t('admin.access.summary.topFailed')}</h3>
          {!data.topFailedIps.length ? <p className="admin-block__empty">{t('admin.access.summary.noFailures')}</p> : (
            <table className="xc-table admin-table admin-table--plain">
              <thead><tr><th scope="col">IP</th><th scope="col" className="num">{t('admin.access.summary.fail')}</th><th scope="col" className="num">{t('admin.access.summary.success')}</th><th scope="col">{t('admin.access.summary.last')}</th></tr></thead>
              <tbody>
                {data.topFailedIps.map((item) => (
                  <tr key={item.ip}>
                    <td><IpCell ip={item.ip} country={item.country} /></td>
                    <td className="num"><span className="admin-warn-number">{n(item.fails)}</span></td>
                    <td className="num">{n(item.successes)}</td>
                    <td className="date">{item.lastAt ? formatDateTime(item.lastAt, lang) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
      <p className="admin-note admin-access-privacy xc-hint">{t('admin.access.privacy', { days: n(data.retentionDays ?? 90) })}</p>
      {summary.error && <Alert tone="warning">{t('admin.system.stale', { error: summary.error })}</Alert>}
    </div>
  );
}

function SessionsView({ onToast }: { onToast: (text: string) => void }) {
  const { lang, t } = useLanguage();
  const sessions = useLoad<AccessSession[]>(() => admin.listSessions());
  const [ending, setEnding] = useState<AccessSession | null>(null);
  const items = sessions.data ?? [];
  return (
    <>
      <div className="toolbar">
        <span className="xc-hint">{t('admin.access.sessions.note')}</span>
        <span className="toolbar__spacer" />
        {sessions.data && <span className="xc-hint tabular" aria-live="polite">{t('admin.access.sessions.count', { count: items.length })}</span>}
        <Button variant="line" size="sm" onClick={sessions.reload} disabled={sessions.loading}><RefreshCw size={14} aria-hidden />{t('admin.refresh')}</Button>
      </div>
      {sessions.loading && !sessions.data ? <Skeleton lines={4} label={t('admin.access.sessions.loading')} />
        : sessions.error && !sessions.data ? <ListError text={t('admin.access.sessions.failed', { error: sessions.error })} onRetry={sessions.reload} />
          : !items.length ? <EmptyState title={t('admin.access.sessions.none')} />
            : (
              <div className="xc-stale" aria-busy={sessions.loading} data-testid="admin-sessions">
                <div className="xc-table-wrap">
                  <table className="xc-table xc-table--cards admin-table">
                    <thead>
                      <tr>
                        <th scope="col">{t('admin.access.user')}</th>
                        <th scope="col">{t('admin.access.deviceCol')}</th>
                        <th scope="col">IP</th>
                        <th scope="col">{t('admin.access.sessions.started')}</th>
                        <th scope="col">{t('admin.access.sessions.lastRefresh')}</th>
                        <th scope="col"><span className="sr-only">{t('app.actions')}</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((session) => (
                        <tr key={session.familyId} data-testid={`admin-session-${session.familyId}`}>
                          <td className="cell-main">
                            <span className="xc-cell-main">
                              <span className="admin-who">
                                <strong>{session.loginId ?? t('admin.userNumber', { id: session.userId ?? '—' })}</strong>
                                {session.current && <Badge tone="primary">{t('admin.access.sessions.thisDevice')}</Badge>}
                              </span>
                              {session.name && <small>{session.name}</small>}
                            </span>
                          </td>
                          <td data-label={t('admin.access.deviceCol')}><DeviceCell item={session} /></td>
                          <td data-label="IP"><IpCell ip={session.ip} country={session.country} /></td>
                          <td className="date" data-label={t('admin.access.sessions.started')}>{formatDateTime(session.startedAt, lang)}</td>
                          <td className="date" data-label={t('admin.access.sessions.lastRefresh')}>{formatDateTime(session.lastRefreshAt, lang)}</td>
                          <td className="cell-actions">
                            <div className="row-actions">
                              <IconAction label={t('admin.access.sessions.revokeNamed', { loginId: session.loginId ?? '' })} onClick={() => setEnding(session)}>
                                <LogOut size={16} aria-hidden />
                              </IconAction>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
      {ending && (
        <ConfirmDialog
          title={t('admin.access.sessions.revokeTitle')}
          description={(
            <>
              {t('admin.access.sessions.revokeText', { loginId: ending.loginId ?? '', device: deviceText(ending, t), ip: ending.ip ?? t('admin.unknown') })}
              {ending.current && <><br />{t('admin.access.sessions.revokeSelf')}</>}
            </>
          )}
          confirmLabel={t('admin.access.sessions.revokeConfirm')}
          busyLabel={t('admin.access.sessions.revoking')}
          onClose={() => setEnding(null)}
          onConfirm={async () => {
            await admin.revokeSession(ending.familyId);
            sessions.setData((current) => current && current.filter((item) => item.familyId !== ending.familyId));
            setEnding(null);
            onToast(t('admin.access.sessions.revoked', { loginId: ending.loginId ?? '' }));
          }}
        />
      )}
    </>
  );
}

function LoginsView() {
  const { lang, t } = useLanguage();
  const [text, setText, q] = useSearchParam();
  const [event, setEvent] = useParam('event');
  const [from, setFrom] = useParam('from');
  const [to, setTo] = useParam('to');
  const [pageParam, setPage] = useParam('page');
  const page = Math.max(0, Number(pageParam) || 0);
  const list = useLoad(() => admin.listLogins({ q, event, from, to, page, size: PAGE_SIZE }), [q, event, from, to, page]);
  const items = list.data?.items ?? [];
  const filtered = !!(q || event || from || to);
  const rangeError = useMemo(() => (from && to && from > to ? t('admin.access.logins.rangeError') : ''), [from, to, t]);
  return (
    <>
      <div className="toolbar admin-access-filters">
        <label className="toolbar__search">
          <Search size={16} aria-hidden />
          <input type="search" value={text} onChange={(change) => setText(change.target.value)} placeholder={t('admin.access.logins.searchPlaceholder')} aria-label={t('admin.access.logins.search')} autoComplete="off" spellCheck={false} />
        </label>
        <label>
          <span className="sr-only">{t('admin.access.logins.eventFilter')}</span>
          <select className="xc-select" aria-label={t('admin.access.logins.eventFilter')} value={event} onChange={(change) => setEvent(change.target.value, ['page'])}>
            <option value="">{t('admin.access.logins.allEvents')}</option>
            {LOGIN_EVENTS.map((value) => <option key={value} value={value}>{eventLabel(value, t)}</option>)}
          </select>
        </label>
        <label className="admin-date">
          <span>{t('admin.access.logins.from')}</span>
          <input type="date" value={from} max={to || undefined} onChange={(change) => setFrom(change.target.value, ['page'])} aria-invalid={rangeError ? true : undefined} />
        </label>
        <label className="admin-date">
          <span>{t('admin.access.logins.to')}</span>
          <input type="date" value={to} min={from || undefined} onChange={(change) => setTo(change.target.value, ['page'])} aria-invalid={rangeError ? true : undefined} />
        </label>
        <span className="toolbar__spacer" />
        {list.data && <span className="xc-hint tabular" aria-live="polite">{t('admin.access.logins.count', { count: list.data.total })}</span>}
      </div>
      {rangeError && <div className="inline-error"><Alert tone="warning">{rangeError}</Alert></div>}
      {list.loading && !list.data ? <Skeleton lines={6} label={t('admin.access.logins.loading')} />
        : list.error ? <ListError text={t('admin.access.logins.failed', { error: list.error })} onRetry={list.reload} />
          : !items.length ? <EmptyState title={filtered ? t('admin.access.logins.noMatch') : t('admin.access.logins.none')} />
            : (
              <div className="xc-stale" aria-busy={list.loading} data-testid="admin-logins">
                {list.loading && <span className="xc-busy-line" aria-hidden />}
                <div className="xc-table-wrap">
                  <table className="xc-table xc-table--cards admin-table">
                    <thead>
                      <tr>
                        <th scope="col">{t('admin.access.logins.when')}</th>
                        <th scope="col">{t('admin.access.logins.event')}</th>
                        <th scope="col">{t('admin.access.logins.loginId')}</th>
                        <th scope="col">IP</th>
                        <th scope="col">{t('admin.access.deviceCol')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id}>
                          <td className="date" data-label={t('admin.access.logins.when')}>{formatDateTime(item.createdAt, lang)}</td>
                          <td className="cell-main"><EventBadge item={item} /></td>
                          <td data-label={t('admin.access.logins.loginId')}><span className="admin-mono">{item.loginId ?? '—'}</span></td>
                          <td data-label="IP"><IpCell ip={item.ip} country={item.country} /></td>
                          <td data-label={t('admin.access.deviceCol')}><DeviceCell item={item} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {list.data && <Pager page={page} total={list.data.total} onPage={(next) => setPage(next ? String(next) : '')} />}
              </div>
            )}
    </>
  );
}
