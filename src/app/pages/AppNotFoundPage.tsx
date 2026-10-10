import { ButtonLink } from '../../components/ui';
import { PageHeader } from '../../components/ui/kit';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { NOT_FOUND_TITLE } from '../../pages/NotFoundPage';

/** 404 for unknown /app/* paths, drawn inside the app shell so the top bar and menu stay. */
export default function AppNotFoundPage() {
  useDocumentTitle(NOT_FOUND_TITLE);
  return (
    <PageHeader
      title={NOT_FOUND_TITLE}
      description="주소가 바뀌었거나 없는 화면입니다. 위 메뉴에서 이동하거나 대시보드로 돌아가세요."
      actions={<ButtonLink to="/app" variant="line">대시보드로</ButtonLink>}
    />
  );
}
