import { describe, expect, it, vi } from "vitest";
import { applyTicketUpdatedPayload } from "./apply-ticket-updated";
import { nextJoinedTicketRoom } from "./next-joined-ticket-room";
import { subscribeSocketEvent } from "./subscribe-socket-event";
import {
  isStaleTicketEvent,
  reconcileOptimisticMessage,
  upsertTicketMessage,
} from "./upsert-ticket-message";
import type { TicketMessageResponse } from "@/services/tickets-collaboration-api";
import type { TicketResponse } from "@/services/tickets-api";

const baseTicket: TicketResponse = {
  id: "ticket-a",
  ticketNumber: "T-1",
  title: "VPN",
  description: "down",
  status: "IN_PROGRESS",
  priority: "HIGH",
  impact: "HIGH",
  urgency: "MEDIUM",
  classification: "INTERNAL",
  isConfidential: false,
  formData: null,
  originUnitId: "ou-1",
  serviceId: "svc-1",
  formVersionRef: "form-1",
  requesterId: "user-1",
  assignedGroupId: "group-1",
  assignedUserId: "agent-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

const message = (id: string, extra: Partial<TicketMessageResponse> = {}): TicketMessageResponse => ({
  id,
  ticketId: "ticket-a",
  type: "AGENT_REPLY",
  body: "hello",
  authorUserId: "agent-1",
  createdAt: "2026-09-13T08:00:00.000Z",
  ...extra,
});

describe("ticket realtime helpers", () => {
  it("ignores stale events for a different open ticket", () => {
    expect(isStaleTicketEvent("ticket-b", "ticket-a")).toBe(true);
    expect(isStaleTicketEvent("ticket-a", "ticket-a")).toBe(false);
    expect(isStaleTicketEvent(undefined, "ticket-a")).toBe(true);
  });

  it("switches rooms without keeping the previous ticket joined", () => {
    expect(nextJoinedTicketRoom("ticket-a", "ticket-b")).toEqual({
      leave: "ticket-a",
      join: "ticket-b",
    });
    expect(nextJoinedTicketRoom("ticket-a", "ticket-a")).toEqual({
      leave: null,
      join: null,
    });
  });

  it("dedupes socket messages and reconciles optimistic pending rows", () => {
    const pending = message("pending:1");
    const confirmed = message("msg-1");
    const first = upsertTicketMessage([pending], confirmed);
    expect(first.map((item) => item.id)).toEqual(["msg-1"]);
    expect(upsertTicketMessage(first, confirmed).map((item) => item.id)).toEqual(["msg-1"]);
    expect(
      reconcileOptimisticMessage([pending, confirmed], confirmed, "pending:1").map(
        (item) => item.id,
      ),
    ).toEqual(["msg-1"]);
  });

  it("does not replace an open ticket with another ticket payload", () => {
    const next = applyTicketUpdatedPayload(baseTicket, {
      ticketId: "ticket-b",
      change: "status",
      sourceAction: "ticket_resolved",
      status: "RESOLVED",
      priority: "HIGH",
      assignedUserId: "agent-1",
      assignedGroupId: "group-1",
      archivedAt: null,
      resolvedAt: "2026-09-13T08:00:00.000Z",
      closedAt: null,
      occurredAt: "2026-09-13T08:00:00.000Z",
    });
    expect(next?.status).toBe("IN_PROGRESS");
    expect(
      applyTicketUpdatedPayload(baseTicket, {
        ticketId: "ticket-a",
        change: "status",
        sourceAction: "ticket_resolved",
        status: "RESOLVED",
        priority: "HIGH",
        assignedUserId: "agent-1",
        assignedGroupId: "group-1",
        archivedAt: null,
        resolvedAt: "2026-09-13T08:00:00.000Z",
        closedAt: null,
        occurredAt: "2026-09-13T08:00:00.000Z",
      })?.status,
    ).toBe("RESOLVED");
  });

  it("keeps the existing SLA snapshot when applying a ticket.updated payload", () => {
    const current: TicketResponse = {
      ...baseTicket,
      sla: {
        startedAt: "2026-09-13T06:00:00.000Z",
        responseDueAt: "2026-09-13T08:00:00.000Z",
        resolutionDueAt: "2026-09-13T16:00:00.000Z",
        respondedAt: "2026-09-13T07:00:00.000Z",
        resolutionCompletedAt: null,
        pausedAt: null,
        isResponseBreached: false,
        isResolutionBreached: false,
      },
    };
    expect(
      applyTicketUpdatedPayload(current, {
        ticketId: "ticket-a",
        change: "status",
        sourceAction: "ticket_resolved",
        status: "RESOLVED",
        priority: "HIGH",
        assignedUserId: "agent-1",
        assignedGroupId: "group-1",
        archivedAt: null,
        resolvedAt: "2026-09-13T08:00:00.000Z",
        closedAt: null,
        occurredAt: "2026-09-13T08:00:00.000Z",
      })?.sla?.respondedAt,
    ).toBe("2026-09-13T07:00:00.000Z");
  });

  it("unsubscribes the same handler to prevent duplicate listeners", () => {
    const socket = { on: vi.fn(), off: vi.fn() };
    const handler = vi.fn();
    const stop = subscribeSocketEvent(socket as never, "ticket.message.created", handler);
    stop();
    stop();
    expect(socket.on).toHaveBeenCalledTimes(1);
    expect(socket.off).toHaveBeenCalledTimes(2);
    expect(socket.off).toHaveBeenCalledWith("ticket.message.created", handler);
  });
});
