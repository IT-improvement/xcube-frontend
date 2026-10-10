// Map preview of the GEE area: the outer box and, when there is one, the polygon; in point mode a reticle on the centre.
// OpenLayers loads lazily; when it cannot (offline, tests) a plain SVG sketch is drawn instead.
// `readOnly` (the review step) draws the same marks without controls or interactions.
import { useEffect, useRef, useState } from 'react';
import { AreaGeometry, Bbox } from '../../api/generationApi';
import { useLanguage } from '../../i18n';
import '../../i18n/wizard';
import { bboxText } from './areaModel';

export type PickMode = 'point' | 'box' | null;
type Props = {
  bbox?: Bbox; geojson?: AreaGeometry; pick: PickMode; center?: [number, number]; readOnly?: boolean;
  onPoint?: (lon: number, lat: number) => void; onBox?: (bbox: Bbox) => void; describedBy?: string;
};

const KOREA: Bbox = [124, 33, 132, 39];
/** The area is an overprint mark, drawn like the sketch (wizard.css): solid --fb-overprint stroke, 14% fill. */
const OVERPRINT_FALLBACK = '#b8166f';
const OVERPRINT_FILL_ALPHA = 0.14;
/** Fit the view when the area is outside it or narrower than this share of it (phones start on all of Korea). */
export const FIT_BELOW = 0.25;
/** `#rrggbb` (or `#rgb`) with an alpha, for OpenLayers styles that cannot read CSS variables. */
export function withAlpha(color: string, alpha: number) {
  const hex = color.trim().replace('#', '');
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return color;
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16));
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Whether the view should move to the area: it is not fully in view, or it is too small to see. */
export function needsFit(area: number[], view: number[]) {
  const inside = area[0] >= view[0] && area[2] <= view[2] && area[1] >= view[1] && area[3] <= view[3];
  return !inside || (area[2] - area[0]) < (view[2] - view[0]) * FIT_BELOW;
}

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** All [lon, lat] rings of a Polygon or MultiPolygon. */
export function ringsOf(geometry?: AreaGeometry): number[][][] {
  if (!geometry) return [];
  const coordinates = geometry.coordinates as any;
  return geometry.type === 'Polygon' ? coordinates : (coordinates as number[][][][]).flat();
}

/** SVG sketch of the box and polygon in a padded lon/lat frame (map fallback and list thumbnails). */
export function AreaSketch({ bbox, geojson, width = 480, height = 280, className = 'area-sketch', label }: { bbox?: Bbox; geojson?: AreaGeometry; width?: number; height?: number; className?: string; label?: string }) {
  const target = bbox ?? KOREA;
  const padX = Math.max((target[2] - target[0]) * 0.35, 0.02);
  const padY = Math.max((target[3] - target[1]) * 0.35, 0.02);
  const frame = { w: target[0] - padX, e: target[2] + padX, s: target[1] - padY, n: target[3] + padY };
  const x = (lon: number) => ((lon - frame.w) / (frame.e - frame.w)) * width;
  const y = (lat: number) => ((frame.n - lat) / (frame.n - frame.s)) * height;
  const { lang, t } = useLanguage();
  const path = ringsOf(geojson).map((ring) => `M${ring.map(([lon, lat]) => `${x(lon).toFixed(1)} ${y(lat).toFixed(1)}`).join('L')}Z`).join('');
  return (
    <svg className={className} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label ?? (bbox ? t('wizard.area.preview', { bbox: bboxText(bbox, lang) }) : t('wizard.area.sketchEmpty'))}>
      {bbox && <rect className="area-box" x={x(bbox[0])} y={y(bbox[3])} width={Math.max(2, x(bbox[2]) - x(bbox[0]))} height={Math.max(2, y(bbox[1]) - y(bbox[3]))} />}
      {path && <path className="area-poly" d={path} fillRule="evenodd" />}
    </svg>
  );
}

type MapApi = { draw: (bbox?: Bbox, geojson?: AreaGeometry, center?: [number, number]) => void; setPick: (mode: PickMode) => void };

export default function AreaMap({ bbox, geojson, pick, center, readOnly, onPoint, onBox, describedBy }: Props) {
  const { lang, t } = useLanguage();
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<MapApi | null>(null);
  const handlers = useRef({ onPoint, onBox });
  handlers.current = { onPoint, onBox };
  const latest = useRef({ bbox, geojson, pick, center });
  latest.current = { bbox, geojson, pick, center };
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => undefined as void;
    (async () => {
      try {
        const [{ default: Map }, { default: View }, { default: TileLayer }, { default: VectorLayer }, { default: VectorSource }, { default: OSM }, { default: Feature }, { default: GeoJSON }, { fromLonLat, toLonLat, transformExtent }, { default: DragBox }, { DragPan }, { default: Style }, { default: Fill }, { default: Stroke }, { fromExtent }, { default: Point }, { default: RegularShape }, { default: CircleStyle }] = await Promise.all([
          import('ol/Map'), import('ol/View'), import('ol/layer/Tile'), import('ol/layer/Vector'), import('ol/source/Vector'), import('ol/source/OSM'), import('ol/Feature'), import('ol/format/GeoJSON'),
          import('ol/proj'), import('ol/interaction/DragBox'), import('ol/interaction'), import('ol/style/Style'), import('ol/style/Fill'), import('ol/style/Stroke'), import('ol/geom/Polygon'),
          import('ol/geom/Point'), import('ol/style/RegularShape'), import('ol/style/Circle'),
        ] as any[]);
        if (disposed || !host.current) return;
        await import('ol/ol.css');
        const boxSource = new VectorSource();
        const polySource = new VectorSource();
        const centerSource = new VectorSource();
        const mark = getComputedStyle(host.current).getPropertyValue('--fb-overprint').trim() || OVERPRINT_FALLBACK;
        const line = new Stroke({ color: mark, width: 2 });
        const view = new View({ projection: 'EPSG:3857', center: fromLonLat([127.8, 36.2]), zoom: 6.5 });
        const map = new Map({
          target: host.current,
          view,
          ...(readOnly ? { controls: [], interactions: [] } : {}),
          layers: [
            new TileLayer({ source: new OSM() }),
            new VectorLayer({ source: polySource, style: new Style({ fill: new Fill({ color: withAlpha(mark, OVERPRINT_FILL_ALPHA) }), stroke: line }) }),
            new VectorLayer({ source: boxSource, style: new Style({ stroke: new Stroke({ color: mark, width: 2, lineDash: [6, 4] }) }) }),
            // The centre the user picked: a crosshair with a ring, like the Viewer's pixel reticle.
            new VectorLayer({ source: centerSource, style: [
              new Style({ image: new RegularShape({ points: 4, radius: 11, radius2: 0, angle: 0, stroke: line }) }),
              new Style({ image: new CircleStyle({ radius: 5, stroke: line }) }),
            ] }),
          ],
        });
        // Drawing a rectangle shows the same dashed overprint box as the result (wizard.css .area-dragbox).
        const dragBox = new DragBox({ condition: () => true, className: 'area-dragbox' });
        dragBox.setActive(false);
        if (!readOnly) map.addInteraction(dragBox);
        dragBox.on('boxend', () => {
          const extent = transformExtent(dragBox.getGeometry().getExtent(), 'EPSG:3857', 'EPSG:4326') as number[];
          if (extent[2] - extent[0] > 0 && extent[3] - extent[1] > 0) handlers.current.onBox?.([extent[0], extent[1], extent[2], extent[3]].map((value) => Number(value.toFixed(5))) as Bbox);
        });
        map.on('singleclick', (event: any) => {
          if (latest.current.pick !== 'point') return;
          const [lon, lat] = toLonLat(event.coordinate);
          handlers.current.onPoint?.(Number(lon.toFixed(5)), Number(lat.toFixed(5)));
        });
        const setPick = (mode: PickMode) => {
          if (readOnly) return;
          dragBox.setActive(mode === 'box');
          // Dragging draws the box in box mode, so panning by drag is paused then.
          map.getInteractions().forEach((interaction: any) => { if (interaction instanceof DragPan) interaction.setActive(mode !== 'box'); });
          map.getTargetElement().style.cursor = mode ? 'crosshair' : '';
        };
        const draw = (nextBbox?: Bbox, nextGeo?: AreaGeometry, nextCenter?: [number, number]) => {
          boxSource.clear(); polySource.clear(); centerSource.clear();
          if (!nextBbox) return;
          const extent = transformExtent(nextBbox, 'EPSG:4326', 'EPSG:3857') as number[];
          boxSource.addFeature(new Feature(fromExtent(extent)));
          if (nextGeo) polySource.addFeatures(new GeoJSON().readFeatures({ type: 'Feature', geometry: nextGeo, properties: {} }, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' }));
          if (nextCenter) centerSource.addFeature(new Feature(new Point(fromLonLat(nextCenter))));
          if (needsFit(extent, view.calculateExtent(map.getSize()))) view.fit(extent, { padding: [40, 40, 40, 40], maxZoom: 13, duration: reducedMotion() ? 0 : 200 });
        };
        api.current = { draw, setPick };
        setPick(latest.current.pick);
        draw(latest.current.bbox, latest.current.geojson, latest.current.center);
        cleanup = () => { api.current = null; map.setTarget(undefined); };
      } catch {
        if (!disposed) setFailed(true);
      }
    })();
    return () => { disposed = true; cleanup(); };
  }, [readOnly]);

  const centerKey = center ? center.join(',') : '';
  useEffect(() => { api.current?.draw(bbox, geojson, latest.current.center); }, [bbox, geojson, centerKey]);
  useEffect(() => { api.current?.setPick(pick); }, [pick]);

  const label = bbox ? t('wizard.area.preview', { bbox: bboxText(bbox, lang) }) : t('wizard.area.previewEmpty');
  if (failed) return <AreaSketch bbox={bbox} geojson={geojson} label={label} />;
  // A picture when read-only; an interactive map is a labelled group so its zoom buttons stay reachable.
  return readOnly
    ? <div ref={host} className="area-map area-map--read" role="img" aria-label={label} />
    : <div ref={host} className="area-map" role="group" aria-label={`${t('wizard.area.mapLabel')} · ${label}`} aria-describedby={describedBy} />;
}
