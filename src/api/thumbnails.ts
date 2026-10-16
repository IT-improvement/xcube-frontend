// Dataset preview pictures (FB1 §2–3). The Backoffice draws them from the latest time with the Viewer's
// default layer: GET /api/v1/datasets/{id}/thumbnail.png?size= (signed in, same read rule as the dataset).
// The request needs the Authorization header, so an <img src> cannot fetch it: the picture is fetched as a
// blob, kept here in memory, and every mounted picture makes (and on unmount revokes) its own object URL.
import { useMockApi } from '.';
import { BACKOFFICE_API_BASE_URL } from './backofficeApi';
import { ApiError, requestBlob } from './httpClient';
import { demoThumbnail } from './thumbnailDemo';

/** Sizes the Backoffice is asked for (it caches one file per size). Small rows share 128, cards use 256. */
export type ThumbSize = 128 | 256;

/**
 * Outcome of a picture request: the image, "not drawn yet" (503 THUMBNAIL_NOT_READY: the dataset's xcube is
 * still starting, the screen keeps a grey place) or failed (the screen draws the extent instead).
 */
export type ThumbResult = { state: 'ready'; blob: Blob } | { state: 'pending' } | { state: 'failed' };

type Entry = { at: number; promise: Promise<ThumbResult>; settled?: ThumbResult };
const cache = new Map<string, Entry>();
/** Pictures kept at most; the oldest is dropped first (a Map keeps insertion order). */
const MAX_ENTRIES = 300;
/** "Not drawn yet" is asked again after this long, a failure after this long. A picture stays. */
export const PENDING_RETRY_MS = 15_000;
export const FAILED_RETRY_MS = 5 * 60_000;

const keyOf = (datasetId: string, size: ThumbSize) => `${datasetId}@${size}`;

function fetchThumbnail(datasetId: string, size: ThumbSize): Promise<Blob> {
  if (useMockApi) return demoThumbnail(datasetId, size);
  return requestBlob(BACKOFFICE_API_BASE_URL, `/api/v1/datasets/${encodeURIComponent(datasetId)}/thumbnail.png?size=${size}`);
}

const isNotReady = (error: unknown) =>
  error instanceof ApiError && (error.code === 'THUMBNAIL_NOT_READY' || error.status === 503);

/** The settled result in memory, if it is still good (used to paint a cached picture without a blank frame). */
export function cachedThumbnail(datasetId: string, size: ThumbSize): ThumbResult | undefined {
  const entry = cache.get(keyOf(datasetId, size));
  return entry?.settled && fresh(entry) ? entry.settled : undefined;
}

function fresh(entry: Entry, now = Date.now()) {
  const result = entry.settled;
  if (!result) return true; // still loading: share the request
  if (result.state === 'ready') return true;
  return now - entry.at < (result.state === 'pending' ? PENDING_RETRY_MS : FAILED_RETRY_MS);
}

/** One request per picture and size at a time; the answer is shared by every row that shows it. */
export function loadThumbnail(datasetId: string, size: ThumbSize): Promise<ThumbResult> {
  const key = keyOf(datasetId, size);
  const known = cache.get(key);
  if (known && fresh(known)) {
    // Most recently used goes to the end, so the oldest picture is dropped first.
    cache.delete(key);
    cache.set(key, known);
    return known.promise;
  }
  const entry: Entry = { at: Date.now(), promise: Promise.resolve({ state: 'failed' }) };
  entry.promise = fetchThumbnail(datasetId, size)
    .then((blob): ThumbResult => ({ state: 'ready', blob }))
    .catch((error): ThumbResult => (isNotReady(error) ? { state: 'pending' } : { state: 'failed' }))
    .then((result) => {
      entry.settled = result;
      entry.at = Date.now();
      return result;
    });
  cache.set(key, entry);
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  return entry.promise;
}

/** Tests only: forget every picture. */
export function resetThumbnailCache() {
  cache.clear();
}
