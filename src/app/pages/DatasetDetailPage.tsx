import { ArrowLeft, ExternalLink, FolderPlus, Lock, SearchX, Trash2 } from 'lucide-react';
import { ReactNode, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, ButtonAnchor, ButtonLink } from '../../components/ui';
import { Badge, Card, EmptyState, PageHeader, Skeleton, Tabs, useToast } from '../../components/ui/kit';
import { ai, aiViewerHref, appApi, formatDate, fusion, generation, isOwned, periodLabel, viewerHref, ZarrDataset } from '../api';
import { asFusionRequest } from '../fusion';
import { AI_MODEL_LABEL, elapsed, FusionRequestSummary, JOB_TYPE_LABEL, JobInputSummary, JobStatusBadge, JobSteps } from '../jobs';
import type { AiWaterJob } from '../../api/aiApi';
import { useLoad } from '../useLoad';
import { DatasetStatus, DeleteDatasetDialog, LinkProjectDialog } from './DataLibraryPage';

type Tab = 'overview' | 'variables' | 'history' | 'ai' | 'projects';

/** Small extent sketch: the dataset bbox inside a padded lon/lat frame. */
export function BBoxMap({ bbox }: { bbox: [number, number, number, number] }) {
  const [west, south, east, north] = bbox;
  const padX = Math.max((east - west) * 0.6, 0.05);
  const padY = Math.max((north - south) * 0.6, 0.05);
  const frame = { w: west - padX, e: east + padX, s: south - padY, n: north + padY };
  const width = 480;
  const height = 240;
  const x = (lon: number) => ((lon - frame.w) / (frame.e - frame.w)) * width;
  const y = (lat: number) => ((frame.n - lat) / (frame.n - frame.s)) * height;
  const ticks = [0.25, 0.5, 0.75];
  return (
    <svg className="bbox-map" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`데이터 범위: 경도 ${west.toFixed(4)}~${east.toFixed(4)}, 위도 ${south.toFixed(4)}~${north.toFixed(4)}`}>
      <g className="grid">
        {ticks.map((ratio) => <line key={`v${ratio}`} x1={width * ratio} y1={0} x2={width * ratio} y2={height} />)}
        {ticks.map((ratio) => <line key={`h${ratio}`} x1={0} y1={height * ratio} x2={width} y2={height * ratio} />)}
      </g>
      <rect className="area" x={x(west)} y={y(north)} width={Math.max(2, x(east) - x(west))} height={Math.max(2, y(south) - y(north))} rx={3} />
      <text x={8} y={height - 8}>{frame.w.toFixed(2)}°E, {frame.s.toFixed(2)}°N</text>
      <text x={width - 8} y={16} textAnchor="end">{frame.e.toFixed(2)}°E, {frame.n.toFixed(2)}°N</text>
    </svg>
  );
}

/** S5: one dataset's metadata, variables, AI results and project links. */
export default function DatasetDetailPage() {
  const { datasetId = '' } = useParams();
  const navigate = useNavigate();
  const dataset = useLoad(() => appApi.getDataset(datasetId), [datasetId]);
  const [tab, setTab] = useState<Tab>('overview');
  const [deleting, setDeleting] = useState(false);
  const [linking, setLinking] = useState(false);
  const toast = useToast();
  const back = <Link className="page-back" to="/app/data"><ArrowLeft size={16} aria-hidden />데이터</Link>;

  if (dataset.loading) return <div className="page-stack">{back}<Card><Skeleton lines={6} label="데이터 정보를 불러오는 중" /></Card></div>;
  if (dataset.error || !dataset.data) {
    const forbidden = dataset.status === 403;
    const missing = dataset.status === 404;
    return (
      <div className="page-stack">
        {back}
        <Card>
          <EmptyState
            icon={forbidden ? <Lock size={22} /> : <SearchX size={22} />}
            title={forbidden ? '이 데이터를 볼 권한이 없습니다' : missing ? '데이터를 찾을 수 없습니다' : '데이터 정보를 불러오지 못했습니다'}
            text={forbidden ? '소유자에게 공유를 요청하세요.' : missing ? '삭제되었거나 주소가 잘못되었습니다.' : dataset.error}
            action={forbidden || missing ? <ButtonLink to="/app/data" variant="secondary">데이터 목록으로</ButtonLink> : <Button variant="secondary" onClick={dataset.reload}>다시 시도</Button>}
          />
        </Card>
      </div>
    );
  }

  const item: ZarrDataset = dataset.data;
  const owned = isOwned(item);
  const isAiResult = item.kind === 'AI_RESULT';
  const viewerLink = isAiResult && item.sourceDatacubeId ? aiViewerHref(item.sourceDatacubeId, item.id) : viewerHref(item.id);
  return (
    <div className="page-stack">
      <PageHeader
        back={back}
        title={item.name}
        description={<span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>{owned ? <Badge tone="primary">내 데이터</Badge> : <Badge tone="water">공유받음</Badge>}{item.kind === 'FUSION' ? <Badge tone="water">융합 결과</Badge> : item.kind === 'AI_RESULT' ? <Badge tone="result">AI 결과</Badge> : <Badge>원본</Badge>}<DatasetStatus dataset={item} /><span className="xc-hint">{item.xcubeDatasetId}</span>{isAiResult && item.sourceDatacubeId && <span>원본 데이터: <Link to={`/app/data/${encodeURIComponent(item.sourceDatacubeId)}`}>#{item.sourceDatacubeId} 보기</Link></span>}</span>}
        actions={
          <>
            <ButtonAnchor href={viewerLink} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} aria-hidden />{isAiResult ? 'Viewer에서 원본과 비교' : 'Viewer에서 열기'}<span className="sr-only">(새 탭)</span></ButtonAnchor>
            <Button variant="secondary" onClick={() => setLinking(true)}><FolderPlus size={16} aria-hidden />프로젝트에 연결</Button>
            {owned && <Button variant="ghost" onClick={() => setDeleting(true)} aria-label="데이터 삭제"><Trash2 size={16} aria-hidden />삭제</Button>}
          </>
        }
      />
      <Card>
        <div style={{ padding: '0 20px' }}>
          <Tabs label="데이터 상세" value={tab} onChange={setTab} items={[
            { id: 'overview', label: '개요' },
            { id: 'variables', label: '변수·Band', count: item.variables.length },
            { id: 'history', label: '생성 이력' },
            ...(isAiResult ? [] : [{ id: 'ai' as Tab, label: 'AI 결과' }]),
            { id: 'projects', label: '프로젝트·공유' },
          ]} />
        </div>
        <div role="tabpanel">
          {tab === 'overview' && (
            <>
              {item.bbox && <BBoxMap bbox={item.bbox} />}
              <dl className="meta-list">
                <dt>기간</dt><dd className="tabular">{periodLabel(item)}</dd>
                <dt>시점 수</dt><dd className="tabular">{item.times.length}</dd>
                <dt>좌표계</dt><dd>EPSG:4326</dd>
                <dt>범위</dt><dd className="tabular">{item.bbox ? `경도 ${item.bbox[0].toFixed(4)} ~ ${item.bbox[2].toFixed(4)}, 위도 ${item.bbox[1].toFixed(4)} ~ ${item.bbox[3].toFixed(4)}` : '—'}</dd>
                <dt>기본 변수</dt><dd>{item.defaultVariable || '—'}</dd>
                <dt>RGB 합성</dt><dd>{item.rgbAvailable ? '가능' : '—'}</dd>
                <dt>데이터 ID</dt><dd>{item.xcubeDatasetId || '—'}</dd>
              </dl>
            </>
          )}
          {tab === 'variables' && (item.variables.length ? (
            <div className="xc-table-wrap">
              <table className="xc-table">
                <thead><tr><th scope="col">이름</th><th scope="col">제목</th><th scope="col">단위</th><th scope="col">기본 표시</th></tr></thead>
                <tbody>
                  {item.variables.map((name) => (
                    <tr key={name}>
                      <td><strong>{name}</strong></td>
                      <td>{item.variableMetadata?.[name]?.title || '—'}</td>
                      <td>{item.variableMetadata?.[name]?.units || '—'}</td>
                      <td>{name === item.defaultVariable ? <Badge tone="primary">기본</Badge> : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState title="변수 정보가 없습니다" text="시각화 서버 동기화가 끝나면 표시됩니다." />)}
          {tab === 'history' && (item.kind === 'FUSION' ? <FusionHistory dataset={item} /> : isAiResult ? <AiHistory dataset={item} /> : <GenerationHistory jobId={item.generationJobId} />)}
          {tab === 'ai' && <AiResults datasetId={item.id} />}
          {tab === 'projects' && (
            <div style={{ padding: 20, display: 'grid', gap: 12 }}>
              <p>{item.projectName ? <>기본 프로젝트: <strong>{item.projectName}</strong></> : '연결된 기본 프로젝트가 없습니다. (프로젝트 없음)'}</p>
              <p className="xc-hint">공유는 프로젝트 단위로 합니다. 프로젝트의 멤버 탭에서 사용자를 추가하세요.</p>
              <div><Button variant="secondary" onClick={() => setLinking(true)}><FolderPlus size={16} aria-hidden />프로젝트에 연결</Button></div>
            </div>
          )}
        </div>
      </Card>
      {deleting && <DeleteDatasetDialog dataset={item} onClose={() => setDeleting(false)} onDeleted={() => navigate('/app/data', { replace: true })} />}
      {linking && <LinkProjectDialog dataset={item} onClose={() => setLinking(false)} onLinked={(project) => { setLinking(false); toast.show(`“${project.name}” 프로젝트에 연결했습니다.`); }} />}
      {toast.node}
    </div>
  );
}

/** 생성 이력: the job that produced this dataset — method, inputs, variables with colour range, steps. */
function GenerationHistory({ jobId }: { jobId?: string }) {
  const job = useLoad(() => (jobId ? generation.jobSummary(jobId) : Promise.resolve(null)), [jobId]);
  if (!jobId) return <EmptyState title="생성 이력이 없습니다" text="이 데이터는 생성 작업이 아니라 경로 등록이나 기존 설정으로 추가되었습니다." />;
  if (job.loading) return <Skeleton lines={4} label="생성 이력을 불러오는 중" />;
  if (job.error || !job.data) return <div className="inline-error"><Alert tone="danger">생성 이력을 불러오지 못했습니다. {job.error}</Alert></div>;
  const data = job.data;
  return (
    <div style={{ padding: 20, display: 'grid', gap: 16 }}>
      <dl className="meta-list" style={{ padding: 0 }}>
        <dt>생성 방식</dt><dd>{JOB_TYPE_LABEL[data.type] ?? data.type}</dd>
        <dt>상태</dt><dd><JobStatusBadge job={data} /></dd>
        <dt>요청일</dt><dd>{formatDate(data.createdAt)}</dd>
        <dt>소요 시간</dt><dd className="tabular">{elapsed(data)}</dd>
      </dl>
      <JobSteps job={data} />
      <JobInputSummary job={data} />
      <div><Link className="xc-btn xc-btn--secondary xc-btn--sm" to="/app/jobs">작업 센터에서 보기</Link></div>
    </div>
  );
}

/** 생성 이력 of a fusion result: formula, bindings and rules, and a shortcut to run the same fusion again (FR-FUS-10). */
function FusionHistory({ dataset }: { dataset: ZarrDataset }) {
  const job = useLoad(() => (dataset.generationJobId ? fusion.getJob(dataset.generationJobId).catch(() => null) : Promise.resolve(null)), [dataset.generationJobId]);
  const navigate = useNavigate();
  if (job.loading) return <Skeleton lines={4} label="생성 이력을 불러오는 중" />;
  const data = job.data;
  const request = asFusionRequest(data?.input) ?? asFusionRequest(dataset.fusion);
  if (!request) return <EmptyState title="융합 조건을 찾을 수 없습니다" text="이 융합 결과에는 수식과 규칙 기록이 없습니다." />;
  return (
    <div style={{ padding: 20, display: 'grid', gap: 16 }}>
      <dl className="meta-list" style={{ padding: 0 }}>
        <dt>생성 방식</dt><dd>수식 융합</dd>
        {data && <><dt>상태</dt><dd><JobStatusBadge job={data} /></dd><dt>요청일</dt><dd>{formatDate(data.createdAt)}</dd><dt>소요 시간</dt><dd className="tabular">{elapsed(data)}</dd></>}
      </dl>
      {data && <JobSteps job={data} />}
      <FusionRequestSummary request={request} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button variant="secondary" size="sm" onClick={() => navigate('/app/analysis/fusion', { state: { request } })}>같은 조건으로 다시 실행</Button>
        {data && <Link className="xc-btn xc-btn--ghost xc-btn--sm" to="/app/jobs">작업 센터에서 보기</Link>}
      </div>
    </div>
  );
}

/** 생성 이력 of an AI result: model, threshold and period of the AI job that made it. */
function AiHistory({ dataset }: { dataset: ZarrDataset }) {
  const job = useLoad(() => (dataset.generationJobId ? ai.getJob(dataset.generationJobId).catch(() => null) : Promise.resolve(null)), [dataset.generationJobId]);
  if (job.loading) return <Skeleton lines={4} label="생성 이력을 불러오는 중" />;
  const data = job.data;
  if (!data) return <EmptyState title="AI 작업 기록을 찾을 수 없습니다" text="원본 데이터의 AI 결과 탭이나 작업 센터에서 확인하세요." />;
  return (
    <div style={{ padding: 20, display: 'grid', gap: 16 }}>
      <dl className="meta-list" style={{ padding: 0 }}>
        <dt>생성 방식</dt><dd>AI 수체 추출</dd>
        <dt>상태</dt><dd><JobStatusBadge job={data} /></dd>
        <dt>요청일</dt><dd>{formatDate(data.createdAt)}</dd>
        <dt>소요 시간</dt><dd className="tabular">{elapsed(data)}</dd>
      </dl>
      <JobSteps job={data} />
      <JobInputSummary job={data} />
      <div><Link className="xc-btn xc-btn--ghost xc-btn--sm" to="/app/jobs">작업 센터에서 보기</Link></div>
    </div>
  );
}

type AiRow = { key: string; name: string; model: string; status: string; datacubeId?: string; createdAt?: string };
const AI_STATUS: Record<string, ReactNode> = {
  SUCCEEDED: <Badge tone="success">완료</Badge>, FAILED: <Badge tone="danger">실패</Badge>, CANCELLED: <Badge>취소됨</Badge>,
};

/** AI results of a source dataset: AI service jobs first, then Backoffice links the AI service does not know. */
function AiResults({ datasetId }: { datasetId: string }) {
  const results = useLoad(async () => {
    const [jobs, links] = await Promise.allSettled([ai.listJobs({ datacubeId: datasetId }), appApi.getAiResults(datasetId)]);
    if (jobs.status === 'rejected' && links.status === 'rejected') throw links.reason;
    const rows: AiRow[] = (jobs.status === 'fulfilled' ? jobs.value : []).map((job: AiWaterJob) => ({
      key: job.id, name: job.name, model: AI_MODEL_LABEL[String(job.input?.modelId)] ?? String(job.input?.modelId ?? '—'),
      status: job.status, datacubeId: job.registration?.datacubeId != null ? String(job.registration.datacubeId) : undefined, createdAt: job.createdAt,
    }));
    for (const link of links.status === 'fulfilled' ? links.value : [])
      if (!rows.some((row) => row.datacubeId && row.datacubeId === link.outputDatacubeId))
        rows.push({ key: `link:${link.id}`, name: `수체 추출 결과 #${link.id}`, model: '—', status: link.status, datacubeId: link.outputDatacubeId });
    return rows;
  }, [datasetId]);
  if (results.loading) return <Skeleton lines={3} label="AI 결과를 불러오는 중" />;
  if (results.error) return <div className="inline-error"><Alert tone="danger">AI 결과를 불러오지 못했습니다. {results.error}</Alert></div>;
  const items = results.data ?? [];
  if (!items.length) return <EmptyState title="AI 결과가 없습니다" text="Viewer에서 AI 수체 추출을 실행하면 결과가 이곳에 쌓입니다." action={<ButtonAnchor href={viewerHref(datasetId)} target="_blank" rel="noopener noreferrer" variant="secondary">Viewer에서 실행<span className="sr-only">(새 탭)</span></ButtonAnchor>} />;
  return (
    <div className="xc-table-wrap">
      <table className="xc-table">
        <thead><tr><th scope="col">결과</th><th scope="col">모델</th><th scope="col" className="hide-sm">요청일</th><th scope="col">상태</th><th scope="col"><span className="sr-only">동작</span></th></tr></thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.key}>
              <td><span className="xc-cell-main"><strong>{row.datacubeId && row.status === 'SUCCEEDED' ? <Link to={`/app/data/${encodeURIComponent(row.datacubeId)}`}>{row.name}</Link> : row.name}</strong><small><Badge tone="result">AI 결과</Badge></small></span></td>
              <td>{row.model}</td>
              <td className="hide-sm">{formatDate(row.createdAt)}</td>
              <td>{AI_STATUS[row.status] ?? <Badge tone="warning">처리 중</Badge>}</td>
              <td className="num">{row.status === 'SUCCEEDED' && <a className="xc-btn xc-btn--ghost xc-btn--sm" href={aiViewerHref(datasetId, row.key.startsWith('link:') ? row.datacubeId ?? '' : row.key)} target="_blank" rel="noopener noreferrer" aria-label={`${row.name} Viewer에서 원본과 비교 (새 탭)`}>Viewer 비교</a>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
