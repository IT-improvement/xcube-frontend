import { ArrowRight, ExternalLink, GitCompareArrows, RotateCcw, Square } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { COMPARISON_CLASSES, COMPARISON_TYPES, COMPARISON_ZERO, compareApi } from '../../api/compare';
import { comparisonViewerHref } from '../../api/originComparisons';
import type { CompareCheck, CompareJob, CompareRequest, ComparisonType } from '../../api/compare';
import { isExample } from '../../api/examples';
import { ApiError, userMessage } from '../../api/httpClient';
import { NEEDS, useRoleGate } from '../../auth/roles';
import { Alert, Button, LockedButton, TextField } from '../../components/ui';
import { Badge, Card, EmptyState, PageHeader, Skeleton, StepNum } from '../../components/ui/kit';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { failureText, formatNumber, useLanguage } from '../../i18n';
import type { Lang, TKey } from '../../i18n';
import { appApi, formatDateTime, viewerHref, ZarrDataset } from '../api';
import { askOnceOnJobStart } from '../browserNotify';
import { formatBytes } from '../fusion';
import { isActive, JobStatusBadge } from '../jobs';
import { useLoad } from '../useLoad';
import '../../i18n/app';
import '../../i18n/fx';
import './compare.css';

const POLL_MS = 2000;
/** Reads of a running job's progress that may fail in a row before the error shows (UXF1). */
const POLL_RETRIES = 4;
const POLL_RETRY_MAX_MS = 15000;
const CHECK_DELAY_MS = 400;
const isType = (value: string | null): value is ComparisonType => !!value && (COMPARISON_TYPES as string[]).includes(value);

/** Dates of a dataset as select options: the ISO value the server matches (within a second) and a short label. */
const dateOptions = (dataset?: ZarrDataset) => (dataset?.times ?? []).filter((time) => /^\d{4}-\d{2}-\d{2}/.test(time.iso)).map((time) => ({ value: time.iso, label: time.iso.slice(0, 10) + (time.iso.length > 10 ? ` ${time.iso.slice(11, 16)}` : '') }));
/** Same day (UTC date) — model results of one source carry the source's times. */
const sameDay = (a: string, b: string) => a.slice(0, 10) === b.slice(0, 10);

type Form = { type: ComparisonType; resultId: string; t1: string; t2: string; aId: string; bId: string; time: string; reference: 'water_gt' | 'shapefile'; shapefileId: string; name: string };

/** The request for the chosen type, or null while something is still missing. */
function toRequest(form: Form): CompareRequest | null {
  const name = form.name.trim() || undefined;
  if (form.type === 'TIME_CHANGE') return form.resultId && form.t1 && form.t2 ? { type: 'TIME_CHANGE', resultId: Number(form.resultId) || form.resultId, t1: form.t1, t2: form.t2, name } : null;
  if (form.type === 'MODEL_COMPARE') return form.aId && form.bId && form.time ? { type: 'MODEL_COMPARE', aId: Number(form.aId) || form.aId, bId: Number(form.bId) || form.bId, time: form.time, name } : null;
  if (!form.resultId || !form.time || (form.reference === 'shapefile' && !form.shapefileId)) return null;
  return { type: 'REFERENCE', resultId: Number(form.resultId) || form.resultId, time: form.time, reference: form.reference === 'water_gt' ? 'water_gt' : { shapefileDatasetId: Number(form.shapefileId) || form.shapefileId }, name };
}

/** S9 비교 분석 (UR-63 F3): pick a type, the AI results and dates (checked as you go), run, read the metrics, open the class map in the Viewer. */
export default function ComparePage() {
  const { lang, t } = useLanguage();
  useDocumentTitle(t('compare.title'));
  const [params, setParams] = useSearchParams();
  const datasets = useLoad(() => appApi.listDatasets());
  const results = useMemo(() => (datasets.data ?? []).filter((item) => item.kind === 'AI_RESULT'), [datasets.data]);
  const originals = useMemo(() => (datasets.data ?? []).filter((item) => item.kind !== 'AI_RESULT' && item.kind !== 'COMPARISON' && item.kind !== 'FUSION'), [datasets.data]);
  const nameOf = (id?: string | number | null) => (id == null ? '' : (datasets.data ?? []).find((item) => item.id === String(id))?.name ?? `#${id}`);
  const locked = useRoleGate().reason(NEEDS.createData);
  // CMP2: a comparison is read in its original's Viewer 결과 비교. The job tells its original (null before CMP2); else
  // the original of the compared AI result; else (unknown) the comparison itself opens, as before.
  const originOf = (job: CompareJob) => {
    if (job.originDatacubeId != null) return String(job.originDatacubeId);
    const input = (job.input ?? {}) as Record<string, unknown>;
    const resultId = input.resultId ?? input.aId;
    return resultId == null ? undefined : results.find((item) => item.id === String(resultId))?.sourceDatacubeId;
  };
  const viewerOf = (job: CompareJob) => {
    const registered = job.registration?.datacubeId;
    if (registered == null) return undefined;
    const origin = originOf(job);
    return { href: origin ? comparisonViewerHref(origin, String(registered)) : viewerHref(String(registered)), originName: origin ? nameOf(origin) : undefined };
  };

  // The Viewer hands over ?type=&resultId=&t= (compareHref; older links `result`, `source`); a notification may open ?job=.
  const [form, setForm] = useState<Form>(() => ({
    type: isType(params.get('type')) ? (params.get('type') as ComparisonType) : 'TIME_CHANGE',
    resultId: params.get('resultId') ?? params.get('result') ?? '', aId: params.get('resultId') ?? params.get('result') ?? '', bId: '',
    t1: '', t2: params.get('t') ?? '', time: params.get('t') ?? '',
    reference: 'water_gt', shapefileId: '', name: '',
  }));
  const set = (patch: Partial<Form>) => setForm((current) => ({ ...current, ...patch }));
  // Once the list arrives: a Viewer time is matched to the result's own ISO time, and a source id picks its first result.
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || !datasets.data) return;
    prefilled.current = true;
    const source = params.get('source');
    const wanted = params.get('t');
    const result = results.find((item) => item.id === form.resultId) ?? (source ? results.find((item) => item.sourceDatacubeId === source) : undefined);
    if (!result) return;
    const match = wanted ? result.times.find((time) => time.iso === wanted || sameDay(time.iso, wanted))?.iso : undefined;
    const first = result.times[0]?.iso ?? '';
    const last = result.times.at(-1)?.iso ?? '';
    setForm((current) => ({ ...current, resultId: result.id, aId: result.id, t1: first !== (match ?? last) ? first : '', t2: match ?? last, time: match ?? last }));
  }, [datasets.data, results, params, form.resultId]);

  const result = results.find((item) => item.id === form.resultId);
  const a = results.find((item) => item.id === form.aId);
  const partners = results.filter((item) => a && item.id !== a.id && item.sourceDatacubeId && item.sourceDatacubeId === a.sourceDatacubeId);
  const b = partners.find((item) => item.id === form.bId);
  const modelTimes = a ? dateOptions(a).filter((option) => !b || b.times.some((time) => sameDay(time.iso, option.value))) : [];

  // Live check (POST /compare/check) whenever the request is complete; stale answers are dropped.
  const request = toRequest(form);
  // The name Data Analysis gives when the field is left empty (CompareService defaultName), shown as the hint.
  const day = (value: string) => value.slice(0, 10);
  const autoName = !request
    ? ''
    : form.type === 'TIME_CHANGE'
      ? `${nameOf(form.resultId)} 시점 변화 ${day(form.t1)}→${day(form.t2)}`
      : form.type === 'MODEL_COMPARE'
        ? `${nameOf(form.aId)} ↔ ${nameOf(form.bId)} ${day(form.time)}`
        : `${nameOf(form.resultId)} 참조(${form.reference === 'water_gt' ? 'water_gt' : nameOf(form.shapefileId)}) 비교 ${day(form.time)}`;
  const requestKey = request ? JSON.stringify({ ...request, name: undefined }) : '';
  const [check, setCheck] = useState<{ key: string; data?: CompareCheck; error?: unknown } | null>(null);
  useEffect(() => {
    if (!requestKey || locked) { setCheck(null); return undefined; }
    let alive = true;
    setCheck({ key: requestKey });
    const timer = window.setTimeout(() => {
      compareApi.check(JSON.parse(requestKey)).then((data) => { if (alive) setCheck({ key: requestKey, data }); }, (error) => { if (alive) setCheck({ key: requestKey, error }); });
    }, CHECK_DELAY_MS);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [requestKey, locked]);
  const checked = check?.key === requestKey && !!check.data && !check.error;
  const quotaBlocked = checked && check?.data?.quota?.allowed === false;

  // The job being shown (just started, or picked from the list / ?job=), polled until it ends.
  const [jobId, setJobId] = useState<string | null>(params.get('job'));
  const [job, setJob] = useState<CompareJob | null>(null);
  const [jobError, setJobError] = useState('');
  const [retrying, setRetrying] = useState(0);
  const [reloadTick, setReloadTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [runError, setRunError] = useState('');
  const history = useLoad(() => compareApi.listJobs());
  useEffect(() => {
    if (!jobId) { setJob(null); return undefined; }
    // FIX4: another job drops the one shown before (and its error), so a failed load never shows the old metrics.
    setJob((current) => (current && String(current.id) === jobId ? current : null));
    setJobError('');
    setRetrying(0);
    let alive = true;
    let timer: number | undefined;
    let failures = 0;
    // UXF1 (FIX4 §4.5): a failed read is tried again (2 s, 4 s, 8 s … up to 15 s) before the error shows,
    // and the error comes with `다시 불러오기`.
    const poll = () => compareApi.get(jobId).then((next) => {
      if (!alive) return;
      failures = 0;
      setRetrying(0);
      setJob(next);
      setJobError('');
      if (isActive(next)) timer = window.setTimeout(poll, POLL_MS);
      else history.refresh();
    }, (error) => {
      if (!alive) return;
      failures += 1;
      // A refusal (no such job, no right to it) will not change on a retry; a lost connection or a busy server may.
      const lasting = error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429;
      if (!lasting && failures <= POLL_RETRIES) {
        setRetrying(failures);
        timer = window.setTimeout(poll, Math.min(POLL_MS * 2 ** (failures - 1), POLL_RETRY_MAX_MS));
      } else {
        setRetrying(0);
        setJobError(userMessage(error, lang));
      }
    });
    void poll();
    return () => { alive = false; window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, reloadTick]);
  const show = (id: string) => {
    setJobId(id);
    setParams((current) => { const next = new URLSearchParams(current); next.set('job', id); return next; }, { replace: true });
    // Smooth unless the user asked for less motion; jsdom has no scrollIntoView.
    const calm = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(() => document.getElementById('compare-result')?.scrollIntoView?.({ block: 'start', behavior: calm ? 'auto' : 'smooth' }), 50);
  };

  const run = async (event: FormEvent) => {
    event.preventDefault();
    if (!request || locked) return;
    setBusy(true);
    setRunError('');
    askOnceOnJobStart();
    try {
      const created = await compareApi.create(request);
      setJob(created);
      show(String(created.id));
      history.refresh();
    } catch (cause) { setRunError(userMessage(cause, lang)); } finally { setBusy(false); }
  };
  const cancel = async () => {
    if (!job) return;
    try { await compareApi.cancel(job.id); setJob({ ...job, status: 'CANCELLED' }); history.refresh(); } catch (cause) { setJobError(userMessage(cause, lang)); }
  };

  const pickType = (type: ComparisonType) => set({ type });
  const resultSelect = (id: string, label: TKey, value: string, onChange: (id: string) => void, options = results) => (
    <div className="xc-field">
      <label className="xc-field__label" htmlFor={id}>{t(label)}</label>
      <select id={id} className="xc-select" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{t('compare.form.pick')}</option>
        {options.map((item) => <option key={item.id} value={item.id}>{item.name}{isExample(item) ? ` · ${t('examples.tag')}` : ''}{item.sourceDatacubeId ? ` · ${t('compare.form.sourceOf', { name: nameOf(item.sourceDatacubeId) })}` : ''}</option>)}
      </select>
    </div>
  );
  const dateSelect = (id: string, label: TKey, value: string, onChange: (value: string) => void, options: Array<{ value: string; label: string }>) => (
    <div className="xc-field">
      <label className="xc-field__label" htmlFor={id}>{t(label)}</label>
      <select id={id} className="xc-select tabular" value={value} onChange={(event) => onChange(event.target.value)} disabled={!options.length}>
        <option value="">{t('compare.form.pickDate')}</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  );

  return (
    <div className="page-stack compare-page">
      <PageHeader title={t('compare.title')} description={t('compare.description')} />
      <Card>
        <form className="compare-form" onSubmit={run} noValidate>
          <fieldset className="compare-step">
            <legend className="compare-step__title"><StepNum n={1} state="current" />{t('compare.step.type')}</legend>
            <div className="compare-types" role="radiogroup" aria-label={t('compare.step.type')}>
              {COMPARISON_TYPES.map((type) => (
                <label key={type} className={`compare-type${form.type === type ? ' is-checked' : ''}`}>
                  <input type="radio" name="compare-type" value={type} checked={form.type === type} onChange={() => pickType(type)} />
                  <span className="compare-type__name">{t(`compare.types.${type}.name` as TKey)}</span>
                  <span className="compare-type__text">{t(`compare.types.${type}.text` as TKey)}</span>
                  <ClassKey type={type} />
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="compare-step">
            <legend className="compare-step__title"><StepNum n={2} state="current" />{t('compare.step.inputs')}</legend>
            {datasets.loading && !datasets.data ? <Skeleton lines={3} label={t('compare.form.loading')} />
              : datasets.error ? <Alert tone="danger">{datasets.error} <Button variant="line" size="sm" onClick={datasets.reload}>{t('common.retry')}</Button></Alert>
                : !results.length ? (
                  <div className="compare-none">
                    <p>{t('compare.form.noResults')}</p>
                    <a className="xc-btn xc-btn--line xc-btn--sm" href={viewerHref()} target="_blank" rel="noopener noreferrer">{t('compare.form.toViewer')}<ExternalLink size={13} aria-hidden /></a>
                  </div>
                ) : (
                  <div className="compare-grid">
                    {form.type === 'TIME_CHANGE' && <>
                      {resultSelect('compare-result', 'compare.form.result', form.resultId, (id) => set({ resultId: id, t1: '', t2: '' }))}
                      <div className="compare-pair">
                        {dateSelect('compare-t1', 'compare.form.t1', form.t1, (value) => set({ t1: value }), dateOptions(result))}
                        <ArrowRight size={16} aria-hidden className="compare-pair__arrow" />
                        {dateSelect('compare-t2', 'compare.form.t2', form.t2, (value) => set({ t2: value }), dateOptions(result).filter((option) => option.value !== form.t1))}
                      </div>
                      {result && result.times.length < 2 && <p className="xc-hint">{t('compare.form.oneTime')}</p>}
                    </>}
                    {form.type === 'MODEL_COMPARE' && <>
                      {resultSelect('compare-a', 'compare.form.a', form.aId, (id) => set({ aId: id, bId: '', time: '' }))}
                      {resultSelect('compare-b', 'compare.form.b', form.bId, (id) => set({ bId: id }), partners)}
                      {a && !partners.length && <p className="xc-hint compare-grid__wide">{t('compare.form.noPartner')}</p>}
                      {dateSelect('compare-time', 'compare.form.time', form.time, (value) => set({ time: value }), modelTimes)}
                    </>}
                    {form.type === 'REFERENCE' && <>
                      {resultSelect('compare-result', 'compare.form.result', form.resultId, (id) => set({ resultId: id, time: '' }))}
                      {dateSelect('compare-time', 'compare.form.time', form.time, (value) => set({ time: value }), dateOptions(result))}
                      <div className="compare-grid__wide compare-reference" role="radiogroup" aria-label={t('compare.form.reference')}>
                        <span className="xc-field__label">{t('compare.form.reference')}</span>
                        <label className="xc-check"><input type="radio" name="compare-ref" checked={form.reference === 'water_gt'} onChange={() => set({ reference: 'water_gt' })} />{t('compare.form.waterGt')}</label>
                        <label className="xc-check"><input type="radio" name="compare-ref" checked={form.reference === 'shapefile'} onChange={() => set({ reference: 'shapefile' })} />{t('compare.form.shapefile')}</label>
                        {form.reference === 'shapefile' && (
                          <select className="xc-select" aria-label={t('compare.form.shapefile')} value={form.shapefileId} onChange={(event) => set({ shapefileId: event.target.value })}>
                            <option value="">{t('compare.form.pick')}</option>
                            {originals.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                          </select>
                        )}
                        <p className="xc-hint">{t(form.reference === 'water_gt' ? 'compare.form.waterGtHelp' : 'compare.form.shapefileHelp')}</p>
                      </div>
                    </>}
                    <div className="compare-grid__wide">
                      <TextField label={t('compare.form.name')} help={autoName ? t('compare.form.nameHelpAuto', { name: autoName }) : t('compare.form.nameHelp')} value={form.name} maxLength={150} onChange={(event) => set({ name: event.target.value })} autoComplete="off" />
                    </div>
                  </div>
                )}
          </fieldset>

          <fieldset className="compare-step">
            <legend className="compare-step__title"><StepNum n={3} state="current" />{t('compare.step.run')}</legend>
            <CheckLine request={request} check={check?.key === requestKey ? check : null} lang={lang} locked={!!locked} />
            {runError && <Alert tone="danger">{runError}</Alert>}
            <div className="compare-run">
              {locked
                ? <LockedButton showReason reason={locked}><GitCompareArrows size={16} aria-hidden />{t('compare.run')}</LockedButton>
                : <Button type="submit" disabled={busy || !request || !checked || quotaBlocked}><GitCompareArrows size={16} aria-hidden />{busy ? t('compare.running') : t('compare.run')}</Button>}
              <span className="xc-hint">{t('compare.runHint')}</span>
            </div>
          </fieldset>
        </form>
      </Card>

      {(job || jobError) && (
        <section id="compare-result" className="compare-result" aria-labelledby="compare-result-title" aria-live="polite">
          <Card>
            {jobError && (
              <div className="inline-error compare-reload">
                <Alert tone="danger">{t('compare.result.loadFailed', { error: jobError })}</Alert>
                <Button variant="line" size="sm" onClick={() => setReloadTick((value) => value + 1)}><RotateCcw size={14} aria-hidden />{t('compare.result.reload')}</Button>
              </div>
            )}
            {retrying > 0 && !jobError && <p className="xc-hint compare-retry" role="status">{t('compare.result.retrying', { count: retrying, max: POLL_RETRIES })}</p>}
            {job ? <JobResult job={job} nameOf={nameOf} viewer={viewerOf(job)} onCancel={cancel} /> : null}
          </Card>
        </section>
      )}

      <Card title={t('compare.history.title')} className="compare-history-card">
          {history.loading && !history.data ? <Skeleton lines={3} label={t('compare.history.loading')} />
            : history.error ? <div className="inline-error"><Alert tone="danger">{history.error}</Alert><Button variant="line" size="sm" onClick={history.reload}>{t('common.retry')}</Button></div>
              : !history.data?.length ? <EmptyState title={t('compare.history.empty')} text={t('compare.history.emptyText')} />
                : (
                  <div className="xc-table-wrap">
                    <table className="xc-table xc-table--cards compare-history">
                      <thead><tr><th scope="col">{t('app.name')}</th><th scope="col">{t('compare.history.type')}</th><th scope="col">{t('app.status')}</th><th scope="col" className="hide-sm">{t('compare.history.key')}</th><th scope="col" className="hide-sm">{t('app.requested')}</th><th scope="col"><span className="sr-only">{t('app.actions')}</span></th></tr></thead>
                      <tbody>
                        {history.data.map((item) => {
                          const type = typeOf(item);
                          return (
                            <tr key={item.id} className={String(item.id) === jobId ? 'is-current' : undefined}>
                              <td className="cell-main"><span className="xc-cell-main"><strong>{item.name || t('app.noName')}</strong>{item.status === 'FAILED' && <small className="job-error">{failureText(item, lang)}</small>}</span></td>
                              <td data-label={t('compare.history.type')}>{type ? t(`compare.types.${type}.name` as TKey) : '—'}</td>
                              <td><JobStatusBadge job={item} /></td>
                              <td className="hide-sm tabular">{type && item.metrics ? keyMetric(type, item.metrics as Metrics, lang, t) : '—'}</td>
                              <td className="hide-sm date">{formatDateTime(item.createdAt, lang)}</td>
                              <td className="cell-actions">
                                <div className="row-actions">
                                  <Button size="sm" variant="quiet" onClick={() => show(String(item.id))} aria-label={t('compare.history.showNamed', { name: item.name })}>{t('compare.history.show')}</Button>
                                  {item.registration?.datacubeId != null && item.status === 'SUCCEEDED' && (
                                    <a className="xc-btn xc-btn--ghost xc-btn--sm" href={viewerOf(item)!.href} target="_blank" rel="noopener noreferrer" aria-label={t('jobs.compare.viewNamed', { name: item.name })}>Viewer<ExternalLink size={13} aria-hidden /></a>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
      </Card>
    </div>
  );
}

type Metrics = Record<string, any>;
const typeOf = (job: CompareJob): ComparisonType | null => {
  const value = String(job.compareType ?? (job.input as Record<string, unknown> | undefined)?.type ?? (job.comparison as Metrics | undefined)?.type ?? '');
  return isType(value) ? value : null;
};

/** Colour key of a type: swatch + name for each class (never colour alone), "transparent" for class 0. */
function ClassKey({ type, areas }: { type: ComparisonType; areas?: Record<string, number | null | undefined> }) {
  const { lang, t } = useLanguage();
  return (
    <span className="class-key">
      {COMPARISON_CLASSES[type].map((item) => (
        <span key={item.code} className="class-key__item">
          <span className="class-key__swatch" style={{ background: item.color }} aria-hidden />
          {t(`compare.classes.${item.key}` as TKey)}
          {areas && typeof areas[item.key] === 'number' && <span className="tabular class-key__area">{km2(areas[item.key] as number, lang)}</span>}
        </span>
      ))}
      <span className="class-key__item class-key__item--zero">{t('compare.transparent', { name: t(`compare.classes.${COMPARISON_ZERO[type]}` as TKey) })}</span>
    </span>
  );
}

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const km2 = (value: number, lang: Lang) => `${formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 }, lang)} km²`;
const ratio = (value: unknown, lang: Lang) => (num(value) == null ? '—' : formatNumber(num(value)!, { minimumFractionDigits: 3, maximumFractionDigits: 3 }, lang));
const percent = (value: unknown, lang: Lang) => (num(value) == null ? '—' : `${num(value)! > 0 ? '+' : ''}${formatNumber(num(value)!, { minimumFractionDigits: 1, maximumFractionDigits: 1 }, lang)}%`);
const area = (value: unknown, lang: Lang) => (num(value) == null ? '—' : km2(num(value)!, lang));
const count = (value: unknown, lang: Lang) => (num(value) == null ? '—' : formatNumber(num(value)!, {}, lang));

/** One number that tells a comparison apart in the list. */
function keyMetric(type: ComparisonType, metrics: Metrics, lang: Lang, t: (key: TKey) => string) {
  if (type === 'TIME_CHANGE') return `${t('compare.metric.changePercent')} ${percent(metrics.changePercent ?? (num(metrics.changeRatio) != null ? metrics.changeRatio * 100 : null), lang)}`;
  if (type === 'MODEL_COMPARE') return `IoU ${ratio(metrics.iou, lang)}`;
  return `F1 ${ratio(metrics.f1, lang)} · IoU ${ratio(metrics.iou, lang)}`;
}

/** Rows of the metrics table, by type (FX-D worker keys). */
function metricRows(type: ComparisonType, m: Metrics, lang: Lang, t: (key: TKey) => string): Array<[string, string, boolean?]> {
  if (type === 'TIME_CHANGE') return [
    [t('compare.metric.changePercent'), percent(m.changePercent ?? (num(m.changeRatio) != null ? m.changeRatio * 100 : null), lang), true],
    [t('compare.metric.netChange'), num(m.netChangeKm2) == null ? '—' : `${m.netChangeKm2 > 0 ? '+' : ''}${km2(m.netChangeKm2, lang)}`],
    [t('compare.metric.waterT1'), area(m.waterAreaKm2?.t1, lang)],
    [t('compare.metric.waterT2'), area(m.waterAreaKm2?.t2, lang)],
    [t('compare.classes.kept'), area(m.areaKm2?.kept, lang)],
    [t('compare.classes.gained'), area(m.areaKm2?.gained, lang)],
    [t('compare.classes.lost'), area(m.areaKm2?.lost, lang)],
  ];
  if (type === 'MODEL_COMPARE') return [
    ['IoU', ratio(m.iou, lang), true],
    [t('compare.metric.dice'), ratio(m.dice, lang)],
    [t('compare.metric.agreement'), ratio(m.agreement, lang)],
    ['Kappa', ratio(m.kappa, lang)],
    [t('compare.metric.areaA'), area(m.areaKm2?.a, lang)],
    [t('compare.metric.areaB'), area(m.areaKm2?.b, lang)],
    [t('compare.metric.areaDiff'), num(m.areaDiffKm2) == null ? '—' : `${m.areaDiffKm2 > 0 ? '+' : ''}${km2(m.areaDiffKm2, lang)}`],
  ];
  return [
    ['F1', ratio(m.f1, lang), true],
    ['IoU', ratio(m.iou, lang)],
    [t('compare.metric.precision'), ratio(m.precision, lang)],
    [t('compare.metric.recall'), ratio(m.recall, lang)],
    ['Kappa', ratio(m.kappa, lang)],
    [t('compare.metric.oa'), ratio(m.oa, lang)],
  ];
}

function JobResult({ job, nameOf, viewer, onCancel }: { job: CompareJob; nameOf: (id?: string | number | null) => string; viewer?: { href: string; originName?: string }; onCancel: () => void }) {
  const { lang, t } = useLanguage();
  const type = typeOf(job);
  const input = (job.input ?? {}) as Record<string, any>;
  const metrics = (job.metrics ?? (job.comparison as Metrics | undefined)?.metrics ?? null) as Metrics | null;
  const registered = job.registration?.datacubeId;
  const registrationError = job.registration?.error || job.registration?.errorCode;
  const inputs = type === 'MODEL_COMPARE' ? `${nameOf(input.aId)} ↔ ${nameOf(input.bId)}` : nameOf(input.resultId);
  const when = type === 'TIME_CHANGE' ? `${String(input.t1 ?? '').slice(0, 10)} → ${String(input.t2 ?? '').slice(0, 10)}` : String(input.time ?? '').slice(0, 10);
  const percentDone = Math.round(Math.min(1, Number(job.progress ?? 0) > 1 ? Number(job.progress) / 100 : Number(job.progress ?? 0)) * 100);
  return (
    <div className="compare-out">
      <div className="compare-out__head">
        <h2 id="compare-result-title" className="compare-out__title">{job.name || t('compare.result.title')}</h2>
        <JobStatusBadge job={job} />
        <span className="compare-out__spacer" />
        {isActive(job) && <Button size="sm" variant="quiet" onClick={onCancel}><Square size={14} aria-hidden />{t('jobs.cancel')}</Button>}
        {registered != null && job.status === 'SUCCEEDED' && viewer && (
          <a className="xc-btn xc-btn--ink xc-btn--sm" href={viewer.href} target="_blank" rel="noopener noreferrer">{t('compare.result.viewer')}<ExternalLink size={13} aria-hidden /><span className="sr-only">{t('shell.newTab')}</span></a>
        )}
      </div>
      <p className="compare-out__facts">
        {type && <span>{t(`compare.types.${type}.name` as TKey)}</span>}
        {inputs && <span>{inputs}</span>}
        {when && <span className="tabular">{when}</span>}
        {type === 'REFERENCE' && <span>{t('compare.result.reference', { ref: typeof input.reference === 'string' ? input.reference : nameOf(input.reference?.shapefileDatasetId) })}</span>}
      </p>
      {isActive(job) ? (
        <div className="compare-out__progress" role="status">
          <svg className="job-progress" role="progressbar" aria-valuenow={percentDone} aria-valuemin={0} aria-valuemax={100} aria-label={t('compare.result.progress')}><rect width="100%" height="100%" transform={`scale(${percentDone / 100} 1)`} /></svg>
          <span className="xc-hint">{t('compare.result.working')}</span>
        </div>
      ) : job.status === 'FAILED' ? (
        <Alert tone="danger">{t('jobs.failReason', { reason: failureText(job, lang) || t('jobs.unknown') })}</Alert>
      ) : job.status === 'CANCELLED' ? (
        <p className="xc-hint">{t('compare.result.cancelled')}</p>
      ) : type && metrics ? (
        <div className="compare-out__body">
          <dl className="compare-metrics">
            {metricRows(type, metrics, lang, t).map(([label, value, lead]) => (
              <div key={label} className={`compare-metrics__row${lead ? ' is-lead' : ''}`}><dt>{label}</dt><dd className="tabular">{value}</dd></div>
            ))}
          </dl>
          <div className="compare-out__side">
            <ClassKey type={type} areas={type === 'TIME_CHANGE' ? metrics.areaKm2 : undefined} />
            {type === 'REFERENCE' && metrics.confusion && (
              <table className="xc-table compare-confusion">
                <caption>{t('compare.metric.confusion')}</caption>
                <thead><tr><th scope="col"><span className="sr-only">{t('compare.metric.result')}</span></th><th scope="col">{t('compare.metric.refWater')}</th><th scope="col">{t('compare.metric.refDry')}</th></tr></thead>
                <tbody>
                  <tr><th scope="row">{t('compare.metric.aiWater')}</th><td className="tabular">TP {count(metrics.confusion.tp, lang)}</td><td className="tabular">FP {count(metrics.confusion.fp, lang)}</td></tr>
                  <tr><th scope="row">{t('compare.metric.aiDry')}</th><td className="tabular">FN {count(metrics.confusion.fn, lang)}</td><td className="tabular">TN {count(metrics.confusion.tn, lang)}</td></tr>
                </tbody>
              </table>
            )}
            <p className="xc-hint">{t('compare.result.note')}</p>
          </div>
        </div>
      ) : <p className="xc-hint">{t('compare.result.noMetrics')}</p>}
      {registered != null && job.status === 'SUCCEEDED' && viewer?.originName && (
        <p className="compare-out__where">{t('compare.result.where', { name: viewer.originName })}</p>
      )}
      {registrationError && job.status === 'SUCCEEDED' && <Alert tone="warning">{t('compare.result.notRegistered')}</Alert>}
      {job.status === 'FAILED' && <p><Link to="/app/jobs?type=COMPARE" className="xc-btn xc-btn--line xc-btn--sm"><RotateCcw size={14} aria-hidden />{t('compare.result.toJobs')}</Link></p>}
    </div>
  );
}

/** Under step 3: what the check found (matched dates, grid, size, room left) or why it cannot run. */
function CheckLine({ request, check, lang, locked }: { request: CompareRequest | null; check: { data?: CompareCheck; error?: unknown } | null; lang: Lang; locked: boolean }) {
  const { t } = useLanguage();
  if (locked) return null;
  if (!request) return <p className="compare-check compare-check--idle">{t('compare.check.incomplete')}</p>;
  if (!check || (!check.data && !check.error)) return <p className="compare-check compare-check--idle" role="status">{t('compare.check.checking')}</p>;
  if (check.error) return <Alert tone="warning">{userMessage(check.error, lang)}</Alert>;
  const data = check.data!;
  const times = Object.values(data.times ?? {}).filter(Boolean).map((value) => String(value).slice(0, 10));
  const left = data.quota ? Math.max(0, data.quota.limitBytes - data.quota.usedBytes) : null;
  return (
    <div className={`compare-check${data.quota?.allowed === false ? ' is-blocked' : ''}`} role="status">
      <strong>{data.quota?.allowed === false ? t('compare.check.quota') : t('compare.check.ok')}</strong>
      <span className="tabular">
        {[times.length ? t('compare.check.times', { times: Array.from(new Set(times)).join(' → ') }) : '',
          data.grid ? t('compare.check.grid', { width: formatNumber(data.grid.width, {}, lang), height: formatNumber(data.grid.height, {}, lang) }) : '',
          data.estimatedBytes != null ? t('compare.check.size', { size: formatBytes(data.estimatedBytes) }) : '',
          left != null ? t('compare.check.left', { size: formatBytes(left) }) : ''].filter(Boolean).join(' · ')}
      </span>
      <Badge tone={data.quota?.allowed === false ? 'danger' : 'success'}>{data.quota?.allowed === false ? t('compare.check.blockedTag') : t('compare.check.okTag')}</Badge>
    </div>
  );
}
