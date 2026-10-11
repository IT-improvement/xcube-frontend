/* S11 계정 설정: route, profile, password, storage, and the page in English. */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ApiError } from '../../api/httpClient';
import { hasHangul, LanguageProvider } from '../../i18n';

const mockUpdateUser = jest.fn();
const mockUser = { id: 1, email: 'hong', name: '홍길동', role: 'USER', status: 'ACTIVE', language: null };
jest.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ user: mockUser, signOut: jest.fn(), updateUser: mockUpdateUser }) }));
jest.mock('../jobs', () => ({ useActiveJobCount: () => 0, JobsFeedProvider: ({ children }: { children: unknown }) => children }));
const mockAccount = { updateProfile: jest.fn(), changePassword: jest.fn(), storageUsage: jest.fn() };
jest.mock('../api', () => ({ ...jest.requireActual('../api'), account: mockAccount }));

const SettingsPage = require('./SettingsPage').default;
const AppSection = require('../AppSection').default;

const GIB = 1024 ** 3;
const usage = (used: number, extra: Record<string, unknown> = {}) => ({
  usedBytes: used, quotaBytes: 50 * GIB, datasetCount: 12, unknownSizeCount: 0,
  byKind: { ORIGINAL: used * 0.75, FUSION: used * 0.25, AI_RESULT: 0 }, ...extra,
});

function renderPage(initial?: 'ko' | 'en') {
  return render(
    <LanguageProvider initial={initial}>
      <MemoryRouter initialEntries={['/app/settings']}><SettingsPage /></MemoryRouter>
    </LanguageProvider>,
  );
}
const section = (name: string) => screen.getByRole('region', { name });

beforeEach(() => {
  jest.clearAllMocks();
  mockAccount.storageUsage.mockResolvedValue(usage(10 * GIB));
});

test('/app/settings는 앱 셸 안에서 계정 설정을 지연 로딩하고 탭 제목을 정한다', async () => {
  render(
    <LanguageProvider>
      <MemoryRouter initialEntries={['/app/settings']}>
        <Routes><Route path="/app/*" element={<AppSection />} /></Routes>
      </MemoryRouter>
    </LanguageProvider>,
  );
  expect(await screen.findByRole('heading', { level: 1, name: '계정 설정' })).toBeInTheDocument();
  expect(screen.getByRole('navigation', { name: '주 메뉴' })).toBeInTheDocument();
  expect(document.title).toBe('계정 설정 · XCube');
  expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual(['프로필', '언어', '비밀번호', '저장 용량']);
  await screen.findByRole('meter');
});

test('프로필: 아이디는 읽기 전용, 이름 검증(빈 값·50자 초과)은 입력 아래에, 저장 중 → 저장됨', async () => {
  let finish: (value: unknown) => void = () => {};
  mockAccount.updateProfile.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  renderPage();
  const profile = section('프로필');
  expect(within(profile).getByText('hong')).toBeInTheDocument();
  expect(within(profile).queryByRole('textbox', { name: '아이디' })).not.toBeInTheDocument();
  const name = within(profile).getByLabelText('이름');
  const save = within(profile).getByRole('button', { name: '이름 저장' });
  expect(name).toHaveValue('홍길동');
  expect(save).toBeDisabled();

  fireEvent.change(name, { target: { value: '   ' } });
  fireEvent.click(save);
  expect(name).toHaveAccessibleDescription(/이름을 입력하세요/);
  expect(name).toHaveFocus();
  fireEvent.change(name, { target: { value: '가'.repeat(51) } });
  fireEvent.click(save);
  expect(name).toHaveAccessibleDescription(/50자 이하/);
  expect(mockAccount.updateProfile).not.toHaveBeenCalled();

  fireEvent.change(name, { target: { value: '  김철수 ' } });
  fireEvent.click(save);
  expect(mockAccount.updateProfile).toHaveBeenCalledWith({ name: '김철수' });
  expect(within(profile).getByRole('button', { name: '저장하는 중…' })).toBeDisabled();
  await act(async () => finish({ ...mockUser, name: '김철수' }));
  expect(within(profile).getByRole('button', { name: '저장됨' })).toBeDisabled();
  expect(mockUpdateUser).toHaveBeenCalledWith({ name: '김철수' });
  expect(screen.getByText('이름을 저장했습니다.')).toBeInTheDocument();
});

test('프로필: 서버 오류는 섹션 안 경고로 보인다', async () => {
  mockAccount.updateProfile.mockRejectedValue(new ApiError(400, 'NOTHING_TO_UPDATE', ''));
  renderPage();
  const profile = section('프로필');
  fireEvent.change(within(profile).getByLabelText('이름'), { target: { value: '김철수' } });
  fireEvent.click(within(profile).getByRole('button', { name: '이름 저장' }));
  expect(await within(profile).findByRole('alert')).toHaveTextContent('바꿀 내용이 없습니다.');
});

function fillPassword(current: string, next: string, confirm = next) {
  const form = section('비밀번호');
  fireEvent.change(within(form).getByLabelText('현재 비밀번호'), { target: { value: current } });
  fireEvent.change(within(form).getByLabelText('새 비밀번호'), { target: { value: next } });
  fireEvent.change(within(form).getByLabelText('새 비밀번호 확인'), { target: { value: confirm } });
  fireEvent.click(within(form).getByRole('button', { name: '비밀번호 변경' }));
  return form;
}

test('비밀번호: autocomplete·표시 버튼·규칙 안내, 성공하면 알림과 “다른 기기에서는 로그아웃되었습니다”', async () => {
  mockAccount.changePassword.mockResolvedValue(undefined);
  renderPage();
  const form = section('비밀번호');
  expect(within(form).getByLabelText('현재 비밀번호')).toHaveAttribute('autocomplete', 'current-password');
  expect(within(form).getByLabelText('새 비밀번호')).toHaveAttribute('autocomplete', 'new-password');
  expect(within(form).getByLabelText('새 비밀번호 확인')).toHaveAttribute('autocomplete', 'new-password');
  expect(within(form).getByLabelText('새 비밀번호')).toHaveAccessibleDescription('8자 이상');
  expect(within(form).getByRole('button', { name: '현재 비밀번호 표시' })).toBeInTheDocument();

  fillPassword('old-password', 'new-password1');
  await waitFor(() => expect(mockAccount.changePassword).toHaveBeenCalledWith({ currentPassword: 'old-password', newPassword: 'new-password1' }));
  expect(await within(form).findByText(/다른 기기에서는 로그아웃되었습니다/)).toBeInTheDocument();
  // The toast and the note above the button.
  expect(screen.getAllByText('비밀번호를 바꿨습니다.')).toHaveLength(2);
  expect(within(form).getByLabelText('현재 비밀번호')).toHaveValue('');
});

test('비밀번호: 확인이 다르면 보내지 않고 확인 칸 아래 오류', () => {
  renderPage();
  const form = fillPassword('old-password', 'new-password1', 'new-password2');
  expect(mockAccount.changePassword).not.toHaveBeenCalled();
  const confirm = within(form).getByLabelText('새 비밀번호 확인');
  expect(confirm).toHaveAttribute('aria-invalid', 'true');
  expect(confirm).toHaveAccessibleDescription(/비밀번호가 일치하지 않습니다/);
});

test('비밀번호: 현재 비밀번호가 틀리면 현재 칸 아래에, 고치면 사라진다', async () => {
  mockAccount.changePassword.mockRejectedValue(new ApiError(400, 'CURRENT_PASSWORD_INCORRECT', '현재 비밀번호가 일치하지 않습니다.'));
  renderPage();
  const form = fillPassword('bad-password', 'new-password1');
  const current = within(form).getByLabelText('현재 비밀번호');
  await waitFor(() => expect(current).toHaveAttribute('aria-invalid', 'true'));
  expect(current).toHaveAccessibleDescription(/현재 비밀번호가 맞지 않습니다/);
  expect(current).toHaveFocus();
  expect(within(form).getByLabelText('새 비밀번호')).not.toHaveAttribute('aria-invalid');
  fireEvent.change(current, { target: { value: 'other-password' } });
  expect(current).not.toHaveAttribute('aria-invalid');
});

test('비밀번호: 서버 규칙 오류는 새 비밀번호 칸 아래에 (짧은 값은 보내기 전에 막는다)', async () => {
  renderPage();
  let form = fillPassword('old-password', 'short');
  expect(mockAccount.changePassword).not.toHaveBeenCalled();
  expect(within(form).getByLabelText('새 비밀번호')).toHaveAccessibleDescription(/8자 이상이어야/);

  mockAccount.changePassword.mockRejectedValue(new ApiError(400, 'PASSWORD_POLICY', '', undefined, { min: 8, max: 72 }));
  form = fillPassword('old-password', 'longer-password');
  const next = within(form).getByLabelText('새 비밀번호');
  await waitFor(() => expect(next).toHaveAccessibleDescription(/8자 이상 72자 이하/));
  expect(within(form).getByLabelText('현재 비밀번호')).not.toHaveAttribute('aria-invalid');
});

test('저장 용량: 사용량/한도와 백분율, 종류별·데이터 수, 크기 모르는 데이터, 안내용 한도', async () => {
  mockAccount.storageUsage.mockResolvedValue(usage(12.5 * GIB, { unknownSizeCount: 2, byKind: { ORIGINAL: 10 * GIB, FUSION: 2 * GIB, AI_RESULT: 0.5 * GIB } }));
  renderPage();
  const storage = section('저장 용량');
  const meter = await within(storage).findByRole('meter', { name: '저장 용량 사용률' });
  expect(meter).toHaveAttribute('aria-valuenow', '25');
  expect(meter).toHaveAttribute('aria-valuetext', '50.0 GB 중 12.5 GB 사용, 25%');
  expect(within(storage).getByText('12.5 GB / 50.0 GB')).toBeInTheDocument();
  expect(within(storage).getByText('25%')).toBeInTheDocument();
  expect(within(storage).getAllByRole('term').map((term) => term.textContent)).toEqual(['원본', '융합 결과', 'AI 결과', '데이터 수']);
  expect(within(storage).getAllByRole('definition').map((value) => value.textContent)).toEqual(['10.0 GB', '2.0 GB', '512 MB', '12개']);
  expect(within(storage).getByText('크기를 아직 모르는 데이터 2개는 합계에 들어 있지 않습니다.')).toBeInTheDocument();
  expect(within(storage).getByText(/아직 안내용입니다/)).toBeInTheDocument();
  expect(within(storage).queryByText('한도에 가까움')).not.toBeInTheDocument();
});

test('저장 용량: 90% 이상은 경고 글자, 100% 이상은 초과 글자(색만으로 알리지 않는다)', async () => {
  mockAccount.storageUsage.mockResolvedValue(usage(45 * GIB));
  const { unmount } = renderPage();
  let storage = section('저장 용량');
  expect(await within(storage).findByText('한도에 가까움')).toBeInTheDocument();
  expect(within(storage).getByText(/한도의 90%를 쓰고 있습니다/)).toBeInTheDocument();
  unmount();

  mockAccount.storageUsage.mockResolvedValue(usage(55 * GIB));
  renderPage();
  storage = section('저장 용량');
  expect(await within(storage).findByText('한도 초과')).toBeInTheDocument();
  expect(within(storage).getByText(/한도를 넘었습니다\(110%\)/)).toBeInTheDocument();
  expect(within(storage).getByRole('meter')).toHaveAttribute('aria-valuenow', '100');
  expect(within(storage).queryByText(/크기를 아직 모르는/)).not.toBeInTheDocument();
});

test('English: every section in English, no Hangul', async () => {
  mockAccount.storageUsage.mockResolvedValue(usage(46 * GIB, { unknownSizeCount: 1 }));
  mockAccount.changePassword.mockRejectedValue(new ApiError(400, 'CURRENT_PASSWORD_INCORRECT', '현재 비밀번호가 일치하지 않습니다.'));
  renderPage('en');
  expect(screen.getByRole('heading', { level: 1, name: 'Account settings' })).toBeInTheDocument();
  expect(await screen.findByText('Near the limit')).toBeInTheDocument();
  expect(screen.getByText('1 dataset whose size isn’t known yet is not in the total.')).toBeInTheDocument();
  const form = screen.getByRole('region', { name: 'Password' });
  fireEvent.change(within(form).getByLabelText('Current password'), { target: { value: 'bad-password' } });
  fireEvent.change(within(form).getByLabelText('New password'), { target: { value: 'new-password1' } });
  fireEvent.change(within(form).getByLabelText('Confirm new password'), { target: { value: 'new-password1' } });
  fireEvent.click(within(form).getByRole('button', { name: 'Change password' }));
  expect(await within(form).findByText('The current password is incorrect.')).toBeInTheDocument();
  const profile = screen.getByRole('region', { name: 'Profile' });
  fireEvent.change(within(profile).getByLabelText('Name'), { target: { value: '' } });
  fireEvent.click(within(profile).getByRole('button', { name: 'Save name' }));
  expect(within(profile).getByText('Enter your name.')).toBeInTheDocument();
  // The user's own name and id are data; everything else is English.
  const text = (document.body.textContent ?? '').replace(mockUser.name, '');
  expect(hasHangul(text.replace('한국어', ''))).toBe(false);
  const meter = screen.getByRole('meter', { name: 'Storage used' });
  expect(meter).toHaveAttribute('aria-valuetext', '46.0 GB of 50.0 GB used, 92%');
});
