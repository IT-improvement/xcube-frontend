import { ArrowLeft, Database, ExternalLink, FolderKanban, Link2, Lock, Pencil, Plus, Search, SearchX, Trash2, Unlink } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { userMessage } from '../../api/httpClient';
import { Alert, Button, ButtonLink, LockedButton, TextField } from '../../components/ui';
import { NEEDS, useRoleGate } from '../../auth/roles';
import { Card, ConfirmDialog, Dialog, EmptyState, PageHeader, Segmented, Skeleton, TabPanel, Tabs, useToast } from '../../components/ui/kit';
import { useAuth } from '../../auth/AuthProvider';
import { appApi, canEditProject, formatDate, isOwned, memberLabel, MemberRole, Project, ProjectMember, viewerHref, ZarrDataset } from '../api';
import { useLoad } from '../useLoad';
import { DatasetStatus, NoValue, RoleBadge } from './DataLibraryPage';
import { useLanguage } from '../../i18n';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
// The management screens' text (UR-53 stage 2) loads with these pages, not with the main bundle.
import '../../i18n/app';

type Scope = 'all' | 'owned' | 'shared';
const SCOPES: Scope[] = ['all', 'owned', 'shared'];

/** S6 list: a ruled ledger of projects (name, role, owner, updated) with search and an owned/shared filter, both kept in the URL. */
export function ProjectsPage() {
  const { lang, t } = useLanguage();
  useDocumentTitle(t('titles.projects'));
  const projects = useLoad(() => appApi.listProjects());
  // ?scope=owned&q=… so a reload or a shared link keeps the view.
  const [params, setParams] = useSearchParams();
  const scope = (SCOPES.includes(params.get('scope') as Scope) ? params.get('scope') : 'all') as Scope;
  const [query, setQueryState] = useState(() => params.get('q') ?? '');
  const setParam = (key: string, value: string, fallback: string) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value && value !== fallback) next.set(key, value); else next.delete(key);
      return next;
    }, { replace: true });
  const setScope = (value: Scope) => setParam('scope', value, 'all');
  const setQuery = (value: string) => { setQueryState(value); setParam('q', value.trim() ? value : '', ''); };
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const items = useMemo(() => projects.data ?? [], [projects.data]);
  // UR-59: projects are created from PROJECT_MANAGER up; below that "새 프로젝트" stays, off, with the reason.
  const createLocked = useRoleGate().reason(NEEDS.manageProjects);
  const newButton = createLocked
    ? <LockedButton showReason reason={createLocked}><Plus size={16} aria-hidden />{t('projects.new')}</LockedButton>
    : <Button onClick={() => setCreating(true)}><Plus size={16} aria-hidden />{t('projects.new')}</Button>;
  const needle = query.trim().toLowerCase();
  const visible = items.filter((project) =>
    (scope === 'all' || (scope === 'owned' ? project.accessRole === 'OWNER' : project.accessRole !== 'OWNER')) &&
    (!needle || [project.name, project.description].some((text) => text?.toLowerCase().includes(needle))));
  return (
    <div className="page-stack">
      <PageHeader title={t('titles.projects')} description={t('projects.description')} actions={newButton} />
      <Card>
        <div className="toolbar">
          <label className="toolbar__search">
            <Search size={16} aria-hidden />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('projects.searchPlaceholder')} aria-label={t('projects.search')} autoComplete="off" spellCheck={false} />
          </label>
          <Segmented label={t('projects.scopeLabel')} value={scope} onChange={setScope} items={[{ id: 'all', label: t('app.all') }, { id: 'owned', label: t('projects.mine') }, { id: 'shared', label: t('app.shared') }]} />
        </div>
        {projects.loading && !projects.data ? (
          <Skeleton lines={4} label={t('projects.loading')} />
        ) : projects.error ? (
          <div className="inline-error"><Alert tone="danger">{t('projects.listFailed', { error: projects.error })}</Alert><Button variant="secondary" size="sm" onClick={projects.reload} className="inline-error__retry">{t('common.retry')}</Button></div>
        ) : !items.length ? (
          <EmptyState icon={<FolderKanban size={22} />} title={t('projects.emptyTitle')} text={t('projects.emptyText')} action={newButton} />
        ) : !visible.length ? (
          <EmptyState icon={<Search size={22} />} title={t('projects.noResults')} action={<Button variant="secondary" onClick={() => { setQueryState(''); setParams(new URLSearchParams(), { replace: true }); }}>{t('data.reset')}</Button>} />
        ) : (
          <div className="xc-table-wrap">
            <table className="xc-table xc-table--cards">
              <thead>
                <tr>
                  <th scope="col">{t('app.name')}</th>
                  <th scope="col">{t('projects.role')}</th>
                  <th scope="col">{t('projects.ownerColumn')}</th>
                  <th scope="col">{t('app.updated')}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((project) => (
                  <tr key={project.id}>
                    <td className="cell-main">
                      <span className="xc-cell-main">
                        <Link to={`/app/projects/${encodeURIComponent(project.id)}`}>{project.name}</Link>
                        {/* No description, no line: "설명 없음" on every row said nothing. */}
                        {project.description && <small className="clamp-1">{project.description}</small>}
                      </span>
                    </td>
                    <td data-label={t('projects.role')}><RoleBadge role={project.accessRole} /></td>
                    <td data-label={t('projects.ownerColumn')}>{project.accessRole === 'OWNER' ? t('projects.ownerMe') : project.ownerUsername || <NoValue label={t('app.noValue')} />}</td>
                    <td data-label={t('app.updated')} className="date">{formatDate(project.updatedAt ?? project.createdAt, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
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
  const [nameError, setNameError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    // A missing name is said next to the field; server errors stay below the form.
    if (!name.trim()) { setNameError(t('projects.nameRequired')); return; }
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
      <form id="project-form" className="form-stack" onSubmit={submit} noValidate>
        <TextField label={t('projects.name')} value={name} maxLength={150} required autoComplete="off" error={nameError} onChange={(event) => { setName(event.target.value); setNameError(''); }} />
        <label className="xc-field">
          <span className="xc-label">{t('projects.descriptionLabel')} <span className="xc-hint">{t('projects.optional')}</span></span>
          <textarea className="xc-textarea" value={description} maxLength={5000} onChange={(event) => setDescription(event.target.value)} />
          <span className="xc-hint char-count">{description.length} / 5000</span>
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
  const gate = useRoleGate();
  useDocumentTitle(project.data?.name ? t('titles.projectNamed', { name: project.data.name }) : t('titles.projects'));
  // The open tab is kept in the URL (?tab=members), like the dataset detail.
  const [params, setParams] = useSearchParams();
  const tab: DetailTab = params.get('tab') === 'members' ? 'members' : 'data';
  const setTab = (value: DetailTab) => setParams((current) => {
    const next = new URLSearchParams(current);
    if (value === 'data') next.delete('tab'); else next.set('tab', value);
    return next;
  }, { replace: true });
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();
  const back = <Link className="page-back" to="/app/projects"><ArrowLeft size={16} aria-hidden />{t('titles.projects')}</Link>;
  if (project.loading && !project.data) return <div className="page-stack">{back}<Card><Skeleton lines={5} label={t('projects.loading')} /></Card></div>;
  if (project.error || !project.data) {
    const forbidden = project.status === 403;
    const missing = project.status === 404;
    // Retrying cannot fix a missing or forbidden project: offer the list instead.
    return (
      <div className="page-stack">{back}
        <Card><EmptyState icon={forbidden ? <Lock size={22} /> : <SearchX size={22} />} title={forbidden ? t('projects.forbiddenTitle') : missing ? t('projects.missingTitle') : t('projects.failedTitle')} text={forbidden ? t('dataset.askOwner') : project.error} action={forbidden || missing ? <ButtonLink to="/app/projects" variant="secondary">{t('projects.toList')}</ButtonLink> : <Button variant="secondary" onClick={project.reload}>{t('common.retry')}</Button>} /></Card>
      </div>
    );
  }
  const current = project.data;
  const owner = current.accessRole === 'OWNER';
  const editable = canEditProject(current);
  // Both must hold (UR-59): the project permission (owner / editor) and the account role.
  const manageLocked = gate.reason(NEEDS.manageProjects);
  return (
    <div className="page-stack">
      <PageHeader
        back={back}
        title={current.name}
        description={<span className="head-tags"><RoleBadge role={current.accessRole} />{current.description && <span>{current.description}</span>}</span>}
        actions={<>
          {editable && (manageLocked
            ? <LockedButton variant="secondary" reason={manageLocked}><Pencil size={16} aria-hidden />{t('projects.edit')}</LockedButton>
            : <Button variant="secondary" onClick={() => setEditing(true)}><Pencil size={16} aria-hidden />{t('projects.edit')}</Button>)}
          {owner && (manageLocked
            ? <LockedButton variant="ghost" reason={manageLocked}><Trash2 size={16} aria-hidden />{t('app.delete')}</LockedButton>
            : <Button variant="ghost" onClick={() => setDeleting(true)}><Trash2 size={16} aria-hidden />{t('app.delete')}</Button>)}
        </>}
      />
      <Card>
        <div className="sheet-tabs">
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
  // Linking data needs PROJECT_USER (UR-59) on top of the project's edit permission.
  const linkLocked = useRoleGate().reason(NEEDS.createData);
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
        {editable && (linkLocked
          ? <LockedButton size="sm" showReason reason={linkLocked}><Link2 size={16} aria-hidden />{t('projects.linkData')}</LockedButton>
          : <Button size="sm" onClick={() => setPicking(true)}><Link2 size={16} aria-hidden />{t('projects.linkData')}</Button>)}
      </div>
      {linked.loading ? <Skeleton lines={3} label={t('projects.loadingLinked')} /> : linked.error ? (
        <div className="inline-error"><Alert tone="danger">{linked.error}</Alert></div>
      ) : !items.length ? (
        <EmptyState icon={<Database size={22} />} title={t('projects.noLinkedTitle')} text={editable ? t('projects.noLinkedEditable') : t('projects.noLinkedReadonly')} />
      ) : (
        <div className="xc-table-wrap">
          <table className="xc-table xc-table--cards">
            <thead><tr><th scope="col">{t('app.name')}</th><th scope="col">{t('app.status')}</th><th scope="col"><span className="sr-only">{t('app.actions')}</span></th></tr></thead>
            <tbody>
              {items.map((dataset) => (
                <tr key={dataset.id}>
                  <td className="cell-main"><span className="xc-cell-main"><Link to={`/app/data/${encodeURIComponent(dataset.id)}`}>{dataset.name}</Link><small>{dataset.xcubeDatasetId}</small></span></td>
                  <td data-label={t('app.status')}><DatasetStatus dataset={dataset} /></td>
                  <td className="cell-actions">
                    <div className="row-actions">
                      <a className="xc-icon-btn" href={viewerHref(dataset.id)} target="_blank" rel="noopener noreferrer" aria-label={t('app.openInViewerNamed', { name: dataset.name })} title={t('app.openInViewer')}><ExternalLink size={16} aria-hidden /></a>
                      {editable && <button type="button" className="xc-btn xc-btn--ghost xc-btn--sm" aria-disabled={linkLocked ? true : undefined} title={linkLocked || undefined} onClick={linkLocked ? undefined : () => setUnlinking(dataset)} aria-label={t('projects.unlinkNamed', { name: dataset.name })}><Unlink size={14} aria-hidden />{t('projects.unlink')}</button>}
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
      <label className="toolbar__search toolbar__search--full">
        <Search size={16} aria-hidden />
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('projects.linkSearch')} aria-label={t('projects.linkSearchLabel')} autoComplete="off" spellCheck={false} />
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
  // Problems with the typed ID are said next to the field (and focus returns there); the rest below the form.
  const [fieldError, setFieldError] = useState('');
  const [savingRole, setSavingRole] = useState('');
  const [removing, setRemoving] = useState<ProjectMember | null>(null);
  // Sharing needs PROJECT_MANAGER (UR-59) on top of owning the project.
  const shareLocked = useRoleGate().reason(NEEDS.manageProjects);
  if (!owner) return <EmptyState icon={<Lock size={22} />} title={t('members.ownerOnlyTitle')} text={t('members.ownerOnlyText')} />;
  const add = async (event: FormEvent) => {
    event.preventDefault();
    const focusField = () => document.getElementById('member-username')?.focus();
    if (!username.trim()) { setFieldError(t('members.usernameRequired')); focusField(); return; }
    setBusy(true);
    setError('');
    setFieldError('');
    try {
      const member = await appApi.addMember(project.id, { username: username.trim(), role }) as ProjectMember;
      members.setData((items) => [...(items ?? []).filter((item) => item.userId !== member.userId), member]);
      setUsername('');
      onToast(t('members.added', { name: label(member) }));
    } catch (cause) {
      const status = (cause as { status?: number })?.status;
      if (status === 404) { setFieldError(t('members.userNotFound')); focusField(); return; }
      setError(status === 429 ? t('members.tooMany')
        : status === 503 ? t('members.lookupDown')
        : userMessage(cause, lang));
    } finally { setBusy(false); }
  };
  // One role change at a time: the select is disabled while its change is saved.
  const change = async (member: ProjectMember, next: MemberRole) => {
    setError('');
    setSavingRole(member.userId);
    try {
      const saved = await appApi.updateMember(project.id, member.userId, next);
      members.setData((items) => items?.map((item) => (item.userId === member.userId ? { ...item, ...saved } as ProjectMember : item)) ?? null);
      onToast(t('members.roleChanged'));
    } catch (cause) { setError(userMessage(cause, lang)); } finally { setSavingRole(''); }
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
      <form className="member-form" onSubmit={add} noValidate>
        {/* Login IDs are typed as they are: no capital first letter, autocorrect or spell check on phones. */}
        <TextField id="member-username" label={t('members.username')} help={t('members.usernameHelp')} error={fieldError} value={username} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder={t('members.placeholder')} maxLength={150} onChange={(event) => { setUsername(event.target.value); setFieldError(''); }} />
        <label className="xc-field">
          <span className="xc-label">{t('members.role')}</span>
          <select className="xc-select" value={role} onChange={(event) => setRole(event.target.value as MemberRole)}>
            <option value="VIEWER">{t('roles.VIEWER')}</option>
            <option value="EDITOR">{t('roles.EDITOR')}</option>
          </select>
        </label>
        {shareLocked
          ? <LockedButton className="member-form__submit" reason={shareLocked}>{t('members.add')}</LockedButton>
          : <Button type="submit" disabled={busy} className="member-form__submit">{busy ? t('members.adding') : t('members.add')}</Button>}
      </form>
      {shareLocked && <p className="inline-error xc-hint">{shareLocked}</p>}
      {error && <div className="inline-error"><Alert tone="danger">{error}</Alert></div>}
      {members.loading && !members.data ? <Skeleton lines={3} label={t('members.loading')} /> : members.error ? (
        <div className="inline-error"><Alert tone="danger">{members.error}</Alert></div>
      ) : (
        <div className="xc-table-wrap">
          <table className="xc-table xc-table--cards">
            <thead><tr><th scope="col">{t('members.user')}</th><th scope="col">{t('members.role')}</th><th scope="col">{t('members.addedOn')}</th><th scope="col"><span className="sr-only">{t('app.actions')}</span></th></tr></thead>
            <tbody>
              {items.map((member) => (
                <tr key={member.userId}>
                  <td className="cell-main"><strong>{member.role === 'OWNER' && String(user?.id) === member.userId ? t('members.me', { name: user?.name ?? t('members.meFallback') }) : label(member)}</strong></td>
                  <td data-label={t('members.role')}>{member.role === 'OWNER' ? <RoleBadge role="OWNER" /> : (
                    <select className="xc-select member-role" aria-label={t('members.roleOf', { name: label(member) })} aria-busy={savingRole === member.userId || undefined} disabled={savingRole === member.userId || !!shareLocked} title={shareLocked || undefined} value={member.role} onChange={(event) => change(member, event.target.value as MemberRole)}>
                      <option value="VIEWER">{t('roles.VIEWER')}</option>
                      <option value="EDITOR">{t('roles.EDITOR')}</option>
                    </select>
                  )}</td>
                  <td data-label={t('members.addedOn')} className="date">{member.createdAt ? formatDate(member.createdAt, lang) : <NoValue label={t('app.noDate')} />}</td>
                  <td className="cell-actions">{member.role !== 'OWNER' && <button type="button" className="xc-btn xc-btn--ghost xc-btn--sm" aria-disabled={shareLocked ? true : undefined} title={shareLocked || undefined} onClick={shareLocked ? undefined : () => setRemoving(member)} aria-label={t('members.removeNamed', { name: label(member) })}>{t('members.remove')}</button>}</td>
                </tr>
              ))}
              {!items.length && <tr><td colSpan={4} className="xc-hint cell-full">{t('members.none')}</td></tr>}
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
