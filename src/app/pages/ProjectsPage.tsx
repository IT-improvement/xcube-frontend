import { ArrowLeft, Database, ExternalLink, FolderKanban, Link2, Lock, Pencil, Plus, Search, SearchX, Trash2, Unlink } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { userMessage } from '../../api/httpClient';
import { Alert, Button, TextField } from '../../components/ui';
import { Badge, Card, ConfirmDialog, Dialog, EmptyState, PageHeader, Skeleton, TabPanel, Tabs, useToast } from '../../components/ui/kit';
import { useAuth } from '../../auth/AuthProvider';
import { appApi, canEditProject, formatDate, isOwned, memberLabel, MemberRole, Project, ProjectMember, roleLabel, viewerHref, ZarrDataset } from '../api';
import { useLoad } from '../useLoad';
import { DatasetStatus } from './DataLibraryPage';
import { useLanguage } from '../../i18n';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
// The management screens' text (UR-53 stage 2) loads with these pages, not with the main bundle.
import '../../i18n/app';

type Scope = 'all' | 'owned' | 'shared';

function RoleBadge({ role }: { role?: string }) {
  const { lang } = useLanguage();
  return <Badge tone={role === 'OWNER' ? 'primary' : role === 'EDITOR' ? 'success' : 'neutral'}>{roleLabel(role, lang)}</Badge>;
}

/** S6 list: project cards with search and owned/shared filter. */
export function ProjectsPage() {
  const { lang, t } = useLanguage();
  useDocumentTitle(t('titles.projects'));
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
      <PageHeader title={t('titles.projects')} description={t('projects.description')} actions={<Button onClick={() => setCreating(true)}><Plus size={16} aria-hidden />{t('projects.new')}</Button>} />
      <div className="toolbar" style={{ padding: 0, border: 0 }}>
        <label className="toolbar__search">
          <Search size={16} aria-hidden />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('projects.search')} aria-label={t('projects.search')} />
        </label>
        <div className="segmented" role="group" aria-label={t('projects.scopeLabel')}>
          {(['all', 'owned', 'shared'] as Scope[]).map((value) => (
            <button key={value} type="button" aria-pressed={scope === value} onClick={() => setScope(value)}>{t(value === 'all' ? 'app.all' : value === 'owned' ? 'projects.mine' : 'app.shared')}</button>
          ))}
        </div>
      </div>
      {projects.loading ? (
        <Card><Skeleton lines={4} label={t('projects.loading')} /></Card>
      ) : projects.error ? (
        <Card><div className="inline-error"><Alert tone="danger">{t('projects.listFailed', { error: projects.error })}</Alert><Button variant="secondary" size="sm" onClick={projects.reload} style={{ marginTop: 12 }}>{t('common.retry')}</Button></div></Card>
      ) : !items.length ? (
        <Card><EmptyState icon={<FolderKanban size={22} />} title={t('projects.emptyTitle')} text={t('projects.emptyText')} action={<Button onClick={() => setCreating(true)}><Plus size={16} aria-hidden />{t('projects.new')}</Button>} /></Card>
      ) : !visible.length ? (
        <Card><EmptyState icon={<Search size={22} />} title={t('projects.noResults')} /></Card>
      ) : (
        <div className="project-grid">
          {visible.map((project) => (
            <Link key={project.id} className="project-card" to={`/app/projects/${encodeURIComponent(project.id)}`}>
              <div className="project-card__top">
                <span className="project-card__name">{project.name}</span>
                <RoleBadge role={project.accessRole} />
              </div>
              <p className="project-card__desc">{project.description || t('app.noDescription')}</p>
              <div className="project-card__foot">
                <span>{project.ownerUsername ? t('projects.owner', { name: project.ownerUsername }) : ''}</span>
                <span>{t('projects.updated', { date: formatDate(project.updatedAt ?? project.createdAt, lang) })}</span>
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
  const { lang, t } = useLanguage();
  const [name, setName] = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) { setError(t('projects.nameRequired')); return; }
    setBusy(true);
    setError('');
    try {
      const input = { name: name.trim(), description };
      onSaved(project ? await appApi.updateProject(project.id, input) : await appApi.createProject(input));
    } catch (cause) {
      setError(userMessage(cause, lang));
      setBusy(false);
    }
  };
  return (
    <Dialog title={project ? t('projects.editTitle') : t('projects.new')} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" form="project-form" disabled={busy}>{busy ? t('projects.saving') : project ? t('projects.save') : t('projects.create')}</Button></>}>
      <form id="project-form" onSubmit={submit} style={{ display: 'grid', gap: 16 }}>
        <TextField label={t('projects.name')} value={name} maxLength={150} required onChange={(event) => setName(event.target.value)} />
        <label className="xc-field">
          <span className="xc-label">{t('projects.descriptionLabel')} <span className="xc-hint">{t('projects.optional')}</span></span>
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
  const { t } = useLanguage();
  useDocumentTitle(project.data?.name ? t('titles.projectNamed', { name: project.data.name }) : t('titles.projects'));
  const [tab, setTab] = useState<DetailTab>('data');
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();
  const back = <Link className="page-back" to="/app/projects"><ArrowLeft size={16} aria-hidden />{t('titles.projects')}</Link>;
  if (project.loading) return <div className="page-stack">{back}<Card><Skeleton lines={5} label={t('projects.loading')} /></Card></div>;
  if (project.error || !project.data) {
    const forbidden = project.status === 403;
    return (
      <div className="page-stack">{back}
        <Card><EmptyState icon={forbidden ? <Lock size={22} /> : <SearchX size={22} />} title={forbidden ? t('projects.forbiddenTitle') : project.status === 404 ? t('projects.missingTitle') : t('projects.failedTitle')} text={forbidden ? t('dataset.askOwner') : project.error} action={<Button variant="secondary" onClick={project.reload}>{t('common.retry')}</Button>} /></Card>
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
        description={<span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><RoleBadge role={current.accessRole} />{current.description || t('app.noDescription')}</span>}
        actions={<>
          {editable && <Button variant="secondary" onClick={() => setEditing(true)}><Pencil size={16} aria-hidden />{t('projects.edit')}</Button>}
          {owner && <Button variant="ghost" onClick={() => setDeleting(true)}><Trash2 size={16} aria-hidden />{t('app.delete')}</Button>}
        </>}
      />
      <Card>
        <div style={{ padding: '0 20px' }}>
          <Tabs label={t('projects.tabsLabel')} idPrefix="project-detail" value={tab} onChange={setTab} items={[{ id: 'data', label: t('projects.tabData') }, { id: 'members', label: t('projects.tabMembers') }]} />
        </div>
        <TabPanel idPrefix="project-detail" value={tab}>
          {tab === 'data' ? <ProjectData project={current} editable={editable} onToast={toast.show} /> : <ProjectMembers project={current} owner={owner} onToast={toast.show} />}
        </TabPanel>
      </Card>
      {editing && <ProjectFormDialog project={current} onClose={() => setEditing(false)} onSaved={(saved) => { project.setData(() => ({ ...current, ...saved })); setEditing(false); toast.show(t('projects.saved')); }} />}
      {deleting && <DeleteProjectDialog project={current} onClose={() => setDeleting(false)} onDeleted={() => navigate('/app/projects', { replace: true })} />}
      {toast.node}
    </div>
  );
}

function DeleteProjectDialog({ project, onClose, onDeleted }: { project: Project; onClose: () => void; onDeleted: () => void }) {
  const { lang, t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const remove = async () => {
    setBusy(true);
    try { await appApi.deleteProject(project.id); onDeleted(); }
    catch (cause) { setError(userMessage(cause, lang)); setBusy(false); }
  };
  return (
    <Dialog role="alertdialog" size="sm" title={t('projects.deleteTitle')} description={<>{t('projects.deleteText', { name: project.name })} <strong>{t('projects.deleteKeepsData')}</strong></>} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button variant="danger" disabled={busy} onClick={remove}>{busy ? t('app.deleting') : t('projects.deleteConfirm')}</Button></>}>
      {error ? <Alert tone="danger">{error}</Alert> : undefined}
    </Dialog>
  );
}

function ProjectData({ project, editable, onToast }: { project: Project; editable: boolean; onToast: (text: string) => void }) {
  const { t } = useLanguage();
  const linked = useLoad(() => appApi.projectDatasets(project.id), [project.id]);
  const [picking, setPicking] = useState(false);
  const [unlinking, setUnlinking] = useState<ZarrDataset | null>(null);
  // Errors stay in the confirmation dialog (ConfirmDialog shows them).
  const unlink = async (dataset: ZarrDataset) => {
    await appApi.unlinkDataset(project.id, dataset.id);
    linked.setData((items) => items?.filter((item) => item.id !== dataset.id) ?? null);
    setUnlinking(null);
    onToast(t('projects.unlinked'));
  };
  const items = linked.data ?? [];
  return (
    <>
      <div className="toolbar">
        <span className="xc-hint">{t('projects.dataHint')}</span>
        <span className="toolbar__spacer" />
        {editable && <Button size="sm" onClick={() => setPicking(true)}><Link2 size={16} aria-hidden />{t('projects.linkData')}</Button>}
      </div>
      {linked.loading ? <Skeleton lines={3} label={t('projects.loadingLinked')} /> : linked.error ? (
        <div className="inline-error"><Alert tone="danger">{linked.error}</Alert></div>
      ) : !items.length ? (
        <EmptyState icon={<Database size={22} />} title={t('projects.noLinkedTitle')} text={editable ? t('projects.noLinkedEditable') : t('projects.noLinkedReadonly')} />
      ) : (
        <div className="xc-table-wrap">
          <table className="xc-table">
            <thead><tr><th scope="col">{t('app.name')}</th><th scope="col">{t('app.status')}</th><th scope="col"><span className="sr-only">{t('app.actions')}</span></th></tr></thead>
            <tbody>
              {items.map((dataset) => (
                <tr key={dataset.id}>
                  <td><span className="xc-cell-main"><Link to={`/app/data/${encodeURIComponent(dataset.id)}`}>{dataset.name}</Link><small>{dataset.xcubeDatasetId}</small></span></td>
                  <td><DatasetStatus dataset={dataset} /></td>
                  <td>
                    <div className="row-actions">
                      <a className="xc-icon-btn" href={viewerHref(dataset.id)} target="_blank" rel="noopener noreferrer" aria-label={t('app.openInViewerNamed', { name: dataset.name })} title={t('app.openInViewer')}><ExternalLink size={16} aria-hidden /></a>
                      {editable && <button type="button" className="xc-btn xc-btn--ghost xc-btn--sm" onClick={() => setUnlinking(dataset)} aria-label={t('projects.unlinkNamed', { name: dataset.name })}><Unlink size={14} aria-hidden />{t('projects.unlink')}</button>}
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
            onToast(t('projects.linked', { name: dataset.name }));
          }}
        />
      )}
      {unlinking && (
        <ConfirmDialog
          title={t('projects.unlinkTitle')}
          description={t('projects.unlinkText', { name: unlinking.name })}
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

function LinkDatasetDialog({ linkedIds, onClose, onLink }: { linkedIds: string[]; onClose: () => void; onLink: (dataset: ZarrDataset) => Promise<void> }) {
  const { lang, t } = useLanguage();
  const candidates = useLoad(() => appApi.linkableDatasets());
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const visible = (candidates.data ?? []).filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase()));
  const link = async (dataset: ZarrDataset) => {
    setBusyId(dataset.id);
    setError('');
    try { await onLink(dataset); } catch (cause) { setError(userMessage(cause, lang)); } finally { setBusyId(''); }
  };
  return (
    <Dialog title={t('projects.linkData')} description={t('projects.linkDialogText')} onClose={onClose} footer={<Button variant="secondary" onClick={onClose}>{t('common.close')}</Button>}>
      <label className="toolbar__search" style={{ maxWidth: 'none' }}>
        <Search size={16} aria-hidden />
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('projects.linkSearch')} aria-label={t('projects.linkSearchLabel')} />
      </label>
      {error && <Alert tone="danger">{error}</Alert>}
      {candidates.loading ? <Skeleton lines={3} /> : candidates.error ? <Alert tone="danger">{candidates.error}</Alert> : (
        <div className="picker-list">
          {visible.map((dataset) => {
            const isLinked = linkedIds.includes(dataset.id);
            return (
              <div className="picker-row" key={dataset.id}>
                <span className="xc-cell-main"><strong>{dataset.name}</strong><small>{isOwned(dataset) ? t('app.mine') : t('app.shared')} · {dataset.subtitle}</small></span>
                <Button size="sm" variant={isLinked ? 'ghost' : 'secondary'} disabled={isLinked || busyId === dataset.id} onClick={() => link(dataset)}>{isLinked ? t('projects.alreadyLinked') : busyId === dataset.id ? t('app.linking') : t('app.link')}</Button>
              </div>
            );
          })}
          {!visible.length && <p className="xc-hint">{t('projects.nothingToLink')}</p>}
        </div>
      )}
    </Dialog>
  );
}

function ProjectMembers({ project, owner, onToast }: { project: Project; owner: boolean; onToast: (text: string) => void }) {
  const members = useLoad<ProjectMember[]>(() => (owner ? appApi.members(project.id) : Promise.resolve([])), [project.id, owner]);
  const { user } = useAuth();
  const { lang, t } = useLanguage();
  const label = (member: ProjectMember) => memberLabel(member, lang);
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<MemberRole>('VIEWER');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<ProjectMember | null>(null);
  if (!owner) return <EmptyState icon={<Lock size={22} />} title={t('members.ownerOnlyTitle')} text={t('members.ownerOnlyText')} />;
  const add = async (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim()) { setError(t('members.usernameRequired')); return; }
    setBusy(true);
    setError('');
    try {
      const member = await appApi.addMember(project.id, { username: username.trim(), role }) as ProjectMember;
      members.setData((items) => [...(items ?? []).filter((item) => item.userId !== member.userId), member]);
      setUsername('');
      onToast(t('members.added', { name: label(member) }));
    } catch (cause) {
      const status = (cause as { status?: number })?.status;
      setError(status === 404 ? t('members.userNotFound')
        : status === 429 ? t('members.tooMany')
        : status === 503 ? t('members.lookupDown')
        : userMessage(cause, lang));
    } finally { setBusy(false); }
  };
  const change = async (member: ProjectMember, next: MemberRole) => {
    setError('');
    try {
      const saved = await appApi.updateMember(project.id, member.userId, next);
      members.setData((items) => items?.map((item) => (item.userId === member.userId ? { ...item, ...saved } as ProjectMember : item)) ?? null);
      onToast(t('members.roleChanged'));
    } catch (cause) { setError(userMessage(cause, lang)); }
  };
  const remove = async (member: ProjectMember) => {
    await appApi.removeMember(project.id, member.userId);
    members.setData((items) => items?.filter((item) => item.userId !== member.userId) ?? null);
    setRemoving(null);
    onToast(t('members.removed'));
  };
  const items = members.data ?? [];
  return (
    <>
      <form className="member-form" onSubmit={add}>
        <TextField label={t('members.username')} help={t('members.usernameHelp')} value={username} autoComplete="off" placeholder={t('members.placeholder')} maxLength={150} onChange={(event) => setUsername(event.target.value)} />
        <label className="xc-field">
          <span className="xc-label">{t('members.role')}</span>
          <select className="xc-select" value={role} onChange={(event) => setRole(event.target.value as MemberRole)}>
            <option value="VIEWER">{t('roles.VIEWER')}</option>
            <option value="EDITOR">{t('roles.EDITOR')}</option>
          </select>
        </label>
        <Button type="submit" disabled={busy} className="member-form__submit">{busy ? t('members.adding') : t('members.add')}</Button>
      </form>
      {error && <div className="inline-error"><Alert tone="danger">{error}</Alert></div>}
      {members.loading ? <Skeleton lines={3} label={t('members.loading')} /> : members.error ? (
        <div className="inline-error"><Alert tone="danger">{members.error}</Alert></div>
      ) : (
        <div className="xc-table-wrap">
          <table className="xc-table">
            <thead><tr><th scope="col">{t('members.user')}</th><th scope="col">{t('members.role')}</th><th scope="col" className="hide-sm">{t('members.addedOn')}</th><th scope="col"><span className="sr-only">{t('app.actions')}</span></th></tr></thead>
            <tbody>
              {items.map((member) => (
                <tr key={member.userId}>
                  <td><strong>{member.role === 'OWNER' && String(user?.id) === member.userId ? t('members.me', { name: user?.name ?? t('members.meFallback') }) : label(member)}</strong></td>
                  <td>{member.role === 'OWNER' ? <RoleBadge role="OWNER" /> : (
                    <select className="xc-select" style={{ width: 110 }} aria-label={t('members.roleOf', { name: label(member) })} value={member.role} onChange={(event) => change(member, event.target.value as MemberRole)}>
                      <option value="VIEWER">{t('roles.VIEWER')}</option>
                      <option value="EDITOR">{t('roles.EDITOR')}</option>
                    </select>
                  )}</td>
                  <td className="hide-sm">{formatDate(member.createdAt, lang)}</td>
                  <td className="num">{member.role !== 'OWNER' && <button type="button" className="xc-btn xc-btn--ghost xc-btn--sm" onClick={() => setRemoving(member)} aria-label={t('members.removeNamed', { name: label(member) })}>{t('members.remove')}</button>}</td>
                </tr>
              ))}
              {!items.length && <tr><td colSpan={4} className="xc-hint">{t('members.none')}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {removing && (
        <ConfirmDialog
          title={t('members.removeTitle')}
          description={t('members.removeText', { name: label(removing) })}
          confirmLabel={t('members.remove')}
          busyLabel={t('members.removeBusy')}
          onConfirm={() => remove(removing)}
          onClose={() => setRemoving(null)}
        />
      )}
    </>
  );
}
