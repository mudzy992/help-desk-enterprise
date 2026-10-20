import { useRef } from "react";
import { createOperationGuard, type OperationGuard } from "./operation-guard";

/** Keeps one synchronous operation reservation set for a component lifetime. */
export function useOperationGuard(): OperationGuard {
  const guard = useRef<OperationGuard | null>(null);
  guard.current ??= createOperationGuard();
  return guard.current;
}
