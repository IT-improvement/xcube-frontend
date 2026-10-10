/* M4 management pages against mocked Backoffice/Generation APIs (real mode). */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

jest.mock('../../api', () => ({ activeViewerAdapter: { getProjects: jest.fn(), getDatasets: jest.fn(), getProjectDatasets: jest.fn(), getJobs: jest.fn(), runWaterExtraction: jest.fn() }, useMockApi: false }));
jest.mock('../../api/backofficeApi', () => ({ backofficeAdapter: { getProject: jest.fn(), createProject: jest.fn(), updateProject: jest.fn(), deleteProject: jest.fn(), getProjectMembers: jest.fn(), addProjectMember: jest.fn(), updateProjectMember: jest.fn(), removeProjectMember: jest.fn(), getProjectDatasets: jest.fn(), getLinkableDatacubes: jest.fn(), linkProjectDataset: jest.fn(), unlinkProjectDataset: jest.fn(), getDatasetDetail: jest.fn(), deleteDatacube: jest.fn(), registerDatacube: jest.fn() } }));
jest.mock('../../api/generationApi', () => ({ generationApi: { getColorBarOptions: jest.fn(), getCollections: jest.fn(), inspectSpatialFile: jest.fn(), createGeeJob: jest.fn(), createFileJob: jest.fn(), getJob: jest.fn(), listJobs: jest.fn(), jobSummary: jest.fn(), retryJob: jest.fn(), cancelJob: jest.fn(), estimateGee: jest.fn(), searchAdminAreas: jest.fn(), getAdminArea: jest.fn(), listAreas: jest.fn(), getArea: jest.fn(), deleteArea: jest.fn(), uploadArea: jest.fn(), areaFromJob: jest.fn() } }));
jest.mock('../../api/analysisApi', () => ({ ...jest.requireActual('../../api/analysisApi'), analysisApi: { validate: jest.fn(), dryRun: jest.fn(), createJob: jest.fn(), listJobs: jest.fn(), getJob: jest.fn(), cancelJob: jest.fn(), retryJob: jest.fn() } }));
jest.mock('../../api/aiApi', () => ({ ...jest.requireActual('../../api/aiApi'), aiApi: { listModels: jest.fn(), check: jest.fn(), createJob: jest.fn(), listJobs: jest.fn(), getJob: jest.fn(), cancelJob: jest.fn(), retryJob: jest.fn() } }));
jest.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 1, name: '홍길동' }, signOut: jest.fn() }) }));

const adapter = require('../../api').activeViewerAdapter as Record<string, jest.Mock>;
const backoffice = require('../../api/backofficeApi').backofficeAdapter as Record<string, jest.Mock>;
const generation = require('../../api/generationApi').generationApi as Record<string, jest.Mock>;
const analysis = require('../../api/analysisApi').analysisApi as Record<string, jest.Mock>;
const aiService = require('../../api/aiApi').aiApi as Record<string, jest.Mock>;
const { ApiError } = require('../../api/httpClient');
const { formatDateTime } = require('../api');
const DashboardPage = require('./DashboardPage').default;
const DataLibraryPage = require('./DataLibraryPage').default;
const DatasetDetailPage = require('./DatasetDetailPage').default;
const { ProjectDetailPage, ProjectsPage } = require('./ProjectsPage');
const AddDataPage = require('../wizard/AddDataPage').default;
const JobsPage = require('./JobsPage').default;
const FusionPage = require('./FusionPage').default;

const owned = { id: '77', projectId: '4', name: '연결된 Zarr', subtitle: 'REGISTERED · AVAILABLE', xcubeDatasetId: 'linked', defaultVariable: 'red', variables: ['red'], times: [], accessType: 'OWNED' };
const shared = { ...owned, id: '88', projectId: '', name: '공유받은 Zarr', xcubeDatasetId: 'global', accessType: 'SHARED' };

/** Shows the current query string so tests can check what the page keeps in the URL. */
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
        <Route path="/app/data/new" element={<AddDataPage />} />
        <Route path="/app/data/:datasetId" element={<DatasetDetailPage />} />
        <Route path="/app/projects" element={<ProjectsPage />} />
        <Route path="/app/projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="/app/jobs" element={<JobsPage />} />
        <Route path="/app/analysis/fusion" element={<FusionPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  adapter.getProjects.mockResolvedValue([{ id: '4', name: '임의 프로젝트', accessRole: 'OWNER' }]);
  adapter.getDatasets.mockResolvedValue([owned, shared]);
  adapter.getJobs.mockResolvedValue([]);
  backoffice.getProject.mockResolvedValue({ id: '4', name: '임의 프로젝트', accessRole: 'OWNER' });
  backoffice.getProjectMembers.mockResolvedValue([{ userId: '1', role: 'OWNER' }, { userId: '22', role: 'VIEWER' }]);
  backoffice.getProjectDatasets.mockResolvedValue([owned]);
  backoffice.getLinkableDatacubes.mockResolvedValue([owned, shared]);
  backoffice.linkProjectDataset.mockResolvedValue(undefined);
  backoffice.unlinkProjectDataset.mockResolvedValue(undefined);
  backoffice.deleteDatacube.mockResolvedValue(undefined);
  generation.listJobs.mockResolvedValue([]);
  generation.estimateGee.mockResolvedValue({ areaKm2: 3000, grid: { width: 1800, height: 1800 }, scenes: 6, estimatedBytes: 4e6, requestTiles: 1, warnings: [], blockers: [] });
  generation.listAreas.mockResolvedValue([]);
  analysis.listJobs.mockResolvedValue([]);
  aiService.listJobs.mockResolvedValue([]);
  generation.getColorBarOptions.mockResolvedValue([{ id: 'viridis', category: 'Sequential' }, { id: 'tab10', category: 'Qualitative' }]);
  window.confirm = jest.fn(() => true);
});

describe('S6 프로젝트', () => {
  test('OWNER는 상대 로그인 아이디로 멤버를 추가하고, 목록은 이름·아이디로 보여 준다', async () => {
    backoffice.getProjectMembers.mockResolvedValue([{ userId: '1', role: 'OWNER' }, { userId: '22', role: 'VIEWER', username: 'kim', name: '김철수' }, { userId: '30', role: 'VIEWER' }]);
    backoffice.addProjectMember.mockResolvedValue({ userId: '33', role: 'EDITOR', username: 'lee', name: '이영희' });
    renderAt('/app/projects/4');
    fireEvent.click(await screen.findByRole('tab', { name: '멤버' }));
    expect(await screen.findByText('김철수 (kim)')).toBeInTheDocument();
    expect(screen.getByText('홍길동 (나)')).toBeInTheDocument();
    expect(screen.getByText('사용자 30')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('상대 로그인 아이디'), { target: { value: ' lee ' } });
    fireEvent.change(screen.getByLabelText('권한'), { target: { value: 'EDITOR' } });
    fireEvent.click(screen.getByRole('button', { name: '멤버 추가' }));
    await waitFor(() => expect(backoffice.addProjectMember).toHaveBeenCalledWith('4', { username: 'lee', role: 'EDITOR' }));
    expect(await screen.findByText('이영희 (lee)')).toBeInTheDocument();
    expect(screen.getByText('이영희 (lee)님을 추가했습니다.')).toBeInTheDocument();
  });

  test('멤버 제거는 앱의 확인 대화상자를 거치고, 실패하면 대화상자 안에 이유를 남긴다', async () => {
    backoffice.getProjectMembers.mockResolvedValue([{ userId: '1', role: 'OWNER' }, { userId: '22', role: 'VIEWER', username: 'kim', name: '김철수' }]);
    backoffice.removeProjectMember.mockRejectedValueOnce(new ApiError(500, 'INTERNAL', '권한 정보를 바꾸지 못했습니다.')).mockResolvedValueOnce(undefined);
    renderAt('/app/projects/4');
    fireEvent.click(await screen.findByRole('tab', { name: '멤버' }));
    fireEvent.click(await screen.findByRole('button', { name: '김철수 (kim) 제거' }));
    const confirm = await screen.findByRole('alertdialog', { name: '멤버를 제거할까요?' });
    fireEvent.click(within(confirm).getByRole('button', { name: '제거' }));
    expect(await within(confirm).findByText('권한 정보를 바꾸지 못했습니다.')).toBeInTheDocument();
    fireEvent.click(within(confirm).getByRole('button', { name: '제거' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.queryByText('김철수 (kim)')).not.toBeInTheDocument();
    expect(backoffice.removeProjectMember).toHaveBeenCalledWith('4', '22');
    expect(window.confirm).not.toHaveBeenCalled();
  });

  test('없는 아이디와 빈 입력은 이유를 알려 준다', async () => {
    backoffice.addProjectMember.mockRejectedValue(new ApiError(404, 'USER_NOT_FOUND', 'No user with that ID'));
    renderAt('/app/projects/4');
    fireEvent.click(await screen.findByRole('tab', { name: '멤버' }));
    fireEvent.click(await screen.findByRole('button', { name: '멤버 추가' }));
    expect(await screen.findByText('공유할 사람의 로그인 아이디를 입력하세요.')).toBeInTheDocument();
    expect(backoffice.addProjectMember).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('상대 로그인 아이디'), { target: { value: 'nobody' } });
    fireEvent.click(screen.getByRole('button', { name: '멤버 추가' }));
    expect(await screen.findByText(/해당 아이디의 사용자가 없습니다/)).toBeInTheDocument();
  });

  test('EDITOR는 편집만 할 수 있고 삭제·멤버 관리는 보이지 않는다', async () => {
    backoffice.getProject.mockResolvedValue({ id: '4', name: '편집 프로젝트', accessRole: 'EDITOR' });
    renderAt('/app/projects/4');
    expect(await screen.findByRole('button', { name: '편집' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '데이터 연결' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '멤버' }));
    expect(screen.getByText('소유자만 멤버를 관리할 수 있습니다')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '멤버 추가' })).not.toBeInTheDocument();
    expect(backoffice.getProjectMembers).not.toHaveBeenCalled();
  });

  test('VIEWER는 데이터 연결·해제를 할 수 없다', async () => {
    backoffice.getProject.mockResolvedValue({ id: '4', name: '보기 프로젝트', accessRole: 'VIEWER' });
    renderAt('/app/projects/4');
    expect(await screen.findByRole('link', { name: '연결된 Zarr' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '데이터 연결' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /연결 해제/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '편집' })).not.toBeInTheDocument();
  });

  test('데이터를 연결하고, 연결 해제는 원본을 지우지 않는다고 확인한다', async () => {
    renderAt('/app/projects/4');
    fireEvent.click(await screen.findByRole('button', { name: '데이터 연결' }));
    const dialog = await screen.findByRole('dialog', { name: '데이터 연결' });
    fireEvent.change(within(dialog).getByRole('searchbox', { name: '연결할 데이터 검색' }), { target: { value: '공유받은' } });
    fireEvent.click(await within(dialog).findByRole('button', { name: '연결' }));
    await waitFor(() => expect(backoffice.linkProjectDataset).toHaveBeenCalledWith('4', '88'));
    fireEvent.click(within(dialog).getAllByRole('button', { name: '닫기' })[0]);
    expect(screen.queryByRole('dialog', { name: '데이터 연결' })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: '연결된 Zarr 연결 해제' }));
    // The app's own confirmation dialog, not the browser's confirm().
    const confirm = await screen.findByRole('alertdialog', { name: '연결을 해제할까요?' });
    expect(confirm).toHaveAccessibleDescription(expect.stringContaining('원본은 삭제되지 않습니다'));
    expect(within(confirm).getByRole('button', { name: '취소' })).toHaveFocus();
    expect(backoffice.unlinkProjectDataset).not.toHaveBeenCalled();
    fireEvent.click(within(confirm).getByRole('button', { name: '연결 해제' }));
    await waitFor(() => expect(backoffice.unlinkProjectDataset).toHaveBeenCalledWith('4', '77'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(window.confirm).not.toHaveBeenCalled();
  });

  test('프로젝트가 없으면 빈 상태와 새 프로젝트 버튼을 보여 준다', async () => {
    adapter.getProjects.mockResolvedValue([]);
    renderAt('/app/projects');
    expect(await screen.findByText('프로젝트가 없습니다')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '새 프로젝트' }).length).toBeGreaterThan(0);
  });
});

describe('S3·S5 데이터', () => {
  test('구분 탭·검색·권한별 삭제를 처리한다', async () => {
    renderAt('/app/data');
    expect(await screen.findByRole('link', { name: '연결된 Zarr' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '공유받은 Zarr 삭제' })).toBeDisabled();
    fireEvent.click(screen.getByRole('tab', { name: /공유받음/ }));
    expect(screen.queryByRole('link', { name: '연결된 Zarr' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: '데이터 검색' }), { target: { value: '없는 이름' } });
    expect(screen.getByText('검색 결과가 없습니다')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '조건 초기화' }));
    fireEvent.click(screen.getByRole('button', { name: '연결된 Zarr 삭제' }));
    fireEvent.click(within(screen.getByRole('alertdialog', { name: '데이터를 삭제할까요?' })).getByRole('button', { name: '삭제' }));
    await waitFor(() => expect(backoffice.deleteDatacube).toHaveBeenCalledWith('77'));
    expect(await screen.findByText('데이터를 삭제했습니다.')).toBeInTheDocument();
  });

  test('목록 오류와 빈 목록을 구분한다', async () => {
    adapter.getDatasets.mockRejectedValueOnce(new ApiError(503, 'XCUBE_UNAVAILABLE', 'down'));
    const { unmount } = renderAt('/app/data');
    expect(await screen.findByText(/데이터 목록을 불러오지 못했습니다/)).toBeInTheDocument();
    unmount();
    adapter.getDatasets.mockResolvedValue([]);
    renderAt('/app/data');
    expect(await screen.findByText('아직 데이터가 없습니다')).toBeInTheDocument();
  });

  test('상세는 권한 없음과 없는 데이터를 구분하고 Viewer 링크에 데이터셋을 넘긴다', async () => {
    backoffice.getDatasetDetail.mockRejectedValueOnce(new ApiError(403, 'FORBIDDEN', 'no'));
    const { unmount: unmountForbidden } = renderAt('/app/data/77');
    expect(await screen.findByText('이 데이터를 볼 권한이 없습니다')).toBeInTheDocument();
    unmountForbidden();
    backoffice.getDatasetDetail.mockRejectedValueOnce(new ApiError(404, 'NOT_FOUND', 'no'));
    const { unmount: unmountMissing } = renderAt('/app/data/77');
    expect(await screen.findByText('데이터를 찾을 수 없습니다')).toBeInTheDocument();
    unmountMissing();
    backoffice.getDatasetDetail.mockResolvedValue({ ...owned, bbox: [126, 33, 127, 34] });
    renderAt('/app/data/77');
    expect(await screen.findByRole('link', { name: /Viewer에서 열기/ })).toHaveAttribute('href', '/app/viewer?dataset=77');
    expect(screen.getByRole('img', { name: /데이터 범위/ })).toBeInTheDocument();
    // The tab title names the dataset once it has loaded.
    expect(document.title).toBe('연결된 Zarr · 데이터 · XCube');
  });

  test.each([
    ['/app', '대시보드 · XCube'],
    ['/app/data', '데이터 · XCube'],
    ['/app/data/new', '데이터 추가 · XCube'],
    ['/app/projects', '프로젝트 · XCube'],
    ['/app/jobs', '작업 · XCube'],
    ['/app/analysis/fusion', '수식 융합 · XCube'],
  ])('%s 화면의 탭 제목은 "%s"이다', async (path, title) => {
    renderAt(path);
    await waitFor(() => expect(document.title).toBe(title));
  });

  test('대시보드는 데이터가 없으면 첫 데이터 추가를 안내한다', async () => {
    adapter.getDatasets.mockResolvedValue([]);
    renderAt('/app');
    expect(await screen.findByText(/첫 데이터큐브를 추가해 보세요/)).toBeInTheDocument();
    expect(screen.queryByLabelText('요약')).not.toBeInTheDocument();
    const section = screen.getByRole('region', { name: '최근 데이터' });
    expect(within(section).getByRole('link', { name: /데이터 추가/ })).toHaveAttribute('href', '/app/data/new');
  });

  test('대시보드: 제목 옆 한 줄 요약, 바로 가기 세 줄, 최근 데이터 5개(이름·종류·기간·Viewer)', async () => {
    const many = Array.from({ length: 7 }, (_, index) => ({ ...owned, id: String(100 + index), name: `데이터 ${index + 1}`, times: [{ iso: '2024-08-01', label: '2024-08-01' }, { iso: '2024-08-30', label: '2024-08-30' }] }));
    adapter.getDatasets.mockResolvedValue([...many, { ...shared, kind: 'FUSION' }]);
    renderAt('/app');
    expect(await screen.findByText('데이터 1')).toBeInTheDocument();
    const summary = screen.getByLabelText('요약');
    expect(summary).toHaveTextContent('내 데이터 7공유받음 1처리 중 0');
    expect(within(summary).getByRole('link', { name: '공유받음 1' })).toHaveAttribute('href', '/app/data?scope=shared');
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    const actions = within(screen.getByRole('navigation', { name: '바로 가기' })).getAllByRole('link');
    expect(actions.map((link) => link.getAttribute('href'))).toEqual(['/app/data/new', '/app/analysis/fusion', '/app/viewer?dataset=100']);
    const section = screen.getByRole('region', { name: '최근 데이터' });
    const rows = within(section).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(5);
    expect(within(rows[0]).getByText('원본')).toBeInTheDocument();
    expect(within(rows[0]).getByText('2024-08-01 ~ 2024-08-30')).toBeInTheDocument();
    expect(within(rows[0]).getByRole('link', { name: '데이터 1 Viewer에서 열기 (새 탭)' })).toHaveAttribute('href', '/app/viewer?dataset=100');
    expect(within(rows[0]).queryByText('사용 가능')).toBeNull();
    expect(within(section).getByRole('link', { name: '전체 보기' })).toHaveAttribute('href', '/app/data');
  });
});

describe('S4 데이터 추가 (FR-GEN-10·11)', () => {
  const fields = [
    { name: 'pop_total', type: 'integer', approxStats: { min: 0, max: 48210, p2: 120, p98: 31800 } },
    { name: 'land_use', type: 'string', categories: [{ value: '주거', count: 4 }] },
    { name: 'area_km2', type: 'real', approxStats: { min: 0.08, max: 312.4, p2: 0.5, p98: 120.2 } },
    ...Array.from({ length: 7 }, (_, index) => ({ name: `extra_${index}`, type: 'real', approxStats: { min: 0, max: 1 } })),
  ];
  const inspection = { sourceType: 'SHAPEFILE', fileName: 'admin.zip', bands: fields.map((field) => field.name), fields, bounds: { west: 128.9, south: 35.3, east: 129.4, north: 35.7 }, files: ['a.shp', 'a.shx', 'a.dbf', 'a.prj'], message: '검사 완료', inputs: [{ kind: 'zip', uri: 'file:///tmp/a.zip' }] };

  async function toSettings() {
    generation.inspectSpatialFile.mockResolvedValue(inspection);
    renderAt('/app/data/new');
    fireEvent.click(await screen.findByRole('radio', { name: /Shapefile/ }));
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));
    fireEvent.change(screen.getByLabelText('파일 선택'), { target: { files: [new File(['x'], 'admin.zip', { type: 'application/zip' })] } });
    expect(await screen.findByText('검사 완료')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));
    expect(await screen.findByText(/표시 범위가 자동으로 채워집니다/)).toBeInTheDocument();
    expect(screen.getByRole('list', { name: '필수 구성파일' })).toHaveTextContent('.prj 있음');
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));
    // admin.zip has no YYYYMM in its name, so the observation date is required.
    fireEvent.change(screen.getByLabelText('관측 날짜'), { target: { value: '2026-05-01' } });
  }

  test('10개 속성 중 3개만 골라 각각 색상·범위를 정하고, 범위는 자동값으로 채워진다', async () => {
    generation.createFileJob.mockResolvedValue({ id: 'job-9', status: 'QUEUED' });
    await toSettings();
    expect(screen.getByText(/0 \/ 10개 선택/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /pop_total/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /land_use/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /area_km2/ }));
    expect(screen.getByText(/3 \/ 10개 선택/)).toBeInTheDocument();
    const min = screen.getByLabelText('pop_total 표시 최솟값') as HTMLInputElement;
    expect(min.value).toBe('120');
    expect((screen.getByLabelText('pop_total 표시 최댓값') as HTMLInputElement).value).toBe('31800');
    fireEvent.change(min, { target: { value: '5' } });
    const pop = screen.getByRole('region', { name: 'pop_total 표시 설정' });
    fireEvent.click(within(pop).getByRole('button', { name: /자동값으로 되돌리기/ }));
    expect(min.value).toBe('120');
    const landUse = screen.getByRole('region', { name: 'land_use 표시 설정' });
    expect(within(landUse).getByRole('button', { name: '연속값' })).toBeDisabled();
    expect(within(landUse).queryByLabelText('land_use 표시 최솟값')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('area_km2 색상표'), { target: { value: 'tab10' } });
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));
    fireEvent.click(await screen.findByRole('button', { name: '생성 시작' }));
    await waitFor(() => expect(generation.createFileJob).toHaveBeenCalled());
    const request = generation.createFileJob.mock.calls[0][0];
    expect(request).toMatchObject({ type: 'SHAPEFILE', name: 'admin', inputs: inspection.inputs, params: { resolution: 0.00025, date: '2026-05-01' } });
    expect(request.params).not.toHaveProperty('sensor');
    expect(request.variables).toEqual([
      { source: 'pop_total', name: 'pop_total', kind: 'continuous', style: { colorBar: 'viridis', min: 120, max: 31800 } },
      { source: 'land_use', name: 'land_use', kind: 'categorical', style: { colorBar: 'tab10' } },
      { source: 'area_km2', name: 'area_km2', kind: 'continuous', style: { colorBar: 'tab10', min: 0.5, max: 120.2 } },
    ]);
    expect(await screen.findByText('생성 작업을 시작했습니다')).toBeInTheDocument();
  });

  test('범위가 잘못되면 다음 단계로 넘어가지 않는다', async () => {
    await toSettings();
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));
    expect(screen.getByText(/속성을 하나 이상 고르세요/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /pop_total/ }));
    fireEvent.change(screen.getByLabelText('pop_total 표시 최솟값'), { target: { value: '50000' } });
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));
    expect(screen.getByText('최솟값은 최댓값보다 작아야 합니다.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '생성 시작' })).not.toBeInTheDocument();
  });

  test('파일 생성 API가 없으면(404) 개발 단계 용어 없이 알리고 입력을 유지한다', async () => {
    generation.createFileJob.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'missing'));
    await toSettings();
    fireEvent.click(screen.getByRole('checkbox', { name: /area_km2/ }));
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));
    fireEvent.click(await screen.findByRole('button', { name: '생성 시작' }));
    expect(await screen.findByText(/지금은 서버에서 파일로 데이터를 만들 수 없습니다/)).toBeInTheDocument();
    expect(screen.queryByText(/M1/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '생성 시작' })).toBeEnabled();
  });

  test('GEE는 고른 band만 요청하고 band별 색상·범위를 보낸다', async () => {
    generation.getCollections.mockResolvedValue([{ id: 'COPERNICUS/S2', name: 'Sentinel-2', bands: ['B2', 'B3', 'B4', 'B8'] }]);
    generation.createGeeJob.mockResolvedValue({ id: 5, status: 'SUCCEEDED', registration: { datacubeId: 93, xcubeDatasetId: 'u1-d93' } });
    renderAt('/app/data/new');
    fireEvent.click(await screen.findByRole('radio', { name: /Google Earth Engine/ }));
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));
    // 자료: the collection and the bands to build (UR-54).
    fireEvent.click(await screen.findByRole('radio', { name: /Sentinel-2/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'B8' }));
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));
    // 영역: a rectangle typed in (each value counts when the field loses focus).
    fireEvent.click(await screen.findByRole('tab', { name: '사각형' }));
    for (const [label, value] of [['좌하단 경도', '126.5'], ['좌하단 위도', '35'], ['우상단 경도', '127'], ['우상단 위도', '35.5']]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
      fireEvent.blur(screen.getByLabelText(label));
    }
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));
    // 기간·날짜: 다음 waits for the size estimate of this area and period.
    fireEvent.change(await screen.findByLabelText('시작 날짜'), { target: { value: '2026-05-01' } });
    fireEvent.change(screen.getByLabelText('끝 날짜'), { target: { value: '2026-05-31' } });
    await waitFor(() => expect(screen.getByRole('button', { name: /다음/ })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));
    // 이름·확인
    fireEvent.change(await screen.findByLabelText('데이터 이름'), { target: { value: '서울 S2' } });
    // The typed name never reaches the estimate (typing it must not re-estimate).
    await waitFor(() => expect(generation.estimateGee).toHaveBeenCalled());
    for (const [body] of generation.estimateGee.mock.calls) expect(body.name).toBe('새 데이터');
    expect(screen.queryByLabelText('B8 변수 이름')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('B8 표시 최솟값'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('B8 표시 최댓값'), { target: { value: '4000' } });
    const start = await screen.findByRole('button', { name: '생성 시작' });
    await waitFor(() => expect(start).toBeEnabled());
    fireEvent.click(start);
    await waitFor(() => expect(generation.createGeeJob).toHaveBeenCalledWith(expect.objectContaining({
      collectionId: 'COPERNICUS/S2', bands: ['B8'], bandStyles: [{ variable: 'B8', colorBar: 'viridis', valueMin: 0, valueMax: 4000 }],
      bounds: { west: 126.5, south: 35, east: 127, north: 35.5 },
      area: { mode: 'box', box: { west: 126.5, south: 35, east: 127, north: 35.5 }, clip: 'bbox', fullCoverOnly: false, maskVariable: false },
    })));
    // The result opens the new dataset, and "다른 데이터 추가" starts over without reloading the page.
    expect(await screen.findByText('생성이 끝났습니다')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Viewer에서 열기/ })).toHaveAttribute('href', '/app/viewer?dataset=93');
    expect(screen.getByRole('link', { name: '데이터 보기' })).toHaveAttribute('href', '/app/data/93');
    fireEvent.click(screen.getByRole('button', { name: '다른 데이터 추가' }));
    expect(screen.getByRole('heading', { name: '방식 선택' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Google Earth Engine/ })).toHaveAttribute('aria-checked', 'false');
  });

  test('방식 카드는 하나의 탭 정지점과 방향키 선택을 쓴다', async () => {
    renderAt('/app/data/new');
    const cards = await screen.findAllByRole('radio');
    expect(cards.map((card) => card.tabIndex)).toEqual([0, -1, -1, -1, -1]);
    cards[0].focus();
    fireEvent.keyDown(cards[0], { key: 'ArrowRight' });
    expect(cards[1]).toHaveFocus();
    expect(cards[1]).toHaveAttribute('aria-checked', 'true');
    expect(cards.map((card) => card.tabIndex)).toEqual([-1, 0, -1, -1, -1]);
    fireEvent.keyDown(cards[1], { key: 'End' });
    expect(cards[4]).toHaveAttribute('aria-checked', 'true');
  });

  test('일반 GeoTIFF는 위성·센서가 필요하고, 날짜 없는 파일은 관측 날짜를 받아 함께 보낸다', async () => {
    const tif = { sourceType: 'GEOTIFF', fileName: 'scene.tif', bands: ['band_1', 'band_2'], fields: [{ name: 'band_1', type: 'integer', approxStats: { min: 0, max: 9000, p2: 100, p98: 3000 } }, { name: 'band_2', type: 'integer', approxStats: { min: 0, max: 9000, p2: 120, p98: 3200 } }], bounds: { west: 126, south: 35, east: 127, north: 36 }, width: 100, height: 100, files: ['scene.tif'], message: 'GDAL 검사 완료', inputs: [{ kind: 'geotiff', uri: 'file:///tmp/scene.tif' }] };
    generation.inspectSpatialFile.mockResolvedValue(tif);
    generation.createFileJob.mockResolvedValue({ id: 'job-3', status: 'QUEUED' });
    renderAt('/app/data/new');
    fireEvent.click(await screen.findByRole('radio', { name: /GeoTIFF \/ CAS500/ }));
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));
    fireEvent.change(screen.getByLabelText('파일 선택'), { target: { files: [new File(['x'], 'scene.tif', { type: 'image/tiff' })] } });
    expect(await screen.findByText('GDAL 검사 완료')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));
    fireEvent.click(await screen.findByRole('button', { name: /다음/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /band_2/ }));
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));
    expect(screen.getByText('위성·센서를 고르거나 입력하세요.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('위성·센서'), { target: { value: 'SENTINEL2_L2A' } });
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));
    expect(screen.getByText('파일 이름에 날짜가 없어 관측 날짜가 필요합니다.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('관측 날짜'), { target: { value: '2026-05-01' } });
    fireEvent.change(screen.getByLabelText('nodata 값 (선택)'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));
    fireEvent.click(await screen.findByRole('button', { name: '생성 시작' }));
    await waitFor(() => expect(generation.createFileJob).toHaveBeenCalled());
    expect(generation.createFileJob.mock.calls[0][0]).toMatchObject({
      type: 'GEOTIFF_BANDS',
      params: { sensor: 'SENTINEL2_L2A', date: '2026-05-01', nodata: 0 },
      variables: [{ source: 'band_2', name: 'band_2', kind: 'continuous', style: { colorBar: 'viridis', min: 120, max: 3200 } }],
    });
  });
});

describe('M4 작업 센터·대시보드·생성 이력', () => {
  const failed = { id: 'j1', name: '울산 Shape', type: 'SHAPEFILE', status: 'FAILED', progress: 0.4, createdAt: '2026-10-02T01:00:00Z', startedAt: '2026-10-02T01:00:00Z', finishedAt: '2026-10-02T01:01:05Z', errorCode: 'INVALID_INPUT', errorMessage: 'No timestamp in ulsan.shp', input: { files: ['ulsan.zip'], variables: [{ source: 'pop', name: 'pop', kind: 'continuous', style: { colorBar: 'viridis', min: 0, max: 100 } }], params: { resolution: 0.00025 } } };
  const running = { id: 'j2', name: '제주 GeoTIFF', type: 'GEOTIFF_BANDS', status: 'RUNNING', progress: 0.5, stage: 'convert', createdAt: '2026-10-02T02:00:00Z', startedAt: '2026-10-02T02:00:00Z', input: { files: ['jeju.tif'], params: { sensor: 'SENTINEL2_L2A', date: '2026-05-01' } } };
  const done = { id: 'j3', name: '완료 영상', type: 'GEE_TO_ZARR', status: 'SUCCEEDED', progress: 1, createdAt: '2026-10-01T02:00:00Z', registration: { datacubeId: 62, xcubeDatasetId: 'u7-d62' }, input: { collectionId: 'COPERNICUS/S2', bands: ['B8'], startDate: '2026-05-01', endDate: '2026-05-31' } };

  test('작업 목록에서 실패 사유를 보고 다시 시도하며, 처리 중 작업은 취소할 수 있다', async () => {
    generation.listJobs.mockResolvedValue([running, failed, done]);
    generation.retryJob.mockResolvedValue({ ...failed, id: 'j4', status: 'QUEUED' });
    generation.cancelJob.mockResolvedValue({});
    renderAt('/app/jobs');
    expect(await screen.findByText('울산 Shape')).toBeInTheDocument();
    expect(screen.getByText('No timestamp in ulsan.shp')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: '제주 GeoTIFF 진행률' })).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByRole('link', { name: '데이터 보기' })).toHaveAttribute('href', '/app/data/62');
    fireEvent.click(screen.getByRole('button', { name: '울산 Shape 상세 펼치기' }));
    expect(screen.getByText(/실패 사유: No timestamp/)).toBeInTheDocument();
    expect(screen.getByRole('list', { name: '처리 단계' })).toHaveTextContent('변환 실패');
    expect(screen.getByText('viridis')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '울산 Shape 다시 시도' }));
    await waitFor(() => expect(generation.retryJob).toHaveBeenCalledWith('j1'));
    expect(await screen.findByText('같은 설정으로 다시 실행했습니다.')).toBeInTheDocument();
    expect(screen.getByText(formatDateTime(running.createdAt))).toHaveClass('date');
    fireEvent.click(screen.getByRole('button', { name: '제주 GeoTIFF 취소' }));
    const confirm = await screen.findByRole('alertdialog', { name: '작업을 취소할까요?' });
    expect(generation.cancelJob).not.toHaveBeenCalled();
    fireEvent.click(within(confirm).getByRole('button', { name: '작업 취소' }));
    await waitFor(() => expect(generation.cancelJob).toHaveBeenCalledWith('j2'));
  });

  test('진행 막대는 처리 중일 때만 보인다', async () => {
    generation.listJobs.mockResolvedValue([running, failed, done]);
    renderAt('/app/jobs');
    await screen.findByText('울산 Shape');
    expect(screen.getAllByRole('progressbar').map((bar) => bar.getAttribute('aria-label'))).toEqual(['제주 GeoTIFF 진행률']);
  });

  test('필터를 바꾸면 그 조건으로 다시 조회한다', async () => {
    renderAt('/app/jobs');
    expect(await screen.findByText('아직 작업이 없습니다')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Shapefile' }));
    await waitFor(() => expect(generation.listJobs).toHaveBeenLastCalledWith({ type: 'SHAPEFILE', status: '' }));
    fireEvent.change(screen.getByRole('combobox', { name: '상태' }), { target: { value: 'FAILED,CANCELLED' } });
    await waitFor(() => expect(generation.listJobs).toHaveBeenLastCalledWith({ type: 'SHAPEFILE', status: 'FAILED,CANCELLED' }));
  });

  test('대시보드는 처리 중 작업 수와 최근 작업을 보여 준다', async () => {
    generation.listJobs.mockResolvedValue([running, failed, done]);
    renderAt('/app');
    expect(await screen.findByText('제주 GeoTIFF')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '처리 중 1' })).toHaveAttribute('href', '/app/jobs?status=QUEUED%2CRUNNING');
    const section = screen.getByRole('region', { name: '최근 작업' });
    const rows = within(section).getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getByText(/제주|울산|완료 영상/).textContent)).toEqual(['제주 GeoTIFF', '울산 Shape', '완료 영상']);
    expect(within(rows[0]).getByText('처리 중')).toBeInTheDocument();
    expect(within(rows[1]).getByText('실패')).toBeInTheDocument();
    expect(within(rows[0]).getByText(formatDateTime(running.createdAt))).toHaveClass('date');
    expect(within(section).getByRole('link', { name: '전체 보기' })).toHaveAttribute('href', '/app/jobs');
  });

  test('데이터 상세의 생성 이력은 생성 작업의 입력과 단계를 보여 준다', async () => {
    backoffice.getDatasetDetail.mockResolvedValue({ ...owned, generationJobId: 'j3' });
    generation.jobSummary.mockResolvedValue(done);
    renderAt('/app/data/77');
    fireEvent.click(await screen.findByRole('tab', { name: '생성 이력' }));
    expect(await screen.findByText('COPERNICUS/S2')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: '처리 단계' })).toHaveTextContent('XCube 반영 완료');
    expect(generation.jobSummary).toHaveBeenCalledWith('j3');
  });

  test('생성 작업 없이 추가된 데이터는 생성 이력이 없다고 알려 준다', async () => {
    backoffice.getDatasetDetail.mockResolvedValue({ ...owned });
    renderAt('/app/data/77');
    fireEvent.click(await screen.findByRole('tab', { name: '생성 이력' }));
    expect(await screen.findByText('생성 이력이 없습니다')).toBeInTheDocument();
  });
});

describe('M6 수식 융합 작업·데이터 표시', () => {
  const fusionDone = { id: 'f1', name: 'NDWI 융합', type: 'FUSION', status: 'SUCCEEDED', progress: 1, createdAt: '2026-10-05T03:00:00Z', registration: { datacubeId: 91, xcubeDatasetId: 'u1-d91' }, input: { name: 'NDWI 융합', formula: '(A - B) / (A + B)', bindings: { A: { datacubeId: 77, variable: 'red', normalization: 'auto' }, B: { datacubeId: 88, variable: 'red', normalization: { scale: 0.0001, offset: 0 } } }, grid: { reference: 'coarsest', datacubeId: null, resampling: 'average' }, extent: 'intersection', time: { mode: 'nearest', toleranceDays: 3, period: null, agg: null }, outputVariable: 'fusion', projectId: null } };
  const fusionFailed = { ...fusionDone, id: 'f2', name: '실패한 융합', status: 'FAILED', progress: 0.5, createdAt: '2026-10-05T02:00:00Z', registration: null, errorMessage: 'GRID_MISMATCH' };
  const generated = { id: 'g1', name: '제주 GeoTIFF', type: 'GEOTIFF_BANDS', status: 'RUNNING', progress: 0.5, stage: 'convert', createdAt: '2026-10-05T01:00:00Z', input: {} };

  test('작업 센터는 생성 작업과 융합 작업을 최근순으로 합쳐 보여 주고, 취소·다시 시도는 각 서비스로 간다', async () => {
    generation.listJobs.mockResolvedValue([generated]);
    analysis.listJobs.mockResolvedValue([fusionFailed, fusionDone]);
    analysis.retryJob.mockResolvedValue({ ...fusionFailed, id: 'f3', status: 'QUEUED' });
    generation.cancelJob.mockResolvedValue({});
    renderAt('/app/jobs');
    expect(await screen.findByText('NDWI 융합')).toBeInTheDocument();
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getByText(/NDWI 융합|실패한 융합|제주 GeoTIFF/, { selector: 'strong' }).textContent)).toEqual(['NDWI 융합', '실패한 융합', '제주 GeoTIFF']);
    expect(screen.getAllByText('수식 융합').length).toBeGreaterThan(1);
    expect(screen.getByRole('link', { name: '데이터 보기' })).toHaveAttribute('href', '/app/data/91');
    fireEvent.click(screen.getByRole('button', { name: '실패한 융합 다시 시도' }));
    await waitFor(() => expect(analysis.retryJob).toHaveBeenCalledWith('f2'));
    expect(generation.retryJob).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '제주 GeoTIFF 취소' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '작업 취소' }));
    await waitFor(() => expect(generation.cancelJob).toHaveBeenCalledWith('g1'));
    expect(analysis.cancelJob).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'NDWI 융합 상세 펼치기' }));
    expect(screen.getByText('(A - B) / (A + B)')).toBeInTheDocument();
  });

  test('종류 필터 “수식 융합”은 융합 서비스만 조회한다', async () => {
    analysis.listJobs.mockResolvedValue([fusionDone]);
    renderAt('/app/jobs');
    await screen.findByText('NDWI 융합');
    generation.listJobs.mockClear();
    fireEvent.click(screen.getByRole('button', { name: '수식 융합' }));
    await waitFor(() => expect(analysis.listJobs).toHaveBeenLastCalledWith({ status: '' }));
    expect(generation.listJobs).not.toHaveBeenCalled();
  });

  test('융합 서비스가 꺼져 있어도 생성 작업은 계속 보인다', async () => {
    generation.listJobs.mockResolvedValue([generated]);
    analysis.listJobs.mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', '서버에 연결할 수 없습니다.'));
    renderAt('/app/jobs');
    expect(await screen.findByText('제주 GeoTIFF')).toBeInTheDocument();
    expect(screen.getByText('수식 융합 작업 목록을 불러오지 못했습니다. 나머지 작업만 표시합니다.')).toBeInTheDocument();
  });

  test('AI 서비스가 실패하면 불러온 작업은 남기고 알림과 다시 시도를 보여 준다', async () => {
    generation.listJobs.mockResolvedValue([generated]);
    analysis.listJobs.mockResolvedValue([fusionDone]);
    aiService.listJobs.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', '서버에 연결할 수 없습니다.'));
    renderAt('/app/jobs');
    expect(await screen.findByText('제주 GeoTIFF')).toBeInTheDocument();
    expect(screen.getByText('NDWI 융합')).toBeInTheDocument();
    expect(screen.getByText('AI 작업 목록을 불러오지 못했습니다. 나머지 작업만 표시합니다.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(screen.queryByText(/AI 작업 목록을 불러오지 못했습니다/)).not.toBeInTheDocument());
    expect(aiService.listJobs).toHaveBeenCalledTimes(2);
  });

  test('대시보드의 처리 중 작업 수와 최근 작업에 융합 작업이 함께 들어간다', async () => {
    generation.listJobs.mockResolvedValue([generated]);
    analysis.listJobs.mockResolvedValue([{ ...fusionDone, status: 'RUNNING', registration: null }]);
    renderAt('/app');
    expect(await screen.findByText('NDWI 융합')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '처리 중 2' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /수식 융합/ })).toHaveAttribute('href', '/app/analysis/fusion');
  });

  test('융합 결과 데이터는 목록·상세에 “융합 결과” badge를 달고, 상세 이력에서 같은 조건으로 S12를 연다', async () => {
    const fusionData = { ...owned, id: '91', name: 'NDWI 융합 결과', kind: 'FUSION', generationJobId: 'f1', variables: ['fusion'] };
    adapter.getDatasets.mockResolvedValue([owned, fusionData]);
    renderAt('/app/data');
    await screen.findByText('NDWI 융합 결과');
    const rowOf = (text: string) => screen.getAllByRole('row').find((row) => within(row).queryByText(text))!;
    expect(within(rowOf('NDWI 융합 결과')).getByText('융합 결과')).toBeInTheDocument();
    expect(within(rowOf('연결된 Zarr')).queryByText('융합 결과')).toBeNull();
  });

  test('융합 결과 상세: 수식·규칙을 보여 주고 “같은 조건으로 다시 실행”이 S12를 채워 연다', async () => {
    const fusionData = { ...owned, id: '91', name: 'NDWI 융합 결과', kind: 'FUSION', generationJobId: 'f1', variables: ['fusion'] };
    backoffice.getDatasetDetail.mockResolvedValue(fusionData);
    adapter.getDatasets.mockResolvedValue([owned, shared]);
    analysis.getJob.mockResolvedValue(fusionDone);
    renderAt('/app/data/91');
    expect(await screen.findByText('융합 결과')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '생성 이력' }));
    expect(await screen.findByText('(A - B) / (A + B)')).toBeInTheDocument();
    expect(screen.getByText('±3일', { exact: false })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '같은 조건으로 다시 실행' }));
    expect(await screen.findByRole('heading', { name: '입력' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('A 데이터')).toHaveValue('77'));
    expect(screen.getByLabelText('B 정규화')).toHaveValue('custom');
  });
});

describe('M7 AI 수체 추출 작업·결과 표시', () => {
  const aiRunning = { id: 'a1', name: '연결된 Zarr_수체_U-Net', type: 'AI_WATER', status: 'RUNNING', progress: 0.4, stage: 'infer', createdAt: '2026-10-07T03:00:00Z', input: { datacubeId: 77, modelId: 'unet-s1s2-10ch', threshold: 0.5 } };
  const aiDone = { ...aiRunning, id: 'a2', name: '끝난 수체 추출', status: 'SUCCEEDED', progress: 1, createdAt: '2026-10-07T02:00:00Z', registration: { datacubeId: 95, xcubeDatasetId: 'u1-d95' } };
  const generated = { id: 'g1', name: '제주 GeoTIFF', type: 'GEOTIFF_BANDS', status: 'SUCCEEDED', progress: 1, createdAt: '2026-10-07T01:00:00Z', input: {} };

  test('작업 센터는 AI 작업을 “AI 수체 추출”로 합쳐 보여 주고, 취소는 AI 서비스로 간다', async () => {
    generation.listJobs.mockResolvedValue([generated]);
    aiService.listJobs.mockResolvedValue([aiRunning, aiDone]);
    aiService.cancelJob.mockResolvedValue({});
    renderAt('/app/jobs');
    expect(await screen.findByText('연결된 Zarr_수체_U-Net')).toBeInTheDocument();
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getByText(/수체|GeoTIFF/, { selector: 'strong' }).textContent)).toEqual(['연결된 Zarr_수체_U-Net', '끝난 수체 추출', '제주 GeoTIFF']);
    expect(within(rows[0]).getByText('AI 수체 추출')).toBeInTheDocument();
    expect(within(rows[1]).getByRole('link', { name: '데이터 보기' })).toHaveAttribute('href', '/app/data/95');
    expect(within(rows[1]).getByRole('link', { name: /Viewer에서 원본과 비교/ })).toHaveAttribute('href', '/app/viewer?dataset=77&ai=a2');
    fireEvent.click(screen.getByRole('button', { name: '연결된 Zarr_수체_U-Net 취소' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '작업 취소' }));
    await waitFor(() => expect(aiService.cancelJob).toHaveBeenCalledWith('a1'));
    expect(generation.cancelJob).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '끝난 수체 추출 상세 펼치기' }));
    expect(screen.getByText('U-Net (S1+S2 10채널)')).toBeInTheDocument();
    expect(screen.getByText('추론')).toBeInTheDocument();
  });

  test('종류 필터 “AI 수체 추출”은 AI 서비스만 조회하고, AI 서비스가 꺼져도 다른 작업은 보인다', async () => {
    aiService.listJobs.mockResolvedValue([aiDone]);
    renderAt('/app/jobs');
    await screen.findByText('끝난 수체 추출');
    generation.listJobs.mockClear();
    analysis.listJobs.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'AI 수체 추출' }));
    await waitFor(() => expect(aiService.listJobs).toHaveBeenLastCalledWith({ status: '' }));
    expect(generation.listJobs).not.toHaveBeenCalled();
    expect(analysis.listJobs).not.toHaveBeenCalled();
  });

  test('AI 서비스가 꺼져 있어도 생성 작업은 계속 보이고, 대시보드 처리 중 수에 AI 작업이 들어간다', async () => {
    generation.listJobs.mockResolvedValue([{ ...generated, status: 'RUNNING' }]);
    aiService.listJobs.mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', '서버에 연결할 수 없습니다.'));
    const { unmount } = renderAt('/app/jobs');
    expect(await screen.findByText('제주 GeoTIFF')).toBeInTheDocument();
    unmount();
    aiService.listJobs.mockResolvedValue([aiRunning]);
    renderAt('/app');
    expect(await screen.findByText('연결된 Zarr_수체_U-Net')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '처리 중 2' })).toBeInTheDocument();
  });

  test('AI 결과 데이터는 목록·상세에 “AI 결과” badge와 원본 링크를 달고, Viewer는 원본에서 결과를 연다', async () => {
    const aiData = { ...owned, id: '95', name: '수체 결과', kind: 'AI_RESULT', sourceDatacubeId: '77', variables: ['water_prob', 'water_mask'] };
    adapter.getDatasets.mockResolvedValue([owned, aiData]);
    const { unmount } = renderAt('/app/data');
    await screen.findByText('수체 결과');
    const row = screen.getAllByRole('row').find((item) => within(item).queryByText('수체 결과'))!;
    expect(within(row).getByText('AI 결과')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: '연결된 Zarr' })).toHaveAttribute('href', '/app/data/77');
    expect(within(row).getByRole('link', { name: /Viewer에서 열기/ })).toHaveAttribute('href', '/app/viewer?dataset=77&ai=95');
    unmount();
    backoffice.getDatasetDetail.mockResolvedValue(aiData);
    renderAt('/app/data/95');
    expect(await screen.findByText('AI 결과')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '#77 보기' })).toHaveAttribute('href', '/app/data/77');
    expect(screen.queryByRole('tab', { name: 'AI 결과' })).not.toBeInTheDocument();
  });

  test('원본 상세의 AI 결과 탭은 AI 작업과 결과 데이터 링크를 보여 준다', async () => {
    backoffice.getDatasetDetail.mockResolvedValue(owned);
    aiService.listJobs.mockResolvedValue([aiDone]);
    renderAt('/app/data/77');
    fireEvent.click(await screen.findByRole('tab', { name: 'AI 결과' }));
    expect(await screen.findByRole('link', { name: '끝난 수체 추출' })).toHaveAttribute('href', '/app/data/95');
    expect(aiService.listJobs).toHaveBeenCalledWith({ datacubeId: '77' });
    expect(screen.getByRole('link', { name: /Viewer에서 원본과 비교/ })).toHaveAttribute('href', '/app/viewer?dataset=77&ai=a2');
  });
});

describe('목록 상태를 주소에 남긴다 (#17)과 목록 표시 정리 (#20)', () => {
  test('데이터 목록: 구분·검색·정렬을 주소에서 읽고, 바꾸면 주소에 쓴다', async () => {
    renderAt('/app/data?scope=shared&sort=name');
    expect(await screen.findByText('공유받은 Zarr')).toBeInTheDocument();
    expect(screen.queryByText('연결된 Zarr')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /공유받음/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('combobox', { name: '정렬' })).toHaveValue('name');
    fireEvent.click(screen.getByRole('tab', { name: /전체/ }));
    expect(await screen.findByText('연결된 Zarr')).toBeInTheDocument();
    expect(screen.getByTestId('search')).toHaveTextContent('?sort=name');
    fireEvent.change(screen.getByRole('searchbox', { name: '데이터 검색' }), { target: { value: '연결' } });
    expect(screen.getByTestId('search')).toHaveTextContent('?sort=name&q=연결');
    expect(screen.queryByText('공유받은 Zarr')).not.toBeInTheDocument();
  });

  test('검색어도 주소에서 다시 채운다', async () => {
    renderAt('/app/data?q=global');
    expect(await screen.findByText('공유받은 Zarr')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: '데이터 검색' })).toHaveValue('global');
    expect(screen.queryByText('연결된 Zarr')).not.toBeInTheDocument();
  });

  test('데이터 목록은 “공유받음”을 공유받은 행에만, 상태는 예외일 때만 단다', async () => {
    adapter.getDatasets.mockResolvedValue([owned, shared, { ...owned, id: '79', name: '동기화 Zarr', subtitle: 'PENDING · UNKNOWN' }]);
    renderAt('/app/data');
    await screen.findByText('동기화 Zarr');
    const rowOf = (text: string) => screen.getAllByRole('row').find((row) => within(row).queryByRole('link', { name: text }))!;
    expect(within(rowOf('연결된 Zarr')).queryByText('공유받음')).toBeNull();
    expect(within(rowOf('연결된 Zarr')).queryByText('내 데이터')).toBeNull();
    expect(within(rowOf('연결된 Zarr')).queryByText('사용 가능')).toBeNull();
    expect(within(rowOf('공유받은 Zarr')).getByText('공유받음')).toBeInTheDocument();
    expect(within(rowOf('동기화 Zarr')).getByText('동기화 중')).toBeInTheDocument();
  });

  test('작업: 종류·상태 필터를 주소에서 읽고 바꾸면 주소에 쓴다', async () => {
    renderAt('/app/jobs?type=SHAPEFILE&status=FAILED,CANCELLED');
    await waitFor(() => expect(generation.listJobs).toHaveBeenLastCalledWith({ type: 'SHAPEFILE', status: 'FAILED,CANCELLED' }));
    expect(screen.getByRole('button', { name: 'Shapefile' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('combobox', { name: '상태' })).toHaveValue('FAILED,CANCELLED');
    fireEvent.click(screen.getByRole('button', { name: '전체' }));
    await waitFor(() => expect(generation.listJobs).toHaveBeenLastCalledWith({ type: '', status: 'FAILED,CANCELLED' }));
    expect(screen.getByTestId('search')).toHaveTextContent('?status=FAILED,CANCELLED');
  });

  test('데이터 상세: 연 탭을 주소에 남기고, 주소의 탭으로 연다', async () => {
    backoffice.getDatasetDetail.mockResolvedValue({ ...owned, bbox: [126, 33, 127, 34] });
    const { unmount } = renderAt('/app/data/77');
    fireEvent.click(await screen.findByRole('tab', { name: /변수·Band/ }));
    expect(screen.getByTestId('search')).toHaveTextContent('?tab=variables');
    unmount();
    renderAt('/app/data/77?tab=history');
    expect(await screen.findByRole('tab', { name: '생성 이력' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('생성 이력이 없습니다')).toBeInTheDocument();
  });
});
