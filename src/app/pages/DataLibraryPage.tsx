import { Database, ExternalLink, FolderPlus, Plus, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Button, ButtonLink } from '../../components/ui';
import { Badge, Card, Dialog, EmptyState, PageHeader, Skeleton, TabPanel, Tabs, useToast } from '../../components/ui/kit';
import { userMessage } from '../../api/httpClient';
import { aiViewerHref, appApi, canEditProject, isOwned, periodLabel, Project, viewerHref, ZarrDataset } from '../api';
import { useLoad } from '../useLoad';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

type Scope = 'all' | 'owned' | 'shared';
type Sort = 'recent' | 'name' | 'period';

/**
 * Status tag from "INTEGRATION · AVAILABILITY" (Backoffice) or demo text.
 * `quiet` (lists) shows only the exceptions: nothing while the dataset is usable.
 */
export function DatasetStatus({ dataset, quiet }: { dataset: ZarrDataset; quiet?: boolean }) {
  const text = dataset.subtitle ?? '';
  if (/UNAVAILABLE|FAILED|ERROR/i.test(text)) return <Badge tone="danger">사용 불가</Badge>;
  if (/AVAILABLE|READY/i.test(text)) return quiet ? null : <Badge tone="success">사용 가능</Badge>;
  if (/PENDING|SYNC|REGISTERED|QUEUED|RUNNING/i.test(text)) return <Badge tone="warning">동기화 중</Badge>;
  if (quiet) return null;
  return <Badge>{text || '—'}</Badge>;
}

const SCOPES: Scope[] = ['all', 'owned', 'shared'];
const SORTS: Sort[] = ['recent', 'name', 'period'];
const pick = <T extends string>(value: string | null, allowed: T[], fallback: T) => (allowed.includes(value as T) ? (value as T) : fallback);

/** S3: all Zarr datasets the user owns or received. */
export default function DataLibraryPage() {
  useDocumentTitle('데이터');
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
    if (sort === 'name') return [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    if (sort === 'period') return [...filtered].sort((a, b) => (b.times.at(-1)?.iso ?? '').localeCompare(a.times.at(-1)?.iso ?? ''));
    return filtered;
  }, [items, scope, query, sort]);

  return (
    <div className="page-stack">
      <PageHeader title="데이터" description="내가 만든 데이터큐브와 공유받은 데이터큐브입니다." actions={<ButtonLink to="/app/data/new"><Plus size={16} aria-hidden />데이터 추가</ButtonLink>} />
      <Card>
        <div className="sheet-tabs">
          <Tabs label="데이터 구분" idPrefix="data-scope" value={scope} onChange={setScope} items={[{ id: 'all', label: '전체', count: counts.all }, { id: 'owned', label: '내 데이터', count: counts.owned }, { id: 'shared', label: '공유받음', count: counts.shared }]} />
        </div>
        <TabPanel idPrefix="data-scope" value={scope}>
        <div className="toolbar">
          <label className="toolbar__search">
            <Search size={16} aria-hidden />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름·데이터 ID·프로젝트 검색" aria-label="데이터 검색" />
          </label>
          <span className="toolbar__spacer" />
          <label className="xc-check">
            <span className="sr-only">정렬</span>
            <select className="xc-select" value={sort} onChange={(event) => setSort(event.target.value as Sort)} aria-label="정렬">
              <option value="recent">최근 등록순</option>
              <option value="name">이름순</option>
              <option value="period">최근 관측순</option>
            </select>
          </label>
        </div>
        {datasets.loading ? (
          <Skeleton lines={5} label="데이터 목록을 불러오는 중" />
        ) : datasets.error ? (
          <div className="inline-error">
            <Alert tone="danger">데이터 목록을 불러오지 못했습니다. {datasets.error}</Alert>
            <Button variant="line" size="sm" onClick={datasets.reload} className="inline-error__retry">다시 시도</Button>
          </div>
        ) : !items.length ? (
          <EmptyState icon={<Database size={22} />} title="아직 데이터가 없습니다" text="위성 영상, Shapefile, GEE 자료로 데이터큐브를 만들거나 이미 있는 Zarr를 등록하세요." action={<ButtonLink to="/app/data/new"><Plus size={16} aria-hidden />데이터 추가</ButtonLink>} />
        ) : !visible.length ? (
          <EmptyState icon={<Search size={22} />} title="검색 결과가 없습니다" text="검색어나 구분을 바꿔 보세요." action={<Button variant="secondary" onClick={() => { setQueryState(''); setParams((current) => { const next = new URLSearchParams(current); next.delete('q'); next.delete('scope'); return next; }, { replace: true }); }}>조건 초기화</Button>} />
        ) : (
          <div className="xc-table-wrap">
            <table className="xc-table xc-table--cards">
              <thead>
                <tr>
                  <th scope="col">이름</th>
                  <th scope="col" className="hide-sm">기간</th>
                  <th scope="col" className="num hide-sm">시점</th>
                  <th scope="col" className="num hide-sm">변수</th>
                  <th scope="col" className="hide-sm">프로젝트</th>
                  <th scope="col">상태</th>
                  <th scope="col"><span className="sr-only">동작</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={item.id}>
                    <td className="cell-main"><span className="xc-cell-main"><Link to={`/app/data/${encodeURIComponent(item.id)}`}>{item.name}</Link><small>{!isOwned(item) && <Badge tone="water">공유받음</Badge>} {item.kind === 'FUSION' && <Badge tone="water">융합 결과</Badge>}{item.kind === 'AI_RESULT' && <Badge tone="result">AI 결과</Badge>} {item.xcubeDatasetId}{item.kind === 'AI_RESULT' && item.sourceDatacubeId && <> · 원본 <Link to={`/app/data/${encodeURIComponent(item.sourceDatacubeId)}`}>{items.find((source) => source.id === item.sourceDatacubeId)?.name ?? `#${item.sourceDatacubeId}`}</Link></>}</small></span></td>
                    <td className="hide-sm tabular">{periodLabel(item)}</td>
                    <td className="num hide-sm">{item.times.length}</td>
                    <td className="num hide-sm">{item.variables.length}</td>
                    <td className="hide-sm">{item.projectName || <span className="xc-hint">프로젝트 없음</span>}</td>
                    <td><DatasetStatus dataset={item} quiet /></td>
                    <td className="cell-actions">
                      <div className="row-actions">
                        <a className="xc-icon-btn" href={item.kind === 'AI_RESULT' && item.sourceDatacubeId ? aiViewerHref(item.sourceDatacubeId, item.id) : viewerHref(item.id)} target="_blank" rel="noopener noreferrer" aria-label={`${item.name} Viewer에서 열기 (새 탭)`} title="Viewer에서 열기"><ExternalLink size={16} aria-hidden /></a>
                        <button type="button" className="xc-icon-btn" aria-label={`${item.name} 프로젝트에 연결`} title="프로젝트에 연결" onClick={() => setLinking(item)}><FolderPlus size={16} aria-hidden /></button>
                        <button type="button" className="xc-icon-btn" aria-label={`${item.name} 삭제`} title={isOwned(item) ? '삭제' : '공유받은 데이터는 삭제할 수 없습니다'} disabled={!isOwned(item)} onClick={() => setDeleting(item)}><Trash2 size={16} aria-hidden /></button>
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
            toast.show('데이터를 삭제했습니다.');
          }}
        />
      )}
      {linking && <LinkProjectDialog dataset={linking} onClose={() => setLinking(null)} onLinked={(project) => { setLinking(null); toast.show(`“${project.name}” 프로젝트에 연결했습니다.`); }} />}
      {toast.node}
    </div>
  );
}

export function DeleteDatasetDialog({ dataset, onClose, onDeleted }: { dataset: ZarrDataset; onClose: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      await appApi.deleteDataset(dataset.id);
      onDeleted();
    } catch (cause) {
      setError(userMessage(cause));
      setBusy(false);
    }
  };
  return (
    <Dialog
      role="alertdialog"
      size="sm"
      title="데이터를 삭제할까요?"
      description={<>“{dataset.name}” 원본이 삭제되고 모든 프로젝트 연결과 공유에서도 사라집니다. 되돌릴 수 없습니다.</>}
      onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>취소</Button><Button variant="danger" disabled={busy} onClick={remove}>{busy ? '삭제 중…' : '삭제'}</Button></>}
    >
      {error ? <Alert tone="danger">{error}</Alert> : undefined}
    </Dialog>
  );
}

/** Links a dataset to one of the projects the user can edit. Linking never moves or copies data. */
export function LinkProjectDialog({ dataset, onClose, onLinked }: { dataset: ZarrDataset; onClose: () => void; onLinked: (project: Project) => void }) {
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
      setError(userMessage(cause));
      setBusy(false);
    }
  };
  return (
    <Dialog
      size="sm"
      title="프로젝트에 연결"
      description={<>“{dataset.name}”을 프로젝트 목록에 추가합니다. 데이터는 이동하거나 복사되지 않습니다.</>}
      onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>취소</Button><Button disabled={busy || !chosen} onClick={link}>{busy ? '연결 중…' : '연결'}</Button></>}
    >
      {projects.loading ? (
        <Skeleton lines={2} label="프로젝트를 불러오는 중" />
      ) : projects.error ? (
        <Alert tone="danger">{projects.error}</Alert>
      ) : editable.length ? (
        <label className="xc-field">
          <span className="xc-label">프로젝트</span>
          <select className="xc-select" value={chosen?.id ?? ''} onChange={(event) => setProjectId(event.target.value)}>
            {editable.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
      ) : (
        <Alert>편집 권한이 있는 프로젝트가 없습니다. 프로젝트를 먼저 만드세요.</Alert>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
    </Dialog>
  );
}
