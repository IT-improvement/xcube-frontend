/* S12 수식 융합 in demo mode: formula grammar, dry-run blockers and the request body. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

jest.mock('../../api', () => ({ activeViewerAdapter: jest.requireActual('../../api/viewerAdapter').viewerAdapter, useMockApi: true }));

const { validateFormula, fusionJobsDemo } = require('../fusionDemo');
const FusionPage = require('./FusionPage').default;

describe('수식 검증 (서버와 같은 문법)', () => {
  const vars = ['A', 'B'];
  test.each([
    ['__import__("os")', 0, 'NAME_FORBIDDEN'],
    ['A + __x__', 4, 'NAME_FORBIDDEN'],
    ['A.x', 1, 'ATTRIBUTE_NOT_ALLOWED'],
    ['A[0]', 1, 'SUBSCRIPT_NOT_ALLOWED'],
    ["'s'", 0, 'STRING_NOT_ALLOWED'],
    ['A + C', 4, 'UNKNOWN_NAME'],
    ['open(A)', 0, 'FUNCTION_NOT_ALLOWED'],
    ['clip(A)', 0, 'ARITY'],
    ['max(A, B=1)', 8, 'KEYWORD_ARG_NOT_ALLOWED'],
    ['f(x)', 0, 'FUNCTION_NOT_ALLOWED'],
    ['(A + B', 6, 'SYNTAX'],
    ['A +', 3, 'SYNTAX'],
  ])('%s 는 거부하고 위치를 알려 준다', (formula, position, code) => {
    const result = validateFormula(formula, vars);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatchObject({ code, position });
    expect(result.errors[0].length).toBeGreaterThanOrEqual(0);
  });

  test.each(['(A - B) / (A + B)', 'A*0.5 + B*0.3', '-A ** 2', 'where(A > 0.5 & B < 1, A, clip(B, 0, 1))', 'min(A, B, 3) + sqrt(abs(A)) + log10(B) + exp(1e-3)', 'A >= 1 | B != 2'])('%s 는 허용한다', (formula) => {
    expect(validateFormula(formula, vars)).toEqual({ valid: true, errors: [] });
  });
});

function renderPage(path = '/app/analysis/fusion') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/app/analysis/fusion" element={<FusionPage />} />
        <Route path="/app/jobs" element={<p>작업 센터</p>} />
      </Routes>
    </MemoryRouter>,
  );
}
const pick = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const longWait = { timeout: 4000 };
jest.setTimeout(20000);
afterEach(() => jest.restoreAllMocks());

async function fillInputs(a: string, b: string) {
  await waitFor(() => expect(screen.getByLabelText('A 데이터')).not.toBeDisabled(), longWait);
  pick('A 데이터', a); pick('A 변수', 'NDWI');
  pick('B 데이터', b); pick('B 변수', 'NDWI');
  fireEvent.click(screen.getByRole('button', { name: /다음/ }));
}
async function typeFormula(formula: string) {
  const input = await screen.findByRole('textbox', { name: '수식' });
  fireEvent.change(input, { target: { value: formula } });
  return input;
}

describe('S12 수식 융합 화면', () => {
  test('수식 오류는 입력 중에 위치와 함께 알리고, 고치기 전에는 다음으로 가지 못한다', async () => {
    renderPage();
    await fillInputs('sentinel', 'landsat');
    await typeFormula('A.x + B');
    expect(await screen.findByRole('alert', {}, longWait)).toHaveTextContent('2번째 글자');
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));
    expect(screen.getAllByRole('alert').some((node) => node.textContent?.includes('수식 오류를 고쳐 주세요'))).toBe(true);
    expect(screen.getByRole('heading', { name: '수식' })).toBeInTheDocument();
    await typeFormula('A - B');
    expect(await screen.findByText('사용 가능한 수식입니다.', {}, longWait)).toBeInTheDocument();
  });

  test('dry-run에 blocker가 있으면 쉬운 한국어로 알리고 실행을 막는다', async () => {
    const create = jest.spyOn(fusionJobsDemo, 'create');
    renderPage();
    await fillInputs('sentinel', 'nakdong'); // 서로 다른 지역
    await typeFormula('A - B');
    await screen.findByText('사용 가능한 수식입니다.', {}, longWait);
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));
    expect(await screen.findByText(/공간 범위가 서로 겹치지 않습니다/, {}, longWait)).toBeInTheDocument();
    const run = screen.getByRole('button', { name: '융합 실행' });
    expect(run).toBeDisabled();
    fireEvent.click(run);
    expect(create).not.toHaveBeenCalled();
  });

  test('정상 흐름은 계약대로 FusionRequest를 보내고 작업 센터 링크를 보여 준다', async () => {
    const create = jest.spyOn(fusionJobsDemo, 'create');
    renderPage();
    await fillInputs('sentinel', 'landsat');
    await typeFormula('A - B');
    await screen.findByText('사용 가능한 수식입니다.', {}, longWait);
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));
    expect(await screen.findByText('실행할 수 있습니다.', {}, longWait)).toBeInTheDocument();
    expect(screen.getByText(/Landsat 값 범위를 자동 보정/)).toBeInTheDocument(); // 경고 표시
    expect(screen.getByRole('columnheader', { name: '정규화식' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('결과 이름'), { target: { value: 'NDWI 융합' } });
    fireEvent.click(screen.getByRole('button', { name: '융합 실행' }));
    expect(await screen.findByText('융합 작업을 시작했습니다', { selector: 'h2' }, longWait)).toBeInTheDocument();
    expect(create).toHaveBeenCalledWith({
      name: 'NDWI 융합',
      formula: 'A - B',
      bindings: {
        A: { datacubeId: 'sentinel', variable: 'NDWI', normalization: 'auto' },
        B: { datacubeId: 'landsat', variable: 'NDWI', normalization: 'auto' },
      },
      grid: { reference: 'coarsest', datacubeId: null, resampling: 'average' },
      extent: 'intersection',
      time: { mode: 'exact', toleranceDays: null, period: null, agg: null },
      outputVariable: 'fusion',
      projectId: null,
    });
    expect(screen.getByRole('link', { name: '작업 센터에서 보기' })).toHaveAttribute('href', '/app/jobs');
  });

  test('이전 작업(?from=)의 요청값으로 채워서 연다', async () => {
    const job = await fusionJobsDemo.create({ name: '이전 융합', formula: 'A * 2', bindings: { A: { datacubeId: 'landsat', variable: 'NDWI', normalization: { scale: 0.5, offset: 1 } } }, grid: { reference: 'finest', datacubeId: null, resampling: 'nearest' }, extent: 'union', time: { mode: 'nearest', toleranceDays: 5, period: null, agg: null }, outputVariable: 'out', projectId: null });
    renderPage(`/app/analysis/fusion?from=${job.id}`);
    await waitFor(() => expect(screen.getByLabelText('A 데이터')).toHaveValue('landsat'), longWait);
    expect(screen.getByLabelText('A 정규화')).toHaveValue('custom');
    expect(screen.getByLabelText('A 배율 (scale)')).toHaveValue('0.5');
  });
});
