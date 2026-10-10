// Labels and helpers shared by the fusion page, job center and dataset detail (S12).
import type { Blocker, FusionRequest, Normalization } from '../api/analysisApi';
import { blockerCode } from '../api/analysisApi';
import { getLanguage, translate } from '../i18n';
import type { Lang, TKey } from '../i18n';

const BLOCKER_KEY: Record<string, TKey> = {
  NO_OVERLAP: 'fusion.blockers.NO_OVERLAP',
  NO_TIMES: 'fusion.blockers.NO_TIMES',
  QUOTA_EXCEEDED: 'fusion.blockers.QUOTA_EXCEEDED',
  FORMULA_INVALID: 'fusion.blockers.FORMULA_INVALID',
  INPUT_NOT_FOUND: 'fusion.blockers.INPUT_NOT_FOUND',
  VARIABLE_NOT_FOUND: 'fusion.blockers.VARIABLE_NOT_FOUND',
};
/**
 * Why a dry run cannot start. Korean keeps the server sentence first (as before UR-53); other languages
 * use the code's text when the code is known, then the server sentence.
 */
export const blockerText = (blocker: Blocker, lang: Lang = getLanguage()) => {
  const code = blockerCode(blocker);
  const message = typeof blocker === 'object' ? blocker.message : undefined;
  const known = BLOCKER_KEY[code] ? translate(lang, BLOCKER_KEY[code]) : undefined;
  return (lang === 'ko' ? message || known : known || message) || translate(lang, 'fusion.blockers.unknown', { code });
};

// Rule option labels, as dictionary keys (translate with t(GRID_LABEL[key])).
export const GRID_LABEL = { coarsest: 'fusion.grid.coarsest', finest: 'fusion.grid.finest', datacube: 'fusion.grid.datacube' } as const;
export const RESAMPLING_LABEL = { average: 'fusion.resamplingMethod.average', nearest: 'fusion.resamplingMethod.nearest', bilinear: 'fusion.resamplingMethod.bilinear' } as const;
export const EXTENT_LABEL = { intersection: 'fusion.extentMode.intersection', union: 'fusion.extentMode.union' } as const;
export const TIME_LABEL = { exact: 'fusion.timeMode.exact', nearest: 'fusion.timeMode.nearest', aggregate: 'fusion.timeMode.aggregate' } as const;
export const PERIOD_LABEL = { day: 'fusion.period.day', month: 'fusion.period.month', year: 'fusion.period.year' } as const;
export const AGG_LABEL = { mean: 'fusion.agg.mean', max: 'fusion.agg.max', min: 'fusion.agg.min', median: 'fusion.agg.median' } as const;

export const normalizationLabel = (value: Normalization, lang: Lang = getLanguage()) =>
  value === 'auto' ? translate(lang, 'fusion.normalization.auto')
    : value === 'none' ? translate(lang, 'fusion.normalization.none')
      : translate(lang, 'fusion.normalization.custom', { scale: value.scale, offset: value.offset });

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${unit === 0 ? value : value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

/** Ids from the catalog are strings; the analysis API takes numbers when the id is numeric. */
export const apiId = (value: string | number | null | undefined) => (value == null || value === '' ? null : /^\d+$/.test(String(value)) ? Number(value) : String(value));

/** Default result name: "{first dataset}_융합_20261010" / "{first dataset}_bandmath_20261010". */
export const defaultName = (firstDataset: string | undefined, now = new Date(), lang: Lang = getLanguage()) =>
  translate(lang, 'fusion.defaultName', {
    name: firstDataset ?? translate(lang, 'fusion.defaultNameData'),
    date: `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`,
  });

/** The request kept on a job or dataset may be partial; unknown shapes are ignored. */
export const asFusionRequest = (value: unknown): Partial<FusionRequest> | null =>
  value && typeof value === 'object' && typeof (value as FusionRequest).formula === 'string' ? (value as Partial<FusionRequest>) : null;
