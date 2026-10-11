// Satellite products (UR-55, Backend guide "위성 원본 제품 업로드"): Sentinel-2 L2A .zip and Landsat 8/9
// Collection 2 Level-2 .tar packages, and (UPL2) loose band files: Landsat SR band GeoTIFFs and Copernicus
// Browser "(Raw)" exports, one file per band. Pure helpers: sensor checks by file name, merging loose files into
// one product per scene, default bands and display styles, the suggested name, the period and a size estimate.
import type { ColorBarOption, FileJobType, InspectionField, ProductBand, ProductInfo, ProductLayout, SpatialInspection } from '../../api/generationApi';
import { formatBytes } from '../fusion';
import { periodOf } from './nameModel';
import { autoRange, VariableChoice } from './VariableStyleEditor';

export type ProductKind = 'sentinel2' | 'landsat';
export const PRODUCT_KINDS: ProductKind[] = ['sentinel2', 'landsat'];
export const PRODUCT_JOB_TYPE: Record<ProductKind, FileJobType> = { sentinel2: 'SENTINEL2_L2A', landsat: 'LANDSAT_C2L2' };
/** `product.sensor` of an inspected package of each kind. */
export const PRODUCT_SENSOR: Record<ProductKind, string> = { sentinel2: 'SENTINEL2_L2A', landsat: 'LANDSAT_C2_L2' };
/** Output resolutions (m); the first is the default. */
export const RESOLUTIONS: Record<ProductKind, number[]> = { sentinel2: [10, 20, 60], landsat: [30] };
export const ACCEPT: Record<ProductKind, string> = {
  sentinel2: '.zip,.tif,.tiff,application/zip,image/tiff',
  landsat: '.tar,.gz,.tgz,.zip,.tif,.tiff,application/x-tar,application/gzip,application/zip,image/tiff',
};
/** Band order of the contract's table, for merging loose files (one band per file) into one product. */
const BAND_ORDER: Record<ProductKind, string[]> = {
  sentinel2: ['B02', 'B03', 'B04', 'B08', 'B11', 'B05', 'B06', 'B07', 'B8A', 'B12', 'B01', 'B09', 'SCL'],
  landsat: ['SR_B1', 'SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B6', 'SR_B7', 'QA_PIXEL'],
};
/** Bands picked by default when a server leaves `default` out (the contract's defaults). */
const DEFAULT_NAMES: Record<ProductKind, string[]> = {
  sentinel2: ['blue', 'green', 'red', 'nir', 'swir', 'scl'],
  landsat: ['blue', 'green', 'red', 'nir', 'swir', 'qa_pixel'],
};

/** What the file name says: the kind and whether it is a Level-1 product. Unknown names are left to the server. */
export function productFromName(fileName: string): { kind: ProductKind; level1: boolean } | null {
  const name = fileName.split(/[\\/]/).pop() ?? fileName;
  if (/^S2[ABC]_MSIL2A_/i.test(name)) return { kind: 'sentinel2', level1: false };
  if (/^S2[ABC]_MSIL1C_/i.test(name)) return { kind: 'sentinel2', level1: true };
  if (/^L[CO]0[89]_L2S[PR]_/i.test(name)) return { kind: 'landsat', level1: false };
  if (/^L[CO]0[89]_L1(TP|GT|GS)_/i.test(name)) return { kind: 'landsat', level1: true };
  // Copernicus Browser exports: "2022-06-01-00:00_2022-06-01-23:59_Sentinel-2_L2A_B02_(Raw).tiff".
  if (/Sentinel-2_L2A/i.test(name)) return { kind: 'sentinel2', level1: false };
  if (/Sentinel-2_L1C/i.test(name)) return { kind: 'sentinel2', level1: true };
  return null;
}

/** A problem the client sees before uploading (`code` is the server's code for the same problem). */
export type ClientProblem = { code: 'PRODUCT_SENSOR_MIXED' | 'PRODUCT_TYPE_MISMATCH' | 'PRODUCT_LEVEL_UNSUPPORTED' | 'PRODUCT_LAYOUT_MIXED' };
/** A file of the other sensor is "mixed" next to products of the chosen one, else "not the chosen type". */
export function clientProblem(kind: ProductKind, fileName: string, hasProducts: boolean): ClientProblem | null {
  const seen = productFromName(fileName);
  if (!seen) return null;
  if (seen.kind !== kind) return { code: hasProducts ? 'PRODUCT_SENSOR_MIXED' : 'PRODUCT_TYPE_MISMATCH' };
  return seen.level1 ? { code: 'PRODUCT_LEVEL_UNSUPPORTED' } : null;
}

export const isDefaultBand = (kind: ProductKind, band: ProductBand) => band.default ?? DEFAULT_NAMES[kind].includes(band.name);

export const layoutOf = (product: ProductInfo): ProductLayout => product.layout ?? 'package';
export const isLoose = (product: ProductInfo) => layoutOf(product) !== 'package';
/** Copernicus Browser exports keep their own grid (resolution is not chosen) and 0–1 reflectance values. */
export const isExport = (products: ProductInfo[]) => products.length > 0 && products.every((product) => layoutOf(product) === 'browserExport');
/** Browser exports (reflectance) and DN products can't share one cube; the server answers PRODUCT_LAYOUT_MIXED too. */
export const layoutsClash = (a: ProductLayout, b: ProductLayout) => (a === 'browserExport') !== (b === 'browserExport');

type DisplayHint = { boaAddOffset?: number | null; reflectance?: boolean };
/** Default display range for reflectance about 0–0.3 in stored values (S2 DN with the +1000 offset when present; Landsat (ρ + 0.2) / 0.0000275; exports as is). */
function defaultRange(kind: ProductKind, band: ProductBand, hint: DisplayHint) {
  const stats = autoRange(band.approxStats);
  if (stats) return stats;
  if (hint.reflectance) return { min: 0, max: 0.3 };
  if (kind === 'landsat') return { min: 7273, max: 18182 };
  const offset = hint.boaAddOffset ? -hint.boaAddOffset : 0;
  return { min: offset, max: 3000 + offset };
}

/** One band as a variable: the registry name, Greys for reflectance, a categorical map for SCL / QA_PIXEL. */
export function productChoice(kind: ProductKind, band: ProductBand, colorBars: ColorBarOption[], hint: DisplayHint = {}): VariableChoice {
  const pick = (...ids: string[]) => ids.map((id) => colorBars.find((item) => item.id === id)?.id).find(Boolean) ?? colorBars[0]?.id ?? '';
  if (band.kind === 'categorical') return { source: band.source, name: band.name, kind: 'categorical', colorBar: pick('tab10', 'Set3', 'Paired'), min: '', max: '' };
  const range = defaultRange(kind, band, hint);
  const round = (value: number) => (Math.abs(value) >= 1000 ? Math.round(value) : Number(value.toPrecision(4)));
  return { source: band.source, name: band.name, kind: 'continuous', colorBar: pick('Greys', 'gray', 'Greys_r'), min: String(round(range.min)), max: String(round(range.max)), origin: band.approxStats ? undefined : 'product' };
}

type Bounds = { west: number; south: number; east: number; north: number };
const unionOf = (a: Bounds, b: Bounds): Bounds => ({ west: Math.min(a.west, b.west), south: Math.min(a.south, b.south), east: Math.max(a.east, b.east), north: Math.max(a.north, b.north) });

/**
 * The products of every checked upload. Loose band files are checked one file at a time, so the files of one
 * scene (a Landsat product id, or one date of a browser export) are merged into one product: bands in table
 * order, footprints joined. Products with no analysis band (a visual image alone) are left out.
 */
export function productsOf(inspections: SpatialInspection[], kind: ProductKind = 'sentinel2'): ProductInfo[] {
  const all = inspections.flatMap((item) => item.products ?? (item.product ? [item.product] : [])).filter((product) => product.bands.length > 0);
  const merged = new Map<string, ProductInfo>();
  all.forEach((product, index) => {
    const key = isLoose(product) ? `${layoutOf(product)}:${product.productId}` : `package:${index}`;
    const seen = merged.get(key);
    if (!seen) { merged.set(key, { ...product, bands: [...product.bands] }); return; }
    product.bands.forEach((band) => { if (!seen.bands.some((item) => item.source === band.source)) seen.bands.push(band); });
    const a = footprintBounds(seen.footprint), b = footprintBounds(product.footprint);
    if (a && b) seen.footprint = unionOf(a, b);
  });
  const order = BAND_ORDER[kind];
  const rank = (band: ProductBand) => (order.includes(band.source) ? order.indexOf(band.source) : order.length);
  return Array.from(merged.values()).map((product) => ({ ...product, bands: [...product.bands].sort((a, b) => rank(a) - rank(b)) }));
}
/** The bands every product has (packages all have the same list; loose uploads may differ by date). */
export const productBands = (products: ProductInfo[]): ProductBand[] =>
  (products[0]?.bands ?? []).filter((band) => products.every((product) => product.bands.some((item) => item.source === band.source)));
/** Bands only some dates have: not offered, so every time step has every variable. */
export const partialBands = (products: ProductInfo[]): string[] => {
  const common = new Set(productBands(products).map((band) => band.source));
  return Array.from(new Set(products.flatMap((product) => product.bands.map((band) => band.source)))).filter((source) => !common.has(source));
};
export const productFields = (bands: ProductBand[]): InspectionField[] => bands.map((band) => ({ name: band.source }));
export function defaultChoices(kind: ProductKind, products: ProductInfo[], colorBars: ColorBarOption[]): VariableChoice[] {
  const hint = { boaAddOffset: products.find((product) => product.boaAddOffset)?.boaAddOffset, reflectance: products.some((product) => product.valueScale === 'reflectance') };
  return productBands(products).filter((band) => isDefaultBand(kind, band)).map((band) => productChoice(kind, band, colorBars, hint));
}
/** The pixel size of a browser export (m, from the server), shown instead of a resolution choice. */
export const exportResolution = (products: ProductInfo[]) => productBands(products)[0]?.resolution ?? null;

/** UTC date (`YYYY-MM-DD`) of a product; products of one date become one time step. */
export const productDate = (product: ProductInfo) => product.acquiredAt.slice(0, 10);
export const uniqueDates = (products: ProductInfo[]) => Array.from(new Set(products.map(productDate))).sort();
export function productPeriod(products: ProductInfo[]): { start: string; end: string } | null {
  const dates = uniqueDates(products);
  return dates.length ? { start: dates[0], end: dates[dates.length - 1] } : null;
}
export const placeOfProduct = (product: ProductInfo) => product.tile || product.pathRow || '';

/** "{tile|pathRow} {period}", e.g. "52SCG 2024-08" or "115034·116034 2024-06–08". */
export function suggestProductName(products: ProductInfo[]): string {
  const places = Array.from(new Set(products.map(placeOfProduct).filter(Boolean)));
  const period = productPeriod(products);
  const place = places.length > 3 ? `${places.slice(0, 3).join('·')}…` : places.join('·');
  return [place, period ? periodOf(period.start, period.end) : ''].filter(Boolean).join(' ').slice(0, 150);
}

export function footprintBounds(footprint: ProductInfo['footprint']): Bounds | null {
  if (!footprint) return null;
  const [west, south, east, north] = Array.isArray(footprint) ? footprint : [footprint.west, footprint.south, footprint.east, footprint.north];
  return [west, south, east, north].every(Number.isFinite) && west < east && south < north ? { west, south, east, north } : null;
}
/** The union of every footprint, or null when one is unknown. */
export function unionBounds(products: ProductInfo[]): Bounds | null {
  const all = products.map((product) => footprintBounds(product.footprint));
  if (!all.length || all.some((item) => !item)) return null;
  return (all as Bounds[]).reduce(unionOf);
}

/**
 * Upper bound of the output before compression: the union grid at `resolution` × time steps × bytes per value
 * (uint16, SCL uint8; browser exports float32 at their own pixel size). Null when a footprint is unknown, rather than a guess.
 */
export function estimateBytes(products: ProductInfo[], choices: VariableChoice[], chosen: number): number | null {
  const bounds = unionBounds(products);
  const exported = isExport(products);
  const resolution = exported ? exportResolution(products) ?? chosen : chosen;
  if (!bounds || !choices.length || !(resolution > 0)) return null;
  const midLat = ((bounds.south + bounds.north) / 2) * (Math.PI / 180);
  const width = Math.ceil(((bounds.east - bounds.west) * 111320 * Math.cos(midLat)) / resolution);
  const height = Math.ceil(((bounds.north - bounds.south) * 110574) / resolution);
  const perPixel = choices.reduce((sum, choice) => sum + (exported ? 4 : choice.source.toUpperCase() === 'SCL' ? 1 : 2), 0);
  return width * height * perPixel * uniqueDates(products).length;
}
export const estimateText = (bytes: number | null) => (bytes == null ? '' : formatBytes(bytes));

/** True when variables named red, green and blue are all picked (the server then builds the RGB view). */
export const hasRgbNames = (choices: VariableChoice[]) => ['red', 'green', 'blue'].every((name) => choices.some((choice) => choice.name.trim() === name));
