import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Dispatch, SetStateAction } from "react";
import { sendTicketMessageOptimistic } from "@/lib/tickets/send-ticket-message-optimistic";
import { isPendingMessageId } from "@/lib/realtime/upsert-ticket-message";
import type { TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import { ApiError } from "@/services/api";
import { getTicket, type TicketResponse } from "@/services/tickets-api";
import {
  createTicketMessage,
  type TicketMessageResponse,
} from "@/services/tickets-collaboration-api";

vi.mock("@/services/tickets-collaboration-api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/tickets-collaboration-api")>();
  return { ...actual, createTicketMessage: vi.fn() };
});

vi.mock("@/services/tickets-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/tickets-api")>();
  return { ...actual, getTicket: vi.fn() };
});

const ticket: TicketResponse = {
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

function applyState<T>(current: { value: T }): Dispatch<SetStateAction<T>> {
  return (action) => {
    current.value =
      typeof action === "function"
        ? (action as (previous: T) => T)(current.value)
        : action;
  };
}

describe("sendTicketMessageOptimistic", () => {
  beforeEach(() => {
    vi.mocked(createTicketMessage).mockReset();
    vi.mocked(getTicket).mockReset();
  });

  it("removes the pending row and surfaces a mapped error without losing the throw", async () => {
    vi.mocked(createTicketMessage).mockRejectedValue(
      new ApiError(400, "INVALID_MESSAGE_BODY", ""),
    );
    const messages = { value: [] as readonly TicketMessageResponse[] };
    const actionError = { value: null as TicketErrorKey | null };
    await expect(
      sendTicketMessageOptimistic({
        ticketId: "ticket-a",
        type: "AGENT_REPLY",
        body: "hello",
        authorUserId: "agent-1",
        setMessages: applyState(messages),
        setTicket: applyState({ value: ticket }),
        setActionError: applyState(actionError),
      }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(messages.value).toEqual([]);
    expect(actionError.value).toBe("tickets.errorValidation");
    expect(getTicket).not.toHaveBeenCalled();
  });

  it("reconciles the pending row through socket upsert dedup on success", async () => {
    const created: TicketMessageResponse = {
      id: "msg-1",
      ticketId: "ticket-a",
      type: "AGENT_REPLY",
      body: "hello",
      authorUserId: "agent-1",
      createdAt: "2026-09-13T08:00:00.000Z",
    };
    vi.mocked(createTicketMessage).mockResolvedValue(created);
    vi.mocked(getTicket).mockResolvedValue(ticket);
    const messages = { value: [] as readonly TicketMessageResponse[] };
    await sendTicketMessageOptimistic({
      ticketId: "ticket-a",
      type: "AGENT_REPLY",
      body: "hello",
      authorUserId: "agent-1",
      setMessages: applyState(messages),
      setTicket: applyState({ value: null }),
      setActionError: applyState({ value: "tickets.errorGeneric" }),
    });
    expect(messages.value.map((item) => item.id)).toEqual(["msg-1"]);
    expect(messages.value.some((item) => isPendingMessageId(item.id))).toBe(false);
  });
});
