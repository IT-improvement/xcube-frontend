// AI 수체 추출 in the Viewer (M7, S8 + S9 "원본 대비"): the run form, the result list, the result panel
// (layer, legend, threshold estimate, reference metrics, CSV) and the water-area row in the dock.
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, CircleAlert, CircleCheck, Download, LoaderCircle, RotateCcw, Square, Waves } from "lucide-react";
import type { AiCheck, AiCurvePoint, AiJobRequest, AiModel, AiResult, AiWaterJob } from "../../api/aiApi";
import type { TimePoint, ZarrDataset } from "../../api/viewerAdapter";
import { userMessage } from "../../api/httpClient";
import { ai } from "../../app/api";
import { formatDate, formatNumber, getLanguage, translate, useLanguage } from "../../i18n";
import type { Lang, TKey, TVars } from "../../i18n";
import "../../i18n/viewer";
import LayerControl from "./LayerControl";
import { PLOT_INSET } from "./TimeStaff";

/** One AI result of the shown dataset: an AI service job, or a Backoffice link without statistics. */
export type ResultEntry = {
  key: string;
  name: string;
  status: string;
  job?: AiWaterJob;
  datacubeId?: string;
  xcubeDatasetId?: string;
  modelId?: string;
  threshold?: number;
  createdAt?: string;
  /** First and last time the result covers (its statistics, else the requested range). */
  timeStart?: string;
  timeEnd?: string;
};

const INPUTS = ["blue", "green", "red", "nir", "swir", "vv", "vh"];
/** Model input in plain words: "NIR(근적외)" / "NIR"; unknown inputs as given. */
export const inputLabel = (name: string, lang: Lang = getLanguage()) =>
  INPUTS.includes(name) ? translate(lang, `viewer.ai.inputs.${name}` as TKey) : name;
/** The AI service's input decisions (worker `unit_decision`) in plain words; the original stays in the tooltip. */
const UNIT_DECISION: Record<string, string> = {
  "DN retained": "dnRetained",
  "dB×100 retained": "dbRetained",
  "dB→×100": "dbScaled",
  "reflectance→×10000": "reflectanceScaled",
  "no valid values; units unresolved": "unresolved",
};
export function unitDecisionText(decision: string, lang: Lang = getLanguage()) {
  const key = UNIT_DECISION[decision.trim()];
  if (!key) return { text: decision, detail: decision };
  return {
    text: translate(lang, `viewer.ai.units.${key}.text` as TKey),
    detail: translate(lang, `viewer.ai.units.${key}.detail` as TKey),
  };
}
/**
 * Check warnings in plain words. "{input}: {decision}" only repeats the input list, so it is dropped (null);
 * a unit change between times and a missing checkpoint are reworded; anything else (a service sentence) stays.
 */
export function aiWarningText(warning: string, decisions?: Record<string, string>, lang: Lang = getLanguage()): string | null {
  const vary = /^(\w+): units vary at time index (\d+): (.+)$/.exec(warning);
  if (vary)
    return translate(lang, "viewer.ai.warnVary", { input: inputLabel(vary[1], lang), n: Number(vary[2]) + 1, decision: unitDecisionText(vary[3], lang).text });
  const own = /^(\w+): (.+)$/.exec(warning);
  if (own && decisions?.[own[1]] === own[2]) return null;
  if (warning.trim() === "Model checkpoint unavailable") return translate(lang, "viewer.ai.warnCheckpoint");
  return warning;
}
const STATUSES = ["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"];
const STAGES = ["prepare", "infer", "register"];
/** 대기 중·처리 중·완료·실패·취소됨 / Queued·Running·Done·Failed·Cancelled; unknown statuses as given. */
export const statusLabel = (status: string, lang: Lang = getLanguage()) =>
  STATUSES.includes(status) ? translate(lang, `viewer.ai.status.${status}` as TKey) : status;
const stageLabel = (stage: string, lang: Lang) => (STAGES.includes(stage) ? translate(lang, `viewer.ai.stage.${stage}` as TKey) : stage);
export const isRunning = (job?: { status: string } | null) => job?.status === "QUEUED" || job?.status === "RUNNING";
/** Known model ids (M7 contract) → their dictionary entry. */
const MODEL_KEY: Record<string, string> = {
  "ndwi-baseline": "ndwi",
  "unet-s1s2-10ch": "unet",
  "deeplabv3plus-s1s2-10ch": "deeplab",
};
/** Name, description or note of a known model in `lang`; undefined for other ids. */
function modelText(modelId: string | undefined, field: "name" | "description" | "note", lang: Lang) {
  const key = modelId ? MODEL_KEY[modelId] : undefined;
  return key ? translate(lang, `viewer.ai.models.${key}.${field}` as TKey) : undefined;
}
/**
 * Model name: Korean shows the AI service's own name first (as before); English shows the known name first,
 * since the service names its models in Korean. Unknown ids fall back to the service name, then the id.
 */
export const modelLabel = (modelId?: string, models: AiModel[] = [], lang: Lang = getLanguage()) => {
  const served = models.find((model) => model.id === modelId)?.name;
  const known = modelText(modelId, "name", lang);
  return (lang === "ko" ? served ?? known : known ?? served) ?? modelId ?? "—";
};
/** Description and note of a model, the same way: the service's text in Korean, the known text in English. */
const modelInfo = (model: AiModel, lang: Lang) => ({
  description: lang === "ko" ? model.description : modelText(model.id, "description", lang) ?? model.description,
  note: lang === "ko" ? model.note : model.note ? modelText(model.id, "note", lang) ?? model.note : model.note,
});

const km2 = (value: number | null | undefined, lang: Lang) =>
  value == null ? "—" : formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 }, lang);
const percent = (ratio: number | null | undefined, lang: Lang) =>
  ratio == null ? "—" : `${formatNumber(ratio * 100, { minimumFractionDigits: 1, maximumFractionDigits: 1 }, lang)}%`;
const metric = (value: number | undefined) => (value == null ? "—" : value.toFixed(3));
const thresholdText = (value: number | undefined) => (value == null ? "—" : value.toFixed(2));

/** `--fb-ai-water` of fieldbook.css per theme: the legend, layer swatch and area bar use the same token. */
export const AI_WATER = { light: "#3fb4ff", dark: "#7fcbff" } as const;
/**
 * water_mask (1 물, 0 물 아님, 255 값 없음) painted in exactly the AI water colour. xcube 1.13 accepts a user colour map as JSON
 * in `cmap`; a categorical map with the single class 1 leaves 0, 255 and NaN outside its bins, so they stay transparent.
 */
export const aiMaskStyle = (theme: string) => ({ cmap: JSON.stringify({ name: "xcube_ai_water", type: "categorical", colors: [[1, theme === "dark" ? AI_WATER.dark : AI_WATER.light]] }) });
/** The candidate equal to {@code iso}, or the nearest within a day; null when the time is not covered. */
export function matchTime(candidates: string[], iso?: string): string | null {
  if (!iso) return null;
  if (!candidates.length) return iso;
  if (candidates.includes(iso)) return iso;
  const target = Date.parse(iso);
  if (!Number.isFinite(target)) return null;
  let best: string | null = null;
  let gap = Infinity;
  for (const candidate of candidates) {
    const distance = Math.abs(Date.parse(candidate) - target);
    if (distance < gap) { gap = distance; best = candidate; }
  }
  return gap <= 24 * 3600 * 1000 ? best : null;
}

/** Curve points (threshold → area) of the result at one time. */
export function curveAt(result: AiResult | null | undefined, iso?: string): AiCurvePoint[] {
  if (!result?.thresholdCurve.length) return [];
  const time = matchTime(result.thresholdCurve.map((entry) => entry.time), iso);
  return result.thresholdCurve.find((entry) => entry.time === time)?.points ?? [];
}
const sameThreshold = (a: number, b: number) => Math.abs(a - b) < 1e-6;

/** Per-time area table as CSV (UTF-8 with BOM so spreadsheet apps read Korean headers). Headers follow `lang`. */
export function areaCsv(result: AiResult, labelOf: (iso: string) => string, lang: Lang = getLanguage()) {
  const perTime = result.metrics?.times ?? [];
  const withMetrics = perTime.length > 0;
  const col = (key: TKey) => translate(lang, key);
  const header = [
    col("viewer.ai.csv.time"), col("viewer.ai.csv.date"), col("viewer.ai.csv.area"), col("viewer.ai.csv.ratio"), col("viewer.ai.csv.valid"),
    ...(withMetrics ? ["IoU", "F1", col("viewer.ai.result.precision"), col("viewer.ai.result.recall")] : []),
  ];
  const rows = result.times.map((stat) => {
    const scores = perTime.find((item) => item.time === stat.time);
    return [
      stat.time, labelOf(stat.time),
      stat.waterAreaKm2 == null ? "" : stat.waterAreaKm2.toFixed(2),
      stat.waterRatio == null ? "" : (stat.waterRatio * 100).toFixed(1),
      stat.validAreaKm2 == null ? "" : stat.validAreaKm2.toFixed(2),
      ...(withMetrics ? (scores ? [scores.iou, scores.f1, scores.precision, scores.recall].map((value) => value.toFixed(3)) : ["", "", "", ""]) : []),
    ];
  });
  const cell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  return `﻿${[header, ...rows].map((row) => row.map(cell).join(",")).join("\n")}\n`;
}

/**
 * File name of the area CSV. Korean keeps the result name (only characters files cannot hold are replaced);
 * English keeps it ASCII-safe: anything but letters, digits, "-" and "." becomes "_".
 */
export function csvFileName(name: string, lang: Lang = getLanguage()) {
  const suffix = translate(lang, "viewer.ai.csv.fileSuffix");
  if (lang === "ko") return `${name.replace(/[\\/:*?"<>|]+/g, "_")}${suffix}.csv`;
  const ascii = name.replace(/[^A-Za-z0-9.-]+/g, "_").replace(/^_+|_+$/g, "");
  return `${ascii || "ai_result"}${suffix}.csv`;
}

function downloadCsv(fileName: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL?.(blob);
  if (!url) return;
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** S8 실행 폼: model, input check, period, threshold, name; then progress of the run. */
export function AiRunForm({
  dataset,
  times,
  run,
  runError,
  onRun,
  onCancel,
  onRetry,
}: {
  dataset: ZarrDataset;
  times: TimePoint[];
  /** The latest run on this dataset, while it runs or right after it ended. */
  run: AiWaterJob | null;
  runError: string;
  onRun: (request: AiJobRequest) => void;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const { lang, t } = useLanguage();
  const [models, setModels] = useState<AiModel[]>([]);
  // Causes are kept and worded when drawn, so a language switch rewords them too.
  const [modelsError, setModelsError] = useState<unknown>(null);
  const [modelsTick, setModelsTick] = useState(0);
  const [modelId, setModelId] = useState("");
  const [check, setCheck] = useState<AiCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<unknown>(null);
  const [threshold, setThreshold] = useState(0.5);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [name, setName] = useState("");
  useEffect(() => {
    let cancelled = false;
    setModelsError(null);
    ai.models()
      .then((items) => {
        if (cancelled) return;
        setModels(items);
        setModelId((current) => (current && items.some((item) => item.id === current) ? current : items[0]?.id ?? ""));
      })
      .catch((cause) => !cancelled && setModelsError(cause ?? new Error()));
    return () => { cancelled = true; };
  }, [modelsTick]);
  const model = models.find((item) => item.id === modelId);
  const info = model ? modelInfo(model, lang) : null;
  useEffect(() => {
    if (model) setThreshold(model.defaultThreshold);
  }, [model]);
  useEffect(() => {
    if (!modelId) return;
    let cancelled = false;
    setCheck(null);
    setCheckError(null);
    setChecking(true);
    ai.check(dataset.id, modelId)
      .then((value) => !cancelled && setCheck(value))
      .catch((cause) => !cancelled && setCheckError(cause ?? new Error()))
      .finally(() => !cancelled && setChecking(false));
    return () => { cancelled = true; };
  }, [dataset.id, modelId]);
  useEffect(() => { setStart(""); setEnd(""); setName(""); }, [dataset.id]);

  const index = model?.kind === "index";
  const thresholdName = t(index ? "viewer.ai.form.thresholdIndex" : "viewer.ai.form.thresholdProb");
  const [min, max] = index ? [-0.5, 0.5] : [0.05, 0.95];
  const startIndex = start ? times.findIndex((time) => time.iso === start) : 0;
  const endIndex = end ? times.findIndex((time) => time.iso === end) : times.length - 1;
  const rangeInvalid = startIndex > endIndex;
  const selectedCount = rangeInvalid ? 0 : endIndex - startIndex + 1;
  const today = new Date();
  const defaultName = t("viewer.ai.form.defaultName", {
    data: dataset.name,
    model: model ? modelLabel(model.id, models, lang) : t("viewer.ai.form.modelFallback"),
    date: `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`,
  });
  const busy = isRunning(run);
  const missing = check?.missing ?? [];
  const canRun = !!model && !!check?.ready && !checking && !rangeInvalid && !busy;
  const submit = () => {
    if (!canRun || !model) return;
    onRun({
      datacubeId: dataset.id,
      modelId: model.id,
      threshold: Number(threshold.toFixed(2)),
      ...(start ? { timeStart: start } : {}),
      ...(end ? { timeEnd: end } : {}),
      name: name.trim() || defaultName,
    });
  };
  const percentDone = Math.round((run?.progress ?? 0) * 100);

  return (
    <form className="vx-form" onSubmit={(event) => { event.preventDefault(); submit(); }} aria-describedby={missing.length ? "vx-ai-missing" : undefined}>
      {modelsError ? (
        <div className="vx-note vx-note--bad" role="alert">
          <CircleAlert size={16} aria-hidden="true" />
          <span>{t("viewer.ai.form.modelsFailed", { error: userMessage(modelsError, lang) })}</span>
          <button type="button" className="vx-btn vx-btn--line" onClick={() => setModelsTick((value) => value + 1)}>{t("common.retry")}</button>
        </div>
      ) : (
        <fieldset className="vx-field">
          <legend>{t("viewer.ai.form.model")}</legend>
          {!models.length ? (
            <p className="vx-section__hint"><LoaderCircle size={14} className="vx-spin" aria-hidden="true" /> {t("viewer.ai.form.modelsLoading")}</p>
          ) : (
            <div className="vx-models">
              {models.map((item) => (
                <label key={item.id} className="vx-model">
                  <input type="radio" name="ai-model" value={item.id} checked={item.id === modelId} onChange={() => setModelId(item.id)} />
                  <span>
                    <strong>{modelLabel(item.id, models, lang)}</strong>
                    <small>{t(item.kind === "index" ? "viewer.ai.form.kindIndex" : "viewer.ai.form.kindDeep")} · {t("viewer.ai.form.defaultThreshold", { value: thresholdText(item.defaultThreshold) })}</small>
                  </span>
                </label>
              ))}
            </div>
          )}
          {model && <p className="vx-section__hint">{info?.description}{info?.note ? ` ${info.note}` : ""}</p>}
        </fieldset>
      )}

      {model && (
        <section className="vx-field" aria-labelledby="vx-ai-inputs">
          <span id="vx-ai-inputs" className="vx-field__row">
            {t("viewer.ai.form.inputs")}
            <small>{checking ? t("viewer.ai.form.checking") : check ? (check.ready ? t("viewer.ai.form.allPresent") : t("viewer.ai.form.missingCount", { count: missing.length })) : ""}</small>
          </span>
          <ul className="vx-inputs" aria-busy={checking}>
            {model.inputs.map((input) => {
              const matched = check?.matched[input.name];
              const absent = missing.includes(input.name);
              const decision = check?.unitDecisions?.[input.name];
              return (
                <li key={input.name} className={absent ? "is-missing" : matched ? "is-matched" : ""}>
                  {absent ? <CircleAlert size={14} aria-hidden="true" /> : matched ? <CircleCheck size={14} aria-hidden="true" /> : <i aria-hidden="true" />}
                  <span>{inputLabel(input.name, lang)}</span>
                  <small className="tabular" title={decision ? `${unitDecisionText(decision, lang).detail} (${decision})` : undefined}>
                    {absent ? t("viewer.ai.form.absent") : matched ? `← ${matched}${decision ? ` · ${unitDecisionText(decision, lang).text}` : ""}` : t("viewer.ai.form.pending")}
                  </small>
                </li>
              );
            })}
          </ul>
          {!!checkError && <p className="vx-note vx-note--bad" role="alert">{t("viewer.ai.form.checkFailed", { error: userMessage(checkError, lang) })}</p>}
          {missing.length > 0 && (
            <p id="vx-ai-missing" className="vx-note vx-note--warn" role="status">
              {t("viewer.ai.form.missingNote", { inputs: missing.map((item) => inputLabel(item, lang)).join(", ") })}
              {t(model.kind === "deep" ? "viewer.ai.form.missingDeep" : "viewer.ai.form.missingIndex")}
            </p>
          )}
          {check?.warnings?.map((warning) => {
            const text = aiWarningText(warning, check.unitDecisions, lang);
            return text && <p key={warning} className="vx-section__hint" title={text !== warning ? warning : undefined}>{text}</p>;
          })}
        </section>
      )}

      <fieldset className="vx-field">
        <legend>{t("viewer.ai.form.period")}</legend>
        <div className="vx-range2">
          <label>
            <span className="vx-sr">{t("viewer.ai.form.start")}</span>
            <select aria-label={t("viewer.ai.form.start")} value={start} onChange={(event) => setStart(event.target.value)}>
              <option value="">{t("viewer.ai.form.fromFirst")}</option>
              {times.map((time) => <option key={time.iso} value={time.iso}>{time.label}</option>)}
            </select>
          </label>
          <span aria-hidden="true">{t("viewer.ai.form.rangeSep")}</span>
          <label>
            <span className="vx-sr">{t("viewer.ai.form.end")}</span>
            <select aria-label={t("viewer.ai.form.end")} value={end} onChange={(event) => setEnd(event.target.value)}>
              <option value="">{t("viewer.ai.form.toLast")}</option>
              {times.map((time) => <option key={time.iso} value={time.iso}>{time.label}</option>)}
            </select>
          </label>
        </div>
        {rangeInvalid ? (
          <p className="vx-note vx-note--bad" role="alert">{t("viewer.ai.form.rangeInvalid")}</p>
        ) : (
          <p className="vx-section__hint tabular">
            {t("viewer.ai.form.timesToRun", { count: selectedCount })}
            {check?.grid ? t("viewer.ai.form.grid", { width: formatNumber(check.grid.width, {}, lang), height: formatNumber(check.grid.height, {}, lang) }) : ""}
          </p>
        )}
      </fieldset>

      {model && (
        <label className="vx-field">
          <span className="vx-field__row">
            {thresholdName}
            <small className="tabular">{thresholdText(threshold)}</small>
          </span>
          <input
            type="range"
            min={min}
            max={max}
            step={0.05}
            value={threshold}
            aria-label={thresholdName}
            aria-valuetext={`${thresholdText(threshold)}${sameThreshold(threshold, model.defaultThreshold) ? t("viewer.ai.form.defaultMark") : ""}`}
            onChange={(event) => setThreshold(Number(event.target.value))}
          />
          <span className="vx-section__hint">
            {t(index ? "viewer.ai.form.hintIndex" : "viewer.ai.form.hintProb")} {t("viewer.ai.form.defaultIs", { value: thresholdText(model.defaultThreshold) })}
            {!sameThreshold(threshold, model.defaultThreshold) && (
              <button type="button" className="vx-link" onClick={() => setThreshold(model.defaultThreshold)}>{t("viewer.ai.form.resetDefault")}</button>
            )}
          </span>
        </label>
      )}

      <label className="vx-field">
        <span>{t("viewer.ai.form.name")}</span>
        <input className="vx-input" value={name} placeholder={defaultName} onChange={(event) => setName(event.target.value)} />
      </label>

      {run && (
        <div className={`vx-run is-${run.status.toLowerCase()}`} aria-live="polite">
          <div className="vx-run__head">
            <strong>{statusLabel(run.status, lang)}</strong>
            <span className="tabular">{busy ? `${percentDone}%${run.stage ? ` · ${stageLabel(run.stage, lang)}` : ""}` : ""}</span>
          </div>
          {busy && (
            <span className="vx-run__bar" role="progressbar" aria-label={t("viewer.ai.form.progress")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentDone}>
              <i style={{ transform: `scaleX(${percentDone / 100})` }} />
            </span>
          )}
          <small>{run.name}</small>
          {run.status === "FAILED" && <p className="vx-note vx-note--bad" role="alert">{t("viewer.ai.form.failedReason", { reason: run.errorMessage || run.errorCode || t("viewer.ai.form.unknown") })}</p>}
          {busy && <button type="button" className="vx-btn vx-btn--line" onClick={onCancel}><Square size={14} aria-hidden="true" />{t("common.cancel")}</button>}
          {(run.status === "FAILED" || run.status === "CANCELLED") && <button type="button" className="vx-btn vx-btn--line" onClick={onRetry}><RotateCcw size={14} aria-hidden="true" />{t("viewer.ai.form.retrySame")}</button>}
        </div>
      )}
      {runError && <p className="vx-note vx-note--bad" role="alert">{runError}</p>}

      <button type="submit" className="vx-btn vx-btn--ink vx-btn--block" disabled={!canRun}>
        {busy ? <><LoaderCircle size={16} className="vx-spin" aria-hidden="true" />{t("viewer.ai.form.running")}</> : t("viewer.ai.form.run")}
      </button>
      {!canRun && !busy && model && (
        <p className="vx-section__hint">
          {checking ? t("viewer.ai.form.whyChecking") : missing.length ? t("viewer.ai.form.whyMissing") : rangeInvalid ? t("viewer.ai.form.whyRange") : checkError ? t("viewer.ai.form.whyCheckFailed") : ""}
        </p>
      )}
    </form>
  );
}

/** AI results (and runs) of the shown dataset; choosing one opens it on the map. */
export function AiResultList({
  entries,
  selectedKey,
  onMap = false,
  onSelect,
  models,
}: {
  entries: ResultEntry[];
  selectedKey: string;
  /** The selected result is drawn on the map now (its layer is on, or it is in the comparison). */
  onMap?: boolean;
  onSelect: (entry: ResultEntry) => void;
  models?: AiModel[];
}) {
  const { lang, t } = useLanguage();
  if (!entries.length) return <p className="vx-section__hint">{t("viewer.ai.list.empty")}</p>;
  return (
    <ul className="vx-results">
      {entries.map((entry) => {
        const ready = entry.status === "SUCCEEDED";
        return (
          <li key={entry.key}>
            <button type="button" className="vx-result" aria-current={entry.key === selectedKey ? "true" : undefined} disabled={!ready} onClick={() => onSelect(entry)}>
              <i className="vx-swatch vx-swatch--result" aria-hidden="true" />
              <span>
                <strong title={entry.name}>{entry.name}</strong>
                <small>
                  <span className={`vx-job__state is-${entry.status.toLowerCase()}`}>{statusLabel(entry.status, lang)}</span>
                  {entry.modelId && <span>{modelLabel(entry.modelId, models, lang)}</span>}
                </small>
                <small className="vx-result__detail tabular">{entryDetail(entry, lang)}</small>
                {entry.job?.status === "FAILED" && entry.job.errorMessage && <small className="vx-results__error">{entry.job.errorMessage}</small>}
              </span>
              {onMap && entry.key === selectedKey && <em>{t("viewer.ai.list.onMap")}</em>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const two = (value: number) => String(value).padStart(2, "0");
const SHORT_DATE: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" };
const SHORT_TIME: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
/** Compact date for result rows (local calendar day): ko 2021.11.27, en Nov 27, 2021. */
export function shortDate(iso?: string, lang: Lang = getLanguage()) {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  if (lang !== "ko") return formatDate(date, SHORT_DATE, lang);
  return `${date.getFullYear()}.${two(date.getMonth() + 1)}.${two(date.getDate())}`;
}
/** ko 10.09 14:32 (this year) or 2025.10.09 14:32; en Oct 9, 14:32 or Oct 9, 2025, 14:32. */
export function shortDateTime(iso?: string, now = new Date(), lang: Lang = getLanguage()) {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  const thisYear = date.getFullYear() === now.getFullYear();
  if (lang !== "ko") return formatDate(date, thisYear ? SHORT_TIME : { ...SHORT_TIME, year: "numeric" }, lang);
  const day = `${two(date.getMonth() + 1)}.${two(date.getDate())}`;
  return `${thisYear ? day : `${date.getFullYear()}.${day}`} ${two(date.getHours())}:${two(date.getMinutes())}`;
}
/** What tells same-name results apart: period · threshold · created time (S7·S8 결과 목록). */
export function entryDetail(entry: ResultEntry, lang: Lang = getLanguage()) {
  const say = (key: TKey, vars?: TVars) => translate(lang, key, vars);
  const start = shortDate(entry.timeStart, lang);
  const end = shortDate(entry.timeEnd, lang);
  const period = start && end
    ? start === end ? start : say("viewer.ai.detail.range", { start, end })
    : start ? say("viewer.ai.detail.from", { date: start }) : end ? say("viewer.ai.detail.until", { date: end }) : say("viewer.ai.detail.all");
  const created = shortDateTime(entry.createdAt, undefined, lang);
  return [
    period,
    entry.threshold != null ? say("viewer.ai.detail.threshold", { value: thresholdText(entry.threshold) }) : "",
    created ? say("viewer.ai.detail.created", { time: created }) : "",
  ].filter(Boolean).join(" · ");
}

/** Teal hatch swatch + words: the result is never told by colour alone. */
export function AiLegend({ entry, timeLabel, covered, models, publishing }: { entry: ResultEntry; timeLabel?: string; covered: boolean; models?: AiModel[]; publishing?: boolean }) {
  const { lang, t } = useLanguage();
  return (
    <div className="vx-legend" role="group" aria-label={t("viewer.ai.legend.aria")}>
      <span className="vx-legend__row"><i className="vx-hatch" aria-hidden="true" /><strong>{t("viewer.ai.legend.title")}</strong></span>
      <small className="tabular">
        {modelLabel(entry.modelId, models, lang)}{entry.threshold != null ? ` · ${t("viewer.ai.detail.threshold", { value: thresholdText(entry.threshold) })}` : ""}{timeLabel ? ` · ${timeLabel}` : ""}
      </small>
      {publishing && <small className="vx-legend__wait" role="status">{t("viewer.ai.legend.publishing")}</small>}
      {!publishing && !covered && <small>{t("viewer.ai.legend.outside")}</small>}
    </div>
  );
}

/** Result tab: layers, threshold estimate, reference metrics and CSV export. */
export function AiResultPanel({
  entry,
  result,
  loading,
  currentTime,
  currentLabel,
  labelOf,
  source,
  resultVisible,
  onResultVisible,
  resultOpacity,
  onResultOpacity,
  sourceVisible,
  onSourceVisible,
  sourceOpacity,
  onSourceOpacity,
  onRerun,
  rerunBusy,
  demo,
}: {
  entry: ResultEntry;
  result: AiResult | null;
  loading: boolean;
  currentTime?: string;
  currentLabel?: string;
  labelOf: (iso: string) => string;
  source: ZarrDataset;
  resultVisible: boolean;
  onResultVisible: (value: boolean) => void;
  resultOpacity: number;
  onResultOpacity: (value: number) => void;
  sourceVisible: boolean;
  onSourceVisible: (value: boolean) => void;
  sourceOpacity: number;
  onSourceOpacity: (value: number) => void;
  onRerun?: (threshold: number) => void;
  rerunBusy: boolean;
  demo: boolean;
}) {
  const { lang, t } = useLanguage();
  const used = result?.threshold ?? entry.threshold;
  const points = useMemo(() => curveAt(result, currentTime), [result, currentTime]);
  const thresholds = useMemo(
    () => (points.length ? points : result?.thresholdCurve[0]?.points ?? []).map((point) => point.threshold),
    [points, result],
  );
  const usedIndex = used == null ? -1 : thresholds.findIndex((value) => sameThreshold(value, used));
  const [pick, setPick] = useState(-1);
  const resultKey = entry.key;
  useEffect(() => setPick(-1), [resultKey]);
  const index = pick >= 0 && pick < thresholds.length ? pick : usedIndex >= 0 ? usedIndex : Math.floor(thresholds.length / 2);
  const chosen = thresholds[index];
  const estimate = points.find((point) => chosen != null && sameThreshold(point.threshold, chosen))?.waterAreaKm2 ?? null;
  const stat = result?.times.find((item) => item.time === matchTime(result.times.map((value) => value.time), currentTime));
  const base = stat?.waterAreaKm2 ?? (used != null ? points.find((point) => sameThreshold(point.threshold, used))?.waterAreaKm2 : null) ?? null;
  const change = estimate != null && base != null && base !== 0 ? ((estimate - base) / base) * 100 : null;
  const best = result?.researchBestThreshold;
  const overall = result?.metrics?.overall;
  const atTime = result?.metrics?.times?.find((item) => item.time === stat?.time);
  const changed = chosen != null && used != null && !sameThreshold(chosen, used);

  return (
    <div className="vx-form">
      <section className="vx-field" aria-label={t("viewer.ai.result.layers")}>
        <div className="vx-layers">
          <LayerControl label={t("viewer.panel.aiResult")} accent="result" checked={resultVisible} onChecked={onResultVisible} opacity={resultOpacity} onOpacity={onResultOpacity} />
          <LayerControl label={t("viewer.panel.source")} accent="source" checked={sourceVisible} onChecked={onSourceVisible} opacity={sourceOpacity} onOpacity={onSourceOpacity} />
        </div>
        <p className="vx-section__hint">{t("viewer.ai.result.overlayHint")}</p>
      </section>

      {demo && <p className="vx-note">{t("viewer.ai.result.demo")}</p>}
      {loading ? (
        <p className="vx-section__hint"><LoaderCircle size={14} className="vx-spin" aria-hidden="true" /> {t("viewer.ai.result.statsLoading")}</p>
      ) : !result ? (
        <p className="vx-note">{t("viewer.ai.result.noStats")}</p>
      ) : (
        <>
          <section className="vx-field" aria-labelledby="vx-ai-estimate">
            <span id="vx-ai-estimate" className="vx-field__row">
              {t("viewer.ai.result.estimate")}
              <small className="tabular">{thresholdText(chosen)}</small>
            </span>
            {thresholds.length ? (
              <>
                <input
                  type="range"
                  min={0}
                  max={thresholds.length - 1}
                  step={1}
                  value={index}
                  aria-label={t("viewer.ai.result.estimateAria")}
                  aria-valuetext={t("viewer.ai.result.estimateText", { threshold: thresholdText(chosen), area: km2(estimate, lang) })}
                  onChange={(event) => setPick(Number(event.target.value))}
                />
                <dl className="vx-kv tabular">
                  <div><dt>{t("viewer.ai.result.estimateAt", { time: currentLabel ?? t("viewer.ai.result.currentTime") })}</dt><dd>{estimate == null ? t("viewer.ai.result.noValueHere") : `${km2(estimate, lang)} km²`}</dd></div>
                  <div><dt>{t("viewer.ai.result.resultArea", { value: thresholdText(used) })}</dt><dd>{base == null ? "—" : `${km2(base, lang)} km²`}</dd></div>
                  {change != null && changed && <div><dt>{t("viewer.ai.result.diff")}</dt><dd>{change > 0 ? "+" : ""}{change.toFixed(1)}%</dd></div>}
                </dl>
                <p className="vx-section__hint">{t("viewer.ai.result.estimateNote")}</p>
                {onRerun && (
                  <button type="button" className="vx-btn vx-btn--line" disabled={!changed || rerunBusy} onClick={() => chosen != null && onRerun(chosen)}>
                    <RotateCcw size={14} aria-hidden="true" />{t("viewer.ai.result.rerun", { value: thresholdText(chosen) })}
                  </button>
                )}
              </>
            ) : (
              <p className="vx-section__hint">{t("viewer.ai.result.noCurve")}</p>
            )}
          </section>

          {overall && (
            <section className="vx-field" aria-labelledby="vx-ai-metrics">
              <span id="vx-ai-metrics">{t("viewer.ai.result.metrics")}</span>
              <dl className="vx-metrics tabular">
                <div><dt>IoU</dt><dd>{metric(atTime?.iou ?? overall.iou)}</dd></div>
                <div><dt>F1</dt><dd>{metric(atTime?.f1 ?? overall.f1)}</dd></div>
                <div><dt>{t("viewer.ai.result.precision")}</dt><dd>{metric(atTime?.precision ?? overall.precision)}</dd></div>
                <div><dt>{t("viewer.ai.result.recall")}</dt><dd>{metric(atTime?.recall ?? overall.recall)}</dd></div>
              </dl>
              <p className="vx-section__hint">
                {atTime ? t("viewer.ai.result.basisAt", { time: currentLabel ?? t("viewer.ai.result.currentTime") }) : t("viewer.ai.result.basisAll")} · {t("viewer.ai.result.usedThreshold", { value: thresholdText(used) })}
                {atTime ? t("viewer.ai.result.overallIou", { value: metric(overall.iou) }) : ""}
              </p>
              {best && (
                <p className="vx-note vx-note--research">
                  <strong>{t("viewer.ai.result.research")}</strong>
                  <span className="tabular">
                    {t("viewer.ai.result.best", { value: thresholdText(best.threshold) })}{best.iou != null ? ` · IoU ${metric(best.iou)}` : ""}{best.f1 != null ? ` · F1 ${metric(best.f1)}` : ""}
                  </span>
                  <span>{t("viewer.ai.result.researchNote")}</span>
                </p>
              )}
            </section>
          )}

          <button type="button" className="vx-btn vx-btn--line" onClick={() => downloadCsv(csvFileName(entry.name || source.name, lang), areaCsv(result, labelOf, lang))} disabled={!result.times.length}>
            <Download size={14} aria-hidden="true" />{t("viewer.ai.result.csv")}
          </button>
        </>
      )}
    </div>
  );
}

/**
 * Water area per time in the dock. It uses the time staff's plot column, so each bar stands over
 * its acquisition tick; the current time carries the overprint cursor like the pixel chart.
 */
export function WaterAreaRow({
  result,
  times,
  index,
  onIndex,
  expanded,
  onToggle,
  title,
}: {
  result: AiResult;
  times: TimePoint[];
  index: number;
  onIndex: (index: number) => void;
  expanded: boolean;
  onToggle: () => void;
  title: string;
}) {
  const { lang, t } = useLanguage();
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 900, height: 96 });
  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([item]) => {
      const { width, height } = item.contentRect;
      if (width > 0 && height > 0) setSize({ width: Math.max(240, Math.round(width)), height: Math.max(60, Math.round(height)) });
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [expanded]);
  const statIsos = result.times.map((stat) => stat.time);
  const series = times.map((time) => {
    const iso = matchTime(statIsos, time.iso);
    return iso && statIsos.length ? result.times.find((stat) => stat.time === iso) ?? null : null;
  });
  const values = series.map((stat) => stat?.waterAreaKm2 ?? null);
  const top = Math.max(1, ...values.filter((value): value is number => value != null));
  const magnitude = 10 ** Math.floor(Math.log10(top));
  const max = Math.ceil(top / magnitude) * magnitude;
  const { width, height } = size;
  const { left, right } = PLOT_INSET;
  const padTop = 8;
  const padBottom = 6;
  const x = (at: number) => left + (at * (width - left - right)) / Math.max(times.length - 1, 1);
  const y = (value: number) => padTop + ((max - value) * (height - padTop - padBottom)) / max;
  const barWidth = Math.max(4, Math.min(16, ((width - left - right) / Math.max(times.length, 1)) * 0.5));
  const current = series[index];
  const valid = values.filter((value) => value != null).length;
  return (
    <section className={`vx-graph vx-area ${expanded ? "expanded" : "hidden"}`} aria-label={t("viewer.ai.area.region")}>
      <div className="vx-reading">
        <span className="vx-reading__title vx-area__title">
          <Waves size={14} aria-hidden="true" />
          <strong>{t("viewer.ai.area.title")}</strong>
          <b className="vx-area__tag">{t("viewer.ai.area.tag")}</b>
        </span>
        {expanded && <small className="vx-area__name" title={title}>{title}</small>}
      </div>
      <div className="vx-graph__chart" ref={boxRef}>
        {expanded && (
          <div className="professional-chart vx-area__chart">
            <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t("viewer.ai.area.chart", { max: km2(top, lang), valid, total: times.length })}>
              {[0, max / 2, max].map((tick) => (
                <g key={tick}>
                  <line className="grid" x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} />
                  <text className="axis-label" x={left - 5} y={y(tick) + 3} textAnchor="end">{formatNumber(tick, { maximumFractionDigits: 1 }, lang)}</text>
                </g>
              ))}
              {values.map((value, at) =>
                value == null ? (
                  <circle key={times[at].iso} className="missing-point" cx={x(at)} cy={height - padBottom - 4} r="3">
                    <title>{t("viewer.ai.area.missing", { time: times[at].label })}</title>
                  </circle>
                ) : (
                  <rect
                    key={times[at].iso}
                    className={`vx-area__bar ${at === index ? "is-current" : ""}`}
                    x={x(at) - barWidth / 2}
                    width={barWidth}
                    y={y(value)}
                    height={Math.max(1, y(0) - y(value))}
                    onClick={() => onIndex(at)}
                  >
                    <title>{times[at].label}: {km2(value, lang)} km² ({percent(series[at]?.waterRatio, lang)})</title>
                  </rect>
                ),
              )}
              {times[index] && <line className="cursor" x1={x(index)} x2={x(index)} y1={padTop} y2={height - padBottom} />}
            </svg>
            <span className="vx-area__unit" aria-hidden="true">km²</span>
          </div>
        )}
      </div>
      <div className="vx-reading__tail">
        {expanded && (
          <div className="vx-reading__value">
            <small className="tabular">{times[index] ? t("viewer.ai.area.at", { time: times[index].label }) : t("viewer.ai.area.title")}</small>
            {current?.waterAreaKm2 != null ? (
              <>
                <strong className="tabular">{km2(current.waterAreaKm2, lang)}<span>km²</span></strong>
                <small className="tabular">{t("viewer.ai.area.ratio", { ratio: percent(current.waterRatio, lang) })}{current.validAreaKm2 != null ? t("viewer.ai.area.valid", { area: km2(current.validAreaKm2, lang) }) : ""}</small>
              </>
            ) : (
              <em>{t(current ? "viewer.ai.area.noValue" : "viewer.ai.area.outside")}</em>
            )}
          </div>
        )}
        <button type="button" className="vx-icon-btn" onClick={onToggle} aria-expanded={expanded} aria-label={t(expanded ? "viewer.ai.area.hide" : "viewer.ai.area.show")} title={t(expanded ? "viewer.ai.area.hide" : "viewer.ai.area.show")}>
          {expanded ? <ChevronDown size={18} aria-hidden="true" /> : <ChevronUp size={18} aria-hidden="true" />}
        </button>
      </div>
    </section>
  );
}
