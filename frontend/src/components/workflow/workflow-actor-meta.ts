import type { WorkflowActor } from "@/services/workflow-api";

/** One semantic colour per actor, shared by the diagram and legend. */
export const workflowActorColor: Readonly<Record<WorkflowActor, string>> = {
  STAFF: "rgb(var(--primary))",
  REQUESTER: "rgb(var(--ok))",
  APPROVER: "rgb(var(--warning))",
  SYSTEM: "rgb(var(--muted))",
};

export const workflowActors: readonly WorkflowActor[] = [
  "STAFF",
  "REQUESTER",
  "APPROVER",
  "SYSTEM",
];
