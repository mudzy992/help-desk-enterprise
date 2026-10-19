import { parseIncidentEventDetail } from "@/lib/status/status-view";
import type { TFunction } from "i18next";
import {
  ticketPriorityTranslationKey,
  ticketStatusTranslationKey,
} from "@/lib/tickets/ticket-constants";
import { parseSystemEventBody } from "@/lib/tickets/ticket-system-events";
import type { TicketMessageResponse } from "@/services/tickets-collaboration-api";

/**
 * Ticket events carry structured details (see backend
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
  // `inbound_attachment_rejected:<file name>|<reason code>`.
  if (action === "inbound_attachment_rejected") {
    const separator = detail.lastIndexOf("|");
    const name = separator >= 0 ? detail.slice(0, separator) : detail;
    const reason = separator >= 0 ? detail.slice(separator + 1) : "";
    return {
      text: t("tickets.activity.inboundAttachmentRejected", { name }),
      note: reason.length > 0 ? reason : null,
    };
  }
  // `ticket_incident_*:<incidentId>|<title>`.
  if (
    action === "ticket_incident_linked" ||
    action === "ticket_incident_unlinked" ||
    action === "ticket_incident_resolved"
  ) {
    const parsed = parseIncidentEventDetail(detail);
    if (parsed === null) {
      return null;
    }
    const key =
      action === "ticket_incident_linked"
        ? "tickets.activity.incidentLinked"
        : action === "ticket_incident_unlinked"
          ? "tickets.activity.incidentUnlinked"
          : "tickets.activity.incidentResolved";
    return { text: t(key, { title: parsed.title }), note: null };
  }
  // `ticket_problem_*:<problemId>|<number> <title>` (staff only).
  if (action === "ticket_problem_linked" || action === "ticket_problem_unlinked") {
    const parsed = parseIncidentEventDetail(detail);
    if (parsed === null) {
      return null;
    }
    const key =
      action === "ticket_problem_linked"
        ? "tickets.activity.problemLinked"
        : "tickets.activity.problemUnlinked";
    return { text: t(key, { problem: parsed.title }), note: null };
  }
  // unstarted ticket taken over by the problem group resolution.
  if (action === "ticket_problem_takeover") {
    const parsed = parseIncidentEventDetail(detail);
    if (parsed === null) {
      return null;
    }
    return {
      text: t("tickets.activity.problemTakeover", { problem: parsed.title }),
      note: null,
    };
  }
  // `ticket_knowledge_draft_created:<articleId>|<title>` (staff only).
  if (action === "ticket_knowledge_draft_created") {
    const parsed = parseIncidentEventDetail(detail);
    if (parsed === null) {
      return null;
    }
    return {
      text: t("tickets.activity.knowledgeDraftCreated", { title: parsed.title }),
      note: null,
    };
  }
  if (action === "ticket_priority_overridden") {
    const [from = "", to = "", mode = "", ...rest] = detail.split(":");
    const label = (value: string) => {
      const key = ticketPriorityTranslationKey(value);
      return key === null ? value : t(key);
    };
    return {
      text: t(mode === "matrix" ? "tickets.priority.eventReset" : "tickets.priority.eventManual", {
        from: label(from),
        to: label(to),
      }),
      note: rest.join(":").trim() || null,
    };
  }
  const [head = "", ...rest] = detail.split(":");
  const tail = rest.join(":").trim() || null;
  switch (action) {
    case "ticket_merged":
      return {
        text: t("tickets.merge.eventParent", { numbers: head.split(",").join(", ") }),
        note: tail,
      };
    case "ticket_merged_child":
      return { text: t("tickets.merge.eventChild", { number: head }), note: tail };
    case "ticket_unmerged":
      return { text: t("tickets.merge.eventUnmerged", { number: head }), note: tail };
    case "ticket_merged_status_propagated": {
      const key = ticketStatusTranslationKey(tail ?? "");
      return {
        text: t("tickets.merge.eventPropagated", {
          number: head,
          status: key === null ? (tail ?? "") : t(key),
        }),
        note: null,
      };
    }
    default:
      return null;
  }
}

/** The last manual priority change, for the "manual" badge tooltip. */
export function findLastPriorityOverride(messages: readonly TicketMessageResponse[]): {
  readonly authorUserId: string | null;
  readonly at: string;
  readonly reason: string | null;
} | null {
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
    return {
      authorUserId: message.authorUserId,
      at: message.createdAt,
      reason: rest.join(":").trim() || null,
    };
  }
  return null;
}
