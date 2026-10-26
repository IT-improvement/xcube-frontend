// OpenLayers pieces of the area drawing (UR-63 F1), loaded on demand by ./areaDraw.ts so the Viewer's first chunk
// (and the test environment, which does not load OpenLayers' ES modules) stays without them.
import Feature from "ol/Feature";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import Draw, { createBox } from "ol/interaction/Draw";
import DoubleClickZoom from "ol/interaction/DoubleClickZoom";
import { Fill, Stroke, Style } from "ol/style";
import GeoJSON from "ol/format/GeoJSON";
import { fromExtent } from "ol/geom/Polygon";
import type Geometry from "ol/geom/Geometry";
import { getArea } from "ol/sphere";
import type { GeoPolygon } from "../../api/areaStats";

export { Feature, VectorLayer, VectorSource, Draw, createBox, DoubleClickZoom, fromExtent };

const format = new GeoJSON();

/** Map geometry → EPSG:4326 GeoJSON and its geodesic area in km². */
export function geometryFacts(geometry: Geometry, projection: string) {
  const geo = format.writeGeometryObject(geometry, { featureProjection: projection, dataProjection: "EPSG:4326", decimals: 6 }) as GeoPolygon;
  return { geo, areaKm2: getArea(geometry, { projection }) / 1e6 };
}

export const styleFor = (color: string) => [
  new Style({ stroke: new Stroke({ color: "rgba(255,255,255,0.9)", width: 5 }) }),
  new Style({ stroke: new Stroke({ color, width: 2 }), fill: new Fill({ color: `${color}1f` }) }),
];
