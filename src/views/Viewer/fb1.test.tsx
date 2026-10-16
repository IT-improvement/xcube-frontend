/* FB1 §1 default layer (`?var=` > RGB > first non-auxiliary band > first band) and §3 picker facts and filter. */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { defaultLayer, isAuxiliary } from './defaultLayer';

jest.mock('../../components/map', () => ({ __esModule: true, default: function MockMap({ onMapReady }: any) { const React = require('react'); React.useEffect(() => onMapReady(mockMap), [onMapReady]); return <div>OpenLayers map</div>; } }));
jest.mock('../../components/xcubeLayer', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../../api/aiApi', () => ({ ...jest.requireActual('../../api/aiApi'), aiApi: { listModels: jest.fn(), check: jest.fn(), createJob: jest.fn(), listJobs: jest.fn(), getJob: jest.fn(), cancelJob: jest.fn(), retryJob: jest.fn() } }));
jest.mock('../../api', () => ({ activeViewerAdapter: { getProjects: jest.fn(), getDatasets: jest.fn(), getProjectDatasets: jest.fn(), getJobs: jest.fn(), runWaterExtraction: jest.fn() }, useMockApi: false }));
jest.mock('../../api/backofficeApi', () => ({ backofficeAdapter: { checkXcubeStatus: jest.fn(), getDatasetDetail: jest.fn(), tileUrl: jest.fn(), getTimeseries: jest.fn(), getProjectMembers: jest.fn(), getLinkableDatacubes: jest.fn() } }));
jest.mock('../../api/thumbnails', () => ({ cachedThumbnail: () => undefined, loadThumbnail: () => Promise.resolve({ state: 'failed' }), PENDING_RETRY_MS: 15000 }));
jest.mock('ol/proj', () => ({ toLonLat: (coordinate: any) => coordinate }));

const mockView = { getProjection: () => ({ getCode: () => 'EPSG:4326' }), getCenter: () => [126.5, 33.5], getResolution: () => 100, getZoom: () => 9, fit: jest.fn(), animate: jest.fn(), setCenter: jest.fn(), setResolution: jest.fn(), setZoom: jest.fn() };
const mockMap = { updateSize: jest.fn(), removeLayer: jest.fn(), getView: () => mockView, on: jest.fn(), un: jest.fn() };

const times = (count: number) => Array.from({ length: count }, (_, index) => ({ iso: `2024-${String(8 + index).padStart(2, '0')}-14T02:00:00Z`, label: `2024. ${8 + index}. 14.` }));
const base = { projectId: '', subtitle: 'REGISTERED · AVAILABLE', defaultVariable: '', accessType: 'OWNED', bbox: [126, 33, 127, 34] };
const rgbScene = { ...base, id: '70', name: '제주 CAS500', xcubeDatasetId: 'u8-d70', variables: ['blue', 'green', 'nir', 'red'], rgbAvailable: true, defaultVariable: 'blue', times: times(5) };
const aoiScene = { ...base, id: '71', name: '제주시 경계 S2', xcubeDatasetId: 'u8-d71', variables: ['aoi_mask', 'b3', 'b8'], defaultVariable: 'aoi_mask', times: times(1) };

describe('기본 레이어 규칙', () => {
  test('RGB를 만들 수 있으면 RGB, 서버 defaultVariable은 쓰지 않는다', () => {
    expect(defaultLayer({ variables: ['blue', 'green', 'red'], rgbAvailable: true })).toBe('rgb');
    expect(defaultLayer({ variables: ['B2', 'B3', 'B4'], rgbBands: ['B4', 'B3', 'B2'] })).toBe('rgb');
    expect(defaultLayer({ variables: ['Blue', 'Green', 'Red'] })).toBe('rgb');
  });
  test('RGB가 없으면 보조 band를 건너뛴 첫 band, 모두 보조면 첫 band', () => {
    expect(defaultLayer({ variables: ['aoi_mask', 'b3', 'b8'] })).toBe('b3');
    expect(defaultLayer({ variables: ['water_gt', 'vv', 'vh'] })).toBe('vv');
    expect(defaultLayer({ variables: ['scl', 'nir'] })).toBe('nir');
    expect(defaultLayer({ variables: ['qa_pixel', 'swir'] })).toBe('swir');
    expect(defaultLayer({ variables: ['landuse', 'ndvi'], variableMetadata: { landuse: { colorBarNorm: 'cat' } } })).toBe('ndvi');
    // A categorical band is the image when nothing continuous is there.
    expect(defaultLayer({ variables: ['aoi_mask', 'scl'] })).toBe('scl');
    expect(defaultLayer({ variables: ['aoi_mask'] })).toBe('aoi_mask');
    expect(defaultLayer({ variables: [] })).toBe('');
    expect(isAuxiliary({ variables: ['scl'] }, 'scl')).toBe(false);
  });
  test('주소의 ?var= 값이 있으면 그것이 먼저, 없는 값이면 규칙대로', () => {
    expect(defaultLayer({ variables: ['blue', 'green', 'red'], rgbAvailable: true }, 'red')).toBe('red');
    expect(defaultLayer({ variables: ['aoi_mask', 'b3'] }, 'aoi_mask')).toBe('aoi_mask');
    expect(defaultLayer({ variables: ['aoi_mask', 'b3'] }, 'nope')).toBe('b3');
    expect(defaultLayer({ variables: ['b3'] }, 'rgb')).toBe('b3');
  });
});

describe('Viewer', () => {
  const Viewer = require('.').default;
  const mockAddLayer = require('../../components/xcubeLayer').default as jest.Mock;
  const adapter = require('../../api').activeViewerAdapter as Record<string, jest.Mock>;
  const backoffice = require('../../api/backofficeApi').backofficeAdapter as Record<string, jest.Mock>;
  const aiService = require('../../api/aiApi').aiApi as Record<string, jest.Mock>;
  const tileVariables = () => backoffice.tileUrl.mock.calls.map((call) => call[1]);

  beforeEach(() => {
    jest.clearAllMocks();
    mockAddLayer.mockResolvedValue({ set: jest.fn(), get: jest.fn(), setOpacity: jest.fn(), setVisible: jest.fn(), on: jest.fn(), un: jest.fn() });
    backoffice.checkXcubeStatus.mockResolvedValue(true);
    backoffice.tileUrl.mockImplementation((id: string, variable: string) => `http://x/tiles/${id}/${variable}/{z}/{y}/{x}`);
    backoffice.getDatasetDetail.mockImplementation((id: string) => Promise.resolve(id === '70' ? rgbScene : aoiScene));
    adapter.getProjects.mockResolvedValue([]);
    adapter.getDatasets.mockResolvedValue([rgbScene, aoiScene]);
    adapter.getProjectDatasets.mockResolvedValue([]);
    adapter.getJobs.mockResolvedValue([]);
    aiService.listJobs.mockResolvedValue([]);
    Object.defineProperty(window, 'matchMedia', { writable: true, value: jest.fn().mockReturnValue({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() }) });
  });
  afterEach(() => window.history.replaceState(null, '', '/'));

  test('RGB가 있는 데이터는 RGB로 열리고, 다른 데이터로 바꾸면 그 데이터에도 같은 규칙(보조 band 건너뜀)', async () => {
    window.history.replaceState(null, '', '/app/viewer?dataset=70');
    render(<Viewer initialDatasetId="70" />);
    await waitFor(() => expect(tileVariables()).toContain('rgb'));
    expect(tileVariables()).not.toContain('blue');
    await waitFor(() => expect(window.location.search).toContain('var=rgb'));
    fireEvent.click(screen.getByRole('button', { name: /^데이터 또는 Zarr 선택/ }));
    fireEvent.click(await screen.findByRole('option', { name: /제주시 경계 S2/ }));
    await waitFor(() => expect(tileVariables().at(-1)).toBe('b3'));
    expect(tileVariables()).not.toContain('aoi_mask');
  });

  test('주소의 var가 규칙보다 먼저다', async () => {
    window.history.replaceState(null, '', '/app/viewer?dataset=70&var=nir');
    render(<Viewer initialDatasetId="70" />);
    await waitFor(() => expect(tileVariables()).toContain('nir'));
    expect(tileVariables()).not.toContain('rgb');
  });

  test('데이터 고르기: 줄마다 미리보기·종류·시계열/단일·기간·band 수, 위에 시계열/단일 시점 구분', async () => {
    render(<Viewer />);
    fireEvent.click(await screen.findByRole('button', { name: /^데이터 또는 Zarr 선택/ }));
    const list = await screen.findByRole('listbox');
    const series = within(list).getByRole('option', { name: /제주 CAS500/ });
    expect(series).toHaveTextContent('원본');
    expect(series).toHaveTextContent('시계열 5시점');
    expect(series).toHaveTextContent('2024.08–2024.12');
    expect(series).toHaveTextContent('band 4개');
    expect(series.querySelector('.thumb')).not.toBeNull();
    const single = within(list).getByRole('option', { name: /제주시 경계 S2/ });
    expect(single).toHaveTextContent('단일 시점');
    expect(single).toHaveTextContent('2024.08.14');
    const filter = screen.getByRole('group', { name: '시점 수' });
    fireEvent.click(within(filter).getByRole('button', { name: /단일 시점/ }));
    expect(within(list).queryByRole('option', { name: /제주 CAS500/ })).not.toBeInTheDocument();
    expect(within(list).getByRole('option', { name: /제주시 경계 S2/ })).toBeInTheDocument();
    fireEvent.click(within(filter).getByRole('button', { name: /시계열/ }));
    expect(within(list).getByRole('option', { name: /제주 CAS500/ })).toBeInTheDocument();
    expect(within(list).queryByRole('option', { name: /제주시 경계 S2/ })).not.toBeInTheDocument();
  });
});
