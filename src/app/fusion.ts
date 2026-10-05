// Labels and helpers shared by the fusion page, job center and dataset detail (S12).
import type { Blocker, FusionRequest, Normalization } from '../api/analysisApi';
import { blockerCode } from '../api/analysisApi';

export const BLOCKER_TEXT: Record<string, string> = {
  NO_OVERLAP: '입력 데이터의 공간 범위가 서로 겹치지 않습니다. 범위를 “합집합”으로 바꾸거나 다른 데이터를 고르세요.',
  NO_TIMES: '조건에 맞는 시점이 하나도 없습니다. 시간 규칙을 “가장 가까운 시점”이나 “기간 집계”로 바꿔 보세요.',
  QUOTA_EXCEEDED: '저장 용량(quota)을 초과합니다. 결과가 더 작아지도록 기간·범위를 줄이거나 기존 데이터를 정리하세요.',
  FORMULA_INVALID: '수식에 오류가 있습니다. 수식 단계에서 표시된 위치를 고쳐 주세요.',
  INPUT_NOT_FOUND: '입력 데이터를 찾을 수 없거나 사용할 권한이 없습니다. 입력 단계에서 다른 데이터를 고르세요.',
  VARIABLE_NOT_FOUND: '입력 데이터에 선택한 변수가 없습니다. 입력 단계에서 변수를 다시 고르세요.',
};
export const blockerText = (blocker: Blocker) =>
  (typeof blocker === 'object' && blocker.message) || BLOCKER_TEXT[blockerCode(blocker)] || `실행할 수 없습니다. (${blockerCode(blocker)})`;

export const GRID_LABEL = { coarsest: '가장 저해상도', finest: '가장 고해상도', datacube: '특정 데이터' } as const;
export const RESAMPLING_LABEL = { average: '평균', nearest: '최근접', bilinear: '쌍선형' } as const;
export const EXTENT_LABEL = { intersection: '교집합', union: '합집합' } as const;
export const TIME_LABEL = { exact: '정확히 일치', nearest: '허용 오차 내 최근접', aggregate: '기간 집계' } as const;
export const PERIOD_LABEL = { day: '일', month: '월', year: '년' } as const;
export const AGG_LABEL = { mean: '평균', max: '최대', min: '최소', median: '중앙값' } as const;

export const normalizationLabel = (value: Normalization) =>
  value === 'auto' ? '자동(위성별 계수)' : value === 'none' ? '적용 안 함' : `직접 입력 (×${value.scale} + ${value.offset})`;

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

export const defaultName = (firstDataset: string | undefined, now = new Date()) =>
  `${firstDataset ?? '데이터'}_융합_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

/** The request kept on a job or dataset may be partial; unknown shapes are ignored. */
export const asFusionRequest = (value: unknown): Partial<FusionRequest> | null =>
  value && typeof value === 'object' && typeof (value as FusionRequest).formula === 'string' ? (value as Partial<FusionRequest>) : null;
