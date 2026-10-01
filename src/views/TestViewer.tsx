import { useEffect, useRef } from 'react';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import XYZ from 'ol/source/XYZ';
import { fromLonLat } from 'ol/proj';
import 'ol/ol.css';

/** Development-only direct XCube visualization at /test. */
export default function TestViewer() {
  const target = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!target.current) return;
    const base = new TileLayer({ source: new XYZ({ url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png' }) });
    const landsat = new TileLayer({ opacity: 0.85, source: new XYZ({ url: `${process.env.REACT_APP_XCUBE_URL ?? 'http://localhost:8080'}/tiles/landsat_rgb/red/{z}/{y}/{x}?crs=EPSG:3857&format=png` }) });
    const map = new Map({ target: target.current, layers: [base, landsat], view: new View({ center: fromLonLat([127.5, 36.2]), zoom: 7 }) });
    return () => map.setTarget(undefined);
  }, []);
  return <main style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}><header style={{ padding: '12px 20px', background: '#10243e', color: '#fff' }}><strong>XCube direct test</strong><span style={{ marginLeft: 16 }}>landsat_rgb · XCube Server :8080</span></header><div ref={target} style={{ flex: 1 }} /></main>;
}
