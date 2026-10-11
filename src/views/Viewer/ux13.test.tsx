// UX13 (점검 순서 7 "Viewer 접근성·모바일"): keyboard map, side-by-side space, Escape and focus return,
// roving tabs, the dataset combobox, the time slider's date and the coarse-pointer sizes.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import fs from 'fs';
import path from 'path';
import Viewer from '.';

// The real map's keys are covered in components/map/keyboard.test.tsx; this stand-in forwards Enter/Space to
// the Viewer's onPick like the real one, so the wiring (centre pick → graph) is tested here.
jest.mock('../../components/map', () => ({
  __esModule: true,
  default: ({ keyboard }: { keyboard?: { label: string; helpId?: string; onPick?: (coordinate: [number, number]) => void; onHome?: () => void } }) =>
    keyboard ? (
      <div
        tabIndex={0}
        role="application"
        aria-label={keyboard.label}
        aria-describedby={keyboard.helpId}
        onKeyDown={(event) => {
          if ((event.key === 'Enter' || event.key === ' ') && keyboard.onPick) {
            event.preventDefault();
            event.stopPropagation();
            keyboard.onPick([14300000, 4200000]);
          }
        }}
      />
    ) : (
      <div data-testid="second-map" />
    ),
}));
jest.mock('../../components/xcubeLayer', () => ({ __esModule: true, default: jest.fn().mockResolvedValue(undefined) }));
jest.mock('ol/proj', () => ({ toLonLat: (coordinate: [number, number]) => coordinate }));
jest.mock('../../api', () => { const actual = jest.requireActual('../../api/viewerAdapter'); return { activeViewerAdapter: actual.viewerAdapter, useMockApi: true }; });

const setWidth = (width: number) => Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({ matches: false, media: query, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false }),
  });
  window.history.replaceState(null, '', '/app/viewer');
  setWidth(1024);
});
afterAll(() => setWidth(1024));

const sheet = () => screen.queryByRole('complementary', { name: '레이어 및 AI 작업 패널' });
const counter = () => within(screen.getByRole('region', { name: '시계열 탐색기' })).getByText(/\d+ \/ \d+/);

describe('지도 키보드', () => {
  test('지도는 데이터 이름과 키 사용법을 말하고, Enter는 가운데 픽셀의 시계열을 연다', async () => {
    render(<Viewer initialDatasetId="landsat" />);
    const map = await screen.findByRole('application', { name: /^지도: Landsat-8 · 2024\. 방향키로 이동/ });
    expect(map).toHaveAccessibleDescription(/\+ 와 - 로 확대·축소, Home으로 데이터 영역에 맞춥니다\. Enter나 Space/);
    expect(screen.queryByRole('img', { name: /시계열 그래프/ })).not.toBeInTheDocument();
    map.focus();
    fireEvent.keyDown(map, { key: 'Enter' });
    expect(await screen.findByRole('img', { name: /시계열 그래프/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '픽셀 선택 지우기' })).toBeInTheDocument();
  });

  test('지도에 초점이 있으면 ←/→가 시점을 넘기지 않는다(지도가 쓴다)', async () => {
    render(<Viewer initialDatasetId="landsat" />);
    const map = await screen.findByRole('application', { name: /^지도: Landsat-8/ });
    expect(counter()).toHaveTextContent(/^1 \//);
    fireEvent.keyDown(map, { key: 'ArrowRight' });
    fireEvent.keyDown(map, { key: ' ' });
    expect(counter()).toHaveTextContent(/^1 \//);
    expect(screen.getByRole('button', { name: '재생' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('데이터를 고르기 전에는 이동·확대 안내만 한다', async () => {
    render(<Viewer />);
    expect(await screen.findByRole('application', { name: '지도. 방향키로 이동' })).toHaveAccessibleDescription(/데이터를 고르면 Enter로/);
  });
});

describe('나란히 비교 공간', () => {
  test('나란히를 켜면 레이어 시트와 분석 drawer를 접고, 끄면 시트를 되돌린다', async () => {
    setWidth(1440);
    render(<Viewer initialDatasetId="landsat" />);
    await screen.findByRole('region', { name: '시계열 탐색기' });
    expect(sheet()).toBeInTheDocument(); // wide screens start with the sheet open
    fireEvent.click(screen.getByRole('button', { name: /AI 수체 추출/ }));
    expect(screen.getByRole('complementary', { name: 'AI 수체 추출 설정' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /나란히/ }));
    await waitFor(() => expect(sheet()).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: '레이어 및 AI 작업 패널 열기' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'AI 수체 추출 설정' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'AI 작업 열기' })).toBeInTheDocument(); // the rail
    expect(screen.getByRole('region', { name: /비교 지도 B/ })).toBeInTheDocument();

    // One sheet at a time while side by side: opening the layer sheet folds the drawer again.
    fireEvent.click(screen.getByRole('button', { name: 'AI 작업 열기' }));
    expect(screen.getByRole('complementary', { name: 'AI 수체 추출 설정' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '레이어 및 AI 작업 패널 열기' }));
    expect(sheet()).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'AI 수체 추출 설정' })).not.toBeInTheDocument();
    fireEvent.click(within(sheet()!).getByRole('button', { name: '패널 닫기' }));

    fireEvent.click(screen.getByRole('button', { name: /단일/ }));
    await waitFor(() => expect(sheet()).toBeInTheDocument());
  });
});

describe('Esc와 초점 되돌리기', () => {
  test('레이어 시트: 열면 선택된 탭으로, Esc로 닫으면 여는 버튼으로 초점이 간다', async () => {
    render(<Viewer initialDatasetId="landsat" />);
    await screen.findByRole('region', { name: '시계열 탐색기' });
    fireEvent.click(screen.getByRole('button', { name: '레이어 및 AI 작업 패널 열기' }));
    const layersTab = within(sheet()!).getByRole('tab', { name: '레이어' });
    await waitFor(() => expect(layersTab).toHaveFocus());
    fireEvent.keyDown(layersTab, { key: 'Escape' });
    expect(sheet()).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: '레이어 및 AI 작업 패널 열기' })).toHaveFocus());
  });

  test('분석 drawer: Esc는 닫고 연 버튼으로, 접기는 rail로, 다시 누르면 닫힌다', async () => {
    render(<Viewer initialDatasetId="landsat" />);
    await screen.findByRole('region', { name: '시계열 탐색기' });
    const aiButton = screen.getByRole('button', { name: /AI 수체 추출/ });
    aiButton.focus();
    fireEvent.click(aiButton);
    expect(aiButton).toHaveAttribute('aria-expanded', 'true');
    const drawer = screen.getByRole('complementary', { name: 'AI 수체 추출 설정' });
    await waitFor(() => expect(within(drawer).getByRole('tab', { name: /AI 작업/ })).toHaveFocus());
    fireEvent.keyDown(within(drawer).getByRole('tab', { name: /AI 작업/ }), { key: 'Escape' });
    expect(screen.queryByRole('complementary', { name: 'AI 수체 추출 설정' })).not.toBeInTheDocument();
    await waitFor(() => expect(aiButton).toHaveFocus());
    expect(aiButton).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(aiButton);
    fireEvent.click(screen.getByRole('button', { name: '분석 패널 접기' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'AI 작업 열기' })).toHaveFocus());
    fireEvent.click(screen.getByRole('button', { name: 'AI 작업 열기' }));
    expect(screen.getByRole('complementary', { name: 'AI 수체 추출 설정' })).toBeInTheDocument();
    fireEvent.click(aiButton); // the open tab's button closes it again
    expect(screen.queryByRole('complementary', { name: 'AI 수체 추출 설정' })).not.toBeInTheDocument();
  });

  test('결과 버튼을 다시 눌러 닫으면 창만 닫는 게 아니라 AI 수체 결과 레이어도 끈다', async () => {
    render(<Viewer initialDatasetId="landsat" />);
    await screen.findByRole('region', { name: '시계열 탐색기' });
    const results = await screen.findByRole('button', { name: '결과' });
    fireEvent.click(results);
    expect(screen.getByRole('complementary', { name: '결과 비교' })).toBeInTheDocument();
    expect(await screen.findByText(/물로 판정 · AI 결과/)).toBeInTheDocument();
    fireEvent.click(results);
    expect(screen.queryByRole('complementary', { name: '결과 비교' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/물로 판정 · AI 결과/)).not.toBeInTheDocument());
    fireEvent.click(results); // opening it again shows the layer again
    expect(await screen.findByText(/물로 판정 · AI 결과/)).toBeInTheDocument();
  });
  test('탭은 ←/→로 옮겨 고르고, 고르지 않은 탭은 Tab 순서에서 빠진다', async () => {
    render(<Viewer initialDatasetId="landsat" />);
    await screen.findByRole('region', { name: '시계열 탐색기' });
    fireEvent.click(screen.getByRole('button', { name: '레이어 및 AI 작업 패널 열기' }));
    const layersTab = within(sheet()!).getByRole('tab', { name: '레이어' });
    expect(layersTab).toHaveAttribute('aria-controls', 'vx-panel-body');
    expect(within(sheet()!).getByRole('tab', { name: /AI 작업/ })).toHaveAttribute('tabindex', '-1');
    layersTab.focus();
    fireEvent.keyDown(layersTab, { key: 'ArrowRight' });
    const jobsTab = within(sheet()!).getByRole('tab', { name: /AI 작업/ });
    expect(jobsTab).toHaveAttribute('aria-selected', 'true');
    expect(jobsTab).toHaveFocus();
    expect(within(sheet()!).getByRole('tabpanel')).toHaveAccessibleName(/AI 작업/);
    expect(counter()).toHaveTextContent(/^1 \//); // the tabs keep the arrows
  });
});

test('데이터 고르기: 검색 칸이 combobox이고 ↑/↓로 고른 항목을 aria-activedescendant로 알린다', async () => {
  render(<Viewer />);
  const trigger = await screen.findByRole('button', { name: /^데이터 또는 Zarr 선택/ });
  fireEvent.click(trigger);
  const search = await screen.findByRole('combobox', { name: 'Zarr 검색' });
  expect(search).toHaveAttribute('aria-controls', 'zarr-listbox');
  expect(search).toHaveAttribute('placeholder', '이름으로 검색…');
  await screen.findByRole('option', { name: /Sentinel-2/ });
  const first = search.getAttribute('aria-activedescendant');
  fireEvent.keyDown(search, { key: 'ArrowDown' });
  const second = search.getAttribute('aria-activedescendant');
  expect(first).toBe('zarr-option-0');
  expect(second).toBe('zarr-option-1');
  expect(document.getElementById(second!)).toHaveAttribute('role', 'option'); // eslint-disable-line testing-library/no-node-access
  fireEvent.keyDown(search, { key: 'Enter' });
  // The trigger now says what it is for and which data is shown.
  await screen.findByRole('button', { name: /^데이터 또는 Zarr 선택 .+/ });
});

test('시간자 slider는 날짜와 순서를 aria-valuetext로 읽는다', async () => {
  render(<Viewer initialDatasetId="landsat" />);
  const slider = await screen.findByRole('slider', { name: '관측 시점' });
  expect(slider.getAttribute('aria-valuetext')).toMatch(/^.+, 1 \/ \d+$/);
  fireEvent.change(slider, { target: { value: '2' } });
  const label = within(screen.getByRole('region', { name: '시계열 탐색기' })).getByText(/\d+ \/ \d+/);
  expect(slider).toHaveAttribute('aria-valuetext', expect.stringMatching(/, 3 \/ \d+$/));
  expect(label).toHaveTextContent(/^3 \//);
});

test('알림(role=alert)은 저절로 사라지지 않고 닫기 버튼으로 닫는다', async () => {
  jest.useFakeTimers();
  try {
    const { viewerAdapter } = jest.requireActual('../../api/viewerAdapter');
    jest.spyOn(viewerAdapter, 'getProjectDatasets').mockResolvedValue([
      { id: 'shared-only', projectId: 'p', name: '공유 전용', subtitle: '', xcubeDatasetId: 'x', defaultVariable: 'v', variables: ['v'], times: [] },
    ]);
    render(<Viewer />);
    const projectSelect = await screen.findByRole('combobox', { name: '프로젝트 선택' });
    await waitFor(() => expect(projectSelect.querySelectorAll('option').length).toBeGreaterThan(1)); // eslint-disable-line testing-library/no-node-access
    fireEvent.change(projectSelect, { target: { value: (projectSelect.querySelectorAll('option')[1] as HTMLOptionElement).value } }); // eslint-disable-line testing-library/no-node-access
    fireEvent.click(screen.getByRole('button', { name: /^데이터 또는 Zarr 선택/ }));
    fireEvent.click(await screen.findByRole('option', { name: /공유 전용/ }));
    const alert = await screen.findByRole('alert');
    jest.advanceTimersByTime(20000);
    expect(alert).toBeInTheDocument();
    fireEvent.click(within(alert).getByRole('button', { name: '알림 닫기' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  } finally {
    jest.useRealTimers();
  }
});

test('굵은 포인터(손가락)에서는 Viewer 조작부가 모두 44px 이상이다 (stylesheet smoke test)', () => {
  const css = fs.readFileSync(path.join(__dirname, 'viewer.css'), 'utf8');
  const start = css.indexOf('@media (pointer: coarse)');
  expect(start).toBeGreaterThan(-1);
  const block = css.slice(start);
  expect(block).toMatch(/--vx-hit:\s*44px/);
  for (const selector of ['.vx-btn', '.vx-icon-btn', '.vx-play', '.vx-tools button', '.vx-drawer-rail button', '.vx-chips button', '.vx-modes button', '.vx-seg button', '.vx-btime select', ".vx-tabs [role='tab']", '.vx-layer', '.vx-popt__toggle', '.vx .dataset-trigger', '.vx-crumb select', '.vx-swipe__handle'])
    expect(block).toContain(selector);
  // Mouse sizes are not touched: the desktop rules keep their 32/34 px.
  expect(css.slice(0, start)).toMatch(/\.vx-icon-btn \{\s*width: 32px; height: 32px;/);
});
