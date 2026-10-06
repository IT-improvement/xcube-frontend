// Map preview of the GEE area: the outer box and, when there is one, the polygon.
// OpenLayers loads lazily; when it cannot (offline, tests) a plain SVG sketch is drawn instead.
import { useEffect, useRef, useState } from 'react';
import { AreaGeometry, Bbox } from '../../api/generationApi';
import { bboxText } from './areaModel';

export type PickMode = 'point' | 'box' | null;
type Props = { bbox?: Bbox; geojson?: AreaGeometry; pick: PickMode; onPoint?: (lon: number, lat: number) => void; onBox?: (bbox: Bbox) => void };

const KOREA: Bbox = [124, 33, 132, 39];

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
  const path = ringsOf(geojson).map((ring) => `M${ring.map(([lon, lat]) => `${x(lon).toFixed(1)} ${y(lat).toFixed(1)}`).join('L')}Z`).join('');
  return (
    <svg className={className} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label ?? (bbox ? `영역 미리보기: ${bboxText(bbox)}` : '영역을 지정하면 여기에 표시됩니다')}>
      {bbox && <rect className="area-box" x={x(bbox[0])} y={y(bbox[3])} width={Math.max(2, x(bbox[2]) - x(bbox[0]))} height={Math.max(2, y(bbox[1]) - y(bbox[3]))} />}
      {path && <path className="area-poly" d={path} fillRule="evenodd" />}
    </svg>
  );
}

export default function AreaMap({ bbox, geojson, pick, onPoint, onBox }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ draw: (bbox?: Bbox, geojson?: AreaGeometry) => void; setPick: (mode: PickMode) => void } | null>(null);
  const handlers = useRef({ onPoint, onBox });
  handlers.current = { onPoint, onBox };
  const latest = useRef({ bbox, geojson, pick });
  latest.current = { bbox, geojson, pick };
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => undefined as void;
    (async () => {
      try {
        const [{ default: Map }, { default: View }, { default: TileLayer }, { default: VectorLayer }, { default: VectorSource }, { default: OSM }, { default: Feature }, { default: GeoJSON }, { fromLonLat, toLonLat, transformExtent }, { default: DragBox }, { DragPan }, { default: Style }, { default: Fill }, { default: Stroke }, { fromExtent }] = await Promise.all([
          import('ol/Map'), import('ol/View'), import('ol/layer/Tile'), import('ol/layer/Vector'), import('ol/source/Vector'), import('ol/source/OSM'), import('ol/Feature'), import('ol/format/GeoJSON'),
          import('ol/proj'), import('ol/interaction/DragBox'), import('ol/interaction'), import('ol/style/Style'), import('ol/style/Fill'), import('ol/style/Stroke'), import('ol/geom/Polygon'),
        ] as any[]);
        if (disposed || !host.current) return;
        await import('ol/ol.css');
        const boxSource = new VectorSource();
        const polySource = new VectorSource();
        const primary = getComputedStyle(host.current).getPropertyValue('--color-primary').trim() || '#2563eb';
        const view = new View({ projection: 'EPSG:3857', center: fromLonLat([127.8, 36.2]), zoom: 6.5 });
        const map = new Map({
          target: host.current,
          view,
          layers: [
            new TileLayer({ source: new OSM() }),
            new VectorLayer({ source: polySource, style: new Style({ fill: new Fill({ color: 'rgba(37,99,235,0.22)' }), stroke: new Stroke({ color: primary, width: 2 }) }) }),
            new VectorLayer({ source: boxSource, style: new Style({ stroke: new Stroke({ color: primary, width: 2, lineDash: [6, 4] }) }) }),
          ],
        });
        const dragBox = new DragBox({ condition: () => true });
        dragBox.setActive(false);
        map.addInteraction(dragBox);
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
          dragBox.setActive(mode === 'box');
          // Dragging draws the box in box mode, so panning by drag is paused then.
          map.getInteractions().forEach((interaction: any) => { if (interaction instanceof DragPan) interaction.setActive(mode !== 'box'); });
          map.getTargetElement().style.cursor = mode ? 'crosshair' : '';
        };
        const draw = (nextBbox?: Bbox, nextGeo?: AreaGeometry) => {
          boxSource.clear(); polySource.clear();
          if (!nextBbox) return;
          const extent = transformExtent(nextBbox, 'EPSG:4326', 'EPSG:3857') as number[];
          boxSource.addFeature(new Feature(fromExtent(extent)));
          if (nextGeo) polySource.addFeatures(new GeoJSON().readFeatures({ type: 'Feature', geometry: nextGeo, properties: {} }, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' }));
          const current = view.calculateExtent(map.getSize());
          const inside = extent[0] >= current[0] && extent[2] <= current[2] && extent[1] >= current[1] && extent[3] <= current[3];
          const visible = (extent[2] - extent[0]) > (current[2] - current[0]) * 0.05;
          if (!inside || !visible) view.fit(extent, { padding: [40, 40, 40, 40], maxZoom: 13, duration: 0 });
        };
        api.current = { draw, setPick };
        setPick(latest.current.pick);
        draw(latest.current.bbox, latest.current.geojson);
        cleanup = () => { api.current = null; map.setTarget(undefined); };
      } catch {
        if (!disposed) setFailed(true);
      }
    })();
    return () => { disposed = true; cleanup(); };
  }, []);

  useEffect(() => { api.current?.draw(bbox, geojson); }, [bbox, geojson]);
  useEffect(() => { api.current?.setPick(pick); }, [pick]);

  const label = bbox ? `영역 미리보기: ${bboxText(bbox)}` : '영역을 지정하면 지도에 표시됩니다';
  if (failed) return <AreaSketch bbox={bbox} geojson={geojson} label={label} />;
  return <div ref={host} className="area-map" role="img" aria-label={label} />;
}
