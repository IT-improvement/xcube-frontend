import { ArrowLeft, Database, ExternalLink, FolderKanban, Link2, Lock, Pencil, Plus, Search, SearchX, Trash2, Unlink } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { userMessage } from '../../api/httpClient';
import { Alert, Button, TextField } from '../../components/ui';
import { Badge, Card, Dialog, EmptyState, PageHeader, Skeleton, Tabs, useToast } from '../../components/ui/kit';
import { useAuth } from '../../auth/AuthProvider';
import { appApi, canEditProject, formatDate, isOwned, memberLabel, MemberRole, Project, ProjectMember, roleLabel, viewerHref, ZarrDataset } from '../api';
import { useLoad } from '../useLoad';
import { DatasetStatus } from './DataLibraryPage';

type Scope = 'all' | 'owned' | 'shared';

function RoleBadge({ role }: { role?: string }) {
  return <Badge tone={role === 'OWNER' ? 'primary' : role === 'EDITOR' ? 'success' : 'neutral'}>{roleLabel(role)}</Badge>;
}

/** S6 list: project cards with search and owned/shared filter. */
export function ProjectsPage() {
  const projects = useLoad(() => appApi.listProjects());
  const [scope, setScope] = useState<Scope>('all');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const items = useMemo(() => projects.data ?? [], [projects.data]);
  const visible = items.filter((project) =>
    (scope === 'all' || (scope === 'owned' ? project.accessRole === 'OWNER' : project.accessRole !== 'OWNER')) &&
    [project.name, project.description].some((text) => text?.toLowerCase().includes(query.trim().toLowerCase())));
  return (
    <div className="page-stack">
      <PageHeader title="프로젝트" description="데이터큐브를 목적별로 묶고 팀과 공유합니다. 프로젝트는 데이터 목록(참조)만 담습니다." actions={<Button onClick={() => setCreating(true)}><Plus size={16} aria-hidden />새 프로젝트</Button>} />
      <div className="toolbar" style={{ padding: 0, border: 0 }}>
        <label className="toolbar__search">
          <Search size={16} aria-hidden />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="프로젝트 검색" aria-label="프로젝트 검색" />
        </label>
        <div className="segmented" role="group" aria-label="프로젝트 구분">
          {(['all', 'owned', 'shared'] as Scope[]).map((value) => (
            <button key={value} type="button" aria-pressed={scope === value} onClick={() => setScope(value)}>{value === 'all' ? '전체' : value === 'owned' ? '내 프로젝트' : '공유받음'}</button>
          ))}
        </div>
      </div>
      {projects.loading ? (
        <Card><Skeleton lines={4} label="프로젝트를 불러오는 중" /></Card>
      ) : projects.error ? (
        <Card><div className="inline-error"><Alert tone="danger">프로젝트를 불러오지 못했습니다. {projects.error}</Alert><Button variant="secondary" size="sm" onClick={projects.reload} style={{ marginTop: 12 }}>다시 시도</Button></div></Card>
      ) : !items.length ? (
        <Card><EmptyState icon={<FolderKanban size={22} />} title="프로젝트가 없습니다" text="목적별로 데이터큐브를 묶을 프로젝트를 만들어 보세요." action={<Button onClick={() => setCreating(true)}><Plus size={16} aria-hidden />새 프로젝트</Button>} /></Card>
      ) : !visible.length ? (
        <Card><EmptyState icon={<Search size={22} />} title="검색 결과가 없습니다" /></Card>
      ) : (
        <div className="project-grid">
          {visible.map((project) => (
            <Link key={project.id} className="project-card" to={`/app/projects/${encodeURIComponent(project.id)}`}>
              <div className="project-card__top">
                <span className="project-card__name">{project.name}</span>
                <RoleBadge role={project.accessRole} />
              </div>
              <p className="project-card__desc">{project.description || '설명 없음'}</p>
              <div className="project-card__foot">
                <span>{project.ownerUsername ? `소유자 ${project.ownerUsername}` : ''}</span>
                <span>수정 {formatDate(project.updatedAt ?? project.createdAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
      {creating && <ProjectFormDialog onClose={() => setCreating(false)} onSaved={(project) => navigate(`/app/projects/${encodeURIComponent(project.id)}`)} />}
    </div>
  );
}

function ProjectFormDialog({ project, onClose, onSaved }: { project?: Project; onClose: () => void; onSaved: (project: Project) => void }) {
  const [name, setName] = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) { setError('프로젝트 이름을 입력하세요.'); return; }
    setBusy(true);
    setError('');
    try {
      const input = { name: name.trim(), description };
      onSaved(project ? await appApi.updateProject(project.id, input) : await appApi.createProject(input));
    } catch (cause) {
      setError(userMessage(cause));
      setBusy(false);
    }
  };
  return (
    <Dialog title={project ? '프로젝트 편집' : '새 프로젝트'} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>취소</Button><Button type="submit" form="project-form" disabled={busy}>{busy ? '저장 중…' : project ? '저장' : '만들기'}</Button></>}>
      <form id="project-form" onSubmit={submit} style={{ display: 'grid', gap: 16 }}>
        <TextField label="이름" value={name} maxLength={150} required onChange={(event) => setName(event.target.value)} />
        <label className="xc-field">
          <span className="xc-label">설명 <span className="xc-hint">(선택)</span></span>
          <textarea className="xc-textarea" value={description} maxLength={5000} onChange={(event) => setDescription(event.target.value)} />
          <span className="xc-hint" style={{ justifySelf: 'end' }}>{description.length} / 5000</span>
        </label>
        {error && <Alert tone="danger">{error}</Alert>}
      </form>
    </Dialog>
  );
}

type DetailTab = 'data' | 'members';

/** S6 detail: linked datasets and members. */
export function ProjectDetailPage() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const project = useLoad(() => appApi.getProject(projectId), [projectId]);
  const [tab, setTab] = useState<DetailTab>('data');
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();
  const back = <Link className="page-back" to="/app/projects"><ArrowLeft size={16} aria-hidden />프로젝트</Link>;
  if (project.loading) return <div className="page-stack">{back}<Card><Skeleton lines={5} label="프로젝트를 불러오는 중" /></Card></div>;
  if (project.error || !project.data) {
    const forbidden = project.status === 403;
    return (
      <div className="page-stack">{back}
        <Card><EmptyState icon={forbidden ? <Lock size={22} /> : <SearchX size={22} />} title={forbidden ? '이 프로젝트를 볼 권한이 없습니다' : project.status === 404 ? '프로젝트를 찾을 수 없습니다' : '프로젝트를 불러오지 못했습니다'} text={forbidden ? '소유자에게 공유를 요청하세요.' : project.error} action={<Button variant="secondary" onClick={project.reload}>다시 시도</Button>} /></Card>
      </div>
    );
  }
  const current = project.data;
  const owner = current.accessRole === 'OWNER';
  const editable = canEditProject(current);
  return (
    <div className="page-stack">
      <PageHeader
        back={back}
        title={current.name}
        description={<span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><RoleBadge role={current.accessRole} />{current.description || '설명 없음'}</span>}
        actions={<>
          {editable && <Button variant="secondary" onClick={() => setEditing(true)}><Pencil size={16} aria-hidden />편집</Button>}
          {owner && <Button variant="ghost" onClick={() => setDeleting(true)}><Trash2 size={16} aria-hidden />삭제</Button>}
        </>}
      />
      <Card>
        <div style={{ padding: '0 20px' }}>
          <Tabs label="프로젝트 상세" value={tab} onChange={setTab} items={[{ id: 'data', label: '데이터' }, { id: 'members', label: '멤버' }]} />
        </div>
        <div role="tabpanel">
          {tab === 'data' ? <ProjectData project={current} editable={editable} onToast={toast.show} /> : <ProjectMembers project={current} owner={owner} onToast={toast.show} />}
        </div>
      </Card>
      {editing && <ProjectFormDialog project={current} onClose={() => setEditing(false)} onSaved={(saved) => { project.setData(() => ({ ...current, ...saved })); setEditing(false); toast.show('변경사항을 저장했습니다.'); }} />}
      {deleting && <DeleteProjectDialog project={current} onClose={() => setDeleting(false)} onDeleted={() => navigate('/app/projects', { replace: true })} />}
      {toast.node}
    </div>
  );
}

function DeleteProjectDialog({ project, onClose, onDeleted }: { project: Project; onClose: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const remove = async () => {
    setBusy(true);
    try { await appApi.deleteProject(project.id); onDeleted(); }
    catch (cause) { setError(userMessage(cause)); setBusy(false); }
  };
  return (
    <Dialog role="alertdialog" size="sm" title="프로젝트를 삭제할까요?" description={<>“{project.name}” 프로젝트와 연결 정보가 삭제됩니다. <strong>연결된 데이터큐브 원본은 삭제되지 않습니다.</strong></>} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>취소</Button><Button variant="danger" disabled={busy} onClick={remove}>{busy ? '삭제 중…' : '프로젝트 삭제'}</Button></>}>
      {error ? <Alert tone="danger">{error}</Alert> : undefined}
    </Dialog>
  );
}

function ProjectData({ project, editable, onToast }: { project: Project; editable: boolean; onToast: (text: string) => void }) {
  const linked = useLoad(() => appApi.projectDatasets(project.id), [project.id]);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState('');
  const unlink = async (dataset: ZarrDataset) => {
    if (!window.confirm(`“${dataset.name}” 연결을 해제할까요? 프로젝트에서만 빠지고 데이터 원본은 삭제되지 않습니다.`)) return;
    setError('');
    try {
      await appApi.unlinkDataset(project.id, dataset.id);
      linked.setData((items) => items?.filter((item) => item.id !== dataset.id) ?? null);
      onToast('연결을 해제했습니다.');
    } catch (cause) { setError(userMessage(cause)); }
  };
  const items = linked.data ?? [];
  return (
    <>
      <div className="toolbar">
        <span className="xc-hint">데이터는 이동하거나 복사되지 않고 프로젝트 목록에만 추가됩니다.</span>
        <span className="toolbar__spacer" />
        {editable && <Button size="sm" onClick={() => setPicking(true)}><Link2 size={16} aria-hidden />데이터 연결</Button>}
      </div>
      {error && <div className="inline-error"><Alert tone="danger">{error}</Alert></div>}
      {linked.loading ? <Skeleton lines={3} label="연결된 데이터를 불러오는 중" /> : linked.error ? (
        <div className="inline-error"><Alert tone="danger">{linked.error}</Alert></div>
      ) : !items.length ? (
        <EmptyState icon={<Database size={22} />} title="연결된 데이터가 없습니다" text={editable ? '데이터 연결로 내 데이터큐브를 추가하세요.' : '편집 권한이 있는 멤버가 데이터를 연결할 수 있습니다.'} />
      ) : (
        <div className="xc-table-wrap">
          <table className="xc-table">
            <thead><tr><th scope="col">이름</th><th scope="col">상태</th><th scope="col"><span className="sr-only">동작</span></th></tr></thead>
            <tbody>
              {items.map((dataset) => (
                <tr key={dataset.id}>
                  <td><span className="xc-cell-main"><Link to={`/app/data/${encodeURIComponent(dataset.id)}`}>{dataset.name}</Link><small>{dataset.xcubeDatasetId}</small></span></td>
                  <td><DatasetStatus dataset={dataset} /></td>
                  <td>
                    <div className="row-actions">
                      <a className="xc-icon-btn" href={viewerHref(dataset.id)} target="_blank" rel="noopener noreferrer" aria-label={`${dataset.name} Viewer에서 열기 (새 탭)`} title="Viewer에서 열기"><ExternalLink size={16} aria-hidden /></a>
                      {editable && <button type="button" className="xc-btn xc-btn--ghost xc-btn--sm" onClick={() => unlink(dataset)} aria-label={`${dataset.name} 연결 해제`}><Unlink size={14} aria-hidden />연결 해제</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {picking && (
        <LinkDatasetDialog
          linkedIds={items.map((item) => item.id)}
          onClose={() => setPicking(false)}
          onLink={async (dataset) => {
            await appApi.linkDataset(project.id, dataset.id);
            linked.setData((current) => (current?.some((item) => item.id === dataset.id) ? current : [...(current ?? []), dataset]));
            onToast(`“${dataset.name}”을 연결했습니다.`);
          }}
        />
      )}
    </>
  );
}

function LinkDatasetDialog({ linkedIds, onClose, onLink }: { linkedIds: string[]; onClose: () => void; onLink: (dataset: ZarrDataset) => Promise<void> }) {
  const candidates = useLoad(() => appApi.linkableDatasets());
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const visible = (candidates.data ?? []).filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase()));
  const link = async (dataset: ZarrDataset) => {
    setBusyId(dataset.id);
    setError('');
    try { await onLink(dataset); } catch (cause) { setError(userMessage(cause)); } finally { setBusyId(''); }
  };
  return (
    <Dialog title="데이터 연결" description="프로젝트에 추가할 데이터큐브를 고르세요." onClose={onClose} footer={<Button variant="secondary" onClick={onClose}>닫기</Button>}>
      <label className="toolbar__search" style={{ maxWidth: 'none' }}>
        <Search size={16} aria-hidden />
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="데이터 검색" aria-label="연결할 데이터 검색" />
      </label>
      {error && <Alert tone="danger">{error}</Alert>}
      {candidates.loading ? <Skeleton lines={3} /> : candidates.error ? <Alert tone="danger">{candidates.error}</Alert> : (
        <div className="picker-list">
          {visible.map((dataset) => {
            const isLinked = linkedIds.includes(dataset.id);
            return (
              <div className="picker-row" key={dataset.id}>
                <span className="xc-cell-main"><strong>{dataset.name}</strong><small>{isOwned(dataset) ? '내 데이터' : '공유받음'} · {dataset.subtitle}</small></span>
                <Button size="sm" variant={isLinked ? 'ghost' : 'secondary'} disabled={isLinked || busyId === dataset.id} onClick={() => link(dataset)}>{isLinked ? '연결됨' : busyId === dataset.id ? '연결 중…' : '연결'}</Button>
              </div>
            );
          })}
          {!visible.length && <p className="xc-hint">연결할 수 있는 데이터가 없습니다.</p>}
        </div>
      )}
    </Dialog>
  );
}

function ProjectMembers({ project, owner, onToast }: { project: Project; owner: boolean; onToast: (text: string) => void }) {
  const members = useLoad<ProjectMember[]>(() => (owner ? appApi.members(project.id) : Promise.resolve([])), [project.id, owner]);
  const { user } = useAuth();
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<MemberRole>('VIEWER');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!owner) return <EmptyState icon={<Lock size={22} />} title="소유자만 멤버를 관리할 수 있습니다" text="멤버 추가와 권한 변경은 프로젝트 소유자에게 요청하세요." />;
  const add = async (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim()) { setError('공유할 사람의 로그인 아이디를 입력하세요.'); return; }
    setBusy(true);
    setError('');
    try {
      const member = await appApi.addMember(project.id, { username: username.trim(), role }) as ProjectMember;
      members.setData((items) => [...(items ?? []).filter((item) => item.userId !== member.userId), member]);
      setUsername('');
      onToast(`${memberLabel(member)}님을 추가했습니다.`);
    } catch (cause) {
      const status = (cause as { status?: number })?.status;
      setError(status === 404 ? '해당 아이디의 사용자가 없습니다. 아이디를 정확히 입력했는지 확인하세요.'
        : status === 429 ? '조회가 너무 많습니다. 1분 뒤 다시 시도하세요.'
        : status === 503 ? '사용자 조회 서버에 연결할 수 없습니다. 잠시 후 다시 시도하세요.'
        : userMessage(cause));
    } finally { setBusy(false); }
  };
  const change = async (member: ProjectMember, next: MemberRole) => {
    setError('');
    try {
      const saved = await appApi.updateMember(project.id, member.userId, next);
      members.setData((items) => items?.map((item) => (item.userId === member.userId ? { ...item, ...saved } as ProjectMember : item)) ?? null);
      onToast('권한을 변경했습니다.');
    } catch (cause) { setError(userMessage(cause)); }
  };
  const remove = async (member: ProjectMember) => {
    if (!window.confirm(`${memberLabel(member)}의 프로젝트 접근 권한을 제거할까요?`)) return;
    setError('');
    try {
      await appApi.removeMember(project.id, member.userId);
      members.setData((items) => items?.filter((item) => item.userId !== member.userId) ?? null);
      onToast('멤버를 제거했습니다.');
    } catch (cause) { setError(userMessage(cause)); }
  };
  const items = members.data ?? [];
  return (
    <>
      <form className="member-form" onSubmit={add}>
        <TextField label="상대 로그인 아이디" help="상대가 로그인할 때 쓰는 아이디를 정확히 입력하세요." value={username} autoComplete="off" placeholder="예: kim" maxLength={150} onChange={(event) => setUsername(event.target.value)} />
        <label className="xc-field">
          <span className="xc-label">권한</span>
          <select className="xc-select" value={role} onChange={(event) => setRole(event.target.value as MemberRole)}>
            <option value="VIEWER">보기</option>
            <option value="EDITOR">편집</option>
          </select>
        </label>
        <Button type="submit" disabled={busy} style={{ height: 40 }}>{busy ? '추가 중…' : '멤버 추가'}</Button>
      </form>
      {error && <div className="inline-error"><Alert tone="danger">{error}</Alert></div>}
      {members.loading ? <Skeleton lines={3} label="멤버를 불러오는 중" /> : members.error ? (
        <div className="inline-error"><Alert tone="danger">{members.error}</Alert></div>
      ) : (
        <div className="xc-table-wrap">
          <table className="xc-table">
            <thead><tr><th scope="col">사용자</th><th scope="col">권한</th><th scope="col" className="hide-sm">추가일</th><th scope="col"><span className="sr-only">동작</span></th></tr></thead>
            <tbody>
              {items.map((member) => (
                <tr key={member.userId}>
                  <td><strong>{member.role === 'OWNER' && String(user?.id) === member.userId ? `${user?.name ?? '나'} (나)` : memberLabel(member)}</strong></td>
                  <td>{member.role === 'OWNER' ? <RoleBadge role="OWNER" /> : (
                    <select className="xc-select" style={{ width: 110, height: 34 }} aria-label={`${memberLabel(member)} 권한`} value={member.role} onChange={(event) => change(member, event.target.value as MemberRole)}>
                      <option value="VIEWER">보기</option>
                      <option value="EDITOR">편집</option>
                    </select>
                  )}</td>
                  <td className="hide-sm">{formatDate(member.createdAt)}</td>
                  <td className="num">{member.role !== 'OWNER' && <button type="button" className="xc-btn xc-btn--ghost xc-btn--sm" onClick={() => remove(member)} aria-label={`${memberLabel(member)} 제거`}>제거</button>}</td>
                </tr>
              ))}
              {!items.length && <tr><td colSpan={4} className="xc-hint">아직 공유한 사용자가 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
