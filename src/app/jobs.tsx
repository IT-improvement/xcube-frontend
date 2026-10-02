// Shared pieces for generation jobs: labels, status badge, step list, request summary and the
// "jobs in progress" poller used by the menu badge and the dashboard (FR-JOB-03).
import { Fragment, useEffect, useState } from 'react';
import { JobSummary } from '../api/generationApi';
import { Badge, BadgeTone } from '../components/ui/kit';
import { generation } from './api';

export const JOB_TYPE_LABEL: Record<string, string> = {
  GEE_TO_ZARR: 'GEE',
  GEOTIFF_BANDS: 'GeoTIFF',
  CAS500: 'CAS500',
  SHAPEFILE: 'Shapefile',
};
const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  QUEUED: { label: '대기 중', tone: 'neutral' },
  RUNNING: { label: '처리 중', tone: 'warning' },
  SUCCEEDED: { label: '완료', tone: 'success' },
  FAILED: { label: '실패', tone: 'danger' },
  CANCELLED: { label: '취소됨', tone: 'neutral' },
};
export const isActive = (job: JobSummary) => job.status === 'QUEUED' || job.status === 'RUNNING';

export function JobStatusBadge({ job }: { job: JobSummary }) {
  const status = STATUS[job.status] ?? { label: job.status, tone: 'neutral' as BadgeTone };
  return <Badge tone={status.tone}>{status.label}</Badge>;
}

/** "3분 20초" between start and end (or now while running). */
export function elapsed(job: JobSummary, now = Date.now()) {
  const start = job.startedAt ?? job.createdAt;
  if (!start) return '—';
  const end = job.finishedAt ? new Date(job.finishedAt).getTime() : now;
  const seconds = Math.max(0, Math.round((end - new Date(start).getTime()) / 1000));
  if (seconds < 60) return `${seconds}초`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}분 ${seconds % 60}초` : `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
}

type StepState = 'done' | 'current' | 'failed' | 'todo';
/** 검사 → 변환 → 검증 → 등록 → XCube 반영, derived from status, stage and the Backoffice registration. */
export function jobSteps(job: JobSummary): Array<{ label: string; state: StepState }> {
  const registered = !!job.registration?.datacubeId || !!job.registration?.xcubeDatasetId;
  const registrationFailed = !!job.registration?.error;
  const converting = job.status === 'RUNNING' && job.stage !== 'validate';
  const failedAt = job.status === 'FAILED' ? (job.stage === 'validate' ? 2 : 1) : -1;
  const states: StepState[] = [
    'done',
    job.status === 'QUEUED' ? 'todo' : converting ? 'current' : failedAt === 1 ? 'failed' : job.status === 'CANCELLED' ? 'todo' : 'done',
    job.status === 'SUCCEEDED' ? 'done' : job.status === 'RUNNING' && job.stage === 'validate' ? 'current' : failedAt === 2 ? 'failed' : 'todo',
    registered ? 'done' : registrationFailed ? 'failed' : job.status === 'SUCCEEDED' ? 'current' : 'todo',
    registered ? 'done' : 'todo',
  ];
  return ['검사', '변환', '검증', '등록', 'XCube 반영'].map((label, index) => ({ label, state: states[index] }));
}

export function JobSteps({ job }: { job: JobSummary }) {
  return (
    <ol className="job-steps" aria-label="처리 단계">
      {jobSteps(job).map((step) => (
        <li key={step.label} className={`is-${step.state}`}>
          <span aria-hidden>{step.state === 'done' ? '✓' : step.state === 'failed' ? '!' : ''}</span>
          {step.label}
          <span className="sr-only">{step.state === 'done' ? ' 완료' : step.state === 'current' ? ' 진행 중' : step.state === 'failed' ? ' 실패' : ' 대기'}</span>
        </li>
      ))}
    </ol>
  );
}

type VariableIn = { source?: string; name?: string; variable?: string; kind?: string; colorBar?: string; valueMin?: number; valueMax?: number; style?: { colorBar?: string; min?: number; max?: number } };

/** What the job was asked to do: inputs, chosen variables with colour range, parameters. */
export function JobInputSummary({ job }: { job: JobSummary }) {
  const input = job.input ?? {};
  const variables = ((input.variables as VariableIn[] | undefined) ?? (input.bandStyles as VariableIn[] | undefined) ?? []);
  const params = (input.params as Record<string, unknown> | undefined) ?? {};
  const rows: Array<[string, string]> = [];
  if (input.collectionId) rows.push(['GEE 컬렉션', String(input.collectionId)]);
  if (input.startDate) rows.push(['기간', `${input.startDate} ~ ${input.endDate}`]);
  if (Array.isArray(input.files)) rows.push(['파일', (input.files as string[]).join(', ') || '—']);
  if (input.scaleMeters) rows.push(['픽셀 크기', `${input.scaleMeters} m`]);
  for (const [key, label] of [['sensor', '위성·센서'], ['date', '관측 날짜'], ['nodata', 'nodata'], ['resolution', '해상도(도)']] as const)
    if (params[key] != null) rows.push([label, String(params[key])]);
  if (job.zarrUri) rows.push(['저장 위치', String(job.zarrUri).replace('file://', '')]);
  return (
    <div className="job-input">
      <dl className="meta-list" style={{ padding: 0 }}>
        {rows.map(([label, value]) => (<Fragment key={label}><dt>{label}</dt><dd>{value}</dd></Fragment>))}
      </dl>
      {variables.length > 0 && (
        <table className="xc-table job-vars">
          <thead><tr><th scope="col">변수</th><th scope="col">표현</th><th scope="col">색상표</th><th scope="col">표시 범위</th></tr></thead>
          <tbody>
            {variables.map((variable, index) => {
              const name = variable.name ?? variable.variable ?? variable.source ?? `#${index + 1}`;
              const colorBar = variable.style?.colorBar ?? variable.colorBar ?? '—';
              const min = variable.style?.min ?? variable.valueMin;
              const max = variable.style?.max ?? variable.valueMax;
              return (
                <tr key={name}>
                  <td><strong>{name}</strong>{variable.source && variable.source !== name ? <span className="xc-hint"> ← {variable.source}</span> : null}</td>
                  <td>{variable.kind === 'categorical' ? '범주형' : '연속값'}</td>
                  <td>{colorBar}</td>
                  <td className="tabular">{min != null && max != null ? `${min} ~ ${max}` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Number of jobs in progress; polls every 10 s while any is running, otherwise every 60 s. */
export function useActiveJobCount() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const check = () =>
      generation.listJobs({ status: 'QUEUED,RUNNING' })
        .then((jobs) => { if (!cancelled) setCount(jobs.length); return jobs.length; })
        .catch(() => 0)
        .then((active) => { if (!cancelled) timer = window.setTimeout(check, active ? 10000 : 60000); });
    check();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, []);
  return count;
}
