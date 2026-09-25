import type { TicketStatus } from "@/services/tickets-api";
import type { WorkflowActor, WorkflowPhase, WorkflowTransition } from "@/services/workflow-api";

/**
 * Paket 1.7 (W3): deterministic layout of the status flow — phases are
 * columns, statuses keep a fixed order inside each column, and every edge is
 * a quadratic curve bent to one side so A→B and B→A never overlap.
 */
export const workflowDiagram = {
  width: 900,
  height: 380,
  nodeWidth: 176,
  nodeHeight: 48,
  columnX: { intake: 140, work: 450, done: 760 } as Readonly<Record<WorkflowPhase, number>>,
  rowY: [80, 190, 300] as const,
} as const;

const orderInPhase: Readonly<Record<TicketStatus, number>> = {
  UNROUTED: 0,
  PENDING_APPROVAL: 1,
  PENDING: 2,
  ASSIGNED: 0,
  IN_PROGRESS: 1,
  WAITING_FOR_USER: 2,
  RESOLVED: 0,
  CLOSED: 1,
  ARCHIVED: 2,
};

export type DiagramNode = {
  readonly status: TicketStatus;
  readonly phase: WorkflowPhase;
  readonly x: number;
  readonly y: number;
};

export type DiagramEdge = {
  readonly key: string;
  readonly transition: WorkflowTransition;
  readonly path: string;
  readonly actor: WorkflowActor;
};

export function layoutWorkflowNodes(
  statuses: readonly { readonly status: TicketStatus; readonly phase: WorkflowPhase }[],
): readonly DiagramNode[] {
  return statuses.map(({ status, phase }) => ({
    status,
    phase,
    x: workflowDiagram.columnX[phase],
    y: workflowDiagram.rowY[orderInPhase[status] ?? 0],
  }));
}

/** Point where the ray from the node centre towards `toward` leaves the box. */
export function boxExit(
  center: { readonly x: number; readonly y: number },
  toward: { readonly x: number; readonly y: number },
  padding = 4,
): { x: number; y: number } {
  const halfW = workflowDiagram.nodeWidth / 2 + padding;
  const halfH = workflowDiagram.nodeHeight / 2 + padding;
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  if (dx === 0 && dy === 0) return { x: center.x, y: center.y };
  const scale = Math.min(
    dx === 0 ? Number.POSITIVE_INFINITY : halfW / Math.abs(dx),
    dy === 0 ? Number.POSITIVE_INFINITY : halfH / Math.abs(dy),
  );
  return { x: center.x + dx * scale, y: center.y + dy * scale };
}

/** The actor that colours an edge: the most "human" one wins. */
export function primaryActor(actors: readonly WorkflowActor[]): WorkflowActor {
  for (const actor of ["REQUESTER", "APPROVER", "STAFF", "SYSTEM"] as const) {
    if (actors.includes(actor)) return actor;
  }
  return "STAFF";
}

export function layoutWorkflowEdges(
  nodes: readonly DiagramNode[],
  transitions: readonly WorkflowTransition[],
): readonly DiagramEdge[] {
  const byStatus = new Map(nodes.map((node) => [node.status, node]));
  const edges: DiagramEdge[] = [];
  for (const transition of transitions) {
    const from = byStatus.get(transition.from);
    const to = byStatus.get(transition.to);
    if (from === undefined || to === undefined) continue;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    // Always bend to the left of the travel direction: A→B and B→A separate.
    const bend = Math.min(60, 22 + length * 0.12);
    const control = {
      x: (from.x + to.x) / 2 + (-dy / length) * bend,
      y: (from.y + to.y) / 2 + (dx / length) * bend,
    };
    const start = boxExit(from, control);
    const end = boxExit(to, control, 8);
    edges.push({
      key: `${transition.from}->${transition.to}`,
      transition,
      actor: primaryActor(transition.actors),
      path: `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} Q ${control.x.toFixed(1)} ${control.y.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`,
    });
  }
  return edges;
}
