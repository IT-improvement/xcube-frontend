/* "수체 분석용 S1+S2" (UR-41) in the S4 GEE wizard, demo mode: preset, S1 options, pair table, blockers, request body. */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

jest.mock('../../api', () => ({ activeViewerAdapter: { getProjects: jest.fn(), getDatasets: jest.fn(), getProjectDatasets: jest.fn(), getJobs: jest.fn() }, useMockApi: true }));
jest.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 1, name: '홍길동' }, signOut: jest.fn() }) }));

const adapter = require('../../api').activeViewerAdapter as Record<string, jest.Mock>;
const { generation } = require('../api');
const { pairLine, pairSummary, sarRequest, defaultSar, withPairingBlockers } = require('./sarModel');
const AddDataPage = require('./AddDataPage').default;

const T = 4000;
const S2 = 'COPERNICUS/S2_SR_HARMONIZED';
const base = { areaKm2: 400, grid: { width: 2000, height: 2000 }, scenes: 4, estimatedBytes: 1e8, requestTiles: 1, warnings: [], blockers: [] };
beforeEach(() => {
  adapter.getProjects.mockResolvedValue([]);
  adapter.getDatasets.mockResolvedValue([]);
});
afterEach(() => jest.restoreAllMocks());

function renderWizard() {
  return render(<MemoryRouter initialEntries={['/app/data/new']}><Routes><Route path="/app/data/new" element={<AddDataPage />} /></Routes></MemoryRouter>);
}
async function toCatalog() {
  renderWizard();
  fireEvent.click(await screen.findByRole('radio', { name: /Google Earth Engine/ }));
  fireEvent.click(screen.getByRole('button', { name: /다음/ }));
  await screen.findByRole('radio', { name: /Sentinel-2 L2A/ });
}
function fillPeriodAndPoint() {
  fireEvent.change(screen.getByLabelText('시작 날짜'), { target: { value: '2024-08-01' } });
  fireEvent.change(screen.getByLabelText('끝 날짜'), { target: { value: '2024-08-20' } });
  fireEvent.change(screen.getByLabelText('중심 경도'), { target: { value: '127.63' } });
  fireEvent.change(screen.getByLabelText('중심 위도'), { target: { value: '36.45' } });
}
const sarCheckbox = () => screen.queryByRole('checkbox', { name: /AI 수체 분석용으로 Sentinel-1 VV·VH 함께 받기/ });

describe('sarModel', () => {
  test('S2가 아니거나 꺼져 있으면 요청에 아무것도 넣지 않는다', () => {
    expect(sarRequest('LANDSAT/LC09/C02/T1_L2', defaultSar())).toEqual({});
    expect(sarRequest(S2, { ...defaultSar(), enabled: false })).toEqual({});
    expect(sarRequest(S2, { ...defaultSar(), maxDaysApart: '31' })).toEqual({});
    expect(sarRequest(S2, defaultSar())).toEqual({ sarPairing: { enabled: true, maxDaysApart: 15, orbitPass: 'ANY', minCoverage: 0.998, dropUnpaired: true } });
    expect(sarRequest(S2, { ...defaultSar(true), orbitPass: 'DESCENDING', keepUnpaired: true, maxDaysApart: '7' })).toEqual({
      sarPairing: { enabled: true, maxDaysApart: 7, orbitPass: 'DESCENDING', minCoverage: 0.998, dropUnpaired: false },
      waterReference: { enabled: true, occurrenceThreshold: 50 },
    });
  });
  test('모두 짝이 없으면 NO_S1_MATCH 차단을 더한다', () => {
    const none = { ...base, pairs: [{ s2Date: '2024-08-14', s1Date: null }] };
    expect(pairSummary(none).noMatch).toBe(true);
    expect(withPairingBlockers(none, true)).toEqual(['NO_S1_MATCH']);
    expect(withPairingBlockers(none, false)).toEqual([]);
    expect(withPairingBlockers({ ...base, blockers: ['NO_S1_MATCH'] }, true)).toEqual(['NO_S1_MATCH']);
    expect(pairSummary(base).pairs).toBeNull();
  });
  test('Zarr 상세의 짝 문구', () => {
    expect(pairLine({ time: '2024-08-14T02:15:00Z', s1Time: '2024-08-13T21:30:00Z', orbitPass: 'DESCENDING', daysApart: 0.6 })).toBe('S1 짝: 2024-08-13 하강 (0.6일 차이)');
    expect(pairLine({ time: '2024-08-19', s1Time: null })).toMatch(/짝 없음/);
  });
});

describe('수체 분석용 S1+S2 (GEE)', () => {
  test('프리셋을 고르면 S2·5 band(blue…swir)·짝 맞춤·JRC로 채워 요청한다', async () => {
    const estimate = jest.spyOn(generation, 'estimateGee');
    const create = jest.spyOn(generation, 'createGeeJob');
    await toCatalog();
    const preset = screen.getByRole('radio', { name: /수체 분석용 \(Sentinel-2 \+ Sentinel-1\)/ });
    expect(preset).toHaveTextContent('같은 위치·비슷한 날짜');
    fireEvent.click(preset);
    expect(preset).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /Sentinel-2 L2A/ })).toHaveAttribute('aria-checked', 'false');
    expect(sarCheckbox()).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /참조 수체\(JRC\) 함께 저장 — 비교용, 정답 아님/ })).toBeChecked();
    fillPeriodAndPoint();
    // The demo server sends `dates`, so the pair columns join the date table (UR-43).
    const table = await screen.findByRole('table', { name: '날짜 고르기 · 광학·레이더 날짜 짝' }, { timeout: T });
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['선택', '날짜', '장면', '구름 %', '레이더 날짜', '차이(일)']);
    expect(screen.queryByRole('table', { name: '광학·레이더 날짜 짝' })).toBeNull();
    expect((estimate.mock.calls.at(-1)![0] as any).sarPairing).toEqual({ enabled: true, maxDaysApart: 15, orbitPass: 'ANY', minCoverage: 0.998, dropUnpaired: true });
    expect(estimate.mock.calls.at(-1)![0]).toMatchObject({ scaleMeters: 10, maxCloudPercent: 40 });

    fireEvent.click(screen.getByRole('button', { name: /다음/ }));
    expect(await screen.findByText(/같은 위치\(영역을 99% 이상 덮음\), 가까운 날짜의 레이더 영상/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));
    fireEvent.change(await screen.findByLabelText('데이터 이름'), { target: { value: '대청호 S1S2' } });
    expect(screen.getByLabelText('B2 변수 이름')).toHaveValue('blue');
    expect(screen.getByLabelText('B11 변수 이름')).toHaveValue('swir');
    const fixed = screen.getByRole('region', { name: '함께 저장되는 변수' });
    expect(fixed).toHaveTextContent('vv');
    expect(fixed).toHaveTextContent('vh');
    expect(fixed).toHaveTextContent('water_gt');
    expect(within(fixed).queryByRole('textbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));
    fireEvent.click(await screen.findByRole('button', { name: '생성 시작' }));
    await waitFor(() => expect(create).toHaveBeenCalled(), { timeout: T });
    const body = create.mock.calls[0][0] as any;
    expect(body.collectionId).toBe(S2);
    expect(body.bands).toEqual(['B2', 'B3', 'B4', 'B8', 'B11']);
    expect(body.variables.map((item: any) => [item.source, item.name])).toEqual([['B2', 'blue'], ['B3', 'green'], ['B4', 'red'], ['B8', 'nir'], ['B11', 'swir']]);
    expect(body.sarPairing).toEqual({ enabled: true, maxDaysApart: 15, orbitPass: 'ANY', minCoverage: 0.998, dropUnpaired: true });
    expect(body.waterReference).toEqual({ enabled: true, occurrenceThreshold: 50 });
    expect(body.rgbStyle.red.variable).toBe('B4');
    // Every date stayed checked (one demo date has no S1 pass and is dropped by the server), so no selectedDates.
    expect(body).not.toHaveProperty('selectedDates');
  });

  test('S2를 직접 고르면 체크가 기본으로 켜지고, 다른 컬렉션에서는 숨기고 보내지 않는다', async () => {
    const estimate = jest.spyOn(generation, 'estimateGee');
    await toCatalog();
    fireEvent.click(screen.getByRole('radio', { name: /Sentinel-2 L2A/ }));
    expect(sarCheckbox()).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /참조 수체\(JRC\)/ })).not.toBeChecked();
    fireEvent.change(screen.getByLabelText(/날짜 차이 최대/), { target: { value: '40' } });
    expect(screen.getByText(/1~30일 사이 정수/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/날짜 차이 최대/), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('궤도 방향'), { target: { value: 'DESCENDING' } });
    fireEvent.click(screen.getByRole('button', { name: '레이더 없이 남기기' }));
    fillPeriodAndPoint();
    await waitFor(() => expect(estimate).toHaveBeenCalled(), { timeout: T });
    expect((estimate.mock.calls.at(-1)![0] as any).sarPairing).toEqual({ enabled: true, maxDaysApart: 10, orbitPass: 'DESCENDING', minCoverage: 0.998, dropUnpaired: false });
    expect((estimate.mock.calls.at(-1)![0] as any).waterReference).toBeUndefined();

    fireEvent.click(screen.getByRole('radio', { name: /Landsat 9/ }));
    expect(sarCheckbox()).toBeNull();
    await waitFor(() => expect((estimate.mock.calls.at(-1)![0] as any).collectionId).toBe('LANDSAT/LC09/C02/T1_L2'), { timeout: T });
    const body = estimate.mock.calls.at(-1)![0] as any;
    expect(body).not.toHaveProperty('sarPairing');
    expect(body).not.toHaveProperty('waterReference');
    expect(body).not.toHaveProperty('variables');
  });

  test('짝 표: 짝 없는 날짜는 흐리게 "제외", 7일 넘는 차이는 주의, 남기기면 문구가 바뀐다', async () => {
    jest.spyOn(generation, 'estimateGee').mockResolvedValue({
      ...base,
      pairs: [
        { s2Date: '2024-08-14', s1Date: '2024-08-13', daysApart: 0.6, orbitPass: 'DESCENDING', coverage: 1 },
        { s2Date: '2024-08-19', s1Date: '2024-08-09', daysApart: 9.5, orbitPass: 'ASCENDING', coverage: 0.995 },
        { s2Date: '2024-08-24', s1Date: null, daysApart: null, orbitPass: null, coverage: null },
      ],
      pairedCount: 2, unpairedCount: 1,
    });
    await toCatalog();
    fireEvent.click(screen.getByRole('radio', { name: /Sentinel-2 L2A/ }));
    fillPeriodAndPoint();
    const table = await screen.findByRole('table', { name: '광학·레이더 날짜 짝' }, { timeout: T });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('2024-08-14');
    expect(rows[0]).toHaveTextContent('하강');
    expect(rows[0]).toHaveTextContent('100');
    expect(rows[0]).not.toHaveTextContent('주의');
    expect(rows[1]).toHaveTextContent('9.5');
    expect(rows[1]).toHaveTextContent('주의');
    expect(rows[1]).toHaveTextContent('99.5');
    expect(rows[2]).toHaveClass('is-unpaired');
    expect(rows[2]).toHaveTextContent('레이더 없음 – 제외');
    expect(screen.getByText(/짝 없음 1개/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /다음/ })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '레이더 없이 남기기' }));
    expect(await screen.findByText('레이더 없음 – 레이더 없이 남김', undefined, { timeout: T })).toBeInTheDocument();
  });

  test('모든 날짜에 짝이 없으면 진행·생성을 막고 기간·날짜 차이를 넓히라고 알려 준다', async () => {
    jest.spyOn(generation, 'estimateGee').mockResolvedValue({ ...base, pairs: [{ s2Date: '2024-08-14', s1Date: null }, { s2Date: '2024-08-19', s1Date: null }], pairedCount: 0, unpairedCount: 2 });
    await toCatalog();
    fireEvent.click(screen.getByRole('radio', { name: /Sentinel-2 L2A/ }));
    fillPeriodAndPoint();
    expect(await screen.findByText(/기간을 넓히거나 날짜 차이를 늘려 보세요/, undefined, { timeout: T })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /다음/ })).toBeDisabled();
  });

  test('pairs 없이 NO_S1_MATCH 차단만 와도 막고, pairs가 없으면 짝 표 대신 안내만 보인다', async () => {
    const estimate = jest.spyOn(generation, 'estimateGee').mockResolvedValue({ ...base, blockers: ['NO_S1_MATCH'] });
    await toCatalog();
    fireEvent.click(screen.getByRole('radio', { name: /Sentinel-2 L2A/ }));
    fillPeriodAndPoint();
    expect(await screen.findByText(/기간을 넓히거나 날짜 차이를 늘려 보세요/, undefined, { timeout: T })).toBeInTheDocument();
    expect(screen.getAllByText(/기간을 넓히거나 날짜 차이를 늘려 보세요/)).toHaveLength(1);
    expect(screen.getByRole('button', { name: /다음/ })).toBeDisabled();
    // Older server: no pairs, no blocker → a note, and the wizard goes on.
    estimate.mockResolvedValue({ ...base });
    fireEvent.click(screen.getByRole('radio', { name: '10 km' }));
    expect(await screen.findByText(/서버가 짝 목록을 보내지 않아/, undefined, { timeout: T })).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: '광학·레이더 날짜 짝' })).toBeNull();
    expect(screen.getByRole('button', { name: /다음/ })).toBeEnabled();
  });

  test('짝 맞춤을 끄면 band 이름이 원래대로 돌아가고 sarPairing을 보내지 않는다', async () => {
    const create = jest.spyOn(generation, 'createGeeJob');
    await toCatalog();
    fireEvent.click(screen.getByRole('radio', { name: /수체 분석용/ }));
    fireEvent.click(sarCheckbox()!);
    expect(screen.getByRole('radio', { name: /수체 분석용/ })).toHaveAttribute('aria-checked', 'false');
    fillPeriodAndPoint();
    await screen.findByRole('region', { name: '예상 크기' });
    await waitFor(() => expect(screen.getByRole('region', { name: '예상 크기' })).toHaveTextContent('예상 장면 수'), { timeout: T });
    expect(screen.queryByRole('table', { name: '광학·레이더 날짜 짝' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));
    fireEvent.click(await screen.findByRole('button', { name: /다음/ }));
    fireEvent.change(await screen.findByLabelText('데이터 이름'), { target: { value: 'S2만' } });
    expect(screen.queryByLabelText('B2 변수 이름')).toBeNull();
    expect(screen.queryByRole('region', { name: '함께 저장되는 변수' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));
    fireEvent.click(await screen.findByRole('button', { name: '생성 시작' }));
    await waitFor(() => expect(create).toHaveBeenCalled(), { timeout: T });
    const body = create.mock.calls[0][0] as any;
    expect(body).not.toHaveProperty('sarPairing');
    expect(body).not.toHaveProperty('variables');
    expect(body.bandStyles.map((item: any) => item.variable)).toEqual(['B2', 'B3', 'B4', 'B8', 'B11']);
  });
});
