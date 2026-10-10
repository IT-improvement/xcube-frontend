import { render } from '@testing-library/react';
import { HOME_TITLE, pageTitle, useDocumentTitle } from './useDocumentTitle';

function Titled({ name }: { name?: string }) {
  useDocumentTitle(name);
  return null;
}

test('화면 이름 뒤에 " · XCube"를 붙이고, 이름이 없으면 소개 홈 제목을 쓴다', () => {
  expect(pageTitle('데이터')).toBe('데이터 · XCube');
  expect(pageTitle()).toBe(HOME_TITLE);
  const { rerender } = render(<Titled name="대시보드" />);
  expect(document.title).toBe('대시보드 · XCube');
  rerender(<Titled name="작업" />);
  expect(document.title).toBe('작업 · XCube');
  rerender(<Titled />);
  expect(document.title).toBe('XCube — 위성 데이터를 작게, 지도에서');
});
