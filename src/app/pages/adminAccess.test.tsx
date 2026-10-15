/* S13 접속 기록 (UR-60, MON1): summary with failure warnings, signed-in sessions with forced sign-out, sign-in record
   filters, the Grafana link only when configured, the system tab's public address with copy, Korean/English pairs. */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '../../api/httpClient';
import { LanguageProvider } from '../../i18n';
import koApp from '../../i18n/app/ko';
import enApp from '../../i18n/app/en';

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

function renderAdmin(path: string, lang: 'ko' | 'en' = 'ko') {
  return render(
    <LanguageProvider initial={lang}>
      <MemoryRouter initialEntries={[path]}><AdminPage /></MemoryRouter>
    </LanguageProvider>,
  );
}

const SUMMARY = {
  days: 7, zone: 'Asia/Seoul',
  totals: { success: 42, fail: 61, uniqueIps: 9, uniqueUsers: 5, botEvents: 2, activeSessions: 3 },
  daily: Array.from({ length: 7 }, (_, index) => ({ date: `2026-10-${String(9 + index).padStart(2, '0')}`, success: 6, fail: index === 6 ? 26 : 1, uniqueIps: 3 })),
  countries: [{ country: 'KR', success: 40, fail: 8 }, { country: 'RU', success: 0, fail: 23 }, { country: null, success: 2, fail: 30 }],
  topFailedIps: [{ ip: '198.51.100.66', country: 'RU', fails: 23, successes: 0, lastAt: '2026-10-15T02:07:00Z' }],
  warnings: [{ ip: '198.51.100.66', country: 'RU', count: 23, from: '2026-10-15T02:00:00Z', to: '2026-10-15T02:07:00Z' }],
  rule: { failCount: 20, windowMinutes: 10 },
  retentionDays: 90,
};
const SESSIONS = [
  { familyId: 'fam-me', userId: '1', loginId: 'boss', name: '관리자', role: 'ADMIN', startedAt: '2026-10-15T01:00:00Z', lastRefreshAt: '2026-10-15T02:00:00Z', expiresAt: null, ip: '203.0.113.5', country: 'KR', device: 'DESKTOP', os: 'macOS', browser: 'Chrome', bot: false, current: true },
  { familyId: 'fam-kim', userId: '2', loginId: 'kim', name: '김', role: 'PROJECT_USER', startedAt: '2026-10-15T00:00:00Z', lastRefreshAt: '2026-10-15T01:30:00Z', expiresAt: null, ip: '203.0.113.24', country: 'KR', device: 'MOBILE', os: 'iOS', browser: 'Safari', bot: false, current: false },
];
const EVENTS = [
  { id: '3', userId: null, loginId: 'root', event: 'LOGIN_FAIL', reason: 'UNKNOWN_ID', ip: '198.51.100.66', country: 'RU', device: 'BOT', os: null, browser: 'curl', bot: true, userAgent: 'curl/8.7.1', createdAt: '2026-10-15T02:07:00Z' },
  { id: '2', userId: '2', loginId: 'kim', event: 'LOGIN_SUCCESS', reason: null, ip: '203.0.113.24', country: 'KR', device: 'MOBILE', os: 'iOS', browser: 'Safari', bot: false, userAgent: null, createdAt: '2026-10-15T01:00:00Z' },
  { id: '1', userId: '2', loginId: 'kim', event: 'REFRESH_REUSE', reason: null, ip: '10.42.0.1', country: null, device: 'DESKTOP', os: 'Windows', browser: 'Edge', bot: false, userAgent: null, createdAt: '2026-10-14T01:00:00Z' },
];

const ORIGINAL_GRAFANA = process.env.REACT_APP_GRAFANA_URL;
beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.REACT_APP_GRAFANA_URL;
  mockUser = { id: 1, email: 'boss', name: '관리자', role: 'ADMIN', status: 'ACTIVE' };
  mockAdmin.listUsers.mockResolvedValue({ items: [], total: 0 });
  mockAdmin.accessSummary.mockResolvedValue(SUMMARY);
  mockAdmin.listSessions.mockResolvedValue(SESSIONS.map((item) => ({ ...item })));
  mockAdmin.listLogins.mockResolvedValue({ items: EVENTS, total: 3 });
  mockAdmin.revokeSession.mockResolvedValue(undefined);
  mockAdmin.visitSummary.mockRejectedValue(new ApiError(503, 'LOKI_NOT_CONFIGURED', 'off'));
});
afterAll(() => { if (ORIGINAL_GRAFANA === undefined) delete process.env.REACT_APP_GRAFANA_URL; else process.env.REACT_APP_GRAFANA_URL = ORIGINAL_GRAFANA; });

test('접속 기록 요약: 7일 합계, 실패 경고(IP·나라·횟수), 날짜별 표, 나라별·실패 많은 IP, 보관 안내', async () => {
  renderAdmin('/app/admin?tab=access');
  expect(screen.getByRole('tab', { name: '접속 기록' })).toHaveAttribute('aria-selected', 'true');
  expect(await screen.findByText('최근 7일')).toBeInTheDocument();
  expect(mockAdmin.accessSummary).toHaveBeenCalledWith(7);
  expect(screen.getByText('로그인 42 · 실패 61 · 고유 IP 9 · 지금 로그인 중 3')).toBeInTheDocument();
  const warnings = screen.getByRole('group', { name: '로그인 실패 경고' });
  expect(within(warnings).getByText(/198\.51\.100\.66 · 러시아 \(RU\)에서 10분 안에 로그인 실패 23회/)).toBeInTheDocument();
  const summary = screen.getByTestId('admin-access-summary');
  expect(within(within(summary).getAllByRole('table')[0]).getAllByRole('row')).toHaveLength(8); // header + 7 days
  expect(screen.getByText('대한민국 (KR)')).toBeInTheDocument();
  expect(screen.getAllByText('나라 모름').length).toBeGreaterThan(0);
  expect(screen.getByRole('heading', { name: '실패가 많은 IP' })).toBeInTheDocument();
  expect(screen.getByText('IP·기기·접속 기록은 개인정보입니다. 관리자만 보며 90일이 지나면 지웁니다.')).toBeInTheDocument();
  // Grafana is not configured: no link.
  expect(screen.queryByRole('link', { name: /Grafana 외부 접속 대시보드/ })).not.toBeInTheDocument();
});

test('경고가 없으면 기준(10분 20회)을 말로 알린다', async () => {
  mockAdmin.accessSummary.mockResolvedValue({ ...SUMMARY, warnings: [] });
  renderAdmin('/app/admin?tab=access');
  expect(await screen.findByText('한 IP에서 10분 안에 로그인 실패가 20회를 넘은 적은 없습니다.')).toBeInTheDocument();
  expect(screen.queryByRole('group', { name: '로그인 실패 경고' })).not.toBeInTheDocument();
});

test('REACT_APP_GRAFANA_URL이 있을 때만 외부 접속 대시보드 버튼을 보이고, 누르면 일회용 ticket으로 새 탭을 연다', async () => {
  process.env.REACT_APP_GRAFANA_URL = '/grafana/';
  const tab = { opener: {}, location: { href: '' }, close: jest.fn() };
  const open = jest.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
  const fetchMock = jest.spyOn(global, 'fetch' as never).mockResolvedValue(new Response(JSON.stringify({ ticket: 't-1', expiresIn: 60 }), { status: 200, headers: { 'Content-Type': 'application/json' } }) as never);
  renderAdmin('/app/admin?tab=access');
  const button = await screen.findByRole('button', { name: /Grafana 외부 접속 대시보드/ });
  fireEvent.click(button);
  await waitFor(() => expect(tab.location.href).toBe('/grafana/d/xcube-access?ticket=t-1'));
  expect(open).toHaveBeenCalledWith('about:blank', '_blank');
  open.mockRestore(); fetchMock.mockRestore();
});

test('로그인 중: 세션 표(기기·IP·나라·이 기기), 확인 후 강제 로그아웃하면 목록에서 빠지고 알린다', async () => {
  renderAdmin('/app/admin?tab=access&view=sessions');
  const kim = await screen.findByTestId('admin-session-fam-kim');
  expect(within(kim).getByText('모바일 · iOS · Safari')).toBeInTheDocument();
  expect(within(kim).getByText('203.0.113.24')).toBeInTheDocument();
  expect(within(screen.getByTestId('admin-session-fam-me')).getByText('이 기기')).toBeInTheDocument();
  fireEvent.click(within(kim).getByRole('button', { name: 'kim 강제 로그아웃' }));
  const dialog = screen.getByRole('alertdialog');
  expect(dialog).toHaveTextContent('kim의 세션(모바일 · iOS · Safari, 203.0.113.24)을 끊습니다.');
  expect(dialog).not.toHaveTextContent('지금 이 화면을 쓰는 내 세션입니다.');
  fireEvent.click(within(dialog).getByRole('button', { name: '강제 로그아웃' }));
  await waitFor(() => expect(mockAdmin.revokeSession).toHaveBeenCalledWith('fam-kim'));
  await waitFor(() => expect(screen.queryByTestId('admin-session-fam-kim')).not.toBeInTheDocument());
  expect(screen.getByText('kim의 세션을 끊었습니다.')).toBeInTheDocument();
});

test('내 세션을 끊을 때는 이 화면에서도 로그아웃된다고 알리고, 실패하면 이유를 대화상자에 보인다', async () => {
  mockAdmin.revokeSession.mockRejectedValue(new ApiError(404, 'SESSION_NOT_FOUND', '로그인 중인 세션을 찾을 수 없습니다.'));
  renderAdmin('/app/admin?tab=access&view=sessions');
  const me = await screen.findByTestId('admin-session-fam-me');
  fireEvent.click(within(me).getByRole('button', { name: 'boss 강제 로그아웃' }));
  const dialog = screen.getByRole('alertdialog');
  expect(dialog).toHaveTextContent('지금 이 화면을 쓰는 내 세션입니다.');
  fireEvent.click(within(dialog).getByRole('button', { name: '강제 로그아웃' }));
  expect(await within(dialog).findByText('로그인 중인 세션을 찾을 수 없습니다.')).toBeInTheDocument();
  expect(screen.getByTestId('admin-session-fam-me')).toBeInTheDocument();
});

test('로그인 기록: 종류·이유·봇을 말로, 검색·종류·기간 필터는 주소와 API로 간다', async () => {
  renderAdmin('/app/admin?tab=access&view=logins');
  const table = await screen.findByTestId('admin-logins');
  expect(within(table).getByText('로그인 실패')).toBeInTheDocument();
  expect(within(table).getByText('없는 아이디')).toBeInTheDocument();
  expect(within(table).getByText('토큰 재사용 감지')).toBeInTheDocument();
  // A bot is one tag and what it called itself (not "봇 · curl" plus a second tag).
  expect(within(table).getAllByText('봇')).toHaveLength(1);
  expect(within(table).getByText('curl')).toBeInTheDocument();
  expect(within(table).getByText('모바일 · iOS · Safari')).toBeInTheDocument();
  expect(mockAdmin.listLogins).toHaveBeenLastCalledWith({ q: '', event: '', from: '', to: '', page: 0, size: 50 });

  fireEvent.change(screen.getByRole('combobox', { name: '기록 종류' }), { target: { value: 'LOGIN_FAIL' } });
  await waitFor(() => expect(mockAdmin.listLogins).toHaveBeenLastCalledWith(expect.objectContaining({ event: 'LOGIN_FAIL' })));
  fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '2026-10-10' } });
  fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '2026-10-15' } });
  await waitFor(() => expect(mockAdmin.listLogins).toHaveBeenLastCalledWith(expect.objectContaining({ from: '2026-10-10', to: '2026-10-15' })));
  fireEvent.change(screen.getByRole('searchbox', { name: '아이디·IP 검색' }), { target: { value: '198.51' } });
  await waitFor(() => expect(mockAdmin.listLogins).toHaveBeenLastCalledWith(expect.objectContaining({ q: '198.51', event: 'LOGIN_FAIL' })), { timeout: 2000 });
  // Start after end: said in words.
  fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '2026-10-20' } });
  expect(await screen.findByText('시작일이 종료일보다 늦습니다.')).toBeInTheDocument();
});

test('로그인 기록을 불러오지 못하면 이유와 다시 시도', async () => {
  mockAdmin.listLogins.mockRejectedValueOnce(new ApiError(500, 'INTERNAL', '서버 오류'));
  renderAdmin('/app/admin?tab=access&view=logins');
  expect(await screen.findByText(/로그인 기록을 불러오지 못했습니다/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  expect(await screen.findByTestId('admin-logins')).toBeInTheDocument();
});

test('시스템 탭 외부 주소: 링크, 복사 버튼, 터널이 다시 시작되면 바뀐다는 안내', async () => {
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  mockAdmin.system.mockResolvedValue({ services: [], xcubePods: [], node: null, disk: null, publicUrl: 'https://locate-commands-summit-tooth.trycloudflare.com' });
  renderAdmin('/app/admin?tab=system');
  const link = await screen.findByRole('link', { name: /locate-commands-summit-tooth/ });
  expect(link).toHaveAttribute('href', 'https://locate-commands-summit-tooth.trycloudflare.com');
  expect(screen.getByText('임시 터널 주소는 터널이 다시 시작되면 바뀝니다.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '주소 복사' }));
  expect(await screen.findByText('외부 주소를 클립보드에 복사했습니다.')).toBeInTheDocument();
  expect(writeText).toHaveBeenCalledWith('https://locate-commands-summit-tooth.trycloudflare.com');
});

test('영어 화면: 같은 탭·문장 짝 (Sign-ins, warning, sessions)', async () => {
  renderAdmin('/app/admin?tab=access', 'en');
  expect(screen.getByRole('tab', { name: 'Sign-ins' })).toHaveAttribute('aria-selected', 'true');
  expect(await screen.findByText('Last 7 days')).toBeInTheDocument();
  expect(screen.getByText('42 sign-ins · 61 failed · 9 unique IPs · 3 signed in now')).toBeInTheDocument();
  expect(screen.getByText(/23 failed sign-ins within 10 minutes from 198\.51\.100\.66 · Russia \(RU\)/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Signed in' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sign-in record' })).toBeInTheDocument();
});

test('한국어·영어 사전의 접속 기록 문장은 같은 키와 같은 자리표시자를 쓴다', () => {
  const flat = (node: unknown, prefix = ''): Record<string, string> => Object.entries(node as Record<string, unknown>).reduce((out, [key, value]) => (
    typeof value === 'string' ? { ...out, [`${prefix}${key}`]: value } : { ...out, ...flat(value, `${prefix}${key}.`) }), {} as Record<string, string>);
  const ko = flat(koApp.admin.access);
  const en = flat(enApp.admin.access);
  expect(Object.keys(en).sort()).toEqual(Object.keys(ko).sort());
  const holes = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
  for (const key of Object.keys(ko)) expect([key, holes(en[key])]).toEqual([key, holes(ko[key])]);
  expect(enApp.admin.tabs.access).toBe('Sign-ins');
  expect(koApp.admin.tabs.access).toBe('접속 기록');
});
