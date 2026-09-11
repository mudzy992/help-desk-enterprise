import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { loadInstallSetupStatus } from "@/services/install-api";

type InstallSetupState = {
  readonly isLoading: boolean;
  readonly isCompleted: boolean;
};

const InstallSetupContext = createContext<InstallSetupState | null>(null);

export function InstallSetupProvider({ children }: { readonly children: ReactNode }) {
  const [state, setState] = useState<InstallSetupState>({
    isLoading: true,
    isCompleted: false,
  });

  useEffect(() => {
    let isCancelled = false;
    void loadInstallSetupStatus()
      .then((status) => {
        if (!isCancelled) {
          setState({ isLoading: false, isCompleted: status.isCompleted });
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setState({ isLoading: false, isCompleted: false });
        }
      });
    return () => {
      isCancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({
      isLoading: state.isLoading,
      isCompleted: state.isCompleted,
    }),
    [state],
  );

  return (
    <InstallSetupContext.Provider value={value}>
      {children}
    </InstallSetupContext.Provider>
  );
}

export function useInstallSetup(): InstallSetupState {
  const value = useContext(InstallSetupContext);
  if (value === null) {
    throw new Error("useInstallSetup must be used within InstallSetupProvider");
  }
  return value;
}
