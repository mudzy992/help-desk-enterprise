import { useCallback, useState } from "react";
import { skipInstallStep, unskipInstallStep } from "@/services/install-profile-api";
import {
  mapInstallStepSkipError,
  type InstallStepSkipErrorKey,
} from "@/lib/map-install-step-skip-error";
import type { InstallStepKey } from "@/services/install-api";

/*
  Install wizard v2 (F3): „Podesi kasnije“ is a server-side fact (F1), and the
  footer may offer it for any step the registry marks `skippable` — SMTP, the team
  and the add-ons today. The server's answer decides where the wizard goes, so the
  hook asks the provider to reload instead of moving a local cursor, and a refusal
  is shown in place: the step is not deferred just because the click happened.
*/

export type InstallStepDeferral = {
  readonly isPending: boolean;
  readonly errorKey: InstallStepSkipErrorKey | null;
  readonly defer: (stepKey: InstallStepKey) => void;
  readonly undo: (stepKey: InstallStepKey) => void;
};

export function useInstallStepDeferral(input: {
  readonly onChanged: () => void;
}): InstallStepDeferral {
  const { onChanged } = input;
  const [isPending, setIsPending] = useState(false);
  const [errorKey, setErrorKey] = useState<InstallStepSkipErrorKey | null>(null);

  const run = useCallback(
    (operation: () => Promise<unknown>) => {
      setErrorKey(null);
      setIsPending(true);
      void operation()
        .then(() => onChanged())
        .catch((error: unknown) => setErrorKey(mapInstallStepSkipError(error)))
        .finally(() => setIsPending(false));
    },
    [onChanged],
  );

  return {
    isPending,
    errorKey,
    defer: useCallback((stepKey: InstallStepKey) => run(() => skipInstallStep(stepKey)), [run]),
    undo: useCallback((stepKey: InstallStepKey) => run(() => unskipInstallStep(stepKey)), [run]),
  };
}
