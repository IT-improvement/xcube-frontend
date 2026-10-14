import TileLayer from "ol/layer/Tile";
import XYZ from "ol/source/XYZ";
import TileState from "ol/TileState";
import Map from "ol/Map";
import { isSameOrigin, refreshSession, session } from "../../api/httpClient";
import { ApiError, errorFromBody } from "../../api/httpClient";

/** A layer none of whose tiles has drawn yet retries after these waits (ms), about 2 minutes in all: the
 *  owner's pod restarts to serve new data (an AI result, a new Zarr) and answers 404 meanwhile, measured
 *  10–60 s. Failed tiles still free their slot at once, so the wait never blocks other layers. */
export const TILE_RETRY_DELAYS = [2000, 3000, 5000, 5000, 10000, 10000, 15000, 15000, 20000, 30000];

/** Only a main xcube on another origin (Mac development: http://localhost:8080) is loaded as a plain image: it
 *  serves public tiles and does not accept an Authorization preflight. Everything else (the same-origin tile
 *  gateway, which checks the signed-in user per request, and personal pods) is fetched with the access token. */
export const isPublicXcubeTile = (src: string) => {
  const main = process.env.REACT_APP_XCUBE_URL ?? 'http://localhost:8080';
  return !!main && !isSameOrigin(main) && src.startsWith(main);
};

/** A tile fetch with the access token; an expired token is refreshed once (the same flow as every API call). */
export async function fetchTile(src: string, signal: AbortSignal): Promise<Response> {
  const token = session.getToken();
  const response = await fetch(src, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal });
  if (response.status !== 401 || !token) return response;
  let next = session.getToken();
  if (next === token) {
    try { next = await refreshSession(); } catch { return response; }
  }
  if (!next) return response;
  return fetch(src, { headers: { Authorization: `Bearer ${next}` }, signal });
}

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
  let drawn = false;
  let retries = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let source: XYZ;
  const failed = (error: ApiError) => {
    if (drawn) return onError?.(error);
    if (retryTimer) return;
    if (retries >= TILE_RETRY_DELAYS.length) return onError?.(error);
    retryTimer = setTimeout(() => { retryTimer = undefined; retries += 1; source.refresh(); }, TILE_RETRY_DELAYS[retries]);
  };
  const layer = new TileLayer({
    source: source = new XYZ({
      url: tileUrl,
      minZoom: 0,
      maxZoom: 23,
      tileLoadFunction: (tile, src) => {
        const image = (tile as any).getImage() as HTMLImageElement;
        if (isPublicXcubeTile(src)) {
          image.src = src;
          return;
        }
        const controller = new AbortController(); controllers.add(controller);
        fetchTile(src, controller.signal)
          .then(async (response) => { if (!response.ok) { let body: any = {}; try { body = await response.json(); } catch { /* binary error */ } throw errorFromBody(response.status, body, response.statusText); } return response.blob(); })
          .then((blob) => { drawn = true; const objectUrl = URL.createObjectURL(blob); objectUrls.add(objectUrl); const release = () => { URL.revokeObjectURL(objectUrl); objectUrls.delete(objectUrl); }; image.onload = release; image.onerror = release; image.src = objectUrl; })
          .catch((error) => {
            if (error?.name !== 'AbortError') failed(error instanceof ApiError ? error : new ApiError(0, 'NETWORK_ERROR', 'Tile request failed'));
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
  layer.set('cleanup', () => { if (retryTimer) clearTimeout(retryTimer); retryTimer = undefined; retries = TILE_RETRY_DELAYS.length; controllers.forEach((controller) => controller.abort()); controllers.clear(); objectUrls.forEach((url) => URL.revokeObjectURL(url)); objectUrls.clear(); });

  // Keep the user's current center and zoom when a time-frame layer is replaced.
  // Dataset fitting is an explicit viewer toolbar action, never a layer side effect.

  return layer;
}
