import { ApiError } from "@/services/api";

export type InstallStepSkipErrorKey =
  | "install.step.skipErrorLocked"
  | "install.step.skipErrorNotAllowed"
  | "install.step.skipErrorUnknown"
  | "install.step.skipErrorGeneric";

/*
  Install wizard v2 (F3): „Podesi kasnije“ goes through the F1 endpoints, and the
  server is the one that knows whether a step may be deferred at all. The mapping
  keeps that answer — the UI never decides that a step is skippable on its own.
*/

export function mapInstallStepSkipError(error: unknown): InstallStepSkipErrorKey {
  if (!(error instanceof ApiError)) {
    return "install.step.skipErrorGeneric";
  }
  if (error.code === "INSTALL_LOCKED") {
    return "install.step.skipErrorLocked";
  }
  if (error.status === 400) {
    return error.code === "INSTALL_STEP_UNKNOWN"
      ? "install.step.skipErrorUnknown"
      : "install.step.skipErrorNotAllowed";
  }
  return "install.step.skipErrorGeneric";
}
