// Preview picture of a dataset (FB1 §3): the latest time in the Viewer's default layer, drawn by the Backoffice.
// It loads when it scrolls near the screen; until then, and while the server is still drawing it, the place
// stays grey. When there is no picture the dataset's extent is sketched instead (a magenta frame on the
// lon/lat grid). The picture sits next to the dataset name, so it is hidden from screen readers.
import { CSSProperties, useEffect, useRef, useState } from 'react';
import { cachedThumbnail, loadThumbnail, PENDING_RETRY_MS, ThumbResult, ThumbSize } from '../../api/thumbnails';
import type { ZarrDataset } from '../../api/viewerAdapter';
import './thumb.css';

type Bbox = [number, number, number, number];
export type ThumbState = 'idle' | 'loading' | 'ready' | 'pending' | 'failed';

/** Extent sketch: the bbox frame, true to its shape (longitude shortened by the cosine of the latitude). */
export function ExtentSketch({ bbox }: { bbox?: Bbox }) {
  const grid = (
    <g className="thumb-sketch__grid">
      {[25, 50, 75].map((at) => <line key={`v${at}`} x1={at} y1={0} x2={at} y2={100} vectorEffect="non-scaling-stroke" />)}
      {[25, 50, 75].map((at) => <line key={`h${at}`} x1={0} y1={at} x2={100} y2={at} vectorEffect="non-scaling-stroke" />)}
    </g>
  );
  if (!bbox) return <svg className="thumb-sketch" viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false">{grid}</svg>;
  const [west, south, east, north] = bbox;
  const width = Math.max(1e-6, (east - west) * Math.cos((((south + north) / 2) * Math.PI) / 180));
  const height = Math.max(1e-6, north - south);
  const scale = 62 / Math.max(width, height);
  const w = Math.max(8, width * scale);
  const h = Math.max(8, height * scale);
  return (
    <svg className="thumb-sketch" viewBox="0 0 100 100" focusable="false">
      {grid}
      <rect className="thumb-sketch__area" x={50 - w / 2} y={50 - h / 2} width={w} height={h} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

type Props = {
  dataset: Pick<ZarrDataset, 'id' | 'bbox'>;
  /** Shown size in px (square). */
  size?: number;
  /** Size asked of the server: 128 for list rows, 256 for cards. */
  request?: ThumbSize;
  className?: string;
};

const canObserve = () => typeof window !== 'undefined' && typeof window.IntersectionObserver === 'function';
const canMakeUrl = () => typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';

function Thumb({ dataset, size = 48, request = 128, className = '' }: Props) {
  const known = cachedThumbnail(dataset.id, request);
  const [result, setResult] = useState<ThumbResult | null>(known ?? null);
  const [near, setNear] = useState(!!known || !canObserve());
  const [tick, setTick] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  // Load only when the picture comes near the screen (lists can be long).
  useEffect(() => {
    if (near || !ref.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setNear(true); observer.disconnect(); }
    }, { rootMargin: '200px' });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [near]);

  useEffect(() => {
    if (!near) return;
    let alive = true;
    let retry = 0;
    loadThumbnail(dataset.id, request).then((next) => {
      if (!alive) return;
      setResult(next);
      // The server is still drawing it: ask again a little later while the row is on screen.
      if (next.state === 'pending') retry = window.setTimeout(() => setTick((value) => value + 1), PENDING_RETRY_MS);
    });
    return () => { alive = false; window.clearTimeout(retry); };
  }, [near, dataset.id, request, tick]);

  // Each shown picture owns its object URL and gives it back when it leaves the screen.
  const blob = result?.state === 'ready' ? result.blob : null;
  useEffect(() => {
    if (!blob || !canMakeUrl()) { setUrl(null); return; }
    const made = URL.createObjectURL(blob);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [blob]);

  const state: ThumbState = !near ? 'idle' : !result ? 'loading' : result.state === 'ready' && !canMakeUrl() ? 'failed' : result.state;
  return (
    <span
      ref={ref}
      className={`thumb thumb--${state} ${className}`.trim()}
      style={{ '--thumb': `${size}px` } as CSSProperties}
      data-state={state}
      aria-hidden="true"
    >
      {state === 'ready' && url && <img src={url} alt="" decoding="async" draggable={false} onError={() => setResult({ state: 'failed' })} />}
      {state === 'failed' && <ExtentSketch bbox={dataset.bbox} />}
    </span>
  );
}

/** One picture per dataset and size: a new dataset starts from its own (cached) state. */
export default function DatasetThumb(props: Props) {
  return <Thumb key={`${props.dataset.id}@${props.request ?? 128}`} {...props} />;
}

/** Up to three pictures overlapped like a fanned stack (project rows); the rest are counted beside it. */
export function ThumbStack({ datasets, size = 36 }: { datasets: Array<Pick<ZarrDataset, 'id' | 'bbox'>>; size?: number }) {
  const shown = datasets.slice(0, 3);
  return (
    <span className="thumb-stack" style={{ '--thumb': `${size}px` } as CSSProperties} aria-hidden="true" data-count={shown.length}>
      {shown.length ? shown.map((item) => <DatasetThumb key={item.id} dataset={item} size={size} />) : <span className="thumb thumb--empty" style={{ '--thumb': `${size}px` } as CSSProperties} />}
    </span>
  );
}
