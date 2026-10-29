export type ModuleCapabilityGateState =
  "loading" | "error" | "setup" | "disabled" | "forbidden" | "ready";

export function resolveModuleCapabilityGate(input: {
  readonly isLoading: boolean;
  readonly hasError: boolean;
  readonly hasData: boolean;
  readonly enabled?: boolean;
  readonly setupRequired?: boolean;
  readonly canRead?: boolean;
}): ModuleCapabilityGateState {
  if (input.isLoading) return "loading";
  if (input.hasError || !input.hasData) return "error";
  if (input.setupRequired === true) return "setup";
  if (input.enabled === false) return "disabled";
  if (input.canRead === false) return "forbidden";
  return "ready";
}
