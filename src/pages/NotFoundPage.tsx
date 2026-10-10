import { ButtonLink, StatusScreen } from '../components/ui';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export const NOT_FOUND_TITLE = '페이지를 찾을 수 없습니다';

/** Public 404 (unknown paths outside /app): a full-screen page with its own h1. */
export default function NotFoundPage() {
  useDocumentTitle(NOT_FOUND_TITLE);
  return <StatusScreen heading title={NOT_FOUND_TITLE} text="주소를 확인하거나 홈으로 이동해 주세요." action={<ButtonLink to="/">홈으로</ButtonLink>} />;
}
