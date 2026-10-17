/* S11 sections added with UR-63: contact e-mail (register → six-digit code → remove, F6), notification settings (F4,
   e-mail switch only when the server can send mail), and deleting one's own account (F6). APIs are mocked. */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ApiError } from '../../api/httpClient';
import { LanguageProvider } from '../../i18n';

const mockSignOut = jest.fn();
jest.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 8, email: 'designqa', name: '점검', role: 'PROJECT_MANAGER', status: 'ACTIVE', language: null }, signOut: mockSignOut, updateUser: jest.fn() }) }));
jest.mock('../../api/accountMail', () => ({ ...jest.requireActual('../../api/accountMail'), accountMail: { contact: jest.fn(), startVerification: jest.fn(), verify: jest.fn(), remove: jest.fn(), deleteMe: jest.fn(), mailStatus: jest.fn() } }));
jest.mock('../../api/notificationsApi', () => ({ ...jest.requireActual('../../api/notificationsApi'), notificationsApi: { prefs: jest.fn(), updatePrefs: jest.fn() } }));
const mockAccount = { updateProfile: jest.fn(), changePassword: jest.fn(), storageUsage: jest.fn() };
jest.mock('../api', () => ({ ...jest.requireActual('../api'), account: mockAccount }));

const mail = require('../../api/accountMail').accountMail as Record<string, jest.Mock>;
const notes = require('../../api/notificationsApi').notificationsApi as Record<string, jest.Mock>;
const SettingsPage = require('./SettingsPage').default;

const empty = { email: null, verified: false, pendingEmail: null, attemptsLeft: null, mailEnabled: true };
function Where() { const location = useLocation(); return <output data-testid="where">{location.pathname}{location.search}</output>; }
const renderPage = () => render(
  <LanguageProvider initial="ko">
    <MemoryRouter initialEntries={['/app/settings']}>
      <Where />
      <Routes><Route path="/app/settings" element={<SettingsPage />} /><Route path="/login" element={<h1>로그인</h1>} /></Routes>
    </MemoryRouter>
  </LanguageProvider>,
);
const section = (name: string) => screen.getByRole('region', { name });

beforeEach(() => {
  mockAccount.storageUsage.mockResolvedValue({ usedBytes: 0, quotaBytes: 0, datasetCount: 0, unknownSizeCount: 0, byKind: { ORIGINAL: 0, FUSION: 0, AI_RESULT: 0 } });
  mail.contact.mockResolvedValue(empty);
  notes.prefs.mockResolvedValue({ emailOnDone: false, browser: true, mailEnabled: true });
});

test('연락 이메일: 주소 → 6자리 코드 → 틀린 코드는 남은 횟수 → 맞으면 인증됨 → 삭제(확인)', async () => {
  mail.startVerification.mockResolvedValue({ ...empty, pendingEmail: 'kim@example.com', attemptsLeft: 5 });
  mail.verify
    .mockRejectedValueOnce(new ApiError(400, 'CODE_INVALID', 'x', undefined, { attemptsLeft: 4 }))
    .mockResolvedValue({ ...empty, email: 'kim@example.com', verified: true });
  mail.remove.mockResolvedValue(undefined);
  renderPage();
  await screen.findByRole('region', { name: '연락 이메일' });
  const box = section('연락 이메일');
  fireEvent.change(await within(box).findByLabelText('이메일'), { target: { value: 'not-an-email' } });
  fireEvent.click(within(box).getByRole('button', { name: '인증 코드 보내기' }));
  expect(within(box).getByText('이메일 주소 형식을 확인하세요.')).toBeInTheDocument();
  expect(mail.startVerification).not.toHaveBeenCalled();
  fireEvent.change(within(box).getByLabelText('이메일'), { target: { value: 'kim@example.com' } });
  fireEvent.click(within(box).getByRole('button', { name: '인증 코드 보내기' }));
  expect(await within(box).findByText('kim@example.com로 6자리 코드를 보냈습니다. 10분 안에 입력하세요.')).toBeInTheDocument();
  const code = within(box).getByLabelText('인증 코드');
  expect(code).toHaveAttribute('autocomplete', 'one-time-code');
  fireEvent.change(code, { target: { value: '12a34' } });
  expect(code).toHaveValue('1234');
  fireEvent.click(within(box).getByRole('button', { name: '확인' }));
  expect(within(box).getByText('숫자 6자리를 입력하세요.')).toBeInTheDocument();
  fireEvent.change(code, { target: { value: '111111' } });
  fireEvent.click(within(box).getByRole('button', { name: '확인' }));
  expect(await within(box).findByText('인증 코드가 맞지 않습니다. 남은 시도 4번')).toBeInTheDocument();
  fireEvent.change(within(box).getByLabelText('인증 코드'), { target: { value: '123456' } });
  fireEvent.click(within(box).getByRole('button', { name: '확인' }));
  expect(await within(box).findByText('인증됨')).toBeInTheDocument();
  expect(mail.verify).toHaveBeenLastCalledWith('123456');
  // The notification section now names the address.
  expect(within(section('알림')).getByText('kim@example.com로 보냅니다.')).toBeInTheDocument();
  fireEvent.click(within(box).getByRole('button', { name: '삭제' }));
  const dialog = await screen.findByRole('alertdialog', { name: '연락 이메일을 삭제할까요?' });
  fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }));
  await waitFor(() => expect(mail.remove).toHaveBeenCalled());
  expect(await within(box).findByLabelText('이메일')).toBeInTheDocument();
});

test('메일이 꺼진 서버: 이메일 구역은 관리자에게 문의하라고 하고, 알림의 이메일 스위치는 없다', async () => {
  mail.contact.mockResolvedValue({ ...empty, mailEnabled: false });
  notes.prefs.mockResolvedValue({ emailOnDone: false, browser: true, mailEnabled: false });
  renderPage();
  expect(await screen.findByText(/메일을 보낼 수 없어 이메일을 새로 인증할 수 없습니다. 관리자에게 문의하세요./)).toBeInTheDocument();
  expect(within(section('연락 이메일')).queryByLabelText('이메일')).not.toBeInTheDocument();
  await within(section('알림')).findByLabelText(/브라우저 알림/);
  expect(within(section('알림')).queryByLabelText(/이메일로도 받기/)).not.toBeInTheDocument();
});

test('알림 설정: 스위치를 바꾸면 바로 저장한다', async () => {
  notes.updatePrefs.mockResolvedValue({ emailOnDone: true, browser: true, mailEnabled: true });
  renderPage();
  const box = await screen.findByRole('region', { name: '알림' });
  const emailSwitch = await within(box).findByLabelText('작업이 끝나면 이메일로도 받기');
  expect(within(box).getByText(/인증된 연락 이메일이 있어야 보냅니다/)).toBeInTheDocument();
  fireEvent.click(emailSwitch);
  await waitFor(() => expect(notes.updatePrefs).toHaveBeenCalledWith({ emailOnDone: true }));
  expect(await within(box).findByText('저장했습니다')).toBeInTheDocument();
  expect(emailSwitch).toBeChecked();
});

test('계정 탈퇴: 아이디를 맞게 써야 켜지고, 틀린 비밀번호는 칸 아래, 성공하면 로그아웃 후 로그인 화면', async () => {
  mail.deleteMe.mockRejectedValueOnce(new ApiError(400, 'CURRENT_PASSWORD_INCORRECT', '현재 비밀번호가 맞지 않습니다.')).mockResolvedValue(undefined);
  renderPage();
  const box = await screen.findByRole('region', { name: '계정 탈퇴' });
  fireEvent.click(within(box).getByRole('button', { name: '계정 탈퇴…' }));
  const dialog = await screen.findByRole('alertdialog', { name: '계정을 탈퇴할까요?' });
  const confirm = within(dialog).getByRole('button', { name: '탈퇴하기' });
  expect(confirm).toBeDisabled();
  fireEvent.change(within(dialog).getByLabelText('현재 비밀번호'), { target: { value: 'secret123' } });
  fireEvent.change(within(dialog).getByLabelText('확인을 위해 아이디 "designqa"를 입력하세요'), { target: { value: 'DesignQA ' } });
  expect(confirm).toBeEnabled();
  fireEvent.click(confirm);
  expect(await within(dialog).findByText('현재 비밀번호가 맞지 않습니다.')).toBeInTheDocument();
  expect(mail.deleteMe).toHaveBeenCalledWith({ password: 'secret123', confirmLoginId: 'DesignQA' });
  fireEvent.click(confirm);
  await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
  expect(screen.getByTestId('where')).toHaveTextContent('/login?reason=deleted');
});

test('마지막 관리자는 탈퇴할 수 없다는 서버 문장을 보인다', async () => {
  mail.deleteMe.mockRejectedValue(new ApiError(409, 'LAST_ADMIN', 'x'));
  renderPage();
  fireEvent.click(within(await screen.findByRole('region', { name: '계정 탈퇴' })).getByRole('button', { name: '계정 탈퇴…' }));
  const dialog = await screen.findByRole('alertdialog');
  fireEvent.change(within(dialog).getByLabelText('현재 비밀번호'), { target: { value: 'secret123' } });
  fireEvent.change(within(dialog).getByLabelText(/아이디/), { target: { value: 'designqa' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '탈퇴하기' }));
  expect(await within(dialog).findByText('마지막 관리자 계정은 탈퇴할 수 없습니다. 다른 관리자를 먼저 지정하세요.')).toBeInTheDocument();
});
