import { useEffect, useMemo, useState } from 'react';
import { GeeEstimate, GeeJobBody } from '../../api/generationApi';
import { userMessage } from '../../api/httpClient';
import { generation } from '../api';

export type EstimateView = { status: 'idle' | 'loading' | 'ok' | 'error'; data?: GeeEstimate; error?: string; retry?: () => void };

/** Debounced dry-run for the current request. The result is dropped as soon as the request changes. */
export function useGeeEstimate(body: GeeJobBody | null, delay = 400): EstimateView {
  const key = body ? JSON.stringify(body) : '';
  const [result, setResult] = useState<{ key: string; view: EstimateView }>({ key: '', view: { status: 'idle' } });
  const latest = useMemo(() => body, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!latest) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setResult({ key, view: { status: 'loading' } });
      generation.estimateGee(latest)
        .then((data) => { if (!cancelled) setResult({ key, view: { status: 'ok', data } }); })
        .catch((cause) => { if (!cancelled) setResult({ key, view: { status: 'error', error: userMessage(cause) } }); });
    }, delay);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [latest, key, delay, attempt]);
  if (!latest) return { status: 'idle' };
  if (result.key !== key) return { status: 'loading' };
  return result.view.status === 'error' ? { ...result.view, retry: () => setAttempt((value) => value + 1) } : result.view;
}
