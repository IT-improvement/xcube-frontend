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
import { formatNumber, serverItems, serverText, useLanguage } from '../../i18n';
import type { Lang, TFunction, TKey } from '../../i18n';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
// The management screens' text (UR-53 stage 2) loads with these pages, not with the main bundle.
import '../../i18n/app';

const STEPS: TKey[] = ['fusion.steps.inputs', 'fusion.steps.formula', 'fusion.steps.rules', 'fusion.steps.run'];
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

const FORMULA_ERROR_CODES = ['EMPTY_FORMULA', 'STRING_NOT_ALLOWED', 'ATTRIBUTE_NOT_ALLOWED', 'SUBSCRIPT_NOT_ALLOWED', 'KEYWORD_ARG_NOT_ALLOWED', 'UNEXPECTED_CHAR', 'NAME_FORBIDDEN', 'FUNCTION_NOT_ALLOWED', 'ARITY', 'UNKNOWN_NAME', 'SYNTAX'];
/**
 * A formula error in words. Korean shows the server sentence as before; other languages word a known code
 * themselves ({token} is the marked part of the formula) and fall back to the server sentence (UR-53 stage 5:
 * a Korean one only in Korean; otherwise the server code dictionary or a line with the code).
 */
export function formulaErrorText(formula: string, error: FormulaError, lang: Lang, t: TFunction) {
  if (lang === 'ko') return error.message;
  if (!FORMULA_ERROR_CODES.includes(error.code)) return serverText({ code: error.code, message: error.message }, lang);
  const start = Math.min(error.position, formula.length);
  const token = formula.slice(start, start + Math.max(1, error.length)).trim();
  return t(`fusion.formulaErrors.${error.code}` as TKey, { token });
}

/** S12 수식 융합: inputs → formula → rules → dry-run preview and run (FR-FUS-01~11). */
export default function FusionPage() {
  const { lang, t } = useLanguage();
  useDocumentTitle(t('titles.fusion'));
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
      .then((job) => { const loaded = asFusionRequest(job.input); if (!cancelled && loaded) apply(loaded); else if (!cancelled) setPrefillError(t('fusion.prefillMissing')); })
      .catch((cause) => { if (!cancelled) setPrefillError(t('fusion.prefillFailed', { error: userMessage(cause, lang) })); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromJob, state]);

  // Default result name: {first dataset}_융합_{date} (en: _bandmath_), until the user types their own.
  const firstName = find(rows[0]?.datasetId)?.name;
  useEffect(() => { if (!nameTouched) setName(defaultName(firstName, new Date(), lang)); }, [firstName, nameTouched, lang]);

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

  const request = buildRequest({ name: name || defaultName(firstName, new Date(), lang), formula, rows, rules, outputVariable, projectId });
  // The dry-run depends on everything except name, result variable and project.
  const ruleKey = JSON.stringify({ ...request, name: '', outputVariable: '', projectId: null });
  const requestRef = useRef(request);
  requestRef.current = request;
  const runDryRun = (key: string) => {
    setPreview({ key, loading: true });
    fusion.dryRun(requestRef.current)
      .then((data) => setPreview((current) => (current?.key === key ? { key, loading: false, data } : current)))
      .catch((cause) => setPreview((current) => (current?.key === key ? { key, loading: false, error: userMessage(cause, lang) } : current)));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (step === 3 && !started) runDryRun(ruleKey); }, [step, ruleKey, started]);

  const stepProblem = (index: number): string => {
    if (index === 0) {
      if (rows.some((row) => !row.datasetId || !row.variable)) return t('fusion.problems.pickAll');
      const bad = rows.find((row) => row.norm === 'custom' && (!Number.isFinite(Number(row.scale)) || row.scale.trim() === '' || !Number.isFinite(Number(row.offset)) || row.offset.trim() === ''));
      if (bad) return t('fusion.problems.badCoefficient', { letter: bad.letter });
    }
    if (index === 1) {
      if (!formula.trim()) return t('fusion.problems.formulaRequired');
      if (check.status === 'checking' || check.status === 'idle') return t('fusion.problems.checking');
      if (check.status === 'error') return t('fusion.problems.fixFormula');
    }
    if (index === 2) {
      if (rules.reference === 'datacube' && !letters.some((letter) => rows.find((row) => row.letter === letter)?.datasetId === rules.gridDatasetId)) return t('fusion.problems.gridData');
      if (rules.timeMode === 'nearest' && !(Number.isInteger(Number(rules.tolerance)) && Number(rules.tolerance) >= 0 && rules.tolerance.trim() !== '')) return t('fusion.problems.tolerance');
    }
    return '';
  };
  const next = () => { if (stepProblem(step)) { setShowErrors(true); return; } setShowErrors(false); setStep(step + 1); };
  const back = () => { setShowErrors(false); setStep(step - 1); };

  const setRow = (letter: string, patch: Partial<BindingRow>) => setRows((current) => current.map((row) => (row.letter === letter ? { ...row, ...patch } : row)));

  const data = preview?.key === ruleKey ? preview.data : undefined;
  const blockers = data?.blockers ?? [];
  const nameProblem = !name.trim() ? t('fusion.problems.nameRequired') : !outputVariable.trim() ? t('fusion.problems.variableRequired') : /^[A-Za-z_][A-Za-z0-9_]*$/.test(outputVariable.trim()) ? '' : t('fusion.problems.variableRule');
  const canRun = !!data && !blockers.length && !nameProblem && !submitting && !preview?.loading;
  const run = async () => {
    if (!canRun) return;
    setSubmitting(true); setSubmitError('');
    try {
      const job = await fusion.createJob(request);
      setStarted({ id: job.id, name: request.name });
      toast.show(t('fusion.started'));
    } catch (cause) {
      setSubmitError(userMessage(cause, lang));
    } finally { setSubmitting(false); }
  };

  const editableProjects = (projects.data ?? []).filter(canEditProject);
  const problem = showErrors ? stepProblem(step) : '';
  const usedDatasets = Array.from(new Set(rows.map((row) => row.datasetId).filter(Boolean)));

  if (started) {
    return (
      <div className="page-stack wizard">
        <PageHeader title={t('titles.fusion')} />
        <Card>
          <div className="wizard-result">
            <span className="wizard-result__icon" aria-hidden><CheckCircle2 size={28} /></span>
            <h2 className="wizard-title">{t('fusion.startedTitle')}</h2>
            <p role="status">{t('fusion.startedText', { name: started.name })}</p>
            <div className="wizard-result__actions">
              <ButtonLink to="/app/jobs">{t('app.inJobCenter')}</ButtonLink>
              <ButtonLink to="/app/data" variant="secondary">{t('fusion.dataList')}</ButtonLink>
              <Button variant="ghost" onClick={() => { setStarted(null); setStep(0); setPreview(null); }}>{t('fusion.another')}</Button>
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
        back={<Link className="page-back" to="/app/data"><ArrowLeft size={16} aria-hidden />{t('titles.data')}</Link>}
        title={t('titles.fusion')}
        description={t('fusion.description')}
      />
      {prefillError && <Alert tone="warning" role="alert">{prefillError}</Alert>}
      <ol className="wizard-steps" aria-label={t('fusion.steps.label')}>
        {STEPS.map((key, index) => (
          <li key={key} className={index === step ? 'is-current' : index < step ? 'is-done' : ''} aria-current={index === step ? 'step' : undefined}>
            <span className="wizard-steps__dot">{index < step ? <Check size={14} aria-hidden /> : index + 1}</span>
            <span className="wizard-steps__label">{t(key)}</span>
          </li>
        ))}
      </ol>

      <Card className="wizard-card">
        <div className="wizard-body">
          <h2 className="wizard-title" ref={headingRef} tabIndex={-1}>{t(STEPS[step])}</h2>

          {step === 0 && (
            <div className="wizard-section">
              <p className="xc-hint">{t('fusion.inputsHint')}</p>
              {datasets.error && <Alert tone="danger">{t('app.dataListFailed', { error: datasets.error })}</Alert>}
              <ul className="fusion-bindings">
                {rows.map((row) => {
                  const dataset = find(row.datasetId);
                  return (
                    <li key={row.letter} className="fusion-binding">
                      <span className="fusion-binding__letter" aria-hidden>{row.letter}</span>
                      <Field label={t('fusion.letterData', { letter: row.letter })}>
                        <select className="xc-select" value={row.datasetId} disabled={datasets.loading} onChange={(event) => { const picked = find(event.target.value); setRow(row.letter, { datasetId: event.target.value, variable: picked?.defaultVariable && picked.variables.includes(picked.defaultVariable) ? picked.defaultVariable : picked?.variables[0] ?? '' }); }}>
                          <option value="">{datasets.loading ? t('fusion.loadingOption') : t('fusion.pickData')}</option>
                          {items.map((item) => <option key={item.id} value={item.id}>{item.name}{isOwned(item) ? '' : ` (${t('app.shared')})`}{item.kind === 'FUSION' ? ` · ${t('kinds.fusion')}` : ''}</option>)}
                        </select>
                      </Field>
                      <Field label={t('fusion.letterVariable', { letter: row.letter })}>
                        <select className="xc-select" value={row.variable} disabled={!dataset} onChange={(event) => setRow(row.letter, { variable: event.target.value })}>
                          <option value="">{t('fusion.pickVariable')}</option>
                          {(dataset?.variables ?? []).map((variable) => <option key={variable} value={variable}>{variable}</option>)}
                        </select>
                      </Field>
                      <Field label={t('fusion.letterNorm', { letter: row.letter })}>
                        <select className="xc-select" value={row.norm} onChange={(event) => setRow(row.letter, { norm: event.target.value as NormMode })}>
                          <option value="auto">{t('fusion.normAuto')}</option>
                          <option value="none">{t('fusion.normNone')}</option>
                          <option value="custom">{t('fusion.normCustom')}</option>
                        </select>
                      </Field>
                      <Button variant="ghost" size="sm" className="fusion-binding__remove" disabled={rows.length <= 1} onClick={() => setRows((current) => current.filter((item) => item.letter !== row.letter))} aria-label={t('fusion.removeLetter', { letter: row.letter })}><Trash2 size={16} aria-hidden /></Button>
                      {row.norm === 'custom' && (
                        <div className="fusion-binding__custom">
                          <TextField label={t('fusion.scale', { letter: row.letter })} inputMode="decimal" value={row.scale} onChange={(event) => setRow(row.letter, { scale: event.target.value })} />
                          <TextField label={t('fusion.offset', { letter: row.letter })} inputMode="decimal" value={row.offset} onChange={(event) => setRow(row.letter, { offset: event.target.value })} />
                          <p className="xc-hint">{t('fusion.customHint')}</p>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div><Button variant="secondary" size="sm" onClick={() => setRows((current) => [...current, emptyRow(nextLetter(current))])} disabled={!nextLetter(rows)}><Plus size={16} aria-hidden />{t('fusion.addVariable')}</Button></div>
              <p className="xc-hint">{t('fusion.normHint')}</p>
            </div>
          )}

          {step === 1 && (
            <div className="wizard-section">
              <TextField
                id="fusion-formula"
                label={t('fusion.formula')}
                className="fusion-formula"
                value={formula}
                onChange={(event) => setFormula(event.target.value)}
                placeholder="(A - B) / (A + B)"
                autoComplete="off"
                spellCheck={false}
                help={t('fusion.formulaHelp', { letters: letters.join(', ') })}
                aria-invalid={check.status === 'error' ? true : undefined}
                aria-describedby="fusion-formula-help fusion-formula-status"
              />
              <div id="fusion-formula-status" className="fusion-status">
                {check.status === 'error' && check.error && (
                  <div role="alert" className="fusion-error">
                    <FormulaMarker formula={formula} error={check.error} />
                    <p>{t('fusion.errorAt', { position: check.error.position + 1, message: formulaErrorText(formula, check.error, lang, t) })}</p>
                  </div>
                )}
                {check.status === 'ok' && <p role="status" className="fusion-ok"><CheckCircle2 size={16} aria-hidden />{t('fusion.formulaOk')}</p>}
                {check.status === 'checking' && <p role="status" className="xc-hint">{t('fusion.formulaChecking')}</p>}
                {check.status === 'unavailable' && <p role="status" className="xc-hint">{t('fusion.formulaUnavailable')}</p>}
              </div>
              <details className="fusion-help">
                <summary>{t('fusion.help.summary')}</summary>
                <dl className="meta-list">
                  <dt>{t('fusion.help.operators')}</dt><dd><code>+ - * / **</code> {t('fusion.help.operatorsMid')} <code>+ -</code>, {t('fusion.help.operatorsEnd')}</dd>
                  <dt>{t('fusion.help.compare')}</dt><dd><code>&lt; &lt;= &gt; &gt;= == !=</code> {t('fusion.help.compareResult')}, <code>&amp;</code> <code>|</code> {t('fusion.help.compareCombine')}</dd>
                  <dt>{t('fusion.help.functions')}</dt><dd><code>{t('fusion.functionHelp')}</code></dd>
                  <dt>{t('fusion.help.forbidden')}</dt><dd>{t('fusion.help.attribute')}(<code>A.x</code>), {t('fusion.help.subscript')}(<code>A[0]</code>), {t('fusion.help.forbiddenRest')}</dd>
                </dl>
              </details>
            </div>
          )}

          {step === 2 && (
            <div className="wizard-section">
              <p className="xc-hint">{t('fusion.rulesHint')}</p>
              <div className="form-grid">
                <Field label={t('fusion.gridReference')}>
                  <select className="xc-select" value={rules.reference} onChange={(event) => setRules({ ...rules, reference: event.target.value as Rules['reference'] })}>
                    {(Object.keys(GRID_LABEL) as Array<keyof typeof GRID_LABEL>).map((key) => <option key={key} value={key}>{t(GRID_LABEL[key])}{key === 'coarsest' ? t('fusion.defaultSuffix') : ''}</option>)}
                  </select>
                </Field>
                {rules.reference === 'datacube' && (
                  <Field label={t('fusion.gridData')}>
                    <select className="xc-select" value={rules.gridDatasetId} onChange={(event) => setRules({ ...rules, gridDatasetId: event.target.value })}>
                      <option value="">{t('fusion.pickData')}</option>
                      {usedDatasets.map((id) => <option key={id} value={id}>{find(id)?.name ?? id}</option>)}
                    </select>
                  </Field>
                )}
                <Field label={t('fusion.resampling')}>
                  <select className="xc-select" value={rules.resampling} onChange={(event) => setRules({ ...rules, resampling: event.target.value as Rules['resampling'] })}>
                    {(Object.keys(RESAMPLING_LABEL) as Array<keyof typeof RESAMPLING_LABEL>).map((key) => <option key={key} value={key}>{t(RESAMPLING_LABEL[key])}{key === 'average' ? t('fusion.defaultSuffix') : ''}</option>)}
                  </select>
                </Field>
              </div>
              <fieldset className="bounds-fieldset">
                <legend className="xc-label">{t('fusion.extent')}</legend>
                <div className="segmented" role="group" aria-label={t('fusion.extent')}>
                  {(Object.keys(EXTENT_LABEL) as Array<keyof typeof EXTENT_LABEL>).map((key) => (
                    <button key={key} type="button" aria-pressed={rules.extent === key} onClick={() => setRules({ ...rules, extent: key })}>{t(EXTENT_LABEL[key])}{key === 'intersection' ? t('fusion.defaultSuffix') : ''}</button>
                  ))}
                </div>
                <p className="xc-hint">{t('fusion.extentHint')}</p>
              </fieldset>
              <div className="form-grid">
                <Field label={t('fusion.timeMatching')}>
                  <select className="xc-select" value={rules.timeMode} onChange={(event) => setRules({ ...rules, timeMode: event.target.value as Rules['timeMode'] })}>
                    {(Object.keys(TIME_LABEL) as Array<keyof typeof TIME_LABEL>).map((key) => <option key={key} value={key}>{t(TIME_LABEL[key])}{key === 'exact' ? t('fusion.defaultSuffix') : ''}</option>)}
                  </select>
                </Field>
                {rules.timeMode === 'nearest' && (
                  <TextField label={t('fusion.tolerance')} inputMode="numeric" value={rules.tolerance} onChange={(event) => setRules({ ...rules, tolerance: event.target.value })} help={t('fusion.toleranceHelp')} />
                )}
                {rules.timeMode === 'aggregate' && (
                  <>
                    <Field label={t('fusion.aggPeriod')}>
                      <select className="xc-select" value={rules.period} onChange={(event) => setRules({ ...rules, period: event.target.value as Rules['period'] })}>
                        {(Object.keys(PERIOD_LABEL) as Array<keyof typeof PERIOD_LABEL>).map((key) => <option key={key} value={key}>{t(PERIOD_LABEL[key])}</option>)}
                      </select>
                    </Field>
                    <Field label={t('fusion.aggMethod')}>
                      <select className="xc-select" value={rules.agg} onChange={(event) => setRules({ ...rules, agg: event.target.value as Rules['agg'] })}>
                        {(Object.keys(AGG_LABEL) as Array<keyof typeof AGG_LABEL>).map((key) => <option key={key} value={key}>{t(AGG_LABEL[key])}</option>)}
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
                <TextField label={t('fusion.resultName')} value={name} onChange={(event) => { setName(event.target.value); setNameTouched(true); }} />
                <TextField label={t('fusion.outputVariable')} value={outputVariable} onChange={(event) => setOutputVariable(event.target.value)} help={t('fusion.outputHelp')} />
                <Field label={t('fusion.project')}>
                  <select className="xc-select" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                    <option value="">{t('app.noProject')}</option>
                    {editableProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                </Field>
              </div>
              {nameProblem && <p role="alert" className="fusion-error"><span>{nameProblem}</span></p>}
              <section aria-label={t('fusion.preCheck')} className="fusion-preview">
                <div className="fusion-preview__head">
                  <h3 className="xc-card__title">{t('fusion.preCheck')}</h3>
                  <Button variant="ghost" size="sm" onClick={() => runDryRun(ruleKey)} disabled={preview?.loading}><RefreshCw size={14} aria-hidden />{t('fusion.recalculate')}</Button>
                </div>
                {(!preview || preview.loading) && !data ? <Skeleton lines={4} label={t('fusion.checkingPreview')} /> : preview?.error ? (
                  <Alert tone="danger">{t('fusion.previewFailed', { error: preview.error })}</Alert>
                ) : data ? <PreviewPanel data={data} /> : null}
              </section>
              {submitError && <Alert tone="danger">{submitError}</Alert>}
            </div>
          )}

          {problem && <Alert tone="warning" role="alert">{problem}</Alert>}
        </div>
        <div className="wizard-foot">
          <Button variant="secondary" onClick={back} disabled={step === 0 || submitting}><ArrowLeft size={16} aria-hidden />{t('fusion.prev')}</Button>
          <span className="xc-hint">{step + 1} / {STEPS.length}</span>
          {step < STEPS.length - 1 ? (
            <Button onClick={next}>{t('fusion.next')}<ArrowRight size={16} aria-hidden /></Button>
          ) : (
            <Button onClick={run} disabled={!canRun}>{submitting ? <><Loader2 size={16} className="spin" aria-hidden />{t('fusion.submitting')}</> : t('fusion.run')}</Button>
          )}
        </div>
      </Card>
      {step === 3 && !!data && !!blockers.length && <p className="xc-hint" role="status">{t('fusion.resolveFirst')}</p>}
      {toast.node}
    </div>
  );
}

function PreviewPanel({ data }: { data: DryRun }) {
  const { lang, t } = useLanguage();
  const number = (value: number) => formatNumber(value, {}, lang);
  const { quota } = data;
  const total = Math.max(quota.limitBytes, 1);
  const usedPercent = Math.min(100, (quota.usedBytes / total) * 100);
  const thisPercent = Math.min(100 - usedPercent, (data.estimatedBytes / total) * 100);
  const [west, south, east, north] = data.grid.bbox;
  const remaining = Math.max(0, quota.limitBytes - quota.usedBytes);
  // `warningItems` carry codes and values (UR-53 stage 5); older servers send only the sentences.
  const warnings = serverItems(data.warningItems, data.warnings);
  return (
    <div className="fusion-preview__body">
      {data.blockers.length > 0 && (
        <Alert tone="danger">
          <strong>{t('fusion.preview.cannotRun')}</strong>
          <ul className="fusion-list">{data.blockers.map((blocker) => <li key={blockerCode(blocker)}>{blockerText(blocker, lang)}</li>)}</ul>
        </Alert>
      )}
      {warnings.length > 0 && (
        <Alert tone="warning">
          <strong>{t('fusion.preview.checkThese')}</strong>
          <ul className="fusion-list">{warnings.map((warning, index) => <li key={index}>{serverText(warning, lang)}</li>)}</ul>
        </Alert>
      )}
      {!data.blockers.length && <Alert tone="success">{t('fusion.preview.canRun')}</Alert>}
      <dl className="meta-list" style={{ padding: 0 }}>
        <dt>{t('fusion.preview.timeCount')}</dt><dd className="tabular">{number(data.timeCount)}</dd>
        <dt>{t('fusion.preview.grid')}</dt><dd className="tabular">{t('fusion.preview.gridValue', { width: number(data.grid.width), height: number(data.grid.height), resolution: Number(data.grid.resolution.toPrecision(4)) })}</dd>
        <dt>{t('fusion.extent')}</dt><dd className="tabular">{t('app.extentValue', { west: west.toFixed(4), east: east.toFixed(4), south: south.toFixed(4), north: north.toFixed(4) })}</dd>
        <dt>{t('fusion.preview.dtype')}</dt><dd>{data.dtype}</dd>
        <dt>{t('fusion.preview.size')}</dt><dd className="tabular">{formatBytes(data.estimatedBytes)}</dd>
        <dt>{t('fusion.preview.quotaLeft')}</dt><dd className="tabular">{formatBytes(remaining)} <span className="xc-hint">{t('fusion.preview.quotaLimit', { limit: formatBytes(quota.limitBytes) })}</span></dd>
      </dl>
      <div className="fusion-quota" role="img" aria-label={t('fusion.preview.quotaAria', { used: formatBytes(quota.usedBytes), result: formatBytes(data.estimatedBytes), limit: formatBytes(quota.limitBytes) })}>
        <i className="is-used" style={{ width: `${usedPercent}%` }} />
        <i className={quota.allowed ? 'is-new' : 'is-over'} style={{ width: `${thisPercent}%` }} />
      </div>
      <p className="xc-hint">{t('fusion.preview.quotaHint')}</p>
      {data.normalization.length > 0 && (
        <div className="xc-table-wrap">
          <table className="xc-table">
            <caption className="fusion-caption">{t('fusion.preview.normalization')}</caption>
            <thead><tr><th scope="col">{t('fusion.preview.variable')}</th><th scope="col">{t('fusion.preview.sensor')}</th><th scope="col">{t('fusion.preview.band')}</th><th scope="col">{t('fusion.preview.expression')}</th><th scope="col">{t('fusion.preview.applied')}</th></tr></thead>
            <tbody>
              {data.normalization.map((row) => (
                <tr key={row.binding}>
                  <td><strong>{row.binding}</strong></td>
                  <td>{row.sensor ?? '—'}</td>
                  <td>{row.band ?? '—'}</td>
                  <td className="tabular">{row.expression ?? t('fusion.preview.noExpression')}</td>
                  <td>{row.applied ? <Badge tone="success">{t('fusion.preview.applied')}</Badge> : <Badge>{t('fusion.preview.notApplied')}</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

