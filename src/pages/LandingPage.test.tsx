import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from '../App';
import { safeRedirect } from './AuthPage';

const mockMe = jest.fn(); const mockRefresh = jest.fn(); const mockLastActivity = jest.fn();
jest.mock('../api/authApi', () => ({
  LAST_ACTIVITY_KEY: 'xcube-last-activity',
  authSession: { lastActivity: () => mockLastActivity(), touch: jest.fn(), clear: jest.fn() },
  authApi: { me: () => mockMe(), refresh: () => mockRefresh(), login: jest.fn(), signup: jest.fn(), logout: () => mockLogout() },
}));
const mockLogout = jest.fn(() => Promise.resolve());
jest.mock('../views/Viewer', () => ({ __esModule: true, default: () => <div>Viewer</div> }));

beforeEach(() => {
  jest.clearAllMocks();
  window.history.replaceState({}, '', '/');
  mockLastActivity.mockReturnValue(0);
});

test('소개 홈은 캡처 hero와 줄인 섹션을 순서대로 보여준다', () => {
  render(<App />);
  expect(screen.getByRole('heading', { level: 1, name: '위성 영상은 작게 보관하고, 필요한 곳과 날짜만 지도에서 봅니다' })).toBeInTheDocument();
  expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent))
    .toEqual(['무엇이 달라지나', '대청호, 한 장면을 끝까지', '이런 곳에서 씁니다', '도입 안내']);
  const nav = screen.getByRole('navigation', { name: '주요 메뉴' });
  expect(within(nav).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['#case', '#customers', '#adopt']);
  for (const [id, name] of [['case', '대청호, 한 장면을 끝까지'], ['customers', '이런 곳에서 씁니다'], ['adopt', '도입 안내']]) {
    expect(screen.getByRole('region', { name })).toHaveAttribute('id', id);
  }
  // Two customer columns, no tabs.
  expect(screen.getByRole('heading', { level: 3, name: '기업' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 3, name: '시·군·구' })).toBeInTheDocument();
  expect(screen.queryByRole('tab')).not.toBeInTheDocument();
});

test('hero는 실제 Viewer 캡처를 크기와 우선순위를 정해 불러온다', () => {
  render(<App />);
  const hero = screen.getByRole('img', { name: /XCube Viewer 실제 화면/ });
  expect(hero).toHaveAttribute('src', expect.stringContaining('/landing/daecheong-viewer.webp'));
  expect(hero).toHaveAttribute('width', '2400');
  expect(hero).toHaveAttribute('height', '1016');
  expect(hero).toHaveAttribute('fetchpriority', 'high');
  expect(screen.getByRole('img', { name: /원본 대비 결과 패널/ })).toHaveAttribute('loading', 'lazy');
});

test('구현하지 않은 기능은 소개하지 않는다', () => {
  const { container } = render(<App />);
  const text = container.textContent ?? '';
  for (const word of ['Kubernetes', '차이 지도', '변화 지도', '일치도', '이미지 내보내기', '모델 간', '시점 간', '사내 구축', 'Docker']) {
    expect(text).not.toContain(word);
  }
  // Tile security is named as planned, not as done.
  expect(screen.getByText(/접근 보안을 거는 작업은 다음 단계로 예정/)).toBeInTheDocument();
});

test('로그인하지 않은 방문자에게 시작하기와 도입 안내를 보여준다', () => {
  render(<App />);
  const hero = screen.getByRole('region', { name: /위성 영상은 작게 보관하고/ });
  expect(within(hero).getByRole('link', { name: '시작하기' })).toHaveAttribute('href', '/signup');
  expect(within(hero).getByRole('link', { name: '도입 안내' })).toHaveAttribute('href', '#adopt');
  expect(within(hero).queryByRole('link', { name: '콘솔로 이동' })).not.toBeInTheDocument();
  // Header (wide screens) and the phone menu each carry 로그인 / 시작하기.
  const logins = screen.getAllByRole('link', { name: '로그인' });
  expect(logins).toHaveLength(2);
  logins.forEach((link) => expect(link).toHaveAttribute('href', '/login?redirect=%2F'));
  screen.getAllByRole('link', { name: '시작하기' }).forEach((link) => expect(link).toHaveAttribute('href', '/signup'));
  expect(screen.queryByRole('link', { name: /도입 문의 메일/ })).not.toBeInTheDocument();
});

test('로그인하지 않은 방문자의 Viewer 열기는 로그인을 거쳐 Viewer로 간다', () => {
  render(<App />);
  // Header, phone menu, hero and the 도입 안내 block each carry one; the case capture links too.
  const viewers = screen.getAllByRole('link', { name: 'Viewer 열기' });
  expect(viewers).toHaveLength(4);
  viewers.forEach((link) => expect(link).toHaveAttribute('href', '/login?redirect=%2Fapp%2Fviewer'));
  const hero = screen.getByRole('region', { name: /위성 영상은 작게 보관하고/ });
  expect(within(hero).getAllByRole('link').map((link) => link.textContent)).toEqual(['시작하기', 'Viewer 열기', '도입 안내']);
  expect(within(hero).getByRole('link', { name: '시작하기' })).toHaveClass('xc-btn--ink');
  expect(within(hero).getByRole('link', { name: 'Viewer 열기' })).not.toHaveClass('xc-btn--ink');
  const capture = screen.getByRole('link', { name: '대청호 결과를 Viewer에서 보기' });
  expect(capture).toHaveAttribute('href', '/login?redirect=%2Fapp%2Fviewer');
  expect(within(capture).getByRole('img', { name: /원본 대비 결과 패널/ })).toBeInTheDocument();
});

test('로그인한 사용자에게는 콘솔로 이동을 주로, Viewer 열기를 곁에 둔다', async () => {
  mockLastActivity.mockReturnValue(Date.now());
  mockRefresh.mockResolvedValue({ accessToken: 'token' });
  mockMe.mockResolvedValue({ id: 1, name: '홍길동' });
  render(<App />);
  const hero = screen.getByRole('region', { name: /위성 영상은 작게 보관하고/ });
  expect(await within(hero).findByRole('link', { name: '콘솔로 이동' })).toHaveAttribute('href', '/app');
  expect(within(hero).getAllByRole('link').map((link) => link.textContent)).toEqual(['콘솔로 이동', 'Viewer 열기']);
  const viewers = screen.getAllByRole('link', { name: 'Viewer 열기' });
  expect(viewers).toHaveLength(4);
  viewers.forEach((link) => {
    expect(link).toHaveAttribute('href', '/app/viewer');
    expect(link).not.toHaveClass('xc-btn--ink');
  });
  expect(screen.getByRole('link', { name: '대청호 결과를 Viewer에서 보기' })).toHaveAttribute('href', '/app/viewer');
  expect(screen.queryByRole('link', { name: '로그인' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: '시작하기' })).not.toBeInTheDocument();
});

test('로그인한 사용자는 소개 홈에서 로그아웃할 수 있다', async () => {
  mockLastActivity.mockReturnValue(Date.now());
  mockRefresh.mockResolvedValue({ accessToken: 'token' });
  mockMe.mockResolvedValue({ id: 1, name: '홍길동' });
  mockLogout.mockResolvedValue(undefined);
  render(<App />);
  const [logout] = await screen.findAllByRole('button', { name: '로그아웃' });
  fireEvent.click(logout);
  await waitFor(() => expect(mockLogout).toHaveBeenCalledTimes(1));
  expect(screen.getAllByRole('link', { name: '로그인' }).length).toBeGreaterThan(0);
  expect(screen.queryByRole('button', { name: '로그아웃' })).not.toBeInTheDocument();
  expect(window.location.pathname).toBe('/');
});

test('인증 서버가 꺼져 있어도 소개 홈은 그대로 보인다', async () => {
  mockLastActivity.mockReturnValue(Date.now());
  mockRefresh.mockRejectedValue(Object.assign(new Error('offline'), { status: 0 }));
  render(<App />);
  expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
  expect(screen.queryByText('서버에 연결할 수 없습니다')).not.toBeInTheDocument();
});

test('비활동이 만료된 상태로 소개 홈에 오면 로그인 화면으로 보내지 않는다', async () => {
  mockLastActivity.mockReturnValue(Date.now() - 3 * 60 * 60 * 1000);
  render(<App />);
  expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
  expect(window.location.pathname).toBe('/');
});

test('좁은 화면 메뉴는 열면 첫 링크로, Escape로 닫으면 메뉴 버튼으로 포커스를 옮긴다', () => {
  render(<App />);
  const toggle = screen.getByRole('button', { name: '메뉴 열기' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(toggle).toHaveAccessibleName('메뉴 닫기');
  const menu = screen.getByRole('navigation', { name: '모바일 메뉴' });
  expect(within(menu).getAllByRole('link')[0]).toHaveFocus();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(toggle).toHaveFocus();
});

test('좁은 화면 메뉴는 바깥을 누르거나 링크를 고르면 닫힌다', () => {
  render(<App />);
  const toggle = screen.getByRole('button', { name: '메뉴 열기' });
  fireEvent.click(toggle);
  fireEvent.pointerDown(screen.getByRole('heading', { level: 1 }));
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(toggle);
  fireEvent.click(within(screen.getByRole('navigation', { name: '모바일 메뉴' })).getByRole('link', { name: '도입 안내' }));
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

test('로그인 후 이동 경로는 같은 사이트 경로만 허용한다', () => {
  expect(safeRedirect('/app/viewer')).toBe('/app/viewer');
  expect(safeRedirect('/')).toBe('/');
  expect(safeRedirect('//evil.example')).toBe('/app');
  expect(safeRedirect('/\\evil.example')).toBe('/app');
  expect(safeRedirect('mailto:someone@example.com')).toBe('/app');
  expect(safeRedirect('https://evil.example')).toBe('/app');
  expect(safeRedirect(null)).toBe('/app');
});
