import { ButtonLink } from '../../components/ui';
import { PageHeader } from '../../components/ui/kit';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useT } from '../../i18n';

/** 404 for unknown /app/* paths, drawn inside the app shell so the top bar and menu stay. */
export default function AppNotFoundPage() {
  const t = useT();
  useDocumentTitle(t('titles.notFound'));
  return (
    <PageHeader
      title={t('titles.notFound')}
      description={t('notFound.appText')}
      actions={<ButtonLink to="/app" variant="line">{t('notFound.toDashboard')}</ButtonLink>}
    />
  );
}
