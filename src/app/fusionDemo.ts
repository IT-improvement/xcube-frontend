// Demo (REACT_APP_USE_MOCK_API=true) stand-in for the Data Analysis API: a formula validator that follows
// the server grammar, a rough dry-run and in-memory fusion jobs. Real mode never uses this module.
import type { Blocker, DryRun, FormulaError, FusionRequest, ValidateResult } from '../api/analysisApi';
import type { JobSummary } from '../api/generationApi';
import type { ZarrDataset } from '../api/viewerAdapter';

export const FUNCTIONS: Record<string, { min: number; max: number }> = {
  abs: { min: 1, max: 1 }, sqrt: { min: 1, max: 1 }, log: { min: 1, max: 1 }, log10: { min: 1, max: 1 }, exp: { min: 1, max: 1 },
  min: { min: 2, max: Infinity }, max: { min: 2, max: Infinity }, where: { min: 3, max: 3 }, clip: { min: 3, max: 3 },
};

type Token = { type: 'num' | 'name' | 'op' | 'end'; text: string; position: number; failure?: FormulaError };
class FormulaFailure extends Error {
  constructor(public detail: FormulaError) { super(detail.message); }
}
const fail = (code: string, message: string, position: number, length = 1): never => { throw new FormulaFailure({ code, message, position, length }); };

/** A character the grammar forbids becomes a token that fails only when the parser reaches it, so earlier problems are reported first. */
function tokenize(formula: string): Token[] {
  try { return scan(formula); } catch (cause) {
    if (!(cause instanceof FormulaFailure)) throw cause;
    const partial = scanned.splice(0);
    partial.push({ type: 'end', text: '', position: cause.detail.position, failure: cause.detail });
    return partial;
  }
}
let scanned: Token[] = [];
function scan(formula: string): Token[] {
  const tokens: Token[] = (scanned = []);
  let index = 0;
  while (index < formula.length) {
    const char = formula[index];
    if (/\s/.test(char)) { index += 1; continue; }
    const number = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(formula.slice(index));
    if (number) { tokens.push({ type: 'num', text: number[0], position: index }); index += number[0].length; continue; }
    const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(formula.slice(index));
    if (name) { tokens.push({ type: 'name', text: name[0], position: index }); index += name[0].length; continue; }
    if (char === "'" || char === '"') fail('STRING_NOT_ALLOWED', '문자열은 사용할 수 없습니다.', index);
    if (char === '.') fail('ATTRIBUTE_NOT_ALLOWED', '속성 접근(.)은 사용할 수 없습니다.', index);
    if (char === '[' || char === ']') fail('SUBSCRIPT_NOT_ALLOWED', '첨자([ ])는 사용할 수 없습니다.', index);
    const two = formula.slice(index, index + 2);
    if (['**', '<=', '>=', '==', '!='].includes(two)) { tokens.push({ type: 'op', text: two, position: index }); index += 2; continue; }
    if ('+-*/()<>,&|'.includes(char)) { tokens.push({ type: 'op', text: char, position: index }); index += 1; continue; }
    if (char === '=') fail('KEYWORD_ARG_NOT_ALLOWED', '키워드 인수(=)는 사용할 수 없습니다. 비교는 ==를 쓰세요.', index);
    return fail('UNEXPECTED_CHAR', `사용할 수 없는 문자 “${char}”입니다.`, index);
  }
  tokens.push({ type: 'end', text: '', position: formula.length });
  return tokens;
}

/** Same rules as the server's ast allow-list; reports the first problem with a 0-based position. */
export function validateFormula(formula: string, variables: string[]): ValidateResult {
  try {
    if (!formula.trim()) fail('EMPTY_FORMULA', '수식을 입력해 주세요.', 0, 0);
    const tokens = tokenize(formula);
    let cursor = 0;
    const peek = () => { const token = tokens[cursor]; if (token.failure) throw new FormulaFailure(token.failure); return token; };
    const take = () => { const token = peek(); cursor += 1; return token; };
    const isOp = (...ops: string[]) => peek().type === 'op' && ops.includes(peek().text);
    const expect = (text: string) => {
      if (!isOp(text)) fail('SYNTAX', peek().type === 'end' ? `“${text}”가 필요합니다.` : `“${peek().text}” 대신 “${text}”가 필요합니다.`, peek().position, Math.max(1, peek().text.length));
      take();
    };
    const binary = (next: () => void, ...ops: string[]) => { next(); while (isOp(...ops)) { take(); next(); } };
    const orExpr = () => binary(andExpr, '|');
    const andExpr = () => binary(compare, '&');
    const compare = () => binary(sum, '<', '<=', '>', '>=', '==', '!=');
    const sum = () => binary(product, '+', '-');
    const product = () => binary(unary, '*', '/');
    const unary = () => { if (isOp('+', '-')) { take(); unary(); } else power(); };
    const power = () => { atom(); if (isOp('**')) { take(); unary(); } };
    const atom = () => {
      const token = take();
      if (token.type === 'num') return;
      if (token.type === 'op' && token.text === '(') { orExpr(); expect(')'); return; }
      if (token.type === 'name') {
        if (token.text.includes('__')) fail('NAME_FORBIDDEN', `“${token.text}”는 사용할 수 없습니다. (__ 포함)`, token.position, token.text.length);
        if (isOp('(')) {
          const spec = FUNCTIONS[token.text];
          if (!spec) fail('FUNCTION_NOT_ALLOWED', `“${token.text}” 함수는 사용할 수 없습니다.`, token.position, token.text.length);
          take();
          let count = 0;
          if (!isOp(')')) { do { if (count) take(); orExpr(); count += 1; } while (isOp(',')); }
          expect(')');
          if (count < spec.min || count > spec.max) fail('ARITY', `${token.text}()에는 인수 ${spec.max === Infinity ? `${spec.min}개 이상` : spec.min === spec.max ? `${spec.min}개` : `${spec.min}~${spec.max}개`}가 필요합니다.`, token.position, token.text.length);
          return;
        }
        if (!variables.includes(token.text)) fail('UNKNOWN_NAME', `“${token.text}”는 입력 변수가 아닙니다.`, token.position, token.text.length);
        return;
      }
      return fail('SYNTAX', token.type === 'end' ? '수식이 끝나지 않았습니다.' : `“${token.text}” 위치에 값이 필요합니다.`, token.position, Math.max(1, token.text.length));
    };
    orExpr();
    if (peek().type !== 'end') fail('SYNTAX', `“${peek().text}”는 이 위치에서 쓸 수 없습니다.`, peek().position, peek().text.length);
    return { valid: true, errors: [] };
  } catch (cause) {
    if (cause instanceof FormulaFailure) return { valid: false, errors: [cause.detail] };
    throw cause;
  }
}

const DEFAULT_BBOX: [number, number, number, number] = [128.6, 35.3, 129.3, 35.7];
const GIB = 1024 ** 3;
const DEMO_USED = 1_200_000_000;
const RESOLUTION = { coarsest: 0.0003, finest: 0.0001, datacube: 0.0002 } as const;

/** Rough dry-run over the demo datasets: time matching, extent, grid size, quota and normalization. */
export function dryRunDemo(request: FusionRequest, datasets: ZarrDataset[]): DryRun {
  const blockers: Blocker[] = [];
  const warnings: string[] = [];
  const names = Object.keys(request.bindings);
  const formula = validateFormula(request.formula, names);
  if (!formula.valid) blockers.push('FORMULA_INVALID');
  const inputs = names.map((name) => ({ name, binding: request.bindings[name], dataset: datasets.find((item) => item.id === String(request.bindings[name].datacubeId)) }));
  if (inputs.some((item) => !item.dataset)) blockers.push('INPUT_NOT_FOUND');
  else if (inputs.some((item) => !item.dataset!.variables.includes(item.binding.variable))) blockers.push('VARIABLE_NOT_FOUND');
  const found = inputs.filter((item) => item.dataset);

  const boxes = found.map((item) => item.dataset!.bbox ?? DEFAULT_BBOX);
  const bbox: [number, number, number, number] = boxes.length
    ? (request.extent === 'union'
      ? [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))]
      : [Math.max(...boxes.map((b) => b[0])), Math.max(...boxes.map((b) => b[1])), Math.min(...boxes.map((b) => b[2])), Math.min(...boxes.map((b) => b[3]))])
    : DEFAULT_BBOX;
  const overlap = bbox[0] < bbox[2] && bbox[1] < bbox[3];
  if (found.length && !overlap) blockers.push('NO_OVERLAP');

  const timeSets = found.map((item) => item.dataset!.times);
  let times: string[] = [];
  if (timeSets.length) {
    if (request.time.mode === 'exact') times = timeSets[0].map((t) => t.iso).filter((iso) => timeSets.every((set) => set.some((t) => t.iso === iso)));
    else if (request.time.mode === 'nearest') times = timeSets[0].map((t) => t.iso);
    else {
      const length = request.time.period === 'year' ? 4 : request.time.period === 'month' ? 7 : 10;
      times = Array.from(new Set(timeSets.flat().map((t) => t.label.slice(0, length))));
    }
  }
  if (found.length && !times.length) blockers.push('NO_TIMES');

  const resolution = RESOLUTION[request.grid.reference];
  const width = overlap ? Math.max(1, Math.round((bbox[2] - bbox[0]) / resolution)) : 0;
  const height = overlap ? Math.max(1, Math.round((bbox[3] - bbox[1]) / resolution)) : 0;
  const estimatedBytes = width * height * 4 * times.length;
  const limitBytes = 50 * GIB;
  const allowed = DEMO_USED + estimatedBytes <= limitBytes;
  if (!allowed) blockers.push('QUOTA_EXCEEDED');

  const normalization = inputs.map(({ name, binding, dataset }) => {
    const custom = typeof binding.normalization === 'object' ? binding.normalization : null;
    const lower = (dataset?.name ?? '').toLowerCase();
    if (binding.normalization === 'auto' && lower.includes('cas500')) warnings.push(`CAS500 계수가 확정되지 않아 ${name} 정규화 없이 사용`);
    if (binding.normalization === 'auto' && lower.includes('landsat')) warnings.push(`${name}: Landsat 값 범위를 자동 보정합니다. (데모)`);
    const known = !lower.includes('cas500');
    return {
      binding: name,
      sensor: lower.includes('landsat') ? 'LANDSAT_C2_L2' : lower.includes('cas500') ? 'CAS500_1_L2' : 'SENTINEL2_L2A',
      band: binding.variable,
      expression: custom ? `x × ${custom.scale} + ${custom.offset}` : binding.normalization === 'none' ? '정규화 없음' : known ? 'x × 0.0001 + 0' : null,
      applied: !!custom || (binding.normalization === 'auto' && known),
    };
  });
  if (request.time.mode === 'nearest') warnings.push(`허용 오차 ${request.time.toleranceDays ?? 0}일 안에서 가장 가까운 시점을 사용합니다.`);
  return { times, timeCount: times.length, grid: { width, height, resolution, bbox }, dtype: 'float32', estimatedBytes, quota: { usedBytes: DEMO_USED, limitBytes, allowed }, normalization, warnings: Array.from(new Set(warnings)), blockers };
}

const demoJobs: JobSummary[] = [];
let sequence = 0;
const wait = (ms = 300) => new Promise((resolve) => window.setTimeout(resolve, ms));
const missing = () => Object.assign(new Error('작업을 찾을 수 없습니다.'), { status: 404 });

export const fusionJobsDemo = {
  async create(request: FusionRequest): Promise<JobSummary> {
    await wait();
    const now = new Date().toISOString();
    const job: JobSummary = { id: `fusion-${++sequence}`, type: 'FUSION', name: request.name, status: 'RUNNING', progress: 0.3, stage: 'compute', createdAt: now, startedAt: now, input: request as unknown as Record<string, unknown> };
    demoJobs.unshift(job);
    return job;
  },
  async list(filter: { status?: string } = {}) { await wait(150); return demoJobs.filter((job) => !filter.status || filter.status.split(',').includes(job.status)); },
  async get(jobId: string) { await wait(150); const job = demoJobs.find((item) => item.id === jobId); if (!job) throw missing(); return job; },
  async cancel(jobId: string) { await wait(); const job = demoJobs.find((item) => item.id === jobId); if (job) Object.assign(job, { status: 'CANCELLED', finishedAt: new Date().toISOString() }); },
  async retry(jobId: string) {
    await wait();
    const job = demoJobs.find((item) => item.id === jobId);
    if (!job) throw missing();
    const again: JobSummary = { ...job, id: `fusion-${++sequence}`, status: 'QUEUED', progress: 0, errorCode: null, errorMessage: null, createdAt: new Date().toISOString(), finishedAt: null };
    demoJobs.unshift(again);
    return again;
  },
};
