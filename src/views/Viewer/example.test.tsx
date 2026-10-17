/* UX1 example data in the Viewer: the example AI result belongs to another account, so the AI service does not list it
   for this user; the source's Backoffice detail (`linkedSuccessfulInferResults`) offers it, with its own name. */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('../../components/map', () => ({ __esModule: true, default: function MockMap({ onMapReady }: any) { const React = require('react'); React.useEffect(() => onMapReady(mockMap), [onMapReady]); return <div>OpenLayers map</div>; } }));
jest.mock('../../components/xcubeLayer', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../../api/aiApi', () => ({ ...jest.requireActual('../../api/aiApi'), aiApi: { listModels: jest.fn(), check: jest.fn(), createJob: jest.fn(), listJobs: jest.fn(), getJob: jest.fn(), cancelJob: jest.fn(), retryJob: jest.fn() } }));
jest.mock('../../api', () => ({ activeViewerAdapter: { getProjects: jest.fn(), getDatasets: jest.fn(), getProjectDatasets: jest.fn(), getJobs: jest.fn(), runWaterExtraction: jest.fn() }, useMockApi: false }));
jest.mock('../../api/backofficeApi', () => ({ backofficeAdapter: { checkXcubeStatus: jest.fn(), getDatasetDetail: jest.fn(), tileUrl: jest.fn(), getTimeseries: jest.fn(), getProjectMembers: jest.fn(), getLinkableDatacubes: jest.fn() } }));
jest.mock('../../api/thumbnails', () => ({ cachedThumbnail: () => undefined, loadThumbnail: () => Promise.resolve({ state: 'failed' }), PENDING_RETRY_MS: 15000 }));
jest.mock('ol/proj', () => ({ toLonLat: (coordinate: any) => coordinate }));

const mockView = { getProjection: () => ({ getCode: () => 'EPSG:4326' }), getCenter: () => [126.5, 33.5], getResolution: () => 100, getZoom: () => 9, fit: jest.fn(), animate: jest.fn(), setCenter: jest.fn(), setResolution: jest.fn(), setZoom: jest.fn() };
const mockMap = { updateSize: jest.fn(), removeLayer: jest.fn(), getView: () => mockView, on: jest.fn(), un: jest.fn() };

const base = { projectId: '', subtitle: 'REGISTERED · AVAILABLE', accessType: 'SHARED', isExample: true, bbox: [127.3, 35.8, 127.7, 36.1] };
const times = ['2026-04-26T02:27:27Z', '2026-05-31T02:27:23Z'].map((iso) => ({ iso, label: iso.slice(0, 10) }));
const source = { ...base, id: '86', name: 'test_GEE', xcubeDatasetId: 'u4-d86', variables: ['blue', 'green', 'red', 'nir'], defaultVariable: 'blue', rgbAvailable: true, times };
const result = { ...base, id: '87', name: 'test_GEE_수체_U-Net', xcubeDatasetId: 'u4-d87', variables: ['water_prob', 'water_mask'], defaultVariable: 'water_mask', kind: 'AI_RESULT', sourceDatacubeId: '86', times };

test('예시 원본 86을 열면 AI 작업 목록에 없어도 상세에 연결된 결과 87을 이름과 함께 비교 대상으로 고른다', async () => {
  const Viewer = require('.').default;
  const mockAddLayer = require('../../components/xcubeLayer').default as jest.Mock;
  const adapter = require('../../api').activeViewerAdapter as Record<string, jest.Mock>;
  const backoffice = require('../../api/backofficeApi').backofficeAdapter as Record<string, jest.Mock>;
  const aiService = require('../../api/aiApi').aiApi as Record<string, jest.Mock>;
  mockAddLayer.mockResolvedValue({ set: jest.fn(), get: jest.fn(), setOpacity: jest.fn(), setVisible: jest.fn(), on: jest.fn(), un: jest.fn() });
  backoffice.checkXcubeStatus.mockResolvedValue(true);
  backoffice.tileUrl.mockImplementation((id: string, variable: string) => `http://x/tiles/${id}/${variable}/{z}/{y}/{x}`);
  backoffice.getDatasetDetail.mockImplementation((id: string) => Promise.resolve(id === '87' ? result : source));
  adapter.getProjects.mockResolvedValue([]);
  adapter.getDatasets.mockResolvedValue([source, result]);
  adapter.getProjectDatasets.mockResolvedValue([]);
  // The AI service lists only this user's jobs: none for the example.
  aiService.listJobs.mockResolvedValue([]);
  adapter.getJobs.mockResolvedValue([{ id: '87', inputDatacubeId: '86', outputDatacubeId: '87', outputType: 'INFER_ZARR', status: 'SUCCEEDED', period: 'Backend 결과', name: 'test_GEE_수체_U-Net' }]);
  Object.defineProperty(window, 'matchMedia', { writable: true, value: jest.fn().mockReturnValue({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() }) });
  window.history.replaceState(null, '', '/app/viewer?dataset=86&ai=87');
  try {
    render(<Viewer initialDatasetId="86" />);
    await waitFor(() => expect(adapter.getJobs).toHaveBeenCalledWith('86'));
    fireEvent.click(await screen.findByRole('button', { name: /^결과 비교/ }));
    const drawer = await screen.findByRole('complementary', { name: '결과 비교' });
    expect(await within(drawer).findByText('test_GEE_수체_U-Net')).toBeInTheDocument();
    expect(within(drawer).queryByText(/수체 추출 결과 #87/)).not.toBeInTheDocument();
    await waitFor(() => expect(backoffice.tileUrl.mock.calls.some((call) => call[0] === 'u4-d87' || call[0] === '87')).toBe(true));
  } finally {
    window.history.replaceState(null, '', '/');
  }
});
