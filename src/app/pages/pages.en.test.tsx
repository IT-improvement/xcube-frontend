/* UR-53 stage 2: the management screens in English (real mode, mocked services). Korean stays in pages.test. */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LanguageProvider } from '../../i18n';

jest.mock('../../api', () => ({ activeViewerAdapter: { getProjects: jest.fn(), getDatasets: jest.fn(), getProjectDatasets: jest.fn(), getJobs: jest.fn(), runWaterExtraction: jest.fn() }, useMockApi: false }));
jest.mock('../../api/backofficeApi', () => ({ backofficeAdapter: { getProject: jest.fn(), createProject: jest.fn(), updateProject: jest.fn(), deleteProject: jest.fn(), getProjectMembers: jest.fn(), addProjectMember: jest.fn(), updateProjectMember: jest.fn(), removeProjectMember: jest.fn(), getProjectDatasets: jest.fn(), getLinkableDatacubes: jest.fn(), linkProjectDataset: jest.fn(), unlinkProjectDataset: jest.fn(), getDatasetDetail: jest.fn(), deleteDatacube: jest.fn(), registerDatacube: jest.fn() } }));
jest.mock('../../api/generationApi', () => ({ generationApi: { listJobs: jest.fn(), jobSummary: jest.fn(), retryJob: jest.fn(), cancelJob: jest.fn() } }));
jest.mock('../../api/analysisApi', () => ({ ...jest.requireActual('../../api/analysisApi'), analysisApi: { validate: jest.fn(), dryRun: jest.fn(), createJob: jest.fn(), listJobs: jest.fn(), getJob: jest.fn(), cancelJob: jest.fn(), retryJob: jest.fn() } }));
jest.mock('../../api/aiApi', () => ({ ...jest.requireActual('../../api/aiApi'), aiApi: { listModels: jest.fn(), check: jest.fn(), createJob: jest.fn(), listJobs: jest.fn(), getJob: jest.fn(), cancelJob: jest.fn(), retryJob: jest.fn() } }));
jest.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 1, name: 'Hong' }, signOut: jest.fn() }) }));

const adapter = require('../../api').activeViewerAdapter as Record<string, jest.Mock>;
const backoffice = require('../../api/backofficeApi').backofficeAdapter as Record<string, jest.Mock>;
const generation = require('../../api/generationApi').generationApi as Record<string, jest.Mock>;
const analysis = require('../../api/analysisApi').analysisApi as Record<string, jest.Mock>;
const aiService = require('../../api/aiApi').aiApi as Record<string, jest.Mock>;
const { ApiError, userMessage } = require('../../api/httpClient');
const { formatDate, formatDateTime, memberLabel, periodLabel, roleLabel, unavailableJobsNotice } = require('../api');
const { elapsed, jobTypeLabel } = require('../jobs');
const { blockerText, defaultName, normalizationLabel } = require('../fusion');
const { BBoxMap } = require('./DatasetDetailPage');
const DashboardPage = require('./DashboardPage').default;
const DataLibraryPage = require('./DataLibraryPage').default;
const DatasetDetailPage = require('./DatasetDetailPage').default;
const { ProjectDetailPage } = require('./ProjectsPage');
const JobsPage = require('./JobsPage').default;

// Local-time ISO strings, so the expected calendar dates do not depend on the test machine's zone.
const times = [{ iso: '2024-08-14T12:00:00', label: '2024. 8. 14.' }, { iso: '2024-09-01T12:00:00', label: '2024. 9. 1.' }];
const owned = { id: '77', projectId: '4', name: 'Daecheong S2', subtitle: 'REGISTERED · AVAILABLE', xcubeDatasetId: 'daecheong', defaultVariable: 'B4', variables: ['B4'], times, accessType: 'OWNED' };
const shared = { ...owned, id: '88', name: 'Shared cube', xcubeDatasetId: 'shared', accessType: 'SHARED', subtitle: 'REGISTERED · PENDING' };
const fused = { ...owned, id: '91', name: 'NDWI fused', kind: 'FUSION' };
const water = { ...owned, id: '95', name: 'Water result', kind: 'AI_RESULT', sourceDatacubeId: '77' };

const failed = { id: 'j1', name: 'Ulsan Shape', type: 'SHAPEFILE', status: 'FAILED', progress: 0.4, createdAt: '2026-10-02T01:00:00Z', startedAt: '2026-10-02T01:00:00Z', finishedAt: '2026-10-02T01:02:07Z', errorCode: 'INVALID_INPUT', errorMessage: '', input: { files: ['ulsan.zip'] } };
const running = { id: 'j2', name: 'Jeju GeoTIFF', type: 'GEOTIFF_BANDS', status: 'RUNNING', progress: 0.5, stage: 'convert', createdAt: '2026-10-02T02:00:00Z', startedAt: '2026-10-02T02:00:00Z', input: {} };
const fusionDone = { id: 'f1', name: 'NDWI fused', type: 'FUSION', status: 'SUCCEEDED', progress: 1, createdAt: '2026-10-02T03:00:00Z', registration: { datacubeId: 91 }, input: {} };

function renderAt(path: string) {
  return render(
    <LanguageProvider initial="en">
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/app" element={<DashboardPage />} />
          <Route path="/app/data" element={<DataLibraryPage />} />
          <Route path="/app/data/:datasetId" element={<DatasetDetailPage />} />
          <Route path="/app/projects/:projectId" element={<ProjectDetailPage />} />
          <Route path="/app/jobs" element={<JobsPage />} />
        </Routes>
      </MemoryRouter>
    </LanguageProvider>,
  );
}

beforeEach(() => {
  adapter.getProjects.mockResolvedValue([{ id: '4', name: 'Lakes', accessRole: 'OWNER' }]);
  adapter.getDatasets.mockResolvedValue([owned, shared, fused, water]);
  adapter.getJobs.mockResolvedValue([]);
  backoffice.getProject.mockResolvedValue({ id: '4', name: 'Lakes', accessRole: 'OWNER' });
  backoffice.getProjectMembers.mockResolvedValue([]);
  backoffice.getProjectDatasets.mockResolvedValue([owned]);
  generation.listJobs.mockResolvedValue([]);
  analysis.listJobs.mockResolvedValue([]);
  aiService.listJobs.mockResolvedValue([]);
});

describe('Dashboard in English', () => {
  test('summary, shortcuts, recent data with kind tags and recent jobs with statuses and dates', async () => {
    generation.listJobs.mockResolvedValue([running, failed]);
    analysis.listJobs.mockResolvedValue([fusionDone]);
    renderAt('/app');
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Daecheong S2' })).toBeInTheDocument();
    const summary = screen.getByLabelText('Summary');
    expect(within(summary).getByRole('link', { name: 'My data 3' })).toHaveAttribute('href', '/app/data?scope=owned');
    expect(within(summary).getByRole('link', { name: 'Shared with you 1' })).toBeInTheDocument();
    await waitFor(() => expect(within(summary).getByRole('link', { name: 'Running 1' })).toBeInTheDocument());
    const shortcuts = screen.getByRole('navigation', { name: 'Shortcuts' });
    expect(within(shortcuts).getByRole('link', { name: /Add data/ })).toHaveAttribute('href', '/app/data/new');
    expect(within(shortcuts).getByRole('link', { name: /Band math/ })).toHaveAttribute('href', '/app/analysis/fusion');
    expect(within(shortcuts).getByRole('link', { name: /Open Viewer.*“Daecheong S2”/ })).toBeInTheDocument();

    const recent = screen.getByRole('region', { name: 'Recent data' });
    expect(within(recent).getByText('Band math result')).toBeInTheDocument();
    expect(within(recent).getByText('AI result')).toBeInTheDocument();
    expect(within(recent).getAllByText('Original')).toHaveLength(2);
    expect(within(recent).getAllByText('Aug 14, 2024 – Sep 1, 2024').length).toBeGreaterThan(0);
    expect(within(recent).getByRole('link', { name: 'Open Daecheong S2 in Viewer (new tab)' })).toBeInTheDocument();

    const jobs = screen.getByRole('region', { name: 'Recent jobs' });
    expect(await within(jobs).findByText('Running')).toBeInTheDocument();
    expect(within(jobs).getByText('Failed')).toBeInTheDocument();
    expect(within(jobs).getByText('Done')).toBeInTheDocument();
    expect(within(jobs).getByText('Band math')).toBeInTheDocument();
    expect(within(jobs).getByText(formatDateTime(running.createdAt, 'en'))).toHaveTextContent(/^[A-Z][a-z]{2} \d{1,2}, \d\d:\d\d$/);
    expect(document.body).not.toHaveTextContent(/[가-힣]/);
  });

  test('empty dashboard and the unavailable-service notice', async () => {
    adapter.getDatasets.mockResolvedValue([]);
    analysis.listJobs.mockRejectedValue(new Error('down'));
    renderAt('/app');
    expect(await screen.findByText('No data yet. Add your first datacube.')).toBeInTheDocument();
    expect(await screen.findByText('Couldn’t load Band math jobs. Showing the other jobs only.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('Data list in English', () => {
  test('tabs, kind labels, availability, dates and actions', async () => {
    renderAt('/app/data');
    expect((await screen.findAllByRole('link', { name: 'Daecheong S2' }))[0]).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Data' })).toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: 'Data filter' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^All/ })).toHaveTextContent('All4');
    expect(screen.getByRole('tab', { name: /^My data/ })).toHaveTextContent('3');
    expect(screen.getByRole('tab', { name: /^Shared with you/ })).toHaveTextContent('1');
    expect(screen.getByRole('searchbox', { name: 'Search data' })).toHaveAttribute('placeholder', 'Search name, dataset ID or project');
    expect(screen.getByRole('combobox', { name: 'Sort' })).toHaveTextContent('Recently added');
    for (const name of ['Name', 'Period', 'Times', 'Variables', 'Project', 'Status']) expect(screen.getByRole('columnheader', { name })).toBeInTheDocument();

    // The first link of a row is its dataset (an AI result also links its source).
    const rowOf = (name: string) => screen.getAllByRole('row').find((row) => within(row).queryAllByRole('link')[0]?.textContent === name)!;
    expect(within(rowOf('Daecheong S2')).getByText('Aug 14, 2024 – Sep 1, 2024')).toBeInTheDocument();
    expect(within(rowOf('NDWI fused')).getByText('Band math result')).toBeInTheDocument();
    expect(within(rowOf('Water result')).getByText('AI result')).toBeInTheDocument();
    expect(within(rowOf('Water result')).getByText(/Source/)).toBeInTheDocument();
    expect(within(rowOf('Shared cube')).getByText('Shared with you')).toBeInTheDocument();
    expect(within(rowOf('Shared cube')).getByText('Syncing')).toBeInTheDocument();
    expect(within(rowOf('Shared cube')).getByRole('button', { name: 'Delete Shared cube' })).toHaveAttribute('title', 'Data shared with you can’t be deleted');
    expect(within(rowOf('Daecheong S2')).getByRole('button', { name: 'Link Daecheong S2 to a project' })).toBeInTheDocument();

    fireEvent.click(within(rowOf('Daecheong S2')).getByRole('button', { name: 'Delete Daecheong S2' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete this data?' });
    expect(dialog).toHaveTextContent('“Daecheong S2” will be deleted and removed from every project and share. This can’t be undone.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search data' }), { target: { value: 'zzz' } });
    expect(screen.getByText('No matches')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/[가-힣]/);
  });

  test('empty state and a load error', async () => {
    adapter.getDatasets.mockResolvedValue([]);
    const { unmount } = renderAt('/app/data');
    expect(await screen.findByText('No data yet')).toBeInTheDocument();
    expect(screen.getByText(/Build a datacube from satellite imagery/)).toBeInTheDocument();
    unmount();
    adapter.getDatasets.mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', '서버에 연결할 수 없습니다.'));
    renderAt('/app/data');
    expect(await screen.findByText('Couldn’t load your data. Can’t reach the server. Check that it’s running.')).toBeInTheDocument();
  });

  test('dataset detail: tabs, overview and the extent sketch', async () => {
    backoffice.getDatasetDetail.mockResolvedValue({ ...owned, bbox: [127.4, 36.3, 127.6, 36.5], rgbAvailable: true });
    renderAt('/app/data/77');
    expect(await screen.findByRole('tab', { name: 'Overview' })).toBeInTheDocument();
    for (const name of [/^Variables & bands/, 'History', 'AI results', 'Projects & sharing']) expect(screen.getByRole('tab', { name })).toBeInTheDocument();
    expect(screen.getByText('Original')).toBeInTheDocument();
    expect(screen.getByText('Lon 127.4000 – 127.6000, lat 36.3000 – 36.5000')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Data extent: lon 127.4000 to 127.6000, lat 36.3000 to 36.5000' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open in Viewer/ })).toHaveAttribute('href', '/app/viewer?dataset=77');
  });
});

describe('Jobs in English', () => {
  test('filters, statuses, steps, retry and the cancel dialog', async () => {
    generation.listJobs.mockResolvedValue([running, failed]);
    renderAt('/app/jobs');
    expect(await screen.findByText('Ulsan Shape')).toBeInTheDocument();
    const types = screen.getByRole('group', { name: 'Job type' });
    expect(within(types).getAllByRole('button').map((button) => button.textContent)).toEqual(['All', 'GEE', 'GeoTIFF·CAS500', 'Shapefile', 'Band math', 'AI water extraction']);
    const status = screen.getByRole('combobox', { name: 'Status' });
    expect(within(status).getAllByRole('option').map((option) => option.textContent)).toEqual(['All statuses', 'In progress', 'Done', 'Failed or cancelled']);
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('2m 7s')).toBeInTheDocument();
    expect(await screen.findByText(/^Updated \d\d:\d\d$/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Jeju GeoTIFF progress' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show details for Ulsan Shape' }));
    expect(screen.getByText('Why it failed: INVALID_INPUT')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Processing steps' })).toHaveTextContent('Convert failed');
    expect(screen.getByText('Files')).toBeInTheDocument();

    generation.retryJob.mockResolvedValue({ ...failed, id: 'j4', status: 'QUEUED' });
    fireEvent.click(screen.getByRole('button', { name: 'Retry Ulsan Shape' }));
    expect(await screen.findByText('Started again with the same settings.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel Jeju GeoTIFF' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Cancel this job?' });
    expect(within(dialog).getByRole('button', { name: 'Keep running' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel job' })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/[가-힣]/);
  });

  // UR-53 stage 5: failure reasons come from errorCode/errorParams (and registration.errorCode), not the Korean errorMessage.
  test('failure reasons and a registration failure from their codes', async () => {
    const geeFailed = { ...failed, id: 'g1', name: 'Lake S2', type: 'GEE_TO_ZARR', errorCode: 'PARTIAL_COVER_DATES_DROPPED', errorParams: { dates: ['2024-08-01', '2024-08-06'] }, errorMessage: '영역을 다 덮지 못해 제외한 날짜: 2024-08-01, 2024-08-06' };
    const oldFailed = { ...failed, id: 'g2', name: 'Old job', errorCode: null, errorMessage: '알 수 없는 옛 오류' };
    const registerFailed = { ...running, id: 'g3', name: 'Registered late', status: 'SUCCEEDED', progress: 1, finishedAt: '2026-10-02T02:05:00Z', registration: { error: 'HttpServerErrorException: 500 등록 실패', errorCode: 'REGISTRATION_FAILED', errorParams: {} } };
    const aiFailed = { ...failed, id: 'a1', name: 'Water run', type: 'AI_WATER', errorCode: 'MODEL_CHECKPOINT_UNAVAILABLE', errorParams: null, errorMessage: 'Model checkpoint unavailable', input: {} };
    generation.listJobs.mockResolvedValue([geeFailed, oldFailed, registerFailed]);
    aiService.listJobs.mockResolvedValue([aiFailed]);
    renderAt('/app/jobs');
    expect(await screen.findByText('Lake S2')).toBeInTheDocument();
    // The row's short reason and the detail line both use the code's text with its dates.
    expect(screen.getByText('Left out because they don’t cover the whole area: 2024-08-01, 2024-08-06')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show details for Lake S2' }));
    expect(screen.getByText('Why it failed: Left out because they don’t cover the whole area: 2024-08-01, 2024-08-06')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show details for Old job' }));
    expect(screen.getByText('Why it failed: Something went wrong.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show details for Registered late' }));
    expect(screen.getByText(/The data list service returned an error\.$/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show details for Water run' }));
    expect(screen.getByText('Why it failed: The model file isn’t ready yet, so this model can’t run now.')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/[가-힣]/);
  });

  test('the unavailable notice names the missing services and offers a retry', async () => {
    generation.listJobs.mockResolvedValue([running]);
    analysis.listJobs.mockRejectedValue(new Error('down'));
    aiService.listJobs.mockRejectedValue(new Error('down'));
    renderAt('/app/jobs');
    expect(await screen.findByText('Couldn’t load Band math and AI jobs. Showing the other jobs only.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  test('empty states depend on the filters', async () => {
    const { unmount } = renderAt('/app/jobs');
    expect(await screen.findByText('No jobs yet')).toBeInTheDocument();
    unmount();
    renderAt('/app/jobs?status=SUCCEEDED');
    expect(await screen.findByText('No jobs match these filters')).toBeInTheDocument();
  });
});

describe('Project members in English', () => {
  test('role labels in the badge, the add form and each row; fallbacks for unknown names', async () => {
    backoffice.getProjectMembers.mockResolvedValue([{ userId: '1', role: 'OWNER' }, { userId: '22', role: 'EDITOR', username: 'kim', name: 'Kim' }, { userId: '30', role: 'VIEWER' }]);
    renderAt('/app/projects/4');
    expect(await screen.findByText('Owner')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Data' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Members' }));
    expect(await screen.findByText('Kim (kim)')).toBeInTheDocument();
    expect(screen.getByText('Hong (you)')).toBeInTheDocument();
    expect(screen.getByText('User 30')).toBeInTheDocument();
    const roleField = screen.getByRole('combobox', { name: 'Role' });
    expect(within(roleField).getAllByRole('option').map((option) => option.textContent)).toEqual(['Viewer', 'Editor']);
    expect(screen.getByRole('combobox', { name: 'Role for Kim (kim)' })).toHaveDisplayValue('Editor');
    expect(screen.getByRole('combobox', { name: 'Role for User 30' })).toHaveDisplayValue('Viewer');
    expect(screen.getAllByText('Owner').length).toBeGreaterThan(1);
    for (const name of ['User', 'Role', 'Added']) expect(screen.getByRole('columnheader', { name })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add member' }));
    expect(screen.getByText('Enter the username of the person to share with.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove User 30' }));
    expect(await screen.findByRole('alertdialog', { name: 'Remove this member?' })).toHaveTextContent('User 30 will no longer see this project.');
    expect(document.body).not.toHaveTextContent(/[가-힣]/);
  });
});

describe('Shared helpers follow the language they are given', () => {
  test('English wording and formats', () => {
    expect(formatDate('2024-08-14T12:00:00', 'en')).toBe('Aug 14, 2024');
    expect(formatDateTime('2024-08-14T14:05:00', 'en')).toBe('Aug 14, 14:05');
    expect(periodLabel({ times } as never, 'en')).toBe('Aug 14, 2024 – Sep 1, 2024');
    expect(roleLabel('OWNER', 'en')).toBe('Owner');
    expect(roleLabel('EDITOR', 'en')).toBe('Editor');
    expect(roleLabel('VIEWER', 'en')).toBe('Viewer');
    expect(memberLabel({ userId: '22' }, 'en')).toBe('User 22');
    expect(unavailableJobsNotice(['AI_WATER'], 'en')).toBe('Couldn’t load AI jobs. Showing the other jobs only.');
    expect(jobTypeLabel('AI_WATER', 'en')).toBe('AI water extraction');
    expect(jobTypeLabel('CAS500', 'en')).toBe('CAS500');
    expect(elapsed({ startedAt: '2026-01-01T00:00:00Z', finishedAt: '2026-01-01T01:05:00Z' }, 0, 'en')).toBe('1h 5m');
    expect(userMessage(new ApiError(503, 'XCUBE_UNAVAILABLE', 'down'), 'en')).toBe('XCube Server is unavailable.');
    expect(normalizationLabel({ scale: 0.0001, offset: 0 }, 'en')).toBe('Custom (×0.0001 + 0)');
    expect(defaultName('Daecheong', new Date(2026, 9, 10), 'en')).toBe('Daecheong_bandmath_20261010');
    // English prefers the code's own text; Korean keeps the server sentence first, as before.
    expect(blockerText({ code: 'NO_TIMES', message: '서버 문장' }, 'en')).toMatch(/^No times match/);
    expect(blockerText({ code: 'NO_TIMES', message: '서버 문장' }, 'ko')).toBe('서버 문장');
    expect(blockerText('SOMETHING_NEW', 'en')).toBe('Can’t run. (SOMETHING_NEW)');
  });

  test('Korean output is unchanged', () => {
    expect(formatDate('2024-08-14T12:00:00', 'ko')).toBe('2024. 8. 14.');
    expect(formatDateTime('2024-08-14T14:05:00', 'ko')).toBe('8. 14. 14:05');
    expect(periodLabel({ times } as never, 'ko')).toBe('2024. 8. 14. ~ 2024. 9. 1.');
    expect(roleLabel(undefined, 'ko')).toBe('보기');
    expect(memberLabel({ userId: '22' }, 'ko')).toBe('사용자 22');
    expect(unavailableJobsNotice(['FUSION', 'AI_WATER'], 'ko')).toBe('수식 융합·AI 작업 목록을 불러오지 못했습니다. 나머지 작업만 표시합니다.');
    expect(elapsed({ startedAt: '2026-01-01T00:00:00Z', finishedAt: '2026-01-01T00:03:20Z' }, 0, 'ko')).toBe('3분 20초');
    expect(defaultName('대청호', new Date(2026, 9, 10), 'ko')).toBe('대청호_융합_20261010');
  });

  test('request error text follows the screen language (stage 4: no Korean-only screen is left)', () => {
    // An English screen is open (the provider made English current): userMessage without a language follows it …
    render(<LanguageProvider initial="en"><span>en</span></LanguageProvider>);
    expect(userMessage(new ApiError(0, 'NETWORK_ERROR', 'x'))).toBe('Can’t reach the server. Check that it’s running.');
    // … a language given wins …
    expect(userMessage(new ApiError(0, 'NETWORK_ERROR', 'x'), 'ko')).toBe('서버에 연결할 수 없습니다. 실행 상태를 확인해 주세요.');
    // … and a component outside any provider (isolated tests) still draws Korean.
    render(<BBoxMap bbox={[127, 36, 128, 37]} />);
    expect(screen.getByRole('img')).toHaveAccessibleName('데이터 범위: 경도 127.0000~128.0000, 위도 36.0000~37.0000');
  });
});
