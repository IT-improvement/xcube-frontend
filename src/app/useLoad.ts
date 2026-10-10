import { useCallback, useEffect, useRef, useState } from 'react';
import { userMessage } from '../api/httpClient';
import { useLanguage } from '../i18n';
import type { Lang } from '../i18n';

export type Load<T> = { data: T | null; loading: boolean; error: string; status?: number; reload: () => void; setData: (update: (current: T | null) => T | null) => void };

/**
 * Loads data on mount and whenever `key` changes; keeps the error message and HTTP status. The message
 * follows the screen language (it is worded at render, so switching language rewords it); pass `lang`
 * to pin it, as the Korean-only add-data wizard does.
 */
export function useLoad<T>(loader: () => Promise<T>, key: unknown[] = [], lang?: Lang): Load<T> {
  const screenLang = useLanguage().lang;
  const [data, setDataState] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<{ cause: unknown } | null>(null);
  const [tick, setTick] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailure(null);
    loaderRef.current()
      .then((value) => { if (!cancelled) setDataState(value); })
      .catch((cause) => { if (!cancelled) setFailure({ cause }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...key]);
  const reload = useCallback(() => setTick((value) => value + 1), []);
  const setData = useCallback((update: (current: T | null) => T | null) => setDataState(update), []);
  const cause = failure?.cause as { status?: unknown } | undefined;
  const error = failure ? userMessage(failure.cause, lang ?? screenLang) : '';
  const status = typeof cause?.status === 'number' ? cause.status : undefined;
  return { data, loading, error, status, reload, setData };
}
