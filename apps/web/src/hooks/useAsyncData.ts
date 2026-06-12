import { useState, useEffect, useCallback } from "react";

interface UseAsyncDataOptions<T> {
  loadFn: () => Promise<T>;
  defaultValue: T;
  immediate?: boolean;
}

interface UseAsyncDataResult<T> {
  data: T;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useAsyncData<T>({
  loadFn,
  defaultValue,
  immediate = true,
}: UseAsyncDataOptions<T>): UseAsyncDataResult<T> {
  const [data, setData] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadFn();
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [loadFn]);

  useEffect(() => {
    if (immediate) {
      reload();
    }
  }, [immediate, reload]);

  return { data, loading, error, reload };
}
