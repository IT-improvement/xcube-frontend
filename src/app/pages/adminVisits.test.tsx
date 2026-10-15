/* S13 접속 기록 › 방문 기록 (MON4, MON-contract §7): entrance-log visits with filters (period, IP, country, path,
   people/bots, pages/all), the KakaoTalk preview bot tag, IP drill-down with the sign-in record link, Loki off/down,
   the visit line in the summary view, Korean/English. */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ApiError } from '../../api/httpClient';
import { LanguageProvider } from '../../i18n';

let mockUser: Record<string, unknown> = { id: 1, email: 'boss', name: '관리자', role: 'ADMIN', status: 'ACTIVE' };
jest.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ user: mockUser, signOut: jest.fn(), updateUser: jest.fn() }) }));
const mockAdmin = {
  listUsers: jest.fn(), updateUser: jest.fn(), resetPassword: jest.fn(), deleteUser: jest.fn(), listAudit: jest.fn(),
  userSummaries: jest.fn(), setQuota: jest.fn(), listDatasets: jest.fn(), deleteDataset: jest.fn(), listProjects: jest.fn(),
  system: jest.fn(), listJobs: jest.fn(), cancelJob: jest.fn(),
  listLogins: jest.fn(), listSessions: jest.fn(), revokeSession: jest.fn(), accessSummary: jest.fn(),
  listVisits: jest.fn(), visitSummary: jest.fn(),
};
jest.mock('../api', () => ({ ...jest.requireActual('../api'), admin: mockAdmin }));

const AdminPage = require('./AdminPage').default;
const { daySpan } = require('./admin/AccessTab');

let location = '';
function Where() { const here = useLocation(); location = `${here.pathname}${here.search}`; return null; }
function renderAdmin(path: string, lang: 'ko' | 'en' = 'ko') {
  return render(
    <LanguageProvider initial={lang}>
      <MemoryRouter initialEntries={[path]}><AdminPage /><Where /></MemoryRouter>
    </LanguageProvider>,
  );
}

const visit = (time: string, ip: string, country: string | null, path: string, extra: Record<string, unknown> = {}) => ({
  time, ip, country, method: 'GET', path, status: 200, durationMs: 9, device: 'DESKTOP', os: 'Windows', browser: 'Edge', bot: false, botName: null, referer: null, userAgent: null, ...extra,
});
const KAKAO = { device: 'BOT', os: null, browser: 'KakaoTalk preview', bot: true, botName: 'KakaoTalk preview', userAgent: 'facebookexternalhit/1.1;kakaotalk-scrap/1.0;+https://devtalk.kakao.com/' };
const VISITS = [
  visit('2026-10-15T05:10:00Z', '203.0.113.5', 'KR', '/app', { device: 'MOBILE', os: 'iOS', browser: 'Safari' }),
  visit('2026-10-15T05:09:00Z', '198.51.100.200', 'KR', '/', KAKAO),
  visit('2026-10-15T05:08:00Z', '198.51.100.240', 'US', '/', { device: 'BOT', os: null, browser: 'Googlebot', bot: true, botName: 'Googlebot' }),
  visit('2026-10-15T05:07:00Z', '192.0.2.10', 'US', '/login', { status: 404 }),
  visit('2026-10-15T05:06:00Z', '198.51.100.30', 'JP', '/app/viewer', { method: 'GET', status: 503 }),
];
const SUMMARY = {
  days: 7, zone: 'Asia/Seoul', totals: { success: 4, fail: 0, uniqueIps: 2, uniqueUsers: 2, botEvents: 0, activeSessions: 1 },
  daily: [], countries: [], topFailedIps: [], warnings: [], rule: { failCount: 20, windowMinutes: 10 }, retentionDays: 90,
};
const VISIT_SUMMARY = {
  days: 7, zone: 'Asia/Seoul', truncated: false,
  totals: { visits: 120, human: 99, bot: 21, uniqueIps: 23, countries: 3 },
  daily: [], countries: [],
  topPages: [{ path: '/', count: 38 }, { path: '/app/projects/{id}', count: 6 }],
  topIps: [{ ip: '203.0.113.24', country: 'KR', human: 19, bot: 0, lastAt: null }, { ip: '198.51.100.240', country: 'US', human: 0, bot: 8, lastAt: null }],
  bots: [{ name: 'KakaoTalk preview', count: 13 }, { name: 'Googlebot', count: 8 }],
  retentionDays: 14,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 1, email: 'boss', name: '관리자', role: 'ADMIN', status: 'ACTIVE' };
  mockAdmin.listUsers.mockResolvedValue({ items: [], total: 0 });
  mockAdmin.accessSummary.mockResolvedValue(SUMMARY);
  mockAdmin.listLogins.mockResolvedValue({ items: [], total: 0 });
  mockAdmin.listVisits.mockResolvedValue({ items: VISITS, truncated: false, from: null, to: null });
  mockAdmin.visitSummary.mockResolvedValue(VISIT_SUMMARY);
});

test('방문 기록: 기본은 최근 24시간·화면만·사람과 봇 모두, 표는 시각·IP(나라)·기기·경로·상태, 봇은 "봇 · 카카오톡 미리보기" 태그', async () => {
  renderAdmin('/app/admin?tab=access&view=visits');
  expect(screen.getByRole('button', { name: '방문 기록' })).toHaveAttribute('aria-pressed', 'true');
  const table = await screen.findByTestId('admin-visits');
  expect(mockAdmin.listVisits).toHaveBeenLastCalledWith({ ip: '', country: '', path: '', bot: 'any', kind: 'page' });
  expect(within(table).getAllByRole('row')).toHaveLength(6);
  expect(within(table).getByText('봇 · 카카오톡 미리보기')).toBeInTheDocument();
  expect(within(table).getByText('봇 · Googlebot')).toBeInTheDocument();
  expect(within(table).getByText('모바일 · iOS · Safari')).toBeInTheDocument();
  expect(within(table).getAllByText('대한민국 (KR)').length).toBe(2);
  expect(within(table).getByText('일본 (JP)')).toBeInTheDocument();
  expect(within(table).getByText('/app/viewer')).toBeInTheDocument();
  expect(within(table).getByText('404')).toHaveClass('admin-status--warn');
  expect(within(table).getByText('503')).toHaveClass('admin-status--bad');
  // The user agent is the tooltip of the bot tag.
  expect(within(table).getByTitle(KAKAO.userAgent)).toHaveTextContent('봇 · 카카오톡 미리보기');
  expect(screen.getByText('5건')).toBeInTheDocument();
  expect(screen.getByText(/방문 기록\(IP·기기·주소\)은 개인정보입니다\. 관리자만 보며 14일이 지나면 지웁니다/)).toBeInTheDocument();
});

test('필터: 사람/봇·모든 요청·7일·나라·경로가 주소와 API로 간다', async () => {
  renderAdmin('/app/admin?tab=access&view=visits');
  await screen.findByTestId('admin-visits');
  fireEvent.change(screen.getByRole('combobox', { name: '사람·봇' }), { target: { value: 'bot' } });
  await waitFor(() => expect(mockAdmin.listVisits).toHaveBeenLastCalledWith(expect.objectContaining({ bot: 'bot' })));
  fireEvent.change(screen.getByRole('combobox', { name: '요청 종류' }), { target: { value: 'all' } });
  await waitFor(() => expect(mockAdmin.listVisits).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'all', bot: 'bot' })));
  expect(location).toContain('who=bot');
  expect(location).toContain('kind=all');
  fireEvent.click(screen.getByRole('button', { name: '7일' }));
  await waitFor(() => {
    const filter = mockAdmin.listVisits.mock.calls[mockAdmin.listVisits.mock.calls.length - 1][0];
    expect(Date.parse(filter.to) - Date.parse(filter.from)).toBe(7 * 86_400_000);
  });
  fireEvent.change(screen.getByRole('searchbox', { name: '나라 코드로 거르기' }), { target: { value: 'jp' } });
  await waitFor(() => expect(mockAdmin.listVisits).toHaveBeenLastCalledWith(expect.objectContaining({ country: 'JP' })), { timeout: 2000 });
  fireEvent.change(screen.getByRole('searchbox', { name: '경로로 거르기' }), { target: { value: '/app' } });
  await waitFor(() => expect(mockAdmin.listVisits).toHaveBeenLastCalledWith(expect.objectContaining({ path: '/app', country: 'JP' })), { timeout: 2000 });
});

test('직접 기간: 날짜 두 개를 보내고, 7일을 넘거나 앞뒤가 바뀌면 말로 알리고 부르지 않는다', async () => {
  expect(daySpan('2026-10-09', '2026-10-15')).toBe(7);
  expect(daySpan('2026-10-08', '2026-10-15')).toBe(8);
  renderAdmin('/app/admin?tab=access&view=visits&range=custom&from=2026-10-13&to=2026-10-15');
  await screen.findByTestId('admin-visits');
  expect(mockAdmin.listVisits).toHaveBeenLastCalledWith(expect.objectContaining({ from: '2026-10-13', to: '2026-10-15' }));
  const calls = mockAdmin.listVisits.mock.calls.length;
  fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '2026-10-01' } });
  expect(await screen.findByText('기간은 7일까지 고를 수 있습니다.')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '2026-10-20' } });
  expect(await screen.findByText('시작일이 종료일보다 늦습니다.')).toBeInTheDocument();
  expect(mockAdmin.listVisits).toHaveBeenCalledTimes(calls);
});

test('IP를 누르면 그 IP로 거르고, 같은 IP의 로그인 기록 링크와 조건 지우기가 나온다', async () => {
  renderAdmin('/app/admin?tab=access&view=visits');
  const table = await screen.findByTestId('admin-visits');
  fireEvent.click(within(table).getByRole('button', { name: '198.51.100.200의 방문만 보기' }));
  await waitFor(() => expect(mockAdmin.listVisits).toHaveBeenLastCalledWith(expect.objectContaining({ ip: '198.51.100.200' })));
  expect(location).toContain('ip=198.51.100.200');
  expect(screen.getByText('IP 198.51.100.200의 방문만 보는 중')).toBeInTheDocument();
  expect(screen.getByRole('searchbox', { name: 'IP로 거르기' })).toHaveValue('198.51.100.200');
  const logins = screen.getByRole('link', { name: /이 IP의 로그인 기록/ });
  expect(logins).toHaveAttribute('href', '/app/admin?tab=access&view=logins&q=198.51.100.200');
  fireEvent.click(logins);
  await waitFor(() => expect(mockAdmin.listLogins).toHaveBeenLastCalledWith(expect.objectContaining({ q: '198.51.100.200' })));
  expect(screen.getByRole('button', { name: '로그인 기록' })).toHaveAttribute('aria-pressed', 'true');
});

test('IP 조건 지우기', async () => {
  renderAdmin('/app/admin?tab=access&view=visits&ip=203.0.113.5');
  await screen.findByTestId('admin-visits');
  expect(mockAdmin.listVisits).toHaveBeenLastCalledWith(expect.objectContaining({ ip: '203.0.113.5' }));
  fireEvent.click(screen.getByRole('button', { name: 'IP 조건 지우기' }));
  await waitFor(() => expect(mockAdmin.listVisits).toHaveBeenLastCalledWith(expect.objectContaining({ ip: '' })));
  expect(screen.queryByText(/의 방문만 보는 중/)).not.toBeInTheDocument();
});

test('1,000건을 넘으면 최근 것만 보인다고 알리고, 50줄씩 넘겨 본다', async () => {
  const many = Array.from({ length: 120 }, (_, index) => visit(new Date(Date.UTC(2026, 9, 15, 5, 0, 0) - index * 1000).toISOString(), `203.0.113.${index % 250}`, 'KR', `/app/p${index}`));
  mockAdmin.listVisits.mockResolvedValue({ items: many, truncated: true, from: null, to: null });
  renderAdmin('/app/admin?tab=access&view=visits');
  const table = await screen.findByTestId('admin-visits');
  expect(screen.getByText('조건에 맞는 기록이 많아 최근 1,000건만 보여 줍니다. 기간이나 조건을 좁히세요.')).toBeInTheDocument();
  expect(within(table).getAllByRole('row')).toHaveLength(51);
  fireEvent.click(screen.getByRole('button', { name: /다음/ }));
  await waitFor(() => expect(within(screen.getByTestId('admin-visits')).getByText('/app/p50')).toBeInTheDocument());
});

test('Loki가 연결되지 않았으면 안내, 응답하지 않으면 이유와 다시 시도', async () => {
  mockAdmin.listVisits.mockRejectedValueOnce(new ApiError(503, 'LOKI_NOT_CONFIGURED', 'The request log is not connected'));
  const { unmount } = renderAdmin('/app/admin?tab=access&view=visits');
  expect(await screen.findByText('방문 기록이 연결되어 있지 않습니다')).toBeInTheDocument();
  expect(screen.getByText(/서버 입구 기록\(Loki\)을 연결하면/)).toBeInTheDocument();
  unmount();
  mockAdmin.listVisits.mockRejectedValueOnce(new ApiError(503, 'LOKI_UNAVAILABLE', 'The request log (Loki) is not answering'));
  renderAdmin('/app/admin?tab=access&view=visits');
  expect(await screen.findByText(/방문 기록을 불러오지 못했습니다\. 요청 기록 저장소\(Loki\)가 응답하지 않습니다/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  expect(await screen.findByTestId('admin-visits')).toBeInTheDocument();
});

test('서버가 IP 형식을 거절하면 그 이유를 한국어로', async () => {
  mockAdmin.listVisits.mockRejectedValueOnce(new ApiError(400, 'INVALID_IP', 'IP must be an IPv4 or IPv6 address'));
  renderAdmin('/app/admin?tab=access&view=visits&ip=1.2.3');
  expect(await screen.findByText(/IP 주소 형식이 아닙니다/)).toBeInTheDocument();
});

test('요약 보기: 방문 수(사람·봇) 줄, 많이 본 화면, 방문 많은 IP(누르면 방문 기록), 봇 이름', async () => {
  renderAdmin('/app/admin?tab=access');
  const block = await screen.findByTestId('admin-visit-summary');
  expect(await within(block).findByText('화면 방문 120 · 사람 99 · 봇 21 · 사람 고유 IP 23')).toBeInTheDocument();
  expect(mockAdmin.visitSummary).toHaveBeenCalledWith(7);
  expect(within(block).getByText('/app/projects/{id}')).toBeInTheDocument();
  expect(within(block).getByText('카카오톡 미리보기')).toBeInTheDocument();
  expect(within(block).getByText('미국 (US) · 봇')).toBeInTheDocument();
  fireEvent.click(within(block).getByRole('link', { name: '203.0.113.24의 방문만 보기' }));
  await waitFor(() => expect(mockAdmin.listVisits).toHaveBeenLastCalledWith(expect.objectContaining({ ip: '203.0.113.24' })));
  expect(location).toContain('view=visits');
});

test('요약 보기: Loki가 없으면 방문 줄 대신 한 줄 안내, 로그인 요약은 그대로', async () => {
  mockAdmin.visitSummary.mockRejectedValue(new ApiError(503, 'LOKI_NOT_CONFIGURED', 'off'));
  renderAdmin('/app/admin?tab=access');
  expect(await screen.findByText('방문 기록은 서버 입구 기록(Loki)이 연결되면 보입니다.')).toBeInTheDocument();
  expect(screen.getByText('로그인 4 · 실패 0 · 고유 IP 2 · 지금 로그인 중 1')).toBeInTheDocument();
});

test('영어 화면: Visits, bot tag, filters', async () => {
  renderAdmin('/app/admin?tab=access&view=visits', 'en');
  const table = await screen.findByTestId('admin-visits');
  expect(screen.getByRole('button', { name: 'Visits' })).toHaveAttribute('aria-pressed', 'true');
  expect(within(table).getByText('Bot · KakaoTalk preview')).toBeInTheDocument();
  expect(within(table).getByText('Mobile · iOS · Safari')).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'People or bots' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Pages only' })).toBeInTheDocument();
  expect(screen.getByText('5 visits')).toBeInTheDocument();
  fireEvent.click(within(table).getByRole('button', { name: 'Show visits from 192.0.2.10' }));
  expect(await screen.findByText('Showing visits from IP 192.0.2.10')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Sign-ins from this IP/ })).toBeInTheDocument();
});
