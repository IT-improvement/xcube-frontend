/* FB1 §3–4 on the management screens: single/series labels and the ?time= filter, pictures, project counts,
   the "what is a project" explanation, the detail sentence and the grid/table views. */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

// Comparison jobs (UR-63 F3) join the job lists; these tests do not run Data Analysis.
jest.mock('../../api/compare', () => ({ ...jest.requireActual('../../api/compare'), compareApi: { ...jest.requireActual('../../api/compare').compareApi, listJobs: () => Promise.resolve([]) } }));
jest.mock('../../api', () => ({ activeViewerAdapter: { getProjects: jest.fn(), getDatasets: jest.fn(), getProjectDatasets: jest.fn(), getJobs: jest.fn(), runWaterExtraction: jest.fn() }, useMockApi: false }));
jest.mock('../../api/backofficeApi', () => ({ backofficeAdapter: { getProject: jest.fn(), createProject: jest.fn(), getProjectMembers: jest.fn(), getProjectDatasets: jest.fn(), getLinkableDatacubes: jest.fn(), linkProjectDataset: jest.fn(), unlinkProjectDataset: jest.fn(), getDatasetDetail: jest.fn() } }));
jest.mock('../../api/generationApi', () => ({ generationApi: { listJobs: jest.fn(), jobSummary: jest.fn() } }));
jest.mock('../../api/analysisApi', () => ({ ...jest.requireActual('../../api/analysisApi'), analysisApi: { listJobs: jest.fn() } }));
jest.mock('../../api/aiApi', () => ({ ...jest.requireActual('../../api/aiApi'), aiApi: { listJobs: jest.fn() } }));
jest.mock('../../api/thumbnails', () => ({ cachedThumbnail: () => undefined, loadThumbnail: () => Promise.resolve({ state: 'failed' }), PENDING_RETRY_MS: 15000 }));
jest.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 1, name: '홍길동', role: 'PROJECT_MANAGER' }, signOut: jest.fn() }) }));

const adapter = require('../../api').activeViewerAdapter as Record<string, jest.Mock>;
const backoffice = require('../../api/backofficeApi').backofficeAdapter as Record<string, jest.Mock>;
const generation = require('../../api/generationApi').generationApi as Record<string, jest.Mock>;
const analysis = require('../../api/analysisApi').analysisApi as Record<string, jest.Mock>;
const aiService = require('../../api/aiApi').aiApi as Record<string, jest.Mock>;
const DashboardPage = require('./DashboardPage').default;
const DataLibraryPage = require('./DataLibraryPage').default;
const { ProjectDetailPage, ProjectsPage } = require('./ProjectsPage');

const times = (count: number) => Array.from({ length: count }, (_, index) => ({ iso: `2024-${String(1 + index).padStart(2, '0')}-14T02:00:00Z`, label: '' }));
const series = { id: '70', projectId: '4', name: '제주 시계열', subtitle: 'REGISTERED · AVAILABLE', xcubeDatasetId: 'u8-d70', defaultVariable: 'blue', variables: ['blue', 'green', 'red', 'nir'], times: times(12), accessType: 'OWNED', bbox: [126.6, 33.3, 126.9, 33.6] };
const single = { ...series, id: '71', name: '대청호 한 장면', xcubeDatasetId: 'u8-d71', times: times(1), bbox: [127.4, 36.3, 127.8, 36.6] };

function SearchProbe() {
  return <output data-testid="search">{decodeURIComponent(useLocation().search)}</output>;
}
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SearchProbe />
      <Routes>
        <Route path="/app" element={<DashboardPage />} />
        <Route path="/app/data" element={<DataLibraryPage />} />
        <Route path="/app/projects" element={<ProjectsPage />} />
        <Route path="/app/projects/:projectId" element={<ProjectDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  try { localStorage.clear(); } catch { /* storage unavailable */ }
  localStorage.setItem('xcube.data.view', 'list'); // table checks; cards: rd1.test
  adapter.getDatasets.mockResolvedValue([series, single]);
  adapter.getProjects.mockResolvedValue([{ id: '4', name: '점검 폴더', accessRole: 'OWNER', datasetCount: 2, memberCount: 3 }]);
  backoffice.getProject.mockResolvedValue({ id: '4', name: '점검 폴더', accessRole: 'OWNER' });
  backoffice.getProjectDatasets.mockResolvedValue([{ id: '70', projectId: '4', name: '제주 시계열', subtitle: 'READY', xcubeDatasetId: 'u8-d70', defaultVariable: '', variables: [], times: [] }, { id: '71', projectId: '4', name: '대청호 한 장면', subtitle: 'READY', xcubeDatasetId: 'u8-d71', defaultVariable: '', variables: [], times: [] }]);
  backoffice.getProjectMembers.mockResolvedValue([{ userId: '1', role: 'OWNER' }, { userId: '22', role: 'VIEWER', username: 'kim' }, { userId: '23', role: 'EDITOR', username: 'lee' }]);
  generation.listJobs.mockResolvedValue([]);
  analysis.listJobs.mockResolvedValue([]);
  aiService.listJobs.mockResolvedValue([]);
});

describe('S3 데이터 목록', () => {
  test('시점 열은 “단일” 또는 “n시점”, 이름 앞에 미리보기 그림', async () => {
    renderAt('/app/data');
    const seriesRow = (await screen.findByRole('link', { name: '제주 시계열' })).closest('tr')!;
    expect(within(seriesRow).getByText('12시점')).toBeInTheDocument();
    expect(seriesRow.querySelector('.thumb')).not.toBeNull();
    const singleRow = screen.getByRole('link', { name: '대청호 한 장면' }).closest('tr')!;
    expect(within(singleRow).getByText('단일')).toBeInTheDocument();
  });

  test('767px 이하 카드에서도 이름 아래 줄로 단일 시점 / 시계열 n시점을 구분한다', async () => {
    renderAt('/app/data');
    const seriesRow = (await screen.findByRole('link', { name: '제주 시계열' })).closest('tr')!;
    const seriesLine = within(seriesRow).getByText('시계열 12시점');
    expect(seriesLine).toHaveClass('only-sm');
    expect(seriesLine.closest('td')).toHaveClass('cell-main');
    const singleRow = screen.getByRole('link', { name: '대청호 한 장면' }).closest('tr')!;
    expect(within(singleRow).getByText('단일 시점')).toHaveClass('only-sm');
    // The phone line is in the name cell, which stays on cards; the 시점 column (hide-sm) is the one that hides.
    expect(within(singleRow).getByText('단일').closest('td')).toHaveClass('hide-sm');
  });

  test('시계열/단일 시점 필터는 주소(?time=)에 남고, 주소로 열어도 적용된다', async () => {
    renderAt('/app/data');
    await screen.findByRole('link', { name: '제주 시계열' });
    const filter = screen.getByRole('group', { name: '시점 수' });
    fireEvent.click(within(filter).getByRole('button', { name: '단일 시점' }));
    expect(screen.getByTestId('search')).toHaveTextContent('?time=single');
    expect(screen.queryByRole('link', { name: '제주 시계열' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '대청호 한 장면' })).toBeInTheDocument();
    fireEvent.click(within(filter).getByRole('button', { name: '전체' }));
    expect(screen.getByTestId('search')).toHaveTextContent(/^$/);
  });

  test('?time=series로 열면 시계열만 보인다', async () => {
    renderAt('/app/data?time=series');
    expect(await screen.findByRole('link', { name: '제주 시계열' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '대청호 한 장면' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: '시점 수' })).getByRole('button', { name: '시계열' })).toHaveAttribute('aria-pressed', 'true');
  });
});

test('대시보드 최근 데이터에도 미리보기 그림이 있다', async () => {
  renderAt('/app');
  const row = (await screen.findByRole('link', { name: '제주 시계열' })).closest('tr')!;
  expect(row.querySelector('.thumb')).not.toBeNull();
});

describe('S6 프로젝트', () => {
  test('목록: 서버의 데이터·멤버 수, 데이터 그림 겹쳐 보기, 첫 방문 설명은 접어 둘 수 있다', async () => {
    renderAt('/app/projects');
    const row = (await screen.findByRole('link', { name: '점검 폴더' })).closest('tr')!;
    expect(within(row).getByText('데이터 2개 · 멤버 3명')).toBeInTheDocument();
    await waitFor(() => expect(row.querySelectorAll('.thumb-stack .thumb')).toHaveLength(2));
    expect(screen.getByRole('heading', { name: '프로젝트는 이렇게 씁니다' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '설명 접기' }));
    expect(screen.queryByRole('heading', { name: '프로젝트는 이렇게 씁니다' })).not.toBeInTheDocument();
    expect(localStorage.getItem('xcube.projects.introHidden')).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: '프로젝트란?' }));
    expect(screen.getByRole('heading', { name: '프로젝트는 이렇게 씁니다' })).toBeInTheDocument();
  });

  test('목록: 서버가 수를 주지 않으면 데이터 수는 프로젝트 목록에서 세고 멤버 수는 뺀다', async () => {
    adapter.getProjects.mockResolvedValue([{ id: '4', name: '점검 폴더', accessRole: 'VIEWER' }]);
    renderAt('/app/projects');
    const row = (await screen.findByRole('link', { name: '점검 폴더' })).closest('tr')!;
    expect(await within(row).findByText('데이터 2개')).toBeInTheDocument();
    expect(within(row).queryByText(/멤버/)).not.toBeInTheDocument();
  });

  test('빈 목록: 3단계 설명(만들기 → 데이터 넣기 → 아이디로 함께 보기)과 새 프로젝트 버튼', async () => {
    adapter.getProjects.mockResolvedValue([]);
    renderAt('/app/projects');
    expect(await screen.findByText('아직 프로젝트가 없습니다')).toBeInTheDocument();
    const steps = screen.getByRole('list', { name: '프로젝트를 쓰는 순서' });
    expect(within(steps).getAllByRole('heading').map((heading) => heading.textContent)).toEqual(['프로젝트 만들기', '데이터 넣기', '아이디로 함께 보기']);
    expect(screen.queryByRole('button', { name: '설명 접기' })).not.toBeInTheDocument();
    // The examples are pictures: tagged "예시", hidden from screen readers, nothing focusable; the one real control is
    // the 새 프로젝트 button in step 1.
    const items = within(steps).getAllByRole('listitem');
    expect(items.map((item) => item.querySelector('.project-intro__shot .shot-tag')?.textContent)).toEqual(['예시', '예시', '예시']);
    items.forEach((item) => {
      const shot = item.querySelector('.project-intro__shot')!;
      expect(shot).toHaveAttribute('aria-hidden', 'true');
      expect(shot.querySelectorAll('input, button, a, select, textarea, [tabindex]')).toHaveLength(0);
    });
    expect(within(items[0]).getByRole('button', { name: '새 프로젝트' })).toBeInTheDocument();
    expect(within(items[2]).queryByRole('button')).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: '새 프로젝트' })[0]);
    expect(await screen.findByRole('dialog', { name: '새 프로젝트' })).toHaveAccessibleDescription(/함께 보는 폴더입니다/);
  });

  test('상세: 머리 문장, 범위 지도, 그림 보기 ↔ 목록 보기(UX3: 데이터 목록과 같은 전환, 브라우저에 기억)', async () => {
    renderAt('/app/projects/4');
    expect(await screen.findByText('이 프로젝트의 데이터 2개를 3명이 함께 봅니다.')).toBeInTheDocument();
    const grid = await screen.findByRole('list', { name: '데이터' });
    expect(within(grid).getAllByRole('listitem')).toHaveLength(2);
    expect(within(grid).getByText('원본 · 시계열 12시점 · 2024.01–2024.12')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '이 프로젝트 데이터의 범위 2곳' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '목록 보기' }));
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(localStorage.getItem('xcube.project.view')).toBe('list');
    localStorage.removeItem('xcube.project.view');
  });

  test('상세: 소유자 혼자면 멤버를 추가하라고 한다', async () => {
    backoffice.getProjectMembers.mockResolvedValue([{ userId: '1', role: 'OWNER' }]);
    renderAt('/app/projects/4');
    expect(await screen.findByText(/데이터 2개를 아직 혼자 봅니다/)).toBeInTheDocument();
  });
});
