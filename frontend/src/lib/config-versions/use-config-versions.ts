import { useCallback, useEffect, useRef, useState } from "react";
import {
  mapConfigVersionError,
  type ConfigVersionErrorKey,
} from "@/lib/config-versions/map-config-version-error";
import { readApiRequestId } from "@/lib/map-api-error";
import { listConfigVersions, type ConfigVersion } from "@/services/config-versions-api";

export function useConfigVersions(enabled: boolean) {
  const [versions, setVersions] = useState<readonly ConfigVersion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasSuccessfulLoad = useRef(false);
  const requestSequence = useRef(0);
  const [errorKey, setErrorKey] = useState<ConfigVersionErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    if (!enabled) {
      hasSuccessfulLoad.current = false;
      setVersions([]);
      setIsLoading(false);
      setIsRefreshing(false);
      setErrorKey(null);
      setRequestId(null);
      return;
    }

    const isRefresh = hasSuccessfulLoad.current;
    setIsLoading(!isRefresh);
    setIsRefreshing(isRefresh);
    setErrorKey(null);
    setRequestId(null);
    try {
      const nextVersions = await listConfigVersions();
      if (sequence !== requestSequence.current) return;
      setVersions(nextVersions);
      hasSuccessfulLoad.current = true;
    } catch (error) {
      if (sequence !== requestSequence.current) return;
      // A refresh failure must not destroy the operator's last useful snapshot.
      setErrorKey(mapConfigVersionError(error));
      setRequestId(readApiRequestId(error));
    } finally {
      if (sequence === requestSequence.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [enabled]);

  useEffect(() => {
    void load();
    return () => {
      // Invalidates an in-flight answer on dependency change and unmount.
      requestSequence.current += 1;
    };
  }, [load]);

  return {
    versions,
    isLoading,
    isRefreshing,
    errorKey,
    requestId,
    setErrorKey,
    setRequestId,
    load,
  };
}
