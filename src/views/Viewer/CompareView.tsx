// Time comparison on the map (M5): the timeline time A against a chosen time B.
//  - swipe: B is drawn over A on the same map and clipped to the right of a draggable divider;
//  - split: a second map shares the same View and shows B next to A.
import { useEffect, useRef, useState } from "react";
import type Map from "ol/Map";
import type TileLayer from "ol/layer/Tile";
import type RenderEvent from "ol/render/Event";
import OlMap from "../../components/map";
import addDynamicXcubeLayer from "../../components/xcubeLayer";
import { Columns2, Square, SplitSquareHorizontal } from "lucide-react";

export type DisplayMode = "single" | "swipe" | "split";
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
}: {
  map: Map | null;
  tileUrl: string | null;
  bbox?: [number, number, number, number];
  visible: boolean;
  opacity: number;
  swipeRef?: React.MutableRefObject<number>;
}) {
  const layerRef = useRef<TileLayer<any> | null>(null);
  const bboxKey = bbox?.join(",");
  useEffect(() => {
    if (!map || !tileUrl) return;
    let cancelled = false;
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
    addDynamicXcubeLayer({
      map,
      tileUrl,
      bbox: bboxKey ? (bboxKey.split(",").map(Number) as [number, number, number, number]) : undefined,
      onError: () => undefined,
    })
      .then((created) => {
        if (!created) return;
        if (cancelled) {
          created.get("cleanup")?.();
          map.removeLayer(created);
          return;
        }
        layer = created;
        layerRef.current = created;
        // Keep B above A even when A was added later.
        created.setZIndex(5);
        if (swipeRef) {
          created.on("prerender", clip);
          created.on("postrender", restore);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (layer) {
        layer.un("prerender", clip);
        layer.un("postrender", restore);
        layer.get("cleanup")?.();
        map.removeLayer(layer);
        if (layerRef.current === layer) layerRef.current = null;
      }
    };
  }, [map, tileUrl, bboxKey, swipeRef]);
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
}: {
  value: number;
  onChange: (value: number) => void;
  leftLabel: string;
  rightLabel: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const move = (clientX: number) => {
    const box = rootRef.current?.getBoundingClientRect();
    if (!box || !box.width) return;
    onChange(Math.min(98, Math.max(2, ((clientX - box.left) / box.width) * 100)));
  };
  return (
    <div className={`vx-swipe ${dragging ? "is-dragging" : ""}`} ref={rootRef}>
      <span className="vx-swipe__label vx-swipe__label--a">A · {leftLabel}</span>
      <span className="vx-swipe__label vx-swipe__label--b">B · {rightLabel}</span>
      <div className="vx-swipe__line" style={{ left: `${value}%` }}>
        <button
          type="button"
          className="vx-swipe__handle"
          role="slider"
          aria-label="스와이프 구분선"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(value)}
          aria-valuetext={`왼쪽 A ${Math.round(value)}%, 오른쪽 B ${100 - Math.round(value)}%`}
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
          <SplitSquareHorizontal size={16} aria-hidden="true" />
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
}: {
  mainMap: Map | null;
  baseVisible: boolean;
  onMapReady: (map: Map | null) => void;
  label: string;
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
    <div className="vx-compare-map" aria-label={`비교 지도 B · ${label}`} role="region">
      <OlMap onMapReady={setOwn} baseVisible={baseVisible} />
      <span className="vx-swipe__label vx-swipe__label--b">B · {label}</span>
    </div>
  );
}

/** Display-mode switch and time-B picker, floating at the top right of the map. */
export function CompareControl({
  mode,
  onMode,
  times,
  compareIndex,
  onCompareIndex,
  disabled,
}: {
  mode: DisplayMode;
  onMode: (mode: DisplayMode) => void;
  times: Array<{ iso: string; label: string }>;
  compareIndex: number;
  onCompareIndex: (index: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="vx-compare" data-tour="compare">
      <div className="vx-compare__modes" role="group" aria-label="표시 방식">
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
              <span>{label}</span>
            </button>
          );
        })}
      </div>
      {mode !== "single" && (
        <label className="vx-compare__time">
          <span>B 시점</span>
          <select
            aria-label="비교 시점 B"
            value={compareIndex}
            onChange={(event) => onCompareIndex(Number(event.target.value))}
          >
            {times.map((time, index) => (
              <option key={time.iso} value={index}>
                {time.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
