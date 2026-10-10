import { ArrowRight, ExternalLink, Plus } from 'lucide-react';
import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, ButtonLink } from '../../components/ui';
import { Badge, Skeleton } from '../../components/ui/kit';
import { aiViewerHref, appApi, formatDateTime, isOwned, jobs as jobService, periodLabel, unavailableJobsNotice, viewerHref, ZarrDataset } from '../api';
import { useLoad } from '../useLoad';
import { isActive, JOB_TYPE_LABEL, JobStatusBadge } from '../jobs';
import { DatasetStatus } from './DataLibraryPage';

const RECENT = 5;
const ACTIVE_JOBS = `/app/jobs?status=${encodeURIComponent('QUEUED,RUNNING')}`;

/** Kind of a dataset as a tag: data hues for results, plain for originals. */
export function KindTag({ dataset }: { dataset: ZarrDataset }) {
  if (dataset.kind === 'FUSION') return <Badge tone="water">융합 결과</Badge>;
  if (dataset.kind === 'AI_RESULT') return <Badge tone="result">AI 결과</Badge>;
  return <Badge>원본</Badge>;
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
  const datasets = useLoad(() => appApi.listDatasets());
  const jobs = useLoad(() => jobService.listWithStatus());
  const items = datasets.data ?? [];
  const jobItems = jobs.data?.items ?? [];
  const partialNotice = unavailableJobsNotice(jobs.data?.unavailable ?? []);
  const owned = items.filter(isOwned).length;
  const running = jobItems.filter(isActive).length;
  const empty = !datasets.loading && !datasets.error && items.length === 0;
  const latest = items[0];
  const count = (loading: boolean, failed: boolean, value: number) => (loading || failed ? '—' : value);

  return (
    <div className="dash">
      <header className="dash-head">
        <h1 className="dash-head__title">대시보드</h1>
        {empty ? (
          <p className="dash-summary">아직 데이터가 없습니다. 첫 데이터큐브를 추가해 보세요.</p>
        ) : (
          <p className="dash-summary" aria-label="요약" aria-busy={datasets.loading || jobs.loading}>
            <Link to="/app/data?scope=owned">내 데이터 <strong>{count(datasets.loading, !!datasets.error, owned)}</strong></Link>
            <Link to="/app/data?scope=shared">공유받음 <strong>{count(datasets.loading, !!datasets.error, items.length - owned)}</strong></Link>
            <Link to={ACTIVE_JOBS} className={running ? 'is-running' : undefined}>처리 중 <strong>{count(jobs.loading, !!jobs.error, running)}</strong></Link>
          </p>
        )}
      </header>

      <nav className="dash-actions" aria-labelledby="dash-actions-title">
        <h2 id="dash-actions-title" className="dash-section__title dash-actions__title">바로 가기</h2>
        <ul>
          <li>
            <Link to="/app/data/new">
              <span className="dash-actions__label"><Plus size={15} aria-hidden />데이터 추가</span>
              <span className="dash-actions__desc">GeoTIFF · Shapefile · GEE로 데이터큐브를 만듭니다</span>
              <ArrowRight size={15} aria-hidden className="dash-actions__go" />
            </Link>
          </li>
          <li>
            <Link to="/app/analysis/fusion">
              <span className="dash-actions__label">수식 융합</span>
              <span className="dash-actions__desc">여러 데이터를 수식 하나로 합칩니다</span>
              <ArrowRight size={15} aria-hidden className="dash-actions__go" />
            </Link>
          </li>
          <li>
            <a href={latest ? viewerLinkOf(latest) : viewerHref()} target="_blank" rel="noopener noreferrer">
              <span className="dash-actions__label">Viewer 열기</span>
              <span className="dash-actions__desc">{latest ? `최근 데이터 “${latest.name}”을 지도에서 봅니다` : '시계열 지도를 엽니다'}</span>
              <ExternalLink size={15} aria-hidden className="dash-actions__go" />
              <span className="sr-only">(새 탭)</span>
            </a>
          </li>
        </ul>
      </nav>

      <div className="dash-ledgers">
        <Section id="dash-recent-data" title="최근 데이터" more={<Link className="dash-more" to="/app/data">전체 보기</Link>}>
          {datasets.loading ? (
            <Skeleton lines={4} label="최근 데이터를 불러오는 중" />
          ) : datasets.error ? (
            <div className="dash-note">
              <Alert tone="danger">데이터 목록을 불러오지 못했습니다. {datasets.error}</Alert>
              <Button variant="line" size="sm" onClick={datasets.reload}>다시 시도</Button>
            </div>
          ) : empty ? (
            <div className="dash-note">
              <p>위성 영상, Shapefile, GEE 자료로 첫 데이터큐브를 만들면 이곳에 쌓입니다.</p>
              <ButtonLink to="/app/data/new" size="sm"><Plus size={14} aria-hidden />데이터 추가</ButtonLink>
            </div>
          ) : (
            <table className="xc-table xc-table--cards dash-table">
              <thead><tr><th scope="col">이름</th><th scope="col">종류</th><th scope="col">기간</th><th scope="col"><span className="sr-only">열기</span></th></tr></thead>
              <tbody>
                {items.slice(0, RECENT).map((item) => (
                  <tr key={item.id}>
                    <td className="cell-main">
                      <span className="dash-name">
                        <Link to={`/app/data/${encodeURIComponent(item.id)}`}>{item.name}</Link>
                        {!isOwned(item) && <Badge tone="water">공유받음</Badge>}
                        <DatasetStatus dataset={item} quiet />
                      </span>
                    </td>
                    <td><KindTag dataset={item} /></td>
                    <td className="date">{periodLabel(item)}</td>
                    <td className="cell-actions num">
                      <a className="xc-btn xc-btn--quiet xc-btn--sm" href={viewerLinkOf(item)} target="_blank" rel="noopener noreferrer" aria-label={`${item.name} Viewer에서 열기 (새 탭)`}>
                        Viewer<ExternalLink size={13} aria-hidden />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section id="dash-recent-jobs" title="최근 작업" more={<Link className="dash-more" to="/app/jobs">전체 보기</Link>}>
          {jobs.loading ? (
            <Skeleton lines={3} label="최근 작업을 불러오는 중" />
          ) : jobs.error ? (
            <div className="dash-note"><Alert tone="danger">작업 목록을 불러오지 못했습니다. {jobs.error}</Alert></div>
          ) : !jobItems.length && !partialNotice ? (
            <div className="dash-note">
              <p>아직 작업이 없습니다. 데이터 추가나 수식 융합을 실행하면 진행 상황이 이곳에 남습니다.</p>
              <ButtonLink to="/app/data/new" size="sm" variant="line">데이터 추가</ButtonLink>
            </div>
          ) : (
            <>
            {partialNotice && <div className="dash-note"><Alert tone="warning">{partialNotice}</Alert><Button variant="line" size="sm" onClick={jobs.reload}>다시 시도</Button></div>}
            {jobItems.length > 0 && <table className="xc-table xc-table--cards dash-table">
              <thead><tr><th scope="col">작업</th><th scope="col">종류</th><th scope="col">상태</th><th scope="col" className="num">요청</th></tr></thead>
              <tbody>
                {jobItems.slice(0, RECENT).map((job) => (
                  <tr key={`${job.type}:${job.id}`}>
                    <td className="cell-main"><strong className="dash-job-name">{job.name || '이름 없음'}</strong></td>
                    <td className="nowrap dash-muted">{JOB_TYPE_LABEL[job.type] ?? job.type}</td>
                    <td><JobStatusBadge job={job} /></td>
                    <td className="date num dash-muted">{formatDateTime(job.createdAt)}</td>
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
