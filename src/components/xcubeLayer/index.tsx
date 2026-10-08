import TileLayer from "ol/layer/Tile";
import XYZ from "ol/source/XYZ";
import TileState from "ol/TileState";
import Map from "ol/Map";
import { session } from "../../api/httpClient";
import { ApiError } from "../../api/httpClient";

interface Props {
  map: Map;
  tileUrl: string;
  bbox?: [number, number, number, number];
  onError?: (error: ApiError) => void;
}

export default async function addDynamicXcubeLayer({
  map,
  tileUrl,
  bbox,
  onError,
}: Props) {
  const controllers = new Set<AbortController>();
  const objectUrls = new Set<string>();
  const layer = new TileLayer({
    source: new XYZ({
      url: tileUrl,
      minZoom: 0,
      maxZoom: 23,
      tileLoadFunction: (tile, src) => {
        const image = (tile as any).getImage() as HTMLImageElement;
        // Official XCube tiles are public raster images. Loading them directly,
        // exactly like the /test viewer, avoids an Authorization preflight that
        // the XCube Server does not accept.
        if (src.startsWith(process.env.REACT_APP_XCUBE_URL ?? 'http://localhost:8080')) {
          image.src = src;
          return;
        }
        const token = session.getToken();
        const controller = new AbortController(); controllers.add(controller);
        fetch(src, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: controller.signal })
          .then(async (response) => { if (!response.ok) { let body: any = {}; try { body = await response.json(); } catch { /* binary error */ } if (response.status === 401) session.clearIfCurrent(token); throw new ApiError(response.status, body.code ?? `HTTP_${response.status}`, body.message ?? response.statusText, body.traceId); } return response.blob(); })
          .then((blob) => { const objectUrl = URL.createObjectURL(blob); objectUrls.add(objectUrl); const release = () => { URL.revokeObjectURL(objectUrl); objectUrls.delete(objectUrl); }; image.onload = release; image.onerror = release; image.src = objectUrl; })
          .catch((error) => {
            if (error?.name !== 'AbortError') onError?.(error instanceof ApiError ? error : new ApiError(0, 'NETWORK_ERROR', 'Tile request failed'));
            image.removeAttribute('src');
            // Without a load or error event the tile stays LOADING and keeps one of the map's
            // few tile-queue slots forever; enough failed tiles (e.g. a 404 RGB) stop every layer.
            (tile as any).setState(TileState.ERROR);
          })
          .finally(() => controllers.delete(controller));
      },
    }),
    opacity: 0.8,
  });

  map.addLayer(layer);
  layer.set('cleanup', () => { controllers.forEach((controller) => controller.abort()); controllers.clear(); objectUrls.forEach((url) => URL.revokeObjectURL(url)); objectUrls.clear(); });

  // Keep the user's current center and zoom when a time-frame layer is replaced.
  // Dataset fitting is an explicit viewer toolbar action, never a layer side effect.

  return layer;
}
