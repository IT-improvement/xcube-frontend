import { ButtonLink } from '../../components/ui';
import { Card, EmptyState, PageHeader, TabPanel, Tabs, useToast } from '../../components/ui/kit';
import { useRoleGate } from '../../auth/roles';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useLanguage } from '../../i18n';
import { useParam, useUserDirectory } from './admin/shared';
import UsersTab from './admin/UsersTab';
import DataTab from './admin/DataTab';
import AuditTab from './admin/AuditTab';
import SystemTab from './admin/SystemTab';
import AccessTab from './admin/AccessTab';
// The management screens' text (UR-53 stage 2) loads with these pages, not with the main bundle.
import '../../i18n/app';
import './admin/admin.css';

type Tab = 'users' | 'data' | 'system' | 'access' | 'audit';
const TABS: Tab[] = ['users', 'data', 'system', 'access', 'audit'];

/** S13 관리자 (UR-59, UR-60): accounts, every user's data and jobs, system state, the access record and the audit record. ADMIN only. */
export default function AdminPage() {
  const { t } = useLanguage();
  useDocumentTitle(t('titles.admin'));
  const { isAdmin } = useRoleGate();
  if (!isAdmin) {
    return (
      <div className="page-stack">
        <PageHeader title={t('titles.admin')} />
        <Card><EmptyState title={t('admin.forbiddenTitle')} text={t('admin.forbiddenText')} action={<ButtonLink to="/app" variant="line">{t('admin.toDashboard')}</ButtonLink>} /></Card>
      </div>
    );
  }
  return <AdminScreen />;
}

function AdminScreen() {
  const { t } = useLanguage();
  const toast = useToast();
  const [tabParam, setTab] = useParam('tab', 'users');
  const tab = (TABS.includes(tabParam as Tab) ? tabParam : 'users') as Tab;
  const directory = useUserDirectory();
  return (
    <div className="page-stack admin-page">
      <PageHeader title={t('titles.admin')} description={t('admin.description')} />
      <Card>
        <div className="sheet-tabs">
          <Tabs
            label={t('admin.tabsLabel')}
            idPrefix="admin"
            value={tab}
            // A new tab starts without the old tab's filters.
            onChange={(next) => setTab(next, ['q', 'role', 'status', 'page', 'view', 'kind', 'owner', 'event', 'from', 'to'])}
            items={[{ id: 'users', label: t('admin.tabs.users') }, { id: 'data', label: t('admin.tabs.data') }, { id: 'system', label: t('admin.tabs.system') }, { id: 'access', label: t('admin.tabs.access') }, { id: 'audit', label: t('admin.tabs.audit') }]}
          />
        </div>
        <TabPanel idPrefix="admin" value={tab}>
          {tab === 'users' ? <UsersTab onToast={toast.show} />
            : tab === 'data' ? <DataTab directory={directory} onToast={toast.show} />
              : tab === 'system' ? <SystemTab directory={directory} />
                : tab === 'access' ? <AccessTab onToast={toast.show} />
                  : <AuditTab directory={directory} />}
        </TabPanel>
      </Card>
      {toast.node}
    </div>
  );
}
