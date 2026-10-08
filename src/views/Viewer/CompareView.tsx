// Comparison on the map. The compare target is either another time (M5: time A against time B) or the
// AI result of the same time (M7: 원본 ↔ AI 결과).
//  - swipe: B (or the AI result) is drawn over A on the same map and clipped to the right of a draggable divider;
//  - split: a second map shares the same View and shows B (or the original with the AI result) next to A.
import { ReactNode, useEffect, useRef, useState } from "react";
import type Map from "ol/Map";
import type TileLayer from "ol/layer/Tile";
import type RenderEvent from "ol/render/Event";
import OlMap from "../../components/map";
import addDynamicXcubeLayer from "../../components/xcubeLayer";
import { FRAME_SAFETY_MS, watchTileLayerReady } from "../../components/xcubeLayer/tileReady";
import { ChevronDown, Columns2, GripVertical, Square, SplitSquareHorizontal } from "lucide-react";

export type DisplayMode = "single" | "swipe" | "split";
/** What the right side shows while comparing: another time, or the AI result at the same time. */
export type CompareTarget = "time" | "ai";
export const DISPLAY_MODES: Array<{ value: DisplayMode; label: string }> = [
  { value: "single", label: "단일" },
  { value: "swipe", label: "스와이프" },
  { value: "split", label: "나란히" },
];
const ICON = { single: Square, swipe: SplitSquareHorizontal, split: Columns2 };

/** CSS pixel on the map → pixel on the layer canvas (same as ol/render getRenderPixel). */
function renderPixel(event: RenderEvent, [x, y]: number[]) {
  const t = event.inversePixelTransform ?? [1, 0, 0, 1, 0, 0];
  return [t[0] * x + t[2] * y + t[4], t[1] * x + t[3] * y + t[5]];
}

/**
 * Adds the xcube tile layer for time B to {@code map}. With {@code swipeRef} the layer is clipped to the
 * part right of the divider (percentage of the map width).
 */
export function useCompareLayer({
  map,
  tileUrl,
  bbox,
  visible,
  opacity,
  swipeRef,
  zIndex = 5,
}: {
  map: Map | null;
  tileUrl: string | null;
  bbox?: [number, number, number, number];
  visible: boolean;
  opacity: number;
  swipeRef?: React.MutableRefObject<number>;
  /** Stacking order; AI result layers sit above the original and time-B layers. */
  zIndex?: number;
}) {
  const layerRef = useRef<TileLayer<any> | null>(null);
  // FR-VIEW-12: the previous (fully drawn) layer stays until the new one has loaded; at most one waits.
  const retiringRef = useRef<(() => void) | null>(null);
  const bboxKey = bbox?.join(",");
  const releaseRetiring = () => {
    const release = retiringRef.current;
    retiringRef.current = null;
    release?.();
  };
  useEffect(() => releaseRetiring, []);
  useEffect(() => {
    if (!map || !tileUrl) {
      releaseRetiring();
      return;
    }
    let cancelled = false;
    let ready = false;
    let stopWatch: (() => void) | undefined;
    let layer: TileLayer<any> | null = null;
    const clip = (event: RenderEvent) => {
      const ctx = event.context as CanvasRenderingContext2D | undefined;
      const size = map.getSize();
      if (!ctx || !size || !swipeRef) return;
      const x = (size[0] * swipeRef.current) / 100;
      const tl = renderPixel(event, [x, 0]);
      const tr = renderPixel(event, [size[0], 0]);
      const bl = renderPixel(event, [x, size[1]]);
      const br = renderPixel(event, size);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(tl[0], tl[1]);
      ctx.lineTo(bl[0], bl[1]);
      ctx.lineTo(br[0], br[1]);
      ctx.lineTo(tr[0], tr[1]);
      ctx.closePath();
      ctx.clip();
    };
    const restore = (event: RenderEvent) =>
      (event.context as CanvasRenderingContext2D | undefined)?.restore();
    const remove = (target: TileLayer<any>) => {
      target.un("prerender", clip);
      target.un("postrender", restore);
      target.get("cleanup")?.();
      map.removeLayer(target);
    };
    addDynamicXcubeLayer({
      map,
      tileUrl,
      bbox: bboxKey ? (bboxKey.split(",").map(Number) as [number, number, number, number]) : undefined,
      onError: () => undefined,
    })
      .then((created) => {
        if (!created) return releaseRetiring();
        if (cancelled) {
          created.get("cleanup")?.();
          map.removeLayer(created);
          return;
        }
        layer = created;
        layerRef.current = created;
        // Keep B above A even when A was added later.
        created.setZIndex(zIndex);
        if (swipeRef) {
          created.on("prerender", clip);
          created.on("postrender", restore);
        }
        stopWatch = watchTileLayerReady(map, created, () => {
          ready = true;
          releaseRetiring();
        });
      })
      .catch(() => releaseRetiring());
    return () => {
      cancelled = true;
      stopWatch?.();
      if (!layer) return;
      const old = layer;
      if (layerRef.current === old) layerRef.current = null;
      if (!ready) return remove(old);
      // Drawn: keep it on screen until the next layer is ready (or the safety timeout).
      releaseRetiring();
      const timer = setTimeout(releaseRetiring, FRAME_SAFETY_MS);
      retiringRef.current = () => {
        clearTimeout(timer);
        remove(old);
      };
    };
  }, [map, tileUrl, bboxKey, swipeRef, zIndex]);
  useEffect(() => {
    layerRef.current?.setVisible(visible);
    layerRef.current?.setOpacity(opacity / 100);
  });
  return layerRef;
}

/** Draggable vertical divider for the swipe mode; arrow keys move it by 5 %. */
export function SwipeDivider({
  value,
  onChange,
  leftLabel,
  rightLabel,
  target = "time",
}: {
  value: number;
  onChange: (value: number) => void;
  leftLabel: string;
  rightLabel: string;
  target?: CompareTarget;
}) {
  const ai = target === "ai";
  const rootRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const move = (clientX: number) => {
    const box = rootRef.current?.getBoundingClientRect();
    if (!box || !box.width) return;
    onChange(Math.min(98, Math.max(2, ((clientX - box.left) / box.width) * 100)));
  };
  return (
    <div className={`vx-swipe ${dragging ? "is-dragging" : ""}`} ref={rootRef}>
      {ai ? (
        <>
          <span className="vx-maplabel vx-maplabel--a">
            <i className="vx-swatch vx-swatch--source" aria-hidden="true" />
            <span>원본 <span className="tabular">{leftLabel}</span></span>
          </span>
          <span className="vx-maplabel vx-maplabel--b">
            <i className="vx-hatch" aria-hidden="true" />
            <span>AI 결과 <span className="tabular">{rightLabel}</span></span>
          </span>
        </>
      ) : (
        <>
          <span className="vx-maplabel vx-maplabel--a">
            <b className="vx-flag">A</b>
            <span className="tabular">{leftLabel}</span>
          </span>
          <span className="vx-maplabel vx-maplabel--b">
            <b className="vx-flag vx-flag--b">B</b>
            <span className="tabular">{rightLabel}</span>
          </span>
        </>
      )}
      <div className="vx-swipe__line" style={{ left: `${value}%` }}>
        <button
          type="button"
          className="vx-swipe__handle"
          role="slider"
          aria-label="스와이프 구분선"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(value)}
          aria-valuetext={
            ai
              ? `왼쪽 원본 ${Math.round(value)}%, 오른쪽 AI 결과 ${100 - Math.round(value)}%`
              : `왼쪽 A ${Math.round(value)}%, 오른쪽 B ${100 - Math.round(value)}%`
          }
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture?.(event.pointerId);
            setDragging(true);
          }}
          onPointerMove={(event) => dragging && move(event.clientX)}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              event.stopPropagation();
              onChange(Math.min(98, Math.max(2, value + (event.key === "ArrowRight" ? 5 : -5))));
            }
          }}
        >
          <GripVertical size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/** Second map for the split mode. It shares the main map's View so pan and zoom stay in sync. */
export function CompareMap({
  mainMap,
  baseVisible,
  onMapReady,
  label,
  target = "time",
  children,
}: {
  mainMap: Map | null;
  baseVisible: boolean;
  onMapReady: (map: Map | null) => void;
  label: string;
  target?: CompareTarget;
  /** Drawn over the second map (the demo result hatch). */
  children?: ReactNode;
}) {
  const [own, setOwn] = useState<Map | null>(null);
  useEffect(() => {
    if (!own || !mainMap) return;
    own.setView(mainMap.getView());
    onMapReady(own);
    mainMap.updateSize();
    return () => onMapReady(null);
  }, [own, mainMap, onMapReady]);
  useEffect(() => {
    // The main map is half as wide while this one is shown.
    return () => {
      window.setTimeout(() => mainMap?.updateSize(), 0);
    };
  }, [mainMap]);
  return (
    <div
      className="vx-compare-map"
      aria-label={target === "ai" ? `비교 지도 · 원본과 AI 결과 · ${label}` : `비교 지도 B · ${label}`}
      role="region"
    >
      <OlMap onMapReady={setOwn} baseVisible={baseVisible} />
      {children}
      <span className="vx-maplabel vx-maplabel--b">
        {target === "ai" ? (
          <>
            <i className="vx-hatch" aria-hidden="true" />
            <span>원본 + AI 결과 <span className="tabular">{label}</span></span>
          </>
        ) : (
          <>
            <b className="vx-flag vx-flag--b">B</b>
            <span className="tabular">{label}</span>
          </>
        )}
      </span>
    </div>
  );
}

/** Display-mode switch (single / swipe / side by side), set at the end of the time staff. */
export function CompareModes({
  mode,
  onMode,
  disabled,
}: {
  mode: DisplayMode;
  onMode: (mode: DisplayMode) => void;
  disabled: boolean;
}) {
  return (
    <div className="vx-modes" role="group" aria-label="표시 방식" data-tour="compare">
      {DISPLAY_MODES.map(({ value, label }) => {
        const Icon = ICON[value];
        return (
          <button
            type="button"
            key={value}
            aria-pressed={mode === value}
            disabled={disabled && value !== "single"}
            onClick={() => onMode(value)}
            title={value === "single" ? "단일 표시" : `${label} 비교`}
          >
            <Icon size={15} aria-hidden="true" />
            <span className="vx-modes__label">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Time B picker. A is always the timeline's current time. */
export function CompareTime({
  times,
  compareIndex,
  onCompareIndex,
}: {
  times: Array<{ iso: string; label: string }>;
  compareIndex: number;
  onCompareIndex: (index: number) => void;
}) {
  return (
    <label className="vx-btime">
      <b className="vx-flag vx-flag--b" aria-hidden="true">B</b>
      <select
        aria-label="비교 시점 B"
        className="tabular"
        value={compareIndex}
        onChange={(event) => onCompareIndex(Number(event.target.value))}
      >
        {times.map((time, index) => (
          <option key={time.iso} value={index}>
            {time.label}
          </option>
        ))}
      </select>
      <ChevronDown size={14} aria-hidden="true" />
    </label>
  );
}

/** 비교 대상: another time or the AI result of the same time. Floats over the map while comparing. */
export function CompareTargetSwitch({
  value,
  onChange,
  aiAvailable,
}: {
  value: CompareTarget;
  onChange: (value: CompareTarget) => void;
  aiAvailable: boolean;
}) {
  return (
    <div className="vx-cmp-target" role="group" aria-label="비교 대상">
      <span className="vx-cmp-target__label" aria-hidden="true">비교 대상</span>
      <div className="vx-seg vx-seg--2">
        <button type="button" aria-pressed={value === "time"} onClick={() => onChange("time")}>
          시점
        </button>
        <button
          type="button"
          aria-pressed={value === "ai"}
          disabled={!aiAvailable}
          title={aiAvailable ? "같은 시점의 원본과 AI 결과를 비교" : "이 데이터에는 아직 AI 결과가 없습니다"}
          onClick={() => onChange("ai")}
        >
          AI 결과
        </button>
      </div>
    </div>
  );
}
