// AI 수체 추출 in the Viewer (M7, S8 + S9 "원본 대비"): the run form, the result list, the result panel
// (layer, legend, threshold estimate, reference metrics, CSV) and the water-area row in the dock.
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, CircleAlert, CircleCheck, Download, LoaderCircle, RotateCcw, Square, Waves } from "lucide-react";
import type { AiCheck, AiCurvePoint, AiJobRequest, AiModel, AiResult, AiWaterJob } from "../../api/aiApi";
import type { TimePoint, ZarrDataset } from "../../api/viewerAdapter";
import { userMessage } from "../../api/httpClient";
import { ai } from "../../app/api";
import { AI_MODEL_LABEL } from "../../app/jobs";
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
};

export const INPUT_LABEL: Record<string, string> = {
  blue: "Blue(파랑)", green: "Green(초록)", red: "Red(빨강)", nir: "NIR(근적외)",
  swir: "SWIR(단파적외)", vv: "VV(레이더)", vh: "VH(레이더)",
};
const STATUS_LABEL: Record<string, string> = { QUEUED: "대기 중", RUNNING: "처리 중", SUCCEEDED: "완료", FAILED: "실패", CANCELLED: "취소됨" };
const STAGE_LABEL: Record<string, string> = { prepare: "입력 준비", infer: "추론", register: "등록" };
export const isRunning = (job?: { status: string } | null) => job?.status === "QUEUED" || job?.status === "RUNNING";
export const modelLabel = (modelId?: string, models: AiModel[] = []) =>
  models.find((model) => model.id === modelId)?.name ?? (modelId ? AI_MODEL_LABEL[modelId] ?? modelId : "—");

const km2 = (value: number | null | undefined) =>
  value == null ? "—" : value.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percent = (ratio: number | null | undefined) =>
  ratio == null ? "—" : `${(ratio * 100).toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
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

/** Per-time area table as CSV (UTF-8 with BOM so spreadsheet apps read Korean headers). */
export function areaCsv(result: AiResult, labelOf: (iso: string) => string) {
  const perTime = result.metrics?.times ?? [];
  const withMetrics = perTime.length > 0;
  const header = ["시점", "날짜", "수체 면적(km²)", "수체 비율(%)", "유효 면적(km²)", ...(withMetrics ? ["IoU", "F1", "정밀도", "재현율"] : [])];
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

function downloadCsv(name: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL?.(blob);
  if (!url) return;
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name.replace(/[\\/:*?"<>|]+/g, "_")}_수체면적.csv`;
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
  const [models, setModels] = useState<AiModel[]>([]);
  const [modelsError, setModelsError] = useState("");
  const [modelsTick, setModelsTick] = useState(0);
  const [modelId, setModelId] = useState("");
  const [check, setCheck] = useState<AiCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState("");
  const [threshold, setThreshold] = useState(0.5);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [name, setName] = useState("");
  useEffect(() => {
    let cancelled = false;
    setModelsError("");
    ai.models()
      .then((items) => {
        if (cancelled) return;
        setModels(items);
        setModelId((current) => (current && items.some((item) => item.id === current) ? current : items[0]?.id ?? ""));
      })
      .catch((cause) => !cancelled && setModelsError(userMessage(cause)));
    return () => { cancelled = true; };
  }, [modelsTick]);
  const model = models.find((item) => item.id === modelId);
  useEffect(() => {
    if (model) setThreshold(model.defaultThreshold);
  }, [model]);
  useEffect(() => {
    if (!modelId) return;
    let cancelled = false;
    setCheck(null);
    setCheckError("");
    setChecking(true);
    ai.check(dataset.id, modelId)
      .then((value) => !cancelled && setCheck(value))
      .catch((cause) => !cancelled && setCheckError(userMessage(cause)))
      .finally(() => !cancelled && setChecking(false));
    return () => { cancelled = true; };
  }, [dataset.id, modelId]);
  useEffect(() => { setStart(""); setEnd(""); setName(""); }, [dataset.id]);

  const index = model?.kind === "index";
  const [min, max] = index ? [-0.5, 0.5] : [0.05, 0.95];
  const startIndex = start ? times.findIndex((time) => time.iso === start) : 0;
  const endIndex = end ? times.findIndex((time) => time.iso === end) : times.length - 1;
  const rangeInvalid = startIndex > endIndex;
  const selectedCount = rangeInvalid ? 0 : endIndex - startIndex + 1;
  const today = new Date();
  const defaultName = `${dataset.name}_수체_${model?.name ?? "모델"}_${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
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
          <span>AI 모델 목록을 불러오지 못했습니다. AI 처리 서버가 아직 준비 중일 수 있습니다. ({modelsError})</span>
          <button type="button" className="vx-btn vx-btn--line" onClick={() => setModelsTick((value) => value + 1)}>다시 시도</button>
        </div>
      ) : (
        <fieldset className="vx-field">
          <legend>모델</legend>
          {!models.length ? (
            <p className="vx-section__hint"><LoaderCircle size={14} className="vx-spin" aria-hidden="true" /> 모델 목록을 불러오는 중…</p>
          ) : (
            <div className="vx-models">
              {models.map((item) => (
                <label key={item.id} className="vx-model">
                  <input type="radio" name="ai-model" value={item.id} checked={item.id === modelId} onChange={() => setModelId(item.id)} />
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.kind === "index" ? "지수 기반" : "딥러닝"} · 기본 임계값 {thresholdText(item.defaultThreshold)}</small>
                  </span>
                </label>
              ))}
            </div>
          )}
          {model && <p className="vx-section__hint">{model.description}{model.note ? ` ${model.note}` : ""}</p>}
        </fieldset>
      )}

      {model && (
        <section className="vx-field" aria-labelledby="vx-ai-inputs">
          <span id="vx-ai-inputs" className="vx-field__row">
            필요한 입력
            <small>{checking ? "확인 중…" : check ? (check.ready ? "모두 있음" : `${missing.length}개 없음`) : ""}</small>
          </span>
          <ul className="vx-inputs" aria-busy={checking}>
            {model.inputs.map((input) => {
              const matched = check?.matched[input.name];
              const absent = missing.includes(input.name);
              return (
                <li key={input.name} className={absent ? "is-missing" : matched ? "is-matched" : ""}>
                  {absent ? <CircleAlert size={14} aria-hidden="true" /> : matched ? <CircleCheck size={14} aria-hidden="true" /> : <i aria-hidden="true" />}
                  <span>{INPUT_LABEL[input.name] ?? input.name}</span>
                  <small className="tabular">
                    {absent ? "없음" : matched ? `← ${matched}${check?.unitDecisions?.[input.name] ? ` · ${check.unitDecisions[input.name]}` : ""}` : "확인 중"}
                  </small>
                </li>
              );
            })}
          </ul>
          {checkError && <p className="vx-note vx-note--bad" role="alert">입력을 확인하지 못했습니다. {checkError}</p>}
          {missing.length > 0 && (
            <p id="vx-ai-missing" className="vx-note vx-note--warn" role="status">
              이 데이터에는 {missing.map((item) => INPUT_LABEL[item] ?? item).join(", ")} 변수가 없어 이 모델을 실행할 수 없습니다.
              {model.kind === "deep"
                ? " Sentinel-1·2를 함께 담은 “수체 분석용 S1+S2” 데이터로 만들거나, Green·NIR만 쓰는 NDWI 기준선 모델을 고르세요."
                : " Green과 NIR band가 있는 데이터를 고르세요."}
            </p>
          )}
          {check?.warnings?.map((warning) => <p key={warning} className="vx-section__hint">{warning}</p>)}
        </section>
      )}

      <fieldset className="vx-field">
        <legend>기간 (선택)</legend>
        <div className="vx-range2">
          <label>
            <span className="vx-sr">시작 시점</span>
            <select aria-label="시작 시점" value={start} onChange={(event) => setStart(event.target.value)}>
              <option value="">처음부터</option>
              {times.map((time) => <option key={time.iso} value={time.iso}>{time.label}</option>)}
            </select>
          </label>
          <span aria-hidden="true">~</span>
          <label>
            <span className="vx-sr">끝 시점</span>
            <select aria-label="끝 시점" value={end} onChange={(event) => setEnd(event.target.value)}>
              <option value="">끝까지</option>
              {times.map((time) => <option key={time.iso} value={time.iso}>{time.label}</option>)}
            </select>
          </label>
        </div>
        {rangeInvalid ? (
          <p className="vx-note vx-note--bad" role="alert">시작 시점이 끝 시점보다 늦습니다.</p>
        ) : (
          <p className="vx-section__hint tabular">처리할 시점 {selectedCount}개{check?.grid ? ` · 격자 ${check.grid.width.toLocaleString("ko-KR")} × ${check.grid.height.toLocaleString("ko-KR")}` : ""}</p>
        )}
      </fieldset>

      {model && (
        <label className="vx-field">
          <span className="vx-field__row">
            {index ? "NDWI 임계값" : "물 확률 임계값"}
            <small className="tabular">{thresholdText(threshold)}</small>
          </span>
          <input
            type="range"
            min={min}
            max={max}
            step={0.05}
            value={threshold}
            aria-label={index ? "NDWI 임계값" : "물 확률 임계값"}
            aria-valuetext={`${thresholdText(threshold)}${sameThreshold(threshold, model.defaultThreshold) ? " (기본값)" : ""}`}
            onChange={(event) => setThreshold(Number(event.target.value))}
          />
          <span className="vx-section__hint">
            {index ? "NDWI가 이 값보다 크면 물로 봅니다." : "물일 확률이 이 값 이상이면 물로 봅니다."} 기본값 {thresholdText(model.defaultThreshold)}
            {!sameThreshold(threshold, model.defaultThreshold) && (
              <button type="button" className="vx-link" onClick={() => setThreshold(model.defaultThreshold)}>기본값으로</button>
            )}
          </span>
        </label>
      )}

      <label className="vx-field">
        <span>결과 이름</span>
        <input className="vx-input" value={name} placeholder={defaultName} onChange={(event) => setName(event.target.value)} />
      </label>

      {run && (
        <div className={`vx-run is-${run.status.toLowerCase()}`} aria-live="polite">
          <div className="vx-run__head">
            <strong>{STATUS_LABEL[run.status] ?? run.status}</strong>
            <span className="tabular">{busy ? `${percentDone}%${run.stage ? ` · ${STAGE_LABEL[run.stage] ?? run.stage}` : ""}` : ""}</span>
          </div>
          {busy && (
            <span className="vx-run__bar" role="progressbar" aria-label="수체 추출 진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentDone}>
              <i style={{ transform: `scaleX(${percentDone / 100})` }} />
            </span>
          )}
          <small>{run.name}</small>
          {run.status === "FAILED" && <p className="vx-note vx-note--bad" role="alert">실패 사유: {run.errorMessage || run.errorCode || "알 수 없음"}</p>}
          {busy && <button type="button" className="vx-btn vx-btn--line" onClick={onCancel}><Square size={14} aria-hidden="true" />취소</button>}
          {(run.status === "FAILED" || run.status === "CANCELLED") && <button type="button" className="vx-btn vx-btn--line" onClick={onRetry}><RotateCcw size={14} aria-hidden="true" />같은 설정으로 다시 시도</button>}
        </div>
      )}
      {runError && <p className="vx-note vx-note--bad" role="alert">{runError}</p>}

      <button type="submit" className="vx-btn vx-btn--ink vx-btn--block" disabled={!canRun}>
        {busy ? <><LoaderCircle size={16} className="vx-spin" aria-hidden="true" />처리 중…</> : "실행"}
      </button>
      {!canRun && !busy && model && (
        <p className="vx-section__hint">
          {checking ? "입력을 확인한 뒤 실행할 수 있습니다." : missing.length ? "필요한 입력이 모두 있어야 실행할 수 있습니다." : rangeInvalid ? "기간을 바르게 고르세요." : checkError ? "입력 확인에 실패해 실행할 수 없습니다." : ""}
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
  if (!entries.length) return <p className="vx-section__hint">이 데이터의 AI 결과가 아직 없습니다.</p>;
  return (
    <ul className="vx-results">
      {entries.map((entry) => {
        const ready = entry.status === "SUCCEEDED";
        return (
          <li key={entry.key}>
            <button type="button" className="vx-result" aria-current={entry.key === selectedKey ? "true" : undefined} disabled={!ready} onClick={() => onSelect(entry)}>
              <i className="vx-swatch vx-swatch--result" aria-hidden="true" />
              <span>
                <strong>{entry.name}</strong>
                <small>
                  <span className={`vx-job__state is-${entry.status.toLowerCase()}`}>{STATUS_LABEL[entry.status] ?? entry.status}</span>
                  {entry.modelId && <span>{modelLabel(entry.modelId, models)}</span>}
                  {entry.threshold != null && <span className="tabular">임계값 {thresholdText(entry.threshold)}</span>}
                </small>
                {entry.job?.status === "FAILED" && entry.job.errorMessage && <small className="vx-results__error">{entry.job.errorMessage}</small>}
              </span>
              {onMap && entry.key === selectedKey && <em>지도에 표시 중</em>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Teal hatch swatch + words: the result is never told by colour alone. */
export function AiLegend({ entry, timeLabel, covered, models, publishing }: { entry: ResultEntry; timeLabel?: string; covered: boolean; models?: AiModel[]; publishing?: boolean }) {
  return (
    <div className="vx-legend" role="group" aria-label="AI 결과 범례">
      <span className="vx-legend__row"><i className="vx-hatch" aria-hidden="true" /><strong>물로 판정 · AI 결과</strong></span>
      <small className="tabular">
        {modelLabel(entry.modelId, models)}{entry.threshold != null ? ` · 임계값 ${thresholdText(entry.threshold)}` : ""}{timeLabel ? ` · ${timeLabel}` : ""}
      </small>
      {publishing && <small className="vx-legend__wait" role="status">지도에 올리는 중 · 보통 1분 이내. 다 되면 바로 보입니다.</small>}
      {!publishing && !covered && <small>이 시점은 AI 결과 기간 밖이라 표시하지 않습니다.</small>}
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
      <section className="vx-field" aria-label="결과 레이어">
        <div className="vx-layers">
          <LayerControl label="AI 수체 결과" accent="result" checked={resultVisible} onChecked={onResultVisible} opacity={resultOpacity} onOpacity={onResultOpacity} />
          <LayerControl label="원본 Zarr" accent="source" checked={sourceVisible} onChecked={onSourceVisible} opacity={sourceOpacity} onOpacity={onSourceOpacity} />
        </div>
        <p className="vx-section__hint">원본 위에 물로 판정한 곳을 물색(파랑)으로 칠해 겹칩니다. 아래 “스와이프”에서 비교 대상을 “AI 결과”로 바꾸면 원본과 나란히 밀어 볼 수 있습니다.</p>
      </section>

      {demo && <p className="vx-note">데모 데이터입니다. 실제 분석 결과가 아닙니다.</p>}
      {loading ? (
        <p className="vx-section__hint"><LoaderCircle size={14} className="vx-spin" aria-hidden="true" /> 결과 통계를 불러오는 중…</p>
      ) : !result ? (
        <p className="vx-note">이 결과에는 시점별 면적 통계가 없습니다. 지도 비교만 할 수 있습니다.</p>
      ) : (
        <>
          <section className="vx-field" aria-labelledby="vx-ai-estimate">
            <span id="vx-ai-estimate" className="vx-field__row">
              임계값별 면적 (추정)
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
                  aria-label="추정 임계값"
                  aria-valuetext={`임계값 ${thresholdText(chosen)}, 추정 면적 ${km2(estimate)} km²`}
                  onChange={(event) => setPick(Number(event.target.value))}
                />
                <dl className="vx-kv tabular">
                  <div><dt>{currentLabel ?? "현재 시점"} 추정 면적</dt><dd>{estimate == null ? "이 시점 값 없음" : `${km2(estimate)} km²`}</dd></div>
                  <div><dt>결과 면적 (임계값 {thresholdText(used)})</dt><dd>{base == null ? "—" : `${km2(base)} km²`}</dd></div>
                  {change != null && changed && <div><dt>차이</dt><dd>{change > 0 ? "+" : ""}{change.toFixed(1)}%</dd></div>}
                </dl>
                <p className="vx-section__hint">추정치입니다. 지도와 결과 데이터는 바뀌지 않습니다. 이 임계값을 지도에 반영하려면 다시 실행하세요.</p>
                {onRerun && (
                  <button type="button" className="vx-btn vx-btn--line" disabled={!changed || rerunBusy} onClick={() => chosen != null && onRerun(chosen)}>
                    <RotateCcw size={14} aria-hidden="true" />임계값 {thresholdText(chosen)}으로 다시 실행
                  </button>
                )}
              </>
            ) : (
              <p className="vx-section__hint">임계값별 면적 기록이 없습니다.</p>
            )}
          </section>

          {overall && (
            <section className="vx-field" aria-labelledby="vx-ai-metrics">
              <span id="vx-ai-metrics">정답(water_gt) 대비 정확도</span>
              <dl className="vx-metrics tabular">
                <div><dt>IoU</dt><dd>{metric(atTime?.iou ?? overall.iou)}</dd></div>
                <div><dt>F1</dt><dd>{metric(atTime?.f1 ?? overall.f1)}</dd></div>
                <div><dt>정밀도</dt><dd>{metric(atTime?.precision ?? overall.precision)}</dd></div>
                <div><dt>재현율</dt><dd>{metric(atTime?.recall ?? overall.recall)}</dd></div>
              </dl>
              <p className="vx-section__hint">
                {atTime ? `${currentLabel ?? "현재 시점"} 기준` : "전체 시점 기준"} · 임계값 {thresholdText(used)}
                {atTime ? ` (전체 IoU ${metric(overall.iou)})` : ""}
              </p>
              {best && (
                <p className="vx-note vx-note--research">
                  <strong>연구용(정답 기준 보정, 점수가 실제보다 높게 나올 수 있음)</strong>
                  <span className="tabular">
                    최적 임계값 {thresholdText(best.threshold)}{best.iou != null ? ` · IoU ${metric(best.iou)}` : ""}{best.f1 != null ? ` · F1 ${metric(best.f1)}` : ""}
                  </span>
                  <span>같은 정답으로 고른 값이라 운영 기본값으로 쓰지 않습니다.</span>
                </p>
              )}
            </section>
          )}

          <button type="button" className="vx-btn vx-btn--line" onClick={() => downloadCsv(entry.name || source.name, areaCsv(result, labelOf))} disabled={!result.times.length}>
            <Download size={14} aria-hidden="true" />시점별 면적 CSV 내보내기
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
    <section className={`vx-graph vx-area ${expanded ? "expanded" : "hidden"}`} aria-label="시점별 수체 면적">
      <div className="vx-reading">
        <span className="vx-reading__title vx-area__title">
          <Waves size={14} aria-hidden="true" />
          <strong>수체 면적</strong>
          <b className="vx-area__tag">AI 결과</b>
        </span>
        {expanded && <small className="vx-area__name" title={title}>{title}</small>}
      </div>
      <div className="vx-graph__chart" ref={boxRef}>
        {expanded && (
          <div className="professional-chart vx-area__chart">
            <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`시점별 수체 면적 막대, 최대 ${km2(top)} km², 값 있는 시점 ${valid}개 / ${times.length}개`}>
              {[0, max / 2, max].map((tick) => (
                <g key={tick}>
                  <line className="grid" x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} />
                  <text className="axis-label" x={left - 5} y={y(tick) + 3} textAnchor="end">{tick.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}</text>
                </g>
              ))}
              {values.map((value, at) =>
                value == null ? (
                  <circle key={times[at].iso} className="missing-point" cx={x(at)} cy={height - padBottom - 4} r="3">
                    <title>{times[at].label}: 값 없음</title>
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
                    <title>{times[at].label}: {km2(value)} km² ({percent(series[at]?.waterRatio)})</title>
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
            <small className="tabular">{times[index] ? `${times[index].label} 수체 면적` : "수체 면적"}</small>
            {current?.waterAreaKm2 != null ? (
              <>
                <strong className="tabular">{km2(current.waterAreaKm2)}<span>km²</span></strong>
                <small className="tabular">비율 {percent(current.waterRatio)}{current.validAreaKm2 != null ? ` · 유효 ${km2(current.validAreaKm2)} km²` : ""}</small>
              </>
            ) : (
              <em>{current ? "이 시점에는 값이 없습니다 (구름 등)" : "AI 결과 기간 밖입니다"}</em>
            )}
          </div>
        )}
        <button type="button" className="vx-icon-btn" onClick={onToggle} aria-expanded={expanded} aria-label={expanded ? "수체 면적 그래프 숨기기" : "수체 면적 그래프 펼치기"} title={expanded ? "수체 면적 그래프 숨기기" : "수체 면적 그래프 펼치기"}>
          {expanded ? <ChevronDown size={18} aria-hidden="true" /> : <ChevronUp size={18} aria-hidden="true" />}
        </button>
      </div>
    </section>
  );
}
