import { ArrowRight, ExternalLink, Plus } from 'lucide-react';
import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, ButtonLink } from '../../components/ui';
import { Badge, Skeleton } from '../../components/ui/kit';
import { aiViewerHref, appApi, formatDateTime, isOwned, jobs as jobService, periodLabel, unavailableJobsNotice, viewerHref, ZarrDataset } from '../api';
import { useLoad } from '../useLoad';
import { isActive, jobTypeLabel, JobStatusBadge } from '../jobs';
import { DatasetStatus } from './DataLibraryPage';
import { useLanguage, useT } from '../../i18n';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
// The management screens' text (UR-53 stage 2) loads with these pages, not with the main bundle.
import '../../i18n/app';

const RECENT = 5;
const ACTIVE_JOBS = `/app/jobs?status=${encodeURIComponent('QUEUED,RUNNING')}`;

/** Kind of a dataset as a tag: data hues for results, plain for originals. */
export function KindTag({ dataset }: { dataset: ZarrDataset }) {
  const t = useT();
  if (dataset.kind === 'FUSION') return <Badge tone="water">{t('kinds.fusion')}</Badge>;
  if (dataset.kind === 'AI_RESULT') return <Badge tone="result">{t('kinds.ai')}</Badge>;
  return <Badge>{t('kinds.original')}</Badge>;
}

const viewerLinkOf = (item: ZarrDataset) =>
  item.kind === 'AI_RESULT' && item.sourceDatacubeId ? aiViewerHref(item.sourceDatacubeId, item.id) : viewerHref(item.id);

function Section({ id, title, more, children }: { id: string; title: string; more: ReactNode; children: ReactNode }) {
  return (
    <section className="dash-section" aria-labelledby={id}>
      <div className="dash-section__head">
        <h2 id={id} className="dash-section__title">{title}</h2>
        {more}
      </div>
      {children}
    </section>
  );
}

/** S2: where things stand (one line), what to do next (three rows), and the latest data and jobs. */
export default function DashboardPage() {
  const { lang, t } = useLanguage();
  useDocumentTitle(t('titles.dashboard'));
  const datasets = useLoad(() => appApi.listDatasets());
  const jobs = useLoad(() => jobService.listWithStatus());
  const items = datasets.data ?? [];
  const jobItems = jobs.data?.items ?? [];
  const partialNotice = unavailableJobsNotice(jobs.data?.unavailable ?? [], lang);
  const owned = items.filter(isOwned).length;
  const running = jobItems.filter(isActive).length;
  const empty = !datasets.loading && !datasets.error && items.length === 0;
  const latest = items[0];
  const count = (loading: boolean, failed: boolean, value: number) => (loading || failed ? '—' : value);

  return (
    <div className="dash">
      <header className="dash-head">
        <h1 className="dash-head__title">{t('titles.dashboard')}</h1>
        {empty ? (
          <p className="dash-summary">{t('dashboard.empty')}</p>
        ) : (
          <p className="dash-summary" aria-label={t('dashboard.summary')} aria-busy={datasets.loading || jobs.loading}>
            <Link to="/app/data?scope=owned">{t('app.mine')} <strong>{count(datasets.loading, !!datasets.error, owned)}</strong></Link>
            <Link to="/app/data?scope=shared">{t('app.shared')} <strong>{count(datasets.loading, !!datasets.error, items.length - owned)}</strong></Link>
            <Link to={ACTIVE_JOBS} className={running ? 'is-running' : undefined}>{t('dashboard.running')} <strong>{count(jobs.loading, !!jobs.error, running)}</strong></Link>
          </p>
        )}
      </header>

      <nav className="dash-actions" aria-labelledby="dash-actions-title">
        <h2 id="dash-actions-title" className="dash-section__title dash-actions__title">{t('dashboard.shortcuts')}</h2>
        <ul>
          <li>
            <Link to="/app/data/new">
              <span className="dash-actions__label"><Plus size={15} aria-hidden />{t('shell.addData')}</span>
              <span className="dash-actions__desc">{t('dashboard.addDataDesc')}</span>
              <ArrowRight size={15} aria-hidden className="dash-actions__go" />
            </Link>
          </li>
          <li>
            <Link to="/app/analysis/fusion">
              <span className="dash-actions__label">{t('titles.fusion')}</span>
              <span className="dash-actions__desc">{t('dashboard.fusionDesc')}</span>
              <ArrowRight size={15} aria-hidden className="dash-actions__go" />
            </Link>
          </li>
          <li>
            <a href={latest ? viewerLinkOf(latest) : viewerHref()} target="_blank" rel="noopener noreferrer">
              <span className="dash-actions__label">{t('dashboard.openViewer')}</span>
              <span className="dash-actions__desc">{latest ? t('dashboard.openLatest', { name: latest.name }) : t('dashboard.openMap')}</span>
              <ExternalLink size={15} aria-hidden className="dash-actions__go" />
              <span className="sr-only">{t('shell.newTab')}</span>
            </a>
          </li>
        </ul>
      </nav>

      <div className="dash-ledgers">
        <Section id="dash-recent-data" title={t('dashboard.recentData')} more={<Link className="dash-more" to="/app/data">{t('app.viewAll')}</Link>}>
          {datasets.loading ? (
            <Skeleton lines={4} label={t('dashboard.loadingData')} />
          ) : datasets.error ? (
            <div className="dash-note">
              <Alert tone="danger">{t('app.dataListFailed', { error: datasets.error })}</Alert>
              <Button variant="line" size="sm" onClick={datasets.reload}>{t('common.retry')}</Button>
            </div>
          ) : empty ? (
            <div className="dash-note">
              <p>{t('dashboard.emptyNote')}</p>
              <ButtonLink to="/app/data/new" size="sm"><Plus size={14} aria-hidden />{t('shell.addData')}</ButtonLink>
            </div>
          ) : (
            <table className="xc-table xc-table--cards dash-table">
              <thead><tr><th scope="col">{t('app.name')}</th><th scope="col">{t('app.kind')}</th><th scope="col">{t('app.period')}</th><th scope="col"><span className="sr-only">{t('dashboard.open')}</span></th></tr></thead>
              <tbody>
                {items.slice(0, RECENT).map((item) => (
                  <tr key={item.id}>
                    <td className="cell-main">
                      <span className="dash-name">
                        <Link to={`/app/data/${encodeURIComponent(item.id)}`}>{item.name}</Link>
                        {!isOwned(item) && <Badge tone="water">{t('app.shared')}</Badge>}
                        <DatasetStatus dataset={item} quiet />
                      </span>
                    </td>
                    <td><KindTag dataset={item} /></td>
                    <td className="date">{periodLabel(item, lang)}</td>
                    <td className="cell-actions num">
                      <a className="xc-btn xc-btn--quiet xc-btn--sm" href={viewerLinkOf(item)} target="_blank" rel="noopener noreferrer" aria-label={t('app.openInViewerNamed', { name: item.name })}>
                        Viewer<ExternalLink size={13} aria-hidden />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section id="dash-recent-jobs" title={t('dashboard.recentJobs')} more={<Link className="dash-more" to="/app/jobs">{t('app.viewAll')}</Link>}>
          {jobs.loading ? (
            <Skeleton lines={3} label={t('dashboard.loadingJobs')} />
          ) : jobs.error ? (
            <div className="dash-note"><Alert tone="danger">{t('app.jobListFailed', { error: jobs.error })}</Alert></div>
          ) : !jobItems.length && !partialNotice ? (
            <div className="dash-note">
              <p>{t('dashboard.noJobs')}</p>
              <ButtonLink to="/app/data/new" size="sm" variant="line">{t('shell.addData')}</ButtonLink>
            </div>
          ) : (
            <>
            {partialNotice && <div className="dash-note"><Alert tone="warning">{partialNotice}</Alert><Button variant="line" size="sm" onClick={jobs.reload}>{t('common.retry')}</Button></div>}
            {jobItems.length > 0 && <table className="xc-table xc-table--cards dash-table">
              <thead><tr><th scope="col">{t('dashboard.job')}</th><th scope="col">{t('app.kind')}</th><th scope="col">{t('app.status')}</th><th scope="col" className="num">{t('dashboard.requested')}</th></tr></thead>
              <tbody>
                {jobItems.slice(0, RECENT).map((job) => (
                  <tr key={`${job.type}:${job.id}`}>
                    <td className="cell-main"><strong className="dash-job-name">{job.name || t('app.noName')}</strong></td>
                    <td className="nowrap dash-muted">{jobTypeLabel(job.type, lang)}</td>
                    <td><JobStatusBadge job={job} /></td>
                    <td className="date num dash-muted">{formatDateTime(job.createdAt, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>}
            </>
          )}
        </Section>
      </div>
    </div>
  );
}
