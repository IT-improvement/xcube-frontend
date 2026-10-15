/* S13 접속 기록 › 로그인 중 (MON5, MON-contract §8): sessions grouped by user with active/idle counts, expand to rows,
   "유휴 · n분 전", sign out all of a user's other sessions (own current kept), bot sessions folded, Korean/English. */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider } from '../../i18n';
import { createT } from '../../i18n/core';
import koApp from '../../i18n/app/ko';
import enApp from '../../i18n/app/en';

jest.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 1, email: 'boss', name: '관리자', role: 'ADMIN', status: 'ACTIVE' }, signOut: jest.fn(), updateUser: jest.fn() }) }));
const mockAdmin = {
  listUsers: jest.fn(), updateUser: jest.fn(), resetPassword: jest.fn(), deleteUser: jest.fn(), listAudit: jest.fn(),
  userSummaries: jest.fn(), setQuota: jest.fn(), listDatasets: jest.fn(), deleteDataset: jest.fn(), listProjects: jest.fn(),
  system: jest.fn(), listJobs: jest.fn(), cancelJob: jest.fn(),
  listLogins: jest.fn(), listSessions: jest.fn(), revokeSession: jest.fn(), revokeUserSessions: jest.fn(), accessSummary: jest.fn(),
  listVisits: jest.fn(), visitSummary: jest.fn(),
};
jest.mock('../api', () => ({ ...jest.requireActual('../api'), admin: mockAdmin }));

const AdminPage = require('./AdminPage').default;
const { agoText, groupSessions } = require('./admin/AccessTab');

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const DESK = { device: 'DESKTOP', os: 'macOS', browser: 'Chrome', bot: false };
const session = (familyId: string, userId: string, loginId: string, state: 'ACTIVE' | 'IDLE', minutes: number, extra: Record<string, unknown> = {}) => ({
  familyId, userId, loginId, name: null, role: 'ADMIN', startedAt: ago(minutes + 30), lastRefreshAt: ago(minutes), expiresAt: null,
  ip: '203.0.113.5', country: 'KR', ...DESK, current: false, state, ...extra,
});
const LIST = () => ({
  activeWindowSeconds: 900,
  items: [
    session('me', '1', 'boss', 'ACTIVE', 1, { current: true }),
    session('kim-1', '2', 'kim', 'ACTIVE', 3),
    session('boss-old-1', '1', 'boss', 'IDLE', 23),
    session('boss-old-2', '1', 'boss', 'IDLE', 65),
    session('boss-curl', '1', 'boss', 'IDLE', 90, { device: 'BOT', os: null, browser: 'curl', bot: true }),
    session('robot', '3', 'robot', 'IDLE', 40, { device: 'BOT', os: null, browser: 'HeadlessChrome', bot: true }),
  ],
  perUser: [
    { userId: '1', loginId: 'boss', name: '관리자', active: 1, idle: 3 },
    { userId: '2', loginId: 'kim', name: null, active: 1, idle: 0 },
    { userId: '3', loginId: 'robot', name: null, active: 0, idle: 1 },
  ],
});

function renderSessions(lang: 'ko' | 'en' = 'ko', query = '') {
  return render(
    <LanguageProvider initial={lang}>
      <MemoryRouter initialEntries={[`/app/admin?tab=access&view=sessions${query}`]}><AdminPage /></MemoryRouter>
    </LanguageProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAdmin.listUsers.mockResolvedValue({ items: [], total: 0 });
  mockAdmin.listSessions.mockResolvedValue(LIST());
  mockAdmin.revokeUserSessions.mockResolvedValue({ revoked: 3, keptCurrent: true });
  mockAdmin.revokeSession.mockResolvedValue(undefined);
});

test('사용자별로 묶어 "boss · 활동 중 1 · 유휴 n"을 보이고, 펼치면 세션 행이 나오며 유휴는 "유휴 · 23분 전"', async () => {
  renderSessions();
  const toggle = await screen.findByRole('button', { name: 'boss 활동 중 1 · 유휴 2' }); // the curl session is folded away
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByRole('button', { name: 'kim 활동 중 1 · 유휴 0' })).toBeInTheDocument();
  expect(screen.queryByTestId('admin-session-me')).not.toBeInTheDocument();
  expect(screen.getByText('세션 6개 · 사용자 3명')).toBeInTheDocument();
  expect(screen.getByText(/15분 안에 갱신되면 활동 중/)).toBeInTheDocument();

  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const group = screen.getByTestId('admin-session-group-1');
  const rows = within(group).getAllByTestId(/^admin-session-/);
  expect(rows.map((row) => row.dataset.testid)).toEqual(['admin-session-me', 'admin-session-boss-old-1', 'admin-session-boss-old-2']);
  expect(within(rows[0]).getByText('활동 중')).toBeInTheDocument();
  expect(within(rows[0]).getByText('이 기기')).toBeInTheDocument();
  expect(within(rows[1]).getByText('유휴 · 23분 전')).toBeInTheDocument();
  expect(within(rows[2]).getByText('유휴 · 1시간 5분 전')).toBeInTheDocument();
  fireEvent.click(toggle);
  expect(screen.queryByTestId('admin-session-me')).not.toBeInTheDocument();
});

test('봇 세션 숨기기(기본 켬): 자동 도구 세션은 개수만, 끄거나 "보이기"를 누르면 행과 봇만 있는 사용자가 나온다', async () => {
  renderSessions();
  const hide = await screen.findByRole('checkbox', { name: '봇 세션 숨기기' });
  expect(hide).toBeChecked();
  expect(await screen.findByTestId('admin-session-bots')).toHaveTextContent('자동 도구(curl·Headless 브라우저 등) 세션 2개는 접어 두었습니다.');
  expect(screen.queryByRole('button', { name: /^robot / })).not.toBeInTheDocument();
  fireEvent.click(within(screen.getByTestId('admin-session-bots')).getByRole('button', { name: '보이기' }));
  expect(hide).not.toBeChecked();
  expect(screen.queryByTestId('admin-session-bots')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'boss 활동 중 1 · 유휴 3' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'robot 활동 중 0 · 유휴 1' }));
  expect(within(screen.getByTestId('admin-session-robot')).getByText('봇')).toBeInTheDocument();
  fireEvent.click(hide);
  expect(screen.getByTestId('admin-session-bots')).toBeInTheDocument();
});

test('내 묶음의 "다른 세션 모두 끊기": 확인 dialog(내 세션 유지, 개수), 끊은 뒤 내 세션만 남고 알린다', async () => {
  renderSessions();
  const group = await screen.findByTestId('admin-session-group-1');
  fireEvent.click(within(group).getByRole('button', { name: '이 사용자의 다른 세션 모두 끊기' }));
  const dialog = screen.getByRole('alertdialog');
  expect(dialog).toHaveTextContent('boss의 다른 세션을 모두 끊을까요?');
  expect(dialog).toHaveTextContent('지금 이 화면을 쓰는 내 세션은 그대로 두고 나머지 3개를 끊습니다.');
  expect(dialog).toHaveTextContent('최대 15분');
  fireEvent.click(within(dialog).getByRole('button', { name: '3개 끊기' }));
  await waitFor(() => expect(mockAdmin.revokeUserSessions).toHaveBeenCalledWith('1', true));
  expect(await screen.findByText('boss의 세션 3개를 끊었습니다.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'boss 활동 중 1 · 유휴 0' })).toBeInTheDocument();
  // boss's curl session ended too; robot's is another user's and stays folded.
  expect(screen.getByTestId('admin-session-bots')).toHaveTextContent('세션 1개는 접어 두었습니다.');
  fireEvent.click(screen.getByRole('checkbox', { name: '봇 세션 숨기기' }));
  expect(screen.getByRole('button', { name: /^robot / })).toBeInTheDocument();
  // Nothing else of mine to end: no button.
  expect(within(screen.getByTestId('admin-session-group-1')).queryByRole('button', { name: /모두 끊기/ })).not.toBeInTheDocument();
});

test('다른 사용자 묶음은 "세션 모두 끊기", 실패하면 dialog에 이유', async () => {
  const { ApiError } = jest.requireActual('../../api/httpClient');
  mockAdmin.revokeUserSessions.mockRejectedValue(new ApiError(404, 'USER_NOT_FOUND', '사용자를 찾을 수 없습니다.'));
  renderSessions();
  const group = await screen.findByTestId('admin-session-group-2');
  fireEvent.click(within(group).getByRole('button', { name: '이 사용자의 세션 모두 끊기' }));
  const dialog = screen.getByRole('alertdialog');
  expect(dialog).toHaveTextContent('kim의 세션 1개를 모두 끊습니다.');
  fireEvent.click(within(dialog).getByRole('button', { name: '1개 끊기' }));
  await waitFor(() => expect(mockAdmin.revokeUserSessions).toHaveBeenCalledWith('2', true));
  expect(await within(dialog).findByText(/사용자를 찾을 수 없습니다/)).toBeInTheDocument();
});

test('사용자가 하나뿐이면 펼쳐서 보인다', async () => {
  mockAdmin.listSessions.mockResolvedValue({ activeWindowSeconds: 600, items: [session('only', '2', 'kim', 'IDLE', 12)], perUser: [{ userId: '2', loginId: 'kim', name: null, active: 0, idle: 1 }] });
  renderSessions();
  expect(await screen.findByTestId('admin-session-only')).toHaveTextContent('유휴 · 12분 전');
  expect(screen.getByText(/10분 안에 갱신되면 활동 중/)).toBeInTheDocument(); // window from the server
});

test('영어 화면', async () => {
  renderSessions('en');
  const toggle = await screen.findByRole('button', { name: 'boss 1 active · 2 idle' });
  fireEvent.click(toggle);
  expect(within(screen.getByTestId('admin-session-boss-old-1')).getByText('Idle · 23 min ago')).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Hide bot sessions' })).toBeChecked();
  expect(screen.getByRole('button', { name: 'Sign out this user’s other sessions' })).toBeInTheDocument();
  expect(screen.getByText('6 sessions · 3 users')).toBeInTheDocument();
});

test('agoText·groupSessions, 한·영 사전 짝과 자리표시자', () => {
  const t = createT('ko');
  const now = Date.parse('2026-10-15T03:00:00Z');
  expect(agoText('2026-10-15T02:59:40Z', now, t)).toBe('방금');
  expect(agoText('2026-10-15T02:37:00Z', now, t)).toBe('23분 전');
  expect(agoText('2026-10-15T01:00:00Z', now, t)).toBe('2시간 전');
  expect(agoText(null, now, t)).toBe('알 수 없음');
  const groups = groupSessions(LIST(), true);
  expect(groups.map((g: any) => [g.key, g.all.length, g.shown.length])).toEqual([['1', 4, 3], ['2', 1, 1], ['3', 1, 0]]);

  const ko = (koApp as any).admin.access.sessions;
  const en = (enApp as any).admin.access.sessions;
  expect(Object.keys(en).sort()).toEqual(Object.keys(ko).sort());
  const vars = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
  for (const key of Object.keys(ko)) expect(vars(en[key])).toEqual(vars(ko[key]));
  expect((enApp as any).admin.audit.actions.sessionRevokeAll).toBeTruthy();
  const { auditActionLabel, auditDetail } = require('./admin/AuditTab');
  const entry = { id: '9', adminUserId: '1', adminLoginId: 'boss', action: 'SESSION_REVOKE_ALL', targetType: 'USER', targetId: '1', detail: { loginId: 'boss', revoked: 3, keptCurrent: true }, createdAt: null };
  expect(auditActionLabel('SESSION_REVOKE_ALL', 'ko')).toBe('세션 모두 끊기');
  expect(auditActionLabel('SESSION_REVOKE', 'ko')).toBe('강제 로그아웃');
  expect(auditDetail(entry, 'ko')).toBe('세션 3개 끊음 · 내 현재 세션은 유지');
  expect(auditDetail({ ...entry, detail: { loginId: 'kim', revoked: 2, keptCurrent: false } }, 'en')).toBe('2 sessions ended');
  expect(vars((enApp as any).admin.audit.sessionsEnded)).toEqual(vars((koApp as any).admin.audit.sessionsEnded));
});
