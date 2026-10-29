import { useCallback, useRef, useState } from "react";
import {
  mapConfigVersionError,
  type ConfigVersionErrorKey,
} from "@/lib/config-versions/map-config-version-error";
import { readApiRequestId } from "@/lib/map-api-error";
import { shadowConfigVersion, type ConfigShadowDiff } from "@/services/config-versions-api";

export function useConfigVersionShadow() {
  const [result, setResult] = useState<ConfigShadowDiff | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const requestSequence = useRef(0);

  const clear = useCallback(() => {
    requestSequence.current += 1;
    setResult(null);
    setIsLoading(false);
  }, []);

  const run = useCallback(
    async (
      versionId: string,
      onError: (errorKey: ConfigVersionErrorKey, requestId: string | null) => void,
    ): Promise<void> => {
      const sequence = ++requestSequence.current;
      setIsLoading(true);
      try {
        const next = await shadowConfigVersion(versionId);
        if (sequence === requestSequence.current) setResult(next);
      } catch (error) {
        if (sequence === requestSequence.current) {
          onError(mapConfigVersionError(error), readApiRequestId(error));
        }
      } finally {
        if (sequence === requestSequence.current) setIsLoading(false);
      }
    },
    [],
  );

  return { result, isLoading, clear, run };
}
