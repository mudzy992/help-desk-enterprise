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
  systemEventTextKey,
  type TicketActivityKind,
} from "@/lib/tickets/ticket-system-events";
import { ticketText } from "@/lib/tickets/ticket-text";
import type { TicketMessageResponse } from "@/services/tickets-collaboration-api";
import type {
  TicketHistoryChange,
  TicketHistoryEntry,
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
  const { action } = parseSystemEventBody(message.body);
  return {
    id: message.id,
    at: message.createdAt,
    kind: messageActivityKind(message),
    actor,
    text: ticketText(t, systemEventTextKey(action)),
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
  readonly authorNames: ReadonlyMap<string, string>;
  readonly t: TFunction;
}): readonly TicketActivityItem[] {
  const items = [
    ...input.messages
      .filter(isActivityMessage)
      .map((message) => describeMessageActivity(message, input.authorNames, input.t)),
    ...input.history.map((entry) => describeHistoryActivity(entry, input.t)),
  ];
  return items.sort((left, right) => right.at.localeCompare(left.at));
}
