// S13 데이터·작업 tab: every user's data (with its owner, delete), projects, and jobs of all three services (status
// filter, cancel a job that hangs, failure reason when a row opens).
import { ChevronDown, ChevronRight, Search, Square, Trash2, X } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button } from '../../../components/ui';
import { Badge, ConfirmDialog, EmptyState, Segmented, Skeleton } from '../../../components/ui/kit';
import { failureText, useLanguage } from '../../../i18n';
import type { TKey } from '../../../i18n';
import { admin, AdminDataset, AdminJob, formatDate, formatDateTime } from '../../api';
import { formatBytes } from '../../fusion';
import { elapsed, isActive, JobInputSummary, JobStatusBadge, JobSteps, jobTypeLabel } from '../../jobs';
import { useLoad } from '../../useLoad';
import { NoValue } from '../DataLibraryPage';
import { Directory, IconAction, ownerLabel, PAGE_SIZE, Pager, useParam, useSearchParam } from './shared';

type View = 'datasets' | 'projects' | 'jobs';
const VIEWS: View[] = ['datasets', 'projects', 'jobs'];
const KINDS = ['', 'ORIGINAL', 'FUSION', 'AI_RESULT'] as const;
const KIND_LABEL: Record<string, TKey> = { ORIGINAL: 'kinds.original', FUSION: 'kinds.fusion', AI_RESULT: 'kinds.ai' };

export default function DataTab({ directory, onToast }: { directory: Directory; onToast: (text: string) => void }) {
  const { t } = useLanguage();
  const [viewParam, setView] = useParam('view', 'datasets');
  const view = (VIEWS.includes(viewParam as View) ? viewParam : 'datasets') as View;
  return (
    <>
      <div className="toolbar admin-subnav">
        <Segmented
          label={t('admin.data.viewLabel')}
          value={view}
          onChange={(next) => setView(next, ['q', 'page', 'kind', 'owner', 'status'])}
          items={[{ id: 'datasets', label: t('admin.data.views.datasets') }, { id: 'projects', label: t('admin.data.views.projects') }, { id: 'jobs', label: t('admin.data.views.jobs') }]}
        />
      </div>
      {view === 'datasets' ? <DatasetsView directory={directory} onToast={onToast} /> : view === 'projects' ? <ProjectsView directory={directory} /> : <JobsView directory={directory} onToast={onToast} />}
    </>
  );
}

/** Owner select from the directory, plus the chosen owner if the directory does not know them (a link from S13 사용자). */
function OwnerFilter({ directory, value, onChange }: { directory: Directory; value: string; onChange: (value: string) => void }) {
  const { t } = useLanguage();
  const known = directory.byId.has(value);
  return (
    <label>
      <span className="sr-only">{t('admin.data.ownerFilter')}</span>
      <select className="xc-select" aria-label={t('admin.data.ownerFilter')} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{t('admin.data.allOwners')}</option>
        {value && !known && <option value={value}>{t('admin.userNumber', { id: value })}</option>}
        {directory.users.map((user) => <option key={user.id} value={user.id}>{user.loginId}</option>)}
      </select>
    </label>
  );
}

function DatasetsView({ directory, onToast }: { directory: Directory; onToast: (text: string) => void }) {
  const { lang, t } = useLanguage();
  const [text, setText, q] = useSearchParam();
  const [kind, setKind] = useParam('kind');
  const [owner, setOwner] = useParam('owner');
  const [pageParam, setPage] = useParam('page');
  const page = Math.max(0, Number(pageParam) || 0);
  const list = useLoad(() => admin.listDatasets({ q, kind, ownerId: owner, page, size: PAGE_SIZE }), [q, kind, owner, page]);
  const items = list.data?.items ?? [];
  const [deleting, setDeleting] = useState<AdminDataset | null>(null);
  const filtered = !!(q || kind || owner);
  return (
    <>
      <div className="toolbar">
        <label className="toolbar__search">
          <Search size={16} aria-hidden />
          <input type="search" value={text} onChange={(event) => setText(event.target.value)} placeholder={t('admin.data.searchDatasets')} aria-label={t('admin.data.searchDatasetsLabel')} autoComplete="off" spellCheck={false} />
        </label>
        <Segmented label={t('admin.data.kindLabel')} value={kind as (typeof KINDS)[number]} onChange={(next) => setKind(next, ['page'])} items={KINDS.map((value) => ({ id: value, label: value ? t(KIND_LABEL[value]) : t('app.all') }))} />
        <OwnerFilter directory={directory} value={owner} onChange={(next) => setOwner(next, ['page'])} />
        <span className="toolbar__spacer" />
        {list.data && <span className="xc-hint tabular" aria-live="polite">{t('admin.data.count', { count: list.data.total })}</span>}
      </div>
      {list.loading && !list.data ? <Skeleton lines={5} label={t('admin.data.loading')} />
        : list.error ? <ListError text={t('admin.data.failed', { error: list.error })} onRetry={list.reload} />
          : !items.length ? <EmptyState title={filtered ? t('admin.data.noMatch') : t('admin.data.none')} action={filtered ? <Button variant="line" onClick={() => { setText(''); setKind('', ['q', 'owner', 'page']); }}><X size={14} aria-hidden />{t('data.reset')}</Button> : undefined} />
            : (
              <div className="xc-stale" aria-busy={list.loading}>
                {list.loading && <span className="xc-busy-line" aria-hidden />}
                <div className="xc-table-wrap">
                  <table className="xc-table xc-table--cards admin-table">
                    <thead>
                      <tr>
                        <th scope="col">{t('app.name')}</th>
                        <th scope="col">{t('app.kind')}</th>
                        <th scope="col">{t('admin.data.owner')}</th>
                        <th scope="col" className="num">{t('admin.data.size')}</th>
                        <th scope="col" className="hide-sm">{t('admin.data.created')}</th>
                        <th scope="col"><span className="sr-only">{t('app.actions')}</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id}>
                          <td className="cell-main">
                            <span className="xc-cell-main">
                              <Link to={`/app/data/${encodeURIComponent(item.id)}`}>{item.name || t('app.noName')}</Link>
                              <small className="cell-sub">
                                {item.status && /UNAVAILABLE|FAILED|ERROR/i.test(item.status) && <Badge tone="danger">{t('availability.unavailable')}</Badge>}
                                {item.status && /PENDING|SYNC|QUEUED|RUNNING/i.test(item.status) && <Badge tone="warning">{t('availability.syncing')}</Badge>}
                                {item.xcubeDatasetId && <span>{item.xcubeDatasetId}</span>}
                              </small>
                            </span>
                          </td>
                          <td data-label={t('app.kind')}><Badge tone={item.kind === 'FUSION' ? 'water' : item.kind === 'AI_RESULT' ? 'result' : 'neutral'}>{KIND_LABEL[item.kind] ? t(KIND_LABEL[item.kind]) : item.kind}</Badge></td>
                          <td data-label={t('admin.data.owner')}>{ownerLabel(directory, item.ownerId, item.ownerLoginId, t)}</td>
                          <td className="num" data-label={t('admin.data.size')}>{item.sizeBytes != null ? formatBytes(item.sizeBytes) : <NoValue label={t('admin.unknown')} />}</td>
                          <td className="hide-sm date">{formatDate(item.createdAt, lang)}</td>
                          <td className="cell-actions">
                            <div className="row-actions">
                              <IconAction label={t('admin.data.deleteNamed', { name: item.name })} onClick={() => setDeleting(item)}><Trash2 size={16} aria-hidden /></IconAction>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {list.data && <Pager page={page} total={list.data.total} onPage={(next) => setPage(next ? String(next) : '')} />}
              </div>
            )}
      {deleting && (
        <ConfirmDialog
          title={t('admin.data.deleteTitle')}
          description={t('admin.data.deleteText', { name: deleting.name, owner: ownerLabel(directory, deleting.ownerId, deleting.ownerLoginId, t) })}
          confirmLabel={t('app.delete')}
          busyLabel={t('app.deleting')}
          onConfirm={async () => {
            await admin.deleteDataset(deleting.id);
            list.setData((current) => current && { items: current.items.filter((item) => item.id !== deleting.id), total: Math.max(0, current.total - 1) });
            setDeleting(null);
            onToast(t('admin.data.deleted', { name: deleting.name }));
          }}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}

function ProjectsView({ directory }: { directory: Directory }) {
  const { lang, t } = useLanguage();
  const [text, setText, q] = useSearchParam();
  const [pageParam, setPage] = useParam('page');
  const page = Math.max(0, Number(pageParam) || 0);
  const list = useLoad(() => admin.listProjects({ q, page, size: PAGE_SIZE }), [q, page]);
  const items = list.data?.items ?? [];
  return (
    <>
      <div className="toolbar">
        <label className="toolbar__search">
          <Search size={16} aria-hidden />
          <input type="search" value={text} onChange={(event) => setText(event.target.value)} placeholder={t('admin.data.searchProjects')} aria-label={t('admin.data.searchProjectsLabel')} autoComplete="off" spellCheck={false} />
        </label>
        <span className="toolbar__spacer" />
        {list.data && <span className="xc-hint tabular" aria-live="polite">{t('admin.data.projectCount', { count: list.data.total })}</span>}
      </div>
      {list.loading && !list.data ? <Skeleton lines={4} label={t('admin.data.loadingProjects')} />
        : list.error ? <ListError text={t('admin.data.projectsFailed', { error: list.error })} onRetry={list.reload} />
          : !items.length ? <EmptyState title={q ? t('admin.data.noMatch') : t('admin.data.noProjects')} />
            : (
              <div className="xc-stale" aria-busy={list.loading}>
                <div className="xc-table-wrap">
                  <table className="xc-table xc-table--cards admin-table">
                    <thead>
                      <tr>
                        <th scope="col">{t('app.name')}</th>
                        <th scope="col">{t('admin.data.owner')}</th>
                        <th scope="col" className="num">{t('admin.data.members')}</th>
                        <th scope="col" className="num">{t('admin.data.datasets')}</th>
                        <th scope="col">{t('app.updated')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((project) => (
                        <tr key={project.id}>
                          <td className="cell-main">
                            <span className="xc-cell-main">
                              <strong>{project.name || t('app.noName')}</strong>
                              {project.description && <small className="clamp-1">{project.description}</small>}
                            </span>
                          </td>
                          <td data-label={t('admin.data.owner')}>{ownerLabel(directory, project.ownerId, project.ownerLoginId, t)}</td>
                          <td className="num" data-label={t('admin.data.members')}>{project.memberCount ?? <NoValue label={t('admin.unknown')} />}</td>
                          <td className="num" data-label={t('admin.data.datasets')}>{project.datasetCount ?? <NoValue label={t('admin.unknown')} />}</td>
                          <td className="date" data-label={t('app.updated')}>{formatDate(project.updatedAt ?? project.createdAt, lang)}</td>
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

const JOB_STATUSES = ['', 'QUEUED,RUNNING', 'FAILED,CANCELLED', 'SUCCEEDED'] as const;
const JOB_STATUS_LABEL: Record<string, TKey> = { '': 'jobs.allStatuses', 'QUEUED,RUNNING': 'jobs.active', 'FAILED,CANCELLED': 'jobs.failedOrCancelled', SUCCEEDED: 'jobs.succeeded' };
const SERVICE_LABEL: Record<string, TKey> = { GENERATION: 'admin.data.services.GENERATION', FUSION: 'admin.data.services.FUSION', AI_WATER: 'admin.data.services.AI_WATER' };

function JobsView({ directory, onToast }: { directory: Directory; onToast: (text: string) => void }) {
  const { lang, t } = useLanguage();
  const [status, setStatus] = useParam('status');
  const [owner, setOwner] = useParam('owner');
  const list = useLoad(() => admin.listJobs({ status, ownerId: owner }), [status, owner]);
  const items = list.data?.items ?? [];
  const [open, setOpen] = useState('');
  const [cancelling, setCancelling] = useState<AdminJob | null>(null);
  const keyOf = (job: AdminJob) => `${job.service}:${job.id}`;
  const unavailable = useMemo(() => (list.data?.unavailable ?? []).map((service) => t(SERVICE_LABEL[service])).join(t('jobs.serviceSeparator')), [list.data, t]);
  return (
    <>
      <div className="toolbar">
        <label>
          <span className="sr-only">{t('app.status')}</span>
          <select className="xc-select" aria-label={t('app.status')} value={status} onChange={(event) => setStatus(event.target.value)}>
            {JOB_STATUSES.map((value) => <option key={value || 'all'} value={value}>{t(JOB_STATUS_LABEL[value])}</option>)}
          </select>
        </label>
        <OwnerFilter directory={directory} value={owner} onChange={(next) => setOwner(next)} />
        <span className="toolbar__spacer" />
        <Button variant="line" size="sm" onClick={list.reload}>{t('admin.refresh')}</Button>
      </div>
      {unavailable && <div className="inline-error"><Alert tone="warning">{t('admin.data.jobsPartial', { services: unavailable })}</Alert></div>}
      {list.loading && !list.data ? <Skeleton lines={4} label={t('jobs.loading')} />
        : list.error ? <ListError text={t('app.jobListFailed', { error: list.error })} onRetry={list.reload} />
          : !items.length ? <EmptyState title={status || owner ? t('jobs.noMatch') : t('admin.data.noJobs')} />
            : (
              <div className="xc-stale" aria-busy={list.loading}>
                <div className="xc-table-wrap">
                  <table className="xc-table xc-table--cards admin-table jobs-table">
                    <thead>
                      <tr>
                        <th scope="col"><span className="sr-only">{t('jobs.expand')}</span></th>
                        <th scope="col">{t('jobs.job')}</th>
                        <th scope="col">{t('app.kind')}</th>
                        <th scope="col">{t('admin.data.owner')}</th>
                        <th scope="col">{t('app.status')}</th>
                        <th scope="col" className="hide-sm">{t('jobs.duration')}</th>
                        <th scope="col">{t('app.requested')}</th>
                        <th scope="col"><span className="sr-only">{t('app.actions')}</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((job) => {
                        const key = keyOf(job);
                        const expanded = open === key;
                        return (
                          <Fragment key={key}>
                            <tr>
                              <td>
                                <button type="button" className="xc-icon-btn" aria-expanded={expanded} aria-label={t(expanded ? 'jobs.collapseNamed' : 'jobs.expandNamed', { name: job.name })} onClick={() => setOpen(expanded ? '' : key)}>
                                  {expanded ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
                                </button>
                              </td>
                              <td className="cell-main"><span className="xc-cell-main"><strong>{job.name || t('app.noName')}</strong>{job.status === 'FAILED' && <small className="job-error">{failureText(job, lang)}</small>}</span></td>
                              <td className="nowrap" data-label={t('app.kind')}>{jobTypeLabel(job.type, lang)}</td>
                              <td data-label={t('admin.data.owner')}>{ownerLabel(directory, job.ownerId, null, t)}</td>
                              <td><JobStatusBadge job={job} /></td>
                              <td className="hide-sm tabular nowrap">{elapsed(job, Date.now(), lang)}</td>
                              <td className="date" data-label={t('app.requested')}>{formatDateTime(job.createdAt, lang)}</td>
                              <td className="cell-actions">
                                <div className="row-actions">
                                  {isActive(job) && <Button size="sm" variant="quiet" onClick={() => setCancelling(job)} aria-label={t('jobs.cancelNamed', { name: job.name })}><Square size={14} aria-hidden />{t('jobs.cancel')}</Button>}
                                </div>
                              </td>
                            </tr>
                            {expanded && (
                              <tr className="job-detail-row">
                                <td colSpan={8} className="cell-full">
                                  <div className="job-detail">
                                    <JobSteps job={job} />
                                    {job.status === 'FAILED' && <Alert tone="danger">{t('jobs.failReason', { reason: failureText(job, lang) || t('jobs.unknown') })}</Alert>}
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
              </div>
            )}
      {cancelling && (
        <ConfirmDialog
          title={t('jobs.cancelTitle')}
          description={t('admin.data.cancelText', { name: cancelling.name || t('app.noName'), owner: ownerLabel(directory, cancelling.ownerId, null, t) })}
          confirmLabel={t('jobs.cancelConfirm')}
          busyLabel={t('jobs.cancelBusy')}
          cancelLabel={t('jobs.keepRunning')}
          onConfirm={async () => {
            await admin.cancelJob(cancelling);
            setCancelling(null);
            onToast(t('jobs.cancelled'));
            list.refresh();
          }}
          onClose={() => setCancelling(null)}
        />
      )}
    </>
  );
}

export function ListError({ text, onRetry }: { text: string; onRetry: () => void }) {
  const { t } = useLanguage();
  return <div className="inline-error"><Alert tone="danger">{text}</Alert><Button variant="line" size="sm" className="inline-error__retry" onClick={onRetry}>{t('common.retry')}</Button></div>;
}
