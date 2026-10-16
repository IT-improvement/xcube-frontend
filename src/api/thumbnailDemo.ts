// Demo-mode preview pictures (REACT_APP_USE_MOCK_API=true). A real picture is a satellite tile; here each demo
// dataset gets a small drawn scene from its id (fields, a river and a reservoir in true colour, or a water mask
// for an AI result) so the lists can be judged without a server. Data just added in the demo answers like a
// server whose xcube is still starting (503 THUMBNAIL_NOT_READY).
import { ApiError } from './httpClient';

const pause = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/** Small deterministic random numbers from a text (the same id always draws the same scene). */
function seeded(text: string) {
  let state = 2166136261;
  for (let index = 0; index < text.length; index += 1) state = Math.imul(state ^ text.charCodeAt(index), 16777619);
  return () => {
    state = Math.imul(state ^ (state >>> 15), 2246822507);
    state = Math.imul(state ^ (state >>> 13), 3266489909);
    return ((state ^= state >>> 16) >>> 0) / 4294967296;
  };
}

const FIELD_TONES = ['#5f7048', '#6e7a4c', '#7d8458', '#8a8460', '#56663f', '#9a8f6a', '#4d5f3a', '#77805a'];

/** True-colour-like scene: field parcels, a winding river and a lake. */
function sceneSvg(id: string, size: number) {
  const random = seeded(id);
  const parcels: string[] = [];
  const cell = size / 6;
  for (let row = 0; row < 6; row += 1)
    for (let column = 0; column < 6; column += 1) {
      const tone = FIELD_TONES[Math.floor(random() * FIELD_TONES.length)];
      const inset = 1 + random() * 2;
      parcels.push(`<rect x="${(column * cell + inset).toFixed(1)}" y="${(row * cell + inset).toFixed(1)}" width="${(cell - inset * 2).toFixed(1)}" height="${(cell - inset * 2).toFixed(1)}" fill="${tone}" opacity="${(0.75 + random() * 0.25).toFixed(2)}"/>`);
    }
  const bend = () => (0.2 + random() * 0.6) * size;
  const river = `M${-4} ${bend().toFixed(0)} C ${(size * 0.3).toFixed(0)} ${bend().toFixed(0)}, ${(size * 0.6).toFixed(0)} ${bend().toFixed(0)}, ${size + 4} ${bend().toFixed(0)}`;
  const lakeX = (0.3 + random() * 0.4) * size;
  const lakeY = (0.3 + random() * 0.4) * size;
  const lakeR = (0.12 + random() * 0.08) * size;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`
    + `<rect width="${size}" height="${size}" fill="#4a5a36"/>${parcels.join('')}`
    + `<path d="${river}" fill="none" stroke="#2b4a5e" stroke-width="${(size * 0.035).toFixed(1)}" stroke-linecap="round"/>`
    + `<path d="M${(lakeX - lakeR).toFixed(1)} ${lakeY.toFixed(1)} q ${(lakeR * 0.4).toFixed(1)} ${(-lakeR * 1.1).toFixed(1)} ${(lakeR * 1.2).toFixed(1)} ${(-lakeR * 0.7).toFixed(1)} t ${(lakeR * 0.9).toFixed(1)} ${(lakeR * 0.6).toFixed(1)} q ${(-lakeR * 0.1).toFixed(1)} ${(lakeR * 1.2).toFixed(1)} ${(-lakeR * 1.1).toFixed(1)} ${(lakeR * 0.9).toFixed(1)} z" fill="#1d3a4f"/>`
    + `</svg>`;
}

/** AI water mask: water in the AI water colour, the rest left clear like nodata on the map. */
function maskSvg(id: string, size: number) {
  const random = seeded(id);
  const blobs = Array.from({ length: 3 }, () => {
    const x = (0.2 + random() * 0.6) * size;
    const y = (0.2 + random() * 0.6) * size;
    const rx = (0.1 + random() * 0.18) * size;
    const ry = (0.06 + random() * 0.12) * size;
    return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" transform="rotate(${Math.round(random() * 180)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`
    + `<rect width="${size}" height="${size}" fill="#1b201d" opacity="0.06"/><g fill="#3fb4ff">${blobs.join('')}</g></svg>`;
}

/** The picture of a demo dataset, as the real endpoint would answer (a PNG there, an SVG here). */
export async function demoThumbnail(datasetId: string, size: number): Promise<Blob> {
  await pause(120 + (datasetId.length % 5) * 60);
  if (datasetId.startsWith('demo-zarr-')) throw new ApiError(503, 'THUMBNAIL_NOT_READY', '미리보기 그림을 아직 만들지 못했습니다.');
  const svg = /infer|water|ai/i.test(datasetId) ? maskSvg(datasetId, size) : sceneSvg(datasetId, size);
  return new Blob([svg], { type: 'image/svg+xml' });
}
