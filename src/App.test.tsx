import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  expect(window.location.pathname).toBe('/app');
  expect(screen.getByRole('link', { name: 'XCube 대시보드' })).toHaveAttribute('href', '/app');
  const viewer = within(screen.getByRole('navigation', { name: '주 메뉴' })).getByRole('link', { name: /Viewer/ });
  expect(viewer).toHaveAttribute('href', '/app/viewer');
  expect(viewer).toHaveAttribute('target', '_blank');
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

test('비밀번호 확인이 다르면 회원가입을 보내지 않고, 입력 아래 오류와 함께 첫 오류 칸으로 이동한다', () => {
  window.history.replaceState({}, '', '/signup');
  render(<App />);
  expect(screen.getByLabelText('이름')).toHaveAccessibleDescription('이름은 화면 표시에만 씁니다.');
  fireEvent.change(screen.getByLabelText('이름'), { target: { value: '홍길동' } });
  fireEvent.change(screen.getByLabelText('아이디'), { target: { value: 'user' } });
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'password123' } });
  fireEvent.change(screen.getByLabelText('비밀번호 확인'), { target: { value: 'password999' } });
  // The button stays enabled; the reason appears on submit, next to the field.
  const submit = screen.getByRole('button', { name: '회원가입' });
  expect(submit).toBeEnabled();
  fireEvent.click(submit);
  expect(mockSignup).not.toHaveBeenCalled();
  const confirm = screen.getByLabelText('비밀번호 확인');
  expect(confirm).toHaveAttribute('aria-invalid', 'true');
  expect(confirm).toHaveAccessibleDescription('비밀번호가 일치하지 않습니다.');
  expect(confirm).toHaveFocus();
});

test('회원가입 아이디 규칙은 입력 아래에 알리고, 아이디 칸은 자동 대문자·맞춤법을 끈다', () => {
  window.history.replaceState({}, '', '/signup');
  render(<App />);
  const id = screen.getByLabelText('아이디');
  expect(id).toHaveAttribute('autocapitalize', 'none');
  expect(id).toHaveAttribute('autocorrect', 'off');
  expect(id).toHaveAttribute('spellcheck', 'false');
  expect(id).not.toHaveAttribute('pattern');
  fireEvent.change(id, { target: { value: 'a b' } });
  fireEvent.blur(id);
  expect(screen.getByText(/영문·숫자·밑줄\(_\)·점\(\.\)·하이픈\(-\)으로 3~50자를 입력하세요/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '회원가입' }));
  expect(screen.getByLabelText('이름')).toHaveFocus();
});

test('로그인은 빈 칸만 확인한다: 옛 규칙 밖의 아이디·짧은 비밀번호도 서버로 보낸다', async () => {
  window.history.replaceState({}, '', '/login');
  mockLogin.mockRejectedValue(new Error('x'));
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '로그인' }));
  expect(mockLogin).not.toHaveBeenCalled();
  expect(screen.getByLabelText('아이디')).toHaveFocus();
  expect(screen.getByText('아이디를 입력하세요.')).toBeInTheDocument();
  expect(screen.getByText('비밀번호를 입력하세요.')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('아이디'), { target: { value: 'Old User' } });
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'pw' } });
  fireEvent.click(screen.getByRole('button', { name: '로그인' }));
  await waitFor(() => expect(mockLogin).toHaveBeenCalledWith({ email: 'Old User', password: 'pw' }));
});

test('로그인 화면의 소개 영역은 실제 화면 캡처를 설명과 함께 보여주고 로고 링크는 이름을 가진다', () => {
  window.history.replaceState({}, '', '/login');
  render(<App />);
  // The intro panel stays in the accessibility tree, with a named logo link and a described capture.
  const intro = screen.getByRole('complementary', { name: 'XCube 소개' });
  expect(within(intro).getByRole('link', { name: 'XCube 홈' })).toBeInTheDocument();
  expect(within(intro).getByText(/필요한 곳과 날짜만 지도에서 봅니다/)).toBeInTheDocument();
  expect(within(intro).getByRole('img', { name: /실제 Viewer 화면/ })).toHaveAttribute('src', expect.stringContaining('/landing/daecheong-swipe.webp'));
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
