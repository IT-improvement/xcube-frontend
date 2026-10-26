/* VX1 (UR-65): shorter paths and one panel frame — a tool that cannot be used says why with the next step, a
   finished AI run leads to 결과 비교, 결과 비교 opens on a summary with shortcuts and a one-press 원본 ↔ AI swipe,
   details are folded, and the phone sheet has two heights switched by a press. */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import Viewer from '.';
import { AiRunForm } from './AiPanel';
import type { AiWaterJob } from '../../api/aiApi';
import { ai } from '../../app/api';

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

test('쓸 수 없는 도구를 누르면 이유와 다음 할 일(데이터 고르기)을 막대 옆에 보인다', async () => {
  render(<Viewer />);
  await screen.findByRole('option', { name: '한강 수체 모니터링' });
  const result = rail().getByRole('button', { name: /^결과 비교/ });
  expect(result).toHaveAttribute('aria-disabled', 'true');
  fireEvent.click(result);
  const tip = screen.getAllByRole('status').find((element) => element.classList.contains('vx-railtip'))!;
  expect(tip).toHaveTextContent('결과 비교데이터를 먼저 고르세요.');
  // Still a disabled tool: no panel opened.
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  fireEvent.click(within(tip).getByRole('button', { name: '데이터 고르기' }));
  expect(document.querySelector('.vx-railtip')).not.toBeInTheDocument(); // eslint-disable-line testing-library/no-node-access
  await waitFor(() => expect(screen.getByRole('button', { name: /^데이터 또는 Zarr 선택/ })).toHaveAttribute('aria-expanded', 'true'));
});

test('안내는 닫기 버튼과 같은 도구를 다시 누르면 사라진다', async () => {
  render(<Viewer />);
  await screen.findByRole('option', { name: '한강 수체 모니터링' });
  const area = rail().getByRole('button', { name: '영역 통계' });
  fireEvent.click(area);
  expect(document.querySelector('.vx-railtip')).toHaveTextContent('영역 통계'); // eslint-disable-line testing-library/no-node-access
  fireEvent.click(area);
  expect(document.querySelector('.vx-railtip')).not.toBeInTheDocument(); // eslint-disable-line testing-library/no-node-access
  fireEvent.click(area);
  fireEvent.click(screen.getByRole('button', { name: '안내 닫기' }));
  expect(document.querySelector('.vx-railtip')).not.toBeInTheDocument(); // eslint-disable-line testing-library/no-node-access
});

const run = (status: string): AiWaterJob => ({ id: 'j9', name: '대청호_수체', status, progress: status === 'RUNNING' ? 0.4 : 1, stage: status === 'RUNNING' ? 'infer' : undefined } as AiWaterJob);
const dataset = { id: '86', name: '대청호', kind: 'ORIGINAL', variables: ['green', 'nir'], times: [] } as any;

test('AI 수체 추출: 모델·기간·실행이 앞에, 임계값·이름·입력 목록은 자세히 설정에. 끝나면 결과 비교에서 보기', async () => {
  jest.spyOn(ai, 'models').mockResolvedValue([
    { id: 'ndwi-baseline', name: 'NDWI 기준선', kind: 'index', defaultThreshold: 0, inputs: [{ name: 'green' }, { name: 'nir' }] } as any,
  ]);
  jest.spyOn(ai, 'check').mockResolvedValue({ ready: true, missing: [], matched: { green: 'green', nir: 'nir' } } as any);
  const onShowResult = jest.fn();
  const props = { dataset, times: [{ iso: '2024-08-14', label: '2024. 8. 14.' }], runError: '', onRun: jest.fn(), onCancel: jest.fn(), onRetry: jest.fn(), onShowResult };
  const { rerender } = render(<AiRunForm {...props} run={null} />);
  expect(await screen.findByText('필요한 입력이 모두 있습니다.')).toBeInTheDocument();
  const more = screen.getByText('자세히 설정').closest('details')!; // eslint-disable-line testing-library/no-node-access
  expect(more).not.toHaveAttribute('open');
  expect(within(more).getByRole('slider', { name: 'NDWI 임계값' })).toBeInTheDocument();
  expect(within(more).getByRole('textbox', { name: '결과 이름' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '실행' })).toBeEnabled();

  rerender(<AiRunForm {...props} run={run('RUNNING')} />);
  expect(screen.getByRole('progressbar', { name: '수체 추출 진행률' })).toHaveAttribute('aria-valuenow', '40');
  expect(screen.queryByRole('button', { name: '결과 비교에서 보기' })).not.toBeInTheDocument();

  rerender(<AiRunForm {...props} run={run('SUCCEEDED')} />);
  expect(screen.getByText('수체 추출을 마쳤습니다.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '결과 비교에서 보기' }));
  expect(onShowResult).toHaveBeenCalledWith(expect.objectContaining({ id: 'j9' }));
});

async function openLandsatResult() {
  render(<Viewer initialDatasetId="landsat" />);
  await screen.findByRole('region', { name: '시계열 탐색기' });
  await screen.findByLabelText('AI 결과 2개, 비교 결과 3개');
  fireEvent.click(rail().getByRole('button', { name: /^결과 비교/ }));
  const panel = screen.getByRole('complementary', { name: '결과 비교' });
  await within(panel).findByRole('heading', { name: '비교 분석 결과 (3개)' });
  return panel;
}

test('결과 비교: 맨 위 요약과 바로가기, 한 줄 설명, 연구용 수치는 접혀 있다', async () => {
  const panel = await openLandsatResult();
  expect(panel).toHaveAccessibleDescription('AI 결과와 비교 결과를 원본 위에 겹쳐 봅니다.');
  const summary = within(panel).getByRole('navigation', { name: '이 데이터의 결과' });
  expect(summary).toHaveTextContent('AI 결과 2개 · 비교 결과 3개');
  fireEvent.click(within(summary).getByRole('button', { name: '비교 결과로' }));
  expect(within(panel).getByRole('heading', { name: '비교 분석 결과 (3개)' })).toHaveFocus();
  fireEvent.click(within(summary).getByRole('button', { name: 'AI 결과로' }));
  expect(within(panel).getByRole('heading', { name: 'AI 수체 결과' })).toHaveFocus();
  const research = (await within(panel).findByText('임계값·정확도 (연구용)')).closest('details')!; // eslint-disable-line testing-library/no-node-access
  expect(research).not.toHaveAttribute('open');
  expect(within(research).getByText('임계값별 면적 (추정)')).toBeInTheDocument();
  // The AI layer toggle stays up front; the source toggle and opacity are folded.
  expect(within(panel).getByRole('checkbox', { name: 'AI 수체 결과' })).toBeChecked();
  const layers = within(panel).getByText('원본 영상·투명도').closest('details')!; // eslint-disable-line testing-library/no-node-access
  expect(within(layers).getByRole('checkbox', { name: '원본 영상' })).toBeInTheDocument();
  expect(within(layers).getByRole('slider', { name: 'AI 수체 결과 불투명도' })).toBeInTheDocument();
});

test('결과 비교: 원본과 밀어 보기는 한 번에 스와이프·AI 결과 비교를 켜고 다시 누르면 끈다', async () => {
  const panel = await openLandsatResult();
  const modes = within(screen.getByRole('group', { name: '표시 방식' }));
  const swipe = within(panel).getByRole('button', { name: '원본과 밀어 보기' });
  expect(swipe).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(swipe);
  await waitFor(() => expect(modes.getByRole('button', { name: /스와이프/ })).toHaveAttribute('aria-pressed', 'true'));
  const off = within(panel).getByRole('button', { name: '밀어 보기 끄기' });
  expect(off).toHaveAttribute('aria-pressed', 'true');
  expect(off).toHaveAccessibleDescription('지도 위 구분선을 끌어 원본과 AI 결과를 번갈아 봅니다.');
  expect(window.location.search).toContain('cmp=ai');
  fireEvent.click(off);
  await waitFor(() => expect(modes.getByRole('button', { name: /단일/ })).toHaveAttribute('aria-pressed', 'true'));
});

test('도구 창 머리: 휴대폰 시트의 높이 손잡이는 누르면 크게/작게 바뀐다(끌기 없이)', async () => {
  await openLandsatResult();
  const grip = screen.getByRole('button', { name: '창 크게 보기' });
  expect(grip).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(grip);
  expect(screen.getByRole('button', { name: '창 작게 보기' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('complementary', { name: '결과 비교' })).toHaveClass('is-full');
  expect(screen.getByRole('main')).toHaveClass('has-full-sheet');
});

test('레이어: 데이터 정보는 접힌 자세히로 간다', async () => {
  render(<Viewer initialDatasetId="landsat" />);
  await screen.findByRole('region', { name: '시계열 탐색기' });
  fireEvent.click(rail().getByRole('button', { name: '레이어' }));
  const panel = screen.getByRole('complementary', { name: '레이어' });
  expect(panel).toHaveAccessibleDescription('지도에 보일 밴드와 레이어를 고릅니다.');
  const info = within(panel).getByText('데이터 정보').closest('details')!; // eslint-disable-line testing-library/no-node-access
  expect(info).not.toHaveAttribute('open');
  expect(within(info).getByText('좌표계')).toBeInTheDocument();
});

test('도구를 바꾸면 창은 맨 위에서 시작한다(앞 도구의 스크롤이 남지 않는다)', async () => {
  render(<Viewer initialDatasetId="landsat" />);
  await screen.findByRole('region', { name: '시계열 탐색기' });
  fireEvent.click(rail().getByRole('button', { name: '영역 통계' }));
  const body = document.querySelector('.vx-drawer__body') as HTMLElement; // eslint-disable-line testing-library/no-node-access
  body.scrollTop = 240;
  fireEvent.click(rail().getByRole('button', { name: '내보내기' }));
  expect((document.querySelector('.vx-drawer__body') as HTMLElement).scrollTop).toBe(0); // eslint-disable-line testing-library/no-node-access
});
