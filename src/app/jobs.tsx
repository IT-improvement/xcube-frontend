// Shared pieces for generation jobs: labels, status badge, step list, request summary and the
// "jobs in progress" poller used by the menu badge and the dashboard (FR-JOB-03).
import { Fragment, useEffect, useState } from 'react';
import { JobSummary } from '../api/generationApi';
import { Badge, BadgeTone } from '../components/ui/kit';
import { jobs as allJobs } from './api';
import { AGG_LABEL, asFusionRequest, EXTENT_LABEL, GRID_LABEL, normalizationLabel, PERIOD_LABEL, RESAMPLING_LABEL, TIME_LABEL } from './fusion';
import { FusionRequest } from '../api/analysisApi';
import { getLanguage, translate, useLanguage } from '../i18n';
import type { Lang, TKey } from '../i18n';

/** Source types are product names in every language; fusion and AI are translated (jobType.*). */
const SOURCE_TYPE_LABEL: Record<string, string> = {
  GEE_TO_ZARR: 'GEE',
  GEOTIFF_BANDS: 'GeoTIFF',
  CAS500: 'CAS500',
  SHAPEFILE: 'Shapefile',
};
/** "GEE", "수식 융합" / "Band math", "AI 수체 추출" / "AI water extraction"; unknown types as given. */
export const jobTypeLabel = (type: string, lang: Lang = getLanguage()) =>
  type === 'FUSION' || type === 'AI_WATER' ? translate(lang, `jobType.${type}`) : SOURCE_TYPE_LABEL[type] ?? type;

/**
 * Model names for job rows when the model list is not loaded (ids from the M7 contract). The Viewer has its
 * own copy of these names in its dictionary part (viewer.ai.models), so it does not load the app part.
 */
const AI_MODEL_KEY: Record<string, TKey> = {
  'ndwi-baseline': 'aiModels.ndwiBaseline',
  'unet-s1s2-10ch': 'aiModels.unet',
  'deeplabv3plus-s1s2-10ch': 'aiModels.deeplab',
};
/** Known model ids in the screen language; anything else as given. */
export const aiModelLabel = (modelId: string, lang: Lang = getLanguage()) => (AI_MODEL_KEY[modelId] ? translate(lang, AI_MODEL_KEY[modelId]) : modelId);

const STATUS_TONE: Record<string, BadgeTone> = { QUEUED: 'neutral', RUNNING: 'warning', SUCCEEDED: 'success', FAILED: 'danger', CANCELLED: 'neutral' };
/** 대기 중·처리 중·완료·실패·취소됨 / Queued·Running·Done·Failed·Cancelled; unknown statuses as given. */
export const jobStatusLabel = (status: string, lang: Lang = getLanguage()) => (status in STATUS_TONE ? translate(lang, `jobStatus.${status}` as TKey) : status);
export const isActive = (job: JobSummary) => job.status === 'QUEUED' || job.status === 'RUNNING';

export function JobStatusBadge({ job }: { job: JobSummary }) {
  const { lang } = useLanguage();
  return <Badge tone={STATUS_TONE[job.status] ?? 'neutral'}>{jobStatusLabel(job.status, lang)}</Badge>;
}

/** "3분 20초" / "3m 20s" between start and end (or now while running). */
export function elapsed(job: JobSummary, now = Date.now(), lang: Lang = getLanguage()) {
  const start = job.startedAt ?? job.createdAt;
  if (!start) return '—';
  const end = job.finishedAt ? new Date(job.finishedAt).getTime() : now;
  const seconds = Math.max(0, Math.round((end - new Date(start).getTime()) / 1000));
  if (seconds < 60) return translate(lang, 'duration.seconds', { s: seconds });
  const minutes = Math.floor(seconds / 60);
  return minutes < 60
    ? translate(lang, 'duration.minutes', { m: minutes, s: seconds % 60 })
    : translate(lang, 'duration.hours', { h: Math.floor(minutes / 60), m: minutes % 60 });
}

type StepState = 'done' | 'current' | 'failed' | 'todo';
/** 검사 → 변환 → 검증 → 등록 → XCube 반영, derived from status, stage and the Backoffice registration. */
export function jobSteps(job: JobSummary, lang: Lang = getLanguage()): Array<{ label: string; state: StepState }> {
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
  const keys: TKey[] = job.type === 'FUSION'
    ? ['jobs.steps.checkInputs', 'jobs.steps.compute', 'jobs.steps.validate', 'jobs.steps.register', 'jobs.steps.publish']
    : job.type === 'AI_WATER'
      ? ['jobs.steps.checkInputs', 'jobs.steps.infer', 'jobs.steps.validate', 'jobs.steps.register', 'jobs.steps.publish']
      : ['jobs.steps.inspect', 'jobs.steps.convert', 'jobs.steps.validate', 'jobs.steps.register', 'jobs.steps.publish'];
  return keys.map((key, index) => ({ label: translate(lang, key), state: states[index] }));
}

export function JobSteps({ job }: { job: JobSummary }) {
  const { lang, t } = useLanguage();
  return (
    <ol className="job-steps" aria-label={t('jobs.steps.label')}>
      {jobSteps(job, lang).map((step) => (
        <li key={step.label} className={`is-${step.state}`}>
          <span aria-hidden>{step.state === 'done' ? '✓' : step.state === 'failed' ? '!' : ''}</span>
          {step.label}
          <span className="sr-only">{` ${t(step.state === 'done' ? 'jobs.steps.done' : step.state === 'current' ? 'jobs.steps.current' : step.state === 'failed' ? 'jobs.steps.failed' : 'jobs.steps.todo')}`}</span>
        </li>
      ))}
    </ol>
  );
}

type VariableIn = { source?: string; name?: string; variable?: string; kind?: string; colorBar?: string; valueMin?: number; valueMax?: number; style?: { colorBar?: string; min?: number; max?: number } };

/** Formula, bindings and rules of a fusion request (job input or dataset history). */
export function FusionRequestSummary({ request, names }: { request: Partial<FusionRequest>; names?: Record<string, string> }) {
  const { lang, t } = useLanguage();
  const label = <K extends string>(keys: Record<K, TKey>, value: string | null | undefined) => (value == null ? '—' : value in keys ? t(keys[value as K]) : value);
  const bindings = Object.entries(request.bindings ?? {});
  const grid = request.grid;
  const time = request.time;
  const rules: Array<[string, string]> = [];
  if (grid) {
    const gridText = `${label(GRID_LABEL, grid.reference)}${grid.reference === 'datacube' && grid.datacubeId != null ? ` (${names?.[String(grid.datacubeId)] ?? `#${grid.datacubeId}`})` : ''}`;
    rules.push([t('fusion.summary.grid'), t('fusion.summary.gridValue', { grid: gridText, resampling: label(RESAMPLING_LABEL, grid.resampling) })]);
  }
  if (request.extent) rules.push([t('fusion.summary.extent'), label(EXTENT_LABEL, request.extent)]);
  if (time) {
    const tolerance = time.mode === 'nearest' && time.toleranceDays != null ? t('fusion.summary.tolerance', { days: time.toleranceDays }) : '';
    const aggregate = time.mode === 'aggregate' ? t('fusion.summary.aggregate', { period: label(PERIOD_LABEL, time.period), agg: label(AGG_LABEL, time.agg) }) : '';
    rules.push([t('fusion.summary.time'), `${label(TIME_LABEL, time.mode)}${tolerance}${aggregate}`]);
  }
  if (request.outputVariable) rules.push([t('fusion.summary.outputVariable'), request.outputVariable]);
  return (
    <div className="job-input">
      <dl className="meta-list" style={{ padding: 0 }}>
        <dt>{t('fusion.summary.formula')}</dt><dd><code className="fusion-code">{request.formula}</code></dd>
        {rules.map(([label, value]) => (<Fragment key={label}><dt>{label}</dt><dd>{value}</dd></Fragment>))}
      </dl>
      {bindings.length > 0 && (
        <table className="xc-table job-vars">
          <caption className="sr-only">{t('fusion.summary.inputVariables')}</caption>
          <thead><tr><th scope="col">{t('fusion.summary.letter')}</th><th scope="col">{t('fusion.summary.data')}</th><th scope="col">{t('fusion.summary.variable')}</th><th scope="col">{t('fusion.summary.normalization')}</th></tr></thead>
          <tbody>
            {bindings.map(([letter, binding]) => (
              <tr key={letter}>
                <td><strong>{letter}</strong></td>
                <td>{names?.[String(binding.datacubeId)] ?? `#${binding.datacubeId}`}</td>
                <td>{binding.variable}</td>
                <td>{normalizationLabel(binding.normalization, lang)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** What the job was asked to do: inputs, chosen variables with colour range, parameters. */
export function JobInputSummary({ job }: { job: JobSummary }) {
  const { lang, t } = useLanguage();
  const fusionRequest = job.type === 'FUSION' ? asFusionRequest(job.input) : null;
  if (fusionRequest) return <FusionRequestSummary request={fusionRequest} />;
  const input = job.input ?? {};
  if (job.type === 'AI_WATER') {
    const modelId = String(input.modelId ?? '');
    const rows: Array<[string, string]> = [
      [t('jobs.input.inputData'), input.datacubeId != null ? `#${input.datacubeId}` : '—'],
      [t('jobs.input.model'), modelId ? aiModelLabel(modelId, lang) : '—'],
      [t('jobs.input.threshold'), input.threshold != null ? String(input.threshold) : t('jobs.input.modelDefault')],
      [t('jobs.input.period'), input.timeStart || input.timeEnd ? t('app.range', { start: String(input.timeStart ?? t('jobs.input.start')), end: String(input.timeEnd ?? t('jobs.input.end')) }) : t('jobs.input.allTimes')],
    ];
    return (
      <div className="job-input">
        <dl className="meta-list" style={{ padding: 0 }}>
          {rows.map(([label, value]) => (<Fragment key={label}><dt>{label}</dt><dd>{value}</dd></Fragment>))}
        </dl>
      </div>
    );
  }
  const variables = ((input.variables as VariableIn[] | undefined) ?? (input.bandStyles as VariableIn[] | undefined) ?? []);
  const params = (input.params as Record<string, unknown> | undefined) ?? {};
  const rows: Array<[string, string]> = [];
  if (input.collectionId) rows.push([t('jobs.input.geeCollection'), String(input.collectionId)]);
  if (input.startDate) rows.push([t('jobs.input.period'), t('app.range', { start: String(input.startDate), end: String(input.endDate) })]);
  if (Array.isArray(input.files)) rows.push([t('jobs.input.files'), (input.files as string[]).join(', ') || '—']);
  if (input.scaleMeters) rows.push([t('jobs.input.pixelSize'), `${input.scaleMeters} m`]);
  for (const [key, label] of [['sensor', 'jobs.input.sensor'], ['date', 'jobs.input.date'], ['nodata', 'jobs.input.nodata'], ['resolution', 'jobs.input.resolution']] as const)
    if (params[key] != null) rows.push([t(label), String(params[key])]);
  if (job.zarrUri) rows.push([t('jobs.input.storage'), String(job.zarrUri).replace('file://', '')]);
  return (
    <div className="job-input">
      <dl className="meta-list" style={{ padding: 0 }}>
        {rows.map(([label, value]) => (<Fragment key={label}><dt>{label}</dt><dd>{value}</dd></Fragment>))}
      </dl>
      {variables.length > 0 && (
        <table className="xc-table job-vars">
          <thead><tr><th scope="col">{t('jobs.input.variable')}</th><th scope="col">{t('jobs.input.display')}</th><th scope="col">{t('jobs.input.colorBar')}</th><th scope="col">{t('jobs.input.range')}</th></tr></thead>
          <tbody>
            {variables.map((variable, index) => {
              const name = variable.name ?? variable.variable ?? variable.source ?? `#${index + 1}`;
              const colorBar = variable.style?.colorBar ?? variable.colorBar ?? '—';
              const min = variable.style?.min ?? variable.valueMin;
              const max = variable.style?.max ?? variable.valueMax;
              return (
                <tr key={name}>
                  <td><strong>{name}</strong>{variable.source && variable.source !== name ? <span className="xc-hint"> ← {variable.source}</span> : null}</td>
                  <td>{t(variable.kind === 'categorical' ? 'jobs.input.categorical' : 'jobs.input.continuous')}</td>
                  <td>{colorBar}</td>
                  <td className="tabular">{min != null && max != null ? t('app.range', { start: min, end: max }) : '—'}</td>
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
      allJobs.list({ status: 'QUEUED,RUNNING' })
        .then((jobs) => { if (!cancelled) setCount(jobs.length); return jobs.length; })
        .catch(() => 0)
        .then((active) => { if (!cancelled) timer = window.setTimeout(check, active ? 10000 : 60000); });
    check();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, []);
  return count;
}
