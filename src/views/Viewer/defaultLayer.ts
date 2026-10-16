// Which layer a dataset opens with (FB1 §1, the user's rule): the address `?var=` value, else RGB when it can be
// built, else the first band that is not auxiliary, else the first band. The server's `defaultVariable` is not
// part of the rule. The same rule runs when another dataset is picked, and for the source side of the AI comparison.
import type { ZarrDataset } from '../../api/viewerAdapter';

type LayerSource = Pick<ZarrDataset, 'variables' | 'rgbAvailable' | 'rgbBands' | 'variableMetadata'>;

/**
 * Auxiliary bands (FB1 §1) — the one place that lists them. They are not the image itself, so a dataset does not
 * open on them while it has an image band:
 * - always auxiliary: the area-of-interest mask (`aoi_mask`) and the reference water mask (`water_gt`);
 * - auxiliary when the dataset also has a continuous band: categorical bands — Sentinel-2 `scl`, Landsat
 *   `qa_pixel`, or any band whose colour norm is categorical (`cat`).
 */
export const AUXILIARY_BANDS = ['aoi_mask', 'water_gt'];
export const CATEGORICAL_BANDS = ['scl', 'qa_pixel'];

const isCategorical = (dataset: LayerSource, band: string) =>
  CATEGORICAL_BANDS.includes(band.toLowerCase()) || dataset.variableMetadata?.[band]?.colorBarNorm === 'cat';

/** Whether a band is auxiliary in this dataset (see AUXILIARY_BANDS). */
export function isAuxiliary(dataset: LayerSource, band: string): boolean {
  if (AUXILIARY_BANDS.includes(band.toLowerCase())) return true;
  if (!isCategorical(dataset, band)) return false;
  return dataset.variables.some((other) => !AUXILIARY_BANDS.includes(other.toLowerCase()) && !isCategorical(dataset, other));
}

/** RGB can be built: Backoffice `rgbAvailable`, an xcube `rgbSchema` (rgbBands), or red, green and blue variables. */
export function canShowRgb(dataset: LayerSource | null | undefined): boolean {
  if (!dataset) return false;
  if (dataset.rgbAvailable === true || dataset.rgbBands?.length === 3) return true;
  return ['red', 'green', 'blue'].every((band) => dataset.variables.some((variable) => variable.toLowerCase() === band));
}

/** A layer the dataset can show: "rgb" when RGB can be built (or a variable of that name exists), or one of its variables. */
export function isLayerOf(dataset: LayerSource, layer: string): boolean {
  if (!layer) return false;
  return dataset.variables.includes(layer) || (layer === 'rgb' && canShowRgb(dataset));
}

/** `?var=` value if the dataset has it > RGB > first non-auxiliary band > first band; "" when nothing is known yet. */
export function defaultLayer(dataset: LayerSource | null | undefined, requested?: string): string {
  if (!dataset) return '';
  if (requested && isLayerOf(dataset, requested)) return requested;
  if (canShowRgb(dataset)) return 'rgb';
  return dataset.variables.find((band) => !isAuxiliary(dataset, band)) ?? dataset.variables[0] ?? '';
}
