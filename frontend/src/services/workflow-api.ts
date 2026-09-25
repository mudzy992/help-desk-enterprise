import { apiRequest } from "@/services/api";
import type { TicketStatus } from "@/services/tickets-api";

/** Paket 1.7 (W2): `GET /workflow/ticket-status`, ADMIN/SUPER_ADMIN only. */
export type WorkflowActor = "STAFF" | "REQUESTER" | "APPROVER" | "SYSTEM";
export type WorkflowTrigger = "status_change" | "claim" | "forward" | "approval" | "reopen" | "automation";
export type WorkflowGuard =
  | "close_code"
  | "required_fields"
  | "resolution_note"
  | "approval_decision"
  | "reopen_window"
  | "waiting_auto_close"
  | "archive_after"
  | "group_required"
  | "playbook_steps";
export type WorkflowPhase = "intake" | "work" | "done";

export type WorkflowTransition = {
  readonly from: TicketStatus;
  readonly to: TicketStatus;
  readonly actors: readonly WorkflowActor[];
  readonly triggers: readonly WorkflowTrigger[];
  readonly guards: readonly WorkflowGuard[];
};

export type TicketWorkflowResponse = {
  readonly statuses: readonly { readonly status: TicketStatus; readonly phase: WorkflowPhase }[];
  readonly transitions: readonly WorkflowTransition[];
  readonly parameters: {
    readonly closeCodes: { readonly enabled: boolean; readonly requireOnResolve: boolean } | null;
    readonly requiredFields: { readonly enabled: boolean; readonly globalCount: number } | null;
    readonly reopen: { readonly enabled: boolean; readonly windowDays: number } | null;
    readonly waitingForUser: {
      readonly enabled: boolean;
      readonly reminderAfterDays: number;
      readonly autoCloseAfterDays: number;
    } | null;
    readonly approvals: { readonly enabled: boolean } | null;
    readonly archive: { readonly enabled: boolean; readonly afterClosedDays: number } | null;
    readonly playbooks?: {
      readonly enabled: boolean;
      readonly requiredStepsOnResolve: "off" | "warn" | "block";
    } | null;
    readonly unrouted: {
      readonly enabled: boolean;
      readonly ownerRole: string;
      readonly cleanupSlaHours: number;
      readonly weeklyDigest: boolean;
      readonly targetGroup: { readonly id: string; readonly name: string } | null;
      readonly targetGroupMissing: boolean;
    };
  };
  readonly editable: false;
};

export function getTicketWorkflow(): Promise<TicketWorkflowResponse> {
  return apiRequest("/workflow/ticket-status");
}
