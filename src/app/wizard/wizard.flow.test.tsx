/* UR-54 (UX10): GEE in five steps, the 다음 condition of each step, focus on the first problem, the estimate kept
   while it recalculates (and the old request aborted), the suggested name, the review, and Zarr without inspection. */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LanguageProvider } from '../../i18n';

jest.mock('../../api', () => ({ activeViewerAdapter: { getProjects: jest.fn(), getDatasets: jest.fn(), getProjectDatasets: jest.fn(), getJobs: jest.fn() }, useMockApi: true }));
jest.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 1, name: '홍길동' }, signOut: jest.fn() }) }));

const adapter = require('../../api').activeViewerAdapter as Record<string, jest.Mock>;
const { generation } = require('../api');
const AddDataPage = require('./AddDataPage').default;
const { stepsFor } = require('./AddDataPage');
const { geeFlow } = require('./geeFlow.testutil');
const { suggestName, periodOf, placeOf } = require('./nameModel');
const { emptyArea } = require('./areaModel');

const T = 4000;
beforeEach(() => {
  adapter.getProjects.mockResolvedValue([]);
  adapter.getDatasets.mockResolvedValue([]);
});
afterEach(() => jest.restoreAllMocks());

function renderWizard(lang: 'ko' | 'en' = 'ko') {
  const page: ReactElement = <MemoryRouter initialEntries={['/app/data/new']}><Routes><Route path="/app/data/new" element={<AddDataPage />} /></Routes></MemoryRouter>;
  return render(<LanguageProvider initial={lang}>{page}</LanguageProvider>);
}
const stepLabels = (name = '진행 단계') => within(screen.getByRole('list', { name })).getAllByRole('listitem').map((item) => item.textContent?.replace(/^\d/, ''));
const heading = () => screen.getByRole('heading', { level: 2 });

describe('단계 구성', () => {
  test('GEE는 방식 → 자료 → 영역 → 기간·날짜 → 이름·확인 (한국어·영어)', async () => {
    expect(stepsFor('gee')).toEqual(['method', 'data', 'area', 'dates', 'review']);
    renderWizard();
    // Before a method is chosen the file flow's names stand in.
    expect(stepLabels()).toEqual(['방식 선택', '원본 입력', '자동 검사 결과', '설정', '확인 및 생성']);
    fireEvent.click(await screen.findByRole('radio', { name: /Google Earth Engine/ }));
    expect(stepLabels()).toEqual(['방식 선택', '자료', '영역', '기간·날짜', '이름·확인']);
    expect(screen.getByText('1 / 5')).toBeInTheDocument();
  });

  test('영어 화면의 GEE 단계 이름', async () => {
    renderWizard('en');
    fireEvent.click(await screen.findByRole('radio', { name: /Google Earth Engine/ }));
    expect(stepLabels('Progress')).toEqual(['Method', 'Data', 'Area', 'Period & dates', 'Name & review']);
  });

  test('파일 방식은 지금 흐름 그대로, Zarr 등록은 검사 단계 없이 4단계', async () => {
    expect(stepsFor('geotiff')).toEqual(['method', 'source', 'inspection', 'settings', 'confirm']);
    expect(stepsFor('shape')).toEqual(['method', 'source', 'inspection', 'settings', 'confirm']);
    expect(stepsFor('zarr')).toEqual(['method', 'source', 'settings', 'confirm']);
    jest.spyOn(require('../api').appApi, 'registerDataset').mockResolvedValue({ id: '7' });
    renderWizard();
    fireEvent.click(await screen.findByRole('radio', { name: /Zarr 등록/ }));
    expect(stepLabels()).toEqual(['방식 선택', '원본 입력', '설정', '확인 및 생성']);
    fireEvent.click(screen.getByRole('button', { name: /^다음/ }));
    fireEvent.change(screen.getByLabelText('Zarr 경로 / URI'), { target: { value: '/data/lake.zarr' } });
    fireEvent.click(screen.getByRole('button', { name: /^다음/ }));
    // Straight to the settings: no "자동 검사 결과" in between.
    expect(heading()).toHaveTextContent('설정');
    expect(screen.getByText('3 / 4')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('데이터 이름'), { target: { value: '호수' } });
    fireEvent.change(screen.getByLabelText('변수 이름 추가'), { target: { value: 'ndwi' } });
    fireEvent.click(screen.getByRole('button', { name: '추가' }));
    fireEvent.change(screen.getByLabelText('ndwi 표시 최솟값'), { target: { value: '-1' } });
    fireEvent.change(screen.getByLabelText('ndwi 표시 최댓값'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /^다음/ }));
    expect(heading()).toHaveTextContent('확인 및 생성');
    expect(screen.getByText(/등록하면 서버가/)).toHaveTextContent('/data/lake.zarr');
    fireEvent.click(screen.getByRole('button', { name: '등록' }));
    expect(await screen.findByRole('heading', { level: 2, name: '등록을 요청했습니다' }, { timeout: T })).toHaveFocus();
  });
});

describe('단계별 다음 조건과 첫 오류로 focus', () => {
  test('방식: 고르지 않으면 바로 아래에 이유가 나오고 focus가 방식 카드로 간다 (아래 Alert 중복 없음)', async () => {
    renderWizard();
    await screen.findByRole('radio', { name: /Google Earth Engine/ });
    fireEvent.click(screen.getByRole('button', { name: /^다음/ }));
    expect(screen.getAllByText('생성 방식을 고르세요.')).toHaveLength(1);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('radio', { name: /GeoTIFF/ })).toHaveFocus();
  });

  test('자료: 컬렉션 → band 하나 이상 (프리셋은 band가 정해져 있다)', async () => {
    const flow = geeFlow();
    renderWizard();
    await flow.toData();
    flow.clickNext();
    expect(screen.getByText('컬렉션을 고르세요.')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /수체 분석용/ })).toHaveFocus();
    flow.choose(/Landsat 9/);
    flow.clickNext();
    expect(heading()).toHaveTextContent('자료');
    expect(screen.getByText('만들 band를 하나 이상 고르세요.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'SR_B2' })).toHaveFocus();
    fireEvent.click(screen.getByRole('radio', { name: /수체 분석용/ }));
    await flow.toArea();
    expect(heading()).toHaveTextContent('영역');
  });

  test('영역: 영역이 없으면 이유를 필드 옆에 두고 경도 칸으로 focus', async () => {
    const flow = geeFlow();
    renderWizard();
    await flow.toData();
    fireEvent.click(screen.getByRole('radio', { name: /수체 분석용/ }));
    await flow.toArea();
    flow.clickNext();
    expect(screen.getByText('지도를 눌러 중심을 고르거나 경도·위도를 입력하세요.')).toBeInTheDocument();
    expect(screen.getByLabelText('중심 경도')).toHaveFocus();
    flow.setPoint('127.63', '36.45');
    await flow.toDates();
    expect(heading()).toHaveTextContent('기간·날짜');
  });

  test('기간·날짜: 기간 → 추정 완료 → 차단 없음 → 날짜 1개 이상일 때만 다음', async () => {
    const flow = geeFlow();
    renderWizard();
    await flow.toData();
    fireEvent.click(screen.getByRole('radio', { name: /수체 분석용/ }));
    await flow.toArea();
    flow.setPoint('127.63', '36.45');
    await flow.toDates();
    // No period: the button works and points at the start date.
    flow.clickNext();
    expect(screen.getByLabelText('시작 날짜')).toHaveAccessibleDescription('기간을 입력하세요.');
    expect(screen.getByLabelText('시작 날짜')).toHaveFocus();
    flow.setPeriod('2024-08-01', '2024-08-31');
    // Estimate on its way: closed, with the reason next to the button.
    expect(flow.next()).toBeDisabled();
    expect(flow.next()).toHaveAccessibleDescription(/예상 크기를 계산하는 중입니다/);
    await waitFor(() => expect(flow.next()).toBeEnabled(), { timeout: T });
    // No date picked: closed again.
    fireEvent.click(screen.getByRole('button', { name: '선택 해제' }));
    expect(flow.next()).toBeDisabled();
    expect(flow.next()).toHaveAccessibleDescription(/날짜를 하나 이상 고르세요/);
    fireEvent.click(screen.getByRole('button', { name: '전체 선택' }));
    expect(flow.next()).toBeEnabled();
  });

  test('이름·확인: 이름을 지우고 생성하면 이름 칸에 이유와 focus', async () => {
    const flow = geeFlow();
    renderWizard();
    await flow.toDatesWith({ collection: /Landsat 9/, bands: ['SR_B4'], lon: '127.63', lat: '36.45', start: '2024-08-01', end: '2024-08-31' });
    await flow.toReview();
    fireEvent.change(screen.getByLabelText('데이터 이름'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '생성 시작' }));
    expect(screen.getByLabelText('데이터 이름')).toHaveFocus();
    expect(screen.getByLabelText('데이터 이름')).toHaveAccessibleDescription('데이터 이름을 입력하세요.');
  });
});

describe('예상 크기: 이전 결과 유지와 요청 취소', () => {
  test('입력이 바뀌면 진행 중인 요청을 끊고, 다시 계산하는 동안 이전 결과를 흐리게 남긴다', async () => {
    const real = generation.estimateGee;
    const signals: AbortSignal[] = [];
    const holds: Array<() => void> = [];
    jest.spyOn(generation, 'estimateGee').mockImplementation((...args: unknown[]) => {
      const [body, signal] = args as [unknown, AbortSignal];
      signals.push(signal);
      return new Promise((done) => holds.push(() => done(real(body))));
    });
    const flow = geeFlow();
    renderWizard();
    await flow.toDatesWith({ collection: /Landsat 9/, bands: ['SR_B4'], lon: '127.63', lat: '36.45', start: '2024-08-01', end: '2024-08-20' });
    await waitFor(() => expect(signals).toHaveLength(1), { timeout: T });
    // A new end date before the answer: the first request is aborted.
    fireEvent.change(screen.getByLabelText('끝 날짜'), { target: { value: '2024-08-25' } });
    expect(signals[0].aborted).toBe(true);
    await waitFor(() => expect(signals).toHaveLength(2), { timeout: T });
    expect(signals[1].aborted).toBe(false);
    await act(async () => { holds[1](); });
    const panel = screen.getByRole('region', { name: '예상 크기' });
    await waitFor(() => expect(within(panel).getByTestId('estimate-bytes')).toBeInTheDocument(), { timeout: T });
    const before = within(panel).getByTestId('estimate-bytes').textContent;

    // Recalculating: the last result stays in place, dimmed, under "다시 계산 중 · n초"; 다음 waits.
    fireEvent.change(screen.getByLabelText('끝 날짜'), { target: { value: '2024-08-31' } });
    expect(await within(panel).findByText(/다시 계산 중 · \d+초/, undefined, { timeout: T })).toBeInTheDocument();
    expect(within(panel).getByTestId('estimate-bytes')).toHaveTextContent(before!);
    expect(within(panel).getByTestId('estimate-body')).toHaveClass('is-stale');
    expect(screen.getByRole('region', { name: '날짜 고르기' })).toHaveClass('is-stale');
    expect(screen.getByRole('checkbox', { name: '2024-08-01 선택' })).toBeDisabled();
    expect(flow.next()).toBeDisabled();
    await waitFor(() => expect(signals).toHaveLength(3), { timeout: T });
    await act(async () => { holds[2](); });
    await waitFor(() => expect(within(panel).queryByText(/다시 계산 중/)).toBeNull(), { timeout: T });
    expect(within(panel).getByTestId('estimate-body')).not.toHaveClass('is-stale');
    await waitFor(() => expect(flow.next()).toBeEnabled(), { timeout: T });
  });

  test('경도·위도는 칠 때마다가 아니라 칸을 떠날 때(또는 Enter) 반영한다', async () => {
    const flow = geeFlow();
    renderWizard();
    await flow.toData();
    fireEvent.click(screen.getByRole('radio', { name: /수체 분석용/ }));
    await flow.toArea();
    const lon = screen.getByLabelText('중심 경도');
    fireEvent.change(lon, { target: { value: '127.6' } });
    fireEvent.change(screen.getByLabelText('중심 위도'), { target: { value: '36.4' } });
    // Typed but not committed yet: the map caption still asks for a point.
    expect(screen.getByTestId('area-preview')).toHaveTextContent('지도를 눌러 중심을 고르세요.');
    fireEvent.keyDown(lon, { key: 'Enter' });
    fireEvent.blur(screen.getByLabelText('중심 위도'));
    expect(screen.getByTestId('area-preview')).toHaveTextContent('중심 127.6000, 36.4000');
  });
});

describe('이름 미리 채우기', () => {
  test('장소(행정구역·내 영역 이름, 없으면 경위도)와 기간(월)', () => {
    const base = emptyArea();
    expect(periodOf('2024-08-01', '2024-08-31')).toBe('2024-08');
    expect(periodOf('2024-06-01', '2024-08-31')).toBe('2024-06–08');
    expect(periodOf('2023-11-01', '2024-02-10')).toBe('2023-11–2024-02');
    expect(periodOf('', '2024-02-10')).toBe('');
    expect(placeOf({ ...base, tab: 'shape', shape: { id: 1, name: '대청호', bbox: [127, 36, 128, 37], areaKm2: 70 } })).toBe('대청호');
    expect(placeOf({ ...base, tab: 'admin', admin: { code: '43110', level: 'sigungu', name: '청주시', parentName: '충청북도', bbox: [127, 36, 128, 37], areaKm2: 940 } })).toBe('청주시');
    expect(placeOf({ ...base, tab: 'point', lon: '127.6303', lat: '36.4541' })).toBe('127.63,36.45');
    expect(placeOf({ ...base, tab: 'box', west: '127.4', south: '36.3', east: '127.8', north: '36.6' })).toBe('127.60,36.45');
    expect(placeOf({ ...base, tab: 'point' })).toBe('');
    expect(suggestName({ ...base, tab: 'shape', shape: { id: 1, name: '대청호', bbox: [127, 36, 128, 37], areaKm2: 70 } }, '2024-08-01', '2024-08-31')).toBe('대청호 2024-08');
  });

  test('확인 단계에서 채우고, 사용자가 고친 이름은 다시 덮어쓰지 않는다', async () => {
    const flow = geeFlow();
    renderWizard();
    await flow.toDatesWith({ collection: /Landsat 9/, bands: ['SR_B4'], lon: '127.6303', lat: '36.4541', start: '2024-08-01', end: '2024-08-31' });
    await flow.toReview();
    expect(screen.getByLabelText('데이터 이름')).toHaveValue('127.63,36.45 2024-08');
    expect(screen.getByLabelText('데이터 이름')).toHaveAccessibleDescription('장소와 기간으로 미리 채웠습니다. 바꿔도 됩니다.');
    fireEvent.change(screen.getByLabelText('데이터 이름'), { target: { value: '대청호 여름' } });
    fireEvent.click(screen.getByRole('button', { name: /이전/ }));
    flow.setPeriod('2024-07-01', '2024-08-31');
    await flow.toReview();
    expect(screen.getByLabelText('데이터 이름')).toHaveValue('대청호 여름');
  });
});

describe('이름·확인 단계', () => {
  test('읽기 전용 지도, 영역 처리 문구(경계로 자르기), 예상 숫자 세 개', async () => {
    const flow = geeFlow();
    renderWizard();
    await flow.toData();
    fireEvent.click(screen.getByRole('radio', { name: /수체 분석용/ }));
    await flow.toArea();
    fireEvent.click(screen.getByRole('tab', { name: '행정구역' }));
    fireEvent.change(screen.getByLabelText('행정구역 이름 검색'), { target: { value: '제주' } });
    const list = await screen.findByRole('list', { name: '행정구역 검색 결과' }, { timeout: T });
    fireEvent.click(within(list).getByRole('button', { name: /제주시/ }));
    await screen.findByRole('radio', { name: '경계로 자르기' }, { timeout: T });
    await flow.toDates();
    flow.setPeriod('2024-08-01', '2024-08-31');
    await flow.toReview();
    expect(screen.getByLabelText('데이터 이름')).toHaveValue('제주시 2024-08');
    // The map shows the area without controls (offline in tests: the same marks as a sketch).
    expect(screen.getByRole('img', { name: /^영역 미리보기: 경도/ })).toBeInTheDocument();
    expect(screen.getByTestId('summary-clip')).toHaveTextContent('경계로 자르기');
    const estimate = screen.getByRole('region', { name: '예상 크기' });
    await waitFor(() => expect(within(estimate).getByTestId('estimate-time')).toHaveTextContent(/약 \d+분/), { timeout: T });
    expect(within(estimate).getByTestId('estimate-times')).toHaveTextContent(/\d+개/);
    expect(within(estimate).getByTestId('estimate-bytes')).toHaveTextContent(/B$/);
    expect(within(estimate).getAllByRole('term').map((term) => term.textContent)).toEqual(['시점 수', '예상 용량', '예상 시간']);
    // The preset's display settings are one line until "바꾸기"; the bands carry their RGB channel.
    expect(screen.getByText('수체 분석 기본값 (band 5 · 레이더 2 · 참조 1)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '표시 설정 바꾸기' }));
    expect(screen.getByRole('combobox', { name: 'B2 색상표' })).toHaveValue('Greys');
    expect(screen.getByRole('region', { name: 'B4 표시 설정' })).toHaveTextContent('RGB R');
    expect(screen.getByRole('region', { name: 'B4 표시 설정' })).toHaveTextContent('프리셋 값 0 ~ 3,000 (수체 분석용)');
    expect(screen.getByLabelText('빨강 (R)')).toHaveDisplayValue('red (B4)');
  });

  test('지점 영역은 "사각형 그대로"로 요약한다', async () => {
    const flow = geeFlow();
    renderWizard();
    await flow.toDatesWith({ collection: /Landsat 9/, bands: ['SR_B4'], lon: '127.63', lat: '36.45', start: '2024-08-01', end: '2024-08-31' });
    await flow.toReview();
    expect(screen.getByTestId('summary-clip')).toHaveTextContent('사각형 그대로');
  });
});

describe('결과 화면', () => {
  test('실패하면 이유와 다시 시도, 진행 중이면 진행률', async () => {
    jest.spyOn(generation, 'createGeeJob').mockResolvedValue({ id: 'j9', name: '대청호', status: 'FAILED', errorCode: 'GEE_TIMEOUT', errorMessage: 'GEE 응답 시간이 지났습니다.' });
    const retry = jest.spyOn(generation, 'retryJob').mockResolvedValue({ id: 'j10', name: '대청호', type: 'GEE_TO_ZARR', status: 'RUNNING', progress: 0.42, stage: 'convert' });
    jest.spyOn(generation, 'getJob').mockReturnValue(new Promise(() => undefined));
    const flow = geeFlow();
    renderWizard();
    await flow.toDatesWith({ collection: /Landsat 9/, bands: ['SR_B4'], lon: '127.63', lat: '36.45', start: '2024-08-01', end: '2024-08-31' });
    await flow.toReview();
    fireEvent.change(screen.getByLabelText('SR_B4 표시 최솟값'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('SR_B4 표시 최댓값'), { target: { value: '30000' } });
    fireEvent.click(await flow.createButton());
    const title = await screen.findByRole('heading', { level: 2, name: '생성에 실패했습니다' }, { timeout: T });
    expect(title).toHaveFocus();
    expect(screen.getByRole('alert')).toHaveTextContent(/^실패 사유: /);
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(retry).toHaveBeenCalledWith('j9'));
    expect(await screen.findByRole('heading', { level: 2, name: '생성 작업을 시작했습니다' })).toHaveFocus();
    expect(screen.getByRole('progressbar', { name: '진행률' })).toHaveAttribute('value', '42');
    expect(screen.getByText('42% · 변환')).toBeInTheDocument();
  });
});
