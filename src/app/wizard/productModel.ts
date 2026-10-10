// Satellite product packages (UR-55, Backend guide "위성 원본 제품 업로드"): Sentinel-2 L2A .zip and Landsat 8/9
// Collection 2 Level-2 .tar, one product per date. Pure helpers: sensor checks by file name, default bands and
// display styles, the suggested name, the period and a size estimate.
import type { ColorBarOption, FileJobType, InspectionField, ProductBand, ProductInfo, SpatialInspection } from '../../api/generationApi';
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
  sentinel2: '.zip,application/zip',
  landsat: '.tar,.gz,.tgz,.zip,application/x-tar,application/gzip,application/zip',
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
  return null;
}

/** A problem the client sees before uploading (`code` is the server's code for the same problem). */
export type ClientProblem = { code: 'PRODUCT_SENSOR_MIXED' | 'PRODUCT_TYPE_MISMATCH' | 'PRODUCT_LEVEL_UNSUPPORTED' };
/** A file of the other sensor is "mixed" next to products of the chosen one, else "not the chosen type". */
export function clientProblem(kind: ProductKind, fileName: string, hasProducts: boolean): ClientProblem | null {
  const seen = productFromName(fileName);
  if (!seen) return null;
  if (seen.kind !== kind) return { code: hasProducts ? 'PRODUCT_SENSOR_MIXED' : 'PRODUCT_TYPE_MISMATCH' };
  return seen.level1 ? { code: 'PRODUCT_LEVEL_UNSUPPORTED' } : null;
}

export const isDefaultBand = (kind: ProductKind, band: ProductBand) => band.default ?? DEFAULT_NAMES[kind].includes(band.name);

/** Default display range in original values for reflectance about 0–0.3 (S2: DN with the +1000 offset when present; Landsat: (ρ + 0.2) / 0.0000275). */
function defaultRange(kind: ProductKind, band: ProductBand, boaAddOffset: number | null | undefined) {
  const stats = autoRange(band.approxStats);
  if (stats) return stats;
  if (kind === 'landsat') return { min: 7273, max: 18182 };
  const offset = boaAddOffset ? -boaAddOffset : 0;
  return { min: offset, max: 3000 + offset };
}

/** One band as a variable: the registry name, Greys for reflectance, a categorical map for SCL / QA_PIXEL. */
export function productChoice(kind: ProductKind, band: ProductBand, colorBars: ColorBarOption[], boaAddOffset?: number | null): VariableChoice {
  const pick = (...ids: string[]) => ids.map((id) => colorBars.find((item) => item.id === id)?.id).find(Boolean) ?? colorBars[0]?.id ?? '';
  if (band.kind === 'categorical') return { source: band.source, name: band.name, kind: 'categorical', colorBar: pick('tab10', 'Set3', 'Paired'), min: '', max: '' };
  const range = defaultRange(kind, band, boaAddOffset);
  return { source: band.source, name: band.name, kind: 'continuous', colorBar: pick('Greys', 'gray', 'Greys_r'), min: String(range.min), max: String(range.max), origin: band.approxStats ? undefined : 'product' };
}

export const productsOf = (inspections: SpatialInspection[]): ProductInfo[] => inspections.flatMap((item) => (item.product ? [item.product] : []));
/** The bands of the first product (every product of one kind has the same list). */
export const productBands = (products: ProductInfo[]): ProductBand[] => products[0]?.bands ?? [];
export const productFields = (bands: ProductBand[]): InspectionField[] => bands.map((band) => ({ name: band.source }));
export function defaultChoices(kind: ProductKind, products: ProductInfo[], colorBars: ColorBarOption[]): VariableChoice[] {
  const offset = products.find((product) => product.boaAddOffset)?.boaAddOffset;
  return productBands(products).filter((band) => isDefaultBand(kind, band)).map((band) => productChoice(kind, band, colorBars, offset));
}

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

type Bounds = { west: number; south: number; east: number; north: number };
export function footprintBounds(footprint: ProductInfo['footprint']): Bounds | null {
  if (!footprint) return null;
  const [west, south, east, north] = Array.isArray(footprint) ? footprint : [footprint.west, footprint.south, footprint.east, footprint.north];
  return [west, south, east, north].every(Number.isFinite) && west < east && south < north ? { west, south, east, north } : null;
}
/** The union of every footprint, or null when one is unknown. */
export function unionBounds(products: ProductInfo[]): Bounds | null {
  const all = products.map((product) => footprintBounds(product.footprint));
  if (!all.length || all.some((item) => !item)) return null;
  return (all as Bounds[]).reduce((a, b) => ({ west: Math.min(a.west, b.west), south: Math.min(a.south, b.south), east: Math.max(a.east, b.east), north: Math.max(a.north, b.north) }));
}

/**
 * Upper bound of the output before compression: the union grid at `resolution` × time steps × bytes per value
 * (uint16, SCL uint8). Null when a footprint is unknown, rather than a guess.
 */
export function estimateBytes(products: ProductInfo[], choices: VariableChoice[], resolution: number): number | null {
  const bounds = unionBounds(products);
  if (!bounds || !choices.length || !(resolution > 0)) return null;
  const midLat = ((bounds.south + bounds.north) / 2) * (Math.PI / 180);
  const width = Math.ceil(((bounds.east - bounds.west) * 111320 * Math.cos(midLat)) / resolution);
  const height = Math.ceil(((bounds.north - bounds.south) * 110574) / resolution);
  const perPixel = choices.reduce((sum, choice) => sum + (choice.source.toUpperCase() === 'SCL' ? 1 : 2), 0);
  return width * height * perPixel * uniqueDates(products).length;
}
export const estimateText = (bytes: number | null) => (bytes == null ? '' : formatBytes(bytes));

/** True when variables named red, green and blue are all picked (the server then builds the RGB view). */
export const hasRgbNames = (choices: VariableChoice[]) => ['red', 'green', 'blue'].every((name) => choices.some((choice) => choice.name.trim() === name));
