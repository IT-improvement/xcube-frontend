import { useEffect } from 'react';
import { useT } from '../i18n';

/** Korean title of the public home (also the static title in public/index.html). */
export const HOME_TITLE = 'XCube — 위성 데이터를 작게, 지도에서';

/** `pageTitle('로그인')` → "로그인 · XCube"; no name gives the home title. */
export function pageTitle(name?: string, homeTitle = HOME_TITLE) {
  return name ? `${name} · XCube` : homeTitle;
}

/**
 * Sets the browser tab title for the current route. Callers pass an already translated name
 * (`useDocumentTitle(t('titles.login'))`), so a language change re-runs it with the new text.
 */
export function useDocumentTitle(name?: string) {
  const t = useT();
  const title = pageTitle(name, t('titles.home'));
  useEffect(() => {
    document.title = title;
  }, [title]);
}
