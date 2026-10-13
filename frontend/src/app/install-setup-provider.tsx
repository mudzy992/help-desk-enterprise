import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { loadInstallSetupStatus } from "@/services/install-api";

type InstallSetupStatusState =
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | { readonly status: "ready"; readonly isCompleted: boolean };

type InstallSetupState = InstallSetupStatusState & {
  readonly markCompleted: () => void;
  readonly reload: () => void;
};

const LOADING_STATE: InstallSetupStatusState = { status: "loading" };

const InstallSetupContext = createContext<InstallSetupState | null>(null);

export function InstallSetupProvider({ children }: { readonly children: ReactNode }) {
  const [state, setState] = useState<InstallSetupStatusState>(LOADING_STATE);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let isCancelled = false;
    void loadInstallSetupStatus()
      .then((status) => {
        if (!isCancelled) {
          setState({ status: "ready", isCompleted: status.isCompleted });
        }
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
    setState(LOADING_STATE);
    setAttempt((current) => current + 1);
  }, []);

  const markCompleted = useCallback(() => {
    setState({ status: "ready", isCompleted: true });
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
