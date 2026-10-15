/* S13 관리자 (UR-59): ADMIN-only page, users table actions (self-row guards, role change, block, password reset
   shown once with copy, quota, typed removal), data delete and job cancel, system and record. */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
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

const GIB = 1024 ** 3;
const user = (id: string, loginId: string, role: string, extra: Record<string, unknown> = {}) => ({
  id, loginId, name: `${loginId} 이름`, role, status: 'ACTIVE', language: 'ko', createdAt: '2026-09-01T00:00:00Z', lastLoginAt: '2026-10-14T01:00:00Z', deletedAt: null, ...extra,
});
const USERS = [user('1', 'boss', 'ADMIN'), user('2', 'kim', 'PROJECT_MANAGER'), user('3', 'lee', 'USER', { status: 'BLOCKED' })];

function renderAdmin(path = '/app/admin', lang: 'ko' | 'en' = 'ko') {
  return render(
    <LanguageProvider initial={lang}>
      <MemoryRouter initialEntries={[path]}><AdminPage /></MemoryRouter>
    </LanguageProvider>,
  );
}
const row = (id: string) => screen.getByTestId(`admin-user-${id}`);

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 1, email: 'boss', name: '관리자', role: 'ADMIN', status: 'ACTIVE' };
  mockAdmin.listUsers.mockResolvedValue({ items: USERS.map((item) => ({ ...item })), total: 3 });
  mockAdmin.userSummaries.mockResolvedValue([
    { userId: '1', datasetCount: 2, projectCount: 1, usedBytes: 10 * GIB, quotaBytes: 50 * GIB, quotaIsDefault: true },
    { userId: '2', datasetCount: 5, projectCount: 2, usedBytes: 47 * GIB, quotaBytes: 50 * GIB, quotaIsDefault: false },
  ]);
  mockAdmin.listJobs.mockResolvedValue({ items: [], unavailable: [] });
});

test('관리자가 아니면 화면 대신 이유를 보이고 관리자 API를 부르지 않는다', async () => {
  mockUser = { ...mockUser, role: 'PROJECT_MANAGER' };
  renderAdmin();
  expect(screen.getByText('관리자만 볼 수 있는 화면입니다.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '대시보드로' })).toHaveAttribute('href', '/app');
  expect(mockAdmin.listUsers).not.toHaveBeenCalled();
});

test('사용자 탭: 탭 5개, 요약을 합친 표, 내 행은 위험 동작이 꺼지고 이유가 있다', async () => {
  renderAdmin();
  expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['사용자', '데이터·작업', '시스템', '접속 기록', '기록']);
  await screen.findByTestId('admin-user-1');
  expect(document.title).toBe('관리자 · XCube');
  await waitFor(() => expect(mockAdmin.userSummaries).toHaveBeenCalledWith(['1', '2', '3']));
  const me = row('1');
  expect(within(me).getByText('나')).toBeInTheDocument();
  expect(within(me).getByRole('combobox', { name: 'boss 등급' })).toBeDisabled();
  const block = within(me).getByRole('button', { name: 'boss 차단' });
  expect(block).toHaveAttribute('aria-disabled', 'true');
  expect(block).toHaveAccessibleDescription('내 계정에는 쓸 수 없습니다.');
  expect(within(me).getByRole('button', { name: 'boss 탈퇴 처리' })).toHaveAccessibleDescription('내 계정에는 쓸 수 없습니다.');
  expect(within(me).getByRole('button', { name: 'boss 비밀번호 초기화' })).toHaveAccessibleDescription('내 비밀번호는 계정 설정에서 바꿉니다.');
  // Clicking a locked action opens nothing.
  fireEvent.click(block);
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  // Quota stays usable on the own row.
  expect(within(me).getByRole('button', { name: 'boss 저장 한도' })).not.toHaveAttribute('aria-disabled');
  // Backoffice numbers: counts, usage / quota, default and near-limit tags.
  await within(me).findByText('10.0 GB / 50.0 GB');
  expect(within(me).getByText('기본 한도')).toBeInTheDocument();
  expect(within(row('2')).getByText('94%')).toBeInTheDocument();
  expect(within(row('2')).getByRole('link', { name: 'kim의 데이터 5개 보기' })).toHaveAttribute('href', '/app/admin?tab=data&view=datasets&owner=2');
  expect(within(row('3')).getByText('차단됨')).toBeInTheDocument();
  expect(within(row('3')).getByRole('button', { name: 'lee 차단 해제' })).toBeInTheDocument();
});

test('등급 바꾸기는 확인 뒤 PATCH {role}하고 행을 고친다; LAST_ADMIN은 dialog 안에 이유로 남는다', async () => {
  mockAdmin.updateUser.mockResolvedValueOnce({ ...USERS[1], role: 'USER' });
  renderAdmin();
  const select = within(await screen.findByTestId('admin-user-2')).getByRole('combobox', { name: 'kim 등급' });
  fireEvent.change(select, { target: { value: 'USER' } });
  const dialog = screen.getByRole('alertdialog', { name: '등급 바꾸기' });
  expect(dialog).toHaveTextContent('kim의 등급을 프로젝트 관리자에서 유저(으)로 바꿉니다.');
  fireEvent.click(within(dialog).getByRole('button', { name: '등급 바꾸기' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  expect(mockAdmin.updateUser).toHaveBeenCalledWith('2', { role: 'USER' });
  expect(within(row('2')).getByRole('combobox', { name: 'kim 등급' })).toHaveValue('USER');

  mockAdmin.updateUser.mockRejectedValueOnce(new ApiError(409, 'LAST_ADMIN', 'last'));
  fireEvent.change(within(row('2')).getByRole('combobox', { name: 'kim 등급' }), { target: { value: 'PROJECT_USER' } });
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '등급 바꾸기' }));
  expect(await within(screen.getByRole('alertdialog')).findByText('관리자가 한 명 이상 남아 있어야 합니다.')).toBeInTheDocument();
});

test('차단은 확인 dialog 뒤 status BLOCKED, 차단 해제는 바로 ACTIVE', async () => {
  mockAdmin.updateUser.mockImplementation(async (id: string, patch: { status: string }) => ({ ...USERS.find((item) => item.id === id), ...patch }));
  renderAdmin();
  fireEvent.click(within(await screen.findByTestId('admin-user-2')).getByRole('button', { name: 'kim 차단' }));
  const dialog = screen.getByRole('alertdialog', { name: '계정 차단' });
  fireEvent.click(within(dialog).getByRole('button', { name: '차단' }));
  await waitFor(() => expect(mockAdmin.updateUser).toHaveBeenCalledWith('2', { status: 'BLOCKED' }));
  expect(await within(row('2')).findByText('차단됨')).toBeInTheDocument();
  fireEvent.click(within(row('3')).getByRole('button', { name: 'lee 차단 해제' }));
  await waitFor(() => expect(mockAdmin.updateUser).toHaveBeenCalledWith('3', { status: 'ACTIVE' }));
  expect(await within(row('3')).findByText('사용 중')).toBeInTheDocument();
});

test('비밀번호 초기화: 확인 → 임시 비밀번호를 한 번 보이고 복사, 닫으면 다시 볼 수 없다', async () => {
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  mockAdmin.resetPassword.mockResolvedValue({ temporaryPassword: 'Tmp-7hK2pQ9xWm' });
  renderAdmin();
  fireEvent.click(within(await screen.findByTestId('admin-user-2')).getByRole('button', { name: 'kim 비밀번호 초기화' }));
  const confirm = screen.getByRole('alertdialog', { name: '비밀번호 초기화' });
  expect(confirm).toHaveTextContent('한 번만 보여 줍니다');
  fireEvent.click(within(confirm).getByRole('button', { name: '초기화' }));
  const shown = await screen.findByRole('dialog', { name: '임시 비밀번호' });
  expect(mockAdmin.resetPassword).toHaveBeenCalledWith('2');
  expect(within(shown).getByLabelText('임시 비밀번호')).toHaveValue('Tmp-7hK2pQ9xWm');
  expect(within(shown).getByLabelText('임시 비밀번호')).toHaveAttribute('readonly');
  expect(shown).toHaveTextContent('이 창을 닫으면 다시 볼 수 없습니다.');
  await act(async () => { fireEvent.click(within(shown).getByRole('button', { name: '복사' })); });
  expect(writeText).toHaveBeenCalledWith('Tmp-7hK2pQ9xWm');
  expect(within(shown).getByRole('button', { name: '복사됨' })).toBeInTheDocument();
  expect(within(shown).getByText('클립보드에 복사했습니다.')).toBeInTheDocument();
  fireEvent.click(within(shown).getByRole('button', { name: '전달했습니다' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByDisplayValue('Tmp-7hK2pQ9xWm')).not.toBeInTheDocument();
  expect(document.body).not.toHaveTextContent('Tmp-7hK2pQ9xWm');
});

test('복사할 수 없는 브라우저에서는 글자를 선택하고 직접 복사하라고 안내한다', async () => {
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
  mockAdmin.resetPassword.mockResolvedValue({ temporaryPassword: 'Tmp-abcdefghij' });
  renderAdmin();
  fireEvent.click(within(await screen.findByTestId('admin-user-2')).getByRole('button', { name: 'kim 비밀번호 초기화' }));
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '초기화' }));
  const shown = await screen.findByRole('dialog', { name: '임시 비밀번호' });
  await act(async () => { fireEvent.click(within(shown).getByRole('button', { name: '복사' })); });
  expect(within(shown).getByText('복사하지 못했습니다. 글자를 선택해 두었으니 직접 복사하세요.')).toBeInTheDocument();
});

test('저장 한도: 직접 정하기는 GB를 바이트로, 기본 한도 쓰기는 null로 보낸다', async () => {
  mockAdmin.setQuota.mockResolvedValue(undefined);
  renderAdmin();
  await within(await screen.findByTestId('admin-user-2')).findByText('47.0 GB / 50.0 GB');
  fireEvent.click(within(row('2')).getByRole('button', { name: 'kim 저장 한도' }));
  let dialog = screen.getByRole('dialog', { name: 'kim 저장 한도' });
  // kim has a custom 50 GB quota: the custom choice is open with its value.
  expect(within(dialog).getByLabelText('한도 (GB)')).toHaveValue(50);
  fireEvent.change(within(dialog).getByLabelText('한도 (GB)'), { target: { value: '0' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '한도 저장' }));
  expect(within(dialog).getByText('0보다 큰 숫자를 GB 단위로 입력하세요.')).toBeInTheDocument();
  fireEvent.change(within(dialog).getByLabelText('한도 (GB)'), { target: { value: '100' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '한도 저장' }));
  await waitFor(() => expect(mockAdmin.setQuota).toHaveBeenCalledWith('2', 100 * GIB));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

  fireEvent.click(within(row('2')).getByRole('button', { name: 'kim 저장 한도' }));
  dialog = screen.getByRole('dialog', { name: 'kim 저장 한도' });
  fireEvent.click(within(dialog).getByLabelText('기본 한도 쓰기'));
  fireEvent.click(within(dialog).getByRole('button', { name: '한도 저장' }));
  await waitFor(() => expect(mockAdmin.setQuota).toHaveBeenLastCalledWith('2', null));
});

test('탈퇴는 아이디를 그대로 입력해야 버튼이 켜진다', async () => {
  mockAdmin.deleteUser.mockResolvedValue(undefined);
  renderAdmin();
  fireEvent.click(within(await screen.findByTestId('admin-user-2')).getByRole('button', { name: 'kim 탈퇴 처리' }));
  const dialog = screen.getByRole('alertdialog', { name: '계정 탈퇴 처리' });
  const confirm = within(dialog).getByRole('button', { name: '탈퇴 처리' });
  expect(confirm).toBeDisabled();
  fireEvent.change(within(dialog).getByLabelText('확인을 위해 아이디 kim을(를) 입력하세요'), { target: { value: 'Kim' } });
  expect(confirm).toBeDisabled();
  fireEvent.change(within(dialog).getByLabelText('확인을 위해 아이디 kim을(를) 입력하세요'), { target: { value: 'kim' } });
  expect(confirm).toBeEnabled();
  fireEvent.click(confirm);
  await waitFor(() => expect(mockAdmin.deleteUser).toHaveBeenCalledWith('2'));
  await waitFor(() => expect(mockAdmin.listUsers).toHaveBeenCalledTimes(3)); // directory + first load + refresh
});

test('데이터·작업: 소유자 이름을 보이고, 다른 사용자의 데이터를 확인 뒤 지우고, 멈춘 작업을 취소한다', async () => {
  mockAdmin.listDatasets.mockResolvedValue({ items: [{ id: '101', name: '대청호', kind: 'ORIGINAL', ownerId: '2', ownerLoginId: null, xcubeDatasetId: 'u2-d101', sizeBytes: 2 * GIB, createdAt: '2026-10-01T00:00:00Z', status: 'AVAILABLE' }], total: 1 });
  mockAdmin.deleteDataset.mockResolvedValue(undefined);
  renderAdmin('/app/admin?tab=data&owner=2');
  const table = await screen.findByRole('table');
  await waitFor(() => expect(within(table).getByText('kim')).toBeInTheDocument());
  expect(mockAdmin.listDatasets).toHaveBeenCalledWith(expect.objectContaining({ ownerId: '2' }));
  expect(within(table).getByText('2.0 GB')).toBeInTheDocument();
  fireEvent.click(within(table).getByRole('button', { name: '대청호 삭제' }));
  const dialog = screen.getByRole('alertdialog', { name: '다른 사용자의 데이터 삭제' });
  expect(dialog).toHaveTextContent('(소유자 kim)');
  fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }));
  await waitFor(() => expect(mockAdmin.deleteDataset).toHaveBeenCalledWith('101'));
  expect(await screen.findByText('조건에 맞는 항목이 없습니다.')).toBeInTheDocument();

  mockAdmin.listJobs.mockResolvedValue({ items: [{ id: '9', name: '멈춘 GEE', type: 'GEE_TO_ZARR', status: 'RUNNING', progress: 0.2, createdAt: '2026-10-14T00:00:00Z', ownerId: '2', service: 'GENERATION' }], unavailable: ['AI_WATER'] });
  mockAdmin.cancelJob.mockResolvedValue(undefined);
  fireEvent.click(screen.getByRole('button', { name: '작업' }));
  expect(await screen.findByText('멈춘 GEE')).toBeInTheDocument();
  expect(screen.getByText('AI 처리 서버의 작업을 불러오지 못했습니다. 나머지 작업만 표시합니다.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '멈춘 GEE 취소' }));
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '작업 취소' }));
  await waitFor(() => expect(mockAdmin.cancelJob).toHaveBeenCalledWith(expect.objectContaining({ id: '9', type: 'GEE_TO_ZARR' })));
});

test('시스템: 준비 상태는 글자로, 메모리·디스크는 meter와 글자, 모르는 값은 "알 수 없음"', async () => {
  mockAdmin.system.mockResolvedValue({
    services: [{ name: 'backoffice', ready: true, restarts: 0, startedAt: '2026-10-13T00:00:00Z' }, { name: 'ai-processing', ready: false, restarts: 4, startedAt: null }],
    xcubePods: [{ name: 'xcube-user-2', userId: '2', phase: 'Running', ready: true, memoryBytes: 400 * 1024 ** 2 }],
    node: { memoryUsedBytes: 7.2 * GIB, memoryTotalBytes: 8 * GIB, cpuMilli: 1250 },
    disk: null,
    publicUrl: null,
  });
  renderAdmin('/app/admin?tab=system');
  expect(await screen.findByText('backoffice')).toBeInTheDocument();
  expect(screen.getByText('준비 안 됨')).toBeInTheDocument();
  const memory = screen.getByRole('meter', { name: '메모리 (노드)' });
  expect(memory).toHaveAttribute('aria-valuenow', '90');
  expect(memory).toHaveAttribute('aria-valuetext', '7.2 GB / 8.0 GB · 90%');
  expect(screen.queryByRole('meter', { name: '데이터 디스크' })).not.toBeInTheDocument();
  expect(screen.getAllByText('알 수 없음').length).toBeGreaterThan(0);
  expect(screen.getByText('CPU 1.25코어 사용 중 (1,250m)')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText('xcube-user-2').closest('tr')).toHaveTextContent('kim'));
  expect(screen.getByText('설정되지 않았습니다.')).toBeInTheDocument();
  expect(screen.getByText('모니터링 대시보드가 아직 연결되지 않았습니다.')).toBeInTheDocument();
});

test('기록: 동작·대상·내용을 말로 보인다 (등급은 이름으로)', async () => {
  mockAdmin.listAudit.mockResolvedValue({ items: [
    { id: '2', adminUserId: '1', adminLoginId: null, action: 'USER_ROLE_CHANGE', targetType: 'USER', targetId: '2', detail: { from: 'PROJECT_MANAGER', to: 'USER' }, createdAt: '2026-10-14T01:00:00Z' },
    { id: 'auth:3', adminUserId: '1', adminLoginId: 'boss', action: 'USER_UPDATE', targetType: 'USER', targetId: '3', detail: { loginId: 'lee', before: { role: 'USER', status: 'ACTIVE' }, after: { role: 'USER', status: 'BLOCKED' } }, createdAt: '2026-10-13T05:00:00Z' },
    { id: '1', adminUserId: '1', adminLoginId: 'boss', action: 'SOMETHING_NEW', targetType: 'JOB', targetId: '9', detail: null, createdAt: '2026-10-13T01:00:00Z' },
  ], total: 3 });
  renderAdmin('/app/admin?tab=audit');
  expect(await screen.findByText('등급 변경')).toBeInTheDocument();
  expect(screen.getByText('프로젝트 관리자 → 유저')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText('사용자 kim')).toBeInTheDocument());
  expect(screen.getByText('SOMETHING_NEW')).toBeInTheDocument();
  // auth's USER_UPDATE with before/after reads as the change it was.
  expect(screen.getByText('차단')).toBeInTheDocument();
  expect(screen.getByText('사용 중 → 차단됨')).toBeInTheDocument();
  expect(screen.getByText('사용자 lee')).toBeInTheDocument();
  expect(screen.getByText('작업 #9')).toBeInTheDocument();
});

test('영어 화면도 같은 구조와 문장 짝을 쓴다', async () => {
  renderAdmin('/app/admin', 'en');
  expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Users', 'Data & jobs', 'System', 'Sign-ins', 'Record']);
  const me = await screen.findByTestId('admin-user-1');
  expect(within(me).getByRole('button', { name: 'Block boss' })).toHaveAccessibleDescription('Not available for your own account.');
  expect(within(me).getByText('You')).toBeInTheDocument();
});
