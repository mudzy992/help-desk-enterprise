import { useCallback, useEffect, useRef, useState } from "react";
import { readApiRequestId } from "@/lib/map-api-error";

export type PartialResource<T, ErrorKey extends string> = {
  readonly data: T | null;
  readonly errorKey: ErrorKey | null;
  readonly requestId: string | null;
  readonly isLoading: boolean;
  readonly isRefreshing: boolean;
  readonly retry: () => Promise<void>;
};

type Options<T, ErrorKey extends string> = {
  readonly load: () => Promise<T>;
  readonly mapError: (error: unknown) => ErrorKey;
  readonly enabled?: boolean;
  readonly resetKey?: string | number | null;
};

/** Shared state contract; domain callers retain ownership of fetching and error mapping. */
export function usePartialResource<T, ErrorKey extends string>({
  load,
  mapError,
  enabled = true,
  resetKey = null,
}: Options<T, ErrorKey>): PartialResource<T, ErrorKey> {
  const [data, setData] = useState<T | null>(null);
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const dataRef = useRef<T | null>(null);
  const sequence = useRef(0);

  const retry = useCallback(async () => {
    if (!enabled) return;
    const request = ++sequence.current;
    const hasData = dataRef.current !== null;
    setIsLoading(!hasData);
    setIsRefreshing(hasData);
    setErrorKey(null);
    setRequestId(null);
    try {
      const loaded = await load();
      if (request !== sequence.current) return;
      dataRef.current = loaded;
      setData(loaded);
    } catch (error) {
      if (request !== sequence.current) return;
      setErrorKey(mapError(error));
      setRequestId(readApiRequestId(error));
    } finally {
      if (request === sequence.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [enabled, load, mapError]);

  useEffect(() => {
    if (!enabled) {
      sequence.current += 1;
      dataRef.current = null;
      setData(null);
      setErrorKey(null);
      setRequestId(null);
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }
    void retry();
    return () => {
      sequence.current += 1;
    };
  }, [enabled, resetKey, retry]);

  return { data, errorKey, requestId, isLoading, isRefreshing, retry };
}
