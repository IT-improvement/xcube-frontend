/* UX12 (audit 6, 관리 목록 보강): list information, detail and projects, perceived speed, band math header, cleanup. */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { LanguageProvider } from '../../i18n';

jest.mock('../../api', () => ({ activeViewerAdapter: { getProjects: jest.fn(), getDatasets: jest.fn(), getProjectDatasets: jest.fn(), getJobs: jest.fn(), runWaterExtraction: jest.fn() }, useMockApi: false }));
jest.mock('../../api/backofficeApi', () => ({ backofficeAdapter: { getProject: jest.fn(), createProject: jest.fn(), updateProject: jest.fn(), deleteProject: jest.fn(), getProjectMembers: jest.fn(), addProjectMember: jest.fn(), updateProjectMember: jest.fn(), removeProjectMember: jest.fn(), getProjectDatasets: jest.fn(), getLinkableDatacubes: jest.fn(), linkProjectDataset: jest.fn(), unlinkProjectDataset: jest.fn(), getDatasetDetail: jest.fn(), deleteDatacube: jest.fn(), registerDatacube: jest.fn() } }));
jest.mock('../../api/generationApi', () => ({ generationApi: { listJobs: jest.fn(), jobSummary: jest.fn(), retryJob: jest.fn(), cancelJob: jest.fn(), getColorBarOptions: jest.fn(), getCollections: jest.fn() } }));
jest.mock('../../api/analysisApi', () => ({ ...jest.requireActual('../../api/analysisApi'), analysisApi: { validate: jest.fn(), dryRun: jest.fn(), createJob: jest.fn(), listJobs: jest.fn(), getJob: jest.fn(), cancelJob: jest.fn(), retryJob: jest.fn() } }));
jest.mock('../../api/aiApi', () => ({ ...jest.requireActual('../../api/aiApi'), aiApi: { listModels: jest.fn(), check: jest.fn(), createJob: jest.fn(), listJobs: jest.fn(), getJob: jest.fn(), cancelJob: jest.fn(), retryJob: jest.fn() } }));
jest.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 1, name: '홍길동' }, signOut: jest.fn() }) }));

const adapter = require('../../api').activeViewerAdapter as Record<string, jest.Mock>;
const backoffice = require('../../api/backofficeApi').backofficeAdapter as Record<string, jest.Mock>;
const generation = require('../../api/generationApi').generationApi as Record<string, jest.Mock>;
const analysis = require('../../api/analysisApi').analysisApi as Record<string, jest.Mock>;
const aiService = require('../../api/aiApi').aiApi as Record<string, jest.Mock>;
const { Skeleton } = require('../../components/ui/kit');
const AppShell = require('../AppShell').default;
const DataLibraryPage = require('./DataLibraryPage').default;
const DatasetDetailPage = require('./DatasetDetailPage').default;
const { ProjectsPage, ProjectDetailPage } = require('./ProjectsPage');
const JobsPage = require('./JobsPage').default;
const FusionPage = require('./FusionPage').default;

const times = [{ iso: '2024-08-01T12:00:00', label: '2024-08-01' }, { iso: '2024-08-31T12:00:00', label: '2024-08-31' }];
const original = { id: '77', projectId: '', name: '대청호 S2', subtitle: 'REGISTERED · AVAILABLE', xcubeDatasetId: 'u1-d77', defaultVariable: 'B4', variables: ['B4', 'B8'], times, accessType: 'OWNED', updatedAt: '2026-10-08T03:00:00Z' };
const fused = { ...original, id: '91', name: 'NDWI 융합', kind: 'FUSION', xcubeDatasetId: 'u1-d91' };
const water = { ...original, id: '95', name: '대청호_수체', kind: 'AI_RESULT', sourceDatacubeId: '77', xcubeDatasetId: 'u1-d95', updatedAt: undefined };
const waterJob = { id: 'a2', name: '대청호_수체', type: 'AI_WATER', status: 'SUCCEEDED', progress: 1, createdAt: '2026-10-07T05:32:00', registration: { datacubeId: 95 }, input: { datacubeId: 77, modelId: 'unet-s1s2-10ch', threshold: 0.5, timeStart: '2024-08-01T00:00:00', timeEnd: '2024-08-31T00:00:00' } };

function Probe() {
  return <output data-testid="search">{decodeURIComponent(useLocation().search)}</output>;
}
function renderAt(path: string, lang?: 'en') {
  const tree = (
    <MemoryRouter initialEntries={[path]}>
      <Probe />
      <Routes>
        <Route path="/app/data" element={<DataLibraryPage />} />
        <Route path="/app/data/:datasetId" element={<DatasetDetailPage />} />
        <Route path="/app/projects" element={<ProjectsPage />} />
        <Route path="/app/projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="/app/jobs" element={<JobsPage />} />
        <Route path="/app/analysis/fusion" element={<FusionPage />} />
      </Routes>
    </MemoryRouter>
  );
  return render(lang ? <LanguageProvider initial={lang}>{tree}</LanguageProvider> : tree);
}
const rowOf = (name: string) => screen.getAllByRole('row').find((row) => within(row).queryAllByRole('link')[0]?.textContent === name)!;
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; };

beforeEach(() => {
  jest.useRealTimers();
  adapter.getProjects.mockResolvedValue([]);
  adapter.getDatasets.mockResolvedValue([original, fused, water]);
  adapter.getJobs.mockResolvedValue([]);
  backoffice.getProjectDatasets.mockResolvedValue([]);
  backoffice.getProjectMembers.mockResolvedValue([]);
  generation.listJobs.mockResolvedValue([]);
  analysis.listJobs.mockResolvedValue([]);
  aiService.listJobs.mockResolvedValue([waterJob]);
});

describe('B. 목록 정보', () => {
  test('S3: 종류 필터는 주소(?kind=)에 남고, 수정일 열과 “N개 중 M개”를 보여 준다', async () => {
    renderAt('/app/data');
    expect(await screen.findByRole('link', { name: 'NDWI 융합' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '수정일' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: '상태' })).not.toBeInTheDocument();
    const updated = within(rowOf('대청호 S2')).getByText(new Date('2026-10-08T03:00:00Z').toLocaleDateString('ko-KR'));
    expect(updated).toHaveAttribute('data-label', '수정일');
    expect(screen.getByText('3개')).toBeInTheDocument();
    const kinds = screen.getByRole('group', { name: '데이터 종류' });
    expect(within(kinds).getAllByRole('button').map((button) => button.textContent)).toEqual(['전체', '원본', '융합 결과', 'AI 결과']);
    fireEvent.click(within(kinds).getByRole('button', { name: 'AI 결과' }));
    expect(screen.getByTestId('search')).toHaveTextContent('?kind=ai');
    expect(screen.getByRole('link', { name: '대청호_수체' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'NDWI 융합' })).not.toBeInTheDocument();
    expect(screen.getByText('3개 중 1개')).toBeInTheDocument();
    // An AI result without a catalog date shows a quiet dash that still reads as words.
    expect(within(rowOf('대청호_수체')).getByText('날짜 없음')).toHaveClass('sr-only');
  });

  test('S3: 주소의 종류로 열고, 프로젝트가 없으면 “—”(읽기는 “프로젝트 없음”)만 둔다', async () => {
    renderAt('/app/data?kind=fusion');
    expect(await screen.findByRole('link', { name: 'NDWI 융합' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '대청호 S2' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: '데이터 종류' })).getByRole('button', { name: '융합 결과' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(rowOf('NDWI 융합')).getByText('프로젝트 없음')).toHaveClass('sr-only');
    expect(within(rowOf('NDWI 융합')).getAllByText('—').length).toBeGreaterThan(0);
  });

  test('S3: AI 결과 행의 부제는 모델과 임계값으로 같은 이름을 구분한다', async () => {
    renderAt('/app/data');
    await screen.findByRole('link', { name: '대청호_수체' });
    const row = rowOf('대청호_수체');
    expect(await within(row).findByText(/U-Net \(S1\+S2 10채널\) · 임계값 0\.50/)).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: '대청호 S2' })).toHaveAttribute('href', '/app/data/77');
    expect(aiService.listJobs).toHaveBeenCalledWith({});
  });

  test('S5 AI 결과 탭: 모델·기간·임계값·만든 시각 열, 행마다 “AI 결과” 태그는 없다', async () => {
    backoffice.getDatasetDetail.mockResolvedValue(original);
    renderAt('/app/data/77?tab=ai');
    expect(await screen.findByRole('link', { name: '대청호_수체' })).toHaveAttribute('href', '/app/data/95');
    for (const name of ['결과', '모델', '기간', '임계값', '만든 시각', '상태']) expect(screen.getByRole('columnheader', { name })).toBeInTheDocument();
    const row = screen.getAllByRole('row')[1];
    expect(within(row).getByText('U-Net (S1+S2 10채널)')).toHaveAttribute('data-label', '모델');
    expect(within(row).getByText('2024.08.01–2024.08.31')).toHaveAttribute('data-label', '기간');
    expect(within(row).getByText('0.50')).toHaveAttribute('data-label', '임계값');
    expect(within(row).getByText(/^(2026\.)?10\.07 05:32$/)).toHaveAttribute('data-label', '만든 시각');
    expect(within(row).queryByText('AI 결과')).not.toBeInTheDocument();
  });

  test('S6: 역할 배지는 상태 색을 쓰지 않고(편집도 neutral), 구분·검색은 주소에 남는다', async () => {
    adapter.getProjects.mockResolvedValue([
      { id: '4', name: '대청호 점검', accessRole: 'OWNER', description: '수위 비교', updatedAt: '2026-10-09T01:00:00Z' },
      { id: '6', name: '제주 공유', accessRole: 'EDITOR', ownerUsername: 'kim', updatedAt: '2026-10-08T01:00:00Z' },
    ]);
    renderAt('/app/projects?scope=shared');
    expect(await screen.findByRole('link', { name: '제주 공유' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '대청호 점검' })).not.toBeInTheDocument();
    expect(within(rowOf('제주 공유')).getByText('편집')).toHaveClass('xc-badge--neutral');
    expect(within(rowOf('제주 공유')).getByText('kim')).toHaveAttribute('data-label', '소유자');
    fireEvent.click(within(screen.getByRole('group', { name: '프로젝트 구분' })).getByRole('button', { name: '전체' }));
    expect(within(rowOf('대청호 점검')).getByText('소유자')).toHaveClass('xc-badge--primary');
    fireEvent.change(screen.getByRole('searchbox', { name: '프로젝트 검색' }), { target: { value: '수위' } });
    expect(screen.getByTestId('search')).toHaveTextContent('?q=수위');
    expect(screen.queryByRole('link', { name: '제주 공유' })).not.toBeInTheDocument();
    // No description, no line ("설명 없음" is gone).
    expect(screen.queryByText('설명 없음')).not.toBeInTheDocument();
  });
});

describe('C. 상세·프로젝트', () => {
  test('S5 개요: 소유·생성 방식·만든 시각·해상도·목록 갱신을 보여 주고 범위 그림은 지도로 바뀔 자리에 있다', async () => {
    backoffice.getDatasetDetail.mockResolvedValue({ ...original, generationJobId: 'g1', bbox: [127.4, 36.3, 127.6, 36.5] });
    generation.jobSummary.mockResolvedValue({ id: 'g1', name: 'GEE', type: 'GEE_TO_ZARR', status: 'SUCCEEDED', createdAt: '2026-10-08T02:10:00', input: { scaleMeters: 10 } });
    renderAt('/app/data/77');
    expect(await screen.findByText('10 m')).toBeInTheDocument();
    const terms = screen.getAllByRole('term').map((node) => node.textContent);
    expect(terms).toEqual(expect.arrayContaining(['소유', '생성 방식', '만든 시각', '해상도', '목록 갱신']));
    const values = screen.getAllByRole('definition').map((node) => node.textContent);
    expect(values).toEqual(expect.arrayContaining(['나', 'GEE', '10 m']));
    // OpenLayers does not load under jsdom, so the sketch stays (with the same label).
    expect(screen.getByRole('img', { name: /데이터 범위/ })).toBeInTheDocument();
    expect(screen.getByText('127.40°E, 36.30°N')).toBeInTheDocument();
  });

  test('S5 프로젝트·공유 탭: 연결된 프로젝트 목록(권한·공유 인원)과 연결 해제', async () => {
    adapter.getProjects.mockResolvedValue([{ id: '4', name: '대청호 점검', accessRole: 'OWNER' }, { id: '6', name: '다른 프로젝트', accessRole: 'OWNER' }, { id: '8', name: '보기 전용', accessRole: 'VIEWER' }]);
    backoffice.getProjectDatasets.mockImplementation((id: string) => Promise.resolve(id === '6' ? [] : [original]));
    backoffice.getProjectMembers.mockResolvedValue([{ userId: '1', role: 'OWNER' }, { userId: '22', role: 'VIEWER' }, { userId: '23', role: 'EDITOR' }]);
    backoffice.unlinkProjectDataset.mockResolvedValue(undefined);
    backoffice.getDatasetDetail.mockResolvedValue(original);
    renderAt('/app/data/77?tab=projects');
    expect(await screen.findByRole('link', { name: '대청호 점검' })).toHaveAttribute('href', '/app/projects/4');
    expect(screen.queryByRole('link', { name: '다른 프로젝트' })).not.toBeInTheDocument();
    expect(within(rowOf('대청호 점검')).getByText('2명과 공유')).toBeInTheDocument();
    expect(within(rowOf('보기 전용')).getByText('소유자만 볼 수 있음')).toBeInTheDocument();
    expect(within(rowOf('보기 전용')).queryByRole('button', { name: /연결 해제/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/기본 프로젝트/)).not.toBeInTheDocument();
    fireEvent.click(within(rowOf('대청호 점검')).getByRole('button', { name: '대청호 점검에서 연결 해제' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '연결 해제' }));
    await waitFor(() => expect(backoffice.unlinkProjectDataset).toHaveBeenCalledWith('4', '77'));
    await waitFor(() => expect(screen.queryByRole('link', { name: '대청호 점검' })).not.toBeInTheDocument());
  });

  test('연결 대화상자: 편집할 프로젝트가 없으면 바로 새 프로젝트를 만들어 연결한다(이름 오류는 필드 옆)', async () => {
    adapter.getProjects.mockResolvedValue([{ id: '8', name: '보기 전용', accessRole: 'VIEWER' }]);
    backoffice.createProject.mockResolvedValue({ id: '12', name: '새 점검', accessRole: 'OWNER' });
    backoffice.linkProjectDataset.mockResolvedValue(undefined);
    renderAt('/app/data');
    fireEvent.click(await screen.findByRole('button', { name: '대청호 S2 프로젝트에 연결' }));
    const dialog = await screen.findByRole('dialog', { name: '프로젝트에 연결' });
    const field = await within(dialog).findByLabelText('새 프로젝트 이름');
    fireEvent.click(within(dialog).getByRole('button', { name: '만들고 연결' }));
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(within(dialog).getByText('프로젝트 이름을 입력하세요.')).toBeInTheDocument();
    expect(backoffice.createProject).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: ' 새 점검 ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '만들고 연결' }));
    await waitFor(() => expect(backoffice.linkProjectDataset).toHaveBeenCalledWith('12', '77'));
    expect(backoffice.createProject).toHaveBeenCalledWith({ name: '새 점검' });
    expect(await screen.findByText('“새 점검” 프로젝트에 연결했습니다.')).toBeInTheDocument();
  });

  test('연결 대화상자: 편집할 프로젝트가 있으면 고르기와 “새 프로젝트 만들기”를 오갈 수 있다', async () => {
    adapter.getProjects.mockResolvedValue([{ id: '4', name: '대청호 점검', accessRole: 'OWNER' }]);
    renderAt('/app/data');
    fireEvent.click(await screen.findByRole('button', { name: '대청호 S2 프로젝트에 연결' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByRole('combobox', { name: '프로젝트' })).toHaveValue('4');
    fireEvent.click(within(dialog).getByRole('button', { name: '새 프로젝트 만들기' }));
    expect(within(dialog).getByLabelText('새 프로젝트 이름')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '기존 프로젝트에서 고르기' }));
    expect(within(dialog).getByRole('combobox', { name: '프로젝트' })).toBeInTheDocument();
  });

  test('모바일 카드형: 상세·프로젝트의 표 4개도 카드형이고, 머리줄은 남고 칸은 이름표(data-label)를 단다', async () => {
    backoffice.getDatasetDetail.mockResolvedValue({ ...original, variableMetadata: { B4: { title: 'Red', units: 'DN' } } });
    const { unmount } = renderAt('/app/data/77?tab=variables');
    await screen.findByRole('columnheader', { name: '단위' });
    const table = screen.getByRole('table');
    expect(table).toHaveClass('xc-table--cards');
    expect(within(table).getByText('DN')).toHaveAttribute('data-label', '단위');
    unmount();
    adapter.getProjects.mockResolvedValue([{ id: '4', name: '대청호 점검', accessRole: 'OWNER' }]);
    backoffice.getProject.mockResolvedValue({ id: '4', name: '대청호 점검', accessRole: 'OWNER' });
    backoffice.getProjectDatasets.mockResolvedValue([original]);
    backoffice.getProjectMembers.mockResolvedValue([{ userId: '1', role: 'OWNER' }, { userId: '22', role: 'VIEWER', username: 'kim', createdAt: '2026-10-01T00:00:00Z' }]);
    renderAt('/app/projects/4');
    await screen.findByRole('link', { name: '대청호 S2' });
    const data = screen.getByRole('table');
    expect(data).toHaveClass('xc-table--cards');
    expect(within(data).getByRole('columnheader', { name: '상태' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '멤버' }));
    expect(screen.getByTestId('search')).toHaveTextContent('?tab=members');
    await screen.findByRole('combobox', { name: 'kim 권한' });
    const members = screen.getByRole('table');
    expect(members).toHaveClass('xc-table--cards');
    expect(within(members).getByRole('columnheader', { name: '추가일' })).toBeInTheDocument();
    const kimRow = within(members).getAllByRole('row').find((row) => within(row).queryByRole('combobox'))!;
    expect(within(kimRow).getAllByRole('cell').map((cell) => cell.getAttribute('data-label'))).toEqual([null, '권한', '추가일', null]);
  });

  test('멤버 추가: 아이디 입력은 자동 대문자·맞춤법을 끄고, 없는 아이디는 필드 옆에 알린다', async () => {
    backoffice.getProject.mockResolvedValue({ id: '4', name: '대청호 점검', accessRole: 'OWNER' });
    const { ApiError } = require('../../api/httpClient');
    backoffice.addProjectMember.mockRejectedValue(new ApiError(404, 'USER_NOT_FOUND', 'no'));
    renderAt('/app/projects/4?tab=members');
    const field = await screen.findByLabelText('상대 로그인 아이디');
    expect(field).toHaveAttribute('autocapitalize', 'none');
    expect(field).toHaveAttribute('spellcheck', 'false');
    fireEvent.change(field, { target: { value: 'nobody' } });
    fireEvent.click(screen.getByRole('button', { name: '멤버 추가' }));
    await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'));
    expect(field).toHaveAccessibleDescription(/해당 아이디의 사용자가 없습니다/);
    expect(field).toHaveFocus();
  });

  test('탭·구분 막대는 넘치는 쪽을 data-more로 알린다', async () => {
    const widths = jest.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(600);
    const client = jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300);
    renderAt('/app/jobs');
    const types = await screen.findByRole('group', { name: '작업 종류' });
    expect(types).toHaveAttribute('data-more', 'end');
    types.scrollLeft = 300;
    fireEvent.scroll(types);
    expect(types).toHaveAttribute('data-more', 'start');
    widths.mockRestore();
    client.mockRestore();
  });
});

describe('D. 체감 속도', () => {
  test('skeleton은 180ms가 지나야 막대를 그린다(그 전에는 자리만 차지한다)', () => {
    jest.useFakeTimers();
    render(<Skeleton lines={3} label="불러오는 중" />);
    const box = screen.getByRole('status', { name: '불러오는 중' });
    expect(box).toHaveClass('is-waiting');
    expect(box).toHaveAttribute('aria-busy', 'true');
    act(() => { jest.advanceTimersByTime(150); });
    expect(box).toHaveClass('is-waiting');
    act(() => { jest.advanceTimersByTime(40); });
    expect(box).not.toHaveClass('is-waiting');
    jest.useRealTimers();
  });

  test('작업 필터를 바꾸면 새 결과가 올 때까지 이전 행을 흐리게 두고 aria-busy로 알린다', async () => {
    const shape = { id: 'j1', name: '울산 Shape', type: 'SHAPEFILE', status: 'FAILED', createdAt: '2026-10-02T01:00:00Z', input: {} };
    const gee = { id: 'j3', name: '완료 영상', type: 'GEE_TO_ZARR', status: 'SUCCEEDED', createdAt: '2026-10-01T02:00:00Z', input: {} };
    aiService.listJobs.mockResolvedValue([]);
    generation.listJobs.mockResolvedValue([shape, gee]);
    renderAt('/app/jobs');
    expect(await screen.findByText('완료 영상')).toBeInTheDocument();
    const list = screen.getByTestId('jobs-list');
    expect(list).toHaveAttribute('aria-busy', 'false');
    const pending = deferred<unknown[]>();
    generation.listJobs.mockReturnValueOnce(pending.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Shapefile' }));
    // The old rows are still there, marked busy (dimmed by .xc-stale[aria-busy]).
    expect(screen.getByTestId('jobs-list')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('완료 영상')).toBeInTheDocument();
    await act(async () => { pending.resolve([shape]); });
    await waitFor(() => expect(screen.getByTestId('jobs-list')).toHaveAttribute('aria-busy', 'false'));
    expect(screen.queryByText('완료 영상')).not.toBeInTheDocument();
    expect(screen.getByText('울산 Shape')).toBeInTheDocument();
  });

  test('상단 바 배지와 작업 화면은 poller 하나를 같이 쓴다: 10초에 요청 한 번', async () => {
    jest.useFakeTimers();
    const running = { id: 'j2', name: '제주 GeoTIFF', type: 'GEOTIFF_BANDS', status: 'RUNNING', progress: 0.5, createdAt: '2026-10-02T02:00:00Z', input: {} };
    generation.listJobs.mockResolvedValue([running]);
    aiService.listJobs.mockResolvedValue([]);
    const flush = async (ms: number) => {
      await act(async () => {
        jest.advanceTimersByTime(ms);
        for (let index = 0; index < 10; index += 1) await Promise.resolve();
      });
    };
    render(
      <MemoryRouter initialEntries={['/app/jobs']}>
        <Routes>
          <Route path="/app" element={<AppShell />}>
            <Route path="jobs" element={<JobsPage />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    await flush(0);
    await flush(0);
    expect(screen.getByRole('link', { name: '처리 중인 작업 1개' })).toBeInTheDocument();
    expect(screen.getByText('제주 GeoTIFF')).toBeInTheDocument();
    // One request (the full list) serves both the badge and the page.
    expect(generation.listJobs).toHaveBeenCalledTimes(1);
    expect(generation.listJobs).toHaveBeenLastCalledWith({ type: '' });
    await flush(10000);
    await flush(0);
    expect(generation.listJobs).toHaveBeenCalledTimes(2);
    expect(aiService.listJobs).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/^\d\d:\d\d:\d\d 갱신 · 10초마다$/)).toBeInTheDocument();
    jest.useRealTimers();
  });

  test('toast의 live region은 메시지 전에 이미 있다', async () => {
    renderAt('/app/data');
    await screen.findByText('3개');
    const region = screen.getAllByRole('status').find((node) => node.getAttribute('aria-live') === 'polite')!;
    expect(region).toHaveClass('xc-toast-region');
    expect(region).toBeEmptyDOMElement();
  });
});

describe('E·G. 융합 머리와 정리', () => {
  test('수식 융합: 뒤로 링크와 “1 / 4”가 없고, 단계는 눈금으로 현재 단계를 표시한다', async () => {
    adapter.getDatasets.mockResolvedValue([original]);
    renderAt('/app/analysis/fusion');
    expect(await screen.findByRole('heading', { level: 1, name: '수식 융합' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /데이터/ })).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/\d\s*\/\s*4/);
    const steps = screen.getByRole('list', { name: '진행 단계' });
    expect(steps).toHaveClass('step-scale');
    const items = within(steps).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual(['1데이터', '2수식', '3규칙', '4미리보기·실행']);
    expect(items[0]).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText(/여러 데이터의 값을 수식 하나로/)).toBeInTheDocument();
  });

  test('페이지 머리에 “데이터 추가”를 다시 두지 않는다(상단 바에만, 결정 2)', async () => {
    const { unmount } = renderAt('/app/data');
    await screen.findByText('3개');
    expect(within(screen.getByRole('banner')).queryByRole('link', { name: /데이터 추가/ })).not.toBeInTheDocument();
    unmount();
    renderAt('/app/jobs');
    await screen.findByTestId('jobs-list');
    const head = screen.getByRole('banner');
    expect(within(head).queryByRole('link', { name: /데이터 추가/ })).not.toBeInTheDocument();
    expect(within(head).getByRole('link', { name: '수식 융합' })).toBeInTheDocument();
  });

  test('관리 화면의 페이지 코드에는 inline style이 없다', () => {
    const fs = require('fs');
    const path = require('path');
    const files = ['DataLibraryPage.tsx', 'DatasetDetailPage.tsx', 'ProjectsPage.tsx', 'JobsPage.tsx', 'FusionPage.tsx', 'DashboardPage.tsx'].map((name) => path.join(__dirname, name));
    files.push(path.join(__dirname, '..', 'jobs.tsx'), path.join(__dirname, '..', '..', 'components', 'ui', 'kit.tsx'));
    for (const file of files) expect([file, fs.readFileSync(file, 'utf8').includes('style={{')]).toEqual([file, false]);
  });
});

describe('English', () => {
  test('new list, detail and dialog words in English', async () => {
    adapter.getProjects.mockResolvedValue([]);
    renderAt('/app/data', 'en');
    expect(await screen.findByRole('link', { name: 'NDWI 융합' })).toBeInTheDocument();
    const kinds = screen.getByRole('group', { name: 'Data kind' });
    expect(within(kinds).getAllByRole('button').map((button) => button.textContent)).toEqual(['All', 'Original', 'Band math result', 'AI result']);
    expect(screen.getByRole('columnheader', { name: 'Updated' })).toBeInTheDocument();
    expect(screen.getByText('3 items')).toBeInTheDocument();
    expect(await within(rowOf('대청호_수체')).findByText(/U-Net \(S1\+S2, 10 channels\) · Threshold 0\.50/)).toBeInTheDocument();
    fireEvent.click(within(kinds).getByRole('button', { name: 'Original' }));
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Link 대청호 S2 to a project' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('You don’t have a project you can edit yet. Create one and it’s linked right away.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('New project name')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Create and link' })).toBeInTheDocument();
    // Dataset names are the user's own; every other word is English.
    expect(document.body.textContent?.replace(/대청호[_ ]?(S2|수체)?|NDWI 융합/g, '')).not.toMatch(/[가-힣]/);
  });

  test('detail AI and project tabs, the projects ledger and band math in English', async () => {
    backoffice.getDatasetDetail.mockResolvedValue(original);
    const { unmount } = renderAt('/app/data/77?tab=ai', 'en');
    expect(await screen.findByRole('link', { name: '대청호_수체' })).toBeInTheDocument();
    for (const name of ['Result', 'Model', 'Period', 'Threshold', 'Made', 'Status']) expect(screen.getByRole('columnheader', { name })).toBeInTheDocument();
    expect(screen.getByText('Aug 1, 2024 – Aug 31, 2024')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Projects & sharing' }));
    expect(await screen.findByText('Not linked to any project yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }));
    expect(await screen.findByText('Registered from a path')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
    unmount();

    adapter.getProjects.mockResolvedValue([{ id: '6', name: 'Jeju', accessRole: 'VIEWER', ownerUsername: 'kim', updatedAt: '2026-10-08T01:00:00Z' }]);
    const { unmount: unmountProjects } = renderAt('/app/projects', 'en');
    expect(await screen.findByRole('link', { name: 'Jeju' })).toBeInTheDocument();
    for (const name of ['Name', 'Your role', 'Owner', 'Updated']) expect(screen.getByRole('columnheader', { name })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search projects' })).toHaveAttribute('placeholder', 'Search name or description…');
    expect(document.body).not.toHaveTextContent(/[가-힣]/);
    unmountProjects();

    adapter.getDatasets.mockResolvedValue([]);
    renderAt('/app/analysis/fusion', 'en');
    expect(await screen.findByRole('heading', { level: 2, name: 'Pick the data and variables to calculate with' })).toBeInTheDocument();
    expect(screen.getByText(/Calculate new data from the values of several datasets/)).toBeInTheDocument();
  });
});
