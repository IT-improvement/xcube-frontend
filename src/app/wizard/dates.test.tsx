/* "날짜 고르기" (UR-43, FR-GEE-14) in the S4 GEE wizard: selection math, quick picks, 0-selected blocking, `selectedDates`, fallback. */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

jest.mock('../../api', () => ({ activeViewerAdapter: { getProjects: jest.fn(), getDatasets: jest.fn(), getProjectDatasets: jest.fn(), getJobs: jest.fn() }, useMockApi: true }));
jest.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 1, name: '홍길동' }, signOut: jest.fn() }) }));

const adapter = require('../../api').activeViewerAdapter as Record<string, jest.Mock>;
const { generation } = require('../api');
const { activeSelection, leastCloudy, minutesText, selectedDatesField, selectionProblem, selectionTotals, isLong } = require('./dateModel');
const AddDataPage = require('./AddDataPage').default;

const T = 4000;
const GiB = 1024 ** 3;
const DATES = [
  { date: '2024-08-04', sceneCount: 2, cloudPercent: 12.4, coverage: 1 },
  { date: '2024-08-09', sceneCount: 1, cloudPercent: 3.1, coverage: 1 },
  { date: '2024-08-14', sceneCount: 2, cloudPercent: 38.6, coverage: 0.82 },
  { date: '2024-08-19', sceneCount: 2, cloudPercent: null, coverage: 1 },
  { date: '2024-08-24', sceneCount: 1, cloudPercent: 0.8, coverage: 0.97 },
];
// 25 minutes for 5 dates → 5 minutes per date.
const ESTIMATE = { areaKm2: 900, grid: { width: 3000, height: 3000 }, scenes: 8, estimatedBytes: 5 * GiB, requestTiles: 1, warnings: [], blockers: [], dates: DATES, bytesPerDate: GiB, estimatedSeconds: 1500 };

beforeEach(() => {
  adapter.getProjects.mockResolvedValue([]);
  adapter.getDatasets.mockResolvedValue([]);
});
afterEach(() => jest.restoreAllMocks());

describe('dateModel', () => {
  test('구름 적은 순 N개: 구름 값이 없으면 뒤로, 표 순서를 지킨다', () => {
    expect(leastCloudy(DATES, 2)).toEqual(['2024-08-09', '2024-08-24']);
    expect(leastCloudy(DATES, 4)).toEqual(['2024-08-04', '2024-08-09', '2024-08-14', '2024-08-24']);
    expect(leastCloudy(DATES, 99)).toHaveLength(5);
    expect(leastCloudy(DATES, 0)).toEqual([]);
  });
  test('선택 개수로 장면·용량·시간을 계산한다 (bytesPerDate × n, estimatedSeconds × n / m)', () => {
    const totals = selectionTotals(ESTIMATE, ['2024-08-04', '2024-08-14']);
    expect(totals).toMatchObject({ count: 2, total: 5, scenes: 4, bytes: 2 * GiB, seconds: 600 });
    expect(minutesText(totals.seconds)).toBe('약 10분');
    expect(isLong(totals.seconds)).toBe(false);
    expect(isLong(selectionTotals(ESTIMATE, DATES.map((item) => item.date)).seconds)).toBe(true);
    expect(minutesText(30)).toBe('약 1분');
    expect(minutesText(0)).toBe('—');
    // No bytesPerDate (partial server): scale the total.
    const { bytesPerDate, ...older } = ESTIMATE;
    expect(selectionTotals(older, ['2024-08-04']).bytes).toBe(GiB);
  });
  test('selectedDates는 일부만 골랐을 때만, 정렬해서 보낸다', () => {
    const all = DATES.map((item) => item.date);
    expect(selectedDatesField({ scope: 's', all, picked: all })).toEqual({});
    expect(selectedDatesField(null)).toEqual({});
    expect(selectedDatesField({ scope: 's', all, picked: ['2024-08-24', '2024-08-04'] })).toEqual({ selectedDates: ['2024-08-04', '2024-08-24'] });
  });
  test('범위가 바뀌면 다시 전체 선택, 0개·짝 없는 날짜만 고르면 문제를 알려 준다', () => {
    const stored = { scope: 'a', all: ['2024-08-04'], picked: [] };
    expect(activeSelection(stored, 'a', DATES)).toBe(stored);
    expect(activeSelection(stored, 'b', DATES).picked).toHaveLength(5);
    expect(activeSelection(null, 'b', null)).toBeNull();
    expect(selectionProblem(stored, DATES, null)).toMatch(/하나 이상/);
    const paired = [{ ...DATES[0], s1: null }, { ...DATES[1], s1: { date: '2024-08-08', daysApart: 1 } }];
    const onlyUnpaired = { scope: 'a', all: ['2024-08-04', '2024-08-09'], picked: ['2024-08-04'] };
    expect(selectionProblem(onlyUnpaired, paired, { keepUnpaired: false })).toMatch(/레이더 짝이 없어/);
    expect(selectionProblem(onlyUnpaired, paired, { keepUnpaired: true })).toBe('');
  });
});

function renderWizard() {
  return render(<MemoryRouter initialEntries={['/app/data/new']}><Routes><Route path="/app/data/new" element={<AddDataPage />} /></Routes></MemoryRouter>);
}
async function toAreaStep(collection: RegExp = /Landsat 9/) {
  renderWizard();
  fireEvent.click(await screen.findByRole('radio', { name: /Google Earth Engine/ }));
  fireEvent.click(screen.getByRole('button', { name: /다음/ }));
  fireEvent.click(await screen.findByRole('radio', { name: collection }));
  fireEvent.change(screen.getByLabelText('시작 날짜'), { target: { value: '2024-08-01' } });
  fireEvent.change(screen.getByLabelText('끝 날짜'), { target: { value: '2024-08-31' } });
  fireEvent.change(screen.getByLabelText('중심 경도'), { target: { value: '127.63' } });
  fireEvent.change(screen.getByLabelText('중심 위도'), { target: { value: '36.45' } });
}
const panel = () => screen.getByRole('region', { name: '예상 크기' });
const dateTable = () => screen.findByRole('table', { name: '날짜 고르기' }, { timeout: T });
const count = () => within(screen.getByRole('region', { name: '날짜 고르기' })).getByText(/선택/, { selector: 'p' });
const next = () => screen.getByRole('button', { name: /다음/ });
async function toConfirm(name = '대청호 8월') {
  fireEvent.click(next());
  fireEvent.click(await screen.findByRole('button', { name: /다음/ }));
  fireEvent.change(await screen.findByLabelText('데이터 이름'), { target: { value: name } });
  fireEvent.click(screen.getByRole('checkbox', { name: /SR_B4/ }));
  fireEvent.change(screen.getByLabelText('SR_B4 표시 최솟값'), { target: { value: '0' } });
  fireEvent.change(screen.getByLabelText('SR_B4 표시 최댓값'), { target: { value: '30000' } });
  fireEvent.click(screen.getByRole('button', { name: /다음/ }));
  return screen.findByRole('button', { name: '생성 시작' });
}

describe('GEE 날짜 고르기', () => {
  test('기본은 전체 선택, 체크를 바꾸면 시점 수·용량·시간이 다시 요청하지 않고 바뀐다', async () => {
    const estimate = jest.spyOn(generation, 'estimateGee').mockResolvedValue(ESTIMATE);
    await toAreaStep();
    const table = await dateTable();
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['선택', '구름 순위', '날짜', '구름 %', '장면']);
    expect(within(table).getAllByRole('checkbox').every((box) => (box as HTMLInputElement).checked)).toBe(true);
    expect(count()).toHaveTextContent('선택 5 / 전체 5개 날짜');
    // Ranked from the least cloud; no cloud value last.
    expect(within(table).getAllByRole('row').slice(1).map((row) => row.textContent?.slice(1, 11))).toEqual(['2024-08-24', '2024-08-09', '2024-08-04', '2024-08-14', '2024-08-19']);
    expect(within(table).getAllByRole('row')[5]).toHaveTextContent('—');
    expect(screen.getByTestId('estimate-times')).toHaveTextContent('5개');
    expect(screen.getByTestId('estimate-bytes')).toHaveTextContent('5.0 GB');
    expect(screen.getByTestId('estimate-time')).toHaveTextContent('약 25분');
    expect(panel()).toHaveTextContent('날짜를 줄이면 빨라집니다');
    const calls = estimate.mock.calls.length;

    fireEvent.click(screen.getByRole('checkbox', { name: '2024-08-14 선택' }));
    expect(count()).toHaveTextContent('선택 4 / 전체 5개 날짜');
    expect(screen.getByTestId('estimate-times')).toHaveTextContent('4개 / 전체 5개 날짜');
    expect(screen.getByTestId('estimate-bytes')).toHaveTextContent('4.0 GB');
    expect(screen.getByTestId('estimate-time')).toHaveTextContent('약 20분');

    // Writing how many dates to make checks the least cloudy ones at once (UR-47).
    fireEvent.change(screen.getByLabelText('만들 날짜 수'), { target: { value: '2' } });
    expect(count()).toHaveTextContent('선택 2 / 전체 5개 날짜');
    expect(screen.getByRole('checkbox', { name: '2024-08-09 선택' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '2024-08-24 선택' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '2024-08-04 선택' })).not.toBeChecked();
    expect(screen.getByTestId('estimate-bytes')).toHaveTextContent('2.0 GB');
    expect(screen.getByTestId('estimate-time')).toHaveTextContent('약 10분');
    expect(panel()).not.toHaveTextContent('날짜를 줄이면 빨라집니다');

    fireEvent.click(screen.getByRole('button', { name: '전체' }));
    expect(count()).toHaveTextContent('선택 5 / 전체 5개 날짜');
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(estimate.mock.calls.length).toBe(calls);
  });

  test('모두 해제하면 다음이 막히고, 영역을 바꿔 다시 추정하면 전체 선택으로 돌아간다', async () => {
    jest.spyOn(generation, 'estimateGee').mockResolvedValue(ESTIMATE);
    await toAreaStep();
    await dateTable();
    expect(next()).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '모두 해제' }));
    expect(count()).toHaveTextContent('선택 0 / 전체 5개 날짜');
    expect(screen.getByRole('alert')).toHaveTextContent('날짜를 하나 이상 고르세요');
    expect(next()).toBeDisabled();
    expect(screen.getByTestId('estimate-time')).toHaveTextContent('—');
    fireEvent.click(screen.getByRole('radio', { name: '20 km' }));
    await waitFor(() => expect(count()).toHaveTextContent('선택 5 / 전체 5개 날짜'), { timeout: T });
    expect(next()).toBeEnabled();
  });

  test('일부만 고르면 생성 요청에 selectedDates(정렬)를 넣고, 확인 단계에 개수·목록을 보여 준다', async () => {
    const estimate = jest.spyOn(generation, 'estimateGee').mockResolvedValue(ESTIMATE);
    const create = jest.spyOn(generation, 'createGeeJob');
    await toAreaStep();
    await dateTable();
    fireEvent.click(screen.getByRole('checkbox', { name: '2024-08-14 선택' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '2024-08-04 선택' }));
    const start = await toConfirm();
    expect(screen.getByText('선택 3 / 전체 5개 날짜')).toBeInTheDocument();
    expect(screen.getByText('고른 날짜 보기')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: '고른 날짜' })).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['2024-08-09', '2024-08-19', '2024-08-24']);
    await waitFor(() => expect(screen.getByTestId('estimate-bytes')).toHaveTextContent('3.0 GB'), { timeout: T });
    fireEvent.click(start);
    await waitFor(() => expect(create).toHaveBeenCalled(), { timeout: T });
    expect((create.mock.calls[0][0] as any).selectedDates).toEqual(['2024-08-09', '2024-08-19', '2024-08-24']);
    // The estimate stays unfiltered so the whole list keeps showing.
    for (const call of estimate.mock.calls) expect(call[0]).not.toHaveProperty('selectedDates');
  });

  test('전체를 고르면 selectedDates를 보내지 않는다', async () => {
    jest.spyOn(generation, 'estimateGee').mockResolvedValue(ESTIMATE);
    const create = jest.spyOn(generation, 'createGeeJob');
    await toAreaStep();
    await dateTable();
    fireEvent.click(await toConfirm());
    await waitFor(() => expect(create).toHaveBeenCalled(), { timeout: T });
    expect(create.mock.calls[0][0]).not.toHaveProperty('selectedDates');
  });

  test('서버가 dates를 보내지 않으면 표 없이 예전처럼 진행한다', async () => {
    const { dates, bytesPerDate, estimatedSeconds, ...older } = ESTIMATE;
    jest.spyOn(generation, 'estimateGee').mockResolvedValue(older);
    const create = jest.spyOn(generation, 'createGeeJob');
    await toAreaStep();
    await waitFor(() => expect(panel()).toHaveTextContent('예상 장면 수'), { timeout: T });
    expect(panel()).toHaveTextContent('8개');
    expect(screen.queryByRole('region', { name: '날짜 고르기' })).toBeNull();
    expect(screen.queryByTestId('estimate-time')).toBeNull();
    const start = await toConfirm();
    expect(screen.queryByText(/전체 5개 날짜/)).toBeNull();
    fireEvent.click(start);
    await waitFor(() => expect(create).toHaveBeenCalled(), { timeout: T });
    expect(create.mock.calls[0][0]).not.toHaveProperty('selectedDates');
  });

  test('짝 맞춤이면 레이더 열이 같은 표에 붙고, 짝 없는 날짜는 흐리게, 체크하면 설정대로 안내한다', async () => {
    const withS1 = DATES.map((item, index) => ({ ...item, s1: index === 3 ? null : { date: item.date, daysApart: index === 2 ? 9.5 : 0.6, orbitPass: 'DESCENDING', coverage: 1 } }));
    jest.spyOn(generation, 'estimateGee').mockResolvedValue({ ...ESTIMATE, dates: withS1 });
    await toAreaStep(/Sentinel-2 L2A/);
    const table = await screen.findByRole('table', { name: '날짜 고르기 · 광학·레이더 날짜 짝' }, { timeout: T });
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['선택', '구름 순위', '날짜', '구름 %', '장면', '레이더 날짜', '차이(일)']);
    fireEvent.click(screen.getByRole('button', { name: '날짜순' }));
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('하강');
    expect(rows[2]).toHaveTextContent('주의');
    expect(rows[3]).toHaveClass('is-unpaired');
    expect(rows[3]).toHaveTextContent('레이더 없음 – 제외');
    // Every date is checked by default, the unpaired one included.
    expect(screen.getByText(/레이더 짝이 없는 날짜 1개를 골랐습니다\. 이 날짜는 생성할 때 빠집니다/)).toBeInTheDocument();
    expect(screen.getByTestId('estimate-times')).toHaveTextContent('짝 없는 1개 빠짐');
    fireEvent.click(screen.getByRole('checkbox', { name: '2024-08-19 선택' }));
    expect(screen.queryByText(/레이더 짝이 없는 날짜/)).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: '2024-08-19 선택' }));
    fireEvent.click(screen.getByRole('button', { name: '레이더 없이 남기기' }));
    expect(await screen.findByText(/이 날짜는 레이더 없이 생성됩니다/, undefined, { timeout: T })).toBeInTheDocument();
    // Only the unpaired date with "빼기" leaves nothing to make.
    fireEvent.click(screen.getByRole('button', { name: '빼기' }));
    await screen.findByRole('table', { name: '날짜 고르기 · 광학·레이더 날짜 짝' }, { timeout: T });
    fireEvent.click(screen.getByRole('button', { name: '모두 해제' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '2024-08-19 선택' }));
    expect(next()).toBeDisabled();
  });
});

describe('100% 덮는 날짜만 (UR-45)', () => {
  const DateTable = require('./DateTable').default;
  const { blockerText } = require('./areaModel');

  test('다 덮지 못한 날짜는 표에 없고 뺀 날짜로 알려 준다', () => {
    const data = { ...ESTIMATE, dates: DATES.filter((item) => item.coverage === 1), excludedDates: [{ date: '2024-08-14', coverage: 0.82 }, { date: '2024-08-24', coverage: 0.97 }] };
    render(<DateTable data={data} picked={['2024-08-04']} onChange={jest.fn()} />);
    const table = screen.getByRole('table', { name: '날짜 고르기' });
    expect(within(table).queryByText('2024-08-14')).not.toBeInTheDocument();
    expect(screen.getByText(/위치를 100% 덮는 날짜만 보여 줍니다/)).toHaveTextContent('다 덮지 못해 뺀 날짜 2개: 2024-08-14(82%), 2024-08-24(97%)');
  });

  test('하나도 없으면 없다고 알려 준다', () => {
    expect(blockerText('NO_FULL_COVER_DATE')).toBe('고른 기간에 이 위치를 100% 덮는 영상이 없습니다. 기간을 넓히거나 위치를 옮겨 보세요.');
  });
});

test('100% 덮는 날짜가 없으면 레이더 없음 대신 그 문구 하나만 보인다', () => {
  const { withPairingBlockers } = require('./sarModel');
  const data = { ...ESTIMATE, dates: [], excludedDates: [{ date: '2024-08-06', coverage: 0 }], pairs: [], pairedCount: 0, unpairedCount: 0, blockers: ['NO_FULL_COVER_DATE', 'NO_S1_MATCH'] };
  expect(withPairingBlockers(data, true)).toEqual(['NO_FULL_COVER_DATE']);
});

test('날짜 목록을 못 받으면 이유와 함께 막는다 (UR-46)', () => {
  const { blockerText } = require('./areaModel');
  expect(blockerText('DATE_LIST_UNAVAILABLE')).toMatch(/날짜 목록을 받지 못했습니다/);
});

describe('영역 안 구름으로 고르기 (UR-47)', () => {
  const DateTable = require('./DateTable').default;
  const NOISY = [
    { date: '2025-04-11', sceneCount: 2, cloudPercent: 0.1, noisePercent: 1.1, coverage: 1 },
    { date: '2025-07-10', sceneCount: 2, cloudPercent: 1.3, noisePercent: 0, coverage: 1 },
    { date: '2025-11-07', sceneCount: 1, cloudPercent: 13.3, noisePercent: 1.0, coverage: 1 },
    { date: '2025-05-21', sceneCount: 2, cloudPercent: 98.6, noisePercent: 100, coverage: 1 },
  ];

  test('영역 안 구름·그림자 %로 순위를 매기고, 개수를 적으면 그만큼 바로 고른다', () => {
    const onChange = jest.fn();
    render(<DateTable data={{ ...ESTIMATE, dates: NOISY }} picked={NOISY.map((item) => item.date)} onChange={onChange} />);
    const table = screen.getByRole('table', { name: '날짜 고르기' });
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['선택', '구름 순위', '날짜', '영역 구름·그림자 %', '타일 구름 %', '장면']);
    // Tile cloud 13.3 % but 1.0 % over the area ranks second.
    expect(within(table).getAllByRole('row').slice(1).map((row) => row.textContent?.slice(1, 11))).toEqual(['2025-07-10', '2025-11-07', '2025-04-11', '2025-05-21']);
    fireEvent.change(screen.getByLabelText('만들 날짜 수'), { target: { value: '1' } });
    expect(onChange).toHaveBeenLastCalledWith(['2025-07-10']);
    fireEvent.change(screen.getByLabelText('만들 날짜 수'), { target: { value: '3' } });
    expect(onChange).toHaveBeenLastCalledWith(['2025-04-11', '2025-07-10', '2025-11-07']);
    fireEvent.change(screen.getByLabelText('만들 날짜 수'), { target: { value: '9' } });
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});

test('경고는 한국어로, 용량 경고는 고른 날짜 기준으로 다시 판단한다', () => {
  const { estimateWarnings, warningText } = require('./areaModel');
  const GB = 1024 ** 3;
  expect(estimateWarnings(['ESTIMATED_SIZE_EXCEEDS_5_GIB'], { bytes: 0.6 * GB }, false)).toEqual([]);
  expect(estimateWarnings([], { bytes: 6 * GB }, false)).toEqual(['ESTIMATED_SIZE_EXCEEDS_5_GIB']);
  expect(estimateWarnings(['ESTIMATED_SIZE_EXCEEDS_5_GIB'], null, false)).toEqual(['ESTIMATED_SIZE_EXCEEDS_5_GIB']);
  expect(estimateWarnings(['GEE_SCENE_COUNT_UNAVAILABLE'], null, true)).toEqual([]);
  expect(warningText('ESTIMATED_SIZE_EXCEEDS_5_GIB')).toMatch(/5 GB를 넘습니다/);
  expect(warningText('SOMETHING_NEW')).toBe('SOMETHING_NEW');
});
