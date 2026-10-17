// Drawing the area for area statistics (UR-63 F1): a polygon or rectangle the user draws on the map, or the
// current view as a rectangle (the keyboard path). The shape is the user's mark, so it is drawn in overprint magenta.
import { useCallback, useEffect, useRef, useState } from "react";
import type Map from "ol/Map";
import type Draw from "ol/interaction/Draw";
import type VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";
import type Geometry from "ol/geom/Geometry";
import type { GeoPolygon } from "../../api/areaStats";
import { vertexCount } from "../../api/areaStats";

export type DrawKind = "polygon" | "rect";
export type AreaShape = {
  /** How it was made: drawn polygon, drawn rectangle, or the view at that moment. */
  kind: DrawKind | "view";
  /** EPSG:4326 GeoJSON sent to the server. */
  geometry: GeoPolygon;
  /** Geodesic area in km² (the server answers with its own). */
  areaKm2: number;
  vertices: number;
  /** [w, s, e, n] in EPSG:4326 (export bbox). */
  bbox: [number, number, number, number];
};

/** The shape from EPSG:4326 GeoJSON and its area. */
export function shapeFrom(geometry: GeoPolygon, areaKm2: number, kind: AreaShape["kind"]): AreaShape {
  const ring = geometry.type === "Polygon" ? geometry.coordinates[0] : geometry.coordinates.flatMap((polygon) => polygon[0]);
  const lons = ring.map((point) => point[0]);
  const lats = ring.map((point) => point[1]);
  return { kind, geometry, areaKm2, vertices: vertexCount(geometry), bbox: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)] };
}

type Ol = typeof import("./areaDrawOl");

/** Draw interaction, shape layer and the shape itself. Keys: Esc cancels a drawing in progress. */
export function useAreaDraw(map: Map | null, color: string) {
  const [drawing, setDrawing] = useState<DrawKind | null>(null);
  const [shape, setShape] = useState<AreaShape | null>(null);
  const [ol, setOl] = useState<Ol | null>(null);
  const sourceRef = useRef<VectorSource | null>(null);
  const layerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const drawRef = useRef<Draw | null>(null);
  const colorRef = useRef(color);
  colorRef.current = color;
  const usable = !!map && typeof (map as any).addLayer === "function" && typeof (map as any).addInteraction === "function";

  useEffect(() => {
    if (!usable) return;
    let alive = true;
    import("./areaDrawOl").then((module) => alive && setOl(module), () => undefined);
    return () => {
      alive = false;
    };
  }, [usable]);
  useEffect(() => {
    if (!usable || !map || !ol) return;
    const source = new ol.VectorSource();
    const layer = new ol.VectorLayer({ source, zIndex: 20, style: ol.styleFor(colorRef.current) });
    map.addLayer(layer);
    sourceRef.current = source;
    layerRef.current = layer;
    return () => {
      map.removeLayer(layer);
      sourceRef.current = null;
      layerRef.current = null;
    };
  }, [map, usable, ol]);
  useEffect(() => {
    if (ol) layerRef.current?.setStyle(ol.styleFor(color));
  }, [color, ol]);

  const factsOf = useCallback(
    (geometry: Geometry, kind: AreaShape["kind"]) => {
      if (!ol || !map) return null;
      const { geo, areaKm2 } = ol.geometryFacts(geometry, map.getView().getProjection().getCode());
      return shapeFrom(geo, areaKm2, kind);
    },
    [ol, map],
  );
  const dblClickZoom = useCallback(
    (active: boolean) => {
      if (!ol) return;
      map?.getInteractions?.().forEach((interaction) => {
        if (interaction instanceof ol.DoubleClickZoom) interaction.setActive(active);
      });
    },
    [map, ol],
  );
  const stop = useCallback(() => {
    const draw = drawRef.current;
    drawRef.current = null;
    if (draw && map) map.removeInteraction(draw);
    setDrawing(null);
    // A double click ends a polygon; zoom comes back after that click has passed.
    window.setTimeout(() => dblClickZoom(true), 300);
  }, [map, dblClickZoom]);

  const start = useCallback(
    (kind: DrawKind) => {
      if (!ol || !map || !sourceRef.current) return;
      if (drawRef.current) map.removeInteraction(drawRef.current);
      const source = sourceRef.current;
      const draw = new ol.Draw({
        source,
        type: kind === "rect" ? "Circle" : "Polygon",
        ...(kind === "rect" ? { geometryFunction: ol.createBox() } : {}),
        style: ol.styleFor(colorRef.current),
      });
      draw.on("drawstart", () => source.clear());
      draw.on("drawend", (event) => {
        const geometry = event.feature.getGeometry();
        const next = geometry ? factsOf(geometry, kind) : null;
        if (next) setShape(next);
        stop();
      });
      drawRef.current = draw;
      dblClickZoom(false);
      map.addInteraction(draw);
      setDrawing(kind);
    },
    [ol, map, stop, dblClickZoom, factsOf],
  );

  const cancel = useCallback(() => {
    drawRef.current?.abortDrawing();
    stop();
  }, [stop]);

  const clear = useCallback(() => {
    if (drawRef.current) {
      drawRef.current.abortDrawing();
      stop();
    }
    sourceRef.current?.clear();
    setShape(null);
  }, [stop]);

  /** A rectangle of the given extent (map projection), e.g. the current view cut to the data. */
  const fromView = useCallback(
    (extent: number[]) => {
      if (!ol || !map || !sourceRef.current) return;
      if (drawRef.current) {
        drawRef.current.abortDrawing();
        stop();
      }
      const polygon = ol.fromExtent(extent as [number, number, number, number]);
      sourceRef.current.clear();
      sourceRef.current.addFeature(new ol.Feature(polygon));
      const next = factsOf(polygon, "view");
      if (next) setShape(next);
    },
    [ol, map, stop, factsOf],
  );

  useEffect(() => {
    if (!drawing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawing, cancel]);

  return { drawing, shape, start, cancel, clear, fromView, available: usable && !!ol };
}
