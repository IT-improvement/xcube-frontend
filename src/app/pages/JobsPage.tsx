import { ChevronDown, ChevronRight, ListChecks, RotateCcw, Square } from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { userMessage } from '../../api/httpClient';
import { JobSummary } from '../../api/generationApi';
import { Alert, Button, ButtonLink } from '../../components/ui';
import { Card, ConfirmDialog, EmptyState, PageHeader, Skeleton, useToast } from '../../components/ui/kit';
import { aiViewerHref, formatDateTime, jobs as jobService, unavailableJobsNotice } from '../api';
import { elapsed, isActive, JOB_TYPE_LABEL, JobInputSummary, JobStatusBadge, JobSteps } from '../jobs';
import { useLoad } from '../useLoad';

type TypeFilter = '' | 'GEE_TO_ZARR' | 'GEOTIFF_BANDS,CAS500' | 'SHAPEFILE' | 'FUSION' | 'AI_WATER';
type StatusFilter = '' | 'QUEUED,RUNNING' | 'SUCCEEDED' | 'FAILED,CANCELLED';
const TYPES: TypeFilter[] = ['', 'GEE_TO_ZARR', 'GEOTIFF_BANDS,CAS500', 'SHAPEFILE', 'FUSION', 'AI_WATER'];
const STATUSES: StatusFilter[] = ['', 'QUEUED,RUNNING', 'SUCCEEDED', 'FAILED,CANCELLED'];
const pick = <T extends string>(value: string | null, allowed: T[]) => (allowed.includes(value as T) ? (value as T) : ('' as T));

/** S10 작업 센터: the user's generation, fusion and AI jobs with progress, steps, cancel and retry (FR-JOB-01·02). */
export default function JobsPage() {
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
  const partialNotice = unavailableJobsNotice(jobs.data?.unavailable ?? []);
  const anyActive = items.some(isActive);
  const [refreshedAt, setRefreshedAt] = useState('');
  useEffect(() => { if (jobs.data) setRefreshedAt(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })); }, [jobs.data]);

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
      toast.show('같은 설정으로 다시 실행했습니다.');
      setTick((value) => value + 1);
    } catch (cause) { setError(userMessage(cause)); } finally { setBusy(''); }
  };
  // Cancelling stops work that cannot be resumed, so it is confirmed first; a failure stays in the dialog.
  const cancel = async (job: JobSummary) => {
    await jobService.cancel(job);
    setCancelling(null);
    toast.show('작업을 취소했습니다.');
    setTick((value) => value + 1);
  };

  return (
    <div className="page-stack">
      <PageHeader title="작업" description="데이터 생성·수식 융합·AI 수체 추출 작업의 진행 상황입니다. 처리 중인 작업이 있으면 10초마다 갱신합니다." actions={<><ButtonLink to="/app/analysis/fusion" variant="secondary">수식 융합</ButtonLink><ButtonLink to="/app/data/new">데이터 추가</ButtonLink></>} />
      <Card>
        <div className="toolbar">
          <div className="segmented" role="group" aria-label="작업 종류">
            {([['', '전체'], ['GEE_TO_ZARR', 'GEE'], ['GEOTIFF_BANDS,CAS500', 'GeoTIFF·CAS500'], ['SHAPEFILE', 'Shapefile'], ['FUSION', '수식 융합'], ['AI_WATER', 'AI 수체 추출']] as Array<[TypeFilter, string]>).map(([value, label]) => (
              <button key={label} type="button" aria-pressed={type === value} onClick={() => setType(value)}>{label}</button>
            ))}
          </div>
          <span className="toolbar__spacer" />
          {anyActive && refreshedAt && <span className="xc-hint tabular" aria-live="off">{refreshedAt} 갱신</span>}
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
        {partialNotice && !jobs.error && <div className="inline-error"><Alert tone="warning">{partialNotice}</Alert><Button variant="line" size="sm" onClick={jobs.reload} className="inline-error__retry">다시 시도</Button></div>}
        {jobs.loading && !jobs.data ? (
          <Skeleton lines={4} label="작업을 불러오는 중" />
        ) : jobs.error ? (
          <div className="inline-error"><Alert tone="danger">작업 목록을 불러오지 못했습니다. {jobs.error}</Alert><Button variant="line" size="sm" onClick={jobs.reload} className="inline-error__retry">다시 시도</Button></div>
        ) : !items.length ? (
          <EmptyState icon={<ListChecks size={22} />} title={type || status ? '조건에 맞는 작업이 없습니다' : '아직 작업이 없습니다'} text="데이터 추가, 수식 융합, AI 수체 추출을 실행하면 이곳에 진행 상황이 표시됩니다." />
        ) : (
          <div className="xc-table-wrap">
            <table className="xc-table xc-table--cards jobs-table">
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
                  const percent = Math.round((job.progress ?? 0) * 100);
                  return (
                    <Fragment key={key}>
                      <tr>
                        <td>
                          <button type="button" className="xc-icon-btn" aria-expanded={expanded} aria-label={`${job.name} 상세 ${expanded ? '접기' : '펼치기'}`} onClick={() => setOpen(expanded ? null : key)}>
                            {expanded ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
                          </button>
                        </td>
                        <td className="cell-main"><span className="xc-cell-main"><strong>{job.name || '이름 없음'}</strong>{job.errorMessage && <small className="job-error">{job.errorMessage}</small>}</span></td>
                        <td className="nowrap jobs-table__type">{JOB_TYPE_LABEL[job.type] ?? job.type}</td>
                        <td><JobStatusBadge job={job} /></td>
                        <td className="jobs-table__progress">
                          {job.status === 'RUNNING' && (
                            <span className="job-progress-cell">
                              <span className="job-progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={`${job.name} 진행률`}>
                                <i style={{ width: `${percent}%` }} />
                              </span>
                              <small className="tabular xc-hint">{percent}%</small>
                            </span>
                          )}
                        </td>
                        <td className="hide-sm tabular nowrap">{elapsed(job)}</td>
                        <td className="hide-sm date">{formatDateTime(job.createdAt)}</td>
                        <td className="cell-actions">
                          <div className="row-actions">
                            {job.registration?.datacubeId != null && job.status === 'SUCCEEDED' && (
                              <Link className="xc-btn xc-btn--ghost xc-btn--sm" to={`/app/data/${job.registration.datacubeId}`}>데이터 보기</Link>
                            )}
                            {job.type === 'AI_WATER' && job.status === 'SUCCEEDED' && job.input?.datacubeId != null && (
                              <a className="xc-btn xc-btn--ghost xc-btn--sm" href={aiViewerHref(String(job.input.datacubeId), job.id)} target="_blank" rel="noopener noreferrer" aria-label={`${job.name} Viewer에서 원본과 비교 (새 탭)`}>Viewer 비교</a>
                            )}
                            {isActive(job) && <Button size="sm" variant="quiet" disabled={busy === key} onClick={() => setCancelling(job)} aria-label={`${job.name} 취소`}><Square size={14} aria-hidden />취소</Button>}
                            {(job.status === 'FAILED' || job.status === 'CANCELLED') && <Button size="sm" variant="line" disabled={busy === key} onClick={() => retry(job)} aria-label={`${job.name} 다시 시도`}><RotateCcw size={14} aria-hidden />다시 시도</Button>}
                          </div>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="job-detail-row">
                          <td colSpan={8} className="cell-full">
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
      {cancelling && (
        <ConfirmDialog
          title="작업을 취소할까요?"
          description={<>“{cancelling.name || '이름 없음'}” 작업을 멈춥니다. 지금까지 처리한 결과는 남지 않으며, 다시 하려면 처음부터 실행해야 합니다.</>}
          confirmLabel="작업 취소"
          busyLabel="취소하는 중…"
          cancelLabel="계속 진행"
          onConfirm={() => cancel(cancelling)}
          onClose={() => setCancelling(null)}
        />
      )}
      {toast.node}
    </div>
  );
}
