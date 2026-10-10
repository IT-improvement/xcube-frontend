import { useEffect, useMemo, useRef, useState } from 'react';
import { GeeEstimate, GeeJobBody } from '../../api/generationApi';
import { userMessage } from '../../api/httpClient';
import { generation } from '../api';
import { useLanguage } from '../../i18n';

/**
 * The size estimate for the current request (UR-54 W2).
 * - `status` is the state of the request for *these* inputs; the wizard only goes on with `ok`.
 * - While a new estimate is on its way, `data` keeps the last result with `stale: true`, so the panel and
 *   the date table stay in place (dimmed) instead of collapsing and growing back.
 * - `since` is when this round started (for "다시 계산 중 · n초").
 */
export type EstimateView = {
  status: 'idle' | 'loading' | 'ok' | 'error';
  data?: GeeEstimate;
  stale?: boolean;
  since?: number;
  error?: string;
  retry?: () => void;
};

type Stored = { status: EstimateView['status']; data?: GeeEstimate; cause?: unknown };

/**
 * Debounced dry-run of the request. A changed request aborts the one in flight (AbortController), so the
 * browser stops waiting for it; the server-side cancel is a separate backend task.
 * A failure keeps its cause and is worded at render, so it follows the screen language.
 */
export function useGeeEstimate(body: GeeJobBody | null, delay = 400): EstimateView {
  const { lang } = useLanguage();
  const key = body ? JSON.stringify(body) : '';
  const [result, setResult] = useState<{ key: string; view: Stored }>({ key: '', view: { status: 'idle' } });
  const latest = useMemo(() => body, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const [attempt, setAttempt] = useState(0);
  // The last good result, shown dimmed while the next one is calculated.
  const lastData = useRef<GeeEstimate | undefined>(undefined);
  const since = useMemo(() => Date.now(), [key, attempt]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!latest) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setResult({ key, view: { status: 'loading' } });
      generation.estimateGee(latest, controller.signal)
        .then((data) => { if (!controller.signal.aborted) setResult({ key, view: { status: 'ok', data } }); })
        .catch((cause) => { if (!controller.signal.aborted) setResult({ key, view: { status: 'error', cause } }); });
    }, delay);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [latest, key, delay, attempt]);
  if (result.key === key && result.view.status === 'ok') lastData.current = result.view.data;
  if (!latest) return { status: 'idle' };
  if (result.key !== key || result.view.status === 'loading') {
    const data = lastData.current;
    return { status: 'loading', since, ...(data ? { data, stale: true } : {}) };
  }
  const { cause, ...view } = result.view;
  return view.status === 'error' ? { ...view, error: userMessage(cause, lang), retry: () => { setResult({ key, view: { status: 'loading' } }); setAttempt((value) => value + 1); } } : view;
}
