import { useEffect } from 'react';

/** Title of the public home (also the static title in public/index.html). */
export const HOME_TITLE = 'XCube — 위성 데이터를 작게, 지도에서';

/** `pageTitle('로그인')` → "로그인 · XCube"; no name gives the home title. */
export function pageTitle(name?: string) {
  return name ? `${name} · XCube` : HOME_TITLE;
}

/** Sets the browser tab title for the current route. */
export function useDocumentTitle(name?: string) {
  const title = pageTitle(name);
  useEffect(() => {
    document.title = title;
  }, [title]);
}
