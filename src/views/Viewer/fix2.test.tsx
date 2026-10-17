/* FIX2: a reader of someone else's AI result (example 87) gets its statistics and model from the AI service by result
   id; an address with cmp=ai&mode=swipe&ai=<result> opens the swipe with that result even with one time. */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('../../components/map', () => ({ __esModule: true, default: function MockMap({ onMapReady }: any) { const React = require('react'); React.useEffect(() => onMapReady(mockMap), [onMapReady]); return <div>OpenLayers map</div>; } }));
jest.mock('../../components/xcubeLayer', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../../api/aiApi', () => ({ ...jest.requireActual('../../api/aiApi'), aiApi: { listModels: jest.fn(), check: jest.fn(), createJob: jest.fn(), listJobs: jest.fn(), getJob: jest.fn(), getResult: jest.fn(), cancelJob: jest.fn(), retryJob: jest.fn() } }));
jest.mock('../../api', () => ({ activeViewerAdapter: { getProjects: jest.fn(), getDatasets: jest.fn(), getProjectDatasets: jest.fn(), getJobs: jest.fn(), runWaterExtraction: jest.fn() }, useMockApi: false }));
jest.mock('../../api/backofficeApi', () => ({ backofficeAdapter: { checkXcubeStatus: jest.fn(), getDatasetDetail: jest.fn(), tileUrl: jest.fn(), getTimeseries: jest.fn(), getProjectMembers: jest.fn(), getLinkableDatacubes: jest.fn() } }));
jest.mock('../../api/thumbnails', () => ({ cachedThumbnail: () => undefined, loadThumbnail: () => Promise.resolve({ state: 'failed' }), PENDING_RETRY_MS: 15000 }));
jest.mock('ol/proj', () => ({ toLonLat: (coordinate: any) => coordinate }));

const mockView = { getProjection: () => ({ getCode: () => 'EPSG:4326' }), getCenter: () => [127.5, 36.4], getResolution: () => 100, getZoom: () => 9, fit: jest.fn(), animate: jest.fn(), setCenter: jest.fn(), setResolution: jest.fn(), setZoom: jest.fn() };
const mockMap = { updateSize: jest.fn(), removeLayer: jest.fn(), getView: () => mockView, on: jest.fn(), un: jest.fn() };
const base = { projectId: '', subtitle: 'REGISTERED · AVAILABLE', accessType: 'SHARED', bbox: [127.3, 35.8, 127.7, 36.1] };

function setup() {
  const Viewer = require('.').default;
  const mockAddLayer = require('../../components/xcubeLayer').default as jest.Mock;
  const adapter = require('../../api').activeViewerAdapter as Record<string, jest.Mock>;
  const backoffice = require('../../api/backofficeApi').backofficeAdapter as Record<string, jest.Mock>;
  const aiService = require('../../api/aiApi').aiApi as Record<string, jest.Mock>;
  Object.values(aiService).forEach((fn) => fn.mockReset());
  mockAddLayer.mockResolvedValue({ set: jest.fn(), get: jest.fn(), setOpacity: jest.fn(), setVisible: jest.fn(), on: jest.fn(), un: jest.fn() });
  backoffice.checkXcubeStatus.mockResolvedValue(true);
  backoffice.tileUrl.mockImplementation((id: string, variable: string) => `http://x/tiles/${id}/${variable}/{z}/{y}/{x}`);
  adapter.getProjects.mockResolvedValue([]);
  adapter.getProjectDatasets.mockResolvedValue([]);
  aiService.listModels.mockResolvedValue([]);
  Object.defineProperty(window, 'matchMedia', { writable: true, value: jest.fn().mockReturnValue({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() }) });
  return { Viewer, adapter, backoffice, aiService };
}

const times = ['2026-04-26T02:27:27Z', '2026-05-31T02:27:23Z'].map((iso) => ({ iso, label: iso.slice(0, 10) }));
const source = { ...base, isExample: true, id: '86', name: 'test_GEE', xcubeDatasetId: 'u4-d86', variables: ['blue', 'green', 'red', 'nir'], defaultVariable: 'blue', rgbAvailable: true, times };
const example = { ...base, isExample: true, id: '87', name: 'test_GEE_수체_U-Net', xcubeDatasetId: 'u4-d87', variables: ['water_prob', 'water_mask'], defaultVariable: 'water_mask', kind: 'AI_RESULT', sourceDatacubeId: '86', times };
// What the AI service gives a reader (public fields only, already normalized like aiApi.getResult does).
const readerView = {
  id: 'job-of-user-4', type: 'AI_WATER', name: 'test_GEE_수체_U-Net', status: 'SUCCEEDED', progress: 1, readOnly: true, createdAt: '2026-10-10T05:00:00Z',
  input: { datacubeId: 86, modelId: 'unet-s1s2-10ch', threshold: 0.5 },
  registration: { datacubeId: 87, xcubeDatasetId: 'u4-d87' },
  result: {
    times: [{ time: times[0].iso, waterAreaKm2: 22.17, waterRatio: 0.025, validAreaKm2: 891.1 }, { time: times[1].iso, waterAreaKm2: 23.4, waterRatio: 0.026, validAreaKm2: 891.1 }],
    thresholdCurve: [], metrics: null, researchBestThreshold: null, threshold: 0.5, modelId: 'unet-s1s2-10ch',
  },
};

afterEach(() => window.history.replaceState(null, '', '/'));

test('예시 AI 결과 87을 읽는 사람도 AI 서비스에서 시점별 면적과 모델 이름을 받는다', async () => {
  const { Viewer, adapter, backoffice, aiService } = setup();
  backoffice.getDatasetDetail.mockImplementation((id: string) => Promise.resolve(id === '87' ? example : source));
  adapter.getDatasets.mockResolvedValue([source, example]);
  aiService.listJobs.mockResolvedValue([]);
  aiService.getResult.mockResolvedValue(readerView);
  adapter.getJobs.mockResolvedValue([{ id: '87', inputDatacubeId: '86', outputDatacubeId: '87', outputType: 'INFER_ZARR', status: 'SUCCEEDED', period: 'Backend 결과', name: 'test_GEE_수체_U-Net' }]);
  window.history.replaceState(null, '', '/app/viewer?dataset=86&ai=87');
  render(<Viewer initialDatasetId="86" />);
  await waitFor(() => expect(aiService.getResult).toHaveBeenCalledWith('87'));
  expect(aiService.getResult).toHaveBeenCalledTimes(1);
  expect(aiService.getJob).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole('button', { name: /^결과 비교/ }));
  const drawer = await screen.findByRole('complementary', { name: '결과 비교' });
  expect(within(drawer).queryByText(/시점별 면적 통계가 없습니다/)).not.toBeInTheDocument();
  // Legend: the model (U-Net) and threshold instead of "—".
  await waitFor(() => expect(screen.getAllByText(/U-Net.*임계값 0\.50/).length).toBeGreaterThan(0));
  expect(await screen.findAllByText(/22\.17/)).not.toHaveLength(0);
});

test('결과를 읽을 수 없으면(404) 지금처럼 통계 없음으로 남고 다시 묻지 않는다', async () => {
  const { Viewer, adapter, backoffice, aiService } = setup();
  backoffice.getDatasetDetail.mockImplementation((id: string) => Promise.resolve(id === '87' ? example : source));
  adapter.getDatasets.mockResolvedValue([source, example]);
  aiService.listJobs.mockResolvedValue([]);
  aiService.getResult.mockRejectedValue(Object.assign(new Error('작업을 찾을 수 없습니다.'), { status: 404 }));
  adapter.getJobs.mockResolvedValue([{ id: '87', inputDatacubeId: '86', outputDatacubeId: '87', outputType: 'INFER_ZARR', status: 'SUCCEEDED', period: 'Backend 결과', name: 'test_GEE_수체_U-Net' }]);
  window.history.replaceState(null, '', '/app/viewer?dataset=86&ai=87');
  render(<Viewer initialDatasetId="86" />);
  await waitFor(() => expect(aiService.getResult).toHaveBeenCalledWith('87'));
  fireEvent.click(await screen.findByRole('button', { name: /^결과 비교/ }));
  const drawer = await screen.findByRole('complementary', { name: '결과 비교' });
  expect(await within(drawer).findByText(/시점별 면적 통계가 없습니다/)).toBeInTheDocument();
  expect(aiService.getResult).toHaveBeenCalledTimes(1);
});

// Dataset 55: one time; designqa owns AI result 72 (job d3c0…) and another newer result (80).
const one = [{ iso: '2024-08-14T02:27:28Z', label: '2024. 8. 14.' }];
const s1s2 = { ...base, id: '55', name: 'Sentinel_대청호_s1s2', xcubeDatasetId: 'u4-d55', variables: ['blue', 'green', 'red', 'nir', 'swir', 'vv', 'vh'], defaultVariable: 'blue', rgbAvailable: true, times: one };
const job = (id: string, cube: number, name: string, createdAt: string) => ({
  id, type: 'AI_WATER', name, status: 'SUCCEEDED', progress: 1, createdAt,
  input: { datacubeId: 55, modelId: 'deeplabv3plus-s1s2-10ch' }, registration: { datacubeId: cube, xcubeDatasetId: `u8-d${cube}` },
  result: { times: [{ time: one[0].iso, waterAreaKm2: 54.6, waterRatio: 0.061, validAreaKm2: 895.56 }], thresholdCurve: [], metrics: null, researchBestThreshold: null, threshold: 0.5 },
});

test('주소 cmp=ai&mode=swipe&ai=72는 시점이 하나여도 결과 72로 원본↔AI 스와이프를 연다', async () => {
  const { Viewer, adapter, backoffice, aiService } = setup();
  const r72 = { ...base, id: '72', name: '대청호 수체 (DeepLabV3+)', xcubeDatasetId: 'u8-d72', variables: ['water_prob', 'water_mask'], kind: 'AI_RESULT', times: one };
  const r80 = { ...r72, id: '80', name: '새 결과', xcubeDatasetId: 'u8-d80' };
  backoffice.getDatasetDetail.mockImplementation((id: string) => Promise.resolve(id === '72' ? r72 : id === '80' ? r80 : s1s2));
  adapter.getDatasets.mockResolvedValue([s1s2, r72, r80]);
  // Backoffice links answer first; the AI jobs (newest first) come later and replace them.
  adapter.getJobs.mockResolvedValue([
    { id: 'b80', inputDatacubeId: '55', outputDatacubeId: '80', outputType: 'AI_RESULT', status: 'SUCCEEDED', name: '새 결과' },
    { id: 'b72', inputDatacubeId: '55', outputDatacubeId: '72', outputType: 'AI_RESULT', status: 'SUCCEEDED', name: '대청호 수체 (DeepLabV3+)' },
  ]);
  let releaseJobs: (value: unknown) => void = () => undefined;
  aiService.listJobs.mockReturnValue(new Promise((resolve) => { releaseJobs = resolve; }));
  aiService.getResult.mockImplementation((cube: string) => new Promise(() => undefined));
  window.history.replaceState(null, '', '/app/viewer?dataset=55&var=rgb&cmp=ai&ai=72&mode=swipe');
  render(<Viewer initialDatasetId="55" />);
  await waitFor(() => expect(screen.getByRole('slider', { name: /스와이프|비교 경계|swipe/i })).toBeInTheDocument());
  await waitFor(() => expect(window.location.search).toContain('ai=72'));
  releaseJobs([job('job-80', 80, '새 결과', '2026-10-12T00:00:00Z'), job('d3c0def2', 72, '대청호 수체 (DeepLabV3+)', '2026-10-07T00:00:00Z')]);
  await waitFor(() => expect(aiService.listJobs).toHaveBeenCalled());
  await new Promise((resolve) => setTimeout(resolve, 150));
  await waitFor(() => expect(window.location.search).toContain('mode=swipe'));
  expect(window.location.search).toContain('cmp=ai');
  expect(window.location.search).toContain('ai=72');
  expect(window.location.search).not.toContain('ai=80');
  await waitFor(() => expect(backoffice.tileUrl.mock.calls.some((call) => call[0] === 'u8-d72')).toBe(true));
});
