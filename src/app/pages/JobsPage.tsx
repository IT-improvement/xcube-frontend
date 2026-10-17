import { ChevronDown, ChevronRight, Download, ExternalLink, ListChecks, RotateCcw, Square } from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { userMessage } from '../../api/httpClient';
import { JobSummary } from '../../api/generationApi';
import { Alert, Button, ButtonLink } from '../../components/ui';
import { NEEDS, useRoleGate } from '../../auth/roles';
import { Card, ConfirmDialog, EmptyState, PageHeader, Segmented, Skeleton, useToast } from '../../components/ui/kit';
import { aiViewerHref, formatDateTime, isCompareJob, isExportJob, JobListResult, jobs as jobService, unavailableJobsNotice, viewerHref } from '../api';
import { exportFallbackName, exportsApi, saveBlob } from '../../api/exports';
import type { ExportKind, ExportFacts as ExportFactsShape } from '../../api/exports';
import { formatBytes } from '../fusion';
import { elapsed, isActive, jobTypeLabel, JobInputSummary, JobStatusBadge, JobSteps, POLL_ACTIVE_MS, useJobsFeed } from '../jobs';
import { useLoad } from '../useLoad';
import { failureText, formatDate, registrationFailureText, useLanguage } from '../../i18n';
import type { TKey } from '../../i18n';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
// The management screens' text (UR-53 stage 2) loads with these pages, not with the main bundle.
import '../../i18n/app';

type TypeFilter = '' | 'GEE_TO_ZARR' | 'GEOTIFF_BANDS,CAS500' | 'SENTINEL2_L2A,LANDSAT_C2L2' | 'SHAPEFILE' | 'FUSION' | 'AI_WATER' | 'COMPARE' | 'EXPORT_GEOTIFF,EXPORT_ANIMATION,EXPORT_REPORT';
type StatusFilter = '' | 'QUEUED,RUNNING' | 'SUCCEEDED' | 'FAILED,CANCELLED';
const TYPES: TypeFilter[] = ['', 'GEE_TO_ZARR', 'GEOTIFF_BANDS,CAS500', 'SENTINEL2_L2A,LANDSAT_C2L2', 'SHAPEFILE', 'FUSION', 'AI_WATER', 'COMPARE', 'EXPORT_GEOTIFF,EXPORT_ANIMATION,EXPORT_REPORT'];
const STATUSES: StatusFilter[] = ['', 'QUEUED,RUNNING', 'SUCCEEDED', 'FAILED,CANCELLED'];
const pick = <T extends string>(value: string | null, allowed: T[]) => (allowed.includes(value as T) ? (value as T) : ('' as T));
/** Type filter buttons: source types keep their product names; the rest are dictionary keys. */
const TYPE_BUTTONS: Array<[TypeFilter, { key: TKey } | { text: string }]> = [
  ['', { key: 'app.all' }], ['GEE_TO_ZARR', { text: 'GEE' }], ['GEOTIFF_BANDS,CAS500', { text: 'GeoTIFF·CAS500' }], ['SENTINEL2_L2A,LANDSAT_C2L2', { text: 'Sentinel-2·Landsat' }], ['SHAPEFILE', { text: 'Shapefile' }],
  ['FUSION', { key: 'jobType.FUSION' }], ['AI_WATER', { key: 'jobType.AI_WATER' }], ['COMPARE', { key: 'jobType.COMPARE' }],
  ['EXPORT_GEOTIFF,EXPORT_ANIMATION,EXPORT_REPORT', { key: 'jobs.export.filter' }],
];
/** Export file kind from the job type (EXPORT_GEOTIFF → GEOTIFF). */
const exportKindOf = (type: string) => type.replace('EXPORT_', '') as ExportKind;
type ExportFacts = ExportFactsShape;
const exportOf = (job: JobSummary) => (job as JobSummary & { export?: ExportFacts | null }).export ?? null;
// Seconds, so each 10-second refresh visibly changes the time.
const REFRESHED: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' };

/** S10 작업 센터: the user's generation, fusion and AI jobs with progress, steps, cancel and retry (FR-JOB-01·02). */
export default function JobsPage() {
  const { lang, t } = useLanguage();
  useDocumentTitle(t('titles.jobs'));
  // Filters live in the URL (?type=FUSION&status=QUEUED,RUNNING) so reloads and links keep them.
  const [params, setParams] = useSearchParams();
  const type = pick(params.get('type'), TYPES);
  const status = pick(params.get('status'), STATUSES);
  const setFilter = (key: 'type' | 'status', value: string) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(key, value); else next.delete(key);
      return next;
    }, { replace: true });
  const setType = (value: TypeFilter) => setFilter('type', value);
  const setStatus = (value: StatusFilter) => setFilter('status', value);
  const [open, setOpen] = useState<string | null>(null); // jobKey of the expanded row
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState<JobSummary | null>(null);
  const toast = useToast();
  // UR-59: retrying runs the job again, so it needs PROJECT_USER (cancel stays: it only stops work).
  const retryLocked = useRoleGate().reason(NEEDS.createData);
  // All jobs come from the shell's one poller (the top bar badge reads the same list). A type or status filter
  // asks the services for just those jobs, and follows the poller's ticks quietly.
  const feed = useJobsFeed();
  const filtered = !!(type || status);
  const own = useLoad<JobListResult | null>(() => (filtered ? jobService.listWithStatus({ type, status }) : Promise.resolve(null)), [type, status]);
  const seenTick = useRef(feed.tick);
  const ownRefresh = own.refresh;
  const ownReady = !!own.data && !own.loading;
  useEffect(() => {
    if (feed.tick === seenTick.current) return;
    seenTick.current = feed.tick;
    if (filtered && ownReady) ownRefresh();
  }, [feed.tick, filtered, ownReady, ownRefresh]);
  // While new filters load, the rows already on screen stay, dimmed and marked busy, instead of passing for the new result.
  const fresh = filtered ? own.data : feed.data;
  const lastShown = useRef<JobListResult | null>(null);
  if (fresh) lastShown.current = fresh;
  const shown = fresh ?? lastShown.current;
  const stale = filtered ? own.loading && !!shown : feed.loading && !!shown;
  const loadError = filtered ? own.error : feed.error;
  const items = useMemo(() => shown?.items ?? [], [shown]);
  const partialNotice = unavailableJobsNotice(shown?.unavailable ?? [], lang);
  const anyActive = (feed.activeCount ?? 0) > 0 || items.some(isActive);
  const refreshedAt = filtered ? (own.data ? feed.refreshedAt : null) : feed.refreshedAt;
  const refreshAll = () => { feed.refresh(); if (filtered) own.refresh(); };
  const retryList = () => { if (filtered) own.reload(); else feed.refresh(); };

  // Ids are unique per service only, so rows are keyed by type too.
  const keyOf = (job: JobSummary) => `${job.type === 'FUSION' || job.type === 'AI_WATER' || job.type === 'COMPARE' ? job.type : 'GEN'}:${job.id}`;
  // Export files need the sign-in token, so they come through fetch → blob and are saved under the server's name (F2).
  const download = async (job: JobSummary) => {
    setBusy(keyOf(job));
    setError('');
    try {
      const facts = exportOf(job);
      const file = await exportsApi.file(job.id, facts?.fileName ?? exportFallbackName(exportKindOf(job.type), String(job.input?.format ?? '')));
      saveBlob(file.blob, file.fileName);
    } catch (cause) { setError(userMessage(cause, lang)); } finally { setBusy(''); }
  };
  const retry = async (job: JobSummary) => {
    setBusy(keyOf(job));
    setError('');
    try {
      const again = await jobService.retry(job);
      setOpen(keyOf(again));
      toast.show(t('jobs.retried'));
      refreshAll();
    } catch (cause) { setError(userMessage(cause, lang)); } finally { setBusy(''); }
  };
  // Cancelling stops work that cannot be resumed, so it is confirmed first; a failure stays in the dialog.
  const cancel = async (job: JobSummary) => {
    await jobService.cancel(job);
    setCancelling(null);
    toast.show(t('jobs.cancelled'));
    refreshAll();
  };

  /** "12.3 MB · 10. 24.까지" for a finished export (7-day retention). */
  const exportFacts = (facts: ExportFacts) => [facts.sizeBytes != null ? formatBytes(facts.sizeBytes) : '', facts.expired ? t('jobs.export.expired') : facts.expiresAt ? t('jobs.export.until', { date: formatDateTime(facts.expiresAt, lang) }) : ''].filter(Boolean).join(' · ');

  return (
    <div className="page-stack">
      {/* "데이터 추가" is the top bar's (decision 2); band math stays as the one other way to start a job. */}
      <PageHeader title={t('titles.jobs')} description={t('jobs.description')} actions={<ButtonLink to="/app/analysis/fusion" variant="secondary">{t('titles.fusion')}</ButtonLink>} />
      <Card>
        <div className="toolbar">
          <Segmented label={t('jobs.typeLabel')} value={type} onChange={setType} items={TYPE_BUTTONS.map(([value, label]) => ({ id: value, label: 'key' in label ? t(label.key) : label.text }))} />
          <span className="toolbar__spacer" />
          {/* A live sign: the time (with seconds) fades in anew on every refresh. Not announced. */}
          {anyActive && refreshedAt && <span key={refreshedAt.getTime()} className="xc-hint tabular refresh-stamp" aria-live="off">{t('jobs.refreshed', { time: formatDate(refreshedAt, REFRESHED, lang), seconds: POLL_ACTIVE_MS / 1000 })}</span>}
          <label>
            <span className="sr-only">{t('app.status')}</span>
            <select className="xc-select" aria-label={t('app.status')} value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}>
              <option value="">{t('jobs.allStatuses')}</option>
              <option value="QUEUED,RUNNING">{t('jobs.active')}</option>
              <option value="SUCCEEDED">{t('jobs.succeeded')}</option>
              <option value="FAILED,CANCELLED">{t('jobs.failedOrCancelled')}</option>
            </select>
          </label>
        </div>
        {error && <div className="inline-error"><Alert tone="danger">{error}</Alert></div>}
        {partialNotice && !loadError && !stale && <div className="inline-error"><Alert tone="warning">{partialNotice}</Alert><Button variant="line" size="sm" onClick={retryList} className="inline-error__retry">{t('common.retry')}</Button></div>}
        {!shown && !loadError ? (
          <Skeleton lines={4} label={t('jobs.loading')} />
        ) : loadError ? (
          <div className="inline-error"><Alert tone="danger">{t('app.jobListFailed', { error: loadError })}</Alert><Button variant="line" size="sm" onClick={retryList} className="inline-error__retry">{t('common.retry')}</Button></div>
        ) : (
        <div className="xc-stale" aria-busy={stale} aria-label={stale ? t('jobs.updating') : undefined} data-testid="jobs-list">
          {stale && <span className="xc-busy-line" aria-hidden />}
          {!items.length ? (
          <EmptyState icon={<ListChecks size={22} />} title={filtered ? t('jobs.noMatch') : t('jobs.none')} text={t('jobs.emptyText')} />
        ) : (
          <div className="xc-table-wrap">
            <table className="xc-table xc-table--cards jobs-table">
              <thead>
                <tr>
                  <th scope="col"><span className="sr-only">{t('jobs.expand')}</span></th>
                  <th scope="col">{t('jobs.job')}</th>
                  <th scope="col">{t('app.kind')}</th>
                  <th scope="col">{t('app.status')}</th>
                  <th scope="col" className="hide-sm">{t('jobs.progress')}</th>
                  <th scope="col" className="hide-sm">{t('jobs.duration')}</th>
                  <th scope="col" className="hide-sm">{t('app.requested')}</th>
                  <th scope="col"><span className="sr-only">{t('app.actions')}</span></th>
                </tr>
              </thead>
              <tbody>
                {items.map((job) => {
                  const key = keyOf(job);
                  const expanded = open === key;
                  const percent = Math.round((job.progress ?? 0) * 100);
                  return (
                    <Fragment key={key}>
                      <tr>
                        <td>
                          <button type="button" className="xc-icon-btn" aria-expanded={expanded} aria-label={t(expanded ? 'jobs.collapseNamed' : 'jobs.expandNamed', { name: job.name })} onClick={() => setOpen(expanded ? null : key)}>
                            {expanded ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
                          </button>
                        </td>
                        <td className="cell-main"><span className="xc-cell-main"><strong>{job.name || t('app.noName')}</strong>{job.errorMessage && <small className="job-error">{failureText(job, lang)}</small>}{isExportJob(job) && job.status === 'SUCCEEDED' && exportOf(job) && <small className="job-export tabular">{exportFacts(exportOf(job)!)}</small>}</span></td>
                        <td className="nowrap jobs-table__type">{jobTypeLabel(job.type, lang)}</td>
                        <td><JobStatusBadge job={job} /></td>
                        <td className="jobs-table__progress">
                          {job.status === 'RUNNING' && (
                            <span className="job-progress-cell">
                              <svg className="job-progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={t('jobs.progressNamed', { name: job.name })}>
                                <rect width={`${percent}%`} height="100%" />
                              </svg>
                              <small className="tabular xc-hint">{percent}%</small>
                            </span>
                          )}
                        </td>
                        <td className="tabular nowrap" data-label={t('jobs.duration')}>{elapsed(job, Date.now(), lang)}</td>
                        <td className="hide-sm date">{formatDateTime(job.createdAt, lang)}</td>
                        <td className="cell-actions">
                          <div className="row-actions">
                            {job.registration?.datacubeId != null && job.status === 'SUCCEEDED' && !isCompareJob(job) && (
                              <Link className="xc-btn xc-btn--ghost xc-btn--sm" to={`/app/data/${job.registration.datacubeId}`}>{t('jobs.viewData')}</Link>
                            )}
                            {job.type === 'AI_WATER' && job.status === 'SUCCEEDED' && job.input?.datacubeId != null && (
                              <a className="xc-btn xc-btn--ghost xc-btn--sm" href={aiViewerHref(String(job.input.datacubeId), job.id)} target="_blank" rel="noopener noreferrer" aria-label={t('app.compareInViewerNamed', { name: job.name })}>{t('app.compareShort')}</a>
                            )}
                            {isExportJob(job) && job.status === 'SUCCEEDED' && (exportOf(job)?.expired
                              ? <span className="xc-hint">{t('jobs.export.expired')}</span>
                              : <Button size="sm" variant="line" disabled={busy === key} onClick={() => download(job)} aria-label={t('jobs.export.downloadNamed', { name: job.name })}><Download size={14} aria-hidden />{busy === key ? t('jobs.export.downloading') : t('jobs.export.download')}</Button>)}
                            {isCompareJob(job) && job.status === 'SUCCEEDED' && job.registration?.datacubeId != null && (
                              <a className="xc-btn xc-btn--ghost xc-btn--sm" href={viewerHref(String(job.registration.datacubeId))} target="_blank" rel="noopener noreferrer" aria-label={t('jobs.compare.viewNamed', { name: job.name })}>{t('jobs.compare.view')}<ExternalLink size={13} aria-hidden /></a>
                            )}
                            {isActive(job) && <Button size="sm" variant="quiet" disabled={busy === key} onClick={() => setCancelling(job)} aria-label={t('jobs.cancelNamed', { name: job.name })}><Square size={14} aria-hidden />{t('jobs.cancel')}</Button>}
                            {(job.status === 'FAILED' || job.status === 'CANCELLED') && !isCompareJob(job) && <Button size="sm" variant="line" disabled={busy === key} aria-disabled={retryLocked ? true : undefined} title={retryLocked || undefined} onClick={retryLocked ? undefined : () => retry(job)} aria-label={t('jobs.retryNamed', { name: job.name })}><RotateCcw size={14} aria-hidden />{t('jobs.retry')}</Button>}
                          </div>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="job-detail-row">
                          <td colSpan={8} className="cell-full">
                            <div className="job-detail">
                              <JobSteps job={job} />
                              {job.status === 'FAILED' && <Alert tone="danger">{t('jobs.failReason', { reason: failureText(job, lang) || t('jobs.unknown') })}</Alert>}
                              {registrationFailureText(job.registration, lang) && <Alert tone="warning">{t('jobs.registerFailed', { error: registrationFailureText(job.registration, lang) })}</Alert>}
                              <JobInputSummary job={job} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        </div>
        )}
      </Card>
      {cancelling && (
        <ConfirmDialog
          title={t('jobs.cancelTitle')}
          description={t('jobs.cancelText', { name: cancelling.name || t('app.noName') })}
          confirmLabel={t('jobs.cancelConfirm')}
          busyLabel={t('jobs.cancelBusy')}
          cancelLabel={t('jobs.keepRunning')}
          onConfirm={() => cancel(cancelling)}
          onClose={() => setCancelling(null)}
        />
      )}
      {toast.node}
    </div>
  );
}
