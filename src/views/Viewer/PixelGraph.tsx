// Pixel marker on the map and the bottom time-series panel for the selected pixel.
import { useEffect, useRef, useState } from "react";
import Map from "ol/Map";
import { ChevronDown, ChevronUp, Crosshair } from "lucide-react";
import { ZarrDataset } from "../../api/viewerAdapter";
import { PLOT_INSET } from "./TimeStaff";
import { SeriesPoint } from "../../api/backofficeApi";
import { formatNumber, useLanguage, useT } from "../../i18n";
import "../../i18n/viewer";

export function PixelMarker({
  map,
  coordinate,
}: {
  map: Map | null;
  coordinate: [number, number];
}) {
  const t = useT();
  const [position, setPosition] = useState<[number, number] | null>(null);
  useEffect(() => {
    if (!map || typeof map.getPixelFromCoordinate !== "function") return;
    const update = () => {
      const pixel = map.getPixelFromCoordinate(coordinate);
      setPosition(pixel ? [pixel[0], pixel[1]] : null);
    };
    update();
    map.on("postrender", update);
    map.on("moveend", update);
    return () => {
      map.un("postrender", update);
      map.un("moveend", update);
    };
  }, [map, coordinate]);
  if (!position) return null;
  return (
    <div
      className="pixel-marker"
      style={{ left: position[0], top: position[1] }}
      aria-label={t("viewer.pixel.marker")}
    />
  );
}

const VALUE_FORMAT: Intl.NumberFormatOptions = { maximumFractionDigits: 4 };

/** Index of the point at, or nearest to, the given time. */
export function nearestIndex(points: SeriesPoint[], currentTime?: string) {
  if (!currentTime || !points.length) return 0;
  const exact = points.findIndex((point) => point.time === currentTime);
  if (exact >= 0) return exact;
  const target = new Date(currentTime).getTime();
  let best = 0;
  if (Number.isFinite(target))
    points.forEach((point, index) => {
      const candidate = new Date(point.time).getTime();
      const bestTime = new Date(points[best]?.time).getTime();
      if (
        Number.isFinite(candidate) &&
        (!Number.isFinite(bestTime) || Math.abs(candidate - target) < Math.abs(bestTime - target))
      )
        best = index;
    });
  return best;
}

/**
 * The pixel reading in the bottom dock: where it is (record), the full series on the
 * shared time axis (plot) and the value at the shown time (tail).
 */
export function BottomGraphPanel({
  expanded,
  onToggle,
  dataset,
  variable,
  points,
  coordinate,
  currentTime,
  currentLabel,
  timeCount,
  compareTime,
  compareLabel,
  announce = true,
}: {
  expanded: boolean;
  onToggle: () => void;
  dataset: ZarrDataset;
  variable: string;
  points: SeriesPoint[];
  coordinate: { lon: number; lat: number } | null;
  currentTime?: string;
  /** Label of the shown time, as on the time staff. */
  currentLabel?: string;
  /** Number of times on the staff; the chart hides its own dates when it matches. */
  timeCount?: number;
  /** Time B while comparing: the tail then shows A, B and the change. */
  compareTime?: string;
  compareLabel?: string;
  /** Read the value line aloud when it changes; off during playback so it is not re-read every step. */
  announce?: boolean;
}) {
  const { lang, t } = useLanguage();
  const numberFormat = { format: (value: number) => formatNumber(value, VALUE_FORMAT, lang) };
  const units = dataset.variableMetadata?.[variable]?.units;
  const label = t(expanded ? "viewer.pixel.hide" : "viewer.pixel.show");
  // The series may omit times without a valid value, so the nearest point only counts when it is
  // the same observation (within an hour); otherwise that time has no value here.
  const valueAt = (time?: string) => {
    const point = points.length ? points[nearestIndex(points, time)] : undefined;
    if (!point || typeof point.value !== "number" || !Number.isFinite(point.value)) return null;
    if (time && point.time !== time) {
      const gap = Math.abs(new Date(point.time).getTime() - new Date(time).getTime());
      if (!Number.isFinite(gap) || gap > 60 * 60 * 1000) return null;
    }
    return point.value;
  };
  const a = valueAt(currentTime);
  const b = compareTime ? valueAt(compareTime) : null;
  const unitText = units && units !== "1" ? units : "";
  // Change reads in time order (earlier → later), whichever of A/B is earlier.
  const aFirst =
    !compareTime || !currentTime || new Date(currentTime).getTime() <= new Date(compareTime).getTime();
  const [from, to] = aFirst ? [a, b] : [b, a];
  const change =
    compareTime && from != null && to != null
      ? {
          delta: to - from,
          percent: from !== 0 ? ((to - from) / Math.abs(from)) * 100 : null,
        }
      : null;
  const valueText = (value: number | null) => (value != null ? `${numberFormat.format(value)}${unitText ? ` ${unitText}` : ""}` : t("viewer.pixel.noValue"));
  // One short sentence for screen readers instead of the whole panel (coordinates, chart, A/B table).
  const status = !points.length
    ? ""
    : compareTime
      ? `A ${currentLabel ?? ""} ${valueText(a)}, B ${compareLabel ?? ""} ${valueText(b)}`
      : t("viewer.pixel.status", { time: currentLabel ?? t("viewer.pixel.currentTime"), variable, value: valueText(a) });
  return (
    <section
      className={`vx-graph ${expanded ? "expanded" : "hidden"}`}
      aria-label={t("viewer.pixel.panel")}
    >
      <p className="vx-sr" role="status" aria-live="polite">
        {announce ? status : ""}
      </p>
      <div className="vx-reading">
        <span className="vx-reading__title">
          <Crosshair size={14} aria-hidden="true" />
          <strong>{t("viewer.pixel.title")}</strong>
          {variable && <b className="vx-reading__var">{variable}</b>}
        </span>
        {coordinate && (
          <dl className="vx-reading__coords tabular">
            <div>
              <dt>{t("viewer.pixel.lat")}</dt>
              <dd>{coordinate.lat.toFixed(5)}°</dd>
            </div>
            <div>
              <dt>{t("viewer.pixel.lon")}</dt>
              <dd>{coordinate.lon.toFixed(5)}°</dd>
            </div>
          </dl>
        )}
      </div>
      <div className="vx-graph__chart">
        {expanded && (
          <TimeseriesChart
            dataset={dataset.name}
            variable={variable}
            units={units}
            points={points}
            coordinate={coordinate}
            currentTime={currentTime}
            showDates={timeCount !== points.length}
          />
        )}
      </div>
      <div className="vx-reading__tail">
        {expanded && !compareTime && (
          <div className="vx-reading__value">
            <small className="tabular">{currentLabel ? t("viewer.pixel.valueAt", { time: currentLabel }) : t("viewer.pixel.valueNow")}</small>
            {a != null ? (
              <strong className="tabular">
                {numberFormat.format(a)}
                {unitText && <span>{unitText}</span>}
              </strong>
            ) : (
              <em>{t("viewer.pixel.noValueHere")}</em>
            )}
          </div>
        )}
        {expanded && compareTime && (
          <dl className="vx-reading__compare tabular">
            <div>
              <dt>
                <b className="vx-flag" aria-hidden="true">A</b>
                {currentLabel}
              </dt>
              <dd>{a != null ? numberFormat.format(a) : t("viewer.pixel.noValue")}</dd>
            </div>
            <div>
              <dt>
                <b className="vx-flag vx-flag--b" aria-hidden="true">B</b>
                {compareLabel}
              </dt>
              <dd>{b != null ? numberFormat.format(b) : t("viewer.pixel.noValue")}</dd>
            </div>
            <div className="vx-reading__change">
              <dt>{t(aFirst ? "viewer.pixel.changeAB" : "viewer.pixel.changeBA")}</dt>
              <dd>
                {change
                  ? `${change.delta > 0 ? "+" : ""}${numberFormat.format(change.delta)}${
                      change.percent != null
                        ? ` (${change.percent > 0 ? "+" : ""}${change.percent.toFixed(1)}%)`
                        : ""
                    }`
                  : "—"}
                {change && unitText && <span>{unitText}</span>}
              </dd>
            </div>
          </dl>
        )}
        <button
          type="button"
          className="vx-icon-btn"
          onClick={onToggle}
          aria-label={label}
          title={label}
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown size={18} aria-hidden="true" />
          ) : (
            <ChevronUp size={18} aria-hidden="true" />
          )}
        </button>
      </div>
    </section>
  );
}

export function TimeseriesChart({
  dataset,
  variable,
  units,
  points,
  coordinate,
  currentTime,
  showDates = true,
}: {
  dataset: string;
  variable: string;
  units?: string;
  points: SeriesPoint[];
  coordinate: { lon: number; lat: number } | null;
  currentTime?: string;
  /** Draw dates under the plot; off when the time staff below already labels the same axis. */
  showDates?: boolean;
}) {
  const { lang, t } = useLanguage();
  // Draw in the container's own pixel size so the chart fills the panel without
  // stretching text; 900x260 is the fallback where ResizeObserver is unavailable.
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 900, height: 260 });
  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry.contentRect;
      if (w > 0 && h > 0)
        setSize({ width: Math.max(320, Math.round(w)), height: Math.max(140, Math.round(h)) });
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, []);
  const { width, height } = size;
  const { left, right } = PLOT_INSET;
  const top = 12;
  const bottom = showDates ? 30 : 10;
  const valid = points.filter(
    (point) => typeof point.value === "number" && Number.isFinite(point.value),
  );
  const rawMin = valid.length
    ? Math.min(...valid.map((point) => point.value as number))
    : 0;
  const rawMax = valid.length
    ? Math.max(...valid.map((point) => point.value as number))
    : 1;
  // Round axis steps (1, 2, 2.5, 5 × 10^n) so the ticks read as plain numbers.
  const span = rawMax - rawMin || Math.max(Math.abs(rawMin) * 0.1, 1);
  const rough = span / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 2.5, 5, 10].find((factor) => factor * magnitude >= rough) ?? 10) * magnitude;
  let min = Math.floor(rawMin / step) * step;
  let max = Math.ceil(rawMax / step) * step;
  if (min === max) {
    min -= step;
    max += step;
  }
  const x = (index: number) =>
    left + (index * (width - left - right)) / Math.max(points.length - 1, 1);
  const y = (value: number) =>
    top + ((max - value) * (height - top - bottom)) / (max - min);
  const segments: string[] = [];
  let segment = "";
  points.forEach((point, index) => {
    if (point.value == null || !Number.isFinite(point.value)) {
      if (segment) segments.push(segment);
      segment = "";
      return;
    }
    segment += `${segment ? " L" : "M"}${x(index)} ${y(point.value)}`;
  });
  if (segment) segments.push(segment);
  const currentIndex = nearestIndex(points, currentTime);
  const tickIndexes = Array.from(
    new Set(
      [0, 0.25, 0.5, 0.75, 1].map((ratio) =>
        Math.round(Math.max(0, points.length - 1) * ratio),
      ),
    ),
  );
  const unit = units ?? "";
  const dateLabel = (time: string) => {
    const date = new Date(time);
    return Number.isNaN(date.getTime())
      ? time
      : `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };
  const current = points[currentIndex];
  const coordinateLabel = coordinate
    ? t("viewer.pixel.coords", { lon: coordinate.lon.toFixed(5), lat: coordinate.lat.toFixed(5) })
    : "EPSG:4326";
  const yTicks: number[] = [];
  if (valid.length)
    for (let value = min; value <= max + step / 2; value += step)
      yTicks.push(Number(value.toFixed(10)));
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + (step / magnitude === 2.5 ? 1 : 0));
  return (
    <div className="professional-chart" ref={boxRef}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={t("viewer.pixel.chart", { dataset, variable, coords: coordinateLabel, min: rawMin, max: rawMax, valid: valid.length })}
      >
        <title>
          {dataset} · {variable} · {coordinateLabel}
        </title>
        <desc>
          {t("viewer.pixel.desc", { total: points.length, valid: valid.length })}{unit && t("viewer.pixel.unit", { unit })}
        </desc>
        {yTicks.map((value) => (
          <g key={value}>
            <line
              className="grid"
              x1={left}
              y1={y(value)}
              x2={width - right}
              y2={y(value)}
            />
            <text
              className="axis-label"
              x={left - 5}
              y={y(value) + 3}
              textAnchor="end"
            >
              {formatNumber(value, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }, lang)}
            </text>
          </g>
        ))}
        {valid.length > 0 && min < 0 && max > 0 && (
          <line
            className="zero-line"
            x1={left}
            y1={y(0)}
            x2={width - right}
            y2={y(0)}
          />
        )}
        {segments.map((path, index) => (
          <path key={index} className="line" d={path} />
        ))}
        {points.map((point, index) =>
          point.value == null || !Number.isFinite(point.value) ? (
            <circle
              key={index}
              className="missing-point"
              cx={x(index)}
              cy={height - bottom - 4}
              r="3"
            >
              <title>{t("viewer.pixel.missingPoint", { time: point.time })}</title>
            </circle>
          ) : (
            <circle
              key={index}
              className="data-point"
              cx={x(index)}
              cy={y(point.value)}
              r="3.5"
            >
              <title>
                {point.time} · {variable}: {point.value} {unit} ·{" "}
                {coordinateLabel}
              </title>
            </circle>
          ),
        )}
        {showDates && tickIndexes.map(
          (index) =>
            points[index] && (
              <text
                key={index}
                className="axis-label"
                x={x(index)}
                y={height - 5}
                textAnchor={
                  index === 0
                    ? "start"
                    : index === points.length - 1
                      ? "end"
                      : "middle"
                }
              >
                {dateLabel(points[index].time)}
              </text>
            ),
        )}
        {current && (
          <g className="current-time">
            <line
              className="cursor"
              x1={x(currentIndex)}
              y1={top}
              x2={x(currentIndex)}
              y2={height - bottom}
            />
            {current.value != null && Number.isFinite(current.value) && (
              <circle
                className="current-point"
                cx={x(currentIndex)}
                cy={y(current.value)}
                r="5"
              >
                <title>
                  {current.time}: {current.value} {unit}
                </title>
              </circle>
            )}
          </g>
        )}
      </svg>
      {!valid.length && (
        <div className="chart-empty">
          {t("viewer.pixel.empty")}
        </div>
      )}
    </div>
  );
}
