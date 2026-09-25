import type { WorkflowActor } from "@/services/workflow-api";

/** Paket 1.7 (W3): one colour per actor, shared by the diagram and the legend. */
export const workflowActorColor: Readonly<Record<WorkflowActor, string>> = {
  STAFF: "rgb(var(--primary))",
  REQUESTER: "rgb(var(--ok))",
  APPROVER: "rgb(var(--warning))",
  SYSTEM: "rgb(var(--muted))",
};

export const workflowActors: readonly WorkflowActor[] = ["STAFF", "REQUESTER", "APPROVER", "SYSTEM"];
