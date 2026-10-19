import type { TicketWorkflowResponse, WorkflowGuard } from "@/services/workflow-api";

type WorkflowParameters = TicketWorkflowResponse["parameters"];

export type GuardDescription = {
  readonly key: `workflow.guards.${WorkflowGuard}`;
  readonly values: Readonly<Record<string, number | string>>;
  /** How this installation enforces the guard. */
  readonly mode: "off" | "on" | "warn" | "block";
};

/**
 * a guard, as this installation actually applies it —
 * the numbers come from the live settings, not from a generic description.
 */
export function describeWorkflowGuard(
  guard: WorkflowGuard,
  parameters: WorkflowParameters,
): GuardDescription {
  switch (guard) {
    case "close_code":
      return {
        key: "workflow.guards.close_code",
        values: {},
        mode:
          parameters.closeCodes === null ||
          !parameters.closeCodes.enabled ||
          !parameters.closeCodes.requireOnResolve
            ? "off"
            : "on",
      };
    case "required_fields":
      return {
        key: "workflow.guards.required_fields",
        values: { count: parameters.requiredFields?.globalCount ?? 0 },
        mode:
          parameters.requiredFields === null || !parameters.requiredFields.enabled ? "off" : "on",
      };
    case "resolution_note":
      return { key: "workflow.guards.resolution_note", values: {}, mode: "on" };
    case "approval_decision":
      return {
        key: "workflow.guards.approval_decision",
        values: {},
        mode: parameters.approvals === null || !parameters.approvals.enabled ? "off" : "on",
      };
    case "reopen_window":
      return {
        key: "workflow.guards.reopen_window",
        values: { days: parameters.reopen?.windowDays ?? 0 },
        mode: parameters.reopen === null || !parameters.reopen.enabled ? "off" : "on",
      };
    case "waiting_auto_close":
      return {
        key: "workflow.guards.waiting_auto_close",
        values: { days: parameters.waitingForUser?.autoCloseAfterDays ?? 0 },
        mode:
          parameters.waitingForUser === null || !parameters.waitingForUser.enabled ? "off" : "on",
      };
    case "archive_after":
      return {
        key: "workflow.guards.archive_after",
        values: { days: parameters.archive?.afterClosedDays ?? 0 },
        mode: parameters.archive === null || !parameters.archive.enabled ? "off" : "on",
      };
    case "group_required":
      return { key: "workflow.guards.group_required", values: {}, mode: "on" };
    case "playbook_steps":
      // only `block` refuses the change; `warn` just asks.
      return {
        key: "workflow.guards.playbook_steps",
        values: {},
        mode:
          parameters.playbooks === undefined ||
          parameters.playbooks === null ||
          !parameters.playbooks.enabled
            ? "off"
            : parameters.playbooks.requiredStepsOnResolve,
      };
  }
}
