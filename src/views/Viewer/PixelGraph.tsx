// Pixel marker on the map and the bottom time-series panel for the selected pixel.
import { useEffect, useRef, useState } from "react";
import Map from "ol/Map";
import { ChevronDown, ChevronUp, Crosshair } from "lucide-react";
import { ZarrDataset } from "../../api/viewerAdapter";
import { SeriesPoint } from "../../api/backofficeApi";

export function PixelMarker({
  map,
  coordinate,
}: {
  map: Map | null;
  coordinate: [number, number];
}) {
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
      aria-label="선택한 픽셀 위치"
    />
  );
}

export function BottomGraphPanel({
  expanded,
  onToggle,
  dataset,
  variable,
  points,
  coordinate,
  currentTime,
}: {
  expanded: boolean;
  onToggle: () => void;
  dataset: ZarrDataset;
  variable: string;
  points: SeriesPoint[];
  coordinate: { lon: number; lat: number } | null;
  currentTime?: string;
}) {
  const units = dataset.variableMetadata?.[variable]?.units;
  const label = expanded
    ? "픽셀 그래프 아래로 숨기기"
    : "픽셀 그래프 위로 펼치기";
  return (
    <section
      className={`vx-graph ${expanded ? "expanded" : "hidden"}`}
      aria-label="픽셀 시계열 그래프 패널"
      aria-live="polite"
    >
      <div className="vx-graph__head">
        <span className="vx-graph__title">
          <Crosshair size={14} aria-hidden="true" />
          <strong>픽셀 시계열</strong>
          {coordinate && (
            <small className="tabular">
              {coordinate.lon.toFixed(5)}, {coordinate.lat.toFixed(5)}
            </small>
          )}
          {variable && <b>{variable}</b>}
        </span>
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
      {expanded && (
        <section className="vx-graph__chart">
          <TimeseriesChart
            dataset={dataset.name}
            variable={variable}
            units={units}
            points={points}
            coordinate={coordinate}
            currentTime={currentTime}
          />
        </section>
      )}
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
}: {
  dataset: string;
  variable: string;
  units?: string;
  points: SeriesPoint[];
  coordinate: { lon: number; lat: number } | null;
  currentTime?: string;
}) {
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
  const left = 56;
  const right = 16;
  const top = 12;
  const bottom = 36;
  const valid = points.filter(
    (point) => typeof point.value === "number" && Number.isFinite(point.value),
  );
  const rawMin = valid.length
    ? Math.min(...valid.map((point) => point.value as number))
    : 0;
  const rawMax = valid.length
    ? Math.max(...valid.map((point) => point.value as number))
    : 1;
  const padding =
    rawMin === rawMax
      ? Math.max(Math.abs(rawMin) * 0.05, 1)
      : (rawMax - rawMin) * 0.05;
  const min = rawMin - padding;
  const max = rawMax + padding;
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
  const exactIndex = currentTime
    ? points.findIndex((point) => point.time === currentTime)
    : -1;
  const target = currentTime ? new Date(currentTime).getTime() : NaN;
  let currentIndex = exactIndex >= 0 ? exactIndex : 0;
  if (exactIndex < 0 && Number.isFinite(target))
    points.forEach((point, index) => {
      const candidate = new Date(point.time).getTime();
      const currentCandidate = new Date(points[currentIndex]?.time).getTime();
      if (
        Number.isFinite(candidate) &&
        (!Number.isFinite(currentCandidate) ||
          Math.abs(candidate - target) < Math.abs(currentCandidate - target))
      )
        currentIndex = index;
    });
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
    ? `EPSG:4326 · 경도 ${coordinate.lon.toFixed(5)}° · 위도 ${coordinate.lat.toFixed(5)}°`
    : "EPSG:4326";
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(
    (ratio) => min + (max - min) * ratio,
  );
  return (
    <div className="professional-chart" ref={boxRef}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${dataset} ${variable} 시계열 그래프, ${coordinateLabel}, 최소 ${rawMin}, 최대 ${rawMax}, 유효 ${valid.length}개`}
      >
        <title>
          {dataset} · {variable} · {coordinateLabel}
        </title>
        <desc>
          전체 {points.length}시점 중 유효 {valid.length}시점.{unit && ` 단위 ${unit}.`}
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
              {value.toFixed(Math.abs(value) < 10 ? 2 : 1)}
            </text>
          </g>
        ))}
        {min < 0 && max > 0 && (
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
              cy={(top + height - bottom) / 2}
              r="3"
            >
              <title>{point.time}: 값 없음</title>
            </circle>
          ) : (
            <circle
              key={index}
              className="data-point"
              cx={x(index)}
              cy={y(point.value)}
              r="2"
            >
              <title>
                {point.time} · {variable}: {point.value} {unit} ·{" "}
                {coordinateLabel}
              </title>
            </circle>
          ),
        )}
        {tickIndexes.map(
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
                r="6"
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
          선택한 위치에 유효한 픽셀값이 없습니다.
        </div>
      )}
    </div>
  );
}
