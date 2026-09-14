import { useEffect, useState } from "react";
import {
  mapConfigVersionError,
  type ConfigVersionErrorKey,
} from "@/lib/config-versions/map-config-version-error";
import { readApiRequestId } from "@/lib/map-api-error";
import {
  diffConfigVersions,
  type ConfigVersionDiff,
} from "@/services/config-versions-api";

export function useConfigVersionDiff(
  versionId: string | null,
  againstId: string | null,
) {
  const [diff, setDiff] = useState<ConfigVersionDiff | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<ConfigVersionErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  useEffect(() => {
    if (versionId === null || againstId === null || versionId === againstId) {
      setDiff(null);
      setErrorKey(null);
      setRequestId(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setErrorKey(null);
    setRequestId(null);
    void diffConfigVersions(versionId, againstId)
      .then((payload) => {
        if (!cancelled) {
          setDiff(payload);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setDiff(null);
          setErrorKey(mapConfigVersionError(error));
          setRequestId(readApiRequestId(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [againstId, versionId]);

  return { diff, isLoading, errorKey, requestId };
}
