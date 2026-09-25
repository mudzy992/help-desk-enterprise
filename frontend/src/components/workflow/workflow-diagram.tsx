import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { workflowActorColor, workflowActors } from "@/components/workflow/workflow-actor-meta";
import { ticketStatusLabelKey } from "@/lib/tickets/ticket-constants";
import { TICKET_STATUS_META } from "@/lib/theme/semantic-meta";
import {
  layoutWorkflowEdges,
  layoutWorkflowNodes,
  workflowDiagram,
} from "@/lib/workflow/layout-workflow-diagram";
import type { TicketStatus } from "@/services/tickets-api";
import type { WorkflowPhase, WorkflowTransition } from "@/services/workflow-api";

interface WorkflowDiagramProperties {
  readonly statuses: readonly { readonly status: TicketStatus; readonly phase: WorkflowPhase }[];
  readonly transitions: readonly WorkflowTransition[];
  readonly counts: Readonly<Partial<Record<TicketStatus, number>>>;
  readonly selected: TicketStatus | null;
  readonly onSelect: (status: TicketStatus | null) => void;
}

/** Paket 1.7 (W3): SVG status flow, no chart library. */
export function WorkflowDiagram({ statuses, transitions, counts, selected, onSelect }: WorkflowDiagramProperties) {
  const { t } = useTranslation();
  const nodes = useMemo(() => layoutWorkflowNodes(statuses), [statuses]);
  const edges = useMemo(() => layoutWorkflowEdges(nodes, transitions), [nodes, transitions]);
  const { width, height, nodeWidth, nodeHeight, columnX } = workflowDiagram;
  const isRelated = (transition: WorkflowTransition) =>
    selected === null || transition.from === selected || transition.to === selected;

  return (
    <div className="px-3 pb-3">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="min-w-[720px] w-full"
          role="img"
          aria-label={t("workflow.diagramAria")}
        >
          <defs>
            {workflowActors.map((actor) => (
              <marker
                key={actor}
                id={`wf-arrow-${actor}`}
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill={workflowActorColor[actor]} />
              </marker>
            ))}
          </defs>
          {(Object.keys(columnX) as WorkflowPhase[]).map((phase) => (
            <text
              key={phase}
              x={columnX[phase]}
              y={26}
              textAnchor="middle"
              className="fill-current text-muted-foreground"
              style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase" }}
            >
              {t(`workflow.phases.${phase}`)}
            </text>
          ))}
          {edges.map((edge) => {
            const related = isRelated(edge.transition);
            return (
              <path
                key={edge.key}
                d={edge.path}
                fill="none"
                stroke={workflowActorColor[edge.actor]}
                strokeWidth={related && selected !== null ? 2.2 : 1.5}
                strokeDasharray={edge.actor === "SYSTEM" ? "5 4" : undefined}
                opacity={related ? 0.95 : 0.12}
                markerEnd={`url(#wf-arrow-${edge.actor})`}
              >
                <title>
                  {`${t(ticketStatusLabelKey[edge.transition.from])} → ${t(ticketStatusLabelKey[edge.transition.to])}`}
                </title>
              </path>
            );
          })}
          {nodes.map((node) => {
            const active = selected === node.status;
            const dimmed =
              selected !== null &&
              !active &&
              !transitions.some(
                (item) =>
                  (item.from === selected && item.to === node.status) ||
                  (item.to === selected && item.from === node.status),
              );
            const count = counts[node.status];
            return (
              <g
                key={node.status}
                transform={`translate(${node.x - nodeWidth / 2} ${node.y - nodeHeight / 2})`}
                role="button"
                tabIndex={0}
                aria-pressed={active}
                aria-label={t(ticketStatusLabelKey[node.status])}
                data-testid={`workflow-node-${node.status}`}
                className="cursor-pointer outline-none"
                opacity={dimmed ? 0.35 : 1}
                onClick={() => onSelect(active ? null : node.status)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(active ? null : node.status);
                  }
                }}
              >
                <rect
                  width={nodeWidth}
                  height={nodeHeight}
                  rx={10}
                  style={{
                    fill: "rgb(var(--elevated))",
                    stroke: active ? "rgb(var(--primary))" : "rgb(var(--line-strong))",
                    strokeWidth: active ? 2 : 1,
                  }}
                />
                <circle cx={16} cy={nodeHeight / 2} r={4.5} fill={TICKET_STATUS_META[node.status].dot} />
                <text
                  x={28}
                  y={nodeHeight / 2 + 4}
                  className="fill-current text-foreground"
                  style={{ fontSize: 12.5, fontWeight: 600 }}
                >
                  {t(ticketStatusLabelKey[node.status])}
                </text>
                {count !== undefined ? (
                  <text
                    x={nodeWidth - 12}
                    y={nodeHeight / 2 + 4}
                    textAnchor="end"
                    className="fill-current text-muted-foreground tnum"
                    style={{ fontSize: 11.5 }}
                  >
                    {count.toLocaleString()}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-1 text-[11.5px] text-muted-foreground">
        {workflowActors.map((actor) => (
          <li key={actor} className="flex items-center gap-1.5">
            <svg width="22" height="6" aria-hidden="true">
              <line
                x1="0"
                y1="3"
                x2="22"
                y2="3"
                stroke={workflowActorColor[actor]}
                strokeWidth="2"
                strokeDasharray={actor === "SYSTEM" ? "5 4" : undefined}
              />
            </svg>
            {t(`workflow.actors.${actor}`)}
          </li>
        ))}
        <li className="ml-auto">{t("workflow.diagramHint")}</li>
      </ul>
    </div>
  );
}
