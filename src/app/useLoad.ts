import { useCallback, useEffect, useRef, useState } from 'react';
import { userMessage } from '../api/httpClient';

export type Load<T> = { data: T | null; loading: boolean; error: string; status?: number; reload: () => void; setData: (update: (current: T | null) => T | null) => void };

/** Loads data on mount and whenever `key` changes; keeps the error message and HTTP status. */
export function useLoad<T>(loader: () => Promise<T>, key: unknown[] = []): Load<T> {
  const [data, setDataState] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<number>();
  const [tick, setTick] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setStatus(undefined);
    loaderRef.current()
      .then((value) => { if (!cancelled) setDataState(value); })
      .catch((cause) => {
        if (cancelled) return;
        setError(userMessage(cause));
        setStatus(typeof cause?.status === 'number' ? cause.status : undefined);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...key]);
  const reload = useCallback(() => setTick((value) => value + 1), []);
  const setData = useCallback((update: (current: T | null) => T | null) => setDataState(update), []);
  return { data, loading, error, status, reload, setData };
}
