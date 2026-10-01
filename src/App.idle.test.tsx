import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from './App';
import { ApiError, session } from './api/httpClient';
import { authApi, authSession } from './api/authApi';

jest.mock('./views/Viewer', () => ({ __esModule: true, default: ({ onLogout }: { onLogout: () => void }) => <div><span>Authenticated Viewer</span><button onClick={onLogout}>로그아웃</button></div> }));
jest.mock('./api/authApi', () => ({
  LAST_ACTIVITY_KEY: 'xcube-last-activity',
  authSession: { lastActivity: jest.fn(), touch: jest.fn(), clear: jest.fn() },
  authApi: { refresh: jest.fn(), me: jest.fn(), logout: jest.fn() },
}));
const hour = 60 * 60 * 1000;
let lastActivity: number;
beforeEach(() => {
  jest.useFakeTimers(); jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  jest.clearAllMocks(); sessionStorage.clear(); window.history.replaceState({}, '', '/app/viewer');
  lastActivity = Date.now();
  (authSession.lastActivity as jest.Mock).mockImplementation(() => lastActivity);
  (authSession.touch as jest.Mock).mockImplementation((now) => { lastActivity = now; });
  (authApi.refresh as jest.Mock).mockResolvedValue({ accessToken: 'test-token' });
  (authApi.me as jest.Mock).mockResolvedValue({ id: 1, name: 'Test' });
  (authApi.logout as jest.Mock).mockResolvedValue(undefined);
});
afterEach(() => { jest.useRealTimers(); window.history.replaceState({}, '', '/'); });
// Flush restore promises without findBy's polling advancing the fake clock.
async function openApp() { render(<App />); await act(async () => { await Promise.resolve(); }); expect(screen.getByText('Authenticated Viewer')).toBeInTheDocument(); }

test('M0 FR-AUTH-04: 마지막 활동과 timer가 정렬된 경우 2시간 경계에서 로그아웃한다', async () => {
  await openApp();
  await act(async () => { jest.advanceTimersByTime(2 * hour - 1); });
  expect(screen.getByText('Authenticated Viewer')).toBeInTheDocument();
  await act(async () => { jest.advanceTimersByTime(1); });
  expect(authApi.logout).toHaveBeenCalledTimes(1);
  expect(window.location.pathname + window.location.search).toBe('/login?reason=idle');
  expect(screen.getByRole('button', { name: '로그인' })).toBeInTheDocument();
});

test('M0 FR-AUTH-04: 사용자 활동이 비활동 기준 시각을 갱신한다', async () => {
  await openApp();
  await act(async () => { jest.advanceTimersByTime(hour); });
  fireEvent.mouseMove(window);
  await act(async () => { jest.advanceTimersByTime(hour); });
  expect(authApi.logout).not.toHaveBeenCalled();
  expect(screen.getByText('Authenticated Viewer')).toBeInTheDocument();
  await act(async () => { jest.advanceTimersByTime(hour); });
  expect(authApi.logout).toHaveBeenCalledTimes(1);
});

test('활동 시점이 10분 timer 사이여도 정확히 2시간 뒤 입력 없이 로그아웃한다', async () => {
  await openApp();
  await act(async () => { jest.advanceTimersByTime(73_000); });
  fireEvent.mouseMove(window);
  await act(async () => { jest.advanceTimersByTime(2 * hour - 1); });
  expect(authApi.logout).not.toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(1); });
  expect(authApi.logout).toHaveBeenCalledTimes(1);
  expect(window.location.search).toBe('?reason=idle');
});

test.each(['visibilitychange', 'focus'])('%s에서 잠자기 동안 지난 만료를 즉시 검사한다', async (event) => {
  await openApp();
  jest.setSystemTime(Date.now() + 2 * hour + 1);
  if (event === 'visibilitychange') fireEvent(document, new Event(event));
  else fireEvent(window, new Event(event));
  expect(authApi.logout).toHaveBeenCalledTimes(1);
  expect(window.location.search).toBe('?reason=idle');
});

test('다른 탭의 storage 활동으로 timeout 만료를 연장한다', async () => {
  await openApp();
  await act(async () => { jest.advanceTimersByTime(73_000); });
  lastActivity = Date.now();
  fireEvent(window, new StorageEvent('storage', { key: 'xcube-last-activity', newValue: String(lastActivity) }));
  await act(async () => { jest.advanceTimersByTime(2 * hour - 1); });
  expect(authApi.logout).not.toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(1); });
  expect(authApi.logout).toHaveBeenCalledTimes(1);
});

test.each([0, 503])('restore 일시 오류 %s는 로그인 화면 대신 재시도 상태를 표시한다', async (status) => {
  session.setToken('existing');
  (authApi.refresh as jest.Mock).mockRejectedValueOnce(new ApiError(status, 'TEMPORARY', 'offline'));
  render(<App />);
  expect(await screen.findByRole('alert')).toHaveTextContent('서버에 연결할 수 없습니다');
  expect(screen.queryByRole('button', { name: '로그인' })).not.toBeInTheDocument();
  expect(session.getToken()).toBe('existing');
  expect(authSession.clear).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  expect(await screen.findByText('Authenticated Viewer')).toBeInTheDocument();
});

test.each([401, 403])('restore 인증 거부 %s는 세션을 지우고 로그인 화면을 표시한다', async (status) => {
  session.setToken('existing');
  (authApi.refresh as jest.Mock).mockRejectedValueOnce(new ApiError(status, 'UNAUTHORIZED', 'denied'));
  render(<App />);
  expect(await screen.findByRole('button', { name: '로그인' })).toBeInTheDocument();
  expect(session.getToken()).toBeNull();
  expect(authSession.clear).toHaveBeenCalledTimes(1);
});

test.each([0, 503])('주기 refresh 일시 오류 %s는 세션과 Viewer를 유지한다', async (status) => {
  await openApp();
  session.setToken('existing');
  (authApi.refresh as jest.Mock).mockRejectedValueOnce(new ApiError(status, 'TEMPORARY', 'offline'));
  await act(async () => { jest.advanceTimersByTime(10 * 60 * 1000); });
  expect(screen.getByText('Authenticated Viewer')).toBeInTheDocument();
  expect(session.getToken()).toBe('existing');
  expect(authApi.logout).not.toHaveBeenCalled();
});

test('unauthorized 이벤트는 화면만 로그아웃하고 서버 logout을 호출하지 않는다', async () => {
  await openApp();
  fireEvent(window, new CustomEvent('xcube:unauthorized'));
  expect(screen.getByRole('button', { name: '로그인' })).toBeInTheDocument();
  expect(authApi.logout).not.toHaveBeenCalled();
});

test('idle logout API 네트워크 실패에도 즉시 로그인 경로로 이동한다', async () => {
  await openApp();
  (authApi.logout as jest.Mock).mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'offline'));
  await act(async () => { jest.advanceTimersByTime(2 * hour); });
  expect(window.location.pathname + window.location.search).toBe('/login?reason=idle');
  expect(screen.getByRole('button', { name: '로그인' })).toBeInTheDocument();
});

test('사용자가 누르는 로그아웃은 서버 logout을 호출한다', async () => {
  await openApp();
  fireEvent.click(screen.getByRole('button', { name: '로그아웃' }));
  expect(authApi.logout).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: '로그인' })).toBeInTheDocument();
});
