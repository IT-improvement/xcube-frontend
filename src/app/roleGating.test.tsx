/* UR-59 role gating on the existing screens: nothing is hidden; what the role cannot do is off, with the reason.
   USER: add data, band math, AI, projects off · PROJECT_USER: only new project off · ADMIN: admin menu (link to the admin console, UR-62). */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LanguageProvider } from '../i18n';

let mockRole = 'USER';
jest.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 5, email: 'park', name: '박군청', role: mockRole, status: 'ACTIVE' }, signOut: jest.fn(), updateUser: jest.fn() }) }));
jest.mock('./jobs', () => ({
  ...jest.requireActual('./jobs'),
  useActiveJobCount: () => 0,
  JobsFeedProvider: ({ children }: { children: unknown }) => children,
  useJobsFeed: () => ({ data: { items: [], unavailable: [] }, full: true, loading: false, error: '', activeCount: 0, refreshedAt: null, tick: 0, refresh: jest.fn() }),
}));
const mockAppApi = { listDatasets: jest.fn(), listProjects: jest.fn(), createProject: jest.fn() };
const mockAccount = { storageUsage: jest.fn(), updateProfile: jest.fn(), changePassword: jest.fn() };
jest.mock('./api', () => ({ ...jest.requireActual('./api'), appApi: { ...jest.requireActual('./api').appApi, ...mockAppApi }, account: mockAccount }));

const AppShell = require('./AppShell').default;
const DashboardPage = require('./pages/DashboardPage').default;
const { ProjectsPage } = require('./pages/ProjectsPage');
const AddDataPage = require('./wizard/AddDataPage').default;
const SettingsPage = require('./pages/SettingsPage').default;
const FusionPage = require('./pages/FusionPage').default;

function renderAt(path: string, element: ReactElement, lang: 'ko' | 'en' = 'ko') {
  return render(
    <LanguageProvider initial={lang}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/app" element={<AppShell />}>
            <Route index element={element} />
            <Route path="*" element={element} />
          </Route>
        </Routes>
      </MemoryRouter>
    </LanguageProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRole = 'USER';
  mockAppApi.listDatasets.mockResolvedValue([]);
  mockAppApi.listProjects.mockResolvedValue([]);
  mockAccount.storageUsage.mockResolvedValue({ usedBytes: 0, quotaBytes: 0, datasetCount: 0, unknownSizeCount: 0, byKind: { ORIGINAL: 0, FUSION: 0, AI_RESULT: 0 } });
});

test('유저: 상단 바 데이터 추가는 숨지 않고 꺼진 채 이유를 말한다; 관리자 메뉴는 없다', () => {
  renderAt('/app', <h1>본문</h1>);
  const add = screen.getByRole('button', { name: '데이터 추가' });
  expect(add).toHaveAttribute('aria-disabled', 'true');
  expect(add).toHaveAccessibleDescription('관리자에게 프로젝트 유저 등급을 요청하세요.');
  expect(screen.queryByRole('link', { name: /데이터 추가/ })).not.toBeInTheDocument();
  expect(within(screen.getByRole('navigation', { name: '주 메뉴' })).queryByRole('link', { name: '관리자' })).not.toBeInTheDocument();
});

test('프로젝트 유저: 데이터 추가는 링크, 관리자: 메뉴 끝에 관리자', () => {
  mockRole = 'PROJECT_USER';
  const { unmount } = renderAt('/app', <h1>본문</h1>);
  expect(screen.getByRole('link', { name: /데이터 추가/ })).toHaveAttribute('href', '/app/data/new');
  unmount();
  mockRole = 'ADMIN';
  renderAt('/app', <h1>본문</h1>);
  const links = within(screen.getByRole('navigation', { name: '주 메뉴' })).getAllByRole('link').map((link) => link.textContent);
  expect(links).toEqual(['대시보드', '데이터', '프로젝트', '작업', '수식 융합', '관리자', 'Viewer(새 탭)']);
  // UR-62: 관리자 goes to the separate admin console in the same tab (dev default: port 3010 on this host).
  const adminLink = within(screen.getByRole('navigation', { name: '주 메뉴' })).getByRole('link', { name: '관리자' });
  expect(adminLink).toHaveAttribute('href', 'http://localhost:3010/admin');
  expect(adminLink).not.toHaveAttribute('target');
  fireEvent.click(screen.getByRole('button', { name: /계정 메뉴/ }));
  expect(within(document.getElementById('app-account-panel')!).getByRole('link', { name: '관리자' })).toHaveAttribute('href', 'http://localhost:3010/admin');
});

test('관리자가 아니면 계정 메뉴에도 관리자가 없다', () => {
  mockRole = 'PROJECT_MANAGER';
  renderAt('/app', <h1>본문</h1>);
  fireEvent.click(screen.getByRole('button', { name: /계정 메뉴/ }));
  expect(within(document.getElementById('app-account-panel')!).queryByRole('link', { name: '관리자' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: '관리자' })).not.toBeInTheDocument();
});

test('유저: 대시보드 바로 가기의 데이터 추가·수식 융합은 링크가 아니고 이유를 설명 자리에 보인다', async () => {
  renderAt('/app', <DashboardPage />);
  const shortcuts = screen.getByRole('navigation', { name: '바로 가기' });
  expect(within(shortcuts).queryByRole('link', { name: /데이터 추가/ })).not.toBeInTheDocument();
  expect(within(shortcuts).queryByRole('link', { name: /수식 융합/ })).not.toBeInTheDocument();
  expect(within(shortcuts).getAllByText('관리자에게 프로젝트 유저 등급을 요청하세요.')).toHaveLength(2);
  expect(within(shortcuts).getByRole('link', { name: /Viewer 열기/ })).toBeInTheDocument();
  // The empty ledger's add button is off with its reason too.
  await waitFor(() => expect(screen.getAllByRole('button', { name: /데이터 추가/ }).length).toBeGreaterThan(1));
  screen.getAllByRole('button', { name: /데이터 추가/ }).forEach((button) => expect(button).toHaveAttribute('aria-disabled', 'true'));
});

test('프로젝트 유저: 새 프로젝트는 꺼지고 프로젝트 관리자 등급을 요청하라고 한다; 프로젝트 관리자는 열 수 있다', async () => {
  mockRole = 'PROJECT_USER';
  const { unmount } = renderAt('/app/projects', <ProjectsPage />);
  await screen.findByText('아직 프로젝트가 없습니다');
  const buttons = screen.getAllByRole('button', { name: /새 프로젝트/ });
  buttons.forEach((button) => {
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription('관리자에게 프로젝트 관리자 등급을 요청하세요.');
  });
  fireEvent.click(buttons[0]);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getAllByText('관리자에게 프로젝트 관리자 등급을 요청하세요.').length).toBeGreaterThan(0);
  unmount();
  mockRole = 'PROJECT_MANAGER';
  renderAt('/app/projects', <ProjectsPage />);
  await screen.findByText('아직 프로젝트가 없습니다');
  fireEvent.click(screen.getAllByRole('button', { name: /새 프로젝트/ })[0]);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

test('유저가 주소로 데이터 추가를 열면 마법사 대신 이유와 데이터 목록 링크를 본다', async () => {
  renderAt('/app/data/new', <AddDataPage />);
  expect(await screen.findByText('지금 등급으로는 데이터를 추가할 수 없습니다')).toBeInTheDocument();
  expect(screen.getByText(/유저 등급은 공유받은 프로젝트와 데이터를 보기만 합니다\. 관리자에게 프로젝트 유저 등급을 요청하세요\./)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '데이터 목록으로' })).toHaveAttribute('href', '/app/data');
  expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
});

test('유저: 수식 융합 화면은 열리지만 안내가 있고 실행 버튼은 꺼진다', async () => {
  renderAt('/app/analysis/fusion', <FusionPage />);
  expect(await screen.findByText(/유저 등급은 수식 융합을 실행할 수 없습니다/)).toBeInTheDocument();
});

test('계정 설정에 내 등급을 읽기 전용으로 보인다 (한국어·영어)', async () => {
  mockRole = 'PROJECT_USER';
  const { unmount } = renderAt('/app/settings', <SettingsPage />);
  const role = screen.getByTestId('settings-role');
  expect(role).toHaveTextContent('계정 등급');
  expect(role).toHaveTextContent('프로젝트 유저');
  expect(role).toHaveTextContent('프로젝트는 만들 수 없습니다.');
  expect(role).toHaveTextContent('등급은 관리자가 정합니다.');
  expect(within(role).queryByRole('combobox')).not.toBeInTheDocument();
  await waitFor(() => expect(mockAccount.storageUsage).toHaveBeenCalled());
  unmount();
  renderAt('/app/settings', <SettingsPage />, 'en');
  expect(screen.getByTestId('settings-role')).toHaveTextContent('Account roleProject user');
  await waitFor(() => expect(mockAccount.storageUsage).toHaveBeenCalledTimes(2));
});
