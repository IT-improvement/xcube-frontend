import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from './App';

const mockLogin = jest.fn(); const mockMe = jest.fn(); const mockSignup = jest.fn(); const mockLastActivity = jest.fn();
jest.mock('./api/authApi', () => ({ authSession: { lastActivity: () => mockLastActivity(), touch: jest.fn(), clear: jest.fn() }, authApi: { login: (...args: any[]) => mockLogin(...args), me: (...args: any[]) => mockMe(...args), signup: (...args: any[]) => mockSignup(...args), refresh: jest.fn(), logout: jest.fn() } }));
jest.mock('./views/Viewer', () => ({ __esModule: true, default: ({ user, initialDatasetId }: any) => <div>Viewer user: {user.name}{initialDatasetId ? ` dataset: ${initialDatasetId}` : ''}</div> }));
jest.mock('./app/pages/DashboardPage', () => ({ __esModule: true, default: () => <h1>대시보드 화면</h1> }));

beforeEach(() => { sessionStorage.clear(); jest.clearAllMocks(); });
afterEach(() => { window.history.replaceState({}, '', '/'); });

test('로그인 폼을 Auth API와 연결하고 성공하면 대시보드를 연다', async () => {
  window.history.replaceState({}, '', '/login');
  mockLogin.mockResolvedValue({ accessToken: 'token' });
  mockMe.mockResolvedValue({ id: 1, email: 'user@example.com', name: '홍길동', role: 'USER', status: 'ACTIVE' });
  render(<App />);
  fireEvent.change(screen.getByLabelText('아이디'), { target: { value: 'user' } });
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'password123' } });
  fireEvent.click(screen.getByRole('button', { name: '로그인' }));
  await waitFor(() => expect(mockLogin).toHaveBeenCalledWith({ email: 'user', password: 'password123' }));
  expect(await screen.findByRole('heading', { name: '대시보드 화면' })).toBeInTheDocument();
  expect(screen.getByRole('navigation')).toBeInTheDocument();
  expect(screen.getAllByRole('link', { name: 'XCube Viewer 열기 (새 탭)' })[0]).toHaveAttribute('href', '/app/viewer');
  expect(window.location.pathname).toBe('/app');
});

test('Viewer 주소의 dataset 값을 Viewer에 넘긴다', async () => {
  window.history.replaceState({}, '', '/app/viewer?dataset=77');
  mockLastActivity.mockReturnValue(Date.now());
  mockMe.mockResolvedValue({ id: 1, email: 'user@example.com', name: '홍길동', role: 'USER', status: 'ACTIVE' });
  render(<App />);
  expect(await screen.findByText('Viewer user: 홍길동 dataset: 77')).toBeInTheDocument();
});

test('회원가입 화면으로 전환해 이름까지 전송하고, 로그인 화면에 아이디를 채운다', async () => {
  window.history.replaceState({}, '', '/login');
  mockSignup.mockResolvedValue({ id: 1 });
  render(<App />);
  fireEvent.click(screen.getByRole('link', { name: '회원가입' }));
  fireEvent.change(screen.getByLabelText('이름'), { target: { value: '홍길동' } });
  fireEvent.change(screen.getByLabelText('아이디'), { target: { value: 'user' } });
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'password123' } });
  fireEvent.change(screen.getByLabelText('비밀번호 확인'), { target: { value: 'password123' } });
  fireEvent.click(screen.getByRole('button', { name: '회원가입' }));
  await waitFor(() => expect(mockSignup).toHaveBeenCalledWith({ name: '홍길동', email: 'user', password: 'password123' }));
  expect(await screen.findByText(/회원가입이 완료되었습니다/)).toBeInTheDocument();
  expect(window.location.pathname).toBe('/login');
  expect(screen.getByLabelText('아이디')).toHaveValue('user');
});

test('비밀번호 확인이 다르면 회원가입을 보내지 않는다', () => {
  window.history.replaceState({}, '', '/signup');
  render(<App />);
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'password123' } });
  fireEvent.change(screen.getByLabelText('비밀번호 확인'), { target: { value: 'password999' } });
  expect(screen.getByText('비밀번호가 일치하지 않습니다.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '회원가입' })).toBeDisabled();
});

test('로그인하지 않고 Viewer 주소로 오면 redirect를 붙여 로그인으로 보내고, 로그인 후 되돌아간다', async () => {
  window.history.replaceState({}, '', '/app/viewer');
  mockLogin.mockResolvedValue({ accessToken: 'token' });
  mockMe.mockResolvedValue({ id: 1, name: '홍길동' });
  render(<App />);
  expect(await screen.findByRole('button', { name: '로그인' })).toBeInTheDocument();
  expect(window.location.pathname + window.location.search).toBe('/login?redirect=%2Fapp%2Fviewer');
  fireEvent.change(screen.getByLabelText('아이디'), { target: { value: 'user' } });
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'password123' } });
  fireEvent.click(screen.getByRole('button', { name: '로그인' }));
  expect(await screen.findByText('Viewer user: 홍길동')).toBeInTheDocument();
});

test('/app은 로그인하지 않았으면 로그인 화면으로 보내고 돌아올 주소를 남긴다', async () => {
  window.history.replaceState({}, '', '/app');
  render(<App />);
  await screen.findByRole('button', { name: '로그인' });
  expect(window.location.search).toBe('?redirect=%2Fapp');
});

test('reason=idle이면 비활동 로그아웃 안내를 보여준다', () => {
  window.history.replaceState({}, '', '/login?reason=idle');
  render(<App />);
  expect(screen.getByText(/장시간 사용하지 않아 로그아웃되었습니다/)).toBeInTheDocument();
});

test('없는 주소는 안내 화면을 보여준다', () => {
  window.history.replaceState({}, '', '/no-such-page');
  render(<App />);
  expect(screen.getByText('페이지를 찾을 수 없습니다')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '홈으로' })).toHaveAttribute('href', '/');
});
