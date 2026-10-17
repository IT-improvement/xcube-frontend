/* UR-63 (FX-F) in the app shell and lists: the notification bell (F4), the getting-started checklist and example data
   (UX1), and export downloads in the job center (F2). Server calls are mocked at the API clients. */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

jest.mock('../api', () => ({ activeViewerAdapter: { getProjects: jest.fn(), getDatasets: jest.fn(), getProjectDatasets: jest.fn(), getJobs: jest.fn(), runWaterExtraction: jest.fn() }, useMockApi: false }));
jest.mock('../api/generationApi', () => ({ generationApi: { listJobs: jest.fn(), jobSummary: jest.fn(), retryJob: jest.fn(), cancelJob: jest.fn() } }));
jest.mock('../api/analysisApi', () => ({ ...jest.requireActual('../api/analysisApi'), analysisApi: { listJobs: jest.fn() } }));
jest.mock('../api/aiApi', () => ({ ...jest.requireActual('../api/aiApi'), aiApi: { listJobs: jest.fn() } }));
jest.mock('../api/thumbnails', () => ({ cachedThumbnail: () => undefined, loadThumbnail: () => Promise.resolve({ state: 'failed' }), PENDING_RETRY_MS: 15000 }));
jest.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 8, name: '디자인점검', email: 'designqa', role: 'PROJECT_MANAGER' }, signOut: jest.fn() }) }));
jest.mock('../api/notificationsApi', () => ({ ...jest.requireActual('../api/notificationsApi'), notificationsApi: { list: jest.fn(), unreadCount: jest.fn(), markRead: jest.fn(), markAllRead: jest.fn(), prefs: jest.fn(), updatePrefs: jest.fn() } }));
jest.mock('../api/compare', () => ({ ...jest.requireActual('../api/compare'), compareApi: { ...jest.requireActual('../api/compare').compareApi, listJobs: () => Promise.resolve([]) } }));
jest.mock('../api/exports', () => ({ ...jest.requireActual('../api/exports'), exportsApi: { file: jest.fn() }, saveBlob: jest.fn() }));

const adapter = require('../api').activeViewerAdapter as Record<string, jest.Mock>;
const generation = require('../api/generationApi').generationApi as Record<string, jest.Mock>;
const analysis = require('../api/analysisApi').analysisApi as Record<string, jest.Mock>;
const aiService = require('../api/aiApi').aiApi as Record<string, jest.Mock>;
const notes = require('../api/notificationsApi').notificationsApi as Record<string, jest.Mock>;
const exportsMock = require('../api/exports') as { exportsApi: { file: jest.Mock }; saveBlob: jest.Mock };
const AppShell = require('./AppShell').default;
const DashboardPage = require('./pages/DashboardPage').default;
const DataLibraryPage = require('./pages/DataLibraryPage').default;
const JobsPage = require('./pages/JobsPage').default;

function Where() { const location = useLocation(); return <output data-testid="where">{location.pathname}{location.search}</output>; }
const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Where />
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/app" element={<DashboardPage />} />
        <Route path="/app/data" element={<DataLibraryPage />} />
        <Route path="/app/jobs" element={<JobsPage />} />
        <Route path="/app/settings" element={<h1>설정</h1>} />
      </Route>
    </Routes>
  </MemoryRouter>,
);

const base = { projectId: '', subtitle: 'REGISTERED · AVAILABLE', defaultVariable: 'blue', variables: ['blue'], times: [{ iso: '2026-04-26T02:27:27Z', label: '' }, { iso: '2026-05-31T02:27:23Z', label: '' }], updatedAt: '2026-10-10T00:00:00Z' };
const mine = { ...base, id: '70', name: '제주 CAS500', xcubeDatasetId: 'u8-d70', accessType: 'OWNED' };
const exampleSource = { ...base, id: '86', name: 'test_GEE', xcubeDatasetId: 'u4-d86', accessType: 'SHARED', isExample: true };
const exampleAi = { ...base, id: '87', name: 'test_GEE_수체', xcubeDatasetId: 'u4-d87', accessType: 'SHARED', isExample: true, kind: 'AI_RESULT', sourceDatacubeId: '86' };
const item = (id: number, extra: Record<string, unknown> = {}) => ({ id, type: 'EXPORT_READY', title: `내보내기 완료 ${id}`, body: 'GeoTIFF', link: '/app/jobs', createdAt: '2026-10-17T08:00:00Z', readAt: null, ...extra });

beforeEach(() => {
  try { localStorage.clear(); } catch { /* storage unavailable */ }
  adapter.getDatasets.mockResolvedValue([mine, exampleSource, exampleAi]);
  adapter.getProjects.mockResolvedValue([]);
  generation.listJobs.mockResolvedValue([]);
  analysis.listJobs.mockResolvedValue([]);
  aiService.listJobs.mockResolvedValue([]);
  notes.prefs.mockResolvedValue({ emailOnDone: false, browser: true, mailEnabled: false });
  notes.unreadCount.mockResolvedValue(2);
  notes.list.mockResolvedValue({ items: [item(2), item(1, { type: 'COMPARE_DONE', title: '비교 분석 완료', link: '/app/viewer?dataset=96' })], total: 2, page: 0, size: 20, unreadCount: 2 });
  notes.markRead.mockResolvedValue(undefined);
  notes.markAllRead.mockResolvedValue(2);
});

describe('F4 알림 종', () => {
  test('안 읽은 수를 이름과 숫자로 보이고, 펼치면 최근 알림·모두 읽음·알림 설정이 있다', async () => {
    renderAt('/app/data');
    const bell = await screen.findByRole('button', { name: '알림, 안 읽은 알림 2개' });
    expect(bell).toHaveTextContent('2');
    fireEvent.click(bell);
    const panel = await screen.findByRole('region', { name: '알림' });
    expect(await within(panel).findByText('내보내기 완료 2')).toBeInTheDocument();
    expect(within(panel).getAllByText('새 알림')).toHaveLength(2);
    expect(within(panel).getByRole('link', { name: '알림 설정' })).toHaveAttribute('href', '/app/settings#settings-notify');
    expect(notes.list).toHaveBeenCalledWith({ size: 20 });

    fireEvent.click(within(panel).getByRole('button', { name: '모두 읽음' }));
    await waitFor(() => expect(notes.markAllRead).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: '알림' })).toBeInTheDocument();
  });

  test('알림을 누르면 읽음 처리하고 그 화면으로 간다(Viewer 링크는 새 탭)', async () => {
    const open = jest.spyOn(window, 'open').mockImplementation(() => null);
    renderAt('/app/data');
    fireEvent.click(await screen.findByRole('button', { name: /알림, 안 읽은/ }));
    fireEvent.click(await screen.findByRole('button', { name: /내보내기 완료 2/ }));
    expect(notes.markRead).toHaveBeenCalledWith(2);
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/app/jobs'));
    fireEvent.click(await screen.findByRole('button', { name: /알림/ }));
    fireEvent.click(await screen.findByRole('button', { name: /비교 분석 완료/ }));
    expect(open).toHaveBeenCalledWith('/app/viewer?dataset=96', '_blank', 'noopener');
    open.mockRestore();
  });

  test('새 알림이 오면(안 읽은 수 증가) 허락된 브라우저 알림을 띄운다', async () => {
    const shown: Array<{ title: string; body?: string }> = [];
    class FakeNotification { static permission = 'granted'; static requestPermission = jest.fn(); onclick: (() => void) | null = null; constructor(title: string, options?: { body?: string }) { shown.push({ title, body: options?.body }); } close() {} }
    (window as any).Notification = FakeNotification;
    notes.unreadCount.mockResolvedValueOnce(2).mockResolvedValue(3);
    notes.list.mockImplementation(({ unread, size }: { unread?: boolean; size: number }) => Promise.resolve(
      size === 1 ? { items: [item(2)], total: 2, page: 0, size: 1, unreadCount: 2 }
        : { items: unread ? [item(3, { title: '데이터 만들기 완료', type: 'JOB_SUCCEEDED' }), item(2)] : [item(2)], total: 3, page: 0, size, unreadCount: 3 },
    ));
    jest.useFakeTimers();
    try {
      renderAt('/app/data');
      // The bell checks on every tick of the shell's jobs poller (60 s while nothing runs).
      await act(async () => { jest.advanceTimersByTime(10); });
      await act(async () => { await Promise.resolve(); });
      await act(async () => { jest.advanceTimersByTime(60000); });
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    } finally {
      jest.useRealTimers();
    }
    await waitFor(() => expect(shown).toEqual([{ title: '데이터 만들기 완료', body: 'GeoTIFF' }]));
    delete (window as any).Notification;
  });
});

describe('UX1 시작하기·예시 데이터', () => {
  test('대시보드: 예시 원본·AI 결과로 가는 4단계, 내 데이터가 있으면 3번은 완료, 안내 닫기·다시 보기', async () => {
    renderAt('/app');
    const guide = await screen.findByRole('region', { name: '시작하기' });
    expect(within(guide).getByText('4개 중 1개 완료')).toBeInTheDocument();
    expect(within(guide).getByRole('link', { name: /Viewer 열기/ })).toHaveAttribute('href', '/app/viewer?dataset=86');
    expect(within(guide).getByRole('link', { name: /비교 화면 열기/ })).toHaveAttribute('href', '/app/viewer?dataset=86&ai=87');
    fireEvent.click(within(guide).getByRole('link', { name: /Viewer 열기/ }));
    expect(within(guide).getByText('4개 중 2개 완료')).toBeInTheDocument();
    // The summary line has its own example group; examples are not "shared with me".
    expect(screen.getByRole('link', { name: '예시 2' })).toHaveAttribute('href', '/app/data?scope=example');
    expect(screen.getByRole('link', { name: '공유받음 0' })).toBeInTheDocument();

    fireEvent.click(within(guide).getByRole('button', { name: '안내 닫기' }));
    expect(screen.queryByRole('region', { name: '시작하기' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /계정 메뉴/ }));
    fireEvent.click(screen.getByRole('button', { name: '시작 안내 다시 보기' }));
    expect(await screen.findByRole('region', { name: '시작하기' })).toBeInTheDocument();
  });

  test('데이터 목록: 예시 묶음 탭, 예시에는 예시 태그만 있고 연결·삭제 버튼이 없다', async () => {
    renderAt('/app/data?scope=example');
    expect(await screen.findByRole('tab', { name: /예시/ })).toHaveAttribute('aria-selected', 'true');
    const cards = screen.getAllByRole('listitem');
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(within(card).getByText('예시')).toBeInTheDocument();
      expect(within(card).queryByRole('button', { name: /삭제/ })).not.toBeInTheDocument();
      expect(within(card).queryByRole('button', { name: /프로젝트에 연결/ })).not.toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole('tab', { name: /내 데이터/ }));
    expect(await screen.findByRole('button', { name: /제주 CAS500.*삭제|삭제.*제주 CAS500/ })).toBeInTheDocument();
  });
});

describe('F2 작업 센터의 내보내기', () => {
  test('내보내기 종류·크기·보관 기한, 내려받기는 fetch→blob으로 서버 이름 그대로 저장, 기간이 지나면 이유만', async () => {
    generation.listJobs.mockResolvedValue([
      { id: 'e1', name: 'test_GEE GeoTIFF', type: 'EXPORT_GEOTIFF', status: 'SUCCEEDED', progress: 1, createdAt: '2026-10-17T07:00:00Z', input: { datasetName: 'test_GEE', variable: 'red', times: ['a', 'b'] }, export: { fileName: 'test_GEE_red.tif', sizeBytes: 5 * 1024 * 1024, expiresAt: '2026-10-24T07:00:00Z', expired: false } },
      { id: 'e2', name: '옛 보고서', type: 'EXPORT_REPORT', status: 'SUCCEEDED', progress: 1, createdAt: '2026-10-01T07:00:00Z', input: {}, export: { fileName: 'r.pdf', expired: true } },
    ]);
    exportsMock.exportsApi.file.mockResolvedValue({ blob: new Blob(['x']), fileName: '테스트_red.tif' });
    renderAt('/app/jobs?type=EXPORT_GEOTIFF,EXPORT_ANIMATION,EXPORT_REPORT');
    const row = (await screen.findByText('test_GEE GeoTIFF')).closest('tr')!;
    expect(within(row).getByText('GeoTIFF 내보내기')).toBeInTheDocument();
    expect(within(row).getByText(/5\.0 MB · .*까지/)).toBeInTheDocument();
    fireEvent.click(within(row).getByRole('button', { name: 'test_GEE GeoTIFF 파일 내려받기' }));
    await waitFor(() => expect(exportsMock.saveBlob).toHaveBeenCalledWith(expect.any(Blob), '테스트_red.tif'));
    expect(exportsMock.exportsApi.file).toHaveBeenCalledWith('e1', 'test_GEE_red.tif');
    const old = screen.getByText('옛 보고서').closest('tr')!;
    expect(within(old).queryByRole('button', { name: /내려받기/ })).not.toBeInTheDocument();
    expect(within(old).getAllByText('보관 기간 지남').length).toBeGreaterThan(0);
    expect(generation.listJobs).toHaveBeenCalledWith(expect.objectContaining({ type: 'EXPORT_GEOTIFF,EXPORT_ANIMATION,EXPORT_REPORT' }));
  });
});
