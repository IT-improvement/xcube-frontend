// UR-63 F1–F3 and UX2 in the Viewer: the area-stats panel (drawing → request → numbers, chart, CSV), the map PNG
// sheet, the export job flow and comparison results (class legend, metrics, the S9 entry).
import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import Viewer from '.';
import AreaStatsPanel from './AreaStatsPanel';
import ExportPanel from './ExportPanel';
import { niceScale, paintSheet, pngFileName } from './mapPng';
import { shapeFrom, useAreaDraw } from './areaDraw';
import type { AreaShape } from './areaDraw';
import { areaStatsApi, areaStatsCsv, normalizeAreaStats, timesFor } from '../../api/areaStats';
import { exportsApi, fileNameFrom } from '../../api/exports';
import { compareApi, comparisonForDataset, comparisonInfo, comparisonStyle, comparisonTypeFromColorBar, compareHref } from '../../api/compare';
import { ApiError } from '../../api/httpClient';

jest.mock('../../components/map', () => ({ __esModule: true, default: () => <div>지도</div> }));
jest.mock('../../components/xcubeLayer', () => ({ __esModule: true, default: jest.fn().mockResolvedValue(undefined) }));
jest.mock('ol/proj', () => ({ toLonLat: (coordinate: [number, number]) => coordinate }));
jest.mock('../../api', () => { const actual = jest.requireActual('../../api/viewerAdapter'); return { activeViewerAdapter: actual.viewerAdapter, useMockApi: true }; });
// OpenLayers' drawing pieces are ES modules jest does not load; the hook gets small stand-ins with the same surface.
jest.mock('./areaDrawOl', () => {
  const handlers: Record<string, (event: any) => void> = {};
  class Source { features: unknown[] = []; clear() { this.features = []; } addFeature(feature: unknown) { this.features.push(feature); } }
  class Layer { mockOptions: any; constructor(mockArgs: any) { this.mockOptions = mockArgs; } setStyle() {} }
  class Draw { abortDrawing = jest.fn(); mockOptions: any; constructor(mockArgs: any) { this.mockOptions = mockArgs; } on(name: string, handler: (event: any) => void) { handlers[name] = handler; } }
  class DoubleClickZoom { setActive = jest.fn(); }
  return {
    __esModule: true,
    handlers,
    VectorSource: Source,
    VectorLayer: Layer,
    Draw,
    DoubleClickZoom,
    Feature: class { mockGeometry: unknown; constructor(mockArgs: unknown) { this.mockGeometry = mockArgs; } },
    createBox: () => 'box',
    fromExtent: (extent: number[]) => ({ extent }),
    styleFor: () => [],
    geometryFacts: () => ({ geo: { type: 'Polygon', coordinates: [[[127, 36], [127.1, 36], [127.1, 36.1], [127, 36]]] }, areaKm2: 12.5 }),
  };
});

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({ matches: false, media: query, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false }),
  });
  window.history.replaceState(null, '', '/app/viewer');
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

const times = [
  { iso: '2024-08-14T00:00:00Z', label: '2024. 8. 14.' },
  { iso: '2024-09-01T00:00:00Z', label: '2024. 9. 1.' },
  { iso: '2024-10-03T00:00:00Z', label: '2024. 10. 3.' },
];
const shape: AreaShape = shapeFrom({ type: 'Polygon', coordinates: [[[127.4, 36.4], [127.5, 36.4], [127.5, 36.5], [127.4, 36.4]]] }, 31.2, 'polygon');
const targets = [
  { key: 'source', label: '원본 영상', datasetId: '86', variables: ['ndwi', 'red'], variable: 'ndwi', water: false },
  { key: 'ai', label: 'AI 수체 결과', datasetId: '87', variables: ['water_mask'], variable: 'water_mask', water: true },
];
const panelProps = { targets, times, currentIndex: 1, onTimeIndex: jest.fn(), drawing: null, canDraw: true, onDraw: jest.fn(), onCancelDraw: jest.fn(), onUseView: jest.fn(), onClear: jest.fn(), fileBase: '대청호' };

describe('F1 영역 통계', () => {
  test('그리기 hook: 다각형을 그리면 EPSG:4326 도형·면적·꼭짓점 수가 생기고, Esc는 그리기를 취소한다', async () => {
    const interactions: unknown[] = [];
    const map: any = {
      addLayer: jest.fn(), removeLayer: jest.fn(), addInteraction: jest.fn((item) => interactions.push(item)), removeInteraction: jest.fn(),
      getInteractions: () => ({ forEach: () => undefined }), getView: () => ({ getProjection: () => ({ getCode: () => 'EPSG:3857' }) }),
    };
    const { result } = renderHook(() => useAreaDraw(map, '#b8166f'));
    await waitFor(() => expect(result.current.available).toBe(true));
    expect(map.addLayer).toHaveBeenCalledTimes(1);
    act(() => result.current.start('polygon'));
    expect(result.current.drawing).toBe('polygon');
    expect((interactions[0] as any).mockOptions.type).toBe('Polygon');
    const { handlers } = jest.requireMock('./areaDrawOl');
    act(() => handlers.drawend({ feature: { getGeometry: () => ({}) } }));
    expect(result.current.drawing).toBeNull();
    expect(result.current.shape).toMatchObject({ kind: 'polygon', areaKm2: 12.5, vertices: 4, bbox: [127, 36, 127.1, 36.1] });
    act(() => result.current.start('rect'));
    expect((interactions[1] as any).mockOptions).toMatchObject({ type: 'Circle', geometryFunction: 'box' });
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(result.current.drawing).toBeNull();
    expect((interactions[1] as any).abortDrawing).toHaveBeenCalled();
    act(() => result.current.clear());
    expect(result.current.shape).toBeNull();
  });

  test('영역을 그리면 계산 요청에 도형·밴드·시점을 보내고, 숫자·그래프·표·CSV를 보인다', async () => {
    const get = jest.spyOn(areaStatsApi, 'get').mockResolvedValue(normalizeAreaStats({
      datasetId: 86, variable: 'ndwi', units: '1', areaKm2: 31.24,
      series: [
        { time: times[0].iso, mean: 0.21, min: -0.4, max: 0.71, std: 0.12, validCount: 900, validAreaKm2: 30.1 },
        { time: times[1].iso, mean: 0.18, min: -0.39, max: 0.69, std: 0.11, validCount: 880, validAreaKm2: 29.8 },
        { time: times[2].iso, mean: null, min: null, max: null, std: null, validCount: 0, validAreaKm2: 0 },
      ],
    }, { datasetId: '86', variable: 'ndwi' }));
    const { rerender } = render(<AreaStatsPanel {...panelProps} shape={null} />);
    // VX1: no calculate button until there is an area; the next step is said instead.
    expect(screen.queryByRole('button', { name: '계산하기' })).not.toBeInTheDocument();
    expect(screen.getByText('먼저 지도에 영역을 그리세요.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다각형' }));
    expect(panelProps.onDraw).toHaveBeenCalledWith('polygon');
    // A finished shape is measured right away (no extra press).
    rerender(<AreaStatsPanel {...panelProps} shape={shape} />);
    expect(screen.getByText('다각형 영역')).toBeInTheDocument();
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(get).toHaveBeenCalledWith('86', { geometry: shape.geometry, variable: 'ndwi', times: 'all' }, expect.any(AbortSignal));
    // The shown time (index 1) leads the numbers; the chart and table carry every time.
    expect(await screen.findByText('2024. 9. 1.', { selector: '.vx-stats__at' })).toBeInTheDocument();
    const grid = screen.getAllByRole('definition').map((item) => item.textContent);
    expect(grid).toEqual(expect.arrayContaining(['0.18', '0.11', '-0.39', '0.69']));
    expect(screen.getByRole('img', { name: /영역 평균 시계열 그래프, 3개 시점 중 값 있음 2개/ })).toBeInTheDocument();
    fireEvent.click(screen.getByText('표로 보기'));
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(4);
    // CSV: a file is saved with the dataset name.
    const created: Blob[] = [];
    URL.createObjectURL = jest.fn((blob: Blob) => { created.push(blob); return 'blob:csv'; }) as any;
    URL.revokeObjectURL = jest.fn();
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { expect(this.download).toBe('대청호_영역통계_ndwi.csv'); });
    fireEvent.click(screen.getByRole('button', { name: 'CSV' }));
    expect(click).toHaveBeenCalled();
    expect(created[0].type).toContain('text/csv');
  });

  test('AI 결과를 고르면 water_mask로 물 면적을 계산하고, 지금 시점만 고르면 그 시점만 보낸다', async () => {
    const get = jest.spyOn(areaStatsApi, 'get').mockResolvedValue({
      datasetId: '87', variable: 'water_mask', areaKm2: 31.24, series: [{ time: times[1].iso, mean: 0.41, min: 0, max: 1, std: 0.49, validCount: 900, validAreaKm2: 30 }],
      waterAreaKm2: [{ time: times[1].iso, km2: 12.81, ratio: 0.41 }],
    });
    render(<AreaStatsPanel {...panelProps} shape={shape} />);
    fireEvent.click(screen.getByRole('button', { name: 'AI 수체 결과' }));
    expect(screen.getByText(/물로 판정한 면적/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '지금 시점만' }));
    fireEvent.click(screen.getByRole('button', { name: '계산하기' }));
    await waitFor(() => expect(get).toHaveBeenCalledWith('87', { geometry: shape.geometry, variable: 'water_mask', times: [times[1].iso] }, expect.any(AbortSignal)));
    expect(await screen.findByText('물 면적')).toBeInTheDocument();
    const values = screen.getAllByRole('definition').map((item) => item.textContent);
    expect(values).toEqual(expect.arrayContaining(['12.81 km²', '41.0%']));
  });

  test('서버 오류 코드는 무엇을 고치면 되는지 말한다', async () => {
    jest.spyOn(areaStatsApi, 'get').mockRejectedValue(new ApiError(400, 'GEOMETRY_OUTSIDE_DATA', 'outside'));
    render(<AreaStatsPanel {...panelProps} shape={shape} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('영역이 데이터 범위와 겹치지 않습니다. 영상이 있는 곳에 그려 주세요.');
  });

  test('일부 시점만 지도 서버가 답하지 않으면 그 줄만 비고 몇 개인지 말한다', async () => {
    jest.spyOn(areaStatsApi, 'get').mockResolvedValue(normalizeAreaStats({
      datasetId: 86, variable: 'ndwi', areaKm2: 31.2,
      series: [
        { time: times[0].iso, mean: 0.2, min: 0, max: 1, std: 0.1, validCount: 9, validAreaKm2: 30, error: null },
        { time: times[1].iso, mean: null, min: null, max: null, std: null, validCount: null, validAreaKm2: null, error: 'XCUBE_TIMEOUT' },
      ],
    }, { datasetId: '86', variable: 'ndwi' }));
    render(<AreaStatsPanel {...panelProps} shape={shape} />);
    expect(await screen.findByText(/1개 시점은 지도 서버가 제때 답하지 않아/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('표로 보기'));
    expect(screen.getByRole('cell', { name: '응답 없음' })).toBeInTheDocument();
  });

  test('CSV와 시점 제한', () => {
    const csv = areaStatsCsv(
      { datasetId: '87', variable: 'water_mask', areaKm2: 1, series: [{ time: 't1', mean: 0.5, min: 0, max: 1, std: 0.5, validCount: 10, validAreaKm2: 0.9 }], waterAreaKm2: [{ time: 't1', km2: 0.45, ratio: 0.5 }] },
      { time: '시점', mean: '평균', min: '최솟값', max: '최댓값', std: '표준편차', validCount: '유효 픽셀 수', validArea: '유효 면적(km²)', waterArea: '물 면적(km²)', waterRatio: '물 비율' },
    );
    expect(csv.startsWith('﻿시점,평균,최솟값,최댓값,표준편차,유효 픽셀 수,유효 면적(km²),물 면적(km²),물 비율\n')).toBe(true);
    expect(csv).toContain('t1,0.5,0,1,0.5,10,0.9,0.45,0.5');
    expect(timesFor(['a', 'b'])).toBe('all');
    const many = Array.from({ length: 130 }, (_, index) => `t${index}`);
    expect(timesFor(many)).toEqual(many.slice(10));
  });

  test('Viewer: 영역 통계 탭은 데이터를 고르면 열리고, 그리기 버튼과 계산 대상(원본·AI 결과)을 보인다', async () => {
    render(<Viewer initialDatasetId="landsat" />);
    await screen.findByRole('region', { name: '시계열 탐색기' });
    await screen.findByLabelText(/AI 결과 [1-9]\d*개/);
    fireEvent.click(screen.getByRole('button', { name: '영역 통계' }));
    const panel = screen.getByRole('complementary', { name: '영역 통계' });
    expect(within(panel).getByRole('group', { name: '영역 그리기' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: '원본 영상' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(panel).getByRole('button', { name: 'AI 수체 결과' })).toBeInTheDocument();
    // RGB is not measurable: the first real band is measured instead.
    expect(within(panel).getByRole('combobox', { name: '밴드' })).toHaveValue('NDWI');
  });
});

describe('F2 내보내기', () => {
  test('지도 PNG: 제목·밴드와 날짜·범례·축척·출처·만든 시각을 그린다', () => {
    const texts: string[] = [];
    const ctx: any = new Proxy({}, {
      get: (target: any, key: string) => {
        if (key === 'fillText') return (text: string) => texts.push(text);
        if (key === 'measureText') return (text: string) => ({ width: text.length * 7 });
        if (key === 'createLinearGradient') return () => ({ addColorStop: jest.fn() });
        if (key in target) return target[key];
        return jest.fn();
      },
      set: (target: any, key: string, value: unknown) => { target[key] = value; return true; },
    });
    const canvas = { width: 800, height: 500 } as any;
    const layout = paintSheet(ctx, {
      title: '대청호 2024',
      subtitle: 'RGB 합성 · 2024. 8. 14.',
      maps: [{ canvas, label: 'A · 2024. 8. 14.' }, { canvas, label: 'B · 2024. 9. 1.' }],
      legends: [
        { kind: 'outline', title: '그린 영역', text: '31.2 km²', color: '#b8166f' },
        { kind: 'hatch', title: '물로 판정 · AI 결과', text: 'U-Net', color: '#3fb4ff' },
        { kind: 'classes', title: '시점 간 변화', classes: [{ color: '#3fb4ff', label: '유지 (물 → 물)' }, { color: '#1a9850', label: '새로 생김' }] },
        { kind: 'ramp', title: 'ndwi', stops: ['#000', '#fff'], min: '-1', max: '1' },
      ],
      scale: niceScale(30, 120, 'ko'),
      attribution: '배경지도 © OpenStreetMap contributors · 데이터: 대청호',
      created: '만든 시각 2026. 10. 17. 오후 2:00',
    }, 800, 500);
    expect(layout).toMatchObject({ width: 1602, height: 64 + 500 + 34 });
    expect(texts).toEqual(expect.arrayContaining(['대청호 2024', 'RGB 합성 · 2024. 8. 14.', 'A · 2024. 8. 14.', 'B · 2024. 9. 1.', '그린 영역', '31.2 km²', '물로 판정 · AI 결과', '시점 간 변화', '유지 (물 → 물)', '새로 생김', 'ndwi', '-1', '1', '2 km', '배경지도 © OpenStreetMap contributors · 데이터: 대청호', '만든 시각 2026. 10. 17. 오후 2:00 · XCube']));
  });

  test('축척 막대는 1·2·5 단위로 반올림하고, 파일 이름은 제목과 날짜다', () => {
    expect(niceScale(30, 120)).toEqual({ px: 2000 / 30, label: '2 km' });
    expect(niceScale(0.5, 120)).toEqual({ px: 100, label: '50 m' });
    expect(niceScale(NaN)).toBeNull();
    expect(pngFileName('대청호 / 2024', '2024-08-14')).toBe('대청호_2024_2024-08-14.png');
  });

  test('GeoTIFF·애니메이션·보고서 작업: 요청 → 진행률 → 내려받기', async () => {
    jest.useFakeTimers();
    const create = jest.spyOn(exportsApi, 'create').mockResolvedValue({ id: 'e1', name: '대청호', type: 'EXPORT_ANIMATION', status: 'QUEUED', progress: 0 });
    const get = jest.spyOn(exportsApi, 'get')
      .mockResolvedValueOnce({ id: 'e1', name: '대청호', type: 'EXPORT_ANIMATION', status: 'RUNNING', progress: 40 })
      .mockResolvedValueOnce({ id: 'e1', name: '대청호', type: 'EXPORT_ANIMATION', status: 'SUCCEEDED', progress: 100 });
    const file = jest.spyOn(exportsApi, 'file').mockResolvedValue({ blob: new Blob(['gif']), fileName: '대청호.gif' });
    URL.createObjectURL = jest.fn(() => 'blob:x') as any;
    URL.revokeObjectURL = jest.fn();
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(
      <ExportPanel
        targets={[{ key: 'source', label: '원본 영상', datasetId: '86', variables: ['rgb', 'ndwi'], variable: 'rgb' }]}
        times={times}
        currentIndex={0}
        shape={shape}
        viewBbox={() => [127, 36, 128, 37]}
        datasetName="대청호"
        onPng={jest.fn()}
      />,
    );
    // VX1: the four formats are large choices; settings sit under 설정 바꾸기.
    expect(screen.getByRole('radio', { name: /^PNG 그림/ })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: /^애니메이션/ }));
    expect(screen.getByRole('button', { name: '모든 시점' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'GIF' }));
    fireEvent.change(screen.getByRole('slider', { name: /^초당 프레임/ }), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: '지금 화면' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '애니메이션 만들기' })); });
    expect(create).toHaveBeenCalledWith({ datasetId: '86', kind: 'ANIMATION', variable: 'rgb', times: 'all', bbox: [127, 36, 128, 37], format: 'gif', fps: 4, title: '대청호' });
    await act(async () => { jest.advanceTimersByTime(800); });
    expect(await screen.findByRole('progressbar', { name: '애니메이션 진행률' })).toHaveAttribute('aria-valuenow', '40');
    expect(screen.getByRole('heading', { name: '만드는 중 (1)' })).toBeInTheDocument();
    await act(async () => { jest.advanceTimersByTime(800); });
    const download = await screen.findByRole('button', { name: '내려받기' });
    expect(get).toHaveBeenCalledTimes(2);
    // Running and finished exports are grouped apart.
    expect(screen.getByRole('heading', { name: '끝난 내보내기 (1)' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /만드는 중/ })).not.toBeInTheDocument();
    await act(async () => { fireEvent.click(download); });
    expect(file).toHaveBeenCalledWith('e1', 'xcube_export.gif');
    expect(click).toHaveBeenCalled();
  });

  test('보고서는 그린 영역을 고르면 그 도형을 함께 보내고, 120프레임이 넘는 애니메이션은 막는다', async () => {
    const create = jest.spyOn(exportsApi, 'create').mockResolvedValue({ id: 'r1', name: 'r', type: 'EXPORT_REPORT', status: 'QUEUED' });
    const many = Array.from({ length: 121 }, (_, index) => ({ iso: `2020-01-${index}`, label: String(index) }));
    const { rerender } = render(<ExportPanel targets={[{ key: 'source', label: '원본', datasetId: '86', variables: ['ndwi'], variable: 'ndwi' }]} times={times} currentIndex={0} shape={shape} viewBbox={() => null} datasetName="대청호" onPng={jest.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: /^보고서 PDF/ }));
    fireEvent.click(screen.getByRole('button', { name: '그린 영역' }));
    expect(screen.getByText('그린 영역의 통계 표와 그래프가 보고서에 들어갑니다.')).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '보고서 PDF 만들기' })); });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ kind: 'REPORT', geometry: shape.geometry, bbox: shape.bbox, times: 'all' }));
    rerender(<ExportPanel targets={[{ key: 'source', label: '원본', datasetId: '86', variables: ['ndwi'], variable: 'ndwi' }]} times={many} currentIndex={0} shape={shape} viewBbox={() => null} datasetName="대청호" onPng={jest.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: /^애니메이션/ }));
    expect(screen.getByText('애니메이션은 최대 120프레임입니다. 기간을 줄여 주세요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '애니메이션 만들기' })).toBeDisabled();
  });

  test('FIX2: 내보내기 시작도 다른 작업처럼 브라우저 알림 허락을 한 번만 묻는다', async () => {
    const create = jest.spyOn(exportsApi, 'create').mockResolvedValue({ id: 'n1', name: 'n', type: 'EXPORT_GEOTIFF', status: 'QUEUED' });
    const requestPermission = jest.fn().mockResolvedValue('granted');
    const previous = (window as any).Notification;
    (window as any).Notification = Object.assign(function Notification() {}, { permission: 'default', requestPermission });
    localStorage.removeItem('xcube.notify.asked');
    localStorage.removeItem('xcube.notify.browserOff');
    try {
      render(<ExportPanel targets={[{ key: 'source', label: '원본', datasetId: '86', variables: ['ndwi'], variable: 'ndwi' }]} times={times} currentIndex={0} shape={null} viewBbox={() => null} datasetName="대청호" onPng={jest.fn()} />);
      fireEvent.click(screen.getByRole('radio', { name: /^GeoTIFF/ }));
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'GeoTIFF 만들기' })); });
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'GeoTIFF 만들기' })); });
      expect(create).toHaveBeenCalledTimes(2);
      expect(requestPermission).toHaveBeenCalledTimes(1);
    } finally {
      (window as any).Notification = previous;
      localStorage.removeItem('xcube.notify.asked');
    }
  });

  test('PNG를 만들 수 없으면(타일 서버가 읽기를 막음) 이유를 말한다', async () => {
    const onPng = jest.fn().mockRejectedValue(Object.assign(new Error('TAINTED'), { code: 'TAINTED' }));
    render(<ExportPanel targets={[]} times={times} currentIndex={0} shape={null} viewBbox={() => null} datasetName="대청호" onPng={onPng} />);
    fireEvent.change(screen.getByRole('textbox', { name: /제목/ }), { target: { value: '보고용 지도' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'PNG로 저장' })); });
    expect(onPng).toHaveBeenCalledWith('보고용 지도', expect.any(AbortSignal));
    expect(screen.getByRole('alert')).toHaveTextContent('지도 서버가 그림 읽기를 허용하지 않아');
  });

  test('Content-Disposition에서 파일 이름을 읽는다', () => {
    expect(fileNameFrom("attachment; filename*=UTF-8''%EB%8C%80%EC%B2%AD%ED%98%B8.tif", 'x.tif')).toBe('대청호.tif');
    expect(fileNameFrom('attachment; filename="report.pdf"', 'x.pdf')).toBe('report.pdf');
    expect(fileNameFrom(null, 'x.pdf')).toBe('x.pdf');
  });
});

describe('F3 비교 결과', () => {
  test('원본을 모르는 예전 COMPARISON 링크는 지금처럼 그 데이터를 열어 클래스 범례와 지표를 보인다', async () => {
    render(<Viewer initialDatasetId="legacy-change-001" />);
    await screen.findByRole('region', { name: '시계열 탐색기' });
    const legend = await screen.findByRole('group', { name: '비교 범례: 시점 간 변화' });
    expect(within(legend).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['유지 (물 → 물)12.84 km²', '새로 생김1.92 km²', '사라짐3.47 km²', '투명: 변화 없음']);
    expect(screen.queryByRole('group', { name: /원본 범례/ })).not.toBeInTheDocument();
    // AI extraction runs on source data only.
    expect(screen.getByRole('button', { name: 'AI 수체 추출' })).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(screen.getByRole('button', { name: '결과 비교' }));
    const panel = screen.getByRole('complementary', { name: '결과 비교' });
    expect(within(panel).getByRole('heading', { name: '시점 간 변화' })).toBeInTheDocument();
    expect(within(panel).getByText('-9.5%')).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: /비교 분석 만들기/ })).toHaveAttribute('target', '_blank');
  });

  test('AI 결과가 없는 원본의 결과 비교는 먼저 AI 수체 추출로 안내한다', async () => {
    render(<Viewer initialDatasetId="sentinel" />);
    await screen.findByRole('region', { name: '시계열 탐색기' });
    fireEvent.click(screen.getByRole('button', { name: '결과 비교' }));
    expect(screen.getByText(/아직 AI 결과가 없습니다/)).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: '비교 분석 결과 (0개)' })).toBeInTheDocument();
    expect(screen.getByText('먼저 AI 수체 추출을 하세요. 비교는 AI 결과로 만듭니다.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'AI 수체 추출로' }));
    expect(screen.getByRole('complementary', { name: 'AI 수체 추출' })).toBeInTheDocument();
  });

  test('지표 읽기·색표·주소', () => {
    expect(comparisonInfo({ type: 'reference', metrics: { precision: 0.9, confusion: { tp: 1, fp: 2, fn: 3, tn: 4 } }, input: { resultId: 87, time: 't', reference: { shapefileDatasetId: 5 } } }))
      .toMatchObject({ type: 'REFERENCE', metrics: { precision: 0.9, confusion: { tp: 1, fp: 2, fn: 3, tn: 4 } }, resultId: '87', reference: 'shapefile:5' });
    expect(comparisonInfo({ iou: 0.88, dice: 0.93, comparisonType: 'MODEL_COMPARE', aId: 1, bId: 2 })).toMatchObject({ type: 'MODEL_COMPARE', metrics: { iou: 0.88, dice: 0.93 }, aId: '1', bId: '2' });
    // The shape Data Analysis records (metadata.comparison): times at the top, inputs by role, metrics.
    expect(comparisonInfo({ type: 'TIME_CHANGE', t1: '2026-04-26T02:27:27Z', t2: '2026-05-31T02:27:23Z', inputs: [{ role: 'result', datacubeId: 87 }], classes: [], colorMap: '{}', metrics: { areaKm2: { kept: 18.8, gained: 0.73, lost: 3.33, unchanged: 200 }, changeRatio: -0.1174, changePercent: -11.74 } }))
      .toMatchObject({ type: 'TIME_CHANGE', resultId: '87', t1: '2026-04-26T02:27:27Z', t2: '2026-05-31T02:27:23Z', metrics: { areaKm2: { kept: 18.8, gained: 0.73, lost: 3.33 }, changeRate: -0.1174 } });
    expect(comparisonInfo({ type: 'MODEL_COMPARE', time: 't', inputs: [{ role: 'a', datacubeId: 72 }, { role: 'b', datacubeId: 88 }], metrics: { iou: 0.9092 } })).toMatchObject({ aId: '72', bId: '88', time: 't' });
    expect(comparisonInfo(null).type).toBeNull();
    expect(JSON.parse(comparisonStyle('TIME_CHANGE').cmap)).toEqual({ name: 'xcube_compare_time_change', type: 'categorical', colors: [[1, '#3fb4ff'], [2, '#1a9850'], [3, '#d73027']] });
    expect(JSON.parse(comparisonStyle('REFERENCE').cmap).colors).toEqual([[1, '#3fb4ff'], [2, '#d73027'], [3, '#fdae61']]);
    expect(compareHref({ type: 'MODEL_COMPARE', source: '86' })).toBe('/app/analysis/compare?type=MODEL_COMPARE&source=86');
    expect(compareHref({ resultId: '87' })).toBe('/app/analysis/compare?resultId=87');
    expect(comparisonTypeFromColorBar('{"name":"xcube_compare_model_compare","type":"categorical"}')).toBe('MODEL_COMPARE');
    expect(comparisonTypeFromColorBar('viridis')).toBeNull();
  });

  test('비교 데이터의 지표는 그 데이터를 만든 비교 작업에서 읽는다(Backoffice가 metadata를 보이지 않을 때)', async () => {
    jest.spyOn(compareApi, 'listJobs').mockResolvedValue([
      { id: 'j1', name: 'x', type: 'COMPARE', status: 'SUCCEEDED', compareType: 'TIME_CHANGE', registration: { datacubeId: 100 }, comparison: { type: 'TIME_CHANGE', t1: 'a', t2: 'b', inputs: [{ role: 'result', datacubeId: 87 }] }, metrics: { changeRatio: -0.117 } },
    ]);
    expect(comparisonInfo(await comparisonForDataset('100'))).toMatchObject({ type: 'TIME_CHANGE', resultId: '87', t1: 'a', metrics: { changeRate: -0.117 } });
    expect(await comparisonForDataset('101')).toBeNull();
  });
});

describe('UX2 위쪽 바', () => {
  test('지금 밴드와 날짜를 큰 글자로 보이고, 밴드를 누르면 레이어 탭이 열린다', async () => {
    render(<Viewer initialDatasetId="landsat" />);
    await screen.findByRole('region', { name: '시계열 탐색기' });
    const now = screen.getByRole('group', { name: '지금 지도에 보이는 것' });
    await waitFor(() => expect(now).toHaveTextContent('밴드RGB 합성'));
    expect(now).toHaveTextContent('날짜2025.07.03');
    fireEvent.click(within(now).getByRole('button', { name: '밴드 RGB 합성, 레이어 탭 열기' }));
    expect(screen.getByRole('complementary', { name: '레이어' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다음 시점' }));
    expect(now).toHaveTextContent('날짜2025.07.18');
  });
});
