/* RD1 on the management screens: the data list as picture cards (default) or the table, remembered; bigger pictures. */
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

jest.mock('../../api', () => ({ activeViewerAdapter: { getProjects: jest.fn(), getDatasets: jest.fn(), getProjectDatasets: jest.fn(), getJobs: jest.fn(), runWaterExtraction: jest.fn() }, useMockApi: false }));
jest.mock('../../api/generationApi', () => ({ generationApi: { listJobs: jest.fn(), jobSummary: jest.fn() } }));
jest.mock('../../api/analysisApi', () => ({ ...jest.requireActual('../../api/analysisApi'), analysisApi: { listJobs: jest.fn() } }));
jest.mock('../../api/aiApi', () => ({ ...jest.requireActual('../../api/aiApi'), aiApi: { listJobs: jest.fn() } }));
jest.mock('../../api/thumbnails', () => ({ cachedThumbnail: () => undefined, loadThumbnail: () => Promise.resolve({ state: 'failed' }), PENDING_RETRY_MS: 15000 }));
jest.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 1, name: '홍길동', role: 'PROJECT_MANAGER' }, signOut: jest.fn() }) }));

const adapter = require('../../api').activeViewerAdapter as Record<string, jest.Mock>;
const generation = require('../../api/generationApi').generationApi as Record<string, jest.Mock>;
const analysis = require('../../api/analysisApi').analysisApi as Record<string, jest.Mock>;
const aiService = require('../../api/aiApi').aiApi as Record<string, jest.Mock>;
const DashboardPage = require('./DashboardPage').default;
const DataLibraryPage = require('./DataLibraryPage').default;

const times = (count: number) => Array.from({ length: count }, (_, index) => ({ iso: `2024-${String(1 + index).padStart(2, '0')}-14T02:00:00Z`, label: '' }));
const series = { id: '70', projectId: '4', projectName: '제주 점검', name: '제주 시계열', subtitle: 'REGISTERED · AVAILABLE', xcubeDatasetId: 'u8-d70', defaultVariable: 'blue', variables: ['blue', 'green', 'red', 'nir'], times: times(12), accessType: 'OWNED', bbox: [126.6, 33.3, 126.9, 33.6], updatedAt: '2026-10-01T00:00:00Z' };
const single = { ...series, id: '71', projectName: '', name: '대청호 한 장면', xcubeDatasetId: 'u8-d71', times: times(1), accessType: 'SHARED' };

const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/app" element={<DashboardPage />} />
      <Route path="/app/data" element={<DataLibraryPage />} />
    </Routes>
  </MemoryRouter>,
);

beforeEach(() => {
  try { localStorage.clear(); } catch { /* storage unavailable */ }
  adapter.getDatasets.mockResolvedValue([series, single]);
  adapter.getProjects.mockResolvedValue([]);
  generation.listJobs.mockResolvedValue([]);
  generation.jobSummary.mockResolvedValue({ queued: 0, running: 0 });
  analysis.listJobs.mockResolvedValue([]);
  aiService.listJobs.mockResolvedValue([]);
});

describe('RD1 데이터 목록(S3)', () => {
  test('기본은 그림 보기: 카드에 큰 그림·종류·이름·한 줄 정보, 동작 버튼은 카드 아래', async () => {
    renderAt('/app/data');
    const grid = await screen.findByRole('list', { name: '데이터' });
    const cards = within(grid).getAllByRole('listitem');
    expect(cards).toHaveLength(2);
    const card = cards[0];
    expect(card.querySelector('.data-card__thumb')).not.toBeNull();
    expect(card.querySelector('.data-card__kind')).toHaveTextContent('원본');
    expect(within(card).getByRole('link', { name: '제주 시계열' })).toBeInTheDocument();
    expect(card).toHaveTextContent('시계열 12시점');
    expect(card).toHaveTextContent('2024.01–2024.12');
    expect(card).toHaveTextContent('band 4개');
    expect(card).toHaveTextContent('제주 점검');
    const foot = card.querySelector('.data-card__foot') as HTMLElement;
    expect(within(foot).getByRole('link', { name: /Viewer에서 열기|제주 시계열/ })).toBeInTheDocument();
    expect(within(foot).getAllByRole('button').length).toBeGreaterThanOrEqual(2);
    expect(within(cards[1]).getByText('공유받음')).toBeInTheDocument();
    expect(cards[1]).toHaveTextContent('단일 시점');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  test('목록 보기로 바꾸면 표(그림 64)가 되고, 다시 열어도 기억한다', async () => {
    const { unmount } = renderAt('/app/data');
    await screen.findByRole('list', { name: '데이터' });
    const viewGroup = screen.getByRole('group', { name: '보기 방식' });
    fireEvent.click(within(viewGroup).getByRole('button', { name: /목록 보기/ }));
    const table = screen.getByRole('table');
    expect(table.querySelector('.thumb')).toHaveStyle({ '--thumb': '64px' });
    expect(localStorage.getItem('xcube.data.view')).toBe('list');
    unmount();
    renderAt('/app/data');
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: '보기 방식' })).getByRole('button', { name: /목록 보기/ })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('RD1 대시보드', () => {
  test('최근 데이터의 그림은 56px', async () => {
    renderAt('/app');
    const link = await screen.findByRole('link', { name: '제주 시계열' });
    const row = link.closest('tr') as HTMLElement;
    expect(row.querySelector('.thumb')).toHaveStyle({ '--thumb': '56px' });
  });
});
