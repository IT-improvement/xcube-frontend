/* GEE area step (UR-39) in demo mode: bbox math, tabs, admin search, Shapefile upload, estimate blockers, request body. */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

jest.mock('../../api', () => ({ activeViewerAdapter: { getProjects: jest.fn(), getDatasets: jest.fn(), getProjectDatasets: jest.fn(), getJobs: jest.fn() }, useMockApi: true }));
jest.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 1, name: '홍길동' }, signOut: jest.fn() }) }));

const adapter = require('../../api').activeViewerAdapter as Record<string, jest.Mock>;
const { generation } = require('../api');
const { bboxAreaKm2, pointBbox, resolveArea, emptyArea } = require('./areaModel');
const AddDataPage = require('./AddDataPage').default;

const T = 4000;
beforeEach(() => {
  adapter.getProjects.mockResolvedValue([]);
  adapter.getDatasets.mockResolvedValue([]);
});
afterEach(() => jest.restoreAllMocks());

describe('지점 + 크기 bbox 계산', () => {
  test('정사각형이고 경도 폭은 위도로 보정한다', () => {
    const [west, south, east, north] = pointBbox(127.5, 36.454, 20);
    expect(north - south).toBeCloseTo(20 / 111.32, 5);
    expect(east - west).toBeCloseTo(20 / (111.32 * Math.cos((36.454 * Math.PI) / 180)), 5);
    expect((west + east) / 2).toBeCloseTo(127.5, 5);
    expect((south + north) / 2).toBeCloseTo(36.454, 5);
    // Both sides measure about 20 km on the ground.
    expect(bboxAreaKm2([west, south, east, north])).toBeCloseTo(400, 0);
  });
  test('위도가 높을수록 경도 폭이 넓어진다', () => {
    const equator = pointBbox(0, 0, 10);
    const high = pointBbox(0, 60, 10);
    expect(equator[2] - equator[0]).toBeCloseTo(equator[3] - equator[1], 6);
    expect((high[2] - high[0]) / (high[3] - high[1])).toBeCloseTo(2, 2);
  });
  test('크기 범위(1~200 km)와 좌표를 검사한다', () => {
    const base = { ...emptyArea(), lon: '127.5', lat: '36.4' };
    expect(resolveArea({ ...base, sizeChip: 'custom', customSize: '0' }).error).toMatch(/1~200 km/);
    expect(resolveArea({ ...base, sizeChip: 'custom', customSize: '201' }).error).toMatch(/1~200 km/);
    expect(resolveArea({ ...base, sizeChip: 'custom', customSize: '200' }).error).toBe('');
    expect(resolveArea({ ...base, lon: '200' }).error).toMatch(/경도/);
  });
});

function renderWizard() {
  return render(<MemoryRouter initialEntries={['/app/data/new']}><Routes><Route path="/app/data/new" element={<AddDataPage />} /></Routes></MemoryRouter>);
}
async function toAreaStep() {
  renderWizard();
  fireEvent.click(await screen.findByRole('radio', { name: /Google Earth Engine/ }));
  fireEvent.click(screen.getByRole('button', { name: /다음/ }));
  fireEvent.click(await screen.findByRole('radio', { name: /Sentinel-2 L2A/ }));
  fireEvent.change(screen.getByLabelText('시작 날짜'), { target: { value: '2026-05-01' } });
  fireEvent.change(screen.getByLabelText('끝 날짜'), { target: { value: '2026-05-31' } });
}
const preview = () => screen.getByTestId('area-preview');
const setPoint = (lon: string, lat: string) => {
  fireEvent.change(screen.getByLabelText('중심 경도'), { target: { value: lon } });
  fireEvent.change(screen.getByLabelText('중심 위도'), { target: { value: lat } });
};

describe('GEE 영역 단계', () => {
  test('기본은 지점 + 크기 탭이고, 탭을 바꿔도 지도 미리보기가 현재 탭의 영역과 맞는다', async () => {
    await toAreaStep();
    expect(screen.getByRole('tab', { name: '지점 + 크기' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/20~40 km를 자주 씁니다/)).toBeInTheDocument();
    expect(preview()).toHaveTextContent('지도를 눌러 중심을 고르세요.');
    setPoint('127.502', '36.454');
    expect(preview()).toHaveTextContent('중심 127.5020, 36.4540 · 한 변 20 km');
    expect(preview()).toHaveTextContent('400 km²');
    fireEvent.click(screen.getByRole('radio', { name: '5 km' }));
    expect(preview()).toHaveTextContent('한 변 5 km');

    fireEvent.click(screen.getByRole('tab', { name: '사각형' }));
    expect(preview()).toHaveTextContent('지도를 끌어 사각형을 그리세요.');
    fireEvent.change(screen.getByLabelText('좌하단 경도'), { target: { value: '126.5' } });
    fireEvent.change(screen.getByLabelText('좌하단 위도'), { target: { value: '35' } });
    fireEvent.change(screen.getByLabelText('우상단 경도'), { target: { value: '127' } });
    fireEvent.change(screen.getByLabelText('우상단 위도'), { target: { value: '35.5' } });
    expect(preview()).toHaveTextContent('경도 126.5000 ~ 127.0000, 위도 35.0000 ~ 35.5000');

    fireEvent.click(screen.getByRole('tab', { name: '지점 + 크기' }));
    expect(preview()).toHaveTextContent('중심 127.5020, 36.4540 · 한 변 5 km');
    expect(screen.getByLabelText('중심 경도')).toHaveValue(127.502);
  });

  test('직접 입력 크기는 1~200 km를 벗어나면 알림으로 알려 준다', async () => {
    await toAreaStep();
    setPoint('127.5', '36.4');
    fireEvent.click(screen.getByRole('radio', { name: '직접 입력' }));
    fireEvent.change(screen.getByLabelText(/한 변 크기 \(km/), { target: { value: '500' } });
    expect(screen.getByRole('alert')).toHaveTextContent('1~200 km');
  });

  test('행정구역을 검색해 고르면 지도에 반영되고 출처를 보여 준다', async () => {
    await toAreaStep();
    fireEvent.click(screen.getByRole('tab', { name: '행정구역' }));
    expect(screen.getByText(/경계: 통계청 SGIS\(공공누리 1유형\), admdongkor\(CC BY 4.0\)/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('행정구역 이름 검색'), { target: { value: '제주' } });
    const list = await screen.findByRole('list', { name: '행정구역 검색 결과' }, { timeout: T });
    expect(within(list).getAllByRole('button')).toHaveLength(3);
    // 시도 chip narrows to the province.
    fireEvent.click(screen.getByRole('radio', { name: '시군구' }));
    await waitFor(() => expect(within(screen.getByRole('list', { name: '행정구역 검색 결과' })).getAllByRole('button')).toHaveLength(2), { timeout: T });
    fireEvent.click(within(screen.getByRole('list', { name: '행정구역 검색 결과' })).getByRole('button', { name: /제주시/ }));
    await waitFor(() => expect(preview()).toHaveTextContent('제주특별자치도 제주시'), { timeout: T });
    expect(screen.getByRole('radio', { name: '경계로 자르기' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('checkbox', { name: /경계선 표시 변수 저장/ })).toBeEnabled();
    fireEvent.click(screen.getByRole('radio', { name: '사각형 그대로' }));
    expect(screen.getByRole('checkbox', { name: /경계선 표시 변수 저장/ })).toBeDisabled();
    expect(screen.getByText(/경계: 통계청 SGIS/)).toBeInTheDocument();
  });

  test('Shapefile에 다각형이 여러 개면 전체 합치기 또는 속성 값 고르기를 묻는다', async () => {
    await toAreaStep();
    fireEvent.click(screen.getByRole('tab', { name: '내 영역(Shape)' }));
    expect(await screen.findByRole('list', { name: '저장된 영역' }, { timeout: T })).toHaveTextContent('제주 연구 구역');
    fireEvent.change(screen.getByLabelText('Shapefile ZIP 선택'), { target: { files: [new File(['x'], 'multi_sgg.zip', { type: 'application/zip' })] } });
    expect(screen.getByLabelText('영역 이름')).toHaveValue('multi_sgg');
    fireEvent.click(screen.getByRole('button', { name: '영역으로 저장' }));
    expect(await screen.findByRole('radio', { name: '전체 합치기' }, { timeout: T })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '속성 값으로 고르기' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: '속성 값으로 고르기' }));
    expect(screen.getByLabelText('속성')).toHaveValue('sgg_nm_k');
    fireEvent.change(screen.getByLabelText('값'), { target: { value: '서귀포시' } });
    fireEvent.click(screen.getByRole('button', { name: '이 방식으로 저장' }));
    expect(await screen.findByText(/“multi_sgg” 영역을 저장했습니다/, undefined, { timeout: T })).toBeInTheDocument();
    await waitFor(() => expect(preview()).toHaveTextContent('multi_sgg'), { timeout: T });
  });

  test('저장된 영역은 확인 후 삭제한다', async () => {
    await toAreaStep();
    fireEvent.click(screen.getByRole('tab', { name: '내 영역(Shape)' }));
    await screen.findByRole('list', { name: '저장된 영역' }, { timeout: T });
    fireEvent.click(screen.getByRole('button', { name: '제주 연구 구역 삭제' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('삭제할까요');
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '삭제' }));
    expect(await screen.findByText(/저장된 영역이 없습니다|영역을 삭제했습니다/, undefined, { timeout: T })).toBeInTheDocument();
  });

  test('내 Shapefile 데이터에서 영역을 가져온다', async () => {
    await toAreaStep();
    fireEvent.click(screen.getByRole('tab', { name: '내 영역(Shape)' }));
    fireEvent.click(screen.getByRole('button', { name: '내 Shapefile 데이터에서 가져오기' }));
    const list = await screen.findByRole('list', { name: '내 Shapefile 데이터' }, { timeout: T });
    fireEvent.click(within(list).getByRole('button', { name: /제주 시군구 Shapefile 가져오기/ }));
    await waitFor(() => expect(preview()).toHaveTextContent('제주 시군구 Shapefile'), { timeout: T });
  });

  test('차단 사유가 있으면 다음 단계로 갈 수 없다', async () => {
    jest.spyOn(generation, 'estimateGee').mockResolvedValue({ areaKm2: 40000, grid: { width: 9000, height: 9000 }, scenes: 900, estimatedBytes: 6e10, requestTiles: 40, warnings: ['예상 용량이 5 GB를 넘습니다.'], blockers: ['QUOTA_EXCEEDED'] });
    await toAreaStep();
    setPoint('127.5', '36.4');
    expect(await screen.findByText(/저장 용량 한도를 넘어/, undefined, { timeout: T })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('서버가 40개로 나눠 받습니다.')).toBeInTheDocument();
    expect(screen.getByText('예상 용량이 5 GB를 넘습니다.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /다음/ })).toBeDisabled();
    // Changing the area drops the stale estimate and re-enables the button until the new one arrives.
    jest.spyOn(generation, 'estimateGee').mockResolvedValue({ areaKm2: 400, grid: { width: 100, height: 100 }, scenes: 6, estimatedBytes: 1e6, requestTiles: 1, warnings: [], blockers: [] });
    fireEvent.click(screen.getByRole('radio', { name: '5 km' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /다음/ })).toBeEnabled(), { timeout: T });
  });

  test('예상 크기에 면적·격자·장면 수·용량이 표시된다', async () => {
    await toAreaStep();
    setPoint('127.5', '36.4');
    const panel = screen.getByRole('region', { name: '예상 크기' });
    await waitFor(() => expect(panel).toHaveTextContent('예상 장면 수'), { timeout: T });
    expect(panel).toHaveTextContent('400 km²');
    expect(panel).toHaveTextContent('px');
    expect(panel).toHaveTextContent(/KB|MB|GB/);
  });

  test('요청에 area와 bounds(외곽 사각형)를 함께 보낸다', async () => {
    const create = jest.spyOn(generation, 'createGeeJob');
    await toAreaStep();
    setPoint('127.502', '36.454');
    fireEvent.click(screen.getByRole('checkbox', { name: /영역을 완전히 덮는 장면만/ }));
    await waitFor(() => expect(screen.getByRole('region', { name: '예상 크기' })).toHaveTextContent('예상 장면 수'), { timeout: T });
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));
    fireEvent.click(await screen.findByRole('button', { name: /다음/ }));
    fireEvent.change(screen.getByLabelText('데이터 이름'), { target: { value: '충주 S2' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /B8/ }));
    fireEvent.change(screen.getByLabelText('B8 표시 최솟값'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('B8 표시 최댓값'), { target: { value: '4000' } });
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));
    expect(await screen.findByText(/지점 \+ 크기 · 중심 127.5020, 36.4540 · 한 변 20 km/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: '생성 시작' }));
    await waitFor(() => expect(create).toHaveBeenCalled(), { timeout: T });
    const body = create.mock.calls[0][0] as any;
    expect(body.area).toEqual({ mode: 'point', point: { lon: 127.502, lat: 36.454, sizeKm: 20 }, clip: 'bbox', fullCoverOnly: true, maskVariable: false });
    expect(body.bounds).toEqual({ west: pointBbox(127.502, 36.454, 20)[0], south: pointBbox(127.502, 36.454, 20)[1], east: pointBbox(127.502, 36.454, 20)[2], north: pointBbox(127.502, 36.454, 20)[3] });
  });
});
