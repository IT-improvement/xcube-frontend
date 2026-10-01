/* M4 management pages against mocked Backoffice/Generation APIs (real mode). */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

jest.mock('../../api', () => ({ activeViewerAdapter: { getProjects: jest.fn(), getDatasets: jest.fn(), getProjectDatasets: jest.fn(), getJobs: jest.fn(), runWaterExtraction: jest.fn() }, useMockApi: false }));
jest.mock('../../api/backofficeApi', () => ({ backofficeAdapter: { getProject: jest.fn(), createProject: jest.fn(), updateProject: jest.fn(), deleteProject: jest.fn(), getProjectMembers: jest.fn(), addProjectMember: jest.fn(), updateProjectMember: jest.fn(), removeProjectMember: jest.fn(), getProjectDatasets: jest.fn(), getLinkableDatacubes: jest.fn(), linkProjectDataset: jest.fn(), unlinkProjectDataset: jest.fn(), getDatasetDetail: jest.fn(), deleteDatacube: jest.fn(), registerDatacube: jest.fn() } }));
jest.mock('../../api/generationApi', () => ({ generationApi: { getColorBarOptions: jest.fn(), getCollections: jest.fn(), inspectSpatialFile: jest.fn(), createGeeJob: jest.fn(), createFileJob: jest.fn(), getJob: jest.fn() } }));
jest.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 1, name: '홍길동' }, signOut: jest.fn() }) }));

const adapter = require('../../api').activeViewerAdapter as Record<string, jest.Mock>;
const backoffice = require('../../api/backofficeApi').backofficeAdapter as Record<string, jest.Mock>;
const generation = require('../../api/generationApi').generationApi as Record<string, jest.Mock>;
const { ApiError } = require('../../api/httpClient');
const DashboardPage = require('./DashboardPage').default;
const DataLibraryPage = require('./DataLibraryPage').default;
const DatasetDetailPage = require('./DatasetDetailPage').default;
const { ProjectDetailPage, ProjectsPage } = require('./ProjectsPage');
const AddDataPage = require('../wizard/AddDataPage').default;

const owned = { id: '77', projectId: '4', name: '연결된 Zarr', subtitle: 'REGISTERED · AVAILABLE', xcubeDatasetId: 'linked', defaultVariable: 'red', variables: ['red'], times: [], accessType: 'OWNED' };
const shared = { ...owned, id: '88', projectId: '', name: '공유받은 Zarr', xcubeDatasetId: 'global', accessType: 'SHARED' };

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/app" element={<DashboardPage />} />
        <Route path="/app/data" element={<DataLibraryPage />} />
        <Route path="/app/data/new" element={<AddDataPage />} />
        <Route path="/app/data/:datasetId" element={<DatasetDetailPage />} />
        <Route path="/app/projects" element={<ProjectsPage />} />
        <Route path="/app/projects/:projectId" element={<ProjectDetailPage />} />
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
  generation.getColorBarOptions.mockResolvedValue([{ id: 'viridis', category: 'Sequential' }, { id: 'tab10', category: 'Qualitative' }]);
  window.confirm = jest.fn(() => true);
});

describe('S6 프로젝트', () => {
  test('OWNER는 멤버를 조회하고 숫자 사용자 ID로 추가한다', async () => {
    backoffice.addProjectMember.mockResolvedValue({ userId: '33', role: 'EDITOR' });
    renderAt('/app/projects/4');
    fireEvent.click(await screen.findByRole('tab', { name: '멤버' }));
    expect(await screen.findByText('사용자 22')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('사용자 ID'), { target: { value: '33' } });
    fireEvent.change(screen.getByLabelText('권한'), { target: { value: 'EDITOR' } });
    fireEvent.click(screen.getByRole('button', { name: '멤버 추가' }));
    await waitFor(() => expect(backoffice.addProjectMember).toHaveBeenCalledWith('4', { userId: '33', role: 'EDITOR' }));
    expect(await screen.findByText('사용자 33')).toBeInTheDocument();
  });

  test('숫자가 아닌 사용자 ID는 서버로 보내지 않는다', async () => {
    renderAt('/app/projects/4');
    fireEvent.click(await screen.findByRole('tab', { name: '멤버' }));
    fireEvent.change(await screen.findByLabelText('사용자 ID'), { target: { value: '@kim' } });
    fireEvent.click(screen.getByRole('button', { name: '멤버 추가' }));
    expect(await screen.findByText('사용자 ID는 숫자로 입력해 주세요.')).toBeInTheDocument();
    expect(backoffice.addProjectMember).not.toHaveBeenCalled();
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
    await waitFor(() => expect(backoffice.unlinkProjectDataset).toHaveBeenCalledWith('4', '77'));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('원본은 삭제되지 않습니다'));
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
  });

  test('대시보드는 데이터가 없으면 첫 데이터 추가를 안내한다', async () => {
    adapter.getDatasets.mockResolvedValue([]);
    renderAt('/app');
    expect(await screen.findByText('첫 데이터큐브를 추가해 보세요.')).toBeInTheDocument();
    expect(screen.queryByText('내 데이터큐브')).not.toBeInTheDocument();
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
    expect(request).toMatchObject({ type: 'SHAPEFILE', name: 'admin', inputs: inspection.inputs, params: { resolution: 0.00025 } });
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

  test('파일 생성 API가 없으면(404) 준비 중이라고 알리고 입력을 유지한다', async () => {
    generation.createFileJob.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'missing'));
    await toSettings();
    fireEvent.click(screen.getByRole('checkbox', { name: /area_km2/ }));
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));
    fireEvent.click(await screen.findByRole('button', { name: '생성 시작' }));
    expect(await screen.findByText(/파일 생성 API가 아직 서버에 연결되지 않았습니다/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '생성 시작' })).toBeEnabled();
  });

  test('GEE는 고른 band만 요청하고 band별 색상·범위를 보낸다', async () => {
    generation.getCollections.mockResolvedValue([{ id: 'COPERNICUS/S2', name: 'Sentinel-2', bands: ['B2', 'B3', 'B4', 'B8'] }]);
    generation.createGeeJob.mockResolvedValue({ id: 5, status: 'QUEUED' });
    renderAt('/app/data/new');
    fireEvent.click(await screen.findByRole('radio', { name: /Google Earth Engine/ }));
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));
    fireEvent.click(await screen.findByRole('radio', { name: /Sentinel-2/ }));
    fireEvent.change(screen.getByLabelText('시작 날짜'), { target: { value: '2026-05-01' } });
    fireEvent.change(screen.getByLabelText('끝 날짜'), { target: { value: '2026-05-31' } });
    fireEvent.change(screen.getByLabelText('좌하단 경도'), { target: { value: '126.5' } });
    fireEvent.change(screen.getByLabelText('좌하단 위도'), { target: { value: '35' } });
    fireEvent.change(screen.getByLabelText('우상단 경도'), { target: { value: '127' } });
    fireEvent.change(screen.getByLabelText('우상단 위도'), { target: { value: '35.5' } });
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));
    fireEvent.click(await screen.findByRole('button', { name: /다음/ }));
    fireEvent.change(screen.getByLabelText('데이터 이름'), { target: { value: '서울 S2' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /B8/ }));
    expect(screen.queryByLabelText('B8 변수 이름')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('B8 표시 최솟값'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('B8 표시 최댓값'), { target: { value: '4000' } });
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));
    fireEvent.click(await screen.findByRole('button', { name: '생성 시작' }));
    await waitFor(() => expect(generation.createGeeJob).toHaveBeenCalledWith(expect.objectContaining({
      collectionId: 'COPERNICUS/S2', bands: ['B8'], bandStyles: [{ variable: 'B8', colorBar: 'viridis', valueMin: 0, valueMax: 4000 }],
      bounds: { west: 126.5, south: 35, east: 127, north: 35.5 },
    })));
  });
});
