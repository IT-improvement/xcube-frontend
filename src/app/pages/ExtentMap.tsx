// Small read-only OSM map of a dataset extent (S5 overview). OpenLayers loads lazily on first use; until it
// is ready, and whenever it cannot load (offline, tests), the `fallback` sketch stays in its place.
import { ReactNode, useEffect, useRef, useState } from 'react';

type Bbox = [number, number, number, number];
/** The extent is an overprint mark (DESIGN.md), like the wizard's area map. */
const OVERPRINT_FALLBACK = '#b8166f';

export default function ExtentMap({ bbox, label, fallback }: { bbox: Bbox; label: string; fallback: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const key = bbox.join(',');
  useEffect(() => {
    let disposed = false;
    let cleanup = () => undefined as void;
    (async () => {
      try {
        const [{ default: Map }, { default: View }, { default: TileLayer }, { default: VectorLayer }, { default: VectorSource }, { default: OSM }, { default: Feature }, { transformExtent }, { fromExtent }, { default: Style }, { default: Stroke }, { default: Fill }, { default: Attribution }] = await Promise.all([
          import('ol/Map'), import('ol/View'), import('ol/layer/Tile'), import('ol/layer/Vector'), import('ol/source/Vector'), import('ol/source/OSM'), import('ol/Feature'),
          import('ol/proj'), import('ol/geom/Polygon'), import('ol/style/Style'), import('ol/style/Stroke'), import('ol/style/Fill'), import('ol/control/Attribution'),
        ] as any[]);
        if (disposed || !host.current) return;
        await import('ol/ol.css');
        const mark = getComputedStyle(host.current).getPropertyValue('--fb-overprint').trim() || OVERPRINT_FALLBACK;
        const extent = transformExtent(bbox, 'EPSG:4326', 'EPSG:3857');
        const area = new VectorSource({ features: [new Feature(fromExtent(extent))] });
        const view = new View({ projection: 'EPSG:3857' });
        const map = new Map({
          target: host.current,
          view,
          // A picture, not a tool: no panning or zooming; the OSM credit stays visible.
          controls: [new Attribution({ collapsible: false })],
          interactions: [],
          layers: [
            new TileLayer({ source: new OSM(), className: 'ol-layer xc-basemap' }),
            new VectorLayer({ source: area, style: new Style({ stroke: new Stroke({ color: mark, width: 2 }), fill: new Fill({ color: 'rgba(0,0,0,0)' }) }) }),
          ],
        });
        view.fit(extent, { padding: [28, 28, 28, 28], maxZoom: 13 });
        setReady(true);
        cleanup = () => map.setTarget(undefined);
      } catch {
        // Keep the sketch.
      }
    })();
    return () => { disposed = true; cleanup(); };
    // The bbox is compared by value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return (
    <div className={`extent-map${ready ? ' is-ready' : ''}`}>
      <div ref={host} className="extent-map__canvas" role={ready ? 'img' : undefined} aria-label={ready ? label : undefined} aria-hidden={ready ? undefined : true} />
      {!ready && fallback}
    </div>
  );
}
