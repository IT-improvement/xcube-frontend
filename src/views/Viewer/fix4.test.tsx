/* FIX4: the area drawn for 영역 통계 belongs to that tool (shared only with 내보내기). Leaving it stops a drawing in
   progress; closing the panel or moving to another tool clears the shape, its legend and the answer, and drops a
   query still running. Also: Esc while drawing cancels only the drawing, a cancelled redraw keeps the old shape. */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import Viewer from '.';
import { areaStatsApi } from '../../api/areaStats';

jest.mock('../../components/map', () => ({ __esModule: true, default: function MockMap({ onMapReady }: any) { const React = require('react'); React.useEffect(() => onMapReady(mockMap), [onMapReady]); return <div>OpenLayers map</div>; } }));
jest.mock('../../components/xcubeLayer', () => ({ __esModule: true, default: jest.fn().mockResolvedValue(undefined) }));
jest.mock('ol/proj', () => ({ toLonLat: (coordinate: [number, number]) => coordinate, transformExtent: (extent: number[]) => extent }));
jest.mock('../../api', () => { const actual = jest.requireActual('../../api/viewerAdapter'); return { activeViewerAdapter: actual.viewerAdapter, useMockApi: true }; });
// OpenLayers' drawing pieces are ES modules jest does not load; small stand-ins with the same surface (as fx.test).
jest.mock('./areaDrawOl', () => {
  const handlers: Record<string, (event: any) => void> = {};
  class Source { features: unknown[] = []; clear() { this.features = []; } addFeature(feature: unknown) { this.features.push(feature); } }
  class Layer { constructor(public mockOptions: any) {} setStyle() {} }
  class Draw { abortDrawing = jest.fn(); constructor(public mockOptions: any) {} on(name: string, handler: (event: any) => void) { handlers[name] = handler; } }
  class DoubleClickZoom { setActive = jest.fn(); }
  return {
    __esModule: true,
    handlers,
    VectorSource: Source,
    VectorLayer: Layer,
    Draw,
    DoubleClickZoom,
    Feature: class { constructor(public mockGeometry: unknown) {} },
    createBox: () => 'box',
    fromExtent: (extent: number[]) => ({ extent }),
    styleFor: () => [],
    geometryFacts: () => ({ geo: { type: 'Polygon', coordinates: [[[127, 36], [127.1, 36], [127.1, 36.1], [127, 36]]] }, areaKm2: 12.5 }),
  };
});

const mockView = {
  getProjection: () => ({ getCode: () => 'EPSG:4326' }), calculateExtent: () => [127, 36, 127.2, 36.2], getCenter: () => [127.1, 36.1],
  getResolution: () => 100, getZoom: () => 9, fit: jest.fn(), animate: jest.fn(), setCenter: jest.fn(), setResolution: jest.fn(),
};
const mockMap = {
  addLayer: jest.fn(), removeLayer: jest.fn(), addInteraction: jest.fn(), removeInteraction: jest.fn(), getInteractions: () => ({ forEach: () => undefined }),
  getView: () => mockView, getSize: () => [800, 600], updateSize: jest.fn(), on: jest.fn(), un: jest.fn(), render: jest.fn(),
};

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({ matches: false, media: query, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false }),
  });
  window.history.replaceState(null, '', '/app/viewer');
  mockMap.addInteraction.mockClear();
  mockMap.removeInteraction.mockClear();
});
afterEach(() => jest.restoreAllMocks());

const rail = () => within(screen.getByRole('navigation', { name: '도구' }));
const areaLegend = () => screen.queryByRole('group', { name: /^그린 영역, 약/ });
async function openWithArea() {
  render(<Viewer initialDatasetId="landsat" />);
  await screen.findByRole('heading', { name: /Landsat-8 · 2024/ });
  fireEvent.click(rail().getByRole('button', { name: '영역 통계' }));
  const take = await screen.findByRole('button', { name: '지금 화면' });
  await waitFor(() => expect(take).toBeEnabled());
  fireEvent.click(take);
  await waitFor(() => expect(areaLegend()).toBeInTheDocument());
}

test('영역 통계를 닫으면(도구 막대 다시 누르기·닫기·Esc) 그린 영역·범례가 지워지고, 다시 열면 처음부터다', async () => {
  await openWithArea();
  fireEvent.click(rail().getByRole('button', { name: '영역 통계' }));
  await waitFor(() => expect(areaLegend()).not.toBeInTheDocument());
  fireEvent.click(rail().getByRole('button', { name: '영역 통계' }));
  expect(await screen.findByText('먼저 지도에 영역을 그리세요.')).toBeInTheDocument();
  expect(screen.queryByText('화면 범위 영역')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '지금 화면' }));
  await waitFor(() => expect(areaLegend()).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
  await waitFor(() => expect(areaLegend()).not.toBeInTheDocument());

  fireEvent.click(rail().getByRole('button', { name: '영역 통계' }));
  fireEvent.click(await screen.findByRole('button', { name: '지금 화면' }));
  await waitFor(() => expect(areaLegend()).toBeInTheDocument());
  fireEvent.keyDown(screen.getByRole('button', { name: '지금 화면' }), { key: 'Escape' });
  await waitFor(() => expect(areaLegend()).not.toBeInTheDocument());
});

test('영역 통계 → 내보내기는 그린 영역을 함께 쓰고, 레이어로 가거나 내보내기를 닫으면 지운다', async () => {
  await openWithArea();
  fireEvent.click(rail().getByRole('button', { name: '내보내기' }));
  expect(await screen.findByRole('button', { name: '그린 영역' })).toBeEnabled();
  expect(areaLegend()).toBeInTheDocument();
  fireEvent.click(rail().getByRole('button', { name: '영역 통계' }));
  expect(await screen.findByText('화면 범위 영역')).toBeInTheDocument();

  fireEvent.click(rail().getByRole('button', { name: '레이어' }));
  await waitFor(() => expect(areaLegend()).not.toBeInTheDocument());

  fireEvent.click(rail().getByRole('button', { name: '영역 통계' }));
  fireEvent.click(await screen.findByRole('button', { name: '지금 화면' }));
  await waitFor(() => expect(areaLegend()).toBeInTheDocument());
  fireEvent.click(rail().getByRole('button', { name: '내보내기' }));
  fireEvent.click(rail().getByRole('button', { name: '내보내기' }));
  await waitFor(() => expect(areaLegend()).not.toBeInTheDocument());
});

test('그리는 중 다른 도구로 가면 그리기가 멈추고, Esc는 그리기만 취소한다(창은 그대로)', async () => {
  render(<Viewer initialDatasetId="landsat" />);
  await screen.findByRole('heading', { name: /Landsat-8 · 2024/ });
  fireEvent.click(rail().getByRole('button', { name: '영역 통계' }));
  const polygon = await screen.findByRole('button', { name: '다각형' });
  await waitFor(() => expect(polygon).toBeEnabled());

  fireEvent.click(polygon);
  expect(mockMap.addInteraction).toHaveBeenCalledTimes(1);
  const draw = mockMap.addInteraction.mock.calls[0][0];
  fireEvent.keyDown(polygon, { key: 'Escape' });
  expect(draw.abortDrawing).toHaveBeenCalled();
  expect(mockMap.removeInteraction).toHaveBeenCalledWith(draw);
  expect(screen.getByRole('heading', { name: '영역 통계' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '다각형' }));
  const second = mockMap.addInteraction.mock.calls[1][0];
  fireEvent.click(rail().getByRole('button', { name: 'AI 수체 추출' }));
  expect(second.abortDrawing).toHaveBeenCalled();
  expect(mockMap.removeInteraction).toHaveBeenCalledWith(second);
});

test('계산 중에 영역 통계를 떠나면 요청을 끊고, 늦게 온 답이나 오류가 나타나지 않는다', async () => {
  let signal: AbortSignal | undefined;
  let answer: (value: any) => void = () => undefined;
  const get = jest.spyOn(areaStatsApi, 'get').mockImplementation((_id, _body, given) => {
    signal = given;
    return new Promise((resolve) => { answer = resolve; });
  });
  await openWithArea();
  fireEvent.click(screen.getByRole('button', { name: '계산하기' }));
  expect(await screen.findByRole('button', { name: '계산하는 중…' })).toBeDisabled();
  expect(get).toHaveBeenCalledTimes(1);

  fireEvent.click(rail().getByRole('button', { name: '레이어' }));
  expect(signal?.aborted).toBe(true);
  await act(async () => answer({ datasetId: 'landsat', variable: 'NDWI', areaKm2: 12.5, series: [{ time: 't', mean: 0.5, min: 0, max: 1, std: 0.1, validCount: 1, validAreaKm2: 1 }] }));
  fireEvent.click(rail().getByRole('button', { name: '영역 통계' }));
  expect(await screen.findByRole('button', { name: '계산하기' })).toBeDisabled();
  expect(screen.queryByText(/^결과 · /)).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('다시 그리다 취소하면 앞서 그린 도형이 그대로 남는다(지도·범례·패널이 같다)', async () => {
  await openWithArea();
  const source = mockMap.addLayer.mock.calls[mockMap.addLayer.mock.calls.length - 1][0].mockOptions.source;
  expect(source.features).toHaveLength(1);
  const { handlers } = jest.requireMock('./areaDrawOl');
  fireEvent.click(screen.getByRole('button', { name: '다각형' }));
  // The first click of a new polygon used to clear the old shape from the map while its legend stayed.
  act(() => handlers.drawstart?.({}));
  fireEvent.click(screen.getByRole('button', { name: '그리기 취소' }));
  expect(source.features).toHaveLength(1);
  expect(areaLegend()).toBeInTheDocument();
  expect(screen.getByText('화면 범위 영역')).toBeInTheDocument();
});

test('결과 비교를 닫기 버튼이나 Esc로 닫아도 도구 막대로 닫을 때처럼 AI 결과 레이어·범례가 내려간다', async () => {
  render(<Viewer initialDatasetId="landsat" />);
  await screen.findByRole('heading', { name: /Landsat-8 · 2024/ });
  await screen.findByLabelText(/AI 결과 \d+개/);
  const aiLegend = () => screen.queryByRole('group', { name: 'AI 결과 범례' });
  fireEvent.click(rail().getByRole('button', { name: /결과 비교/ }));
  await waitFor(() => expect(aiLegend()).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
  await waitFor(() => expect(aiLegend()).not.toBeInTheDocument());

  fireEvent.click(rail().getByRole('button', { name: /결과 비교/ }));
  await waitFor(() => expect(aiLegend()).toBeInTheDocument());
  fireEvent.keyDown(screen.getByRole('heading', { name: '결과 비교' }), { key: 'Escape' });
  await waitFor(() => expect(aiLegend()).not.toBeInTheDocument());
});
