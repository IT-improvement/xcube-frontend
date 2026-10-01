import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from './App';

const mockLogin = jest.fn(); const mockMe = jest.fn(); const mockSignup = jest.fn();
jest.mock('./api/authApi', () => ({ authSession: { lastActivity: jest.fn(() => 0), touch: jest.fn(), clear: jest.fn() }, authApi: { login: (...args: any[]) => mockLogin(...args), me: (...args: any[]) => mockMe(...args), signup: (...args: any[]) => mockSignup(...args), refresh: jest.fn(), logout: jest.fn() } }));
jest.mock('./views/Viewer', () => ({ __esModule: true, default: ({ user }: any) => <div>Viewer user: {user.name}</div> }));

beforeEach(() => { sessionStorage.clear(); jest.clearAllMocks(); });

test('로그인 폼을 Auth API와 연결하고 성공하면 Viewer를 연다', async () => {
  mockLogin.mockResolvedValue({ accessToken: 'token' });
  mockMe.mockResolvedValue({ id: 1, email: 'user@example.com', name: '홍길동', role: 'USER', status: 'ACTIVE' });
  render(<App />);
  fireEvent.change(screen.getByLabelText('아이디'), { target: { value: 'user' } });
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'password123' } });
  fireEvent.click(screen.getByRole('button', { name: '로그인' }));
  await waitFor(() => expect(mockLogin).toHaveBeenCalledWith({ email: 'user', password: 'password123' }));
  expect(await screen.findByText('Viewer user: 홍길동')).toBeInTheDocument();
});

test('회원가입 화면으로 전환해 이름까지 전송한다', async () => {
  mockSignup.mockResolvedValue({ id: 1 });
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '계정이 없나요? 회원가입' }));
  fireEvent.change(screen.getByLabelText('이름'), { target: { value: '홍길동' } });
  fireEvent.change(screen.getByLabelText('아이디'), { target: { value: 'user' } });
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'password123' } });
  fireEvent.click(screen.getByRole('button', { name: '회원가입' }));
  await waitFor(() => expect(mockSignup).toHaveBeenCalledWith({ name: '홍길동', email: 'user', password: 'password123' }));
  expect(await screen.findByText(/회원가입이 완료되었습니다/)).toBeInTheDocument();
});
