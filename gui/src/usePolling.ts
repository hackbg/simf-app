import { useState, useEffect, useCallback } from 'react';

export function usePolling<T>(
  fn: () => Promise<T>,
  intervalMs: number,
) {
  const [data,    setData]    = useState<T | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const poll = useCallback(async () => {
    try {
      const result = await fn();
      setData(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [fn]);

  useEffect(() => {
    poll();
    const id = setInterval(poll, intervalMs);
    return () => clearInterval(id);
  }, [poll, intervalMs]);

  return { data, error, loading };
}
