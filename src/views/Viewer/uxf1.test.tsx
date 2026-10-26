/* UXF1: `?t=` picks the asked time even when the catalogue lists only the first and last one; another dataset starts
   with the AI water layer off; closing 내보내기 with exports still being made asks whether to cancel them. */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { exportsApi } from '../../api/exports';

jest.mock('../../components/map', () => ({ __esModule: true, default: function MockMap({ onMapReady }: any) { const React = require('react'); React.useEffect(() => onMapReady(mockMap), [onMapReady]); return <div>OpenLayers map</div>; } }));
jest.mock('../../components/xcubeLayer', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../../api/aiApi', () => ({ ...jest.requireActual('../../api/aiApi'), aiApi: { listModels: jest.fn(), check: jest.fn(), createJob: jest.fn(), listJobs: jest.fn(), getJob: jest.fn(), getResult: jest.fn(), cancelJob: jest.fn(), retryJob: jest.fn() } }));
jest.mock('../../api', () => ({ activeViewerAdapter: { getProjects: jest.fn(), getDatasets: jest.fn(), getProjectDatasets: jest.fn(), getJobs: jest.fn(), runWaterExtraction: jest.fn() }, useMockApi: false }));
jest.mock('../../api/backofficeApi', () => ({ backofficeAdapter: { checkXcubeStatus: jest.fn(), getDatasetDetail: jest.fn(), tileUrl: jest.fn(), getTimeseries: jest.fn(), getProjectMembers: jest.fn(), getLinkableDatacubes: jest.fn() } }));
jest.mock('../../api/thumbnails', () => ({ cachedThumbnail: () => undefined, loadThumbnail: () => Promise.resolve({ state: 'failed' }), PENDING_RETRY_MS: 15000 }));
jest.mock('ol/proj', () => ({ toLonLat: (coordinate: any) => coordinate, transformExtent: (extent: any) => extent }));

const mockView = { getProjection: () => ({ getCode: () => 'EPSG:4326' }), getCenter: () => [127.5, 36.0], getResolution: () => 100, getZoom: () => 9, fit: jest.fn(), animate: jest.fn(), setCenter: jest.fn(), setResolution: jest.fn(), setZoom: jest.fn(), calculateExtent: () => [127, 36, 128, 37] };
const mockMap = { updateSize: jest.fn(), removeLayer: jest.fn(), getView: () => mockView, getSize: () => [800, 600], getCoordinateFromPixel: () => [127.5, 36.0], on: jest.fn(), un: jest.fn() };
const base = { projectId: '', subtitle: 'REGISTERED · AVAILABLE', accessType: 'OWNED', bbox: [127.3, 35.8, 127.7, 36.1] };
const isos = ['2025-10-23T02:26:51Z', '2025-11-22T02:26:48Z', '2025-12-02T02:26:47Z', '2025-12-22T02:26:49Z'];
const all = isos.map((iso) => ({ iso, label: iso.slice(0, 10) }));
// The catalogue knows only the first and last time; the detail has all four.
const lakeListed = { ...base, id: '86', name: '대청호', xcubeDatasetId: 'u4-d86', variables: ['blue', 'red'], defaultVariable: 'blue', times: [all[0], all[3]] };
const lake = { ...lakeListed, times: all };
const island = { ...base, id: '71', name: '제주시', xcubeDatasetId: 'u4-d71', variables: ['b3'], defaultVariable: 'b3', times: all.slice(0, 2) };
const aiJob = (source: string) => ({
  id: `job-${source}`, type: 'AI_WATER', name: `${source} 수체`, status: 'SUCCEEDED', progress: 1, createdAt: '2026-10-10T05:00:00Z',
  input: { datacubeId: Number(source), modelId: 'ndwi', threshold: 0.5 }, registration: { datacubeId: Number(source) + 1000, xcubeDatasetId: `u4-d${source}-ai` },
  result: { times: [], thresholdCurve: [], metrics: null, threshold: 0.5, modelId: 'ndwi' },
});

function setup() {
  const Viewer = require('.').default;
  const mockAddLayer = require('../../components/xcubeLayer').default as jest.Mock;
  const adapter = require('../../api').activeViewerAdapter as Record<string, jest.Mock>;
  const backoffice = require('../../api/backofficeApi').backofficeAdapter as Record<string, jest.Mock>;
  const aiService = require('../../api/aiApi').aiApi as Record<string, jest.Mock>;
  Object.values(backoffice).forEach((fn) => fn.mockReset());
  Object.values(aiService).forEach((fn) => fn.mockReset());
  mockAddLayer.mockResolvedValue({ set: jest.fn(), get: jest.fn(), setOpacity: jest.fn(), setVisible: jest.fn(), setZIndex: jest.fn(), on: jest.fn(), un: jest.fn() });
  backoffice.checkXcubeStatus.mockResolvedValue(true);
  backoffice.tileUrl.mockImplementation((id: string, variable: string, time: string) => `http://x/tiles/${id}/${variable}/${time}/{z}/{y}/{x}`);
  backoffice.getDatasetDetail.mockImplementation((id: string) => Promise.resolve(id === '71' ? island : lake));
  adapter.getProjects.mockResolvedValue([]);
  adapter.getProjectDatasets.mockResolvedValue([]);
  adapter.getDatasets.mockResolvedValue([lakeListed, island]);
  adapter.getJobs.mockResolvedValue([]);
  aiService.listModels.mockResolvedValue([]);
  aiService.listJobs.mockResolvedValue([]);
  Object.defineProperty(window, 'matchMedia', { writable: true, value: jest.fn().mockReturnValue({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() }) });
  return { Viewer, backoffice, aiService };
}
const staff = () => screen.getByRole('slider', { name: /시점/ });

afterEach(() => {
  window.history.replaceState(null, '', '/');
  jest.restoreAllMocks();
});

test('?t=가 가운데 시점이면 목록의 처음·끝만 알 때 버리지 않고 상세를 기다려 그 시점을 고른다(형식이 달라도)', async () => {
  const { Viewer, backoffice } = setup();
  let answer: (value: unknown) => void = () => undefined;
  backoffice.getDatasetDetail.mockImplementation(() => new Promise((resolve) => { answer = resolve; }));
  window.history.replaceState(null, '', `/app/viewer?dataset=86&t=${encodeURIComponent('2025-11-22T02:26:48.000Z')}`);
  render(<Viewer initialDatasetId="86" />);
  await screen.findByRole('heading', { name: /대청호/ });
  await act(async () => answer(lake));
  await waitFor(() => expect(staff()).toHaveAttribute('aria-valuetext', expect.stringContaining('2 / 4')));
  expect(window.location.search).toContain(`t=${encodeURIComponent('2025-11-22T02:26:48Z')}`);
});

test('다른 데이터로 바꾸면 AI 수체 레이어는 꺼진 채로 시작한다', async () => {
  const { Viewer, aiService } = setup();
  aiService.listJobs.mockImplementation(({ datacubeId }: { datacubeId: string }) => Promise.resolve([aiJob(String(datacubeId))]));
  window.history.replaceState(null, '', '/app/viewer?dataset=86&ai=1086');
  render(<Viewer initialDatasetId="86" />);
  await screen.findByRole('heading', { name: /대청호/ });
  fireEvent.click(within(screen.getByRole('navigation', { name: '도구' })).getByRole('button', { name: '레이어' }));
  const aiToggle = async () => within(await screen.findByRole('complementary', { name: '레이어' })).findByRole('checkbox', { name: /AI 수체 결과/ });
  await waitFor(async () => expect(await aiToggle()).toBeChecked());

  fireEvent.click(screen.getByRole('button', { name: /^데이터 또는 Zarr 선택/ }));
  fireEvent.click(await screen.findByRole('option', { name: /제주시/ }));
  await screen.findByRole('heading', { name: /제주시/ });
  await waitFor(async () => expect(await aiToggle()).not.toBeChecked());
});

describe('내보내기 창을 닫을 때 만드는 중인 내보내기', () => {
  async function startGeoTiff(Viewer: any) {
    jest.spyOn(exportsApi, 'create').mockResolvedValue({ id: 'e7', name: '대청호', type: 'EXPORT_GEOTIFF', status: 'QUEUED', progress: 0 } as any);
    jest.spyOn(exportsApi, 'get').mockResolvedValue({ id: 'e7', name: '대청호', type: 'EXPORT_GEOTIFF', status: 'RUNNING', progress: 30 } as any);
    window.history.replaceState(null, '', '/app/viewer?dataset=86');
    render(<Viewer initialDatasetId="86" />);
    await screen.findByRole('heading', { name: /대청호/ });
    fireEvent.click(within(screen.getByRole('navigation', { name: '도구' })).getByRole('button', { name: '내보내기' }));
    const panel = await screen.findByRole('complementary', { name: '내보내기' });
    fireEvent.click(within(panel).getByRole('radio', { name: /^GeoTIFF/ }));
    fireEvent.click(within(panel).getByRole('button', { name: 'GeoTIFF 만들기' }));
    expect(await within(panel).findByRole('heading', { name: '만드는 중 (1)' })).toBeInTheDocument();
    return panel;
  }

  test('닫기를 누르면 계속 만들지 취소할지 묻고, “취소하고 닫기”는 서버 작업을 취소한다', async () => {
    const { Viewer } = setup();
    const cancel = jest.spyOn(exportsApi, 'cancel').mockResolvedValue(undefined as any);
    const panel = await startGeoTiff(Viewer);
    fireEvent.click(within(panel).getByRole('button', { name: '패널 닫기' }));
    const ask = await screen.findByRole('alertdialog', { name: '만드는 중인 내보내기 1개' });
    expect(within(ask).getByRole('button', { name: '계속 만들고 닫기' })).toHaveFocus();
    fireEvent.click(within(ask).getByRole('button', { name: '취소하고 닫기' }));
    await waitFor(() => expect(cancel).toHaveBeenCalledWith('e7'));
    await waitFor(() => expect(screen.queryByRole('complementary', { name: '내보내기' })).not.toBeInTheDocument());
  });

  test('“계속 만들고 닫기”는 취소하지 않고 닫고, Esc는 창을 그대로 둔다', async () => {
    const { Viewer } = setup();
    const cancel = jest.spyOn(exportsApi, 'cancel').mockResolvedValue(undefined as any);
    const panel = await startGeoTiff(Viewer);
    fireEvent.click(within(screen.getByRole('navigation', { name: '도구' })).getByRole('button', { name: '내보내기' }));
    let ask = await screen.findByRole('alertdialog');
    fireEvent.keyDown(ask, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(panel).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: '패널 닫기' }));
    ask = await screen.findByRole('alertdialog');
    fireEvent.click(within(ask).getByRole('button', { name: '계속 만들고 닫기' }));
    expect(cancel).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('complementary', { name: '내보내기' })).not.toBeInTheDocument());
  });
});
