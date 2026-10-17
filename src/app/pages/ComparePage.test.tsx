/* S9 비교 분석 (UR-63 F3): Viewer hand-over (?type=&source=&result=&t=), the live check, run → poll → metrics,
   server error codes in words, and the past comparisons list. */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ApiError } from '../../api/httpClient';

jest.mock('../../api', () => ({ activeViewerAdapter: { getProjects: jest.fn(), getDatasets: jest.fn(), getProjectDatasets: jest.fn(), getJobs: jest.fn(), runWaterExtraction: jest.fn() }, useMockApi: false }));
jest.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 8, name: '점검', role: mockRole }, signOut: jest.fn() }) }));
let mockRole = 'PROJECT_USER';
jest.mock('../../api/compare', () => ({ ...jest.requireActual('../../api/compare'), compareApi: { create: jest.fn(), get: jest.fn(), check: jest.fn(), listJobs: jest.fn(), cancel: jest.fn() } }));

const adapter = require('../../api').activeViewerAdapter as Record<string, jest.Mock>;
const compare = require('../../api/compare').compareApi as Record<string, jest.Mock>;
const ComparePage = require('./ComparePage').default;

const t1 = '2026-04-26T02:27:27Z';
const t2 = '2026-05-31T02:27:23Z';
const ai = (id: string, name: string, source = '86', times = [t1, t2]) => ({ id, name, projectId: '', subtitle: '', xcubeDatasetId: `d${id}`, defaultVariable: 'water_mask', variables: ['water_mask'], times: times.map((iso) => ({ iso, label: '' })), kind: 'AI_RESULT', sourceDatacubeId: source, accessType: 'OWNED' });
const datasets = [
  { id: '86', name: 'test_GEE', projectId: '', subtitle: '', xcubeDatasetId: 'd86', defaultVariable: 'blue', variables: ['blue'], times: [{ iso: t1, label: '' }], accessType: 'SHARED', isExample: true },
  { ...ai('87', 'U-Net 결과'), isExample: true },
  ai('88', 'NDWI 결과'),
  ai('72', '대청호 DeepLab', '55', ['2024-08-14T02:27:28.344000Z']),
];
const check = { type: 'TIME_CHANGE', times: { t1: '2026-04-26T02:27:27.611000Z', t2: '2026-05-31T02:27:22.187000Z' }, grid: { width: 3705, height: 3001, bbox: [0, 0, 1, 1] }, estimatedBytes: 11118705, quota: { limitBytes: 53687091200, usedBytes: 1205260374, allowed: true }, blockers: [], warnings: [] };
const done = {
  id: 'c1', name: 'U-Net 결과 시점 변화', type: 'COMPARE', compareType: 'TIME_CHANGE', status: 'SUCCEEDED', progress: 1, createdAt: '2026-10-17T08:48:15Z',
  input: { type: 'TIME_CHANGE', resultId: 87, t1, t2 }, registration: { datacubeId: 101 },
  metrics: { areaKm2: { kept: 18.798, gained: 0.732, lost: 3.329 }, waterAreaKm2: { t1: 22.127, t2: 19.53 }, netChangeKm2: -2.597, changePercent: -11.74 },
};

const renderAt = (path: string) => render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/app/analysis/compare" element={<ComparePage />} /></Routes></MemoryRouter>);

beforeEach(() => {
  mockRole = 'PROJECT_USER';
  adapter.getDatasets.mockResolvedValue(datasets);
  compare.listJobs.mockResolvedValue([]);
  compare.check.mockResolvedValue(check);
});

test('Viewer에서 넘긴 값으로 채우고, 확인 결과(시점·격자·크기·남은 용량)를 보인 뒤 실행 → 지표·범례·Viewer 링크', async () => {
  compare.create.mockResolvedValue({ ...done, status: 'QUEUED', metrics: null, registration: null });
  compare.get.mockResolvedValueOnce({ ...done, status: 'RUNNING', progress: 0.5, metrics: null, registration: null }).mockResolvedValue(done);
  renderAt(`/app/analysis/compare?type=TIME_CHANGE&source=86&result=87&t=${encodeURIComponent(t2)}`);
  await waitFor(() => expect(screen.getByLabelText('AI 결과')).toHaveValue('87'));
  await waitFor(() => expect(screen.getByLabelText('이전 시점 (T1)')).toHaveValue(t1));
  expect(screen.getByLabelText('이후 시점 (T2)')).toHaveValue(t2);
  expect(await screen.findByText('실행할 수 있습니다.')).toBeInTheDocument();
  expect(screen.getByText(/시점 2026-04-26 → 2026-05-31 · 격자 3,705×3,001 · 예상 크기 .* · 남은 용량/)).toBeInTheDocument();
  expect(compare.check).toHaveBeenLastCalledWith({ type: 'TIME_CHANGE', resultId: 87, t1, t2 });

  jest.useFakeTimers();
  try {
    fireEvent.click(screen.getByRole('button', { name: '비교 실행' }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(compare.create).toHaveBeenCalledWith({ type: 'TIME_CHANGE', resultId: 87, t1, t2 });
    await act(async () => { jest.advanceTimersByTime(2100); await Promise.resolve(); await Promise.resolve(); });
  } finally { jest.useRealTimers(); }
  const result = await screen.findByRole('region', { name: 'U-Net 결과 시점 변화' });
  expect(within(result).getByText('-11.7%')).toBeInTheDocument();
  expect(within(result).getByText('0.73 km²', { selector: 'dd' })).toBeInTheDocument();
  expect(within(result).getByText('-2.60 km²')).toBeInTheDocument();
  expect(within(result).getByText('3.33 km²', { selector: '.class-key__area' })).toBeInTheDocument();
  expect(within(result).getByText('투명: 변화 없음(물 아님)')).toBeInTheDocument();
  expect(within(result).getByRole('link', { name: /Viewer에서 보기/ })).toHaveAttribute('href', '/app/viewer?dataset=101');
});

test('모델 간: B는 같은 원본의 다른 결과만, 서버 오류 코드는 고칠 방법을 말한다', async () => {
  compare.check.mockRejectedValue(new ApiError(400, 'SOURCE_MISMATCH', 'mismatch'));
  renderAt('/app/analysis/compare');
  fireEvent.click(await screen.findByRole('radio', { name: /모델 간 비교/ }));
  fireEvent.change(screen.getByLabelText('결과 A'), { target: { value: '87' } });
  const b = screen.getByLabelText('결과 B (같은 원본)');
  expect(within(b).getAllByRole('option').map((option) => option.textContent)).toEqual(['고르세요', expect.stringContaining('NDWI 결과')]);
  fireEvent.change(b, { target: { value: '88' } });
  fireEvent.change(screen.getByLabelText('시점'), { target: { value: t1 } });
  expect(await screen.findByText('두 결과의 원본이 다릅니다. 같은 원본에서 만든 결과를 고르세요.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '비교 실행' })).toBeDisabled();
});

test('정답 대비 결과: 정밀도·재현율·F1·IoU·Kappa와 혼동행렬', async () => {
  compare.listJobs.mockResolvedValue([{ id: 'r1', name: '대청호 정답 대비', type: 'COMPARE', compareType: 'REFERENCE', status: 'SUCCEEDED', createdAt: '2026-10-17T08:00:00Z', input: { type: 'REFERENCE', resultId: 72, time: '2024-08-14', reference: 'water_gt' }, registration: { datacubeId: 98 }, metrics: { precision: 0.8732, recall: 0.9755, f1: 0.9215, iou: 0.8545, kappa: 0.9167, oa: 0.9909, confusion: { tp: 594647, fp: 86326, fn: 14953, tn: 10478794 } } }]);
  compare.get.mockImplementation(() => compare.listJobs().then((list: any[]) => list[0]));
  renderAt('/app/analysis/compare');
  const row = (await screen.findByText('대청호 정답 대비')).closest('tr')!;
  expect(within(row).getByText('F1 0.922 · IoU 0.855')).toBeInTheDocument();
  fireEvent.click(within(row).getByRole('button', { name: '대청호 정답 대비 결과 보기' }));
  const result = await screen.findByRole('region', { name: '대청호 정답 대비' });
  expect(within(result).getByText('0.873')).toBeInTheDocument();
  expect(within(result).getByText('TP 594,647')).toBeInTheDocument();
  expect(within(result).getByText('FN 14,953')).toBeInTheDocument();
});

test('유저(USER)는 실행이 꺼지고 이유를 본다', async () => {
  mockRole = 'USER';
  renderAt('/app/analysis/compare?result=87');
  expect(await screen.findByText('관리자에게 프로젝트 유저 등급을 요청하세요.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /비교 실행/ })).toHaveAttribute('aria-disabled', 'true');
  expect(compare.check).not.toHaveBeenCalled();
});
