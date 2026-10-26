/* UR-63 F6 on the public pages: "비밀번호를 잊었나요?", the request page (and its "ask the administrator" state when
   mail is off), /reset-password?token=, and the optional contact e-mail at sign-up. APIs are mocked. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ApiError } from '../api/httpClient';
import { LanguageProvider } from '../i18n';

jest.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: null, signIn: jest.fn() }) }));
jest.mock('../api/accountMail', () => ({ ...jest.requireActual('../api/accountMail'), accountMail: { mailStatus: jest.fn(), requestReset: jest.fn(), confirmReset: jest.fn() } }));
// The sign-up page asks the small mailStatus module; route it to the same mock.
jest.mock('../api/mailStatus', () => ({ ...jest.requireActual('../api/mailStatus'), mailStatus: (...args: unknown[]) => require('../api/accountMail').accountMail.mailStatus(...args) }));
jest.mock('../api/authApi', () => ({ ...jest.requireActual('../api/authApi'), authApi: { signup: jest.fn(), login: jest.fn(), me: jest.fn() } }));

const mail = require('../api/accountMail').accountMail as Record<string, jest.Mock>;
const auth = require('../api/authApi').authApi as Record<string, jest.Mock>;
const { LoginPage, SignupPage } = require('./AuthPage');
const { ForgotPasswordPage, ResetPasswordPage } = require('./PasswordPages');

const renderAt = (path: string) => render(
  <LanguageProvider initial="ko">
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Routes>
    </MemoryRouter>
  </LanguageProvider>,
);

beforeEach(() => {
  mail.mailStatus.mockResolvedValue({ mailEnabled: true, passwordResetEnabled: true });
});

test('로그인 아래 "비밀번호를 잊었나요?" → 요청 화면 → 보내면 계정 유무를 말하지 않는 안내', async () => {
  mail.requestReset.mockResolvedValue(undefined);
  renderAt('/login');
  fireEvent.click(screen.getByRole('link', { name: '비밀번호를 잊었나요?' }));
  expect(await screen.findByRole('heading', { level: 1, name: '비밀번호 찾기' })).toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: '재설정 링크 보내기' }));
  expect(screen.getByText('아이디 또는 이메일을 입력하세요.')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('아이디 또는 이메일'), { target: { value: ' kim ' } });
  fireEvent.click(screen.getByRole('button', { name: '재설정 링크 보내기' }));
  expect(await screen.findByText(/요청을 받았습니다. 인증된 연락 이메일이 있으면/)).toBeInTheDocument();
  expect(mail.requestReset).toHaveBeenCalledWith('kim');
});

test('메일이 꺼진 서버: 요청 칸 없이 "관리자에게 문의하세요"', async () => {
  mail.mailStatus.mockResolvedValue({ mailEnabled: false, passwordResetEnabled: false });
  renderAt('/forgot-password');
  expect(await screen.findByText('지금은 메일로 비밀번호를 찾을 수 없습니다.')).toBeInTheDocument();
  expect(screen.getByText(/관리자에게 문의하세요/)).toBeInTheDocument();
  expect(screen.queryByLabelText('아이디 또는 이메일')).not.toBeInTheDocument();
});

test('상태를 못 읽어도 요청은 할 수 있고, 서버가 MAIL_DISABLED면 같은 안내로 바뀐다', async () => {
  mail.mailStatus.mockRejectedValue(new Error('offline'));
  mail.requestReset.mockRejectedValue(new ApiError(503, 'MAIL_DISABLED', 'off'));
  renderAt('/forgot-password');
  fireEvent.change(await screen.findByLabelText('아이디 또는 이메일'), { target: { value: 'kim' } });
  fireEvent.click(screen.getByRole('button', { name: '재설정 링크 보내기' }));
  expect(await screen.findByText('지금은 메일로 비밀번호를 찾을 수 없습니다.')).toBeInTheDocument();
});

test('재설정: 토큰이 없으면 새 링크 요청, 약한 비밀번호는 칸 아래, 성공하면 로그인 화면에 안내', async () => {
  const first = renderAt('/reset-password');
  expect(screen.getByText(/링크에 재설정 정보가 없습니다/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '새 링크 요청하기' })).toHaveAttribute('href', '/forgot-password');
  first.unmount();

  mail.confirmReset.mockRejectedValueOnce(new ApiError(400, 'PASSWORD_POLICY', 'x', undefined, { min: 8, max: 72 })).mockResolvedValue(undefined);
  renderAt('/reset-password?token=tok-1');
  fireEvent.change(screen.getByLabelText('새 비밀번호'), { target: { value: 'short' } });
  fireEvent.change(screen.getByLabelText('비밀번호 확인'), { target: { value: 'short' } });
  fireEvent.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }));
  expect(screen.getByText('비밀번호는 8자 이상이어야 합니다.')).toBeInTheDocument();
  expect(mail.confirmReset).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('새 비밀번호'), { target: { value: 'long-enough-1' } });
  fireEvent.change(screen.getByLabelText('비밀번호 확인'), { target: { value: 'long-enough-1' } });
  fireEvent.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }));
  await waitFor(() => expect(mail.confirmReset).toHaveBeenCalledWith('tok-1', 'long-enough-1'));
  // The server's own rule (PASSWORD_POLICY) shows under the field and keeps the link usable.
  expect(await screen.findByText(/8자 이상 72자 이하/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }));
  expect(await screen.findByText('비밀번호를 바꿨습니다. 새 비밀번호로 로그인하세요.')).toBeInTheDocument();
});

test('재설정: 쓴 링크·만료 링크는 서버 문장과 새 링크 요청', async () => {
  mail.confirmReset.mockRejectedValue(new ApiError(400, 'RESET_TOKEN_EXPIRED', 'x', undefined, { minutes: 30 }));
  renderAt('/reset-password?token=old');
  fireEvent.change(screen.getByLabelText('새 비밀번호'), { target: { value: 'long-enough-1' } });
  fireEvent.change(screen.getByLabelText('비밀번호 확인'), { target: { value: 'long-enough-1' } });
  fireEvent.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }));
  expect(await screen.findByText('재설정 링크가 만료되었습니다(30분). 새 링크를 요청하세요.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '새 링크 요청하기' })).toBeInTheDocument();
});

test('가입: 메일이 켜져 있으면 연락 이메일(선택) 칸, 넣으면 함께 보내고 로그인 화면에 코드 안내', async () => {
  auth.signup.mockResolvedValue({ id: 3, email: 'newbie', name: '새 사람', role: 'USER', status: 'ACTIVE', pendingEmail: 'new@example.com' });
  renderAt('/signup');
  const field = await screen.findByLabelText('연락 이메일 (선택)');
  fireEvent.change(screen.getByLabelText('이름'), { target: { value: '새 사람' } });
  fireEvent.change(screen.getByLabelText('아이디'), { target: { value: 'newbie' } });
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'password123' } });
  fireEvent.change(screen.getByLabelText('비밀번호 확인'), { target: { value: 'password123' } });
  fireEvent.change(field, { target: { value: 'bad' } });
  fireEvent.click(screen.getByRole('button', { name: '회원가입' }));
  expect(screen.getByText('이메일 주소 형식을 확인하세요.')).toBeInTheDocument();
  fireEvent.change(field, { target: { value: 'new@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: '회원가입' }));
  await waitFor(() => expect(auth.signup).toHaveBeenCalledWith({ email: 'newbie', password: 'password123', name: '새 사람', contactEmail: 'new@example.com' }));
  expect(await screen.findByText(/new@example.com로 인증 코드를 보냈습니다/)).toBeInTheDocument();
});

test('가입: 메일이 꺼진 서버에는 이메일 칸이 없다', async () => {
  mail.mailStatus.mockResolvedValue({ mailEnabled: false, passwordResetEnabled: false });
  renderAt('/signup');
  await waitFor(() => expect(mail.mailStatus).toHaveBeenCalled());
  expect(screen.queryByLabelText('연락 이메일 (선택)')).not.toBeInTheDocument();
});

test('브라우저 알림 허락은 처음 작업을 시작할 때 한 번만 묻는다(거절하면 다시 묻지 않음)', () => {
  const { askOnceOnJobStart } = require('../app/browserNotify');
  const requestPermission = jest.fn(() => Promise.resolve('denied'));
  (window as any).Notification = { permission: 'default', requestPermission };
  try {
    localStorage.clear();
    askOnceOnJobStart();
    askOnceOnJobStart();
    expect(requestPermission).toHaveBeenCalledTimes(1);
  } finally {
    delete (window as any).Notification;
    localStorage.clear();
  }
});
