// M7: AI 수체 추출 in the Viewer (demo mode) — model check, run request, result panel, 원본 ↔ AI 결과 compare, CSV.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import Viewer from '.';
import * as appApi from '../../app/api';
import { aiMaskStyle, AiResultList, areaCsv, AI_WATER } from './AiPanel';
import { readFileSync } from 'fs';
import { join } from 'path';
import { demoResult } from '../../app/aiDemo';
import { normalizeResult } from '../../api/aiApi';

jest.mock('../../components/map', () => ({
  __esModule: true,
  default: () => <div aria-label="테스트 지도" />,
}));
jest.mock('../../components/xcubeLayer', () => ({ __esModule: true, default: jest.fn().mockResolvedValue(undefined) }));
jest.mock('ol/proj', () => ({ toLonLat: (coordinate: [number, number]) => coordinate }));
jest.mock('../../api', () => { const actual = jest.requireActual('../../api/viewerAdapter'); return { activeViewerAdapter: actual.viewerAdapter, useMockApi: true }; });

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query) => ({ matches: false, media: query, onchange: null, addEventListener: jest.fn(), removeEventListener: jest.fn(), addListener: jest.fn(), removeListener: jest.fn(), dispatchEvent: jest.fn() })),
  });
  window.history.replaceState(null, '', '/app/viewer');
});
afterEach(() => jest.restoreAllMocks());

async function openAiDrawer(datasetId: string) {
  render(<Viewer initialDatasetId={datasetId} />);
  await screen.findByRole('region', { name: '시계열 탐색기' });
  fireEvent.click(screen.getByRole('button', { name: 'AI 수체 추출' }));
  return screen.getByRole('complementary', { name: 'AI 수체 추출 설정' });
}

test('필요한 입력이 없으면 실행을 막고 빠진 변수를 쉬운 말로 알려 준다', async () => {
  const drawer = await openAiDrawer('nakdong');
  // NDWI 기준선은 Green·NIR만 있으면 된다.
  const ndwi = await within(drawer).findByRole('radio', { name: /NDWI 기준선/ });
  expect(ndwi).toBeChecked();
  await waitFor(() => expect(within(drawer).getByRole('button', { name: '실행' })).toBeEnabled());
  expect(within(drawer).getByRole('slider', { name: 'NDWI 임계값' })).toHaveValue('0');

  fireEvent.click(within(drawer).getByRole('radio', { name: /U-Net/ }));
  const note = await within(drawer).findByText(/변수가 없어 이 모델을 실행할 수 없습니다/);
  expect(note).toHaveTextContent('VV(레이더), VH(레이더), SWIR(단파적외)');
  expect(note).toHaveTextContent('NDWI 기준선');
  expect(within(drawer).getByRole('button', { name: '실행' })).toBeDisabled();
  expect(within(drawer).getAllByText('없음')).toHaveLength(3);
  expect(within(drawer).getByRole('slider', { name: '물 확률 임계값' })).toHaveValue('0.5');
});

test('실행하면 datacubeId·modelId·임계값을 보내고 진행 상황을 보여 준다', async () => {
  const create = jest.spyOn(appApi.ai, 'createJob');
  const drawer = await openAiDrawer('sentinel');
  fireEvent.click(await within(drawer).findByRole('radio', { name: /DeepLabV3\+/ }));
  await waitFor(() => expect(within(drawer).getByRole('button', { name: '실행' })).toBeEnabled());
  expect(within(drawer).getByText('B11', { exact: false })).toBeInTheDocument();
  fireEvent.change(within(drawer).getByRole('slider', { name: '물 확률 임계값' }), { target: { value: '0.7' } });
  fireEvent.change(within(drawer).getByLabelText('시작 시점'), { target: { value: '2025-observation-2' } });
  fireEvent.click(within(drawer).getByRole('button', { name: '실행' }));
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  expect(create.mock.calls[0][0]).toMatchObject({ datacubeId: 'sentinel', modelId: 'deeplabv3plus-s1s2-10ch', threshold: 0.7, timeStart: '2025-observation-2' });
  expect(create.mock.calls[0][0]).not.toHaveProperty('timeEnd');
  expect(await within(drawer).findByRole('progressbar', { name: '수체 추출 진행률' })).toBeInTheDocument();
  // The run finishes, becomes a result of this dataset and opens the result button.
  expect(await screen.findByRole('button', { name: '결과' }, { timeout: 6000 })).toBeInTheDocument();
}, 10000);

test('실행을 여러 번 눌러도 요청은 한 번만 가고, 응답 전까지 "입력 확인 중…"으로 막힌다', async () => {
  let answer: (value: unknown) => void = () => {};
  const create = jest.spyOn(appApi.ai, 'createJob').mockImplementation(() => new Promise((resolve) => { answer = resolve; }) as never);
  const drawer = await openAiDrawer('sentinel');
  await waitFor(() => expect(within(drawer).getByRole('button', { name: '실행' })).toBeEnabled());
  const run = within(drawer).getByRole('button', { name: '실행' });
  fireEvent.click(run);
  fireEvent.click(run);
  fireEvent.click(run);
  const waiting = await within(drawer).findByRole('button', { name: '입력 확인 중…' });
  expect(waiting).toBeDisabled();
  expect(create).toHaveBeenCalledTimes(1);
  answer({ id: 'job-once', name: 'water', status: 'QUEUED', progress: 0, createdAt: new Date().toISOString() });
  await waitFor(() => expect(within(drawer).queryByRole('button', { name: '입력 확인 중…' })).not.toBeInTheDocument());
  expect(create).toHaveBeenCalledTimes(1);
});

test('결과 패널: 임계값 슬라이더는 thresholdCurve로 면적을 바로 추정하고 지도는 바꾸지 않는다', async () => {
  render(<Viewer initialDatasetId="landsat" />);
  fireEvent.click(await screen.findByRole('button', { name: '결과' }));
  const drawer = screen.getByRole('complementary', { name: '결과 비교' });
  const slider = await within(drawer).findByRole('slider', { name: '추정 임계값' });
  // Seeded U-Net result at 0.50: first time 38.20 km²; at 0.70 the curve gives 38.2 × 0.9.
  expect(slider).toHaveAttribute('aria-valuetext', '임계값 0.50, 추정 면적 38.20 km²');
  expect(within(drawer).getByRole('button', { name: /다시 실행/ })).toBeDisabled();
  fireEvent.change(slider, { target: { value: '13' } });
  expect(slider).toHaveAttribute('aria-valuetext', '임계값 0.70, 추정 면적 34.38 km²');
  expect(within(drawer).getByText('34.38 km²')).toBeInTheDocument();
  expect(within(drawer).getByText(/추정치입니다. 지도와 결과 데이터는 바뀌지 않습니다/)).toBeInTheDocument();
  expect(within(drawer).getByRole('button', { name: '임계값 0.70으로 다시 실행' })).toBeEnabled();
  // The dock row follows the timeline cursor.
  const area = screen.getByRole('region', { name: '시점별 수체 면적' });
  expect(within(area).getByText('38.20')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '다음 시점' }));
  expect(within(area).getByText('41.50')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '다음 시점' }));
  expect(within(area).getByText(/이 시점에는 값이 없습니다/)).toBeInTheDocument();
  // The map legend names the layer in words.
  expect(screen.getByRole('group', { name: 'AI 결과 범례' })).toHaveTextContent('물로 판정 · AI 결과');
});

test('정답(water_gt) 지표가 있으면 IoU·F1·정밀도·재현율과 연구용 표시를 보여 준다', async () => {
  render(<Viewer initialDatasetId="landsat" />);
  fireEvent.click(await screen.findByRole('button', { name: '결과' }));
  const drawer = screen.getByRole('complementary', { name: '결과 비교' });
  expect(await within(drawer).findByText('연구용(정답 기준 보정, 점수가 실제보다 높게 나올 수 있음)')).toBeInTheDocument();
  expect(within(drawer).getByText(/최적 임계값 0.90/)).toBeInTheDocument();
  for (const label of ['IoU', 'F1', '정밀도', '재현율']) expect(within(drawer).getByText(label)).toBeInTheDocument();
  expect(within(drawer).getByText('0.845')).toBeInTheDocument();
});

test('비교 대상을 “AI 결과”로 바꾸면 같은 시점의 원본 ↔ AI 결과를 스와이프하고, “시점”으로 돌아온다', async () => {
  render(<Viewer initialDatasetId="landsat" />);
  await screen.findByRole('button', { name: '결과' });
  fireEvent.click(screen.getByRole('button', { name: /스와이프/ }));
  const target = screen.getByRole('group', { name: '비교 대상' });
  expect(within(target).getByRole('button', { name: '시점' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('combobox', { name: '비교 시점 B' })).toBeInTheDocument();
  fireEvent.click(within(target).getByRole('button', { name: 'AI 결과' }));
  expect(within(target).getByRole('button', { name: 'AI 결과' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('slider', { name: '스와이프 구분선' })).toHaveAttribute('aria-valuetext', '왼쪽 원본 50%, 오른쪽 AI 결과 50%');
  expect(screen.queryByRole('combobox', { name: '비교 시점 B' })).not.toBeInTheDocument();
  expect(screen.getByText('원본 ↔ AI 결과')).toBeInTheDocument();
  await waitFor(() => expect(window.location.search).toContain('cmp=ai'));
  expect(window.location.search).toContain('ai=ai-demo-1');
  fireEvent.click(screen.getByRole('button', { name: /나란히/ }));
  expect(screen.getByRole('region', { name: /비교 지도 · 원본과 AI 결과/ })).toBeInTheDocument();
  fireEvent.click(within(screen.getByRole('group', { name: '비교 대상' })).getByRole('button', { name: '시점' }));
  expect(screen.getByRole('region', { name: /비교 지도 B/ })).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: '비교 시점 B' })).toBeInTheDocument();
});

test('AI 결과가 없는 데이터에서는 비교 대상 “AI 결과”를 고를 수 없다', async () => {
  render(<Viewer initialDatasetId="nakdong" />);
  await screen.findByRole('region', { name: '시계열 탐색기' });
  fireEvent.click(screen.getByRole('button', { name: /스와이프/ }));
  expect(within(screen.getByRole('group', { name: '비교 대상' })).getByRole('button', { name: 'AI 결과' })).toBeDisabled();
});

test('시점별 면적 CSV: 표 머리글·단위·값 없음·시점별 지표를 담는다', () => {
  const times = [
    { iso: '2025-07-03T00:00:00Z', label: '2025.07.03' },
    { iso: '2025-07-18T00:00:00Z', label: '2025.07.18' },
    { iso: '2025-08-02T00:00:00Z', label: '2025.08.02' },
  ];
  const csv = areaCsv(demoResult(times, 'unet-s1s2-10ch', 0.5, true), (iso) => times.find((time) => time.iso === iso)?.label ?? iso);
  const lines = csv.replace(/^﻿/, '').trim().split('\n');
  expect(csv.startsWith('﻿')).toBe(true);
  expect(lines[0]).toBe('시점,날짜,수체 면적(km²),수체 비율(%),유효 면적(km²),IoU,F1,정밀도,재현율');
  expect(lines[1]).toBe('2025-07-03T00:00:00Z,2025.07.03,38.20,20.9,182.40,0.845,0.916,0.870,0.970');
  expect(lines[3]).toBe('2025-08-02T00:00:00Z,2025.08.02,,,,,,,');
  const plain = areaCsv(demoResult(times.slice(0, 1), 'ndwi-baseline', 0, false), (iso) => iso);
  expect(plain.split('\n')[0]).toBe('﻿시점,날짜,수체 면적(km²),수체 비율(%),유효 면적(km²)');
});

test('결과는 계약의 다른 곡선 모양(thresholds 배열)도 같은 형태로 읽는다', () => {
  const result = normalizeResult({
    perTime: [{ time: 't1', waterAreaKm2: 10, waterRatio: 0.1, validAreaKm2: 100 }],
    thresholdCurve: { thresholds: [0.25, 0.5], times: [{ time: 't1', waterAreaKm2: [12, 10] }] },
    researchBestThreshold: 0.85,
  });
  expect(result?.times[0]).toEqual({ time: 't1', waterAreaKm2: 10, waterRatio: 0.1, validAreaKm2: 100 });
  expect(result?.thresholdCurve).toEqual([{ time: 't1', points: [{ threshold: 0.25, waterAreaKm2: 12 }, { threshold: 0.5, waterAreaKm2: 10 }] }]);
  expect(result?.researchBestThreshold).toEqual({ threshold: 0.85 });
});

test('AI 서비스의 실제 결과 모양(timeSeries, thresholdCurve.values, 평평한 metrics)을 읽는다', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { normalizeResult } = require('../../api/aiApi');
  const result = normalizeResult({
    threshold: 0.5,
    metrics: { iou: 0.854, f1: 0.921, precision: 0.873, recall: 0.975 },
    timeSeries: [{ time: '2024-08-14T02:27:28Z', waterAreaKm2: 54.6, validAreaKm2: 895.5, waterRatio: 0.061,
      metrics: { iou: 0.854, f1: 0.921, precision: 0.873, recall: 0.975 },
      researchBestThreshold: { threshold: 0.91, iou: 0.883, f1: 0.938, researchOnly: true } }],
    thresholdCurve: [{ time: '2024-08-14T02:27:28Z', values: [{ threshold: 0.05, waterAreaKm2: 82.1 }, { threshold: 0.5, waterAreaKm2: 54.6 }] }],
  });
  expect(result.times[0].waterAreaKm2).toBe(54.6);
  expect(result.thresholdCurve[0].points).toHaveLength(2);
  expect(result.metrics.overall.iou).toBe(0.854);
  expect(result.metrics.times[0].time).toBe('2024-08-14T02:27:28Z');
  expect(result.researchBestThreshold.threshold).toBe(0.91);
});

test('AI 수체 지도 색은 범례와 같은 물색(--fb-ai-water)이고, 1만 칠하는 xcube 범주형 색표를 보낸다', () => {
  const css = readFileSync(join(__dirname, '../../styles/fieldbook.css'), 'utf8');
  const tokens = Array.from(css.matchAll(/--fb-ai-water:\s*(#[0-9a-f]{6})/gi)).map((match) => match[1].toLowerCase());
  expect(tokens).toEqual([AI_WATER.light, AI_WATER.dark]);
  expect(JSON.parse(aiMaskStyle('light').cmap)).toEqual({ name: 'xcube_ai_water', type: 'categorical', colors: [[1, AI_WATER.light]] });
  expect(JSON.parse(aiMaskStyle('dark').cmap).colors).toEqual([[1, AI_WATER.dark]]);
  expect(aiMaskStyle('light')).not.toHaveProperty('vmin');
});

test('“지도에 표시 중”은 고른 결과가 실제로 지도에 켜져 있을 때만 보인다', () => {
  const entries = [{ key: 'j1', name: 'U-Net 결과', status: 'SUCCEEDED' }, { key: 'j2', name: 'NDWI 결과', status: 'SUCCEEDED' }];
  const { rerender } = render(<AiResultList entries={entries} selectedKey="j1" onMap={false} onSelect={jest.fn()} />);
  expect(screen.queryByText('지도에 표시 중')).not.toBeInTheDocument();
  rerender(<AiResultList entries={entries} selectedKey="j1" onMap onSelect={jest.fn()} />);
  expect(within(screen.getByRole('button', { name: /U-Net 결과/ })).getByText('지도에 표시 중')).toBeInTheDocument();
  expect(within(screen.getByRole('button', { name: /NDWI 결과/ })).queryByText('지도에 표시 중')).not.toBeInTheDocument();
});
