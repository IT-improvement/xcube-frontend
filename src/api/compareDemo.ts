// Demo metrics of comparison results (REACT_APP_USE_MOCK_API). No imports, so the demo catalog can use it at load.
/** Metrics of the demo comparison datasets (see viewerAdapter demo list). */
export const DEMO_COMPARISONS: Record<'TIME_CHANGE' | 'MODEL_COMPARE' | 'REFERENCE', Record<string, unknown>> = {
  // Same shape Data Analysis records in metadata.comparison: type, times at the top, inputs by role, metrics.
  TIME_CHANGE: { type: 'TIME_CHANGE', t1: '2025-observation-1', t2: '2025-observation-6', inputs: [{ role: 'result', datacubeId: 'landsat-infer-024' }], metrics: { areaKm2: { kept: 12.84, gained: 1.92, lost: 3.47, unchanged: 140.2 }, waterAreaKm2: { t1: 16.31, t2: 14.76 }, netChangeKm2: -1.55, changeRatio: -0.0947, changePercent: -9.47 } },
  MODEL_COMPARE: { type: 'MODEL_COMPARE', time: '2025-observation-3', inputs: [{ role: 'a', datacubeId: 'landsat-infer-024' }, { role: 'b', datacubeId: 'landsat-infer-023' }], metrics: { iou: 0.884, dice: 0.938, agreement: 0.971, areaDiffKm2: 0.62 } },
  REFERENCE: { type: 'REFERENCE', time: '2025-observation-3', inputs: [{ role: 'result', datacubeId: 'landsat-infer-024' }], reference: 'water_gt', referenceVariable: 'water_gt', metrics: { precision: 0.912, recall: 0.873, f1: 0.892, iou: 0.805, kappa: 0.861, confusion: { tp: 18342, fp: 1771, fn: 2667, tn: 141220 } } },
};
