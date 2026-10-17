/* CMP2 (UR-64): comparison results are read in the original's 결과 비교 — two groups, a summed count, cards that put one
   comparison on the map at a time (AI layer and swipe off, banner + class legend), clearing on close, the address
   (?tool=result&comparison=) and old links, the empty state into S9, the "새 결과" dot, delete, keyboard and aria. */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import Viewer from '.';
import { activeViewerAdapter } from '../../api';
import { originComparisonsApi, toOriginComparison, withoutComparisons, keyMetricOf, comparisonCsv } from '../../api/originComparisons';
import { appApi } from '../../app/api';

jest.mock('../../components/map', () => ({ __esModule: true, default: () => <div>지도</div> }));
jest.mock('../../components/xcubeLayer', () => ({ __esModule: true, default: jest.fn().mockResolvedValue(undefined) }));
jest.mock('ol/proj', () => ({ toLonLat: (coordinate: [number, number]) => coordinate, transformExtent: (extent: number[]) => extent }));
jest.mock('../../api', () => { const actual = jest.requireActual('../../api/viewerAdapter'); return { activeViewerAdapter: actual.viewerAdapter, useMockApi: true }; });

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({ matches: false, media: query, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false }),
  });
  window.history.replaceState(null, '', '/app/viewer');
  window.localStorage.clear();
});
afterEach(() => jest.restoreAllMocks());

const rail = () => within(screen.getByRole('navigation', { name: '도구' }));
const banner = () => screen.queryByRole('group', { name: '비교 보는 중' });
async function openLandsat() {
  render(<Viewer initialDatasetId="landsat" />);
  await screen.findByRole('region', { name: '시계열 탐색기' });
  await screen.findByLabelText('AI 결과 2개, 비교 결과 3개');
  fireEvent.click(rail().getByRole('button', { name: /^결과 비교/ }));
  const panel = screen.getByRole('complementary', { name: '결과 비교' });
  await within(panel).findByRole('heading', { name: '비교 분석 결과 (3개)' });
  return panel;
}
const card = (panel: HTMLElement, name: RegExp) => within(panel).getAllByRole('listitem').find((item) => name.test(within(item).queryByRole('heading')?.textContent ?? ''))!;

test('목록 API·화면 목록에서 COMPARISON이 빠진다', async () => {
  const items = await activeViewerAdapter.getDatasets();
  expect(items.some((item) => item.kind === 'COMPARISON')).toBe(false);
  expect(withoutComparisons([{ kind: 'ORIGINAL' }, { kind: 'COMPARISON' }, { kind: 'AI_RESULT' }])).toEqual([{ kind: 'ORIGINAL' }, { kind: 'AI_RESULT' }]);
  expect((await appApi.listDatasets()).map((item) => item.id)).not.toContain('landsat-change-024');
});

test('결과 비교: 두 묶음과 숫자 합, 종류 태그(글자+아이콘)·날짜·핵심 수치, 본인 것만 삭제', async () => {
  const panel = await openLandsat();
  const count = rail().getByLabelText('AI 결과 2개, 비교 결과 3개');
  expect(count).toHaveTextContent('5');
  expect(within(panel).getByRole('heading', { name: 'AI 수체 결과' })).toBeInTheDocument();
  const change = card(panel, /시점 간 변화/);
  expect(change).toHaveTextContent('시점 변화');
  expect(change).toHaveTextContent('2025.07.03 → 2025.09.19');
  expect(change).toHaveTextContent('물 면적 증감-9.5% (-1.55 km²)');
  expect(within(change).getByRole('button', { name: /삭제$/ })).toBeInTheDocument();
  const models = card(panel, /DeepLabV3\+/);
  expect(models).toHaveTextContent('모델 간');
  expect(models).toHaveTextContent('IoU0.884');
  const reference = card(panel, /정답 대비/);
  expect(reference).toHaveTextContent('F10.892');
  expect(reference).toHaveTextContent('공유받음');
  expect(within(reference).queryByRole('button', { name: /삭제$/ })).not.toBeInTheDocument();
});

test('지도에 보기: 한 번에 하나, AI 레이어·스와이프를 끄고 띠·클래스 범례·알림을 보이고, 비교 끄기로 내린다', async () => {
  const panel = await openLandsat();
  // The rail turned the AI layer on; swipe comparison is on too.
  expect(screen.getByRole('group', { name: 'AI 결과 범례' })).toBeInTheDocument();
  fireEvent.click(within(screen.getByRole('group', { name: '표시 방식' })).getByRole('button', { name: /스와이프/ }));
  const change = card(panel, /시점 간 변화/);
  const show = within(change).getByRole('button', { name: /지도에 보기$/ });
  expect(show).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(show);
  expect(show).toHaveAttribute('aria-pressed', 'true');
  expect(banner()).toHaveTextContent('비교 보는 중: 수체 시점 간 변화 (데모 비교) · 2025.07.03 → 2025.09.19');
  expect(banner()).toHaveTextContent('T1→T2 결과(시간자와 무관)');
  expect(screen.queryByRole('group', { name: 'AI 결과 범례' })).not.toBeInTheDocument();
  expect(within(screen.getByRole('group', { name: '표시 방식' })).getByRole('button', { name: /단일/ })).toHaveAttribute('aria-pressed', 'true');
  const legend = screen.getByRole('group', { name: '비교 범례: 시점 간 변화' });
  expect(within(legend).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['유지 (물 → 물)12.84 km²', '새로 생김1.92 km²', '사라짐3.47 km²', '투명: 변화 없음']);
  expect(screen.getByText(/비교를 지도에 올렸습니다/)).toBeInTheDocument();
  expect(window.location.search).toContain('comparison=landsat-change-024');
  expect(window.location.search).toContain('tool=result');

  // Another comparison replaces it.
  const models = within(card(panel, /DeepLabV3\+/)).getByRole('button', { name: /지도에 보기$/ });
  fireEvent.click(models);
  expect(models).toHaveAttribute('aria-pressed', 'true');
  expect(show).toHaveAttribute('aria-pressed', 'false');
  expect(banner()).toHaveTextContent('U-Net ↔ DeepLabV3+');
  expect(banner()).not.toHaveTextContent('시간자와 무관');

  // The legend folds.
  const toggle = within(screen.getByRole('group', { name: '비교 범례: 모델 간 비교' })).getByRole('button', { expanded: true });
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'false');

  // Turning the AI layer back on takes the comparison off.
  fireEvent.click(within(banner()!).getByRole('button', { name: '비교 끄기' }));
  expect(banner()).not.toBeInTheDocument();
  expect(screen.getByText('비교를 지도에서 껐습니다.')).toBeInTheDocument();
  await waitFor(() => expect(models).toHaveFocus());
  expect(window.location.search).not.toContain('comparison=');
});

test('AI 레이어를 다시 켜거나 다른 도구로 가면 비교가 내려간다', async () => {
  const panel = await openLandsat();
  fireEvent.click(within(card(panel, /시점 간 변화/)).getByRole('button', { name: /지도에 보기$/ }));
  expect(banner()).toBeInTheDocument();
  const aiLayer = within(panel).getAllByRole('checkbox', { name: /AI/ }).find((box) => !(box as HTMLInputElement).checked)!;
  fireEvent.click(aiLayer);
  expect(banner()).not.toBeInTheDocument();
  expect(screen.getByRole('group', { name: 'AI 결과 범례' })).toBeInTheDocument();

  fireEvent.click(within(card(panel, /시점 간 변화/)).getByRole('button', { name: /지도에 보기$/ }));
  expect(banner()).toBeInTheDocument();
  fireEvent.click(rail().getByRole('button', { name: '레이어' }));
  // Leaving 결과 비교 clears it (FIX4 rule).
  expect(banner()).not.toBeInTheDocument();
});

test('창을 닫거나(닫기·Esc) 데이터를 바꾸면 비교 레이어·범례·띠를 지운다', async () => {
  const panel = await openLandsat();
  fireEvent.click(within(card(panel, /시점 간 변화/)).getByRole('button', { name: /지도에 보기$/ }));
  expect(banner()).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
  expect(banner()).not.toBeInTheDocument();
  expect(screen.queryByRole('group', { name: /비교 범례/ })).not.toBeInTheDocument();

  fireEvent.click(rail().getByRole('button', { name: /^결과 비교/ }));
  const again = screen.getByRole('complementary', { name: '결과 비교' });
  await within(again).findByRole('heading', { name: '비교 분석 결과 (3개)' });
  const show = within(card(again, /시점 간 변화/)).getByRole('button', { name: /지도에 보기$/ });
  expect(show).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(show);
  fireEvent.keyDown(screen.getByRole('heading', { name: '결과 비교' }), { key: 'Escape' });
  expect(banner()).not.toBeInTheDocument();
});

test('주소 ?tool=result&comparison=로 열면 창을 열고 그 비교를 지도에 보인다', async () => {
  window.history.replaceState(null, '', '/app/viewer?dataset=landsat&tool=result&comparison=landsat-models-024');
  render(<Viewer initialDatasetId="landsat" />);
  expect(await screen.findByRole('complementary', { name: '결과 비교' })).toBeInTheDocument();
  await waitFor(() => expect(banner()).toHaveTextContent('U-Net ↔ DeepLabV3+'));
  expect(screen.queryByRole('group', { name: 'AI 결과 범례' })).not.toBeInTheDocument();
});

test('예전 링크 ?dataset={비교 id}는 원본의 결과 비교 주소로 바꾼다', async () => {
  window.history.replaceState(null, '', '/app/viewer?dataset=landsat-change-024');
  render(<Viewer initialDatasetId="landsat-change-024" />);
  expect(await screen.findByRole('heading', { name: /Landsat-8 · 2024/ })).toBeInTheDocument();
  await waitFor(() => expect(banner()).toHaveTextContent('수체 시점 간 변화 (데모 비교)'));
  expect(window.location.search).toContain('dataset=landsat');
  expect(window.location.search).toContain('comparison=landsat-change-024');
});

test('비교가 없으면 짧은 설명과 비교 분석 만들기(이 원본의 AI 결과를 미리 고름)', async () => {
  jest.spyOn(originComparisonsApi, 'list').mockResolvedValue([]);
  render(<Viewer initialDatasetId="landsat" />);
  await screen.findByLabelText('AI 결과 2개, 비교 결과 0개');
  fireEvent.click(rail().getByRole('button', { name: /^결과 비교/ }));
  const panel = screen.getByRole('complementary', { name: '결과 비교' });
  expect(await within(panel).findByRole('heading', { name: '비교 분석 결과 (0개)' })).toBeInTheDocument();
  expect(within(panel).getByText('AI 결과 둘을 시점·모델·정답과 비교하면 여기에 쌓입니다.')).toBeInTheDocument();
  expect(within(panel).getByRole('link', { name: /비교 분석 만들기/ }).getAttribute('href')).toMatch(/^\/app\/analysis\/compare\?resultId=landsat-infer-02\d$/);
});

test('비교 API가 아직 없으면(null) AI 결과만 보이고 오류는 말하지 않는다', async () => {
  jest.spyOn(originComparisonsApi, 'list').mockResolvedValue(null);
  render(<Viewer initialDatasetId="landsat" />);
  expect(await screen.findByLabelText('AI 결과 2개, 비교 결과 0개')).toHaveTextContent('2');
  fireEvent.click(rail().getByRole('button', { name: /^결과 비교/ }));
  expect(await screen.findByRole('heading', { name: '비교 분석 결과 (0개)' })).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('새 결과 점: 처음 열 때 한 번 보이고(글자 대체 있음), 결과 비교를 열면 사라진다', async () => {
  render(<Viewer initialDatasetId="landsat" />);
  expect(await rail().findByRole('img', { name: '새 비교 결과 있음' })).toBeInTheDocument();
  fireEvent.click(rail().getByRole('button', { name: /^결과 비교/ }));
  await waitFor(() => expect(rail().queryByRole('img', { name: '새 비교 결과 있음' })).not.toBeInTheDocument());
  expect(JSON.parse(window.localStorage.getItem('xcube.viewer.seenComparisons') ?? '[]')).toEqual(expect.arrayContaining(['landsat-change-024', 'landsat-models-024', 'landsat-ref-024']));
});

test('지표 자세히는 aria-expanded로 펼쳐 지표 표와 CSV를 보이고, 삭제는 확인 창을 거친다', async () => {
  const remove = jest.spyOn(appApi, 'deleteDataset').mockResolvedValue(undefined);
  const panel = await openLandsat();
  const change = card(panel, /시점 간 변화/);
  const details = within(change).getByRole('button', { name: /지표 자세히$/ });
  expect(details).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(details);
  expect(details).toHaveAttribute('aria-expanded', 'true');
  expect(within(change).getByText('물 면적 증감률')).toBeInTheDocument();
  expect(within(change).getByRole('button', { name: '지표 CSV 내려받기' })).toBeInTheDocument();

  fireEvent.click(within(change).getByRole('button', { name: /삭제$/ }));
  const dialog = screen.getByRole('alertdialog', { name: '비교 결과를 삭제할까요?' });
  fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }));
  expect(remove).toHaveBeenCalledWith('landsat-change-024');
  await waitFor(() => expect(within(panel).getByRole('heading', { name: '비교 분석 결과 (2개)' })).toBeInTheDocument());
  expect(screen.getByText('"수체 시점 간 변화 (데모 비교)" 비교 결과를 삭제했습니다.')).toBeInTheDocument();
  await waitFor(() => expect(within(panel).getByRole('heading', { name: '비교 분석 결과 (2개)' })).toHaveFocus());
});

test('API 항목 읽기: 서버 classes 색, 이름 없는 입력, 핵심 수치, CSV', () => {
  const item = toOriginComparison({
    id: 100, name: 'x', xcubeDatasetId: 'c100', compareType: 'TIME_CHANGE', times: { t1: 'a', t2: 'b' },
    sources: [{ id: 87, name: undefined, role: 'result' }], metrics: { changeRatio: -0.1174, netChangeKm2: -2.597 }, areaKm2: { kept: 18.8, gained: 0.73, lost: 3.33 },
    classes: [{ value: 1, key: 'kept', color: '#3fb4ff' }, { value: 0, key: 'unchanged', color: null }],
  });
  expect(item).toMatchObject({ id: '100', type: 'TIME_CHANGE', mapTime: 'b', classColors: { kept: '#3fb4ff' }, sources: [{ id: '87', name: '#87', role: 'result' }] });
  expect(item.info.resultId).toBe('87');
  expect(keyMetricOf(item)).toEqual({ kind: 'change', ratio: -0.1174, km2: -2.597 });
  expect(comparisonCsv(item)).toContain('areaKm2.gained,0.73');
});
