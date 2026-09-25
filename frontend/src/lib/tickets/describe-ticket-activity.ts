import type { TFunction } from "i18next";
import {
  ticketPriorityLabelKey,
  ticketSeverityLabelKey,
  ticketStatusLabelKey,
} from "@/lib/tickets/ticket-constants";
import {
  isActivityMessage,
  messageActivityKind,
  parseSystemEventBody,
  systemEventKind,
  systemEventTextKey,
  type TicketActivityKind,
} from "@/lib/tickets/ticket-system-events";
import { ticketText } from "@/lib/tickets/ticket-text";
import type { TicketMessageResponse } from "@/services/tickets-collaboration-api";
import type {
  TicketHistoryChange,
  TicketHistoryEntry,
  TicketPublicActivityEntry,
} from "@/services/tickets-context-api";

export type TicketActivityItem = {
  readonly id: string;
  readonly at: string;
  readonly kind: TicketActivityKind;
  readonly actor: string;
  readonly text: string;
  readonly note: string | null;
};

const historyValueKeys: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  status: ticketStatusLabelKey,
  priority: ticketPriorityLabelKey,
  impact: ticketSeverityLabelKey,
  urgency: ticketSeverityLabelKey,
};

/** The person behind an event, never a raw identifier. */
export function resolveActivityActor(
  authorUserId: string | null,
  authorNames: ReadonlyMap<string, string>,
  t: TFunction,
): string {
  if (authorUserId === null) {
    return ticketText(t, "tickets.activity.system");
  }
  return authorNames.get(authorUserId) ?? ticketText(t, "tickets.detail.unknownUser");
}

export function describeMessageActivity(
  message: TicketMessageResponse,
  authorNames: ReadonlyMap<string, string>,
  t: TFunction,
): TicketActivityItem {
  const actor = resolveActivityActor(message.authorUserId, authorNames, t);
  if (message.type === "APPROVAL_DECISION") {
    return {
      id: message.id,
      at: message.createdAt,
      kind: "approval",
      actor,
      text: ticketText(t, "tickets.activity.approvalDecision"),
      note: message.body.trim().length > 0 ? message.body : null,
    };
  }
  const { action, detail } = parseSystemEventBody(message.body);
  const merge = describeMergeOrPriorityEvent(action, detail, t);
  if (merge !== null) {
    return {
      id: message.id,
      at: message.createdAt,
      kind: messageActivityKind(message),
      actor,
      text: merge.text,
      note: merge.note,
    };
  }
  return {
    id: message.id,
    at: message.createdAt,
    kind: messageActivityKind(message),
    actor,
    text: describeEventText(
      action,
      // A forward event carries its TicketForwardEvent id, not a user id.
      detail === null || action === "ticket_forwarded"
        ? null
        : (authorNames.get(detail) ?? ticketText(t, "tickets.detail.unknownUser")),
      t,
    ),
    note: null,
  };
}

/**
 * Package 1.2 events carry structured details (see backend
 * `formatPriorityEventDetail` and the merge writers):
 *  - `ticket_priority_overridden:FROM:TO:manual|matrix:reason`
 *  - `ticket_merged:HD-1,HD-2:reason`, `ticket_merged_child:HD-1:reason`,
 *    `ticket_unmerged:HD-1:reason`, `ticket_merged_status_propagated:HD-1:STATUS`
 */
export function describeMergeOrPriorityEvent(
  action: string,
  detail: string | null,
  t: TFunction,
): { readonly text: string; readonly note: string | null } | null {
  if (detail === null) {
    return null;
  }
  if (action === "ticket_priority_overridden") {
    const [from = "", to = "", mode = "", ...rest] = detail.split(":");
    const label = (value: string) => {
      const key = (ticketPriorityLabelKey as Readonly<Record<string, string>>)[value];
      return key === undefined ? value : ticketText(t, key);
    };
    return {
      text: ticketText(
        t,
        mode === "matrix" ? "tickets.priority.eventReset" : "tickets.priority.eventManual",
        { from: label(from), to: label(to) },
      ),
      note: rest.join(":").trim() || null,
    };
  }
  const [head = "", ...rest] = detail.split(":");
  const tail = rest.join(":").trim() || null;
  switch (action) {
    case "ticket_merged":
      return {
        text: ticketText(t, "tickets.merge.eventParent", { numbers: head.split(",").join(", ") }),
        note: tail,
      };
    case "ticket_merged_child":
      return { text: ticketText(t, "tickets.merge.eventChild", { number: head }), note: tail };
    case "ticket_unmerged":
      return { text: ticketText(t, "tickets.merge.eventUnmerged", { number: head }), note: tail };
    case "ticket_merged_status_propagated": {
      const key = (ticketStatusLabelKey as Readonly<Record<string, string>>)[tail ?? ""];
      return {
        text: ticketText(t, "tickets.merge.eventPropagated", {
          number: head,
          status: key === undefined ? (tail ?? "") : ticketText(t, key),
        }),
        note: null,
      };
    }
    default:
      return null;
  }
}

/** The last manual priority change, for the "manual" badge tooltip. */
export function findLastPriorityOverride(
  messages: readonly TicketMessageResponse[],
): { readonly authorUserId: string | null; readonly at: string; readonly reason: string | null } | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message === undefined || message.type !== "SYSTEM_EVENT") {
      continue;
    }
    const { action, detail } = parseSystemEventBody(message.body);
    if (action !== "ticket_priority_overridden" || detail === null) {
      continue;
    }
    const [, , mode = "", ...rest] = detail.split(":");
    if (mode !== "manual") {
      return null;
    }
    return { authorUserId: message.authorUserId, at: message.createdAt, reason: rest.join(":").trim() || null };
  }
  return null;
}

/** Event text; an assignment names who the ticket was assigned to. */
function describeEventText(
  action: string,
  targetName: string | null,
  t: TFunction,
): string {
  if (action === "ticket_assigned" && targetName !== null) {
    return ticketText(t, "tickets.activity.assignedTo", { name: targetName });
  }
  return ticketText(t, systemEventTextKey(action));
}

/** An entry from the requester-safe activity endpoint. */
export function describePublicActivity(
  entry: TicketPublicActivityEntry,
  t: TFunction,
): TicketActivityItem {
  return {
    id: entry.id,
    at: entry.createdAt,
    kind: systemEventKind(entry.action),
    actor: entry.actorName ?? ticketText(t, "tickets.activity.system"),
    text: describeEventText(entry.action, entry.targetName, t),
    note: null,
  };
}

function formatHistoryValue(
  field: string,
  value: string | null,
  t: TFunction,
): string {
  if (value === null) {
    return "—";
  }
  const key = historyValueKeys[field]?.[value];
  return key === undefined ? value : ticketText(t, key);
}

function describeHistoryChange(change: TicketHistoryChange, t: TFunction): string {
  return ticketText(t, `tickets.activity.history.${change.field}`, {
    from: formatHistoryValue(change.field, change.from, t),
    to: formatHistoryValue(change.field, change.to, t),
  });
}

export function describeHistoryActivity(
  entry: TicketHistoryEntry,
  t: TFunction,
): TicketActivityItem {
  return {
    id: `history-${entry.id}`,
    at: entry.createdAt,
    kind: entry.changes.some((change) => change.field === "assignedUser" || change.field === "assignedGroup")
      ? "assign"
      : "status",
    actor:
      entry.actorName ??
      ticketText(t, entry.actorUserId === null ? "tickets.activity.system" : "tickets.detail.unknownUser"),
    text: entry.changes.map((change) => describeHistoryChange(change, t)).join("; "),
    note: null,
  };
}

/** System events and field edits merged into one newest-first timeline. */
export function buildActivityTimeline(input: {
  readonly messages: readonly TicketMessageResponse[];
  readonly history: readonly TicketHistoryEntry[];
  readonly publicEntries?: readonly TicketPublicActivityEntry[];
  readonly authorNames: ReadonlyMap<string, string>;
  readonly t: TFunction;
}): readonly TicketActivityItem[] {
  const items = [
    ...(input.publicEntries ?? []).map((entry) => describePublicActivity(entry, input.t)),
    ...input.messages
      .filter(isActivityMessage)
      .map((message) => describeMessageActivity(message, input.authorNames, input.t)),
    ...input.history.map((entry) => describeHistoryActivity(entry, input.t)),
  ];
  return items.sort((left, right) => right.at.localeCompare(left.at));
}
