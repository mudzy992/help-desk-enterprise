import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/services/api";

export type InstallStepResourceState<T> =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly error: unknown }
  | { readonly status: "ready"; readonly data: T };

export type InstallStepResource<T> = InstallStepResourceState<T> & {
  /** Runs the loader again from scratch (the only way out of `error`). */
  readonly retry: () => void;
  /** Replaces the loaded data after a successful save, without a refetch. */
  readonly setData: (next: T) => void;
};

/**
 * Every install step loads its own state; previously a
 * failed load fell through to the empty form — which then posted defaults
 * (`local`, SMTP off, defaults catalog) over a configuration that did exist. A
 * step may therefore only render its form from `ready`; `error` shows the shared
 * `InstallStepLoadError` and nothing else.
 *
 * The loader is kept in a ref: an inline arrow does not retrigger the request,
 * while `retry()` does. In-flight requests are ignored after unmount.
 */
export function useInstallStepResource<T>(load: () => Promise<T>): InstallStepResource<T> {
  const [state, setState] = useState<InstallStepResourceState<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let isCancelled = false;
    setState({ status: "loading" });
    void loadRef
      .current()
      .then((data) => {
        if (!isCancelled) setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (!isCancelled) setState({ status: "error", error });
      });
    return () => {
      isCancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);
  const setData = useCallback((next: T) => setState({ status: "ready", data: next }), []);

  if (state.status === "loading") return { status: "loading", retry, setData };
  if (state.status === "error") return { status: "error", error: state.error, retry, setData };
  return { status: "ready", data: state.data, retry, setData };
}

/**
 * The request id of a failed API call, shown next to the retry button so an
 * operator can quote it when the load keeps failing.
 */
export function installStepRequestId(error: unknown): string | null {
  return error instanceof ApiError ? error.requestId : null;
}
