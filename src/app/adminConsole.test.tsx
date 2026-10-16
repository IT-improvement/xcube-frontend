/* UR-62: the admin screens moved to the separate admin console (/admin). The old /app/admin address hands admins over;
   everyone else gets the normal /app 404. */
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LanguageProvider } from '../i18n';
import { adminConsoleUrl } from './adminConsole';

let mockRole = 'USER';
jest.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 1, email: 'masteradmin', name: '관리자', role: mockRole, status: 'ACTIVE' }, signOut: jest.fn(), updateUser: jest.fn() }) }));
const AdminRedirectPage = require('./pages/AdminRedirectPage').default;

const replace = jest.fn();
const realLocation = window.location;
beforeAll(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: { ...realLocation, protocol: 'http:', hostname: '192.168.75.112', replace } });
});
afterAll(() => { Object.defineProperty(window, 'location', { configurable: true, value: realLocation }); });
beforeEach(() => { replace.mockClear(); mockRole = 'USER'; });

const renderAt = (path: string) => render(
  <LanguageProvider initial="ko">
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/app/admin/*" element={<AdminRedirectPage />} /></Routes>
    </MemoryRouter>
  </LanguageProvider>,
);

test('주소: env가 있으면 그대로, 없으면 배포 빌드는 같은 출처 /admin, 개발은 이 호스트의 3010', () => {
  expect(adminConsoleUrl('http://192.168.75.112:3010/admin', false)).toBe('http://192.168.75.112:3010/admin');
  expect(adminConsoleUrl(' /admin ', false)).toBe('/admin');
  expect(adminConsoleUrl(undefined, true)).toBe('/admin');
  expect(adminConsoleUrl('', true)).toBe('/admin');
  expect(adminConsoleUrl(undefined, false)).toBe('http://192.168.75.112:3010/admin');
});

test('관리자가 /app/admin을 열면 관리자 콘솔로 바꿔 간다(뒤로 가기에 남지 않게 replace)', async () => {
  mockRole = 'ADMIN';
  renderAt('/app/admin/users');
  await waitFor(() => expect(replace).toHaveBeenCalledWith('http://192.168.75.112:3010/admin'));
  expect(screen.queryByText('페이지를 찾을 수 없습니다')).not.toBeInTheDocument();
});

test.each(['USER', 'PROJECT_USER', 'PROJECT_MANAGER'])('%s는 /app/admin에서 일반 404를 본다', (role) => {
  mockRole = role;
  renderAt('/app/admin');
  expect(screen.getByRole('heading', { name: '페이지를 찾을 수 없습니다' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '대시보드로' })).toHaveAttribute('href', '/app');
  expect(replace).not.toHaveBeenCalled();
});
