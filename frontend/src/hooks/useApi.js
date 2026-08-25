import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client.js';

/**
 * Fetch hook with loading / error state and manual reload.
 * Reloads automatically when path or params (JSON-serialized) change.
 */
export function useApi(path, params = null, { immediate = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState(null);
  const pathRef = useRef(path);
  pathRef.current = path;
  const paramKey = JSON.stringify(params ?? {});
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api(pathRef.current, { params: paramsRef.current || undefined });
      setData(result);
      return result;
    } catch (e) {
      if (e.status !== 401) setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [path, paramKey]);

  useEffect(() => {
    if (immediate) {
      run().catch(() => { /* error surfaced via state */ });
    }
  }, [run, immediate]);

  return { data, loading, error, reload: run, setData };
}
