import { ArrowLeft, ExternalLink, FolderPlus, Lock, SearchX, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Alert, Button, ButtonAnchor, ButtonLink } from '../../components/ui';
import { Badge, BadgeTone, Card, EmptyState, PageHeader, Skeleton, TabPanel, Tabs, useToast } from '../../components/ui/kit';
import { ai, aiViewerHref, appApi, formatDate, fusion, generation, isOwned, periodLabel, viewerHref, ZarrDataset } from '../api';
import { asFusionRequest } from '../fusion';
import { aiModelLabel, elapsed, FusionRequestSummary, jobStatusLabel, jobTypeLabel, JobInputSummary, JobStatusBadge, JobSteps } from '../jobs';
import type { AiWaterJob } from '../../api/aiApi';
import type { JobSummary } from '../../api/generationApi';
import { useLoad } from '../useLoad';
import { dateOnly, pairLine } from '../wizard/sarModel';
import { DatasetStatus, DeleteDatasetDialog, LinkProjectDialog } from './DataLibraryPage';
import { translate, useLanguage } from '../../i18n';
import type { Lang } from '../../i18n';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
// The management screens' text (UR-53 stage 2) loads with these pages, not with the main bundle.
import '../../i18n/app';

type Tab = 'overview' | 'variables' | 'history' | 'ai' | 'projects';
const TABS: Tab[] = ['overview', 'variables', 'history', 'ai', 'projects'];

/**
 * Small extent sketch: the dataset bbox inside a padded lon/lat frame. The drawing is capped at 240px high and
 * the corner labels are HTML (fixed 11.5px), so neither grows with a wide column. Its label is Korean unless
 * `lang` is given: the add-data wizard (still Korean) uses it too.
 */
export function BBoxMap({ bbox, lang = 'ko' }: { bbox: [number, number, number, number]; lang?: Lang }) {
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
    <figure className="bbox-figure">
      <svg className="bbox-map" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={translate(lang, 'dataset.extentAria', { west: west.toFixed(4), east: east.toFixed(4), south: south.toFixed(4), north: north.toFixed(4) })}>
        <g className="grid">
          {ticks.map((ratio) => <line key={`v${ratio}`} x1={width * ratio} y1={0} x2={width * ratio} y2={height} vectorEffect="non-scaling-stroke" />)}
          {ticks.map((ratio) => <line key={`h${ratio}`} x1={0} y1={height * ratio} x2={width} y2={height * ratio} vectorEffect="non-scaling-stroke" />)}
        </g>
        <rect className="area" x={x(west)} y={y(north)} width={Math.max(2, x(east) - x(west))} height={Math.max(2, y(south) - y(north))} vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="bbox-figure__labels" aria-hidden>
        <span>{frame.w.toFixed(2)}°E, {frame.s.toFixed(2)}°N</span>
        <span>{frame.e.toFixed(2)}°E, {frame.n.toFixed(2)}°N</span>
      </figcaption>
    </figure>
  );
}

/** S5: one dataset's metadata, variables, AI results and project links. */
export default function DatasetDetailPage() {
  const { datasetId = '' } = useParams();
  const navigate = useNavigate();
  const dataset = useLoad(() => appApi.getDataset(datasetId), [datasetId]);
  const { lang, t } = useLanguage();
  useDocumentTitle(dataset.data?.name ? t('titles.dataNamed', { name: dataset.data.name }) : t('titles.data'));
  // The open tab is kept in the URL (?tab=variables) so a reload or a shared link lands on it.
  const [params, setParams] = useSearchParams();
  const tab = (TABS.includes(params.get('tab') as Tab) ? params.get('tab') : 'overview') as Tab;
  const setTab = (value: Tab) => setParams((current) => {
    const next = new URLSearchParams(current);
    if (value === 'overview') next.delete('tab'); else next.set('tab', value);
    return next;
  }, { replace: true });
  const [deleting, setDeleting] = useState(false);
  const [linking, setLinking] = useState(false);
  const toast = useToast();
  const back = <Link className="page-back" to="/app/data"><ArrowLeft size={16} aria-hidden />{t('titles.data')}</Link>;

  if (dataset.loading) return <div className="page-stack">{back}<Card><Skeleton lines={6} label={t('dataset.loading')} /></Card></div>;
  if (dataset.error || !dataset.data) {
    const forbidden = dataset.status === 403;
    const missing = dataset.status === 404;
    return (
      <div className="page-stack">
        {back}
        <Card>
          <EmptyState
            icon={forbidden ? <Lock size={22} /> : <SearchX size={22} />}
            title={forbidden ? t('dataset.forbiddenTitle') : missing ? t('dataset.missingTitle') : t('dataset.failedTitle')}
            text={forbidden ? t('dataset.askOwner') : missing ? t('dataset.missingText') : dataset.error}
            action={forbidden || missing ? <ButtonLink to="/app/data" variant="secondary">{t('dataset.toList')}</ButtonLink> : <Button variant="secondary" onClick={dataset.reload}>{t('common.retry')}</Button>}
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
        description={<span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>{!owned && <Badge tone="water">{t('app.shared')}</Badge>}{item.kind === 'FUSION' ? <Badge tone="water">{t('kinds.fusion')}</Badge> : item.kind === 'AI_RESULT' ? <Badge tone="result">{t('kinds.ai')}</Badge> : <Badge>{t('kinds.original')}</Badge>}<DatasetStatus dataset={item} quiet /><span className="xc-hint">{item.xcubeDatasetId}</span>{isAiResult && item.sourceDatacubeId && <span>{t('dataset.sourceData')} <Link to={`/app/data/${encodeURIComponent(item.sourceDatacubeId)}`}>{t('dataset.viewSource', { id: item.sourceDatacubeId })}</Link></span>}</span>}
        actions={
          <>
            <ButtonAnchor href={viewerLink} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} aria-hidden />{isAiResult ? t('app.compareInViewer') : t('app.openInViewer')}<span className="sr-only">{t('shell.newTab')}</span></ButtonAnchor>
            <Button variant="secondary" onClick={() => setLinking(true)}><FolderPlus size={16} aria-hidden />{t('app.linkToProject')}</Button>
            {owned && <Button variant="ghost" onClick={() => setDeleting(true)} aria-label={t('dataset.deleteLabel')}><Trash2 size={16} aria-hidden />{t('app.delete')}</Button>}
          </>
        }
      />
      <Card>
        <div style={{ padding: '0 20px' }}>
          <Tabs label={t('dataset.tabsLabel')} idPrefix="dataset-detail" value={tab} onChange={setTab} items={[
            { id: 'overview', label: t('dataset.tabs.overview') },
            { id: 'variables', label: t('dataset.tabs.variables'), count: item.variables.length },
            { id: 'history', label: t('dataset.tabs.history') },
            ...(isAiResult ? [] : [{ id: 'ai' as Tab, label: t('dataset.tabs.ai') }]),
            { id: 'projects', label: t('dataset.tabs.projects') },
          ]} />
        </div>
        <TabPanel idPrefix="dataset-detail" value={tab}>
          {tab === 'overview' && (
            <div className={item.bbox ? 'detail-overview' : undefined}>
              {item.bbox && <BBoxMap bbox={item.bbox} lang={lang} />}
              <dl className="meta-list">
                <dt>{t('app.period')}</dt><dd className="tabular">{periodLabel(item, lang)}</dd>
                <dt>{t('dataset.timeCount')}</dt><dd className="tabular">{item.times.length}</dd>
                <dt>{t('dataset.crs')}</dt><dd>EPSG:4326</dd>
                <dt>{t('dataset.extent')}</dt><dd className="tabular">{item.bbox ? t('app.extentValue', { west: item.bbox[0].toFixed(4), east: item.bbox[2].toFixed(4), south: item.bbox[1].toFixed(4), north: item.bbox[3].toFixed(4) }) : '—'}</dd>
                <dt>{t('dataset.defaultVariable')}</dt><dd>{item.defaultVariable || '—'}</dd>
                <dt>{t('dataset.rgb')}</dt><dd>{item.rgbAvailable ? t('dataset.rgbYes') : '—'}</dd>
                <dt>{t('dataset.datasetId')}</dt><dd>{item.xcubeDatasetId || '—'}</dd>
                {item.pairs && <><dt>{t('dataset.radarPairs')}</dt><dd><ul className="tabular" style={{ display: 'grid', gap: 4, margin: 0, padding: 0, listStyle: 'none' }} aria-label={t('dataset.pairsLabel')}>{item.pairs.map((pair, index) => <li key={pair.time ?? index}>{pair.time ? <strong>{dateOnly(pair.time)}</strong> : null} {pairLine(pair)}</li>)}</ul></dd></>}
              </dl>
            </div>
          )}
          {tab === 'variables' && (item.variables.length ? (
            <div className="xc-table-wrap">
              <table className="xc-table">
                <thead><tr><th scope="col">{t('app.name')}</th><th scope="col">{t('dataset.title')}</th><th scope="col">{t('dataset.units')}</th><th scope="col">{t('dataset.defaultShown')}</th></tr></thead>
                <tbody>
                  {item.variables.map((name) => (
                    <tr key={name}>
                      <td><strong>{name}</strong></td>
                      <td>{item.variableMetadata?.[name]?.title || '—'}</td>
                      <td>{item.variableMetadata?.[name]?.units || '—'}</td>
                      <td>{name === item.defaultVariable ? <Badge tone="primary">{t('dataset.default')}</Badge> : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState title={t('dataset.noVariablesTitle')} text={t('dataset.noVariablesText')} />)}
          {tab === 'history' && (item.kind === 'FUSION' ? <FusionHistory dataset={item} /> : isAiResult ? <AiHistory dataset={item} /> : <GenerationHistory jobId={item.generationJobId} />)}
          {tab === 'ai' && <AiResults datasetId={item.id} />}
          {tab === 'projects' && (
            <div style={{ padding: 20, display: 'grid', gap: 12 }}>
              <p>{item.projectName ? <>{t('dataset.defaultProject')} <strong>{item.projectName}</strong></> : t('dataset.noDefaultProject')}</p>
              <p className="xc-hint">{t('dataset.shareHint')}</p>
              <div><Button variant="secondary" onClick={() => setLinking(true)}><FolderPlus size={16} aria-hidden />{t('app.linkToProject')}</Button></div>
            </div>
          )}
        </TabPanel>
      </Card>
      {deleting && <DeleteDatasetDialog dataset={item} onClose={() => setDeleting(false)} onDeleted={() => navigate('/app/data', { replace: true })} />}
      {linking && <LinkProjectDialog dataset={item} onClose={() => setLinking(false)} onLinked={(project) => { setLinking(false); toast.show(t('app.linkedToProject', { name: project.name })); }} />}
      {toast.node}
    </div>
  );
}

/** 생성 이력: the job that produced this dataset — method, inputs, variables with colour range, steps. */
function GenerationHistory({ jobId }: { jobId?: string }) {
  const { lang, t } = useLanguage();
  const job = useLoad(() => (jobId ? generation.jobSummary(jobId) : Promise.resolve(null)), [jobId]);
  if (!jobId) return <EmptyState title={t('dataset.noHistoryTitle')} text={t('dataset.noHistoryText')} />;
  if (job.loading) return <Skeleton lines={4} label={t('dataset.loadingHistory')} />;
  if (job.error || !job.data) return <div className="inline-error"><Alert tone="danger">{t('dataset.historyFailed', { error: job.error })}</Alert></div>;
  const data = job.data;
  return (
    <div style={{ padding: 20, display: 'grid', gap: 16 }}>
      <JobMeta job={data} method={jobTypeLabel(data.type, lang)} />
      <JobSteps job={data} />
      <JobInputSummary job={data} />
      <div><Link className="xc-btn xc-btn--secondary xc-btn--sm" to="/app/jobs">{t('app.inJobCenter')}</Link></div>
    </div>
  );
}

/** Method, status, request date and duration of the job behind a dataset; `job` may be missing. */
function JobMeta({ job, method }: { job?: JobSummary | null; method: string }) {
  const { lang, t } = useLanguage();
  return (
    <dl className="meta-list" style={{ padding: 0 }}>
      <dt>{t('dataset.method')}</dt><dd>{method}</dd>
      {job && <><dt>{t('app.status')}</dt><dd><JobStatusBadge job={job} /></dd><dt>{t('app.requested')}</dt><dd>{formatDate(job.createdAt, lang)}</dd><dt>{t('dataset.duration')}</dt><dd className="tabular">{elapsed(job, Date.now(), lang)}</dd></>}
    </dl>
  );
}

/** 생성 이력 of a fusion result: formula, bindings and rules, and a shortcut to run the same fusion again (FR-FUS-10). */
function FusionHistory({ dataset }: { dataset: ZarrDataset }) {
  const job = useLoad(() => (dataset.generationJobId ? fusion.getJob(dataset.generationJobId).catch(() => null) : Promise.resolve(null)), [dataset.generationJobId]);
  const navigate = useNavigate();
  const { lang, t } = useLanguage();
  if (job.loading) return <Skeleton lines={4} label={t('dataset.loadingHistory')} />;
  const data = job.data;
  const request = asFusionRequest(data?.input) ?? asFusionRequest(dataset.fusion);
  if (!request) return <EmptyState title={t('dataset.noFusionTitle')} text={t('dataset.noFusionText')} />;
  return (
    <div style={{ padding: 20, display: 'grid', gap: 16 }}>
      <JobMeta job={data} method={jobTypeLabel('FUSION', lang)} />
      {data && <JobSteps job={data} />}
      <FusionRequestSummary request={request} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button variant="secondary" size="sm" onClick={() => navigate('/app/analysis/fusion', { state: { request } })}>{t('dataset.rerun')}</Button>
        {data && <Link className="xc-btn xc-btn--ghost xc-btn--sm" to="/app/jobs">{t('app.inJobCenter')}</Link>}
      </div>
    </div>
  );
}

/** 생성 이력 of an AI result: model, threshold and period of the AI job that made it. */
function AiHistory({ dataset }: { dataset: ZarrDataset }) {
  const job = useLoad(() => (dataset.generationJobId ? ai.getJob(dataset.generationJobId).catch(() => null) : Promise.resolve(null)), [dataset.generationJobId]);
  const { lang, t } = useLanguage();
  if (job.loading) return <Skeleton lines={4} label={t('dataset.loadingHistory')} />;
  const data = job.data;
  if (!data) return <EmptyState title={t('dataset.noAiJobTitle')} text={t('dataset.noAiJobText')} />;
  return (
    <div style={{ padding: 20, display: 'grid', gap: 16 }}>
      <JobMeta job={data} method={jobTypeLabel('AI_WATER', lang)} />
      <JobSteps job={data} />
      <JobInputSummary job={data} />
      <div><Link className="xc-btn xc-btn--ghost xc-btn--sm" to="/app/jobs">{t('app.inJobCenter')}</Link></div>
    </div>
  );
}

type AiRow = { key: string; name: string; modelId?: string; status: string; datacubeId?: string; linkId?: string; createdAt?: string };
const AI_STATUS_TONE: Record<string, BadgeTone> = { SUCCEEDED: 'success', FAILED: 'danger', CANCELLED: 'neutral' };
/** Finished statuses as they are; anything else (queued, running, unknown) reads "처리 중". */
function AiStatusBadge({ status }: { status: string }) {
  const { lang } = useLanguage();
  return AI_STATUS_TONE[status] ? <Badge tone={AI_STATUS_TONE[status]}>{jobStatusLabel(status, lang)}</Badge> : <Badge tone="warning">{jobStatusLabel('RUNNING', lang)}</Badge>;
}

/** AI results of a source dataset: AI service jobs first, then Backoffice links the AI service does not know. */
function AiResults({ datasetId }: { datasetId: string }) {
  const { lang, t } = useLanguage();
  const results = useLoad(async () => {
    const [jobs, links] = await Promise.allSettled([ai.listJobs({ datacubeId: datasetId }), appApi.getAiResults(datasetId)]);
    if (jobs.status === 'rejected' && links.status === 'rejected') throw links.reason;
    const rows: AiRow[] = (jobs.status === 'fulfilled' ? jobs.value : []).map((job: AiWaterJob) => ({
      key: job.id, name: job.name, modelId: job.input?.modelId == null ? undefined : String(job.input.modelId),
      status: job.status, datacubeId: job.registration?.datacubeId != null ? String(job.registration.datacubeId) : undefined, createdAt: job.createdAt,
    }));
    for (const link of links.status === 'fulfilled' ? links.value : [])
      if (!rows.some((row) => row.datacubeId && row.datacubeId === link.outputDatacubeId))
        rows.push({ key: `link:${link.id}`, name: '', linkId: String(link.id), status: link.status, datacubeId: link.outputDatacubeId });
    return rows;
  }, [datasetId]);
  if (results.loading) return <Skeleton lines={3} label={t('dataset.loadingAi')} />;
  if (results.error) return <div className="inline-error"><Alert tone="danger">{t('dataset.aiFailed', { error: results.error })}</Alert></div>;
  // Rows are worded here, at render, so they follow the screen language.
  const items = (results.data ?? []).map((row) => ({ ...row, name: row.linkId ? t('dataset.waterResult', { id: row.linkId }) : row.name, model: row.modelId ? aiModelLabel(row.modelId, lang) : '—' }));
  if (!items.length) return <EmptyState title={t('dataset.noAiTitle')} text={t('dataset.noAiText')} action={<ButtonAnchor href={viewerHref(datasetId)} target="_blank" rel="noopener noreferrer" variant="secondary">{t('dataset.runInViewer')}<span className="sr-only">{t('shell.newTab')}</span></ButtonAnchor>} />;
  return (
    <div className="xc-table-wrap">
      <table className="xc-table">
        <thead><tr><th scope="col">{t('dataset.result')}</th><th scope="col">{t('dataset.model')}</th><th scope="col" className="hide-sm">{t('app.requested')}</th><th scope="col">{t('app.status')}</th><th scope="col"><span className="sr-only">{t('app.actions')}</span></th></tr></thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.key}>
              <td><span className="xc-cell-main"><strong>{row.datacubeId && row.status === 'SUCCEEDED' ? <Link to={`/app/data/${encodeURIComponent(row.datacubeId)}`}>{row.name}</Link> : row.name}</strong><small><Badge tone="result">{t('kinds.ai')}</Badge></small></span></td>
              <td>{row.model}</td>
              <td className="hide-sm">{formatDate(row.createdAt, lang)}</td>
              <td><AiStatusBadge status={row.status} /></td>
              <td className="num">{row.status === 'SUCCEEDED' && <a className="xc-btn xc-btn--ghost xc-btn--sm" href={aiViewerHref(datasetId, row.key.startsWith('link:') ? row.datacubeId ?? '' : row.key)} target="_blank" rel="noopener noreferrer" aria-label={t('app.compareInViewerNamed', { name: row.name })}>{t('app.compareShort')}</a>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
