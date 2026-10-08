import type Map from "ol/Map";
import type TileLayer from "ol/layer/Tile";
import { watchTileLayerReady } from "../../components/xcubeLayer/tileReady";

/** Playback: 1x shows each time for at least 1.5 s; 0.5x/1x/2x/4x → 3000/1500/750/375 ms (FR-VIEW-12). */
export const PLAYBACK_BASE_MS = 1500;
export const playbackInterval = (speed: number) => PLAYBACK_BASE_MS / speed;

type Frame = {
  url: string;
  layer: TileLayer<any> | null;
  ready: boolean;
  disposed: boolean;
  stopWatch?: () => void;
};

type Options = {
  /** Adds a tile layer for the url to the map (resolves undefined when none could be made). */
  create: (url: string) => Promise<TileLayer<any> | undefined>;
  /** The url whose tiles are now on screen (or null when nothing is shown). */
  onShown: (url: string | null) => void;
};

/**
 * Double-buffered source layer (FR-VIEW-12): a new frame is added while the previous one stays on
 * screen, and the previous one is removed only after the new frame's visible tiles have loaded
 * (or the safety timeout). At most current + pending + prefetch layers are alive.
 */
export class FrameBuffer {
  private current: Frame | null = null;
  private pending: Frame | null = null;
  private prefetch: Frame | null = null;
  private visible = true;
  private opacity = 1;

  constructor(private readonly map: Map, private readonly options: Options) {}

  /** Shows the url; `keepOld` keeps the current frame visible until the new one has loaded. */
  show(url: string | null, keepOld = true) {
    if (!url) {
      this.drop("pending");
      this.drop("current");
      this.drop("prefetch");
      this.options.onShown(null);
      return;
    }
    if (this.pending?.url === url) return;
    this.drop("pending");
    if (this.current?.url === url) {
      this.options.onShown(url);
      return;
    }
    if (!keepOld) this.drop("current");
    let frame: Frame;
    if (this.prefetch?.url === url) {
      frame = this.prefetch;
      this.prefetch = null;
    } else frame = this.create(url);
    this.pending = frame;
    this.style(frame);
    if (frame.ready) this.promote(frame);
  }

  /** Warms the next frame in a hidden layer; null drops it (pause, dataset or variable change). */
  preload(url: string | null) {
    if (this.prefetch?.url === url) return;
    this.drop("prefetch");
    if (!url || url === this.current?.url || url === this.pending?.url) return;
    this.prefetch = this.create(url);
  }

  setStyle(visible: boolean, opacity: number) {
    this.visible = visible;
    this.opacity = opacity;
    [this.current, this.pending, this.prefetch].forEach((frame) => frame && this.style(frame));
  }

  /** Layers currently alive (current, pending, prefetch), for tests and diagnostics. */
  layers(): TileLayer<any>[] {
    return [this.current, this.pending, this.prefetch].flatMap((frame) => (frame?.layer ? [frame.layer] : []));
  }

  destroy() {
    this.drop("pending");
    this.drop("current");
    this.drop("prefetch");
  }

  private create(url: string): Frame {
    const frame: Frame = { url, layer: null, ready: false, disposed: false };
    const settle = () => {
      frame.ready = true;
      if (frame === this.pending) this.promote(frame);
    };
    this.options
      .create(url)
      .then((layer) => {
        if (frame.disposed) {
          if (layer) this.remove(layer);
          return;
        }
        if (!layer) return settle();
        frame.layer = layer;
        this.style(frame);
        frame.stopWatch = watchTileLayerReady(this.map, layer, settle);
      })
      .catch(() => {
        if (!frame.disposed) settle();
      });
    return frame;
  }

  private promote(frame: Frame) {
    if (this.current && this.current !== frame) this.dispose(this.current);
    this.current = frame;
    this.pending = null;
    this.options.onShown(frame.url);
  }

  private style(frame: Frame) {
    if (!frame.layer) return;
    frame.layer.setVisible(this.visible);
    // The prefetch layer is rendered (so its tiles load) but not seen.
    frame.layer.setOpacity(frame === this.prefetch ? 0 : this.opacity);
  }

  private drop(slot: "current" | "pending" | "prefetch") {
    const frame = this[slot];
    if (!frame) return;
    this[slot] = null;
    this.dispose(frame);
  }

  private dispose(frame: Frame) {
    frame.disposed = true;
    frame.stopWatch?.();
    if (frame.layer) this.remove(frame.layer);
    frame.layer = null;
  }

  private remove(layer: TileLayer<any>) {
    layer.get("cleanup")?.();
    this.map.removeLayer(layer);
  }
}
