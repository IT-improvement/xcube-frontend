/* FIX4: state that must not outlive what it belongs to — the pixel graph follows the shown band and drops answers for
   another dataset; a comparison left on picks a time B of the new dataset; the dataset search starts empty again. */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('../../components/map', () => ({ __esModule: true, default: function MockMap({ onMapReady, onPixelSelect }: any) { const React = require('react'); React.useEffect(() => onMapReady(mockMap), [onMapReady]); return <button onClick={() => onPixelSelect([127.5, 36.0])}>OpenLayers map</button>; } }));
jest.mock('../../components/xcubeLayer', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../../api/aiApi', () => ({ ...jest.requireActual('../../api/aiApi'), aiApi: { listModels: jest.fn(), check: jest.fn(), createJob: jest.fn(), listJobs: jest.fn(), getJob: jest.fn(), getResult: jest.fn(), cancelJob: jest.fn(), retryJob: jest.fn() } }));
jest.mock('../../api', () => ({ activeViewerAdapter: { getProjects: jest.fn(), getDatasets: jest.fn(), getProjectDatasets: jest.fn(), getJobs: jest.fn(), runWaterExtraction: jest.fn() }, useMockApi: false }));
jest.mock('../../api/backofficeApi', () => ({ backofficeAdapter: { checkXcubeStatus: jest.fn(), getDatasetDetail: jest.fn(), tileUrl: jest.fn(), getTimeseries: jest.fn(), getProjectMembers: jest.fn(), getLinkableDatacubes: jest.fn() } }));
jest.mock('../../api/thumbnails', () => ({ cachedThumbnail: () => undefined, loadThumbnail: () => Promise.resolve({ state: 'failed' }), PENDING_RETRY_MS: 15000 }));
jest.mock('ol/proj', () => ({ toLonLat: (coordinate: any) => coordinate, transformExtent: (extent: any) => extent }));

const mockView = { getProjection: () => ({ getCode: () => 'EPSG:4326' }), getCenter: () => [127.5, 36.0], getResolution: () => 100, getZoom: () => 9, fit: jest.fn(), animate: jest.fn(), setCenter: jest.fn(), setResolution: jest.fn(), setZoom: jest.fn() };
const mockMap = { updateSize: jest.fn(), removeLayer: jest.fn(), getView: () => mockView, getCoordinateFromPixel: () => [127.5, 36.0], on: jest.fn(), un: jest.fn() };
const base = { projectId: '', subtitle: 'REGISTERED · AVAILABLE', accessType: 'OWNED', bbox: [127.3, 35.8, 127.7, 36.1] };
const times = ['2026-04-26T02:27:27Z', '2026-05-06T02:27:23Z', '2026-05-31T02:27:23Z'].map((iso) => ({ iso, label: iso.slice(0, 10) }));
const lake = { ...base, id: '86', name: '대청호', xcubeDatasetId: 'u4-d86', variables: ['blue', 'red'], defaultVariable: 'blue', times };
const island = { ...base, id: '71', name: '제주시', xcubeDatasetId: 'u4-d71', variables: ['b3'], defaultVariable: 'b3', times: ['2024-05-16T02:28:12Z', '2024-06-05T02:28:12Z'].map((iso) => ({ iso, label: iso.slice(0, 10) })) };

function setup() {
  const Viewer = require('.').default;
  const mockAddLayer = require('../../components/xcubeLayer').default as jest.Mock;
  const adapter = require('../../api').activeViewerAdapter as Record<string, jest.Mock>;
  const backoffice = require('../../api/backofficeApi').backofficeAdapter as Record<string, jest.Mock>;
  const aiService = require('../../api/aiApi').aiApi as Record<string, jest.Mock>;
  Object.values(backoffice).forEach((fn) => fn.mockReset());
  mockAddLayer.mockResolvedValue({ set: jest.fn(), get: jest.fn(), setOpacity: jest.fn(), setVisible: jest.fn(), setZIndex: jest.fn(), on: jest.fn(), un: jest.fn() });
  backoffice.checkXcubeStatus.mockResolvedValue(true);
  backoffice.tileUrl.mockImplementation((id: string, variable: string, time: string) => `http://x/tiles/${id}/${variable}/${time}/{z}/{y}/{x}`);
  backoffice.getDatasetDetail.mockImplementation((id: string) => Promise.resolve(id === '71' ? island : lake));
  adapter.getProjects.mockResolvedValue([]);
  adapter.getProjectDatasets.mockResolvedValue([]);
  adapter.getDatasets.mockResolvedValue([lake, island]);
  adapter.getJobs.mockResolvedValue([]);
  aiService.listModels.mockResolvedValue([]);
  aiService.listJobs.mockResolvedValue([]);
  Object.defineProperty(window, 'matchMedia', { writable: true, value: jest.fn().mockReturnValue({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() }) });
  return { Viewer, backoffice };
}
const series = (values: number[]) => times.map((time, index) => ({ time: time.iso, value: values[index] }));
async function pickDataset(name: RegExp) {
  fireEvent.click(screen.getByRole('button', { name: /^데이터 또는 Zarr 선택/ }));
  fireEvent.click(await screen.findByRole('option', { name }));
}

afterEach(() => window.history.replaceState(null, '', '/'));

test('픽셀을 고른 뒤 밴드를 바꾸면 그 밴드로 다시 읽는다(그래프 이름과 값이 맞음)', async () => {
  const { Viewer, backoffice } = setup();
  backoffice.getTimeseries.mockImplementation((_id: string, variable: string) => Promise.resolve(series(variable === 'red' ? [3030, 2900, 2800] : [1980, 1700, 1250])));
  window.history.replaceState(null, '', '/app/viewer?dataset=86&var=blue');
  render(<Viewer initialDatasetId="86" />);
  await screen.findByRole('heading', { name: /대청호/ });
  fireEvent.click(screen.getByRole('button', { name: '픽셀 값 조회' }));
  fireEvent.click(screen.getByRole('button', { name: 'OpenLayers map' }));
  expect(await screen.findByRole('img', { name: /시계열 그래프.*최소 1250, 최대 1980/ })).toBeInTheDocument();

  fireEvent.click(within(screen.getByRole('navigation', { name: '도구' })).getByRole('button', { name: '레이어' }));
  fireEvent.click(screen.getByRole('button', { name: 'red' }));
  await waitFor(() => expect(backoffice.getTimeseries).toHaveBeenLastCalledWith('86', 'red', expect.objectContaining({ lon: 127.5, lat: 36.0 })));
  expect(await screen.findByRole('img', { name: /시계열 그래프.*최소 2800, 최대 3030/ })).toBeInTheDocument();
});

test('다른 데이터로 바꾼 뒤 늦게 온 앞 데이터의 픽셀 시계열은 버린다', async () => {
  const { Viewer, backoffice } = setup();
  let answer: (value: unknown) => void = () => undefined;
  backoffice.getTimeseries.mockImplementation(() => new Promise((resolve) => { answer = resolve; }));
  window.history.replaceState(null, '', '/app/viewer?dataset=86&var=blue');
  render(<Viewer initialDatasetId="86" />);
  await screen.findByRole('heading', { name: /대청호/ });
  fireEvent.click(screen.getByRole('button', { name: '픽셀 값 조회' }));
  fireEvent.click(screen.getByRole('button', { name: 'OpenLayers map' }));
  await waitFor(() => expect(backoffice.getTimeseries).toHaveBeenCalledTimes(1));

  await pickDataset(/제주시/);
  await screen.findByRole('heading', { name: /제주시/ });
  await act(async () => answer(series([1980, 1700, 1250])));
  expect(screen.queryByRole('img', { name: /시계열 그래프/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '픽셀 선택 지우기' })).not.toBeInTheDocument();
});

test('스와이프를 켠 채 데이터를 바꾸면 새 데이터의 B 시점을 고른다("—"로 남지 않음)', async () => {
  const { Viewer } = setup();
  window.history.replaceState(null, '', '/app/viewer?dataset=86');
  render(<Viewer initialDatasetId="86" />);
  await screen.findByRole('heading', { name: /대청호/ });
  fireEvent.click(screen.getByRole('button', { name: /스와이프/ }));
  expect(await screen.findByText('2026-05-06', { selector: '.vx-maplabel--b span' })).toBeInTheDocument();

  await pickDataset(/제주시/);
  await screen.findByRole('heading', { name: /제주시/ });
  expect(await screen.findByText('2024-06-05', { selector: '.vx-maplabel--b span' })).toBeInTheDocument();
  expect(window.location.search).toContain(`b=${encodeURIComponent('2024-06-05T02:28:12Z')}`);
});

test('데이터 고르기 창을 그냥 닫으면 검색어를 비우고 다시 열 때 전체 목록이 나온다', async () => {
  const { Viewer } = setup();
  render(<Viewer />);
  fireEvent.click(await screen.findByRole('button', { name: /^데이터 또는 Zarr 선택/ }));
  fireEvent.change(await screen.findByRole('combobox', { name: 'Zarr 검색' }), { target: { value: '제주' } });
  expect(screen.queryByRole('option', { name: /대청호/ })).not.toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Zarr 검색' }), { key: 'Escape' });
  fireEvent.click(screen.getByRole('button', { name: /^데이터 또는 Zarr 선택/ }));
  expect(await screen.findByRole('combobox', { name: 'Zarr 검색' })).toHaveValue('');
  expect(screen.getByRole('option', { name: /대청호/ })).toBeInTheDocument();
});
