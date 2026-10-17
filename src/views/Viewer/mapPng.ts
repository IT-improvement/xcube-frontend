// Map PNG export (UR-63 F2), made entirely in the browser: the OpenLayers layer canvases of the shown map(s) are
// copied onto one canvas and framed like a printed map sheet — title and date above, legends and a scale bar on
// the map, attribution and creation time below. The sheet is always light paper (it is a document, not the screen).
import type Map from "ol/Map";

export type LegendSpec =
  | { kind: "ramp"; title: string; units?: string; stops: string[]; image?: CanvasImageSource | null; min?: string; max?: string }
  | { kind: "rgb"; title: string; text: string }
  | { kind: "classes"; title: string; classes: Array<{ color: string; label: string }> }
  | { kind: "hatch"; title: string; text?: string; color: string }
  | { kind: "outline"; title: string; text?: string; color: string };
export type ExportSpec = {
  title: string;
  /** Second line: band and date. */
  subtitle: string;
  /** One map, or two side by side (A | B); each with an optional label. */
  maps: Array<{ canvas: CanvasImageSource & { width: number; height: number }; label?: string }>;
  legends: LegendSpec[];
  /** Scale bar: its length in CSS px and its text. */
  scale?: { px: number; label: string } | null;
  attribution: string;
  /** "만든 시각 2026. 10. 17. 14:02" */
  created: string;
};

/** Paper colours (DESIGN.md light theme). */
export const SHEET = { paper: "#ffffff", ground: "#f3f5f2", rule: "#d8ddd5", ruleStrong: "#b3bbb0", ink: "#1b201d", ink2: "#454d47", ink3: "#5f6862" } as const;
const FONT = "'Pretendard Variable', Pretendard, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";
export const HEADER = 64;
export const FOOTER = 34;

/** A scale bar of a round length (1, 2, 5 × 10^n m) no longer than `maxPx`. */
export function niceScale(metersPerPx: number, maxPx = 120, lang: "ko" | "en" = "ko"): { px: number; label: string } | null {
  if (!Number.isFinite(metersPerPx) || metersPerPx <= 0) return null;
  const maxMeters = metersPerPx * maxPx;
  const magnitude = 10 ** Math.floor(Math.log10(maxMeters));
  const meters = [5, 2, 1].map((factor) => factor * magnitude).find((value) => value <= maxMeters) ?? magnitude;
  const label = meters >= 1000 ? `${(meters / 1000).toLocaleString(lang === "ko" ? "ko-KR" : "en-US")} km` : `${meters.toLocaleString(lang === "ko" ? "ko-KR" : "en-US")} m`;
  return { px: meters / metersPerPx, label };
}

/** Ground metres per CSS pixel at the map centre. */
export async function metersPerPixel(map: Map): Promise<number | null> {
  const view = map.getView();
  const resolution = view.getResolution();
  const center = view.getCenter();
  if (resolution == null || !center) return null;
  const { getPointResolution } = await import("ol/proj");
  return getPointResolution(view.getProjection(), resolution, center, "m");
}

/** Waits for the map to finish drawing (at most `timeout` ms). */
export function settled(map: Map, timeout = 4000): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, timeout);
    map.once("rendercomplete", () => {
      window.clearTimeout(timer);
      resolve();
    });
    map.renderSync();
  });
}

/**
 * The map's layer canvases on one canvas at device resolution (the OpenLayers export recipe: each canvas with its
 * CSS transform, opacity and filter, so the dimmed dark basemap and the swipe clip come out as on screen).
 */
export function snapshotMap(map: Map, pixelRatio = window.devicePixelRatio || 1): HTMLCanvasElement | null {
  const size = map.getSize();
  if (!size) return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(size[0] * pixelRatio);
  canvas.height = Math.round(size[1] * pixelRatio);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = SHEET.ground;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  map.getViewport().querySelectorAll<HTMLCanvasElement>(".ol-layer canvas, canvas.ol-layer").forEach((layer) => {
    if (!layer.width) return;
    const parent = layer.parentElement;
    const opacity = parent?.style.opacity || layer.style.opacity;
    ctx.globalAlpha = opacity === "" || opacity == null ? 1 : Number(opacity);
    const filter = window.getComputedStyle(layer).filter;
    ctx.filter = filter && filter !== "none" ? filter : "none";
    const match = layer.style.transform.match(/^matrix\(([^(]*)\)$/);
    const matrix = match ? match[1].split(",").map(Number) : [1, 0, 0, 1, 0, 0];
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.transform(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]);
    const background = parent?.style.backgroundColor;
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, layer.width, layer.height);
    }
    ctx.drawImage(layer, 0, 0);
  });
  ctx.globalAlpha = 1;
  ctx.filter = "none";
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return canvas;
}

/** Sheet size in CSS px for maps of the given CSS size. */
export function sheetLayout(mapWidth: number, mapHeight: number, count: number) {
  const width = mapWidth * count + (count - 1) * 2;
  return { width, height: HEADER + mapHeight + FOOTER, mapTop: HEADER, mapWidth, mapHeight };
}

type Ctx = Pick<CanvasRenderingContext2D, "fillStyle" | "strokeStyle" | "lineWidth" | "font" | "textAlign" | "textBaseline" | "fillRect" | "strokeRect" | "fillText" | "measureText" | "drawImage" | "beginPath" | "moveTo" | "lineTo" | "stroke" | "save" | "restore" | "rect" | "clip" | "createLinearGradient">;

function legendHeight(item: LegendSpec) {
  if (item.kind === "classes") return 28 + item.classes.length * 17;
  if (item.kind === "ramp") return 52;
  return item.text ? 44 : 28;
}

/** Draws one legend box with its top-left at (x, y); 196 px wide. */
function drawLegend(ctx: Ctx, item: LegendSpec, x: number, y: number) {
  const width = 196;
  const height = legendHeight(item);
  ctx.fillStyle = SHEET.paper;
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = SHEET.rule;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = SHEET.ink;
  ctx.font = `600 12.5px ${FONT}`;
  const head = item.kind === "ramp" && item.units ? `${item.title} · ${item.units}` : item.title;
  let textX = x + 10;
  if (item.kind === "hatch" || item.kind === "outline") {
    // Swatch: the AI water hatch, or the drawn area's outline.
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 10, y + 8, 14, 14);
    ctx.clip();
    ctx.fillStyle = SHEET.paper;
    ctx.fillRect(x + 10, y + 8, 14, 14);
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 2;
    if (item.kind === "hatch")
      for (let offset = -14; offset < 28; offset += 5) {
        ctx.beginPath();
        ctx.moveTo(x + 10 + offset, y + 22);
        ctx.lineTo(x + 24 + offset, y + 8);
        ctx.stroke();
      }
    ctx.restore();
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 10.75, y + 8.75, 12.5, 12.5);
    textX = x + 32;
  }
  ctx.fillStyle = SHEET.ink;
  ctx.fillText(head, textX, y + 19, width - (textX - x) - 8);
  ctx.font = `500 11.5px ${FONT}`;
  ctx.fillStyle = SHEET.ink2;
  if (item.kind === "ramp") {
    const barY = y + 26;
    if (item.image) ctx.drawImage(item.image, x + 10, barY, width - 20, 10);
    else {
      const gradient = ctx.createLinearGradient(x + 10, 0, x + width - 10, 0);
      item.stops.forEach((stop, index) => gradient.addColorStop(item.stops.length > 1 ? index / (item.stops.length - 1) : 0, stop));
      ctx.fillStyle = gradient;
      ctx.fillRect(x + 10, barY, width - 20, 10);
    }
    ctx.strokeStyle = SHEET.rule;
    ctx.strokeRect(x + 10.5, barY + 0.5, width - 21, 9);
    ctx.fillStyle = SHEET.ink2;
    if (item.min != null) ctx.fillText(item.min, x + 10, y + 48);
    if (item.max != null) {
      ctx.textAlign = "right";
      ctx.fillText(item.max, x + width - 10, y + 48);
      ctx.textAlign = "left";
    }
  } else if (item.kind === "rgb") {
    ctx.fillText(item.text, x + 10, y + 36, width - 20);
  } else if (item.kind === "classes") {
    item.classes.forEach((entry, index) => {
      const rowY = y + 26 + index * 17;
      ctx.fillStyle = entry.color;
      ctx.fillRect(x + 10, rowY, 10, 10);
      ctx.strokeStyle = SHEET.rule;
      ctx.strokeRect(x + 10.5, rowY + 0.5, 9, 9);
      ctx.fillStyle = SHEET.ink2;
      ctx.fillText(entry.label, x + 26, rowY + 9, width - 36);
    });
  } else if (item.text) {
    ctx.fillText(item.text, x + 10, y + 36, width - 20);
  }
  return height;
}

/** Paints the whole sheet on a 2D context sized for {@link sheetLayout} (CSS px; scale beforehand for DPR). */
export function paintSheet(ctx: Ctx, spec: ExportSpec, mapWidth: number, mapHeight: number) {
  const layout = sheetLayout(mapWidth, mapHeight, spec.maps.length);
  ctx.fillStyle = SHEET.paper;
  ctx.fillRect(0, 0, layout.width, layout.height);
  // Header: title and band · date, ruled off from the map.
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = SHEET.ink;
  ctx.font = `600 17px ${FONT}`;
  ctx.fillText(spec.title, 16, 28, layout.width - 32);
  ctx.fillStyle = SHEET.ink2;
  ctx.font = `500 13px ${FONT}`;
  ctx.fillText(spec.subtitle, 16, 50, layout.width - 32);
  ctx.fillStyle = SHEET.rule;
  ctx.fillRect(0, HEADER - 1, layout.width, 1);
  // Maps.
  spec.maps.forEach((item, index) => {
    const left = index * (mapWidth + 2);
    ctx.drawImage(item.canvas, 0, 0, item.canvas.width, item.canvas.height, left, HEADER, mapWidth, mapHeight);
    if (index > 0) {
      ctx.fillStyle = SHEET.paper;
      ctx.fillRect(left - 2, HEADER, 2, mapHeight);
    }
    if (item.label) {
      ctx.font = `600 12.5px ${FONT}`;
      const textWidth = ctx.measureText(item.label).width;
      ctx.fillStyle = SHEET.paper;
      ctx.fillRect(left + 12, HEADER + 12, textWidth + 16, 24);
      ctx.strokeStyle = SHEET.rule;
      ctx.lineWidth = 1;
      ctx.strokeRect(left + 12.5, HEADER + 12.5, textWidth + 15, 23);
      ctx.fillStyle = SHEET.ink;
      ctx.fillText(item.label, left + 20, HEADER + 28);
    }
  });
  // Legends: stacked up from the bottom-left of the first map.
  let bottom = HEADER + mapHeight - 12;
  for (const item of [...spec.legends].reverse()) {
    const height = legendHeight(item);
    bottom -= height;
    drawLegend(ctx, item, 12, bottom);
    bottom -= 6;
  }
  // Scale bar: bottom-right of the last map.
  if (spec.scale) {
    const boxWidth = Math.max(spec.scale.px, 48) + 20;
    const x = layout.width - 12 - boxWidth;
    const y = HEADER + mapHeight - 12 - 34;
    ctx.fillStyle = SHEET.paper;
    ctx.fillRect(x, y, boxWidth, 34);
    ctx.strokeStyle = SHEET.rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, boxWidth - 1, 33);
    ctx.strokeStyle = SHEET.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 10, y + 20);
    ctx.lineTo(x + 10, y + 26);
    ctx.lineTo(x + 10 + spec.scale.px, y + 26);
    ctx.lineTo(x + 10 + spec.scale.px, y + 20);
    ctx.stroke();
    ctx.fillStyle = SHEET.ink;
    ctx.font = `500 11.5px ${FONT}`;
    ctx.fillText(spec.scale.label, x + 10, y + 15);
  }
  // Footer: attribution left, creation time and the product right.
  const footY = HEADER + mapHeight;
  ctx.fillStyle = SHEET.rule;
  ctx.fillRect(0, footY, layout.width, 1);
  ctx.font = `400 11.5px ${FONT}`;
  ctx.fillStyle = SHEET.ink3;
  ctx.textAlign = "left";
  ctx.fillText(spec.attribution, 16, footY + 22, layout.width * 0.6);
  ctx.textAlign = "right";
  ctx.fillText(`${spec.created} · XCube`, layout.width - 16, footY + 22);
  ctx.textAlign = "left";
  return layout;
}

/** The finished sheet as a PNG blob. Throws `TAINTED` when a tile server did not allow reading its images. */
export async function sheetPng(spec: ExportSpec, mapWidth: number, mapHeight: number, pixelRatio = window.devicePixelRatio || 1): Promise<Blob> {
  const layout = sheetLayout(mapWidth, mapHeight, spec.maps.length);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(layout.width * pixelRatio);
  canvas.height = Math.round(layout.height * pixelRatio);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("NO_CANVAS");
  ctx.scale(pixelRatio, pixelRatio);
  paintSheet(ctx, spec, mapWidth, mapHeight);
  return new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("NO_BLOB"))), "image/png");
    } catch (error) {
      reject(error instanceof DOMException && error.name === "SecurityError" ? Object.assign(new Error("TAINTED"), { code: "TAINTED" }) : error);
    }
  });
}

/** File name: `{title}_{date}.png`, characters files cannot hold replaced. */
export function pngFileName(title: string, date: string) {
  const safe = `${title}_${date}`.replace(/[\\/:*?"<>|\s]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  return `${safe || "xcube_map"}.png`;
}
