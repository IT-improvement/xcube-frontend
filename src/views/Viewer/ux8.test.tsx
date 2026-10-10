// UX8 (점검 순서 4 "Viewer 정확성·범례"): source colour bar, plain Korean AI input check, telling
// same-name results apart and a narrow live region in the pixel graph.
import { render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import SourceLegend, { categoriesOf, legendValue, parseColorBar, resetColorBarPreviews, rgbMapping } from './SourceLegend';
import { aiWarningText, AiResultList, entryDetail, ResultEntry, shortDateTime, unitDecisionText } from './AiPanel';
import { BottomGraphPanel } from './PixelGraph';

jest.mock('../../app/api', () => ({ ...jest.requireActual('../../app/api'), generation: { colorBars: jest.fn() } }));
const mockColorBars = require('../../app/api').generation.colorBars as jest.Mock;

beforeEach(() => {
  resetColorBarPreviews();
  mockColorBars.mockReset();
  mockColorBars.mockResolvedValue([{ id: 'Reds', category: 'Sequential', preview: 'UkVEUw==' }]);
});

describe('원본 colour bar 범례', () => {
  test('색 막대(xcube 미리보기), 최소·최대(데이터 단위)와 변수 이름을 보인다', async () => {
    render(<SourceLegend variable="vv" style={{ colorBarName: 'Reds', colorBarMin: -25, colorBarMax: 5, units: 'dB' }} />);
    const legend = screen.getByRole('group', { name: '원본 범례: vv, -25 – 5 dB' });
    expect(within(legend).getByText('vv')).toBeInTheDocument();
    expect(within(legend).getByText('dB')).toBeInTheDocument();
    expect(within(legend).getByText('-25')).toBeInTheDocument();
    expect(within(legend).getByText('5')).toBeInTheDocument();
    // eslint-disable-next-line testing-library/no-node-access
    await waitFor(() => expect(legend.querySelector('img')).toHaveAttribute('src', 'data:image/png;base64,UkVEUw=='));
    expect(mockColorBars).toHaveBeenCalledTimes(1);
  });

  test('미리보기를 못 받으면 알려진 색표의 그라데이션으로 그리고, _r은 뒤집는다', async () => {
    mockColorBars.mockRejectedValue(new Error('down'));
    render(<SourceLegend variable="nir" style={{ colorBarName: 'viridis_r', colorBarMin: 32, colorBarMax: 1469, units: '1' }} />);
    const legend = screen.getByRole('group', { name: '원본 범례: nir, 32 – 1,469' });
    await waitFor(() => expect(mockColorBars).toHaveBeenCalled());
    // eslint-disable-next-line testing-library/no-node-access
    const ramp = legend.querySelector('.vx-cbar__ramp') as HTMLElement;
    expect(ramp).toHaveClass('is-reversed');
    // eslint-disable-next-line testing-library/no-node-access
    expect(ramp).toHaveAttribute('data-cmap', 'viridis');
    // eslint-disable-next-line testing-library/no-node-access
    expect(ramp.querySelector('i')).not.toBeNull();
    // eslint-disable-next-line testing-library/no-node-access
    expect(ramp.querySelector('img')).toBeNull();
    expect(within(legend).queryByText('1')).not.toBeInTheDocument(); // unit "1" is not shown
  });

  test('RGB 합성은 그라데이션 대신 채널별 밴드를 보인다', () => {
    render(<SourceLegend variable="rgb" rgbBands={['B4', 'B3', 'B2']} />);
    const legend = screen.getByRole('group', { name: /RGB 합성/ });
    expect(within(legend).getByText('빨강 B4 · 초록 B3 · 파랑 B2')).toBeInTheDocument();
    // eslint-disable-next-line testing-library/no-node-access
    expect(legend.querySelector('.vx-cbar__ramp')).toBeNull();
    expect(mockColorBars).not.toHaveBeenCalled();
  });

  test('범주형은 코드 견본(색 정보가 있을 때) 또는 코드 범위만 보인다', () => {
    const cmap = JSON.stringify({ name: 'landcover', type: 'categorical', colors: [[1, '#3fb4ff', '물'], [2, '#2e7d32']] });
    const { unmount } = render(<SourceLegend variable="lc" style={{ colorBarName: cmap, colorBarNorm: 'cat' }} />);
    expect(screen.getByText('물')).toBeInTheDocument();
    expect(screen.getByText('코드 2')).toBeInTheDocument();
    unmount();
    render(<SourceLegend variable="scl" style={{ colorBarName: 'tab10', colorBarNorm: 'cat', colorBarMin: 0, colorBarMax: 11 }} />);
    const legend = screen.getByRole('group', { name: '원본 범례: scl, 범주(코드), 코드 0 – 11' });
    expect(within(legend).getByText('코드 0 – 11')).toBeInTheDocument();
    // eslint-disable-next-line testing-library/no-node-access
    expect(legend.querySelector('.vx-cbar__ramp')).toBeNull();
  });

  test('도우미: 색표 이름, 범주 JSON, 값 표기, RGB 문구', () => {
    expect(parseColorBar('Blues_r_alpha')).toEqual({ base: 'Blues', reversed: true });
    expect(categoriesOf('viridis')).toBeNull();
    expect(legendValue(621.6799999)).toBe('621.7');
    expect(rgbMapping(['red', 'green', 'blue'])).toBe('빨강 red · 초록 green · 파랑 blue');
  });
});

describe('AI 입력 확인 문구', () => {
  test('입력 처리 방식은 한국어로, 원문은 설명으로 남긴다', () => {
    expect(unitDecisionText('DN retained').text).toBe('원래 값 그대로');
    expect(unitDecisionText('dB→×100').text).toBe('100배로 맞춤');
    expect(unitDecisionText('reflectance→×10000').text).toBe('10000배로 맞춤');
    expect(unitDecisionText('알 수 없는 값').text).toBe('알 수 없는 값');
  });

  test('경고: 입력 줄과 같은 내용은 빼고, 영문 경고는 한국어로 바꾼다', () => {
    const decisions = { green: 'DN retained', vv: 'dB→×100' };
    expect(aiWarningText('green: DN retained', decisions)).toBeNull();
    expect(aiWarningText('vv: units vary at time index 3: dB×100 retained', decisions)).toBe('VV(레이더): 4번째 시점부터 값 형식이 달라집니다(원래 값 그대로).');
    expect(aiWarningText('Model checkpoint unavailable', decisions)).toBe('모델 파일이 아직 준비되지 않아 지금은 실행할 수 없습니다.');
    expect(aiWarningText('S1·S2 촬영 날짜 차이가 큽니다 (최대 9일)', decisions)).toBe('S1·S2 촬영 날짜 차이가 큽니다 (최대 9일)');
  });
});

describe('같은 이름의 AI 결과 구분', () => {
  const base = { status: 'SUCCEEDED', name: 'Sentinel_대청호_수체_U-Net_20261009', modelId: 'unet-s1s2-10ch' };
  const entries: ResultEntry[] = [
    { ...base, key: 'a', threshold: 0.5, createdAt: '2026-10-09T05:32:00Z', timeStart: '2021-11-27T00:00:00Z', timeEnd: '2022-10-19T00:00:00Z' },
    { ...base, key: 'b', threshold: 0.35, createdAt: '2026-10-09T06:10:00Z' },
  ];

  test('결과 목록 둘째 줄에 기간 · 임계값 · 만든 시각을 보인다', () => {
    render(<AiResultList entries={entries} selectedKey="" onSelect={() => undefined} />);
    const [first, second] = screen.getAllByRole('button');
    expect(first).toHaveTextContent(`2021.11.27–2022.10.19 · 임계값 0.50 · ${shortDateTime(entries[0].createdAt)} 만듦`);
    expect(second).toHaveTextContent(`전체 기간 · 임계값 0.35 · ${shortDateTime(entries[1].createdAt)} 만듦`);
    expect(first.textContent).not.toBe(second.textContent);
  });

  test('한 시점 결과와 다른 해에 만든 결과의 짧은 표기', () => {
    const now = new Date(2026, 9, 10);
    expect(shortDateTime(new Date(2025, 0, 2, 9, 5).toISOString(), now)).toBe('2025.01.02 09:05');
    expect(shortDateTime(new Date(2026, 0, 2, 9, 5).toISOString(), now)).toBe('01.02 09:05');
    expect(entryDetail({ key: 'c', name: 'x', status: 'SUCCEEDED', timeStart: new Date(2024, 7, 14).toISOString(), timeEnd: new Date(2024, 7, 14).toISOString() })).toBe('2024.08.14');
  });
});

describe('픽셀 그래프 live 영역', () => {
  const dataset = { id: '70', projectId: '', name: '제주', subtitle: '', xcubeDatasetId: 'u8-d70', defaultVariable: 'nir', variables: ['nir'], times: [] };
  const props = {
    expanded: true, onToggle: () => undefined, dataset, variable: 'nir',
    points: [{ time: '2021-11-27T00:00:00Z', value: 356 }], coordinate: { lon: 126.83, lat: 33.42 },
    currentTime: '2021-11-27T00:00:00Z', currentLabel: '2021. 11. 27.',
  };

  test('패널 전체가 아니라 현재 값 한 줄만 알린다', () => {
    render(<BottomGraphPanel {...props} />);
    expect(screen.getByRole('region', { name: '픽셀 시계열 그래프 패널' })).not.toHaveAttribute('aria-live');
    expect(screen.getByRole('status')).toHaveTextContent('2021. 11. 27. nir 값 356');
  });

  test('재생 중(announce=false)에는 알리지 않는다', () => {
    render(<BottomGraphPanel {...props} announce={false} />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
});
