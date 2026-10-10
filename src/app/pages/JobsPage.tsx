import { ChevronDown, ChevronRight, ListChecks, RotateCcw, Square } from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { userMessage } from '../../api/httpClient';
import { JobSummary } from '../../api/generationApi';
import { Alert, Button, ButtonLink } from '../../components/ui';
import { Card, ConfirmDialog, EmptyState, PageHeader, Skeleton, useToast } from '../../components/ui/kit';
import { aiViewerHref, formatDateTime, jobs as jobService, unavailableJobsNotice } from '../api';
import { elapsed, isActive, jobTypeLabel, JobInputSummary, JobStatusBadge, JobSteps } from '../jobs';
import { useLoad } from '../useLoad';
import { formatDate, useLanguage } from '../../i18n';
import type { TKey } from '../../i18n';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
// The management screens' text (UR-53 stage 2) loads with these pages, not with the main bundle.
import '../../i18n/app';

type TypeFilter = '' | 'GEE_TO_ZARR' | 'GEOTIFF_BANDS,CAS500' | 'SHAPEFILE' | 'FUSION' | 'AI_WATER';
type StatusFilter = '' | 'QUEUED,RUNNING' | 'SUCCEEDED' | 'FAILED,CANCELLED';
const TYPES: TypeFilter[] = ['', 'GEE_TO_ZARR', 'GEOTIFF_BANDS,CAS500', 'SHAPEFILE', 'FUSION', 'AI_WATER'];
const STATUSES: StatusFilter[] = ['', 'QUEUED,RUNNING', 'SUCCEEDED', 'FAILED,CANCELLED'];
const pick = <T extends string>(value: string | null, allowed: T[]) => (allowed.includes(value as T) ? (value as T) : ('' as T));
/** Type filter buttons: source types keep their product names; the rest are dictionary keys. */
const TYPE_BUTTONS: Array<[TypeFilter, { key: TKey } | { text: string }]> = [
  ['', { key: 'app.all' }], ['GEE_TO_ZARR', { text: 'GEE' }], ['GEOTIFF_BANDS,CAS500', { text: 'GeoTIFF·CAS500' }], ['SHAPEFILE', { text: 'Shapefile' }],
  ['FUSION', { key: 'jobType.FUSION' }], ['AI_WATER', { key: 'jobType.AI_WATER' }],
];
const REFRESHED: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };

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
  const [tick, setTick] = useState(0);
  const [cancelling, setCancelling] = useState<JobSummary | null>(null);
  const toast = useToast();
  const jobs = useLoad(() => jobService.listWithStatus({ type, status }), [type, status, tick]);
  const items = useMemo(() => jobs.data?.items ?? [], [jobs.data]);
  const partialNotice = unavailableJobsNotice(jobs.data?.unavailable ?? [], lang);
  const anyActive = items.some(isActive);
  // Kept as a time and worded at render, so a language switch rewords it.
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  useEffect(() => { if (jobs.data) setRefreshedAt(new Date()); }, [jobs.data]);

  // While something is processing, refresh every 10 seconds (FR-JOB-03).
  useEffect(() => {
    if (!anyActive) return;
    const timer = window.setTimeout(() => setTick((value) => value + 1), 10000);
    return () => window.clearTimeout(timer);
  }, [anyActive, items]);

  // Ids are unique per service only, so rows are keyed by type too.
  const keyOf = (job: JobSummary) => `${job.type === 'FUSION' || job.type === 'AI_WATER' ? job.type : 'GEN'}:${job.id}`;
  const retry = async (job: JobSummary) => {
    setBusy(keyOf(job));
    setError('');
    try {
      const again = await jobService.retry(job);
      setOpen(keyOf(again));
      toast.show(t('jobs.retried'));
      setTick((value) => value + 1);
    } catch (cause) { setError(userMessage(cause, lang)); } finally { setBusy(''); }
  };
  // Cancelling stops work that cannot be resumed, so it is confirmed first; a failure stays in the dialog.
  const cancel = async (job: JobSummary) => {
    await jobService.cancel(job);
    setCancelling(null);
    toast.show(t('jobs.cancelled'));
    setTick((value) => value + 1);
  };

  return (
    <div className="page-stack">
      <PageHeader title={t('titles.jobs')} description={t('jobs.description')} actions={<><ButtonLink to="/app/analysis/fusion" variant="secondary">{t('titles.fusion')}</ButtonLink><ButtonLink to="/app/data/new">{t('shell.addData')}</ButtonLink></>} />
      <Card>
        <div className="toolbar">
          <div className="segmented" role="group" aria-label={t('jobs.typeLabel')}>
            {TYPE_BUTTONS.map(([value, label]) => (
              <button key={value || 'all'} type="button" aria-pressed={type === value} onClick={() => setType(value)}>{'key' in label ? t(label.key) : label.text}</button>
            ))}
          </div>
          <span className="toolbar__spacer" />
          {anyActive && refreshedAt && <span className="xc-hint tabular" aria-live="off">{t('jobs.refreshed', { time: formatDate(refreshedAt, REFRESHED, lang) })}</span>}
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
        {partialNotice && !jobs.error && <div className="inline-error"><Alert tone="warning">{partialNotice}</Alert><Button variant="line" size="sm" onClick={jobs.reload} className="inline-error__retry">{t('common.retry')}</Button></div>}
        {jobs.loading && !jobs.data ? (
          <Skeleton lines={4} label={t('jobs.loading')} />
        ) : jobs.error ? (
          <div className="inline-error"><Alert tone="danger">{t('app.jobListFailed', { error: jobs.error })}</Alert><Button variant="line" size="sm" onClick={jobs.reload} className="inline-error__retry">{t('common.retry')}</Button></div>
        ) : !items.length ? (
          <EmptyState icon={<ListChecks size={22} />} title={type || status ? t('jobs.noMatch') : t('jobs.none')} text={t('jobs.emptyText')} />
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
                        <td className="cell-main"><span className="xc-cell-main"><strong>{job.name || t('app.noName')}</strong>{job.errorMessage && <small className="job-error">{job.errorMessage}</small>}</span></td>
                        <td className="nowrap jobs-table__type">{jobTypeLabel(job.type, lang)}</td>
                        <td><JobStatusBadge job={job} /></td>
                        <td className="jobs-table__progress">
                          {job.status === 'RUNNING' && (
                            <span className="job-progress-cell">
                              <span className="job-progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={t('jobs.progressNamed', { name: job.name })}>
                                <i style={{ width: `${percent}%` }} />
                              </span>
                              <small className="tabular xc-hint">{percent}%</small>
                            </span>
                          )}
                        </td>
                        <td className="hide-sm tabular nowrap">{elapsed(job, Date.now(), lang)}</td>
                        <td className="hide-sm date">{formatDateTime(job.createdAt, lang)}</td>
                        <td className="cell-actions">
                          <div className="row-actions">
                            {job.registration?.datacubeId != null && job.status === 'SUCCEEDED' && (
                              <Link className="xc-btn xc-btn--ghost xc-btn--sm" to={`/app/data/${job.registration.datacubeId}`}>{t('jobs.viewData')}</Link>
                            )}
                            {job.type === 'AI_WATER' && job.status === 'SUCCEEDED' && job.input?.datacubeId != null && (
                              <a className="xc-btn xc-btn--ghost xc-btn--sm" href={aiViewerHref(String(job.input.datacubeId), job.id)} target="_blank" rel="noopener noreferrer" aria-label={t('app.compareInViewerNamed', { name: job.name })}>{t('app.compareShort')}</a>
                            )}
                            {isActive(job) && <Button size="sm" variant="quiet" disabled={busy === key} onClick={() => setCancelling(job)} aria-label={t('jobs.cancelNamed', { name: job.name })}><Square size={14} aria-hidden />{t('jobs.cancel')}</Button>}
                            {(job.status === 'FAILED' || job.status === 'CANCELLED') && <Button size="sm" variant="line" disabled={busy === key} onClick={() => retry(job)} aria-label={t('jobs.retryNamed', { name: job.name })}><RotateCcw size={14} aria-hidden />{t('jobs.retry')}</Button>}
                          </div>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="job-detail-row">
                          <td colSpan={8} className="cell-full">
                            <div className="job-detail">
                              <JobSteps job={job} />
                              {job.status === 'FAILED' && <Alert tone="danger">{t('jobs.failReason', { reason: job.errorMessage || job.errorCode || t('jobs.unknown') })}</Alert>}
                              {job.registration?.error && <Alert tone="warning">{t('jobs.registerFailed', { error: job.registration.error })}</Alert>}
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
