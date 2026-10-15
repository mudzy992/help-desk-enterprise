import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  loadInstallSetupStatus,
  type InstallStepKey,
  type InstallStepState,
} from "@/services/install-api";
import {
  loadInstallReadiness,
  type InstallProfile,
  type InstallReadiness,
} from "@/services/install-profile-api";
import type { InstallWizardStep } from "@/services/install-api";

type InstallSetupStatusState =
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | {
      readonly status: "ready";
      readonly isCompleted: boolean;
      /** F0.3/IN4: the step the wizard opens on — the server decides, the shell obeys. */
      readonly nextStep: InstallWizardStep | undefined;
      readonly steps: Readonly<Record<InstallStepKey, InstallStepState>> | undefined;
      /** F1: the package chosen in the wizard, `null` while none is stored. */
      readonly profile: InstallProfile | null;
      /** F1: readiness as last read; `null` when it could not be read. */
      readonly readiness: InstallReadiness | null;
    };

type InstallSetupState = InstallSetupStatusState & {
  readonly markCompleted: () => void;
  readonly reload: () => void;
};

const LOADING_STATE: InstallSetupStatusState = { status: "loading" };

const InstallSetupContext = createContext<InstallSetupState | null>(null);

/**
 * F0.3 (IN4/IN5): this provider is the **only** place that reads
 * `GET /install/status`. The wizard page used to fire a second request and, when
 * it failed, drop the operator onto the SuperAdmin step regardless of where the
 * installation actually was. Here a failure is an error screen with a retry, and
 * a step that saves calls `reload()` instead of moving a private step cursor.
 */
export function InstallSetupProvider({ children }: { readonly children: ReactNode }) {
  const [state, setState] = useState<InstallSetupStatusState>(LOADING_STATE);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let isCancelled = false;
    // A refresh keeps the current screen while it loads; only the first request
    // (or a retry after an error) shows the gate skeleton.
    setState((current) => (current.status === "ready" ? current : LOADING_STATE));
    void Promise.all([
      loadInstallSetupStatus(),
      // F1: readiness is advisory on this screen — a failed read must not hide
      // the wizard, so it degrades to `null` and the step screens still work.
      loadInstallReadiness().catch(() => null),
    ])
      .then(([status, readiness]) => {
        if (isCancelled) return;
        setState({
          status: "ready",
          isCompleted: status.isCompleted,
          nextStep: status.nextStep,
          steps: status.steps,
          profile: status.profile ?? null,
          readiness,
        });
      })
      .catch(() => {
        // An unknown status must not be read as "not installed": the gate
        // stays on an error screen and the user retries explicitly.
        if (!isCancelled) {
          setState({ status: "error" });
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [attempt]);

  const reload = useCallback(() => {
    setAttempt((current) => current + 1);
  }, []);

  const markCompleted = useCallback(() => {
    setState((current) =>
      current.status === "ready"
        ? { ...current, isCompleted: true, nextStep: "complete" }
        : current,
    );
  }, []);

  const value = useMemo<InstallSetupState>(
    () => ({ ...state, reload, markCompleted }),
    [state, reload, markCompleted],
  );

  return <InstallSetupContext.Provider value={value}>{children}</InstallSetupContext.Provider>;
}

export function useInstallSetup(): InstallSetupState {
  const value = useContext(InstallSetupContext);
  if (value === null) {
    throw new Error("useInstallSetup must be used within InstallSetupProvider");
  }
  return value;
}
