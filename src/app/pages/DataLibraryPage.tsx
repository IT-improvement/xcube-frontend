import { Database, ExternalLink, FolderPlus, Plus, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Button, ButtonLink } from '../../components/ui';
import { Badge, Card, Dialog, EmptyState, PageHeader, Skeleton, TabPanel, Tabs, useToast } from '../../components/ui/kit';
import { userMessage } from '../../api/httpClient';
import { aiViewerHref, appApi, canEditProject, isOwned, periodLabel, Project, viewerHref, ZarrDataset } from '../api';
import { useLoad } from '../useLoad';
import { useLanguage, useT } from '../../i18n';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
// The management screens' text (UR-53 stage 2) loads with these pages, not with the main bundle.
import '../../i18n/app';

type Scope = 'all' | 'owned' | 'shared';
type Sort = 'recent' | 'name' | 'period';

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

const SCOPES: Scope[] = ['all', 'owned', 'shared'];
const SORTS: Sort[] = ['recent', 'name', 'period'];
const pick = <T extends string>(value: string | null, allowed: T[], fallback: T) => (allowed.includes(value as T) ? (value as T) : fallback);

/** S3: all Zarr datasets the user owns or received. */
export default function DataLibraryPage() {
  const { lang, t } = useLanguage();
  useDocumentTitle(t('titles.data'));
  const datasets = useLoad(() => appApi.listDatasets());
  // Scope, search and sort live in the URL so a reload or a shared link keeps them (?scope=shared&q=…&sort=name).
  const [params, setParams] = useSearchParams();
  const scope = pick(params.get('scope'), SCOPES, 'all');
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
  const setQuery = (value: string) => { setQueryState(value); setParam('q', value.trim() ? value : '', ''); };
  const setSort = (value: Sort) => setParam('sort', value, 'recent');
  const [deleting, setDeleting] = useState<ZarrDataset | null>(null);
  const [linking, setLinking] = useState<ZarrDataset | null>(null);
  const toast = useToast();
  const items = useMemo(() => datasets.data ?? [], [datasets.data]);
  const counts = { all: items.length, owned: items.filter(isOwned).length, shared: items.filter((item) => !isOwned(item)).length };
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = items.filter((item) =>
      (scope === 'all' || (scope === 'owned' ? isOwned(item) : !isOwned(item))) &&
      (!needle || [item.name, item.xcubeDatasetId, item.projectName].some((text) => text?.toLowerCase().includes(needle))));
    if (sort === 'name') return [...filtered].sort((a, b) => a.name.localeCompare(b.name, lang));
    if (sort === 'period') return [...filtered].sort((a, b) => (b.times.at(-1)?.iso ?? '').localeCompare(a.times.at(-1)?.iso ?? ''));
    return filtered;
  }, [items, scope, query, sort, lang]);

  return (
    <div className="page-stack">
      <PageHeader title={t('titles.data')} description={t('data.description')} actions={<ButtonLink to="/app/data/new"><Plus size={16} aria-hidden />{t('shell.addData')}</ButtonLink>} />
      <Card>
        <div className="sheet-tabs">
          <Tabs label={t('data.scopeLabel')} idPrefix="data-scope" value={scope} onChange={setScope} items={[{ id: 'all', label: t('app.all'), count: counts.all }, { id: 'owned', label: t('app.mine'), count: counts.owned }, { id: 'shared', label: t('app.shared'), count: counts.shared }]} />
        </div>
        <TabPanel idPrefix="data-scope" value={scope}>
        <div className="toolbar">
          <label className="toolbar__search">
            <Search size={16} aria-hidden />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('data.searchPlaceholder')} aria-label={t('data.searchLabel')} />
          </label>
          <span className="toolbar__spacer" />
          <label className="xc-check">
            <span className="sr-only">{t('data.sort')}</span>
            <select className="xc-select" value={sort} onChange={(event) => setSort(event.target.value as Sort)} aria-label={t('data.sort')}>
              <option value="recent">{t('data.sortRecent')}</option>
              <option value="name">{t('data.sortName')}</option>
              <option value="period">{t('data.sortPeriod')}</option>
            </select>
          </label>
        </div>
        {datasets.loading ? (
          <Skeleton lines={5} label={t('data.loading')} />
        ) : datasets.error ? (
          <div className="inline-error">
            <Alert tone="danger">{t('app.dataListFailed', { error: datasets.error })}</Alert>
            <Button variant="line" size="sm" onClick={datasets.reload} className="inline-error__retry">{t('common.retry')}</Button>
          </div>
        ) : !items.length ? (
          <EmptyState icon={<Database size={22} />} title={t('data.emptyTitle')} text={t('data.emptyText')} action={<ButtonLink to="/app/data/new"><Plus size={16} aria-hidden />{t('shell.addData')}</ButtonLink>} />
        ) : !visible.length ? (
          <EmptyState icon={<Search size={22} />} title={t('data.noResults')} text={t('data.noResultsText')} action={<Button variant="secondary" onClick={() => { setQueryState(''); setParams((current) => { const next = new URLSearchParams(current); next.delete('q'); next.delete('scope'); return next; }, { replace: true }); }}>{t('data.reset')}</Button>} />
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
                  <th scope="col">{t('app.status')}</th>
                  <th scope="col"><span className="sr-only">{t('app.actions')}</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={item.id}>
                    <td className="cell-main"><span className="xc-cell-main"><Link to={`/app/data/${encodeURIComponent(item.id)}`}>{item.name}</Link><small>{!isOwned(item) && <Badge tone="water">{t('app.shared')}</Badge>} {item.kind === 'FUSION' && <Badge tone="water">{t('kinds.fusion')}</Badge>}{item.kind === 'AI_RESULT' && <Badge tone="result">{t('kinds.ai')}</Badge>} {item.xcubeDatasetId}{item.kind === 'AI_RESULT' && item.sourceDatacubeId && <> · {t('data.source')} <Link to={`/app/data/${encodeURIComponent(item.sourceDatacubeId)}`}>{items.find((source) => source.id === item.sourceDatacubeId)?.name ?? `#${item.sourceDatacubeId}`}</Link></>}</small></span></td>
                    <td className="hide-sm tabular">{periodLabel(item, lang)}</td>
                    <td className="num hide-sm">{item.times.length}</td>
                    <td className="num hide-sm">{item.variables.length}</td>
                    <td className="hide-sm">{item.projectName || <span className="xc-hint">{t('app.noProject')}</span>}</td>
                    <td><DatasetStatus dataset={item} quiet /></td>
                    <td className="cell-actions">
                      <div className="row-actions">
                        <a className="xc-icon-btn" href={item.kind === 'AI_RESULT' && item.sourceDatacubeId ? aiViewerHref(item.sourceDatacubeId, item.id) : viewerHref(item.id)} target="_blank" rel="noopener noreferrer" aria-label={t('app.openInViewerNamed', { name: item.name })} title={t('app.openInViewer')}><ExternalLink size={16} aria-hidden /></a>
                        <button type="button" className="xc-icon-btn" aria-label={t('data.linkNamed', { name: item.name })} title={t('app.linkToProject')} onClick={() => setLinking(item)}><FolderPlus size={16} aria-hidden /></button>
                        <button type="button" className="xc-icon-btn" aria-label={t('data.deleteNamed', { name: item.name })} title={isOwned(item) ? t('app.delete') : t('data.cannotDeleteShared')} disabled={!isOwned(item)} onClick={() => setDeleting(item)}><Trash2 size={16} aria-hidden /></button>
                      </div>
                    </td>
                  </tr>
                ))}
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

/** Links a dataset to one of the projects the user can edit. Linking never moves or copies data. */
export function LinkProjectDialog({ dataset, onClose, onLinked }: { dataset: ZarrDataset; onClose: () => void; onLinked: (project: Project) => void }) {
  const { lang, t } = useLanguage();
  const projects = useLoad(() => appApi.listProjects());
  const editable = (projects.data ?? []).filter(canEditProject);
  const [projectId, setProjectId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const chosen = editable.find((item) => item.id === projectId) ?? editable[0];
  const link = async () => {
    if (!chosen) return;
    setBusy(true);
    setError('');
    try {
      await appApi.linkDataset(chosen.id, dataset.id);
      onLinked(chosen);
    } catch (cause) {
      setError(userMessage(cause, lang));
      setBusy(false);
    }
  };
  return (
    <Dialog
      size="sm"
      title={t('app.linkToProject')}
      description={t('data.linkText', { name: dataset.name })}
      onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button disabled={busy || !chosen} onClick={link}>{busy ? t('app.linking') : t('app.link')}</Button></>}
    >
      {projects.loading ? (
        <Skeleton lines={2} label={t('data.loadingProjects')} />
      ) : projects.error ? (
        <Alert tone="danger">{projects.error}</Alert>
      ) : editable.length ? (
        <label className="xc-field">
          <span className="xc-label">{t('data.project')}</span>
          <select className="xc-select" value={chosen?.id ?? ''} onChange={(event) => setProjectId(event.target.value)}>
            {editable.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
      ) : (
        <Alert>{t('data.noEditableProject')}</Alert>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
    </Dialog>
  );
}
