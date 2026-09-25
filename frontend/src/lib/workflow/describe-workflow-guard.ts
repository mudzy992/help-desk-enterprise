import type { TicketWorkflowResponse, WorkflowGuard } from "@/services/workflow-api";

type Parameters = TicketWorkflowResponse["parameters"];

export type GuardDescription = {
  readonly key: `workflow.guards.${WorkflowGuard}`;
  readonly values: Readonly<Record<string, number | string>>;
  /** The guard exists in the flow but the installation has it switched off. */
  readonly inactive: boolean;
};

/**
 * Paket 1.7 (W2/W3): a guard, as this installation actually applies it —
 * the numbers come from the live settings, not from a generic description.
 */
export function describeWorkflowGuard(guard: WorkflowGuard, parameters: Parameters): GuardDescription {
  switch (guard) {
    case "close_code":
      return {
        key: "workflow.guards.close_code",
        values: {},
        inactive: parameters.closeCodes === null || !parameters.closeCodes.enabled || !parameters.closeCodes.requireOnResolve,
      };
    case "required_fields":
      return {
        key: "workflow.guards.required_fields",
        values: { count: parameters.requiredFields?.globalCount ?? 0 },
        inactive: parameters.requiredFields === null || !parameters.requiredFields.enabled,
      };
    case "resolution_note":
      return { key: "workflow.guards.resolution_note", values: {}, inactive: false };
    case "approval_decision":
      return {
        key: "workflow.guards.approval_decision",
        values: {},
        inactive: parameters.approvals === null || !parameters.approvals.enabled,
      };
    case "reopen_window":
      return {
        key: "workflow.guards.reopen_window",
        values: { days: parameters.reopen?.windowDays ?? 0 },
        inactive: parameters.reopen === null || !parameters.reopen.enabled,
      };
    case "waiting_auto_close":
      return {
        key: "workflow.guards.waiting_auto_close",
        values: { days: parameters.waitingForUser?.autoCloseAfterDays ?? 0 },
        inactive: parameters.waitingForUser === null || !parameters.waitingForUser.enabled,
      };
    case "archive_after":
      return {
        key: "workflow.guards.archive_after",
        values: { days: parameters.archive?.afterClosedDays ?? 0 },
        inactive: parameters.archive === null || !parameters.archive.enabled,
      };
    case "group_required":
      return { key: "workflow.guards.group_required", values: {}, inactive: false };
  }
}
