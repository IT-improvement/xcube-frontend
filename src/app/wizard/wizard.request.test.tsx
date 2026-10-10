/* UR-54: the GEE steps changed, the requests did not. The bodies below were recorded from the wizard before the
   change (dev 901d3f5, old 원본 입력 → 검사 → 설정 → 확인 order) for the same choices; the new flow must send the
   same JSON. The one intended difference: the water preset's optical bands now default to the Greys colour map
   (audit D-wizard U3) instead of viridis. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

jest.mock('../../api', () => ({ activeViewerAdapter: { getProjects: jest.fn(), getDatasets: jest.fn(), getProjectDatasets: jest.fn(), getJobs: jest.fn() }, useMockApi: true }));
jest.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 1, name: '홍길동' }, signOut: jest.fn() }) }));

const adapter = require('../../api').activeViewerAdapter as Record<string, jest.Mock>;
const { generation } = require('../api');
const AddDataPage = require('./AddDataPage').default;
const { geeFlow } = require('./geeFlow.testutil');

const T = 4000;
beforeEach(() => {
  adapter.getProjects.mockResolvedValue([]);
  adapter.getDatasets.mockResolvedValue([]);
});
afterEach(() => jest.restoreAllMocks());

const DAECHEONG_BOUNDS = { west: 127.462774, south: 36.319353, east: 127.797826, north: 36.588847 };
const DAECHEONG_AREA = { mode: 'point', point: { lon: 127.6303, lat: 36.4541, sizeKm: 30 }, clip: 'bbox', maskVariable: false, fullCoverOnly: false };
const PAIRING = { enabled: true, maxDaysApart: 15, orbitPass: 'ANY', minCoverage: 0.998, dropUnpaired: true };
const WATER_REFERENCE = { enabled: true, occurrenceThreshold: 50 };
const presetBand = (variable: string, colorBar: string) => ({ variable, colorBar, valueMin: 0, valueMax: 3000 });
const presetVariable = (source: string, name: string, colorBar: string) => ({ source, name, kind: 'continuous', style: { colorBar, min: 0, max: 3000 } });

/** Recorded before UR-54 (colour maps were viridis then). */
const PRESET_CREATE_BEFORE = {
  name: '대청호 2024-08', collectionId: 'COPERNICUS/S2_SR_HARMONIZED', bands: ['B2', 'B3', 'B4', 'B8', 'B11'], startDate: '2024-08-01', endDate: '2024-08-31',
  maxCloudPercent: 40, scaleMeters: 10, bounds: DAECHEONG_BOUNDS, area: DAECHEONG_AREA,
  bandStyles: [presetBand('B2', 'viridis'), presetBand('B3', 'viridis'), presetBand('B4', 'viridis'), presetBand('B8', 'viridis'), presetBand('B11', 'viridis')],
  rgbStyle: { red: { variable: 'B4', valueMin: 0, valueMax: 3000 }, green: { variable: 'B3', valueMin: 0, valueMax: 3000 }, blue: { variable: 'B2', valueMin: 0, valueMax: 3000 } },
  variables: [presetVariable('B2', 'blue', 'viridis'), presetVariable('B3', 'green', 'viridis'), presetVariable('B4', 'red', 'viridis'), presetVariable('B8', 'nir', 'viridis'), presetVariable('B11', 'swir', 'viridis')],
  sarPairing: PAIRING, waterReference: WATER_REFERENCE,
  selectedDates: ['2024-08-01', '2024-08-16', '2024-08-26', '2024-08-31'],
};
const PRESET_ESTIMATE = {
  name: '새 데이터', collectionId: 'COPERNICUS/S2_SR_HARMONIZED', bands: ['B2', 'B3', 'B4', 'B8', 'B11'], startDate: '2024-08-01', endDate: '2024-08-31',
  maxCloudPercent: 40, scaleMeters: 10, bounds: DAECHEONG_BOUNDS, area: DAECHEONG_AREA, bandStyles: [], sarPairing: PAIRING, waterReference: WATER_REFERENCE,
};
const BOX = { west: 127.4, south: 36.3, east: 127.8, north: 36.6 };
const CUSTOM_CREATE = {
  name: 'L9 test', collectionId: 'LANDSAT/LC09/C02/T1_L2', bands: ['SR_B4', 'SR_B3', 'SR_B2'], startDate: '2024-08-01', endDate: '2024-08-31',
  maxCloudPercent: 30, scaleMeters: 30, bounds: BOX, area: { mode: 'box', box: BOX, clip: 'bbox', maskVariable: false, fullCoverOnly: false },
  bandStyles: [
    { variable: 'SR_B4', colorBar: 'viridis', valueMin: 7000, valueMax: 20000 },
    { variable: 'SR_B3', colorBar: 'viridis', valueMin: 7000, valueMax: 20000 },
    { variable: 'SR_B2', colorBar: 'magma', valueMin: 7000, valueMax: 20000 },
  ],
  rgbStyle: { red: { variable: 'SR_B4', valueMin: 7000, valueMax: 20000 }, green: { variable: 'SR_B3', valueMin: 7000, valueMax: 20000 }, blue: { variable: 'SR_B2', valueMin: 7000, valueMax: 20000 } },
};
const CUSTOM_ESTIMATE = {
  name: '새 데이터', collectionId: 'LANDSAT/LC09/C02/T1_L2', bands: ['SR_B4', 'SR_B3', 'SR_B2'], startDate: '2024-08-01', endDate: '2024-08-31',
  maxCloudPercent: 30, scaleMeters: 30, bounds: BOX, area: { mode: 'box', box: BOX, clip: 'bbox', maskVariable: false, fullCoverOnly: false }, bandStyles: [],
};
/** What goes over the wire: JSON drops undefined fields. */
const wire = (body: unknown) => JSON.parse(JSON.stringify(body));
const greys = (body: typeof PRESET_CREATE_BEFORE) => JSON.parse(JSON.stringify(body).replace(/"viridis"/g, '"Greys"'));

function renderWizard() {
  return render(<MemoryRouter initialEntries={['/app/data/new']}><Routes><Route path="/app/data/new" element={<AddDataPage />} /></Routes></MemoryRouter>);
}

test('수체 분석용 프리셋: 같은 선택이면 생성·추정 요청 본문이 이전과 같다 (색상표만 Greys)', async () => {
  const estimate = jest.spyOn(generation, 'estimateGee');
  const create = jest.spyOn(generation, 'createGeeJob');
  const flow = geeFlow();
  renderWizard();
  await flow.toData();
  fireEvent.click(screen.getByRole('radio', { name: /수체 분석용/ }));
  await flow.toArea();
  flow.setPoint('127.6303', '36.4541');
  await flow.toDates();
  flow.setPeriod('2024-08-01', '2024-08-31');
  await screen.findByRole('table', { name: /날짜 고르기/ }, { timeout: T });
  await waitFor(() => expect(flow.next()).toBeEnabled(), { timeout: T });
  fireEvent.click(screen.getByRole('checkbox', { name: '2024-08-06 선택' }));
  await flow.toReview();
  fireEvent.change(screen.getByLabelText('데이터 이름'), { target: { value: '대청호 2024-08' } });
  fireEvent.click(await flow.createButton());
  await waitFor(() => expect(create).toHaveBeenCalled(), { timeout: T });

  expect(wire(create.mock.calls[0][0])).toStrictEqual(greys(PRESET_CREATE_BEFORE));
  expect(wire(estimate.mock.calls.at(-1)![0])).toStrictEqual(PRESET_ESTIMATE);
});

test('직접 고른 컬렉션(Landsat 9, 사각형, RGB): 같은 선택이면 생성·추정 요청 본문이 이전과 같다', async () => {
  const estimate = jest.spyOn(generation, 'estimateGee');
  const create = jest.spyOn(generation, 'createGeeJob');
  const flow = geeFlow();
  renderWizard();
  await flow.toData();
  flow.choose(/Landsat 9/, ['SR_B4', 'SR_B3', 'SR_B2']);
  await flow.toArea();
  fireEvent.click(screen.getByRole('tab', { name: '사각형' }));
  flow.type('좌하단 경도', '127.4');
  flow.type('좌하단 위도', '36.3');
  flow.type('우상단 경도', '127.8');
  flow.type('우상단 위도', '36.6');
  await flow.toDates();
  flow.setPeriod('2024-08-01', '2024-08-31');
  fireEvent.change(screen.getByLabelText('최대 구름량 (%)'), { target: { value: '30' } });
  await screen.findByRole('table', { name: /날짜 고르기/ }, { timeout: T });
  await flow.toReview();
  fireEvent.change(screen.getByLabelText('데이터 이름'), { target: { value: 'L9 test' } });
  for (const band of ['SR_B4', 'SR_B3', 'SR_B2']) {
    fireEvent.change(screen.getByLabelText(`${band} 표시 최솟값`), { target: { value: '7000' } });
    fireEvent.change(screen.getByLabelText(`${band} 표시 최댓값`), { target: { value: '20000' } });
  }
  fireEvent.change(screen.getByLabelText('SR_B2 색상표'), { target: { value: 'magma' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /RGB 컬러 영상도 만들기/ }));
  fireEvent.change(screen.getByLabelText('빨강 (R)'), { target: { value: 'SR_B4' } });
  fireEvent.change(screen.getByLabelText('초록 (G)'), { target: { value: 'SR_B3' } });
  fireEvent.change(screen.getByLabelText('파랑 (B)'), { target: { value: 'SR_B2' } });
  // RGB tags appear on the band rows.
  expect(screen.getByRole('region', { name: 'SR_B4 표시 설정' })).toHaveTextContent('RGB R');
  fireEvent.click(await flow.createButton());
  await waitFor(() => expect(create).toHaveBeenCalled(), { timeout: T });

  expect(wire(create.mock.calls[0][0])).toStrictEqual(CUSTOM_CREATE);
  expect(wire(estimate.mock.calls.at(-1)![0])).toStrictEqual(CUSTOM_ESTIMATE);
});
