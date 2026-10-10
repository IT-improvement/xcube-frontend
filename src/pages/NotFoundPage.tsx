import { ButtonLink, StatusScreen } from '../components/ui';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useT } from '../i18n';

/** Public 404 (unknown paths outside /app): a full-screen page with its own h1. */
export default function NotFoundPage() {
  const t = useT();
  useDocumentTitle(t('titles.notFound'));
  return <StatusScreen heading title={t('titles.notFound')} text={t('notFound.text')} action={<ButtonLink to="/">{t('notFound.home')}</ButtonLink>} />;
}
