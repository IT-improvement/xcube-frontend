import { ChevronDown, ChevronRight, ListChecks, RotateCcw, Square } from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { userMessage } from '../../api/httpClient';
import { JobSummary } from '../../api/generationApi';
import { Alert, Button, ButtonLink } from '../../components/ui';
import { Card, EmptyState, PageHeader, Skeleton, useToast } from '../../components/ui/kit';
import { formatDate, jobs as jobService } from '../api';
import { elapsed, isActive, JOB_TYPE_LABEL, JobInputSummary, JobStatusBadge, JobSteps } from '../jobs';
import { useLoad } from '../useLoad';

type TypeFilter = '' | 'GEE_TO_ZARR' | 'GEOTIFF_BANDS,CAS500' | 'SHAPEFILE' | 'FUSION';
type StatusFilter = '' | 'QUEUED,RUNNING' | 'SUCCEEDED' | 'FAILED,CANCELLED';

/** S10 작업 센터: the user's generation and fusion jobs with progress, steps, cancel and retry (FR-JOB-01·02). */
export default function JobsPage() {
  const [type, setType] = useState<TypeFilter>('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [open, setOpen] = useState<string | null>(null); // jobKey of the expanded row
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const toast = useToast();
  const jobs = useLoad(() => jobService.list({ type, status }), [type, status, tick]);
  const items = useMemo(() => jobs.data ?? [], [jobs.data]);
  const anyActive = items.some(isActive);

  // While something is processing, refresh every 10 seconds (FR-JOB-03).
  useEffect(() => {
    if (!anyActive) return;
    const timer = window.setTimeout(() => setTick((value) => value + 1), 10000);
    return () => window.clearTimeout(timer);
  }, [anyActive, items]);

  // Ids are unique per service only, so rows are keyed by type too.
  const keyOf = (job: JobSummary) => `${job.type === 'FUSION' ? 'FUSION' : 'GEN'}:${job.id}`;
  const act = async (job: JobSummary, action: 'cancel' | 'retry') => {
    setBusy(keyOf(job));
    setError('');
    try {
      if (action === 'cancel') { await jobService.cancel(job); toast.show('작업을 취소했습니다.'); }
      else { const again = await jobService.retry(job); setOpen(keyOf(again)); toast.show('같은 설정으로 다시 실행했습니다.'); }
      setTick((value) => value + 1);
    } catch (cause) { setError(userMessage(cause)); } finally { setBusy(''); }
  };

  return (
    <div className="page-stack">
      <PageHeader title="작업" description="데이터 생성·수식 융합 작업의 진행 상황입니다. 처리 중인 작업이 있으면 10초마다 갱신합니다." actions={<><ButtonLink to="/app/analysis/fusion" variant="secondary">수식 융합</ButtonLink><ButtonLink to="/app/data/new">데이터 추가</ButtonLink></>} />
      <Card>
        <div className="toolbar">
          <div className="segmented" role="group" aria-label="작업 종류">
            {([['', '전체'], ['GEE_TO_ZARR', 'GEE'], ['GEOTIFF_BANDS,CAS500', 'GeoTIFF·CAS500'], ['SHAPEFILE', 'Shapefile'], ['FUSION', '수식 융합']] as Array<[TypeFilter, string]>).map(([value, label]) => (
              <button key={label} type="button" aria-pressed={type === value} onClick={() => setType(value)}>{label}</button>
            ))}
          </div>
          <span className="toolbar__spacer" />
          <label>
            <span className="sr-only">상태</span>
            <select className="xc-select" aria-label="상태" value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}>
              <option value="">모든 상태</option>
              <option value="QUEUED,RUNNING">진행 중</option>
              <option value="SUCCEEDED">완료</option>
              <option value="FAILED,CANCELLED">실패·취소</option>
            </select>
          </label>
        </div>
        {error && <div className="inline-error"><Alert tone="danger">{error}</Alert></div>}
        {jobs.loading && !jobs.data ? (
          <Skeleton lines={4} label="작업을 불러오는 중" />
        ) : jobs.error ? (
          <div className="inline-error"><Alert tone="danger">작업 목록을 불러오지 못했습니다. {jobs.error}</Alert><Button variant="secondary" size="sm" onClick={jobs.reload} style={{ marginTop: 12 }}>다시 시도</Button></div>
        ) : !items.length ? (
          <EmptyState icon={<ListChecks size={22} />} title={type || status ? '조건에 맞는 작업이 없습니다' : '아직 작업이 없습니다'} text="데이터 추가나 수식 융합을 실행하면 이곳에 진행 상황이 표시됩니다." />
        ) : (
          <div className="xc-table-wrap">
            <table className="xc-table">
              <thead>
                <tr>
                  <th scope="col"><span className="sr-only">펼치기</span></th>
                  <th scope="col">작업</th>
                  <th scope="col">종류</th>
                  <th scope="col">상태</th>
                  <th scope="col" className="hide-sm">진행</th>
                  <th scope="col" className="hide-sm">소요 시간</th>
                  <th scope="col" className="hide-sm">요청일</th>
                  <th scope="col"><span className="sr-only">동작</span></th>
                </tr>
              </thead>
              <tbody>
                {items.map((job) => {
                  const key = keyOf(job);
                  const expanded = open === key;
                  const percent = Math.round((job.progress ?? (job.status === 'SUCCEEDED' ? 1 : 0)) * 100);
                  return (
                    <Fragment key={key}>
                      <tr>
                        <td>
                          <button type="button" className="xc-icon-btn" aria-expanded={expanded} aria-label={`${job.name} 상세 ${expanded ? '접기' : '펼치기'}`} onClick={() => setOpen(expanded ? null : key)}>
                            {expanded ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
                          </button>
                        </td>
                        <td><span className="xc-cell-main"><strong>{job.name || '이름 없음'}</strong>{job.errorMessage && <small className="job-error">{job.errorMessage}</small>}</span></td>
                        <td>{JOB_TYPE_LABEL[job.type] ?? job.type}</td>
                        <td><JobStatusBadge job={job} /></td>
                        <td className="hide-sm">
                          <span className="job-progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={`${job.name} 진행률`}>
                            <i style={{ width: `${percent}%` }} className={job.status === 'FAILED' ? 'is-failed' : ''} />
                          </span>
                          <small className="tabular xc-hint">{percent}%</small>
                        </td>
                        <td className="hide-sm tabular">{elapsed(job)}</td>
                        <td className="hide-sm">{formatDate(job.createdAt)}</td>
                        <td>
                          <div className="row-actions">
                            {job.registration?.datacubeId != null && job.status === 'SUCCEEDED' && (
                              <Link className="xc-btn xc-btn--ghost xc-btn--sm" to={`/app/data/${job.registration.datacubeId}`}>데이터 보기</Link>
                            )}
                            {isActive(job) && <Button size="sm" variant="ghost" disabled={busy === key} onClick={() => act(job, 'cancel')} aria-label={`${job.name} 취소`}><Square size={14} aria-hidden />취소</Button>}
                            {(job.status === 'FAILED' || job.status === 'CANCELLED') && <Button size="sm" variant="secondary" disabled={busy === key} onClick={() => act(job, 'retry')} aria-label={`${job.name} 다시 시도`}><RotateCcw size={14} aria-hidden />다시 시도</Button>}
                          </div>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="job-detail-row">
                          <td colSpan={8}>
                            <div className="job-detail">
                              <JobSteps job={job} />
                              {job.status === 'FAILED' && <Alert tone="danger">실패 사유: {job.errorMessage || job.errorCode || '알 수 없음'}</Alert>}
                              {job.registration?.error && <Alert tone="warning">목록 등록 실패: {job.registration.error}</Alert>}
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
      {toast.node}
    </div>
  );
}
