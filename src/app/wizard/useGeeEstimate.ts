import { useEffect, useMemo, useState } from 'react';
import { GeeEstimate, GeeJobBody } from '../../api/generationApi';
import { userMessage } from '../../api/httpClient';
import { generation } from '../api';
import { useLanguage } from '../../i18n';

export type EstimateView = { status: 'idle' | 'loading' | 'ok' | 'error'; data?: GeeEstimate; error?: string; retry?: () => void };

type Stored = { status: EstimateView['status']; data?: GeeEstimate; cause?: unknown };

/**
 * Debounced dry-run for the current request. The result is dropped as soon as the request changes.
 * A failure keeps its cause and is worded at render, so it follows the screen language.
 */
export function useGeeEstimate(body: GeeJobBody | null, delay = 400): EstimateView {
  const { lang } = useLanguage();
  const key = body ? JSON.stringify(body) : '';
  const [result, setResult] = useState<{ key: string; view: Stored }>({ key: '', view: { status: 'idle' } });
  const latest = useMemo(() => body, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!latest) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setResult({ key, view: { status: 'loading' } });
      generation.estimateGee(latest)
        .then((data) => { if (!cancelled) setResult({ key, view: { status: 'ok', data } }); })
        .catch((cause) => { if (!cancelled) setResult({ key, view: { status: 'error', cause } }); });
    }, delay);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [latest, key, delay, attempt]);
  if (!latest) return { status: 'idle' };
  if (result.key !== key) return { status: 'loading' };
  const { cause, ...view } = result.view;
  return view.status === 'error' ? { ...view, error: userMessage(cause, lang), retry: () => setAttempt((value) => value + 1) } : view;
}
