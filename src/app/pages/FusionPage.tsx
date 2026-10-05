import { ArrowLeft, ArrowRight, Check, CheckCircle2, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { DryRun, FormulaError, FusionBinding, FusionRequest, Normalization } from '../../api/analysisApi';
import { blockerCode } from '../../api/analysisApi';
import { userMessage } from '../../api/httpClient';
import { Alert, Button, ButtonLink, TextField } from '../../components/ui';
import { Badge, Card, PageHeader, Skeleton, useToast } from '../../components/ui/kit';
import { appApi, canEditProject, fusion, isOwned, ZarrDataset } from '../api';
import { apiId, asFusionRequest, blockerText, defaultName, EXTENT_LABEL, formatBytes, GRID_LABEL, PERIOD_LABEL, AGG_LABEL, RESAMPLING_LABEL, TIME_LABEL } from '../fusion';
import { useLoad } from '../useLoad';
import '../wizard/wizard.css';
import './fusion.css';

const STEPS = ['입력', '수식', '규칙', '미리보기·실행'];
const FUNCTION_HELP = 'abs(x)  sqrt(x)  log(x)  log10(x)  exp(x)  min(a, b, …)  max(a, b, …)  where(조건, 참값, 거짓값)  clip(x, 최소, 최대)';
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

type NormMode = 'auto' | 'none' | 'custom';
type BindingRow = { letter: string; datasetId: string; variable: string; norm: NormMode; scale: string; offset: string };
type Rules = {
  reference: FusionRequest['grid']['reference']; gridDatasetId: string; resampling: FusionRequest['grid']['resampling'];
  extent: FusionRequest['extent']; timeMode: FusionRequest['time']['mode']; tolerance: string;
  period: 'day' | 'month' | 'year'; agg: 'mean' | 'max' | 'min' | 'median';
};
type FormulaCheck = { status: 'idle' | 'checking' | 'ok' | 'error' | 'unavailable'; error?: FormulaError };
type Preview = { key: string; loading: boolean; data?: DryRun; error?: string };

const DEFAULT_RULES: Rules = { reference: 'coarsest', gridDatasetId: '', resampling: 'average', extent: 'intersection', timeMode: 'exact', tolerance: '3', period: 'month', agg: 'mean' };
const emptyRow = (letter: string): BindingRow => ({ letter, datasetId: '', variable: '', norm: 'auto', scale: '1', offset: '0' });
const nextLetter = (rows: BindingRow[]) => LETTERS.split('').find((letter) => !rows.some((row) => row.letter === letter)) ?? '';

const normalizationOf = (row: BindingRow): Normalization => (row.norm === 'custom' ? { scale: Number(row.scale), offset: Number(row.offset) } : row.norm);

/** FusionRequest from the form state (contract: docs Backend "M6 계약"). */
export function buildRequest(input: { name: string; formula: string; rows: BindingRow[]; rules: Rules; outputVariable: string; projectId: string }): FusionRequest {
  const { rules } = input;
  const bindings: Record<string, FusionBinding> = {};
  for (const row of input.rows) bindings[row.letter] = { datacubeId: apiId(row.datasetId)!, variable: row.variable, normalization: normalizationOf(row) };
  return {
    name: input.name.trim(),
    formula: input.formula.trim(),
    bindings,
    grid: { reference: rules.reference, datacubeId: rules.reference === 'datacube' ? apiId(rules.gridDatasetId) : null, resampling: rules.resampling },
    extent: rules.extent,
    time: {
      mode: rules.timeMode,
      toleranceDays: rules.timeMode === 'nearest' ? Number(rules.tolerance) : null,
      period: rules.timeMode === 'aggregate' ? rules.period : null,
      agg: rules.timeMode === 'aggregate' ? rules.agg : null,
    },
    outputVariable: input.outputVariable.trim() || 'fusion',
    projectId: apiId(input.projectId),
  };
}

/** Request values coming from a job or dataset history, back into form state. */
function fromRequest(request: Partial<FusionRequest>) {
  const rows: BindingRow[] = Object.entries(request.bindings ?? {}).map(([letter, binding]) => {
    const normalization = binding.normalization;
    const custom = typeof normalization === 'object' && normalization !== null;
    return { letter, datasetId: String(binding.datacubeId), variable: binding.variable, norm: custom ? 'custom' as const : normalization === 'none' ? 'none' as const : 'auto' as const, scale: custom ? String(normalization.scale) : '1', offset: custom ? String(normalization.offset) : '0' };
  });
  const grid = request.grid;
  const time = request.time;
  const rules: Rules = {
    ...DEFAULT_RULES,
    ...(grid ? { reference: grid.reference, gridDatasetId: grid.datacubeId == null ? '' : String(grid.datacubeId), resampling: grid.resampling } : {}),
    ...(request.extent ? { extent: request.extent } : {}),
    ...(time ? { timeMode: time.mode, tolerance: time.toleranceDays == null ? DEFAULT_RULES.tolerance : String(time.toleranceDays), period: time.period ?? DEFAULT_RULES.period, agg: time.agg ?? DEFAULT_RULES.agg } : {}),
  };
  return { rows: rows.length ? rows : [emptyRow('A'), emptyRow('B')], rules, formula: request.formula ?? '', name: request.name ?? '', outputVariable: request.outputVariable ?? 'fusion', projectId: request.projectId == null ? '' : String(request.projectId) };
}

/** Formula with the error range underlined, so the position is visible under the text. */
function FormulaMarker({ formula, error }: { formula: string; error: FormulaError }) {
  const start = Math.min(error.position, formula.length);
  const end = Math.min(formula.length, start + Math.max(1, error.length));
  return (
    <div className="fusion-marker" aria-hidden>
      <span>{formula.slice(0, start)}</span>
      <mark>{formula.slice(start, end) || ' '}</mark>
      <span>{formula.slice(end)}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="xc-field"><span className="xc-label">{label}</span>{children}</label>;
}

/** S12 수식 융합: inputs → formula → rules → dry-run preview and run (FR-FUS-01~11). */
export default function FusionPage() {
  const location = useLocation();
  const [params] = useSearchParams();
  const fromJob = params.get('from');
  const state = (location.state as { request?: unknown } | null)?.request;
  const datasets = useLoad(() => appApi.listDatasets());
  const projects = useLoad(() => appApi.listProjects());
  const [step, setStep] = useState(0);
  const [rows, setRows] = useState<BindingRow[]>([emptyRow('A'), emptyRow('B')]);
  const [formula, setFormula] = useState('');
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES);
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [outputVariable, setOutputVariable] = useState('fusion');
  const [projectId, setProjectId] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [check, setCheck] = useState<FormulaCheck>({ status: 'idle' });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [started, setStarted] = useState<{ id: string | number; name: string } | null>(null);
  const [prefillError, setPrefillError] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const toast = useToast();
  const items = useMemo(() => datasets.data ?? [], [datasets.data]);
  const find = (id: string): ZarrDataset | undefined => items.find((item) => item.id === id);
  const letters = rows.map((row) => row.letter);

  const apply = (request: Partial<FusionRequest>) => {
    const next = fromRequest(request);
    setRows(next.rows); setRules(next.rules); setFormula(next.formula); setOutputVariable(next.outputVariable); setProjectId(next.projectId);
    if (next.name) { setName(next.name); setNameTouched(true); }
  };
  // Prefill from route state ("같은 조건으로 다시 실행") or ?from=<jobId>.
  useEffect(() => {
    const request = asFusionRequest(state);
    if (request) { apply(request); return; }
    if (!fromJob) return;
    let cancelled = false;
    fusion.getJob(fromJob)
      .then((job) => { const loaded = asFusionRequest(job.input); if (!cancelled && loaded) apply(loaded); else if (!cancelled) setPrefillError('이전 작업의 요청 정보를 찾을 수 없습니다.'); })
      .catch((cause) => { if (!cancelled) setPrefillError(`이전 작업을 불러오지 못했습니다. ${userMessage(cause)}`); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromJob, state]);

  // Default result name: {first dataset}_융합_{date}, until the user types their own.
  const firstName = find(rows[0]?.datasetId)?.name;
  useEffect(() => { if (!nameTouched) setName(defaultName(firstName)); }, [firstName, nameTouched]);

  useEffect(() => { headingRef.current?.focus(); }, [step]);
  useEffect(() => {
    if (started) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    if (step === 0 && !formula && !rows.some((row) => row.datasetId)) return;
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [step, formula, rows, started]);

  // Live validation while typing (debounced); only the latest answer counts.
  const lettersKey = letters.join(',');
  useEffect(() => {
    if (!formula.trim()) { setCheck({ status: 'idle' }); return; }
    setCheck((current) => (current.status === 'ok' || current.status === 'error' ? current : { status: 'checking' }));
    let cancelled = false;
    const timer = window.setTimeout(() => {
      fusion.validate(formula, lettersKey.split(',').filter(Boolean))
        .then((result) => { if (!cancelled) setCheck(result.valid ? { status: 'ok' } : { status: 'error', error: result.errors[0] }); })
        .catch(() => { if (!cancelled) setCheck({ status: 'unavailable' }); });
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [formula, lettersKey]);

  const request = buildRequest({ name: name || defaultName(firstName), formula, rows, rules, outputVariable, projectId });
  // The dry-run depends on everything except name, result variable and project.
  const ruleKey = JSON.stringify({ ...request, name: '', outputVariable: '', projectId: null });
  const requestRef = useRef(request);
  requestRef.current = request;
  const runDryRun = (key: string) => {
    setPreview({ key, loading: true });
    fusion.dryRun(requestRef.current)
      .then((data) => setPreview((current) => (current?.key === key ? { key, loading: false, data } : current)))
      .catch((cause) => setPreview((current) => (current?.key === key ? { key, loading: false, error: userMessage(cause) } : current)));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (step === 3 && !started) runDryRun(ruleKey); }, [step, ruleKey, started]);

  const stepProblem = (index: number): string => {
    if (index === 0) {
      if (rows.some((row) => !row.datasetId || !row.variable)) return '모든 변수에 데이터와 변수를 골라 주세요.';
      const bad = rows.find((row) => row.norm === 'custom' && (!Number.isFinite(Number(row.scale)) || row.scale.trim() === '' || !Number.isFinite(Number(row.offset)) || row.offset.trim() === ''));
      if (bad) return `${bad.letter}의 정규화 계수(배율·보정값)는 숫자여야 합니다.`;
    }
    if (index === 1) {
      if (!formula.trim()) return '수식을 입력해 주세요.';
      if (check.status === 'checking' || check.status === 'idle') return '수식을 확인하는 중입니다. 잠시 후 다시 시도해 주세요.';
      if (check.status === 'error') return '수식 오류를 고쳐 주세요.';
    }
    if (index === 2) {
      if (rules.reference === 'datacube' && !letters.some((letter) => rows.find((row) => row.letter === letter)?.datasetId === rules.gridDatasetId)) return '격자 기준으로 쓸 데이터를 입력 중에서 골라 주세요.';
      if (rules.timeMode === 'nearest' && !(Number.isInteger(Number(rules.tolerance)) && Number(rules.tolerance) >= 0 && rules.tolerance.trim() !== '')) return '허용 오차는 0 이상의 정수(일)로 입력해 주세요.';
    }
    return '';
  };
  const next = () => { if (stepProblem(step)) { setShowErrors(true); return; } setShowErrors(false); setStep(step + 1); };
  const back = () => { setShowErrors(false); setStep(step - 1); };

  const setRow = (letter: string, patch: Partial<BindingRow>) => setRows((current) => current.map((row) => (row.letter === letter ? { ...row, ...patch } : row)));

  const data = preview?.key === ruleKey ? preview.data : undefined;
  const blockers = data?.blockers ?? [];
  const nameProblem = !name.trim() ? '결과 이름을 입력해 주세요.' : !outputVariable.trim() ? '결과 변수 이름을 입력해 주세요.' : /^[A-Za-z_][A-Za-z0-9_]*$/.test(outputVariable.trim()) ? '' : '결과 변수 이름은 영문·숫자·밑줄만 쓸 수 있습니다.';
  const canRun = !!data && !blockers.length && !nameProblem && !submitting && !preview?.loading;
  const run = async () => {
    if (!canRun) return;
    setSubmitting(true); setSubmitError('');
    try {
      const job = await fusion.createJob(request);
      setStarted({ id: job.id, name: request.name });
      toast.show('융합 작업을 시작했습니다.');
    } catch (cause) {
      setSubmitError(userMessage(cause));
    } finally { setSubmitting(false); }
  };

  const editableProjects = (projects.data ?? []).filter(canEditProject);
  const problem = showErrors ? stepProblem(step) : '';
  const usedDatasets = Array.from(new Set(rows.map((row) => row.datasetId).filter(Boolean)));

  if (started) {
    return (
      <div className="page-stack wizard">
        <PageHeader title="수식 융합" />
        <Card>
          <div className="wizard-result">
            <span className="wizard-result__icon" aria-hidden><CheckCircle2 size={28} /></span>
            <h2 className="wizard-title">융합 작업을 시작했습니다</h2>
            <p role="status">“{started.name}” 작업이 대기열에 들어갔습니다. 이 화면을 닫아도 작업은 계속되며, 끝나면 데이터 목록에 “융합 결과”로 나타납니다.</p>
            <div className="wizard-result__actions">
              <ButtonLink to="/app/jobs">작업 센터에서 보기</ButtonLink>
              <ButtonLink to="/app/data" variant="secondary">데이터 목록</ButtonLink>
              <Button variant="ghost" onClick={() => { setStarted(null); setStep(0); setPreview(null); }}>다른 융합 만들기</Button>
            </div>
          </div>
        </Card>
        {toast.node}
      </div>
    );
  }

  return (
    <div className="page-stack wizard fusion">
      <PageHeader
        back={<Link className="page-back" to="/app/data"><ArrowLeft size={16} aria-hidden />데이터</Link>}
        title="수식 융합"
        description="여러 Zarr의 변수를 수식으로 계산해 새 Zarr를 만듭니다. 예: (A - B) / (A + B)"
      />
      {prefillError && <Alert tone="warning" role="alert">{prefillError}</Alert>}
      <ol className="wizard-steps" aria-label="진행 단계">
        {STEPS.map((label, index) => (
          <li key={label} className={index === step ? 'is-current' : index < step ? 'is-done' : ''} aria-current={index === step ? 'step' : undefined}>
            <span className="wizard-steps__dot">{index < step ? <Check size={14} aria-hidden /> : index + 1}</span>
            <span className="wizard-steps__label">{label}</span>
          </li>
        ))}
      </ol>

      <Card className="wizard-card">
        <div className="wizard-body">
          <h2 className="wizard-title" ref={headingRef} tabIndex={-1}>{STEPS[step]}</h2>

          {step === 0 && (
            <div className="wizard-section">
              <p className="xc-hint">수식에서 쓸 변수 문자(A, B, C…)마다 데이터와 변수를 고릅니다. 내 데이터와 공유받은 데이터를 모두 쓸 수 있습니다.</p>
              {datasets.error && <Alert tone="danger">데이터 목록을 불러오지 못했습니다. {datasets.error}</Alert>}
              <ul className="fusion-bindings">
                {rows.map((row) => {
                  const dataset = find(row.datasetId);
                  return (
                    <li key={row.letter} className="fusion-binding">
                      <span className="fusion-binding__letter" aria-hidden>{row.letter}</span>
                      <Field label={`${row.letter} 데이터`}>
                        <select className="xc-select" value={row.datasetId} disabled={datasets.loading} onChange={(event) => { const picked = find(event.target.value); setRow(row.letter, { datasetId: event.target.value, variable: picked?.defaultVariable && picked.variables.includes(picked.defaultVariable) ? picked.defaultVariable : picked?.variables[0] ?? '' }); }}>
                          <option value="">{datasets.loading ? '불러오는 중…' : '데이터 선택'}</option>
                          {items.map((item) => <option key={item.id} value={item.id}>{item.name}{isOwned(item) ? '' : ' (공유받음)'}{item.kind === 'FUSION' ? ' · 융합 결과' : ''}</option>)}
                        </select>
                      </Field>
                      <Field label={`${row.letter} 변수`}>
                        <select className="xc-select" value={row.variable} disabled={!dataset} onChange={(event) => setRow(row.letter, { variable: event.target.value })}>
                          <option value="">변수 선택</option>
                          {(dataset?.variables ?? []).map((variable) => <option key={variable} value={variable}>{variable}</option>)}
                        </select>
                      </Field>
                      <Field label={`${row.letter} 정규화`}>
                        <select className="xc-select" value={row.norm} onChange={(event) => setRow(row.letter, { norm: event.target.value as NormMode })}>
                          <option value="auto">자동 (위성별 계수)</option>
                          <option value="none">적용 안 함</option>
                          <option value="custom">계수 직접 입력</option>
                        </select>
                      </Field>
                      <Button variant="ghost" size="sm" className="fusion-binding__remove" disabled={rows.length <= 1} onClick={() => setRows((current) => current.filter((item) => item.letter !== row.letter))} aria-label={`${row.letter} 입력 삭제`}><Trash2 size={16} aria-hidden /></Button>
                      {row.norm === 'custom' && (
                        <div className="fusion-binding__custom">
                          <TextField label={`${row.letter} 배율 (scale)`} inputMode="decimal" value={row.scale} onChange={(event) => setRow(row.letter, { scale: event.target.value })} />
                          <TextField label={`${row.letter} 보정값 (offset)`} inputMode="decimal" value={row.offset} onChange={(event) => setRow(row.letter, { offset: event.target.value })} />
                          <p className="xc-hint">값 × 배율 + 보정값으로 계산합니다.</p>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div><Button variant="secondary" size="sm" onClick={() => setRows((current) => [...current, emptyRow(nextLetter(current))])} disabled={!nextLetter(rows)}><Plus size={16} aria-hidden />변수 추가</Button></div>
              <p className="xc-hint">정규화 “자동”은 위성·band별 계수로 원본 값을 반사도 등으로 바꿉니다. 이미 정규화된 값이거나 계수가 없는 위성은 서버가 그대로 쓰고 미리보기에서 알려 줍니다.</p>
            </div>
          )}

          {step === 1 && (
            <div className="wizard-section">
              <TextField
                id="fusion-formula"
                label="수식"
                className="fusion-formula"
                value={formula}
                onChange={(event) => setFormula(event.target.value)}
                placeholder="(A - B) / (A + B)"
                autoComplete="off"
                spellCheck={false}
                help={`사용 가능한 변수: ${letters.join(', ')}`}
                aria-invalid={check.status === 'error' ? true : undefined}
                aria-describedby="fusion-formula-help fusion-formula-status"
              />
              <div id="fusion-formula-status" className="fusion-status">
                {check.status === 'error' && check.error && (
                  <div role="alert" className="fusion-error">
                    <FormulaMarker formula={formula} error={check.error} />
                    <p>{check.error.position + 1}번째 글자: {check.error.message}</p>
                  </div>
                )}
                {check.status === 'ok' && <p role="status" className="fusion-ok"><CheckCircle2 size={16} aria-hidden />사용 가능한 수식입니다.</p>}
                {check.status === 'checking' && <p role="status" className="xc-hint">수식을 확인하는 중…</p>}
                {check.status === 'unavailable' && <p role="status" className="xc-hint">수식을 확인할 수 없습니다. 실행 전 확인에서 다시 검사합니다.</p>}
              </div>
              <details className="fusion-help">
                <summary>사용할 수 있는 연산·함수</summary>
                <dl className="meta-list">
                  <dt>연산</dt><dd><code>+ - * / **</code> (거듭제곱), 괄호, 단항 <code>+ -</code>, 숫자</dd>
                  <dt>비교·조건</dt><dd><code>&lt; &lt;= &gt; &gt;= == !=</code> (결과 1 또는 0), <code>&amp;</code> <code>|</code> (조건 결합)</dd>
                  <dt>함수</dt><dd><code>{FUNCTION_HELP}</code></dd>
                  <dt>금지</dt><dd>속성 접근(<code>A.x</code>), 첨자(<code>A[0]</code>), 문자열, 그 밖의 함수</dd>
                </dl>
              </details>
            </div>
          )}

          {step === 2 && (
            <div className="wizard-section">
              <p className="xc-hint">입력 데이터의 해상도·범위·시점이 서로 다를 때 맞추는 방법입니다. 기본값은 대부분의 경우에 안전합니다.</p>
              <div className="form-grid">
                <Field label="격자 기준">
                  <select className="xc-select" value={rules.reference} onChange={(event) => setRules({ ...rules, reference: event.target.value as Rules['reference'] })}>
                    {(Object.keys(GRID_LABEL) as Array<keyof typeof GRID_LABEL>).map((key) => <option key={key} value={key}>{GRID_LABEL[key]}{key === 'coarsest' ? ' (기본)' : ''}</option>)}
                  </select>
                </Field>
                {rules.reference === 'datacube' && (
                  <Field label="기준 데이터">
                    <select className="xc-select" value={rules.gridDatasetId} onChange={(event) => setRules({ ...rules, gridDatasetId: event.target.value })}>
                      <option value="">데이터 선택</option>
                      {usedDatasets.map((id) => <option key={id} value={id}>{find(id)?.name ?? id}</option>)}
                    </select>
                  </Field>
                )}
                <Field label="리샘플링">
                  <select className="xc-select" value={rules.resampling} onChange={(event) => setRules({ ...rules, resampling: event.target.value as Rules['resampling'] })}>
                    {(Object.keys(RESAMPLING_LABEL) as Array<keyof typeof RESAMPLING_LABEL>).map((key) => <option key={key} value={key}>{RESAMPLING_LABEL[key]}{key === 'average' ? ' (기본)' : ''}</option>)}
                  </select>
                </Field>
              </div>
              <fieldset className="bounds-fieldset">
                <legend className="xc-label">범위</legend>
                <div className="segmented" role="group" aria-label="범위">
                  {(Object.keys(EXTENT_LABEL) as Array<keyof typeof EXTENT_LABEL>).map((key) => (
                    <button key={key} type="button" aria-pressed={rules.extent === key} onClick={() => setRules({ ...rules, extent: key })}>{EXTENT_LABEL[key]}{key === 'intersection' ? ' (기본)' : ''}</button>
                  ))}
                </div>
                <p className="xc-hint">교집합은 모든 입력이 겹치는 곳만, 합집합은 전체 범위를 만들고 비는 곳은 값 없음(nodata)이 됩니다.</p>
              </fieldset>
              <div className="form-grid">
                <Field label="시간 매칭">
                  <select className="xc-select" value={rules.timeMode} onChange={(event) => setRules({ ...rules, timeMode: event.target.value as Rules['timeMode'] })}>
                    {(Object.keys(TIME_LABEL) as Array<keyof typeof TIME_LABEL>).map((key) => <option key={key} value={key}>{TIME_LABEL[key]}{key === 'exact' ? ' (기본)' : ''}</option>)}
                  </select>
                </Field>
                {rules.timeMode === 'nearest' && (
                  <TextField label="허용 오차 (일)" inputMode="numeric" value={rules.tolerance} onChange={(event) => setRules({ ...rules, tolerance: event.target.value })} help="정수 일수 안에서 가장 가까운 시점을 짝지어 줍니다." />
                )}
                {rules.timeMode === 'aggregate' && (
                  <>
                    <Field label="집계 단위">
                      <select className="xc-select" value={rules.period} onChange={(event) => setRules({ ...rules, period: event.target.value as Rules['period'] })}>
                        {(Object.keys(PERIOD_LABEL) as Array<keyof typeof PERIOD_LABEL>).map((key) => <option key={key} value={key}>{PERIOD_LABEL[key]}</option>)}
                      </select>
                    </Field>
                    <Field label="집계 방법">
                      <select className="xc-select" value={rules.agg} onChange={(event) => setRules({ ...rules, agg: event.target.value as Rules['agg'] })}>
                        {(Object.keys(AGG_LABEL) as Array<keyof typeof AGG_LABEL>).map((key) => <option key={key} value={key}>{AGG_LABEL[key]}</option>)}
                      </select>
                    </Field>
                  </>
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="wizard-section">
              <div className="form-grid">
                <TextField label="결과 이름" value={name} onChange={(event) => { setName(event.target.value); setNameTouched(true); }} />
                <TextField label="결과 변수 이름" value={outputVariable} onChange={(event) => setOutputVariable(event.target.value)} help="영문·숫자·밑줄" />
                <Field label="연결할 프로젝트 (선택)">
                  <select className="xc-select" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                    <option value="">프로젝트 없음</option>
                    {editableProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                </Field>
              </div>
              {nameProblem && <p role="alert" className="fusion-error"><span>{nameProblem}</span></p>}
              <section aria-label="실행 전 확인" className="fusion-preview">
                <div className="fusion-preview__head">
                  <h3 className="xc-card__title">실행 전 확인</h3>
                  <Button variant="ghost" size="sm" onClick={() => runDryRun(ruleKey)} disabled={preview?.loading}><RefreshCw size={14} aria-hidden />다시 계산</Button>
                </div>
                {(!preview || preview.loading) && !data ? <Skeleton lines={4} label="실행 전 확인 중" /> : preview?.error ? (
                  <Alert tone="danger">실행 전 확인에 실패했습니다. {preview.error}</Alert>
                ) : data ? <PreviewPanel data={data} /> : null}
              </section>
              {submitError && <Alert tone="danger">{submitError}</Alert>}
            </div>
          )}

          {problem && <Alert tone="warning" role="alert">{problem}</Alert>}
        </div>
        <div className="wizard-foot">
          <Button variant="secondary" onClick={back} disabled={step === 0 || submitting}><ArrowLeft size={16} aria-hidden />이전</Button>
          <span className="xc-hint">{step + 1} / {STEPS.length}</span>
          {step < STEPS.length - 1 ? (
            <Button onClick={next}>다음<ArrowRight size={16} aria-hidden /></Button>
          ) : (
            <Button onClick={run} disabled={!canRun}>{submitting ? <><Loader2 size={16} className="spin" aria-hidden />요청 중…</> : '융합 실행'}</Button>
          )}
        </div>
      </Card>
      {step === 3 && !!data && !!blockers.length && <p className="xc-hint" role="status">위 확인 사항을 해결하면 실행할 수 있습니다.</p>}
      {toast.node}
    </div>
  );
}

function PreviewPanel({ data }: { data: DryRun }) {
  const { quota } = data;
  const total = Math.max(quota.limitBytes, 1);
  const usedPercent = Math.min(100, (quota.usedBytes / total) * 100);
  const thisPercent = Math.min(100 - usedPercent, (data.estimatedBytes / total) * 100);
  const [west, south, east, north] = data.grid.bbox;
  const remaining = Math.max(0, quota.limitBytes - quota.usedBytes);
  return (
    <div className="fusion-preview__body">
      {data.blockers.length > 0 && (
        <Alert tone="danger">
          <strong>실행할 수 없습니다</strong>
          <ul className="fusion-list">{data.blockers.map((blocker) => <li key={blockerCode(blocker)}>{blockerText(blocker)}</li>)}</ul>
        </Alert>
      )}
      {data.warnings.length > 0 && (
        <Alert tone="warning">
          <strong>확인해 주세요</strong>
          <ul className="fusion-list">{data.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </Alert>
      )}
      {!data.blockers.length && <Alert tone="success">실행할 수 있습니다.</Alert>}
      <dl className="meta-list" style={{ padding: 0 }}>
        <dt>결과 시점 수</dt><dd className="tabular">{data.timeCount.toLocaleString('ko-KR')}</dd>
        <dt>격자</dt><dd className="tabular">{data.grid.width.toLocaleString('ko-KR')} × {data.grid.height.toLocaleString('ko-KR')} · 해상도 {Number(data.grid.resolution.toPrecision(4))}°</dd>
        <dt>범위</dt><dd className="tabular">경도 {west.toFixed(4)} ~ {east.toFixed(4)}, 위도 {south.toFixed(4)} ~ {north.toFixed(4)}</dd>
        <dt>값 형식</dt><dd>{data.dtype}</dd>
        <dt>예상 용량</dt><dd className="tabular">{formatBytes(data.estimatedBytes)}</dd>
        <dt>남은 quota</dt><dd className="tabular">{formatBytes(remaining)} <span className="xc-hint">(한도 {formatBytes(quota.limitBytes)})</span></dd>
      </dl>
      <div className="fusion-quota" role="img" aria-label={`저장 용량: 사용 ${formatBytes(quota.usedBytes)}, 이 결과 ${formatBytes(data.estimatedBytes)}, 한도 ${formatBytes(quota.limitBytes)}`}>
        <i className="is-used" style={{ width: `${usedPercent}%` }} />
        <i className={quota.allowed ? 'is-new' : 'is-over'} style={{ width: `${thisPercent}%` }} />
      </div>
      <p className="xc-hint">진한 부분은 지금 사용 중인 용량, 색이 있는 부분은 이 결과가 더할 용량입니다.</p>
      {data.normalization.length > 0 && (
        <div className="xc-table-wrap">
          <table className="xc-table">
            <caption className="fusion-caption">정규화</caption>
            <thead><tr><th scope="col">변수</th><th scope="col">위성·제품</th><th scope="col">band</th><th scope="col">정규화식</th><th scope="col">적용</th></tr></thead>
            <tbody>
              {data.normalization.map((row) => (
                <tr key={row.binding}>
                  <td><strong>{row.binding}</strong></td>
                  <td>{row.sensor ?? '—'}</td>
                  <td>{row.band ?? '—'}</td>
                  <td className="tabular">{row.expression ?? '정규화식이 없습니다'}</td>
                  <td>{row.applied ? <Badge tone="success">적용</Badge> : <Badge>적용 안 함</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

