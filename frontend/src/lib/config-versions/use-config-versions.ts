import { useCallback, useEffect, useState } from "react";
import {
  mapConfigVersionError,
  type ConfigVersionErrorKey,
} from "@/lib/config-versions/map-config-version-error";
import { readApiRequestId } from "@/lib/map-api-error";
import {
  listConfigVersions,
  type ConfigVersion,
} from "@/services/config-versions-api";

export function useConfigVersions(enabled: boolean) {
  const [versions, setVersions] = useState<readonly ConfigVersion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<ConfigVersionErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) {
      setVersions([]);
      setIsLoading(false);
      setErrorKey(null);
      setRequestId(null);
      return;
    }
    setIsLoading(true);
    setErrorKey(null);
    setRequestId(null);
    try {
      setVersions(await listConfigVersions());
    } catch (error) {
      setVersions([]);
      setErrorKey(mapConfigVersionError(error));
      setRequestId(readApiRequestId(error));
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  return { versions, isLoading, errorKey, requestId, setErrorKey, setRequestId, load };
}
