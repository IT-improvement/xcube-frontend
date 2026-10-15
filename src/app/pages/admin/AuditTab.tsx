// S13 기록 tab: the admin audit record (who changed what, when), newest first, a page at a time.
import { accountRoleLabel, toAccountRole } from '../../../auth/roles';
import { EmptyState, Skeleton } from '../../../components/ui/kit';
import { useLanguage } from '../../../i18n';
import type { Lang, TKey } from '../../../i18n';
import { admin, AuditEntry, formatDateTime } from '../../api';
import { formatBytes } from '../../fusion';
import { useLoad } from '../../useLoad';
import { ListError } from './DataTab';
import { Directory, ownerLabel, PAGE_SIZE, Pager, useParam } from './shared';
import { translate } from '../../../i18n/core';

/**
 * Action names are the services' (ADM contract §2 says only "모든 변경"); several spellings are accepted and
 * anything unknown is shown as given.
 */
const ACTION_KEY: Array<[RegExp, TKey]> = [
  [/ROLE/, 'admin.audit.actions.role'],
  [/UNBLOCK|ACTIVATE/, 'admin.audit.actions.unblock'],
  [/BLOCK/, 'admin.audit.actions.block'],
  [/PASSWORD/, 'admin.audit.actions.password'],
  [/QUOTA/, 'admin.audit.actions.quota'],
  [/(DATASET|DATACUBE).*DELETE|DELETE.*(DATASET|DATACUBE)/, 'admin.audit.actions.datasetDelete'],
  [/JOB.*CANCEL|CANCEL.*JOB/, 'admin.audit.actions.jobCancel'],
  [/(USER.*DELETE|DELETE.*USER|WITHDRAW)/, 'admin.audit.actions.userDelete'],
];
/** auth sends one USER_UPDATE with `detail.before` / `detail.after`; the change says which action it was. */
const changeOf = (detail: Record<string, unknown> | null) => {
  const before = (detail?.before ?? {}) as Record<string, unknown>;
  const after = (detail?.after ?? {}) as Record<string, unknown>;
  return { before, after, role: after.role !== undefined && after.role !== before.role, status: after.status !== undefined && after.status !== before.status };
};
export function auditActionLabel(action: string, lang: Lang, detail: Record<string, unknown> | null = null) {
  const upper = action.toUpperCase();
  if (upper === 'USER_UPDATE' && detail?.after) {
    const change = changeOf(detail);
    if (change.status) return translate(lang, change.after.status === 'BLOCKED' ? 'admin.audit.actions.block' : 'admin.audit.actions.unblock');
    if (change.role) return translate(lang, 'admin.audit.actions.role');
  }
  const found = ACTION_KEY.find(([pattern]) => pattern.test(upper));
  return found ? translate(lang, found[1]) : action || '—';
}

const roleOrValue = (value: unknown, lang: Lang) => (toAccountRole(value) ? accountRoleLabel(value, lang) : String(value));

/** What changed, in words: "프로젝트 유저 → 유저", "한도 100 GB" / "기본 한도", else the detail's values. */
export function auditDetail(entry: AuditEntry, lang: Lang) {
  const detail = entry.detail ?? {};
  if (detail.before || detail.after) {
    const change = changeOf(detail);
    const statusText = (value: unknown) => (value === 'ACTIVE' || value === 'BLOCKED' ? translate(lang, `admin.users.status.${value}`) : String(value ?? '—'));
    const parts = [
      change.role ? `${roleOrValue(change.before.role ?? '—', lang)} → ${roleOrValue(change.after.role, lang)}` : '',
      change.status ? `${statusText(change.before.status)} → ${statusText(change.after.status)}` : '',
    ].filter(Boolean);
    return parts.join(' · ');
  }
  if (detail.from != null || detail.to != null) return `${roleOrValue(detail.from ?? '—', lang)} → ${roleOrValue(detail.to ?? '—', lang)}`;
  if ('quotaBytes' in detail) return detail.quotaBytes == null ? translate(lang, 'admin.audit.defaultQuota') : translate(lang, 'admin.audit.quota', { quota: formatBytes(Number(detail.quotaBytes)) });
  const parts = Object.entries(detail).filter(([key, value]) => !['loginId', 'targetLoginId', 'before', 'after'].includes(key) && value != null && typeof value !== 'object').map(([key, value]) => `${key}: ${value}`);
  return parts.join(' · ');
}

function targetText(entry: AuditEntry, directory: Directory, t: (key: TKey, vars?: Record<string, string | number>) => string) {
  const detail = entry.detail ?? {};
  const type = (entry.targetType ?? '').toUpperCase();
  if (type === 'USER') return t('admin.audit.targetUser', { name: ownerLabel(directory, entry.targetId, (detail.loginId ?? detail.targetLoginId ?? null) as string | null, t) });
  if (type === 'DATASET' || type === 'DATACUBE') return t('admin.audit.targetDataset', { name: String(detail.name ?? `#${entry.targetId ?? '—'}`) });
  if (type === 'JOB') return t('admin.audit.targetJob', { name: String(detail.name ?? `#${entry.targetId ?? '—'}`) });
  return [entry.targetType, entry.targetId && `#${entry.targetId}`].filter(Boolean).join(' ') || '—';
}

export default function AuditTab({ directory }: { directory: Directory }) {
  const { lang, t } = useLanguage();
  const [pageParam, setPage] = useParam('page');
  const page = Math.max(0, Number(pageParam) || 0);
  const list = useLoad(() => admin.listAudit(page, PAGE_SIZE), [page]);
  const items = list.data?.items ?? [];
  return (
    <>
      <p className="admin-note xc-hint">{t('admin.audit.note')}</p>
      {list.loading && !list.data ? <Skeleton lines={5} label={t('admin.audit.loading')} />
        : list.error ? <ListError text={t('admin.audit.failed', { error: list.error })} onRetry={list.reload} />
          : !items.length ? <EmptyState title={t('admin.audit.none')} />
            : (
              <div className="xc-stale" aria-busy={list.loading}>
                <div className="xc-table-wrap">
                  <table className="xc-table xc-table--cards admin-table">
                    <thead>
                      <tr>
                        <th scope="col">{t('admin.audit.when')}</th>
                        <th scope="col">{t('admin.audit.action')}</th>
                        <th scope="col">{t('admin.audit.target')}</th>
                        <th scope="col">{t('admin.audit.detail')}</th>
                        <th scope="col">{t('admin.audit.admin')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((entry) => (
                        <tr key={entry.id}>
                          <td className="date" data-label={t('admin.audit.when')}>{formatDateTime(entry.createdAt, lang)}</td>
                          <td className="cell-main"><strong>{auditActionLabel(entry.action, lang, entry.detail)}</strong></td>
                          <td data-label={t('admin.audit.target')}>{targetText(entry, directory, t)}</td>
                          <td data-label={t('admin.audit.detail')} className="admin-detail">{auditDetail(entry, lang) || <span className="no-value">—</span>}</td>
                          <td data-label={t('admin.audit.admin')}>{ownerLabel(directory, entry.adminUserId, entry.adminLoginId, t)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {list.data && <Pager page={page} total={list.data.total} onPage={(next) => setPage(next ? String(next) : '')} />}
              </div>
            )}
    </>
  );
}
