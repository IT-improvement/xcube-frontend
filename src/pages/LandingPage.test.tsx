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

test('소개 홈의 주요 섹션을 모두 보여준다', () => {
  render(<App />);
  expect(screen.getByRole('heading', { level: 1, name: /위성 데이터에서\s*물의 변화를 읽습니다/ })).toBeInTheDocument();
  for (const name of ['데이터 준비부터 분석까지 다섯 단계', '한 플랫폼에서 이어지는 분석 흐름', '필요한 곳에 맞게', '표준 위에서, 독립적으로 운영', '우리 기관의 데이터로 확인해 보세요']) {
    expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
  }
  const nav = screen.getByRole('navigation', { name: '주요 메뉴' });
  expect(within(nav).getAllByRole('link').map((link) => link.getAttribute('href')).filter((href) => href?.startsWith('#'))).toEqual(['#workflow', '#features', '#use-cases', '#tech', '#contact']);
  for (const format of ['GeoTIFF', 'CAS500', 'Shapefile', 'Google Earth Engine', 'Zarr']) expect(screen.getByText(format)).toBeInTheDocument();
});

test('Viewer 열기는 모두 새 탭에서 /app/viewer를 연다', () => {
  render(<App />);
  const links = screen.getAllByRole('link', { name: /Viewer 열기/ });
  expect(links.length).toBeGreaterThanOrEqual(3);
  for (const link of links) {
    expect(link).toHaveAttribute('href', '/app/viewer');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(link).toHaveTextContent('(새 탭)');
  }
});

test('로그인하지 않은 방문자에게 로그인과 시작하기를 보여준다', () => {
  render(<App />);
  // Header (wide screens) and the mobile menu each carry these links.
  const logins = screen.getAllByRole('link', { name: '로그인' });
  const signups = screen.getAllByRole('link', { name: '시작하기' });
  expect(logins).toHaveLength(2);
  logins.forEach((link) => expect(link).toHaveAttribute('href', '/login?redirect=%2F'));
  signups.forEach((link) => expect(link).toHaveAttribute('href', '/signup'));
});

test('로그인한 사용자는 이름을 보고 로그인 버튼은 숨긴다', async () => {
  mockLastActivity.mockReturnValue(Date.now());
  mockRefresh.mockResolvedValue({ accessToken: 'token' });
  mockMe.mockResolvedValue({ id: 1, name: '홍길동' });
  render(<App />);
  expect((await screen.findAllByText('홍길동님')).length).toBeGreaterThan(0);
  expect(screen.queryByRole('link', { name: '로그인' })).not.toBeInTheDocument();
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

test('활용 분야 탭은 클릭과 방향키로 바뀐다', () => {
  render(<App />);
  const enterprise = screen.getByRole('tab', { name: '기업' });
  const government = screen.getByRole('tab', { name: '지자체' });
  expect(enterprise).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tabpanel')).toHaveTextContent('대용량 위성영상을 가볍게');
  fireEvent.click(government);
  expect(government).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tabpanel')).toHaveTextContent('전용 시스템 없이 수면 변화 확인');
  fireEvent.keyDown(government, { key: 'ArrowRight' });
  expect(enterprise).toHaveAttribute('aria-selected', 'true');
});

test('좁은 화면 메뉴 버튼은 메뉴를 열고 닫는다', () => {
  render(<App />);
  const toggle = screen.getByRole('button', { name: '메뉴 열기' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(toggle);
  expect(screen.getByRole('button', { name: '메뉴 닫기' })).toHaveAttribute('aria-expanded', 'true');
});

test('로그인 후 이동 경로는 같은 사이트 경로만 허용한다', () => {
  expect(safeRedirect('/app/viewer')).toBe('/app/viewer');
  expect(safeRedirect('/')).toBe('/');
  expect(safeRedirect('//evil.example')).toBe('/app/viewer');
  expect(safeRedirect('https://evil.example')).toBe('/app/viewer');
  expect(safeRedirect(null)).toBe('/app/viewer');
});
