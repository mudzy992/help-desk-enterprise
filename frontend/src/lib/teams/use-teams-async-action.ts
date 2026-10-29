import { useCallback, useState } from "react";
import { describeTeamsError, type TeamsErrorDetails } from "@/lib/teams/map-teams-error";

export function useTeamsAsyncAction(): {
  readonly busy: boolean;
  readonly error: TeamsErrorDetails | null;
  readonly clearError: () => void;
  readonly run: <T>(action: () => Promise<T>) => Promise<T | undefined>;
} {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TeamsErrorDetails | null>(null);
  const clearError = useCallback(() => setError(null), []);
  const run = useCallback(async <T>(action: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await action();
    } catch (cause) {
      setError(describeTeamsError(cause));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, clearError, run };
}
