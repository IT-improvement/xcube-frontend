/* SVG cursor geometry has no accessible DOM equivalent. */
/* eslint-disable testing-library/no-node-access */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
jest.mock('../../components/map', () => ({ __esModule: true, default: function MockMap({ onMapReady, onPixelSelect }: any) { const React = require('react'); React.useEffect(() => onMapReady(mockMap), [onMapReady]); return <button onClick={() => onPixelSelect([126.5, 33.5])}>OpenLayers map</button>; } }));
jest.mock('../../components/xcubeLayer', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../../api/aiApi', () => ({ ...jest.requireActual('../../api/aiApi'), aiApi: { listModels: jest.fn(), check: jest.fn(), createJob: jest.fn(), listJobs: jest.fn(), getJob: jest.fn(), cancelJob: jest.fn(), retryJob: jest.fn() } }));
jest.mock('../../api', () => ({ activeViewerAdapter: { getProjects: jest.fn(), getDatasets: jest.fn(), getProjectDatasets: jest.fn(), getJobs: jest.fn(), runWaterExtraction: jest.fn() }, useMockApi: false }));
jest.mock('../../api/backofficeApi', () => ({ backofficeAdapter: { checkXcubeStatus: jest.fn(), getDatasetDetail: jest.fn(), tileUrl: jest.fn(), getTimeseries: jest.fn(), createProject: jest.fn(), updateProject: jest.fn(), deleteProject: jest.fn(), getProjectMembers: jest.fn(), addProjectMember: jest.fn(), updateProjectMember: jest.fn(), removeProjectMember: jest.fn(), getLinkableDatacubes: jest.fn(), linkProjectDataset: jest.fn(), unlinkProjectDataset: jest.fn() } }));
jest.mock('ol/proj', () => ({ toLonLat: (coordinate: any) => coordinate }));

const Viewer = require('.').default;
const mockAddLayer = require('../../components/xcubeLayer').default as jest.Mock;
const mockAdapter = require('../../api').activeViewerAdapter as Record<string, jest.Mock>;
const mockBackoffice = require('../../api/backofficeApi').backofficeAdapter as Record<string, jest.Mock>;
const mockAi = require('../../api/aiApi').aiApi as Record<string, jest.Mock>;
let mockCenter = [126.5, 33.5];
let mockResolution = 100;
const mockView = { getProjection: () => ({ getCode: () => 'EPSG:4326' }), getCenter: () => mockCenter, getResolution: () => mockResolution, getZoom: () => 9, fit: jest.fn(), animate: jest.fn(), setCenter: jest.fn(), setResolution: jest.fn(), setZoom: jest.fn() };
function mockEmitter() {
  const handlers: Record<string, Set<() => void>> = {};
  return {
    on: (type: string, handler: () => void) => { (handlers[type] ??= new Set()).add(handler); },
    un: (type: string, handler: () => void) => { handlers[type]?.delete(handler); },
    emit: (type: string) => Array.from(handlers[type] ?? []).forEach((handler) => handler()),
  };
}
const mockMapEvents = mockEmitter();
const mockAlive = new Set<any>();
const mockMap = { updateSize: jest.fn(), removeLayer: jest.fn(), getView: jest.fn(() => mockView), on: mockMapEvents.on, un: mockMapEvents.un };
const mockLayer = { set: jest.fn(), get: jest.fn(), setOpacity: jest.fn(), setVisible: jest.fn() };
const tileUrl = (id: string, variable: string, time?: string) => `http://localhost:8080/tiles/${id}/${variable}/{z}/{y}/{x}${time ? `?time=${time}` : ''}`;

beforeEach(() => {
  mockCenter = [126.5, 33.5]; mockResolution = 100;
  mockMap.updateSize.mockImplementation(() => { mockCenter = [0, 0]; mockResolution = 999; });
  mockView.setCenter.mockImplementation((center) => { mockCenter = center; });
  mockView.setResolution.mockImplementation((resolution) => { mockResolution = resolution; });
  mockMap.getView.mockReturnValue(mockView);
  mockBackoffice.getLinkableDatacubes.mockResolvedValue([]);
  jest.clearAllMocks(); mockAddLayer.mockResolvedValue(mockLayer); mockBackoffice.checkXcubeStatus.mockResolvedValue(true); mockBackoffice.getDatasetDetail.mockResolvedValue({ id: '77', projectId: '4', name: '서버 상세 이름', subtitle: 'REGISTERED · AVAILABLE', xcubeDatasetId: '77', defaultVariable: 'red', variables: ['red', 'green', 'blue', 'nir'], times: [{ iso: '2026-01-01T00:00:00Z', label: '2026. 1. 1.' }, { iso: '2026-02-01T00:00:00Z', label: '2026. 2. 1.' }], bbox: [126, 33, 127, 34] }); mockBackoffice.tileUrl.mockImplementation(tileUrl); mockBackoffice.getProjectMembers.mockResolvedValue([{ userId: '1', role: 'OWNER' }, { userId: '22', role: 'VIEWER' }]); mockAdapter.getProjects.mockResolvedValue([{ id: '4', name: '임의 프로젝트', accessRole: 'OWNER' }]); mockAdapter.getDatasets.mockResolvedValue([{ id: '77', projectId: '4', name: '임의 데이터셋', subtitle: 'REGISTERED · AVAILABLE', xcubeDatasetId: 'custom_cube_2026', defaultVariable: '', variables: [], times: [] }]); mockAdapter.getProjectDatasets.mockResolvedValue([]); mockAdapter.getJobs.mockResolvedValue([]); mockAi.listJobs.mockResolvedValue([]);
  Object.defineProperty(window, 'matchMedia', { writable: true, value: jest.fn().mockReturnValue({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() }) });
});

test('프로젝트 선택을 취소해도 전역 Zarr와 지도 사용을 유지한다', async () => {
  render(<Viewer />);
  const project = await screen.findByRole('combobox', { name: '프로젝트 선택' });
  expect(project).toHaveValue('');
  fireEvent.change(project, { target: { value: '4' } });
  expect(project).toHaveValue('4');
  fireEvent.change(project, { target: { value: '' } });
  expect(project).toHaveValue('');
  expect(screen.queryByRole('region', { name: '현재 프로젝트의 Zarr 데이터큐브' })).not.toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: '데이터 또는 Zarr 선택' })).toBeInTheDocument();
  expect(screen.getByText('OpenLayers map')).toBeInTheDocument();
});

test('summary 선택 후 detail의 첫 band, time, bbox로 임의 XCube tile layer를 만든다', async () => {
  render(<Viewer />);
  const select = await screen.findByRole('combobox', { name: '데이터 또는 Zarr 선택' });
  fireEvent.click(select); fireEvent.click(await screen.findByRole('option', { name: /임의 데이터셋/ }));
  await waitFor(() => expect(mockBackoffice.getDatasetDetail).toHaveBeenCalledWith('77'));
  await waitFor(() => expect(mockBackoffice.tileUrl).toHaveBeenCalledWith('custom_cube_2026', 'red', '2026-01-01T00:00:00Z'));
  expect(mockAddLayer).toHaveBeenCalledWith(expect.objectContaining({ tileUrl: expect.stringContaining('/tiles/custom_cube_2026/red/'), bbox: [126, 33, 127, 34] }));
});

test('RGB 조건과 band 선택이 실제 tile variable을 바꾼다', async () => {
  render(<Viewer />);
  const select = await screen.findByRole('combobox', { name: '데이터 또는 Zarr 선택' });
  fireEvent.click(select); fireEvent.click(await screen.findByRole('option', { name: /임의 데이터셋/ }));
  await waitFor(() => expect(mockAddLayer).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: '레이어 및 AI 작업 패널 열기' }));
  expect(screen.getByRole('button', { name: 'RGB' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'RGB' }));
  await waitFor(() => expect(mockBackoffice.tileUrl).toHaveBeenCalledWith('custom_cube_2026', 'rgb', '2026-01-01T00:00:00Z'));
  fireEvent.click(screen.getByRole('button', { name: 'blue' }));
  await waitFor(() => expect(mockBackoffice.tileUrl).toHaveBeenCalledWith('custom_cube_2026', 'blue', '2026-01-01T00:00:00Z'));
});

test('시간 프레임을 변경하면 같은 band의 새 time query layer를 만든다', async () => {
  render(<Viewer />);
  const select = await screen.findByRole('combobox', { name: '데이터 또는 Zarr 선택' }); fireEvent.click(select); fireEvent.click(await screen.findByRole('option', { name: /임의 데이터셋/ }));
  const slider = await screen.findByRole('slider', { name: '관측 시점' }); fireEvent.change(slider, { target: { value: '1' } });
  await waitFor(() => expect(mockBackoffice.tileUrl).toHaveBeenCalledWith('custom_cube_2026', 'red', '2026-02-01T00:00:00Z'));
});

async function selectBaselineDataset() {
  fireEvent.click(await screen.findByRole('combobox', { name: '데이터 또는 Zarr 선택' }));
  fireEvent.click(await screen.findByRole('option', { name: /임의 데이터셋/ }));
  await waitFor(() => expect(mockAddLayer).toHaveBeenCalled());
}

afterEach(() => jest.useRealTimers());

test('M0 FR-VIEW-03: 첫/마지막/이전/다음, 재생, 반복과 속도를 유지한다', async () => {
  jest.useFakeTimers();
  render(<Viewer />);
  await selectBaselineDataset();
  const slider = screen.getByRole('slider', { name: '관측 시점' });
  // First/last, speed and loop sit behind the playback options button (progressive disclosure).
  fireEvent.click(screen.getByRole('button', { name: /재생 옵션/ }));
  for (const [button, value] of [['마지막 시점', '1'], ['이전 시점', '0'], ['다음 시점', '1'], ['첫 시점', '0']]) {
    fireEvent.click(screen.getByRole('button', { name: button }));
    expect(slider).toHaveValue(value);
  }
  fireEvent.click(screen.getByRole('button', { name: '2x' }));
  fireEvent.click(screen.getByRole('button', { name: '재생' }));
  await act(async () => { jest.advanceTimersByTime(750); });
  expect(slider).toHaveValue('1');
  await act(async () => { jest.advanceTimersByTime(750); });
  expect(slider).toHaveValue('0');
  fireEvent.click(screen.getByRole('checkbox', { name: '반복' }));
  await act(async () => { jest.advanceTimersByTime(750); });
  expect(slider).toHaveValue('1');
  expect(screen.getByRole('button', { name: '재생' })).toBeInTheDocument();
});

test('시점이 하나뿐이면 재생 버튼을 막고 재생 상태로 들어가지 않는다', async () => {
  mockBackoffice.getDatasetDetail.mockResolvedValue({ id: '77', projectId: '4', name: '한 시점', subtitle: 'REGISTERED · AVAILABLE', xcubeDatasetId: '77', defaultVariable: 'red', variables: ['red'], times: [{ iso: '2026-01-01T00:00:00Z', label: '2026. 1. 1.' }], bbox: [126, 33, 127, 34] });
  render(<Viewer />);
  const select = await screen.findByRole('combobox', { name: '데이터 또는 Zarr 선택' });
  fireEvent.click(select); fireEvent.click(await screen.findByRole('option', { name: /임의 데이터셋/ }));
  const play = await screen.findByRole('button', { name: /^재생 \(시점이 2개 이상/ });
  expect(play).toBeDisabled();
  expect(play).toHaveAttribute('title', '시점이 하나뿐이라 재생할 수 없습니다');
  fireEvent.click(play);
  fireEvent.keyDown(window, { key: ' ' });
  expect(play).toHaveAttribute('aria-pressed', 'false');
  expect(screen.queryByRole('button', { name: '일시정지' })).not.toBeInTheDocument();
});

test('M0 FR-VIEW-04/05: 같은 좌표 전체 시계열, 현재 시점 동기화와 패널 상태를 유지한다', async () => {
  jest.useFakeTimers();
  mockBackoffice.getTimeseries.mockResolvedValue([
    { time: '2026-01-01T00:00:00Z', value: 1234 },
    { time: '2026-02-01T00:00:00Z', value: 2345 },
  ]);
  render(<Viewer />);
  await selectBaselineDataset();
  fireEvent.click(screen.getByRole('button', { name: '픽셀 값 조회' }));
  fireEvent.click(screen.getByRole('button', { name: 'OpenLayers map' }));
  await waitFor(() => expect(mockBackoffice.getTimeseries).toHaveBeenCalledWith('77', 'red', {
    lon: 126.5, lat: 33.5, startDate: '2026-01-01T00:00:00Z', endDate: '2026-02-01T00:00:00Z', maxValids: 1000,
  }));
  const graph = await screen.findByRole('img', { name: /시계열 그래프.*유효 2개/ });
  expect(graph).toHaveAccessibleName(/최소 1234, 최대 2345/);
  const cursor = graph.querySelector('.current-time .cursor')?.getAttribute('x1');
  fireEvent.click(screen.getByRole('button', { name: '다음 시점' }));
  expect(graph.querySelector('.current-time .cursor')?.getAttribute('x1')).not.toBe(cursor);
  const layers = mockAddLayer.mock.calls.length;
  mockView.fit.mockClear();
  fireEvent.click(screen.getByRole('button', { name: '픽셀 그래프 아래로 숨기기' }));
  fireEvent.click(screen.getByRole('button', { name: '픽셀 그래프 위로 펼치기' }));
  fireEvent.click(screen.getByRole('button', { name: '레이어 및 AI 작업 패널 열기' }));
  fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
  expect(mockAddLayer).toHaveBeenCalledTimes(layers);
  expect(mockBackoffice.getTimeseries).toHaveBeenCalledTimes(1);
  expect(mockView.fit).not.toHaveBeenCalled();
  expect(mockView.animate).not.toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(240); });
  expect(mockMap.updateSize).toHaveBeenCalled();
  expect(mockView.getCenter()).toEqual([126.5, 33.5]);
  expect(mockView.getResolution()).toBe(100);
  expect(mockView.setZoom).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '픽셀 선택 지우기' })).toBeInTheDocument();
  expect({
    graph: screen.getByRole('img', { name: /시계열 그래프/ }).getAttribute('aria-label'),
    timeIndex: (screen.getByRole('slider', { name: '관측 시점' }) as HTMLInputElement).value,
    center: mockView.getCenter(), resolution: mockView.getResolution(),
  }).toMatchSnapshot('M0 Viewer full-series and map state');
});

test('M0 FR-VIEW-07: 빈 목록은 서버 장애와 다른 문구를 표시한다', async () => {
  mockAdapter.getDatasets.mockResolvedValue([]);
  const { unmount } = render(<Viewer />);
  expect(await screen.findByText(/등록된 Zarr가 없습니다/)).toBeInTheDocument();
  expect(screen.queryByText('XCube Server를 사용할 수 없습니다.')).not.toBeInTheDocument();
  unmount();
  const { ApiError } = require('../../api/httpClient');
  mockAdapter.getDatasets.mockRejectedValue(new ApiError(503, 'XCUBE_UNAVAILABLE', 'down'));
  render(<Viewer />);
  expect(await screen.findByText('XCube Server를 사용할 수 없습니다.')).toBeInTheDocument();
  expect(screen.queryByText(/등록된 Zarr가 없습니다/)).not.toBeInTheDocument();
});

test('M0 FR-VIEW-02: 데이터셋 전환은 기존 layer를 제거하고 새 dataset과 band를 사용한다', async () => {
  const first = { id: '77', name: '임의 데이터셋', xcubeDatasetId: 'cube-a', variables: ['red'], times: [], defaultVariable: 'red' };
  const second = { ...first, id: '88', name: '두 번째 데이터셋', xcubeDatasetId: 'cube-b', defaultVariable: 'nir', variables: ['nir'] };
  mockAdapter.getDatasets.mockResolvedValue([first, second]);
  mockBackoffice.getDatasetDetail.mockImplementation(async (id) => id === '77' ? first : second);
  render(<Viewer />);
  await selectBaselineDataset();
  fireEvent.click(screen.getByRole('combobox', { name: '데이터 또는 Zarr 선택' }));
  fireEvent.click(await screen.findByRole('option', { name: /두 번째 데이터셋/ }));
  await waitFor(() => expect(mockBackoffice.tileUrl).toHaveBeenLastCalledWith('cube-b', 'nir', undefined));
  expect(mockMap.removeLayer).toHaveBeenCalledWith(mockLayer);
});

test('Viewer의 API 401은 서버 로그아웃 callback을 호출하지 않는다', async () => {
  const { ApiError } = require('../../api/httpClient');
  const onLogout = jest.fn();
  mockAdapter.getProjects.mockRejectedValueOnce(new ApiError(401, 'UNAUTHORIZED', 'expired'));
  render(<Viewer onLogout={onLogout} />);
  expect(await screen.findByText('세션이 만료되었습니다. 다시 로그인해 주세요.')).toBeInTheDocument();
  expect(onLogout).not.toHaveBeenCalled();
});

test('등록된 Zarr가 없다는 안내는 3~4초 뒤 사라진다', async () => {
  jest.useFakeTimers();
  mockAdapter.getDatasets.mockResolvedValue([]);
  render(<Viewer />);
  expect(await screen.findByText(/등록된 Zarr가 없습니다/)).toBeInTheDocument();
  await act(async () => { jest.advanceTimersByTime(3000); });
  expect(screen.getByText(/등록된 Zarr가 없습니다/)).toBeInTheDocument();
  await act(async () => { jest.advanceTimersByTime(600); });
  expect(screen.queryByText(/등록된 Zarr가 없습니다/)).not.toBeInTheDocument();
  jest.useRealTimers();
});

test('공유받은 프로젝트로만 연결된 Zarr는 아무 반응 없이 넘어가지 않고 이유를 알려 준다', async () => {
  mockAdapter.getProjectDatasets.mockResolvedValue([{ id: '99', projectId: '4', name: '남의 Zarr', subtitle: 'READY', xcubeDatasetId: 'other', defaultVariable: 'red', variables: ['red'], times: [] }]);
  render(<Viewer />);
  fireEvent.change(await screen.findByRole('combobox', { name: '프로젝트 선택' }), { target: { value: '4' } });
  // The project's data is listed in the dataset picker, narrowed to that project.
  await waitFor(() => expect(mockAdapter.getProjectDatasets).toHaveBeenCalledWith('4'));
  fireEvent.click(screen.getByRole('combobox', { name: '데이터 또는 Zarr 선택' }));
  fireEvent.click(await screen.findByRole('option', { name: /남의 Zarr/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent('공유받은 프로젝트를 통해서만 연결된 데이터라 아직 열 수 없습니다');
  expect(screen.queryByRole('region', { name: '시계열 탐색기' })).not.toBeInTheDocument();
});

test('M2: 소유자 Pod 주소(tileBaseUrl)가 있으면 그 주소에서 tile을 받는다', async () => {
  const withPod = { id: '77', projectId: '4', name: '임의 데이터셋', subtitle: 'REGISTERED · AVAILABLE', xcubeDatasetId: 'u7-d62', defaultVariable: '', variables: [], times: [], tileBaseUrl: 'http://localhost:18007' };
  mockAdapter.getDatasets.mockResolvedValue([withPod]);
  mockBackoffice.getDatasetDetail.mockResolvedValue({ ...withPod, defaultVariable: 'red', variables: ['red'], times: [{ iso: '2026-05-01T00:00:00Z', label: '2026. 5. 1.' }], bbox: [126, 33, 127, 34] });
  render(<Viewer />);
  fireEvent.click(await screen.findByRole('combobox', { name: '데이터 또는 Zarr 선택' }));
  fireEvent.click(await screen.findByRole('option', { name: /임의 데이터셋/ }));
  await waitFor(() => expect(mockBackoffice.tileUrl).toHaveBeenCalledWith('u7-d62', 'red', '2026-05-01T00:00:00Z', 'http://localhost:18007', undefined));
});

test('M2: 내 시각화 서버가 준비 중이면 알리고, 준비되면 연결됨으로 바꾼다', async () => {
  jest.useFakeTimers();
  const instance = jest.fn().mockResolvedValueOnce({ enabled: true, state: 'STARTING' }).mockResolvedValue({ enabled: true, state: 'READY' });
  mockBackoffice.getMyXcubeInstance = instance;
  render(<Viewer />);
  expect(await screen.findByText('시각화 서버를 준비하고 있습니다')).toBeInTheDocument();
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(await screen.findByText('내 시각화 서버 연결됨')).toBeInTheDocument();
  expect(instance).toHaveBeenCalledTimes(2);
  delete (mockBackoffice as any).getMyXcubeInstance;
  jest.useRealTimers();
});

// FR-VIEW-12: frame-gated playback, double-buffered time layers and the prefetched next frame.
type FakeLayer = { url: string; source: ReturnType<typeof mockEmitter>; getSource: () => any; set: jest.Mock; get: jest.Mock; setOpacity: jest.Mock; setVisible: jest.Mock };
function useFakeTileLayers() {
  const made: FakeLayer[] = [];
  mockAlive.clear();
  // CRA resets mock implementations before each test.
  mockMap.removeLayer.mockImplementation((layer: any) => mockAlive.delete(layer));
  mockAddLayer.mockImplementation(async ({ tileUrl: url }: { tileUrl: string }) => {
    const source = mockEmitter();
    const layer: FakeLayer = { url, source, getSource: () => source, set: jest.fn(), get: jest.fn(), setOpacity: jest.fn(), setVisible: jest.fn() };
    made.push(layer); mockAlive.add(layer);
    return layer;
  });
  const at = (time: string) => made.filter((layer) => layer.url.includes(`time=${time}`));
  /** Loads one tile of the layer; the frame counts as drawn after the settle time. */
  const load = async (layer: FakeLayer) => {
    await act(async () => { layer.source.emit('tileloadstart'); layer.source.emit('tileloadend'); jest.advanceTimersByTime(80); });
  };
  return { made, at, load };
}
const T1 = '2026-01-01T00:00:00Z';
const T2 = '2026-02-01T00:00:00Z';

test('FR-VIEW-12: 1x는 시점당 1.5초, 속도별 최소 간격은 3000/1500/750/375ms', async () => {
  const { playbackInterval } = require('./frameBuffer');
  expect([0.5, 1, 2, 4].map(playbackInterval)).toEqual([3000, 1500, 750, 375]);
  jest.useFakeTimers();
  render(<Viewer />);
  await selectBaselineDataset();
  const slider = screen.getByRole('slider', { name: '관측 시점' });
  fireEvent.click(screen.getByRole('button', { name: '재생' }));
  await act(async () => { jest.advanceTimersByTime(1400); });
  expect(slider).toHaveValue('0');
  await act(async () => { jest.advanceTimersByTime(100); });
  expect(slider).toHaveValue('1');
});

test('FR-VIEW-12: 재생은 tile이 다 그려질 때까지 기다리고, 이전 시점은 새 시점이 그려진 뒤에 지운다', async () => {
  jest.useFakeTimers();
  const tiles = useFakeTileLayers();
  render(<Viewer />);
  await selectBaselineDataset();
  const slider = screen.getByRole('slider', { name: '관측 시점' });
  const [first] = tiles.at(T1);
  // Frame 1 still loading: playback waits beyond the interval and says so.
  fireEvent.click(screen.getByRole('button', { name: '재생' }));
  await act(async () => { first.source.emit('tileloadstart'); jest.advanceTimersByTime(2000); });
  expect(slider).toHaveValue('0');
  expect(screen.getByText('불러오는 중')).toHaveAttribute('role', 'status');
  await act(async () => { first.source.emit('tileloadend'); jest.advanceTimersByTime(80); });
  expect(slider).toHaveValue('1');
  expect(screen.queryByText('불러오는 중')).not.toBeInTheDocument();
  // No blank frame: the old layer stays until the new one has loaded (errors count as loaded).
  const [second] = tiles.at(T2);
  await act(async () => { second.source.emit('tileloadstart'); jest.advanceTimersByTime(300); });
  expect(mockAlive.has(first)).toBe(true);
  await act(async () => { second.source.emit('tileloaderror'); jest.advanceTimersByTime(80); });
  expect(mockAlive.has(first)).toBe(false);
  // Drawn before the interval: the next frame is prefetched hidden, then reused when playback advances.
  const prefetch = tiles.at(T1)[1];
  expect(prefetch.setOpacity).toHaveBeenLastCalledWith(0);
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(slider).toHaveValue('1');
  await act(async () => { jest.advanceTimersByTime(200); });
  expect(slider).toHaveValue('0');
  expect(tiles.at(T1)).toHaveLength(2);
  expect(prefetch.setOpacity).toHaveBeenLastCalledWith(1);
  expect(mockAlive.has(second)).toBe(true);
});

test('FR-VIEW-12: 빠르게 시점을 넘겨도 layer는 현재와 대기 중 하나씩만 남는다', async () => {
  jest.useFakeTimers();
  const tiles = useFakeTileLayers();
  render(<Viewer />);
  await selectBaselineDataset();
  await tiles.load(tiles.at(T1)[0]);
  for (let step = 0; step < 6; step += 1) {
    fireEvent.click(screen.getByRole('button', { name: step % 2 ? '이전 시점' : '다음 시점' }));
    await act(async () => { await Promise.resolve(); });
    expect(mockAlive.size).toBeLessThanOrEqual(2);
  }
  // The last step went back to the shown frame: only it remains.
  expect(screen.getByRole('slider', { name: '관측 시점' })).toHaveValue('0');
  expect(Array.from(mockAlive)).toEqual([tiles.at(T1)[0]]);
  expect(tiles.made.length).toBeGreaterThan(2);
});

test('FR-VIEW-12: 재생 중에만 다음 시점을 미리 불러오고, 일시정지하면 버린다', async () => {
  jest.useFakeTimers();
  const tiles = useFakeTileLayers();
  render(<Viewer />);
  await selectBaselineDataset();
  await tiles.load(tiles.at(T1)[0]);
  expect(tiles.at(T2)).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: '재생' }));
  await act(async () => { await Promise.resolve(); });
  const [prefetch] = tiles.at(T2);
  expect(mockAlive.has(prefetch)).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: '일시정지' }));
  await act(async () => { await Promise.resolve(); });
  expect(mockAlive.has(prefetch)).toBe(false);
  expect(Array.from(mockAlive)).toEqual([tiles.at(T1)[0]]);
});
