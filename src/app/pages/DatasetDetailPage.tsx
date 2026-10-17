import { ArrowLeft, ExternalLink, FolderPlus, Lock, SearchX, Trash2, Unlink } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Alert, Button, ButtonAnchor, ButtonLink, LockedButton } from '../../components/ui';
import { NEEDS, useRoleGate } from '../../auth/roles';
import { Badge, BadgeTone, Card, ConfirmDialog, EmptyState, PageHeader, Skeleton, TabPanel, Tabs, useToast } from '../../components/ui/kit';
import { isExample } from '../../api/examples';
import { ai, aiViewerHref, appApi, canEditProject, formatDateTime, fusion, generation, isOwned, periodLabel, Project, viewerHref, ZarrDataset } from '../api';
import { AiFacts, aiFactsOf, aiPeriod, shortDateTime, thresholdText } from '../aiFacts';
import { asFusionRequest } from '../fusion';
import { aiModelLabel, elapsed, FusionRequestSummary, jobStatusLabel, jobTypeLabel, JobInputSummary, JobStatusBadge, JobSteps } from '../jobs';
import type { AiWaterJob } from '../../api/aiApi';
import type { JobSummary } from '../../api/generationApi';
import { useLoad } from '../useLoad';
import { dateOnly, pairLine } from '../wizard/sarModel';
import { DatasetStatus, DeleteDatasetDialog, LinkProjectDialog, NoValue, RoleBadge } from './DataLibraryPage';
import { translate, useLanguage } from '../../i18n';
import type { Lang } from '../../i18n';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
// The management screens' text (UR-53 stage 2) loads with these pages, not with the main bundle.
import '../../i18n/app';

type Tab = 'overview' | 'variables' | 'history' | 'ai' | 'projects';
const TABS: Tab[] = ['overview', 'variables', 'history', 'ai', 'projects'];
// The OSM preview (and OpenLayers behind it) loads only when an overview with an extent opens.
const ExtentMap = lazy(() => import('./ExtentMap'));

/**
 * Small extent sketch: the dataset bbox inside a padded lon/lat frame. The drawing is capped at 240px high and
 * the corner labels are HTML (fixed 11.5px), so neither grows with a wide column. Its label follows the screen
 * language unless `lang` is given (the add-data wizard uses it too). With `basemap` (S5 overview) an OSM map of
 * the same extent replaces the sketch once OpenLayers has loaded; the sketch stays when it cannot.
 */
export function BBoxMap({ bbox, lang: given, basemap }: { bbox: [number, number, number, number]; lang?: Lang; basemap?: boolean }) {
  const screenLang = useLanguage().lang;
  const lang = given ?? screenLang;
  const [west, south, east, north] = bbox;
  const padX = Math.max((east - west) * 0.6, 0.05);
  const padY = Math.max((north - south) * 0.6, 0.05);
  const frame = { w: west - padX, e: east + padX, s: south - padY, n: north + padY };
  const width = 480;
  const height = 240;
  const x = (lon: number) => ((lon - frame.w) / (frame.e - frame.w)) * width;
  const y = (lat: number) => ((frame.n - lat) / (frame.n - frame.s)) * height;
  const ticks = [0.25, 0.5, 0.75];
  const label = translate(lang, 'dataset.extentAria', { west: west.toFixed(4), east: east.toFixed(4), south: south.toFixed(4), north: north.toFixed(4) });
  const sketch = (
    <svg className="bbox-map" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <g className="grid">
        {ticks.map((ratio) => <line key={`v${ratio}`} x1={width * ratio} y1={0} x2={width * ratio} y2={height} vectorEffect="non-scaling-stroke" />)}
        {ticks.map((ratio) => <line key={`h${ratio}`} x1={0} y1={height * ratio} x2={width} y2={height * ratio} vectorEffect="non-scaling-stroke" />)}
      </g>
      <rect className="area" x={x(west)} y={y(north)} width={Math.max(2, x(east) - x(west))} height={Math.max(2, y(south) - y(north))} vectorEffect="non-scaling-stroke" />
    </svg>
  );
  return (
    <figure className="bbox-figure">
      {basemap ? <Suspense fallback={sketch}><ExtentMap bbox={bbox} label={label} fallback={sketch} /></Suspense> : sketch}
      {/* Corners of the extent itself (south-west, north-east). */}
      <figcaption className="bbox-figure__labels" aria-hidden>
        <span>{west.toFixed(2)}°E, {south.toFixed(2)}°N</span>
        <span>{east.toFixed(2)}°E, {north.toFixed(2)}°N</span>
      </figcaption>
    </figure>
  );
}

/** The job behind a dataset (generation, band math or AI), or null when it was registered from a path. */
function jobOf(dataset: ZarrDataset): Promise<JobSummary | null> {
  const id = dataset.generationJobId;
  if (!id) return Promise.resolve(null);
  const request = dataset.kind === 'FUSION' ? fusion.getJob(id) : dataset.kind === 'AI_RESULT' ? ai.getJob(id) : generation.jobSummary(id);
  return request.catch(() => null);
}

/** Pixel size the job asked for: metres (GEE, satellite products) or degrees (GeoTIFF·CAS500·Shapefile files). */
function resolutionOf(job: JobSummary | null, lang: Lang) {
  const input = job?.input ?? {};
  const params = (input.params as Record<string, unknown> | undefined) ?? {};
  if (input.scaleMeters != null) return `${input.scaleMeters} m`;
  if (params.resolution != null && (job?.type === 'SENTINEL2_L2A' || job?.type === 'LANDSAT_C2L2')) return `${params.resolution} m`;
  if (params.resolution != null) return translate(lang, 'dataset.resolutionDegrees', { value: String(params.resolution) });
  return '';
}

/** S5: one dataset's metadata, variables, AI results and project links. */
export default function DatasetDetailPage() {
  const { datasetId = '' } = useParams();
  const navigate = useNavigate();
  const dataset = useLoad(() => appApi.getDataset(datasetId), [datasetId]);
  const { t } = useLanguage();
  // UR-59: linking and deleting need PROJECT_USER; below that the buttons stay, off, with the reason.
  const locked = useRoleGate().reason(NEEDS.createData);
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
  const [linkedAt, setLinkedAt] = useState(0);
  const toast = useToast();
  const back = <Link className="page-back" to="/app/data"><ArrowLeft size={16} aria-hidden />{t('titles.data')}</Link>;

  if (dataset.loading && !dataset.data) return <div className="page-stack">{back}<Card><Skeleton lines={6} label={t('dataset.loading')} /></Card></div>;
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
  // Example data (UX1) is read-only for everyone: no project link, no delete.
  const example = isExample(item);
  const isAiResult = item.kind === 'AI_RESULT';
  const viewerLink = isAiResult && item.sourceDatacubeId ? aiViewerHref(item.sourceDatacubeId, item.id) : viewerHref(item.id);
  return (
    <div className="page-stack">
      <PageHeader
        back={back}
        title={item.name}
        description={<span className="head-tags">{example ? <Badge>{t('examples.tag')}</Badge> : !owned && <Badge tone="water">{t('app.shared')}</Badge>}{item.kind === 'FUSION' ? <Badge tone="water">{t('kinds.fusion')}</Badge> : item.kind === 'AI_RESULT' ? <Badge tone="result">{t('kinds.ai')}</Badge> : item.kind === 'COMPARISON' ? <Badge tone="result">{t('datasetFacts.kinds.compare')}</Badge> : <Badge>{t('kinds.original')}</Badge>}<DatasetStatus dataset={item} quiet /><span className="xc-hint">{item.xcubeDatasetId}</span>{isAiResult && item.sourceDatacubeId && <span>{t('dataset.sourceData')} <Link to={`/app/data/${encodeURIComponent(item.sourceDatacubeId)}`}>{t('dataset.viewSource', { id: item.sourceDatacubeId })}</Link></span>}</span>}
        actions={
          <>
            <ButtonAnchor href={viewerLink} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} aria-hidden />{isAiResult ? t('app.compareInViewer') : t('app.openInViewer')}<span className="sr-only">{t('shell.newTab')}</span></ButtonAnchor>
            {!example && (locked
              ? <LockedButton variant="secondary" reason={locked}><FolderPlus size={16} aria-hidden />{t('app.linkToProject')}</LockedButton>
              : <Button variant="secondary" onClick={() => setLinking(true)}><FolderPlus size={16} aria-hidden />{t('app.linkToProject')}</Button>)}
            {owned && !example && (locked
              ? <LockedButton variant="ghost" reason={locked} label={t('dataset.deleteLabel')}><Trash2 size={16} aria-hidden />{t('app.delete')}</LockedButton>
              : <Button variant="ghost" onClick={() => setDeleting(true)} aria-label={t('dataset.deleteLabel')}><Trash2 size={16} aria-hidden />{t('app.delete')}</Button>)}
          </>
        }
      />
      <Card>
        <div className="sheet-tabs">
          <Tabs label={t('dataset.tabsLabel')} idPrefix="dataset-detail" value={tab} onChange={setTab} items={[
            { id: 'overview', label: t('dataset.tabs.overview') },
            { id: 'variables', label: t('dataset.tabs.variables'), count: item.variables.length },
            { id: 'history', label: t('dataset.tabs.history') },
            ...(isAiResult ? [] : [{ id: 'ai' as Tab, label: t('dataset.tabs.ai') }]),
            { id: 'projects', label: t('dataset.tabs.projects') },
          ]} />
        </div>
        <TabPanel idPrefix="dataset-detail" value={tab}>
          {tab === 'overview' && <Overview item={item} />}
          {tab === 'variables' && (item.variables.length ? (
            <div className="xc-table-wrap">
              <table className="xc-table xc-table--cards">
                <thead><tr><th scope="col">{t('app.name')}</th><th scope="col">{t('dataset.title')}</th><th scope="col">{t('dataset.units')}</th><th scope="col">{t('dataset.defaultShown')}</th></tr></thead>
                <tbody>
                  {item.variables.map((name) => (
                    <tr key={name}>
                      <td className="cell-main"><strong>{name}</strong></td>
                      <td data-label={t('dataset.title')}>{item.variableMetadata?.[name]?.title || <NoValue label={t('app.noValue')} />}</td>
                      <td data-label={t('dataset.units')}>{item.variableMetadata?.[name]?.units || <NoValue label={t('app.noValue')} />}</td>
                      <td>{name === item.defaultVariable ? <Badge tone="primary">{t('dataset.default')}</Badge> : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState title={t('dataset.noVariablesTitle')} text={t('dataset.noVariablesText')} />)}
          {tab === 'history' && (item.kind === 'FUSION' ? <FusionHistory dataset={item} /> : isAiResult ? <AiHistory dataset={item} /> : <GenerationHistory jobId={item.generationJobId} />)}
          {tab === 'ai' && <AiResults datasetId={item.id} />}
          {tab === 'projects' && <DatasetProjects dataset={item} reloadKey={linkedAt} onLink={() => setLinking(true)} onToast={toast.show} />}
        </TabPanel>
      </Card>
      {deleting && <DeleteDatasetDialog dataset={item} onClose={() => setDeleting(false)} onDeleted={() => navigate('/app/data', { replace: true })} />}
      {linking && <LinkProjectDialog dataset={item} onClose={() => setLinking(false)} onLinked={(project) => { setLinking(false); setLinkedAt((value) => value + 1); toast.show(t('app.linkedToProject', { name: project.name })); }} />}
      {toast.node}
    </div>
  );
}

/** 개요: where (OSM extent), what (kind, owner, period, variables) and how it was made (method, time, resolution). */
function Overview({ item }: { item: ZarrDataset }) {
  const { lang, t } = useLanguage();
  const job = useLoad(() => jobOf(item), [item.id, item.generationJobId]);
  const data = job.data;
  const pending = job.loading && !data;
  const fromJob = (value: string) => (pending ? <span className="xc-hint">{t('dataset.metaLoading')}</span> : value || <NoValue label={t('app.noValue')} />);
  const method = data ? jobTypeLabel(data.type, lang) : item.generationJobId ? '' : t('dataset.methodRegistered');
  return (
    <div className={item.bbox ? 'detail-overview' : undefined}>
      {item.bbox && <BBoxMap bbox={item.bbox} lang={lang} basemap />}
      <dl className="meta-list">
        {/* The kind is the tag in the header; here it is who owns it. */}
        <dt>{t('dataset.owner')}</dt><dd>{isExample(item) ? t('examples.owner') : isOwned(item) ? t('dataset.ownerMe') : t('dataset.ownerOther')}</dd>
        <dt>{t('app.period')}</dt><dd className="tabular">{periodLabel(item, lang)}</dd>
        <dt>{t('dataset.timeCount')}</dt><dd className="tabular">{item.times.length}</dd>
        <dt>{t('dataset.method')}</dt><dd>{pending ? fromJob('') : method || <NoValue label={t('app.noValue')} />}</dd>
        <dt>{t('dataset.createdAt')}</dt><dd className="tabular">{fromJob(data?.createdAt ? formatDateTime(data.createdAt, lang) : '')}</dd>
        <dt>{t('dataset.resolution')}</dt><dd className="tabular">{fromJob(resolutionOf(data, lang))}</dd>
        <dt>{t('dataset.crs')}</dt><dd>EPSG:4326</dd>
        <dt>{t('dataset.extent')}</dt><dd className="tabular">{item.bbox ? t('app.extentValue', { west: item.bbox[0].toFixed(4), east: item.bbox[2].toFixed(4), south: item.bbox[1].toFixed(4), north: item.bbox[3].toFixed(4) }) : '—'}</dd>
        <dt>{t('dataset.defaultVariable')}</dt><dd>{item.defaultVariable || '—'}</dd>
        <dt>{t('dataset.rgb')}</dt><dd>{item.rgbAvailable ? t('dataset.rgbYes') : '—'}</dd>
        <dt>{t('dataset.datasetId')}</dt><dd>{item.xcubeDatasetId || '—'}</dd>
        <dt>{t('dataset.synced')}</dt><dd className="tabular">{item.updatedAt ? formatDateTime(item.updatedAt, lang) : '—'}</dd>
        {item.pairs && <><dt>{t('dataset.radarPairs')}</dt><dd><ul className="pair-list tabular" aria-label={t('dataset.pairsLabel')}>{item.pairs.map((pair, index) => <li key={pair.time ?? index}>{pair.time ? <strong>{dateOnly(pair.time)}</strong> : null} {pairLine(pair, lang)}</li>)}</ul></dd></>}
      </dl>
    </div>
  );
}

type LinkedProject = Project & { sharedWith?: number };

/** 프로젝트·공유: every project this dataset is linked to, the user's role there and how many people it is shared with. */
function DatasetProjects({ dataset, reloadKey, onLink, onToast }: { dataset: ZarrDataset; reloadKey: number; onLink: () => void; onToast: (text: string) => void }) {
  const { t } = useLanguage();
  // There is no "projects of a dataset" call: read each project's list (projects are few) and keep the ones that hold it.
  const linked = useLoad(async (): Promise<LinkedProject[]> => {
    const projects = await appApi.listProjects();
    const lists = await Promise.allSettled(projects.map((project) => appApi.projectDatasets(project.id)));
    const holding = projects.filter((_, index) => { const list = lists[index]; return list.status === 'fulfilled' && list.value.some((item) => item.id === dataset.id); });
    // Members are visible to the owner only.
    const members = await Promise.allSettled(holding.map((project) => (project.accessRole === 'OWNER' ? appApi.members(project.id) : Promise.reject(new Error('owner only')))));
    return holding.map((project, index) => {
      const list = members[index];
      return { ...project, sharedWith: list.status === 'fulfilled' ? list.value.filter((member) => member.role !== 'OWNER').length : undefined };
    });
  }, [dataset.id, reloadKey]);
  const [unlinking, setUnlinking] = useState<LinkedProject | null>(null);
  const locked = useRoleGate().reason(NEEDS.createData);
  const unlink = async (project: LinkedProject) => {
    await appApi.unlinkDataset(project.id, dataset.id);
    linked.setData((items) => items?.filter((item) => item.id !== project.id) ?? null);
    setUnlinking(null);
    onToast(t('projects.unlinked'));
  };
  const items = linked.data ?? [];
  return (
    <>
      <div className="toolbar">
        <span className="xc-hint">{isExample(dataset) ? t('examples.noLink') : t('dataset.shareHint')}</span>
        <span className="toolbar__spacer" />
        {isExample(dataset) ? null : locked
          ? <LockedButton size="sm" variant="secondary" showReason reason={locked}><FolderPlus size={16} aria-hidden />{t('app.linkToProject')}</LockedButton>
          : <Button size="sm" variant="secondary" onClick={onLink}><FolderPlus size={16} aria-hidden />{t('app.linkToProject')}</Button>}
      </div>
      {linked.loading && !linked.data ? <Skeleton lines={3} label={t('dataset.loadingProjects')} /> : linked.error ? (
        <div className="inline-error"><Alert tone="danger">{t('dataset.projectsFailed', { error: linked.error })}</Alert><Button variant="line" size="sm" onClick={linked.reload} className="inline-error__retry">{t('common.retry')}</Button></div>
      ) : !items.length ? (
        <EmptyState title={t('dataset.noProjectsTitle')} text={t('dataset.noProjectsText')} />
      ) : (
        <div className="xc-table-wrap">
          <table className="xc-table xc-table--cards">
            <thead><tr><th scope="col">{t('data.project')}</th><th scope="col">{t('dataset.myRole')}</th><th scope="col">{t('dataset.sharedWith')}</th><th scope="col"><span className="sr-only">{t('app.actions')}</span></th></tr></thead>
            <tbody>
              {items.map((project) => (
                <tr key={project.id}>
                  <td className="cell-main"><span className="xc-cell-main"><Link to={`/app/projects/${encodeURIComponent(project.id)}`}>{project.name}</Link>{project.description && <small>{project.description}</small>}</span></td>
                  <td data-label={t('dataset.myRole')}><RoleBadge role={project.accessRole} /></td>
                  <td data-label={t('dataset.sharedWith')} className="tabular">{project.sharedWith != null ? t('dataset.people', { count: project.sharedWith }) : <span className="xc-hint">{t('dataset.ownerSees')}</span>}</td>
                  <td className="cell-actions">
                    <div className="row-actions">
                      {canEditProject(project) && <button type="button" className="xc-btn xc-btn--ghost xc-btn--sm" aria-disabled={locked ? true : undefined} title={locked || undefined} onClick={locked ? undefined : () => setUnlinking(project)} aria-label={t('dataset.unlinkFrom', { name: project.name })}><Unlink size={14} aria-hidden />{t('projects.unlink')}</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {unlinking && (
        <ConfirmDialog
          title={t('projects.unlinkTitle')}
          description={t('dataset.unlinkText', { name: unlinking.name })}
          confirmLabel={t('projects.unlink')}
          busyLabel={t('projects.unlinkBusy')}
          tone="ink"
          onConfirm={() => unlink(unlinking)}
          onClose={() => setUnlinking(null)}
        />
      )}
    </>
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
    <div className="sheet-pad">
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
    <dl className="meta-list meta-list--flush">
      <dt>{t('dataset.method')}</dt><dd>{method}</dd>
      {job && <><dt>{t('app.status')}</dt><dd><JobStatusBadge job={job} /></dd><dt>{t('app.requested')}</dt><dd className="tabular">{formatDateTime(job.createdAt, lang)}</dd><dt>{t('dataset.duration')}</dt><dd className="tabular">{elapsed(job, Date.now(), lang)}</dd></>}
    </dl>
  );
}

/** 생성 이력 of a fusion result: formula, bindings and rules, and a shortcut to run the same fusion again (FR-FUS-10). */
function FusionHistory({ dataset }: { dataset: ZarrDataset }) {
  const job = useLoad(() => (dataset.generationJobId ? fusion.getJob(dataset.generationJobId).catch(() => null) : Promise.resolve(null)), [dataset.generationJobId]);
  const navigate = useNavigate();
  const { lang, t } = useLanguage();
  const rerunLocked = useRoleGate().reason(NEEDS.createData);
  if (job.loading) return <Skeleton lines={4} label={t('dataset.loadingHistory')} />;
  const data = job.data;
  const request = asFusionRequest(data?.input) ?? asFusionRequest(dataset.fusion);
  if (!request) return <EmptyState title={t('dataset.noFusionTitle')} text={t('dataset.noFusionText')} />;
  return (
    <div className="sheet-pad">
      <JobMeta job={data} method={jobTypeLabel('FUSION', lang)} />
      {data && <JobSteps job={data} />}
      <FusionRequestSummary request={request} />
      <div className="btn-row">
        {rerunLocked
          ? <LockedButton variant="secondary" size="sm" showReason reason={rerunLocked}>{t('dataset.rerun')}</LockedButton>
          : <Button variant="secondary" size="sm" onClick={() => navigate('/app/analysis/fusion', { state: { request } })}>{t('dataset.rerun')}</Button>}
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
    <div className="sheet-pad">
      <JobMeta job={data} method={jobTypeLabel('AI_WATER', lang)} />
      <JobSteps job={data} />
      <JobInputSummary job={data} />
      <div><Link className="xc-btn xc-btn--ghost xc-btn--sm" to="/app/jobs">{t('app.inJobCenter')}</Link></div>
    </div>
  );
}

type AiRow = { key: string; name: string; facts: AiFacts; status: string; datacubeId?: string; linkId?: string };
const AI_STATUS_TONE: Record<string, BadgeTone> = { SUCCEEDED: 'success', FAILED: 'danger', CANCELLED: 'neutral' };
/** Finished statuses as they are; anything else (queued, running, unknown) reads "처리 중". */
function AiStatusBadge({ status }: { status: string }) {
  const { lang } = useLanguage();
  return AI_STATUS_TONE[status] ? <Badge tone={AI_STATUS_TONE[status]}>{jobStatusLabel(status, lang)}</Badge> : <Badge tone="warning">{jobStatusLabel('RUNNING', lang)}</Badge>;
}

/**
 * AI results of a source dataset: AI service jobs first, then Backoffice links the AI service does not know.
 * Same-name results differ by model, period, threshold and time made, so each has its own column (the Viewer's
 * result rows read "기간 · 임계값 · 만든 시각" in the same words).
 */
function AiResults({ datasetId }: { datasetId: string }) {
  const { lang, t } = useLanguage();
  const results = useLoad(async () => {
    const [jobs, links] = await Promise.allSettled([ai.listJobs({ datacubeId: datasetId }), appApi.getAiResults(datasetId)]);
    if (jobs.status === 'rejected' && links.status === 'rejected') throw links.reason;
    const rows: AiRow[] = (jobs.status === 'fulfilled' ? jobs.value : []).map((job: AiWaterJob) => ({
      key: job.id, name: job.name, facts: aiFactsOf(job),
      status: job.status, datacubeId: job.registration?.datacubeId != null ? String(job.registration.datacubeId) : undefined,
    }));
    for (const link of links.status === 'fulfilled' ? links.value : [])
      if (!rows.some((row) => row.datacubeId && row.datacubeId === link.outputDatacubeId))
        rows.push({ key: `link:${link.id}`, name: '', facts: {}, linkId: String(link.id), status: link.status, datacubeId: link.outputDatacubeId });
    return rows;
  }, [datasetId]);
  if (results.loading && !results.data) return <Skeleton lines={3} label={t('dataset.loadingAi')} />;
  if (results.error) return <div className="inline-error"><Alert tone="danger">{t('dataset.aiFailed', { error: results.error })}</Alert></div>;
  // Rows are worded here, at render, so they follow the screen language.
  const items = (results.data ?? []).map((row) => ({ ...row, name: row.linkId ? t('dataset.waterResult', { id: row.linkId }) : row.name }));
  if (!items.length) return <EmptyState title={t('dataset.noAiTitle')} text={t('dataset.noAiText')} action={<ButtonAnchor href={viewerHref(datasetId)} target="_blank" rel="noopener noreferrer" variant="secondary">{t('dataset.runInViewer')}<span className="sr-only">{t('shell.newTab')}</span></ButtonAnchor>} />;
  const none = <NoValue label={t('app.noValue')} />;
  return (
    <div className="xc-table-wrap">
      <table className="xc-table xc-table--cards">
        <thead>
          <tr>
            <th scope="col">{t('dataset.result')}</th>
            <th scope="col">{t('dataset.model')}</th>
            <th scope="col">{t('app.period')}</th>
            <th scope="col" className="num">{t('dataset.threshold')}</th>
            <th scope="col">{t('dataset.made')}</th>
            <th scope="col">{t('app.status')}</th>
            <th scope="col"><span className="sr-only">{t('app.actions')}</span></th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.key}>
              <td className="cell-main"><span className="xc-cell-main"><strong>{row.datacubeId && row.status === 'SUCCEEDED' ? <Link to={`/app/data/${encodeURIComponent(row.datacubeId)}`}>{row.name}</Link> : row.name}</strong></span></td>
              <td data-label={t('dataset.model')}>{row.facts.modelId ? aiModelLabel(row.facts.modelId, lang) : none}</td>
              <td data-label={t('app.period')} className="tabular">{row.linkId ? none : aiPeriod(row.facts, lang)}</td>
              <td data-label={t('dataset.threshold')} className="num">{row.facts.threshold != null ? thresholdText(row.facts.threshold) : row.linkId ? none : <span className="xc-hint">{t('jobs.input.modelDefault')}</span>}</td>
              <td data-label={t('dataset.made')} className="date">{shortDateTime(row.facts.createdAt, undefined, lang) || none}</td>
              <td><AiStatusBadge status={row.status} /></td>
              <td className="cell-actions">{row.status === 'SUCCEEDED' && <a className="xc-btn xc-btn--ghost xc-btn--sm" href={aiViewerHref(datasetId, row.key.startsWith('link:') ? row.datacubeId ?? '' : row.key)} target="_blank" rel="noopener noreferrer" aria-label={t('app.compareInViewerNamed', { name: row.name })}>{t('app.compareShort')}</a>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
