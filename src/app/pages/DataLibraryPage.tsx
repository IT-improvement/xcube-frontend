import { Database, ExternalLink, FolderPlus, Plus, Search, Trash2 } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Button, ButtonLink, LockedButton, TextField } from '../../components/ui';
import { NEEDS, useRoleGate } from '../../auth/roles';
import { Badge, Card, Dialog, EmptyState, PageHeader, Segmented, Skeleton, TabPanel, Tabs, useToast } from '../../components/ui/kit';
import { userMessage } from '../../api/httpClient';
import { ai, aiViewerHref, appApi, canEditProject, formatDate, isOwned, periodLabel, Project, roleLabel, viewerHref, ZarrDataset } from '../api';
import { aiFactsByResult, aiSubtitle } from '../aiFacts';
import { useLoad } from '../useLoad';
import { useLanguage, useT } from '../../i18n';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
// The management screens' text (UR-53 stage 2) loads with these pages, not with the main bundle.
import '../../i18n/app';

type Scope = 'all' | 'owned' | 'shared';
type Sort = 'recent' | 'name' | 'period';
type Kind = '' | 'original' | 'fusion' | 'ai';

/**
 * Status tag from "INTEGRATION · AVAILABILITY" (Backoffice) or demo text.
 * `quiet` (lists) shows only the exceptions: nothing while the dataset is usable.
 */
export function DatasetStatus({ dataset, quiet }: { dataset: ZarrDataset; quiet?: boolean }) {
  const t = useT();
  const text = dataset.subtitle ?? '';
  if (/UNAVAILABLE|FAILED|ERROR/i.test(text)) return <Badge tone="danger">{t('availability.unavailable')}</Badge>;
  if (/AVAILABLE|READY/i.test(text)) return quiet ? null : <Badge tone="success">{t('availability.available')}</Badge>;
  if (/PENDING|SYNC|REGISTERED|QUEUED|RUNNING/i.test(text)) return <Badge tone="warning">{t('availability.syncing')}</Badge>;
  if (quiet) return null;
  return <Badge>{text || '—'}</Badge>;
}

/** An empty cell: a quiet dash on screen, the words for screen readers. */
export function NoValue({ label }: { label: string }) {
  return <span className="no-value"><span aria-hidden>—</span><span className="sr-only">{label}</span></span>;
}

/** Role in a project: the owner in an ink outline, editor and viewer as plain tags (the word tells them apart, not a status colour). */
export function RoleBadge({ role }: { role?: string }) {
  const { lang } = useLanguage();
  return <Badge tone={role === 'OWNER' ? 'primary' : 'neutral'}>{roleLabel(role, lang)}</Badge>;
}

const SCOPES: Scope[] = ['all', 'owned', 'shared'];
const SORTS: Sort[] = ['recent', 'name', 'period'];
const KINDS: Kind[] = ['', 'original', 'fusion', 'ai'];
const pick = <T extends string>(value: string | null, allowed: T[], fallback: T) => (allowed.includes(value as T) ? (value as T) : fallback);
const kindOf = (item: ZarrDataset): Kind => (item.kind === 'FUSION' ? 'fusion' : item.kind === 'AI_RESULT' ? 'ai' : 'original');

/** S3: all Zarr datasets the user owns or received. */
export default function DataLibraryPage() {
  const { lang, t } = useLanguage();
  useDocumentTitle(t('titles.data'));
  const datasets = useLoad(() => appApi.listDatasets());
  // Scope, kind, search and sort live in the URL so a reload or a shared link keeps them (?scope=shared&kind=ai&q=…&sort=name).
  const [params, setParams] = useSearchParams();
  const scope = pick(params.get('scope'), SCOPES, 'all');
  const kind = pick(params.get('kind'), KINDS, '');
  const sort = pick(params.get('sort'), SORTS, 'recent');
  // The search box keeps its own state (typing stays immediate) and mirrors it into the URL.
  const [query, setQueryState] = useState(() => params.get('q') ?? '');
  const setParam = (key: string, value: string, fallback: string) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value && value !== fallback) next.set(key, value); else next.delete(key);
      return next;
    }, { replace: true });
  const setScope = (value: Scope) => setParam('scope', value, 'all');
  const setKind = (value: Kind) => setParam('kind', value, '');
  const setQuery = (value: string) => { setQueryState(value); setParam('q', value.trim() ? value : '', ''); };
  const setSort = (value: Sort) => setParam('sort', value, 'recent');
  const resetFilters = () => {
    setQueryState('');
    setParams((current) => { const next = new URLSearchParams(current); ['q', 'scope', 'kind'].forEach((key) => next.delete(key)); return next; }, { replace: true });
  };
  const [deleting, setDeleting] = useState<ZarrDataset | null>(null);
  const [linking, setLinking] = useState<ZarrDataset | null>(null);
  const toast = useToast();
  // UR-59: adding, linking and deleting need PROJECT_USER; below that they stay, off, with the reason.
  const locked = useRoleGate().reason(NEEDS.createData);
  const items = useMemo(() => datasets.data ?? [], [datasets.data]);
  // AI results are told apart by model and threshold, which the AI service keeps (loaded only when there are any).
  const hasAi = items.some((item) => item.kind === 'AI_RESULT');
  const aiJobs = useLoad(() => (hasAi ? ai.listJobs().catch(() => []) : Promise.resolve([])), [hasAi]);
  const aiFacts = useMemo(() => aiFactsByResult(aiJobs.data ?? []), [aiJobs.data]);
  const counts = { all: items.length, owned: items.filter(isOwned).length, shared: items.filter((item) => !isOwned(item)).length };
  const inScope = useMemo(() => items.filter((item) => scope === 'all' || (scope === 'owned' ? isOwned(item) : !isOwned(item))), [items, scope]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = inScope.filter((item) =>
      (!kind || kindOf(item) === kind) &&
      (!needle || [item.name, item.xcubeDatasetId, item.projectName].some((text) => text?.toLowerCase().includes(needle))));
    if (sort === 'name') return [...filtered].sort((a, b) => a.name.localeCompare(b.name, lang));
    if (sort === 'period') return [...filtered].sort((a, b) => (b.times.at(-1)?.iso ?? '').localeCompare(a.times.at(-1)?.iso ?? ''));
    return filtered;
  }, [inScope, kind, query, sort, lang]);

  return (
    <div className="page-stack">
      {/* "데이터 추가" lives in the top bar on every page (decision 2), so the header has no button of its own. */}
      <PageHeader title={t('titles.data')} description={t('data.description')} />
      <Card>
        <div className="sheet-tabs">
          <Tabs label={t('data.scopeLabel')} idPrefix="data-scope" value={scope} onChange={setScope} items={[{ id: 'all', label: t('app.all'), count: counts.all }, { id: 'owned', label: t('app.mine'), count: counts.owned }, { id: 'shared', label: t('app.shared'), count: counts.shared }]} />
        </div>
        <TabPanel idPrefix="data-scope" value={scope}>
        <div className="toolbar">
          <label className="toolbar__search">
            <Search size={16} aria-hidden />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('data.searchPlaceholder')} aria-label={t('data.searchLabel')} autoComplete="off" spellCheck={false} />
          </label>
          <Segmented label={t('data.kindLabel')} value={kind} onChange={setKind} items={[
            { id: '', label: t('app.all') }, { id: 'original', label: t('kinds.original') }, { id: 'fusion', label: t('kinds.fusion') }, { id: 'ai', label: t('kinds.ai') },
          ]} />
          <span className="toolbar__spacer" />
          {datasets.data && <span className="xc-hint tabular" aria-live="polite">{visible.length === inScope.length ? t('data.countAll', { count: inScope.length }) : t('data.countOf', { count: visible.length, total: inScope.length })}</span>}
          <label className="xc-check">
            <span className="sr-only">{t('data.sort')}</span>
            <select className="xc-select" value={sort} onChange={(event) => setSort(event.target.value as Sort)} aria-label={t('data.sort')}>
              <option value="recent">{t('data.sortRecent')}</option>
              <option value="name">{t('data.sortName')}</option>
              <option value="period">{t('data.sortPeriod')}</option>
            </select>
          </label>
        </div>
        {datasets.loading && !datasets.data ? (
          <Skeleton lines={5} label={t('data.loading')} />
        ) : datasets.error ? (
          <div className="inline-error">
            <Alert tone="danger">{t('app.dataListFailed', { error: datasets.error })}</Alert>
            <Button variant="line" size="sm" onClick={datasets.reload} className="inline-error__retry">{t('common.retry')}</Button>
          </div>
        ) : !items.length ? (
          <EmptyState icon={<Database size={22} />} title={t('data.emptyTitle')} text={t('data.emptyText')} action={locked ? <LockedButton showReason reason={locked}><Plus size={16} aria-hidden />{t('shell.addData')}</LockedButton> : <ButtonLink to="/app/data/new"><Plus size={16} aria-hidden />{t('shell.addData')}</ButtonLink>} />
        ) : !visible.length ? (
          <EmptyState icon={<Search size={22} />} title={t('data.noResults')} text={t('data.noResultsText')} action={<Button variant="secondary" onClick={resetFilters}>{t('data.reset')}</Button>} />
        ) : (
          <div className="xc-table-wrap">
            <table className="xc-table xc-table--cards">
              <thead>
                <tr>
                  <th scope="col">{t('app.name')}</th>
                  <th scope="col" className="hide-sm">{t('app.period')}</th>
                  <th scope="col" className="num hide-sm">{t('data.times')}</th>
                  <th scope="col" className="num hide-sm">{t('data.variables')}</th>
                  <th scope="col" className="hide-sm">{t('data.project')}</th>
                  <th scope="col">{t('app.updated')}</th>
                  <th scope="col"><span className="sr-only">{t('app.actions')}</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => {
                  const facts = item.kind === 'AI_RESULT' ? aiFacts.get(item.id) : undefined;
                  const sourceName = item.sourceDatacubeId ? items.find((source) => source.id === item.sourceDatacubeId)?.name ?? `#${item.sourceDatacubeId}` : '';
                  return (
                    <tr key={item.id}>
                      <td className="cell-main">
                        <span className="xc-cell-main">
                          <Link to={`/app/data/${encodeURIComponent(item.id)}`}>{item.name}</Link>
                          {/* Tags first (shared, kind, an exception status), then what tells the row apart. */}
                          <small className="cell-sub">
                            {!isOwned(item) && <Badge tone="water">{t('app.shared')}</Badge>}
                            {item.kind === 'FUSION' && <Badge tone="water">{t('kinds.fusion')}</Badge>}
                            {item.kind === 'AI_RESULT' && <Badge tone="result">{t('kinds.ai')}</Badge>}
                            <DatasetStatus dataset={item} quiet />
                            {item.kind === 'AI_RESULT' ? (
                              <span>
                                {facts && aiSubtitle(facts, lang) ? `${aiSubtitle(facts, lang)} · ` : ''}
                                {item.sourceDatacubeId && <>{t('data.source')} <Link to={`/app/data/${encodeURIComponent(item.sourceDatacubeId)}`}>{sourceName}</Link></>}
                              </span>
                            ) : <span>{item.xcubeDatasetId}</span>}
                          </small>
                        </span>
                      </td>
                      <td className="hide-sm tabular">{periodLabel(item, lang)}</td>
                      <td className="num hide-sm">{item.times.length}</td>
                      <td className="num hide-sm">{item.variables.length}</td>
                      <td className="hide-sm">{item.projectName || <NoValue label={t('app.noProject')} />}</td>
                      <td className="date" data-label={t('app.updated')}>{item.updatedAt ? formatDate(item.updatedAt, lang) : <NoValue label={t('app.noDate')} />}</td>
                      <td className="cell-actions">
                        <div className="row-actions">
                          <a className="xc-icon-btn" href={item.kind === 'AI_RESULT' && item.sourceDatacubeId ? aiViewerHref(item.sourceDatacubeId, item.id) : viewerHref(item.id)} target="_blank" rel="noopener noreferrer" aria-label={t('app.openInViewerNamed', { name: item.name })} title={t('app.openInViewer')}><ExternalLink size={16} aria-hidden /></a>
                          <button type="button" className="xc-icon-btn" aria-label={t('data.linkNamed', { name: item.name })} title={locked ? `${t('app.linkToProject')} — ${locked}` : t('app.linkToProject')} aria-disabled={locked ? true : undefined} onClick={locked ? undefined : () => setLinking(item)}><FolderPlus size={16} aria-hidden /></button>
                          <button type="button" className="xc-icon-btn" aria-label={t('data.deleteNamed', { name: item.name })} title={!isOwned(item) ? t('data.cannotDeleteShared') : locked ? `${t('app.delete')} — ${locked}` : t('app.delete')} disabled={!isOwned(item)} aria-disabled={isOwned(item) && locked ? true : undefined} onClick={locked ? undefined : () => setDeleting(item)}><Trash2 size={16} aria-hidden /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        </TabPanel>
      </Card>
      {deleting && (
        <DeleteDatasetDialog
          dataset={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            datasets.setData((current) => current?.filter((item) => item.id !== deleting.id) ?? null);
            setDeleting(null);
            toast.show(t('data.deleted'));
          }}
        />
      )}
      {linking && <LinkProjectDialog dataset={linking} onClose={() => setLinking(null)} onLinked={(project) => { setLinking(null); toast.show(t('app.linkedToProject', { name: project.name })); }} />}
      {toast.node}
    </div>
  );
}

export function DeleteDatasetDialog({ dataset, onClose, onDeleted }: { dataset: ZarrDataset; onClose: () => void; onDeleted: () => void }) {
  const { lang, t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      await appApi.deleteDataset(dataset.id);
      onDeleted();
    } catch (cause) {
      setError(userMessage(cause, lang));
      setBusy(false);
    }
  };
  return (
    <Dialog
      role="alertdialog"
      size="sm"
      title={t('data.deleteTitle')}
      description={t('data.deleteText', { name: dataset.name })}
      onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button variant="danger" disabled={busy} onClick={remove}>{busy ? t('app.deleting') : t('app.delete')}</Button></>}
    >
      {error ? <Alert tone="danger">{error}</Alert> : undefined}
    </Dialog>
  );
}

/**
 * Links a dataset to one of the projects the user can edit, or to a new project made right here (so a user
 * without projects is not stuck). Linking never moves or copies data.
 */
export function LinkProjectDialog({ dataset, onClose, onLinked }: { dataset: ZarrDataset; onClose: () => void; onLinked: (project: Project) => void }) {
  const { lang, t } = useLanguage();
  const projects = useLoad(() => appApi.listProjects());
  const editable = (projects.data ?? []).filter(canEditProject);
  // UR-59: a new project needs PROJECT_MANAGER; a PROJECT_USER can still link to projects they may edit.
  const createLocked = useRoleGate().reason(NEEDS.manageProjects);
  const [projectId, setProjectId] = useState('');
  const [creatingChoice, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [nameError, setNameError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Without an editable project the dialog opens on "new project" directly.
  const creating = !createLocked && (creatingChoice || (!projects.loading && !projects.error && !editable.length));
  const stuck = !!createLocked && !projects.loading && !projects.error && !editable.length;
  const chosen = editable.find((item) => item.id === projectId) ?? editable[0];
  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    setError('');
    if (creating && !newName.trim()) { setNameError(t('projects.nameRequired')); return; }
    if (!creating && !chosen) return;
    setBusy(true);
    try {
      const project = creating ? await appApi.createProject({ name: newName.trim() }) : chosen!;
      await appApi.linkDataset(project.id, dataset.id);
      onLinked(project);
    } catch (cause) {
      setError(userMessage(cause, lang));
      setBusy(false);
    }
  };
  const label = creating ? (busy ? t('data.creatingAndLinking') : t('data.createAndLink')) : (busy ? t('app.linking') : t('app.link'));
  return (
    <Dialog
      size="sm"
      title={t('app.linkToProject')}
      description={t('data.linkText', { name: dataset.name })}
      onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>{!stuck && <Button type="submit" form="link-project-form" disabled={busy || projects.loading || (!creating && !chosen)}>{label}</Button>}</>}
    >
      {projects.loading ? (
        <Skeleton lines={2} label={t('data.loadingProjects')} />
      ) : projects.error ? (
        <Alert tone="danger">{projects.error}</Alert>
      ) : stuck ? (
        <div className="form-stack"><p>{t('gate.noEditableProject')}</p><p className="xc-hint">{t('gate.newProjectNeeds', { reason: createLocked })}</p></div>
      ) : (
        <form id="link-project-form" className="form-stack" onSubmit={submit} noValidate>
          {creating ? (
            <>
              {!editable.length && <p className="xc-hint">{t('data.noEditableProject')}</p>}
              <TextField label={t('data.newProjectName')} value={newName} maxLength={150} autoComplete="off" error={nameError} onChange={(event) => { setNewName(event.target.value); setNameError(''); }} autoFocus />
              {editable.length > 0 && <div><Button variant="quiet" size="sm" onClick={() => { setCreating(false); setNameError(''); }}>{t('data.pickExisting')}</Button></div>}
            </>
          ) : (
            <>
              <label className="xc-field">
                <span className="xc-label">{t('data.project')}</span>
                <select className="xc-select" value={chosen?.id ?? ''} onChange={(event) => setProjectId(event.target.value)}>
                  {editable.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
              </label>
              <div>
                {createLocked
                  ? <LockedButton variant="quiet" size="sm" showReason reason={createLocked}><Plus size={14} aria-hidden />{t('data.newProject')}</LockedButton>
                  : <Button variant="quiet" size="sm" onClick={() => setCreating(true)}><Plus size={14} aria-hidden />{t('data.newProject')}</Button>}
              </div>
            </>
          )}
        </form>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
    </Dialog>
  );
}
