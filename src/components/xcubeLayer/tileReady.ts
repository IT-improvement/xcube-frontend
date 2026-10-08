import type Map from "ol/Map";
import type TileLayer from "ol/layer/Tile";

/** Longest a frame may keep the previous one on screen before it is shown anyway (FR-VIEW-12). */
export const FRAME_SAFETY_MS = 10_000;
/** Quiet time after the last tile settles, so the next batch from the tile queue can still start. */
const SETTLE_MS = 80;

type Options = { settleMs?: number; safetyMs?: number };

/**
 * Calls `onReady` once when the layer's visible tiles have finished loading (errors count as done).
 * Counts the source's `tileloadstart`/`tileloadend`/`tileloaderror`; the map's `rendercomplete`
 * covers frames that need no tile requests (cached or out of view). Returns a disposer.
 */
export function watchTileLayerReady(
  map: Map,
  layer: TileLayer<any>,
  onReady: () => void,
  { settleMs = SETTLE_MS, safetyMs = FRAME_SAFETY_MS }: Options = {},
): () => void {
  const source = typeof layer.getSource === "function" ? layer.getSource() : null;
  if (!source || typeof source.on !== "function" || typeof map.on !== "function") {
    onReady();
    return () => undefined;
  }
  let pending = 0;
  let done = false;
  let settle: ReturnType<typeof setTimeout> | undefined;
  const start = () => {
    pending += 1;
    if (settle) clearTimeout(settle);
    settle = undefined;
  };
  const end = () => {
    pending = Math.max(0, pending - 1);
    if (pending === 0) {
      if (settle) clearTimeout(settle);
      settle = setTimeout(finish, settleMs);
    }
  };
  const complete = () => {
    if (pending === 0) finish();
  };
  const safety = setTimeout(() => finish(), safetyMs);
  const dispose = () => {
    if (settle) clearTimeout(settle);
    clearTimeout(safety);
    source.un("tileloadstart", start);
    source.un("tileloadend", end);
    source.un("tileloaderror", end);
    map.un("rendercomplete", complete);
  };
  function finish() {
    if (done) return;
    done = true;
    dispose();
    onReady();
  }
  source.on("tileloadstart", start);
  source.on("tileloadend", end);
  source.on("tileloaderror", end);
  map.on("rendercomplete", complete);
  return () => {
    done = true;
    dispose();
  };
}
