/* Top bar shell: active item, running-jobs word, account menu and the phone menu sheet. */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mockSignOut = jest.fn();
let mockActive: number | null = 0;
jest.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 1, name: '홍길동' }, signOut: mockSignOut }) }));
jest.mock('./jobs', () => ({ useActiveJobCount: () => mockActive }));

const AppShell = require('./AppShell').default;

function renderShell(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/app" element={<AppShell />}>
          <Route index element={<h1>대시보드 본문</h1>} />
          <Route path="data" element={<h1>데이터 본문</h1>} />
          <Route path="data/:id" element={<h1>상세 본문</h1>} />
          <Route path="jobs" element={<h1>작업 본문</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => { mockActive = 0; mockSignOut.mockReset(); });

test('상단 바: 현재 메뉴만 ink 활성(aria-current), 로고는 대시보드, Viewer는 새 탭, 중복 AI 항목 없음', () => {
  renderShell('/app/data/74');
  const nav = screen.getByRole('navigation', { name: '주 메뉴' });
  expect(within(nav).getByRole('link', { name: '데이터' })).toHaveAttribute('aria-current', 'page');
  expect(within(nav).getByRole('link', { name: '데이터' })).toHaveClass('active');
  expect(within(nav).getByRole('link', { name: '대시보드' })).not.toHaveAttribute('aria-current');
  expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual(['대시보드', '데이터', '프로젝트', '작업', '수식 융합', 'Viewer(새 탭)']);
  expect(within(nav).getByRole('link', { name: /Viewer/ })).toHaveAttribute('target', '_blank');
  expect(screen.queryByRole('link', { name: /AI 수체 추출/ })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'XCube 대시보드' })).toHaveAttribute('href', '/app');
  expect(screen.getByRole('link', { name: /데이터 추가/ })).toHaveAttribute('href', '/app/data/new');
  expect(screen.getByRole('link', { name: '본문으로 건너뛰기' })).toHaveAttribute('href', '#app-main');
  expect(screen.getByRole('main')).toHaveAttribute('tabindex', '-1');
});

test('대시보드 메뉴는 /app에서만 활성이다', () => {
  renderShell('/app');
  const nav = screen.getByRole('navigation', { name: '주 메뉴' });
  expect(within(nav).getByRole('link', { name: '대시보드' })).toHaveAttribute('aria-current', 'page');
  expect(within(nav).getByRole('link', { name: '데이터' })).not.toHaveAttribute('aria-current');
});

test('처리 중인 작업이 있을 때만 “처리 중 n”을 보여 주고 진행 중 작업으로 보낸다', () => {
  const { unmount } = renderShell('/app');
  expect(screen.queryByText(/처리 중/)).not.toBeInTheDocument();
  unmount();
  mockActive = 2;
  renderShell('/app');
  const jobs = screen.getByRole('link', { name: '처리 중인 작업 2개' });
  expect(jobs).toHaveTextContent('처리 중 2');
  expect(jobs).toHaveAttribute('href', '/app/jobs?status=QUEUED%2CRUNNING');
});

test('계정 메뉴: 이름을 누르면 로그아웃이 보이고, Escape로 닫히며 초점이 돌아온다', () => {
  renderShell('/app');
  const button = screen.getByRole('button', { name: /홍길동/ });
  expect(button).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(button);
  expect(button).toHaveAttribute('aria-expanded', 'true');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('button', { name: '로그아웃' })).not.toBeInTheDocument();
  expect(button).toHaveFocus();
  fireEvent.click(button);
  fireEvent.click(screen.getByRole('button', { name: '로그아웃' }));
  expect(mockSignOut).toHaveBeenCalled();
});

test('모바일 메뉴: 열면 초점이 시트 안으로, Escape나 바깥 누름으로 닫히고 초점이 메뉴 버튼으로 돌아온다', () => {
  renderShell('/app/jobs');
  const toggle = screen.getByRole('button', { name: '메뉴 열기' });
  fireEvent.click(toggle);
  const sheet = screen.getByRole('dialog', { name: '메뉴' });
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(within(sheet).getByRole('link', { name: '대시보드' })).toHaveFocus();
  expect(within(sheet).getByRole('link', { name: '작업' })).toHaveAttribute('aria-current', 'page');
  expect(within(sheet).getByRole('button', { name: '로그아웃' })).toBeInTheDocument();

  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog', { name: '메뉴' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '메뉴 열기' })).toHaveFocus();

  fireEvent.click(screen.getByRole('button', { name: '메뉴 열기' }));
  expect(screen.getByRole('dialog', { name: '메뉴' })).toBeInTheDocument();
  fireEvent.mouseDown(screen.getByRole('heading', { name: '작업 본문' }));
  expect(screen.queryByRole('dialog', { name: '메뉴' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '메뉴 열기' })).toHaveFocus();
});

test('모바일 메뉴: Tab은 시트 안에서 돌고, 메뉴 항목을 누르면 닫힌다', () => {
  renderShell('/app');
  fireEvent.click(screen.getByRole('button', { name: '메뉴 열기' }));
  const sheet = screen.getByRole('dialog', { name: '메뉴' });
  const logout = within(sheet).getByRole('button', { name: '로그아웃' });
  act(() => logout.focus());
  fireEvent.keyDown(logout, { key: 'Tab' });
  expect(within(sheet).getByRole('link', { name: '대시보드' })).toHaveFocus();
  fireEvent.click(within(sheet).getByRole('link', { name: '데이터' }));
  expect(screen.getByRole('heading', { name: '데이터 본문' })).toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: '메뉴' })).not.toBeInTheDocument();
});
