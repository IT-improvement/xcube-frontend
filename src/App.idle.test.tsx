import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from './App';
import { authApi, authSession } from './api/authApi';

jest.mock('./views/Viewer', () => ({ __esModule: true, default: () => <div>Authenticated Viewer</div> }));
jest.mock('./api/authApi', () => ({
  authSession: { lastActivity: jest.fn(), touch: jest.fn(), clear: jest.fn() },
  authApi: { refresh: jest.fn(), me: jest.fn(), logout: jest.fn() },
}));
const hour = 60 * 60 * 1000;
let lastActivity: number;
beforeEach(() => {
  jest.useFakeTimers(); jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  jest.clearAllMocks(); window.history.replaceState({}, '', '/');
  lastActivity = Date.now();
  (authSession.lastActivity as jest.Mock).mockImplementation(() => lastActivity);
  (authSession.touch as jest.Mock).mockImplementation((now) => { lastActivity = now; });
  (authApi.refresh as jest.Mock).mockResolvedValue({ accessToken: 'test-token' });
  (authApi.me as jest.Mock).mockResolvedValue({ id: 1, name: 'Test' });
  (authApi.logout as jest.Mock).mockResolvedValue(undefined);
});
afterEach(() => { jest.useRealTimers(); window.history.replaceState({}, '', '/'); });
async function openApp() { render(<App />); await screen.findByText('Authenticated Viewer'); }

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
