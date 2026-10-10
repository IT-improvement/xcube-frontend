/* SVG path/cursor geometry is part of the Viewer regression baseline. */
/* eslint-disable testing-library/no-node-access */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import Viewer from '.';
import { viewerAdapter } from '../../api/viewerAdapter';

jest.mock('../../components/map', () => ({
  __esModule: true,
  default: ({ onPixelSelect }: { onPixelSelect?: (coordinate: [number, number]) => void }) => (
    <button type="button" aria-label="테스트 지도" onClick={() => onPixelSelect?.([14300000, 4200000])}>OpenLayers 배경지도</button>
  ),
}));

jest.mock('../../components/xcubeLayer', () => ({ __esModule: true, default: jest.fn().mockResolvedValue(undefined) }));
jest.mock('ol/proj', () => ({ toLonLat: (coordinate: [number, number]) => coordinate }));
jest.mock('../../api', () => { const actual = jest.requireActual('../../api/viewerAdapter'); return { activeViewerAdapter: actual.viewerAdapter, useMockApi: true }; });

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query) => ({ matches: false, media: query, onchange: null, addEventListener: jest.fn(), removeEventListener: jest.fn(), addListener: jest.fn(), removeListener: jest.fn(), dispatchEvent: jest.fn() })),
  });
});

test('Zarr를 선택하기 전에는 배경지도만 유지하고 데이터 도구를 숨긴다', async () => {
  render(<Viewer />);
  await screen.findByRole('option', { name: '한강 수체 모니터링' });
  expect(screen.getByRole('button', { name: '테스트 지도' })).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: '시계열 탐색기' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /AI 수체 추출/ })).not.toBeInTheDocument();
  expect(screen.queryByText('원본 영상')).not.toBeInTheDocument();
});

test('원본 Zarr 선택 후 시간 도구와 원본 레이어만 표시한다', async () => {
  render(<Viewer />);
  const selector = await screen.findByRole('combobox', { name: '데이터 또는 Zarr 선택' });
  fireEvent.click(selector);
  fireEvent.click(await screen.findByRole('option', { name: /Sentinel-2/ }));
  expect(await screen.findByRole('region', { name: '시계열 탐색기' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /AI 수체 추출/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '결과' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '레이어 및 AI 작업 패널 열기' }));
  expect(screen.getByText('원본 영상')).toBeInTheDocument();
  expect(screen.queryByText('AI 결과 Zarr')).not.toBeInTheDocument();
});

test('연결된 infer 결과가 있는 Zarr에서만 결과 UI를 표시하고 픽셀 클릭 시 그래프를 연다', async () => {
  render(<Viewer />);
  const selector = await screen.findByRole('combobox', { name: '데이터 또는 Zarr 선택' });
  fireEvent.click(selector);
  fireEvent.click(await screen.findByRole('option', { name: /Landsat-8/ }));
  expect(await screen.findByRole('button', { name: '결과' })).toBeInTheDocument();
  expect(screen.queryByRole('img', { name: /시계열 그래프/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '테스트 지도' }));
  expect(screen.queryByRole('img', { name: /시계열 그래프/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '픽셀 값 조회' }));
  fireEvent.click(screen.getByRole('button', { name: '테스트 지도' }));
  const graph = screen.getByRole('img', { name: /시계열 그래프/ });
  expect(graph).toHaveAttribute('viewBox', '0 0 900 260');
  expect(graph).toHaveAccessibleName(/Landsat-8.*EPSG:4326.*경도.*위도.*유효 7개/);
  expect(screen.queryByText(/유효 7 \/ 전체 8/)).not.toBeInTheDocument();
  expect(screen.queryByText('EPSG:3857')).not.toBeInTheDocument();
  expect(screen.queryByText('EPSG:4326')).not.toBeInTheDocument();
  expect(screen.queryByText('경도 14300000.00000°')).not.toBeInTheDocument();
  expect(screen.queryByText('위도 4200000.00000°')).not.toBeInTheDocument();
  expect(screen.queryByText('전체 시계열')).not.toBeInTheDocument();
  expect(screen.queryByText('최소')).not.toBeInTheDocument();
  expect(screen.queryByText('최대')).not.toBeInTheDocument();
  expect(screen.queryByText('평균')).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: '시계열 탐색기' })?.querySelector('svg[role="img"]')).toBeNull();
  expect(graph.querySelectorAll('path.line')).toHaveLength(2);
  const initialX = graph.querySelector('.current-time .cursor')?.getAttribute('x1');
  fireEvent.change(screen.getByRole('slider', { name: '관측 시점' }), { target: { value: '1' } });
  expect(screen.getByRole('img', { name: /시계열 그래프/ }).querySelector('.current-time .cursor')?.getAttribute('x1')).not.toBe(initialX);
  fireEvent.click(screen.getByRole('button', { name: /AI 수체 추출/ }));
  expect(screen.getByRole('complementary', { name: 'AI 수체 추출 설정' })).toBeInTheDocument();
  expect(screen.queryByRole('complementary', { name: '픽셀 시계열 분석' })).not.toBeInTheDocument();
  expect(screen.getByRole('img', { name: /시계열 그래프/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '픽셀 그래프 아래로 숨기기' }));
  expect(screen.queryByRole('img', { name: /시계열 그래프/ })).not.toBeInTheDocument();
  const expand = screen.getByRole('button', { name: '픽셀 그래프 위로 펼치기' });
  expect(expand).toHaveAttribute('aria-expanded', 'false');
  fireEvent.change(screen.getByRole('slider', { name: '관측 시점' }), { target: { value: '2' } });
  fireEvent.click(expand);
  expect(screen.getByRole('img', { name: /시계열 그래프/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '픽셀 선택 지우기' }));
  expect(screen.queryByRole('img', { name: /시계열 그래프/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '픽셀 선택 지우기' })).not.toBeInTheDocument();
});

test('Zarr 목록을 검색하고 키보드로 선택할 수 있다', async () => {
  render(<Viewer />);
  const selector = await screen.findByRole('combobox', { name: '데이터 또는 Zarr 선택' });
  fireEvent.click(selector);
  await screen.findByRole('option', { name: /Sentinel-2/ });
  fireEvent.change(screen.getByRole('textbox', { name: 'Zarr 검색' }), { target: { value: 'sentinel' } });
  expect(screen.getByRole('option', { name: /Sentinel-2/ })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: /Landsat-8/ })).not.toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Zarr 검색' }), { key: 'Enter' });
  expect(selector).toHaveTextContent('Sentinel-2');
});

test('45개 Zarr 목록에서 마지막 항목을 검색해 선택할 수 있다', async () => {
  const datasets = Array.from({ length: 45 }, (_, index) => ({
    id: `dataset-${index + 1}`,
    projectId: index % 2 ? 'han-river' : '',
    projectName: index % 2 ? '한강 수체 모니터링' : undefined,
    accessType: index % 3 ? 'OWNED' as const : 'SHARED' as const,
    name: `테스트 데이터셋 ${String(index + 1).padStart(2, '0')}`,
    subtitle: 'AVAILABLE',
    xcubeDatasetId: `xcube_dataset_${index + 1}`,
    defaultVariable: 'red',
    variables: ['red'],
    times: [],
  }));
  const getDatasets = jest.spyOn(viewerAdapter, 'getDatasets').mockResolvedValueOnce(datasets);
  render(<Viewer />);
  const selector = await screen.findByRole('combobox', { name: '데이터 또는 Zarr 선택' });
  fireEvent.click(selector);
  const search = await screen.findByRole('textbox', { name: 'Zarr 검색' });
  fireEvent.change(search, { target: { value: 'xcube_dataset_45' } });
  const last = await screen.findByRole('option', { name: /테스트 데이터셋 45/ });
  fireEvent.click(last);
  expect(selector).toHaveTextContent('테스트 데이터셋 45');
  expect(selector).toHaveAttribute('aria-expanded', 'false');
  getDatasets.mockRestore();
});

test('레이어 패널은 기본 접힘이며 열기와 닫기를 반복할 수 있다', async () => {
  render(<Viewer />);
  await screen.findByRole('option', { name: '한강 수체 모니터링' });
  fireEvent.click(screen.getByRole('button', { name: '레이어 및 AI 작업 패널 열기' }));
  expect(screen.getByRole('complementary', { name: '레이어 및 AI 작업 패널' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
  expect(screen.queryByRole('complementary', { name: '레이어 및 AI 작업 패널' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '레이어 및 AI 작업 패널 열기' })).toBeInTheDocument();
});

test('데이터 추가는 관리 화면을 새 탭으로 연다', async () => {
  render(<Viewer />);
  await screen.findByRole('option', { name: '한강 수체 모니터링' });
  const add = screen.getByRole('link', { name: 'Zarr 업로드 또는 생성' });
  expect(add).toHaveAttribute('href', '/app/data/new');
  expect(add).toHaveAttribute('target', '_blank');
});

test('프로젝트 버튼의 작은 창에서 새 프로젝트를 만들고 바로 전환한다', async () => {
  render(<Viewer />);
  await screen.findByRole('option', { name: '한강 수체 모니터링' });
  fireEvent.click(screen.getByRole('button', { name: '프로젝트 관리' }));
  const panel = screen.getByRole('dialog', { name: '프로젝트 작업' });
  expect(within(panel).getByText('프로젝트 없음')).toBeInTheDocument();
  expect(within(panel).getByRole('button', { name: /지금 보는 데이터를 이 프로젝트에 추가/ })).toBeDisabled();
  expect(within(panel).getByText('지도에 데이터셋을 먼저 고르세요.')).toBeInTheDocument();
  expect(within(panel).getByRole('link', { name: /프로젝트 관리 열기/ })).toHaveAttribute('target', '_blank');
  fireEvent.click(within(panel).getByRole('button', { name: /새 프로젝트 만들기/ }));
  fireEvent.click(within(panel).getByRole('button', { name: '만들기' }));
  expect(within(panel).getByRole('alert')).toHaveTextContent('프로젝트 이름을 입력하세요.');
  fireEvent.change(within(panel).getByLabelText('프로젝트 이름'), { target: { value: '새 수체 프로젝트' } });
  fireEvent.click(within(panel).getByRole('button', { name: '만들기' }));
  expect(await screen.findByText('“새 수체 프로젝트” 프로젝트를 만들었습니다.')).toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: '프로젝트 작업' })).not.toBeInTheDocument();
  expect((screen.getByRole('combobox', { name: '프로젝트 선택' }) as HTMLSelectElement).selectedOptions[0]).toHaveTextContent('새 수체 프로젝트');
});

test('지금 보는 데이터를 선택한 프로젝트에 추가하고, 이미 있으면 막는다', async () => {
  render(<Viewer />);
  fireEvent.click(await screen.findByRole('combobox', { name: '데이터 또는 Zarr 선택' }));
  fireEvent.click(await screen.findByRole('option', { name: /Sentinel-2/ }));
  fireEvent.change(screen.getByRole('combobox', { name: '프로젝트 선택' }), { target: { value: 'nakdong-river' } });
  // The project's data now lives in the dataset picker, narrowed to the project.
  fireEvent.click(screen.getByRole('combobox', { name: '데이터 또는 Zarr 선택' }));
  expect(await screen.findByRole('listbox', { name: '낙동강 변화 분석의 데이터' })).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Zarr 검색' }), { key: 'Escape' });
  fireEvent.click(screen.getByRole('button', { name: '프로젝트 관리' }));
  const add = within(screen.getByRole('dialog', { name: '프로젝트 작업' })).getByRole('button', { name: /지금 보는 데이터를 이 프로젝트에 추가/ });
  await waitFor(() => expect(add).toBeEnabled());
  fireEvent.click(add);
  expect(await screen.findByText('“Sentinel-2 · 2025”을 “낙동강 변화 분석”에 추가했습니다.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '프로젝트 관리' }));
  expect(within(screen.getByRole('dialog', { name: '프로젝트 작업' })).getByText('이미 이 프로젝트에 있는 데이터입니다.')).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole('dialog', { name: '프로젝트 작업' }), { key: 'Escape' });
  expect(screen.queryByRole('dialog', { name: '프로젝트 작업' })).not.toBeInTheDocument();
});

test('주소로 받은 데이터셋을 목록을 불러온 뒤 한 번 선택한다', async () => {
  render(<Viewer initialDatasetId="landsat" />);
  expect(await screen.findByRole('region', { name: '시계열 탐색기' })).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: '데이터 또는 Zarr 선택' })).toHaveTextContent('Landsat-8');
});

test('데이터 고르기 안내는 3초 뒤 사라진다', async () => {
  jest.useFakeTimers();
  try {
    render(<Viewer />);
    expect(await screen.findByText('지도에 띄울 위성 데이터를 고르세요.')).toBeInTheDocument();
    act(() => { jest.advanceTimersByTime(2900); });
    expect(screen.getByText('지도에 띄울 위성 데이터를 고르세요.')).toBeInTheDocument();
    act(() => { jest.advanceTimersByTime(200); });
    expect(screen.queryByText('지도에 띄울 위성 데이터를 고르세요.')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '데이터 또는 Zarr 선택' })).toBeInTheDocument();
  } finally {
    jest.useRealTimers();
  }
});
