import { useCallback, useState } from "react";
import {
  mapConfigVersionError,
  type ConfigVersionErrorKey,
} from "@/lib/config-versions/map-config-version-error";
import { readApiRequestId } from "@/lib/map-api-error";
import {
  shadowConfigVersion,
  type ConfigShadowDiff,
} from "@/services/config-versions-api";

export function useConfigVersionShadow() {
  const [result, setResult] = useState<ConfigShadowDiff | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const clear = useCallback(() => {
    setResult(null);
  }, []);

  const run = useCallback(
    async (
      versionId: string,
      onError: (errorKey: ConfigVersionErrorKey, requestId: string | null) => void,
    ): Promise<void> => {
      setIsLoading(true);
      try {
        setResult(await shadowConfigVersion(versionId));
      } catch (error) {
        onError(mapConfigVersionError(error), readApiRequestId(error));
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  return { result, isLoading, clear, run };
}
