import { ArrowRight, Database, ExternalLink, Map, Plus, Sigma, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { Alert, Button, ButtonLink } from '../../components/ui';
import { Badge, Card, EmptyState, PageHeader, Skeleton } from '../../components/ui/kit';
import { appApi, isOwned, periodLabel, viewerHref } from '../api';
import { useLoad } from '../useLoad';
import { DatasetStatus } from './DataLibraryPage';

/** S2: summary and next actions after sign-in. */
export default function DashboardPage() {
  const { user } = useAuth();
  const datasets = useLoad(() => appApi.listDatasets());
  const projects = useLoad(() => appApi.listProjects());
  const items = datasets.data ?? [];
  const owned = items.filter(isOwned).length;
  const empty = !datasets.loading && !datasets.error && items.length === 0;
  const recent = items.slice(0, 5);
  return (
    <div className="page-stack">
      <PageHeader
        title={`안녕하세요, ${user?.name ?? '사용자'}님`}
        description={empty ? '첫 데이터큐브를 추가해 보세요.' : '내 데이터와 작업 상황을 한눈에 확인합니다.'}
      />

      <section aria-label="빠른 시작" className="dash-quick">
        <Link className="dash-quick__card" to="/app/data/new">
          <span className="dash-quick__icon"><Plus size={20} aria-hidden /></span>
          <strong>데이터 추가</strong>
          <small>GeoTIFF · Shapefile · GEE로 Zarr를 만들거나 등록합니다.</small>
        </Link>
        <a className="dash-quick__card" href={viewerHref(items[0]?.id)} target="_blank" rel="noopener noreferrer">
          <span className="dash-quick__icon"><Map size={20} aria-hidden /></span>
          <strong>Viewer 열기 <ExternalLink size={14} aria-hidden /></strong>
          <small>{items[0] ? `최근 데이터 “${items[0].name}”을 엽니다.` : '시계열 지도를 새 탭에서 엽니다.'}</small>
          <span className="sr-only">(새 탭)</span>
        </a>
        <div className="dash-quick__card is-disabled" aria-disabled="true">
          <Badge>준비 중</Badge>
          <span className="dash-quick__icon"><Sigma size={20} aria-hidden /></span>
          <strong>수식 융합</strong>
          <small>여러 Zarr를 수식으로 합칩니다. (M6)</small>
        </div>
        <div className="dash-quick__card is-disabled" aria-disabled="true">
          <Badge>준비 중</Badge>
          <span className="dash-quick__icon"><Sparkles size={20} aria-hidden /></span>
          <strong>AI 수체 추출</strong>
          <small>AI로 수체를 추출하고 비교합니다. (M7)</small>
        </div>
      </section>

      {!empty && (
        <dl className="dash-kpis" aria-label="요약">
          <div className="kpi"><dt>내 데이터큐브</dt><dd>{datasets.loading ? '—' : owned}</dd></div>
          <div className="kpi"><dt>공유받은 데이터큐브</dt><dd>{datasets.loading ? '—' : items.length - owned}</dd></div>
          <div className="kpi"><dt>프로젝트</dt><dd>{projects.loading ? '—' : projects.data?.length ?? '—'}</dd></div>
          <div className="kpi"><dt>처리 중 작업</dt><dd>—<small>작업 목록 API 준비 중</small></dd></div>
        </dl>
      )}

      <div className="dash-grid">
        <Card title="최근 데이터" actions={<ButtonLink to="/app/data" variant="ghost" size="sm">전체 보기 <ArrowRight size={14} aria-hidden /></ButtonLink>}>
          {datasets.loading ? (
            <Skeleton lines={4} label="최근 데이터를 불러오는 중" />
          ) : datasets.error ? (
            <div className="inline-error">
              <Alert tone="danger">데이터 목록을 불러오지 못했습니다. {datasets.error}</Alert>
              <Button variant="secondary" size="sm" onClick={datasets.reload} style={{ marginTop: 12 }}>다시 시도</Button>
            </div>
          ) : empty ? (
            <EmptyState icon={<Database size={22} />} title="아직 데이터가 없습니다" text="위성 영상이나 Shapefile, GEE 자료로 첫 데이터큐브를 만들어 보세요." action={<ButtonLink to="/app/data/new"><Plus size={16} aria-hidden />데이터 추가</ButtonLink>} />
          ) : (
            <div className="xc-table-wrap">
              <table className="xc-table">
                <thead><tr><th scope="col">이름</th><th scope="col" className="hide-sm">기간</th><th scope="col" className="num hide-sm">변수</th><th scope="col">상태</th><th scope="col"><span className="sr-only">동작</span></th></tr></thead>
                <tbody>
                  {recent.map((item) => (
                    <tr key={item.id}>
                      <td><span className="xc-cell-main"><Link to={`/app/data/${encodeURIComponent(item.id)}`}>{item.name}</Link><small>{item.accessType === 'SHARED' ? '공유받음' : '내 데이터'}</small></span></td>
                      <td className="hide-sm tabular">{periodLabel(item)}</td>
                      <td className="num hide-sm">{item.variables.length}</td>
                      <td><DatasetStatus dataset={item} /></td>
                      <td className="num"><a className="xc-btn xc-btn--ghost xc-btn--sm" href={viewerHref(item.id)} target="_blank" rel="noopener noreferrer" aria-label={`${item.name} Viewer에서 열기 (새 탭)`}>Viewer</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="최근 작업">
          <EmptyState title="작업 목록을 준비하고 있습니다" text="생성·AI 작업 목록 API가 연결되면 이곳에 진행 상황이 표시됩니다." />
        </Card>
      </div>
    </div>
  );
}
