import { useCallback, useEffect, useRef, useState } from 'react';
import { userMessage } from '../api/httpClient';
import { useLanguage } from '../i18n';

export type Load<T> = {
  data: T | null; loading: boolean; error: string; status?: number;
  /** Loads again and shows it (`loading` turns on; the old data stays until the new arrives). */
  reload: () => void;
  /** Loads again in the background: `loading` stays off, and a failure keeps the data already shown. */
  refresh: () => void;
  setData: (update: (current: T | null) => T | null) => void;
};

/**
 * Loads data on mount and whenever `key` changes; keeps the error message and HTTP status. The message
 * follows the screen language (it is worded at render, so switching language rewords it). The previous data
 * stays while a new key loads, so a page can dim it as stale instead of blanking it.
 */
export function useLoad<T>(loader: () => Promise<T>, key: unknown[] = []): Load<T> {
  const screenLang = useLanguage().lang;
  const [data, setDataState] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<{ cause: unknown } | null>(null);
  const [tick, setTick] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const quiet = useRef(false);
  const hasData = useRef(false);
  useEffect(() => {
    let cancelled = false;
    const silent = quiet.current;
    quiet.current = false;
    if (!silent) { setLoading(true); setFailure(null); }
    loaderRef.current()
      .then((value) => { if (!cancelled) { hasData.current = value != null; setDataState(value); setFailure(null); } })
      .catch((cause) => { if (!cancelled && !(silent && hasData.current)) setFailure({ cause }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...key]);
  const reload = useCallback(() => setTick((value) => value + 1), []);
  const refresh = useCallback(() => { quiet.current = true; setTick((value) => value + 1); }, []);
  const setData = useCallback((update: (current: T | null) => T | null) => setDataState(update), []);
  const cause = failure?.cause as { status?: unknown } | undefined;
  const error = failure ? userMessage(failure.cause, screenLang) : '';
  const status = typeof cause?.status === 'number' ? cause.status : undefined;
  return { data, loading, error, status, reload, refresh, setData };
}
