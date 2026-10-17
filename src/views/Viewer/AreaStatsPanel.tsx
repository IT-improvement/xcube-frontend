// 영역 통계 tab (UR-63 F1): draw a polygon or rectangle (or take the current view), pick what to measure, and read
// the values inside the shape per time — numbers for the shown time, a time chart and a CSV. For an AI result the
// area judged as water is measured instead (km² and share).
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Pentagon, RectangleHorizontal, ScanLine, Trash2, X } from "lucide-react";
import { areaStatsApi, areaStatsCsv, MAX_AREA_VERTICES, timesFor } from "../../api/areaStats";
import type { AreaStats } from "../../api/areaStats";
import { ApiError, userMessage } from "../../api/httpClient";
import type { TimePoint } from "../../api/viewerAdapter";
import { formatDate, formatNumber, useLanguage } from "../../i18n";
import type { Lang, TKey } from "../../i18n";
import "../../i18n/viewer";
import { matchTime } from "./AiPanel";
import type { AreaShape, DrawKind } from "./areaDraw";

/** What can be measured: the source data, the AI result shown with it, or the shown dataset itself. */
export type AreaTarget = { key: string; label: string; datasetId: string; variables: string[]; variable: string; water: boolean };

const AREA_CODES: Record<string, TKey> = {
  GEOMETRY_INVALID: "viewer.stats.error.GEOMETRY_INVALID",
  GEOMETRY_TOO_LARGE: "viewer.stats.error.GEOMETRY_TOO_LARGE",
  GEOMETRY_OUTSIDE_DATA: "viewer.stats.error.GEOMETRY_OUTSIDE_DATA",
  TOO_MANY_TIMES: "viewer.stats.error.TOO_MANY_TIMES",
  XCUBE_UNAVAILABLE: "viewer.stats.error.XCUBE_UNAVAILABLE",
  TIME_NOT_FOUND: "viewer.stats.error.TIME_NOT_FOUND",
  INVALID_TIMES: "viewer.stats.error.INVALID_TIMES",
  VARIABLE_NOT_FOUND: "viewer.stats.error.VARIABLE_NOT_FOUND",
};
/** The endpoint's own codes in the screen language; anything else through the shared wording. */
export function areaErrorText(error: unknown, lang: Lang, t: (key: TKey, vars?: Record<string, string | number>) => string) {
  if (error instanceof ApiError && AREA_CODES[error.code]) return t(AREA_CODES[error.code], { max: MAX_AREA_VERTICES });
  return userMessage(error, lang);
}

export const km2 = (value: number | null | undefined, lang: Lang) =>
  value == null ? "—" : formatNumber(value, { maximumFractionDigits: value < 10 ? 3 : 2, minimumFractionDigits: value < 10 ? 2 : 1 }, lang);
const statValue = (value: number | null | undefined, lang: Lang) => (value == null ? "—" : formatNumber(value, { maximumSignificantDigits: 4 }, lang));
const percent = (ratio: number | null | undefined, lang: Lang) => (ratio == null ? "—" : `${formatNumber(ratio * 100, { maximumFractionDigits: 1, minimumFractionDigits: 1 }, lang)}%`);

function saveText(fileName: string, content: string) {
  const url = URL.createObjectURL?.(new Blob([content], { type: "text/csv;charset=utf-8" }));
  if (!url) return;
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function AreaStatsPanel({
  targets,
  times,
  currentIndex,
  onTimeIndex,
  shape,
  drawing,
  canDraw,
  onDraw,
  onCancelDraw,
  onUseView,
  onClear,
  fileBase,
}: {
  targets: AreaTarget[];
  times: TimePoint[];
  currentIndex: number;
  onTimeIndex: (index: number) => void;
  shape: AreaShape | null;
  drawing: DrawKind | null;
  canDraw: boolean;
  onDraw: (kind: DrawKind) => void;
  onCancelDraw: () => void;
  onUseView: () => void;
  onClear: () => void;
  /** Start of the CSV file name (the dataset name). */
  fileBase: string;
}) {
  const { lang, t } = useLanguage();
  const [targetKey, setTargetKey] = useState(targets[0]?.key ?? "");
  const target = targets.find((item) => item.key === targetKey) ?? targets[0];
  const [variable, setVariable] = useState(target?.variable ?? "");
  const [scope, setScope] = useState<"all" | "current">("all");
  const [result, setResult] = useState<AreaStats | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const runRef = useRef(0);
  useEffect(() => {
    if (!targets.some((item) => item.key === targetKey)) setTargetKey(targets[0]?.key ?? "");
  }, [targets, targetKey]);
  // A new target starts on its own measured variable (the shown band, or water_mask).
  const targetId = target?.key;
  const targetVariable = target?.variable;
  useEffect(() => {
    setVariable(targetVariable ?? "");
  }, [targetId, targetVariable]);
  // A new shape, target or variable makes an old answer wrong.
  useEffect(() => {
    runRef.current += 1;
    setResult(null);
    setFailure(null);
    setBusy(false);
  }, [shape, targetId, variable]);

  const isos = useMemo(() => times.map((time) => time.iso), [times]);
  const labelOf = (iso: string) => {
    const match = matchTime(isos, iso);
    return times.find((time) => time.iso === match)?.label ?? (Number.isFinite(Date.parse(iso)) ? formatDate(iso, {}, lang) : iso);
  };
  const tooMany = shape ? shape.vertices > MAX_AREA_VERTICES : false;
  const canRun = !!shape && !!target && !!variable && !busy && !tooMany && !drawing;

  const run = async () => {
    if (!shape || !target || !variable) return;
    const id = (runRef.current += 1);
    setBusy(true);
    setFailure(null);
    try {
      const current = times[currentIndex]?.iso;
      const answer = await areaStatsApi.get(target.datasetId, {
        geometry: shape.geometry,
        variable,
        times: scope === "current" && current ? [current] : timesFor(isos),
      });
      if (runRef.current === id) setResult(answer);
    } catch (cause) {
      if (runRef.current === id) setFailure(cause ?? new Error());
    } finally {
      if (runRef.current === id) setBusy(false);
    }
  };

  const water = !!result?.waterAreaKm2?.length;
  const currentIso = times[currentIndex]?.iso;
  const seriesIsos = (water ? result!.waterAreaKm2!.map((item) => item.time) : result?.series.map((item) => item.time)) ?? [];
  const at = matchTime(seriesIsos, currentIso);
  const point = result?.series.find((item) => item.time === at);
  const waterPoint = result?.waterAreaKm2?.find((item) => item.time === at);
  const chartPoints = useMemo(
    () =>
      !result
        ? []
        : water
          ? result.waterAreaKm2!.map((item) => ({ time: item.time, value: item.km2, extra: item.ratio }))
          : result.series.map((item) => ({ time: item.time, value: item.mean, low: item.min, high: item.max })),
    [result, water],
  );
  const units = result?.units && result.units !== "1" ? result.units : "";
  // Backoffice keeps the times that answered; a time the map server missed comes back empty with `error`.
  const failedTimes = result?.series.filter((item) => item.error).length ?? 0;

  const downloadCsv = () => {
    if (!result) return;
    const csv = areaStatsCsv(result, {
      time: t("viewer.stats.csv.time"),
      mean: t("viewer.stats.csv.mean"),
      min: t("viewer.stats.csv.min"),
      max: t("viewer.stats.csv.max"),
      std: t("viewer.stats.csv.std"),
      validCount: t("viewer.stats.csv.validCount"),
      validArea: t("viewer.stats.csv.validArea"),
      waterArea: t("viewer.stats.csv.waterArea"),
      waterRatio: t("viewer.stats.csv.waterRatio"),
    });
    const safe = lang === "ko" ? fileBase.replace(/[\\/:*?"<>|]+/g, "_") : fileBase.replace(/[^A-Za-z0-9.-]+/g, "_").replace(/^_+|_+$/g, "") || "dataset";
    saveText(`${safe}_${t("viewer.stats.csv.fileSuffix")}_${variable}.csv`, csv);
  };

  return (
    <div className="vx-stats">
      <section className="vx-section">
        <h3 className="vx-section__title">{t("viewer.stats.areaTitle")}</h3>
        <p className="vx-section__hint">{t("viewer.stats.areaHint")}</p>
        <div className="vx-drawbar" role="group" aria-label={t("viewer.stats.drawGroup")}>
          <button type="button" className="vx-btn vx-btn--line" aria-pressed={drawing === "polygon"} disabled={!canDraw} onClick={() => (drawing === "polygon" ? onCancelDraw() : onDraw("polygon"))}>
            <Pentagon size={16} aria-hidden="true" />
            {t("viewer.stats.polygon")}
          </button>
          <button type="button" className="vx-btn vx-btn--line" aria-pressed={drawing === "rect"} disabled={!canDraw} onClick={() => (drawing === "rect" ? onCancelDraw() : onDraw("rect"))}>
            <RectangleHorizontal size={16} aria-hidden="true" />
            {t("viewer.stats.rect")}
          </button>
          <button type="button" className="vx-btn vx-btn--line" disabled={!canDraw} onClick={onUseView} title={t("viewer.stats.viewTitle")}>
            <ScanLine size={16} aria-hidden="true" />
            {t("viewer.stats.view")}
          </button>
        </div>
        {drawing && (
          <p className="vx-note vx-note--mark" role="status">
            <span>{t(drawing === "polygon" ? "viewer.stats.drawingPolygon" : "viewer.stats.drawingRect")}</span>
            <button type="button" className="vx-btn vx-btn--quiet" onClick={onCancelDraw}>
              <X size={14} aria-hidden="true" />
              {t("viewer.stats.cancelDraw")}
            </button>
          </p>
        )}
        {shape && !drawing && (
          <div className="vx-shape">
            <i className="vx-shape__swatch" aria-hidden="true" />
            <span className="tabular">
              <strong>{t(`viewer.stats.shape.${shape.kind}`)}</strong>
              {t("viewer.stats.shapeArea", { area: km2(shape.areaKm2, lang) })}
            </span>
            <button type="button" className="vx-btn vx-btn--quiet" onClick={onClear}>
              <Trash2 size={14} aria-hidden="true" />
              {t("viewer.stats.clear")}
            </button>
          </div>
        )}
        {tooMany && <p className="vx-note vx-note--bad" role="alert">{t("viewer.stats.error.GEOMETRY_TOO_LARGE", { max: MAX_AREA_VERTICES })}</p>}
      </section>

      <section className="vx-section">
        <h3 className="vx-section__title">{t("viewer.stats.whatTitle")}</h3>
        {targets.length > 1 && (
          <div className="vx-seg vx-seg--fit" role="group" aria-label={t("viewer.stats.target")}>
            {targets.map((item) => (
              <button key={item.key} type="button" aria-pressed={item.key === target?.key} onClick={() => setTargetKey(item.key)}>
                {item.label}
              </button>
            ))}
          </div>
        )}
        {target && target.variables.length > 1 && (
          <label className="vx-field">
            <span>{t("viewer.stats.variable")}</span>
            <select value={variable} onChange={(event) => setVariable(event.target.value)}>
              {target.variables.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>
        )}
        {target?.water && <p className="vx-section__hint">{t("viewer.stats.waterHint")}</p>}
        <fieldset className="vx-field">
          <legend>{t("viewer.stats.times")}</legend>
          <div className="vx-seg vx-seg--fit">
            <button type="button" aria-pressed={scope === "all"} onClick={() => setScope("all")}>
              {t("viewer.stats.timesAll", { count: Math.min(times.length, 120) })}
            </button>
            <button type="button" aria-pressed={scope === "current"} onClick={() => setScope("current")}>
              {t("viewer.stats.timesCurrent")}
            </button>
          </div>
          {scope === "all" && times.length > 120 && <small className="vx-section__hint">{t("viewer.stats.timesCapped")}</small>}
        </fieldset>
        <button type="button" className="vx-btn vx-btn--ink vx-btn--block" disabled={!canRun} aria-describedby={!shape ? "vx-stats-need" : undefined} onClick={run}>
          {busy ? t("viewer.stats.running") : t("viewer.stats.run")}
        </button>
        {!shape && <small id="vx-stats-need" className="vx-section__hint">{t("viewer.stats.needShape")}</small>}
        {failure != null && <p className="vx-note vx-note--bad" role="alert">{areaErrorText(failure, lang, t)}</p>}
      </section>

      {result && (
        <section className="vx-section" aria-live="polite">
          <div className="vx-stats__head">
            <h3 className="vx-section__title">{t("viewer.stats.resultTitle", { variable: result.variable })}</h3>
            <button type="button" className="vx-btn vx-btn--line" onClick={downloadCsv}>
              <Download size={15} aria-hidden="true" />
              CSV
            </button>
          </div>
          <p className="vx-stats__at tabular">{at ? labelOf(at) : t("viewer.stats.notThisTime")}</p>
          {failedTimes > 0 && <p className="vx-note vx-note--warn" role="status">{t("viewer.stats.someFailed", { count: failedTimes })}</p>}
          {water ? (
            <dl className="vx-statgrid">
              <div className="is-lead">
                <dt>{t("viewer.stats.waterArea")}</dt>
                <dd className="tabular">{km2(waterPoint?.km2, lang)}<span> km²</span></dd>
              </div>
              <div>
                <dt>{t("viewer.stats.waterRatio")}</dt>
                <dd className="tabular">{percent(waterPoint?.ratio, lang)}</dd>
              </div>
              <div>
                <dt>{t("viewer.stats.shapeAreaLabel")}</dt>
                <dd className="tabular">{km2(result.areaKm2, lang)}<span> km²</span></dd>
              </div>
              <div>
                <dt>{t("viewer.stats.validArea")}</dt>
                <dd className="tabular">{km2(point?.validAreaKm2, lang)}<span> km²</span></dd>
              </div>
            </dl>
          ) : (
            <dl className="vx-statgrid">
              <div className="is-lead">
                <dt>{t("viewer.stats.mean")}</dt>
                <dd className="tabular">{statValue(point?.mean, lang)}{units && <span> {units}</span>}</dd>
              </div>
              <div>
                <dt>{t("viewer.stats.std")}</dt>
                <dd className="tabular">{statValue(point?.std, lang)}</dd>
              </div>
              <div>
                <dt>{t("viewer.stats.min")}</dt>
                <dd className="tabular">{statValue(point?.min, lang)}</dd>
              </div>
              <div>
                <dt>{t("viewer.stats.max")}</dt>
                <dd className="tabular">{statValue(point?.max, lang)}</dd>
              </div>
              <div>
                <dt>{t("viewer.stats.shapeAreaLabel")}</dt>
                <dd className="tabular">{km2(result.areaKm2, lang)}<span> km²</span></dd>
              </div>
              <div>
                <dt>{t("viewer.stats.validArea")}</dt>
                <dd className="tabular">{km2(point?.validAreaKm2, lang)}<span> km²</span></dd>
              </div>
            </dl>
          )}
          {chartPoints.length > 1 && (
            <AreaSeriesChart
              points={chartPoints}
              currentIso={at ?? undefined}
              labelOf={labelOf}
              water={water}
              units={water ? "km²" : units}
              onPick={(iso) => {
                const index = times.findIndex((time) => time.iso === matchTime(isos, iso));
                if (index >= 0) onTimeIndex(index);
              }}
            />
          )}
          <details className="vx-stats__table">
            <summary>{t("viewer.stats.table")}</summary>
            <div className="vx-stats__scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">{t("viewer.stats.csv.time")}</th>
                    {water ? (
                      <>
                        <th scope="col">{t("viewer.stats.waterArea")} (km²)</th>
                        <th scope="col">{t("viewer.stats.waterRatio")}</th>
                      </>
                    ) : (
                      <>
                        <th scope="col">{t("viewer.stats.mean")}</th>
                        <th scope="col">{t("viewer.stats.min")}</th>
                        <th scope="col">{t("viewer.stats.max")}</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {water
                    ? result.waterAreaKm2!.map((item) => (
                        <tr key={item.time} aria-current={item.time === at ? "true" : undefined}>
                          <th scope="row">{labelOf(item.time)}</th>
                          <td>{km2(item.km2, lang)}</td>
                          <td>{percent(item.ratio, lang)}</td>
                        </tr>
                      ))
                    : result.series.map((item) => (
                        <tr key={item.time} aria-current={item.time === at ? "true" : undefined}>
                          <th scope="row">{labelOf(item.time)}</th>
                          <td title={item.error ? t("viewer.stats.rowFailed") : undefined}>{item.error ? t("viewer.stats.rowFailed") : statValue(item.mean, lang)}</td>
                          <td>{statValue(item.min, lang)}</td>
                          <td>{statValue(item.max, lang)}</td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      )}
    </div>
  );
}

type ChartPoint = { time: string; value: number | null; low?: number | null; high?: number | null; extra?: number | null };

/** Room one date label takes on the time axis, and the space kept between labels. */
const LABEL_WIDTH = 80;
const LABEL_GAP = 8;

/** Rounded axis bounds and ticks (steps 1, 2, 2.5, 5 × 10^n), as the pixel graph. */
export function axisTicks(values: number[], zeroBased = false) {
  const finite = values.filter((value) => Number.isFinite(value));
  let rawMin = finite.length ? Math.min(...finite) : 0;
  const rawMax = finite.length ? Math.max(...finite) : 1;
  if (zeroBased) rawMin = Math.min(0, rawMin);
  const span = rawMax - rawMin || Math.max(Math.abs(rawMin) * 0.1, 1);
  const rough = span / 3;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 2.5, 5, 10].find((factor) => factor * magnitude >= rough) ?? 10) * magnitude;
  let min = Math.floor(rawMin / step) * step;
  let max = Math.ceil(rawMax / step) * step;
  if (min === max) {
    min -= step;
    max += step;
  }
  const ticks: number[] = [];
  for (let value = min; value <= max + step / 2; value += step) ticks.push(Number(value.toFixed(10)));
  return { min, max, ticks };
}

/**
 * One series over time in the panel's width: the mean as a 2px water line with the min–max range as a pale band,
 * or the water area for an AI result. The shown time is the overprint cursor (the user's time mark). Hover shows a
 * crosshair and the values; a click (or Enter on a point) moves the Viewer to that time.
 */
export function AreaSeriesChart({ points, currentIso, labelOf, water, units, onPick }: { points: ChartPoint[]; currentIso?: string; labelOf: (iso: string) => string; water: boolean; units?: string; onPick: (iso: string) => void }) {
  const { lang, t } = useLanguage();
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([item]) => item.contentRect.width > 0 && setWidth(Math.max(220, Math.round(item.contentRect.width))));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);
  const height = 168;
  const left = 44;
  const right = 10;
  const top = units ? 22 : 10;
  const bottom = 24;
  const values = points.flatMap((point) => [point.value, point.low, point.high]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const { min, max, ticks } = axisTicks(values, water);
  const x = (index: number) => left + (index * (width - left - right)) / Math.max(points.length - 1, 1);
  const y = (value: number) => top + ((max - value) / (max - min || 1)) * (height - top - bottom);
  const fmt = (value: number) => formatNumber(value, { maximumSignificantDigits: 3 }, lang);
  // Line and band break where a time has no value.
  const segments: number[][] = [];
  points.forEach((point, index) => {
    if (point.value == null) return;
    const last = segments[segments.length - 1];
    if (last && last[last.length - 1] === index - 1) last.push(index);
    else segments.push([index]);
  });
  const line = segments.map((segment) => segment.map((index, at) => `${at ? "L" : "M"}${x(index).toFixed(1)},${y(points[index].value!).toFixed(1)}`).join("")).join("");
  const band = water
    ? ""
    : segments
        .filter((segment) => segment.every((index) => points[index].low != null && points[index].high != null))
        .map((segment) => `M${segment.map((index) => `${x(index).toFixed(1)},${y(points[index].high!).toFixed(1)}`).join("L")}L${[...segment].reverse().map((index) => `${x(index).toFixed(1)},${y(points[index].low!).toFixed(1)}`).join("L")}Z`)
        .join("");
  const currentIndex = points.findIndex((point) => point.time === currentIso);
  const shown = hover ?? null;
  const hovered = shown != null ? points[shown] : null;
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor((width - left - right) / 88))));
  // Date labels never overlap: each label covers about LABEL_WIDTH px (start, middle or end anchored), the last date
  // is always shown, and an earlier one is kept only when it clears the previous label and the last one.
  const shownLabels = new Set<number>();
  if (points.length > 0) {
    const last = points.length - 1;
    const extent = (index: number): [number, number] =>
      index === 0 && last > 0 ? [x(0), x(0) + LABEL_WIDTH] : index === last ? [x(last) - LABEL_WIDTH, x(last)] : [x(index) - LABEL_WIDTH / 2, x(index) + LABEL_WIDTH / 2];
    const lastStart = extent(last)[0];
    let end = -Infinity;
    for (let index = 0; index < last; index += labelEvery) {
      const [from, to] = extent(index);
      if (from >= end + LABEL_GAP && to + LABEL_GAP <= lastStart) {
        shownLabels.add(index);
        end = to;
      }
    }
    shownLabels.add(last);
  }
  const valid = points.filter((point) => point.value != null).length;
  const summary = t(water ? "viewer.stats.chartWater" : "viewer.stats.chartMean", { count: points.length, valid, min: fmt(min), max: fmt(max) });

  const nearest = (clientX: number) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box || points.length === 0) return null;
    const px = clientX - box.left;
    const index = Math.round(((px - left) / Math.max(width - left - right, 1)) * (points.length - 1));
    return Math.min(points.length - 1, Math.max(0, index));
  };

  return (
    <div className="vx-schart" ref={boxRef} onMouseLeave={() => setHover(null)}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={summary}
        onMouseMove={(event) => setHover(nearest(event.clientX))}
        onClick={(event) => {
          const index = nearest(event.clientX);
          if (index != null) onPick(points[index].time);
        }}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line className="vx-schart__grid" x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} />
            <text className="vx-schart__axis" x={left - 6} y={y(tick) + 4} textAnchor="end">{fmt(tick)}</text>
          </g>
        ))}
        {units && <text className="vx-schart__axis" x={left - 6} y={10} textAnchor="end">{units}</text>}
        {points.map((point, index) =>
          shownLabels.has(index) ? (
            <text key={point.time} className="vx-schart__axis" x={x(index)} y={height - 6} textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}>
              {labelOf(point.time)}
            </text>
          ) : null,
        )}
        {band && <path className="vx-schart__band" d={band} />}
        <path className={`vx-schart__line ${water ? "is-water" : ""}`} d={line} />
        {points.map((point, index) =>
          point.value == null ? (
            <circle key={point.time} className="vx-schart__missing" cx={x(index)} cy={height - bottom} r={3} />
          ) : (
            <circle key={point.time} className={`vx-schart__point ${water ? "is-water" : ""}`} cx={x(index)} cy={y(point.value)} r={4} />
          ),
        )}
        {currentIndex >= 0 && (
          <g>
            <line className="vx-schart__cursor" x1={x(currentIndex)} x2={x(currentIndex)} y1={top} y2={height - bottom} />
            {points[currentIndex].value != null && <circle className="vx-schart__current" cx={x(currentIndex)} cy={y(points[currentIndex].value!)} r={5} />}
          </g>
        )}
        {shown != null && <line className="vx-schart__hover" x1={x(shown)} x2={x(shown)} y1={top} y2={height - bottom} />}
      </svg>
      {hovered && shown != null && (
        <div className="vx-schart__tip tabular" style={{ left: Math.min(Math.max(x(shown), 70), width - 70) }} role="presentation">
          <strong>{labelOf(hovered.time)}</strong>
          {hovered.value == null ? (
            <span>{t("viewer.stats.noValue")}</span>
          ) : water ? (
            <span>{`${km2(hovered.value, lang)} km² · ${percent(hovered.extra, lang)}`}</span>
          ) : (
            <>
              <span>{`${t("viewer.stats.mean")} ${statValue(hovered.value, lang)}`}</span>
              {hovered.low != null && hovered.high != null && <span>{`${statValue(hovered.low, lang)} – ${statValue(hovered.high, lang)}`}</span>}
            </>
          )}
        </div>
      )}
      {!water && <p className="vx-schart__key"><i aria-hidden="true" />{t("viewer.stats.keyMean")}<i className="is-band" aria-hidden="true" />{t("viewer.stats.keyRange")}</p>}
    </div>
  );
}
