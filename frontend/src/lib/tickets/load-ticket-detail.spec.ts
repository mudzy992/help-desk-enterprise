import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Dispatch, SetStateAction } from "react";
import { loadTicketDetail } from "@/lib/tickets/load-ticket-detail";
import type { TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import { ApiError } from "@/services/api";
import { listTicketAttachments } from "@/services/tickets-attachments-api";
import {
  listTicketMessages,
  listTicketParticipants,
  listTicketTimeLogs,
  type TicketMessageResponse,
  type TicketParticipantResponse,
  type TicketTimeLogResponse,
} from "@/services/tickets-collaboration-api";
import { getTicket, listGroupInbox, type TicketResponse } from "@/services/tickets-api";

vi.mock("@/services/tickets-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/tickets-api")>();
  return { ...actual, getTicket: vi.fn(), listGroupInbox: vi.fn() };
});

vi.mock("@/services/tickets-collaboration-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/tickets-collaboration-api")>();
  return {
    ...actual,
    listTicketMessages: vi.fn(),
    listTicketParticipants: vi.fn(),
    listTicketTimeLogs: vi.fn(),
  };
});

vi.mock("@/services/tickets-attachments-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/tickets-attachments-api")>();
  return { ...actual, listTicketAttachments: vi.fn() };
});

const ticket = {
  id: "ticket-a",
  ticketNumber: "T-1",
  title: "VPN",
  description: "down",
  status: "IN_PROGRESS",
  priority: "HIGH",
  impact: "HIGH",
  urgency: "MEDIUM",
  classification: "INTERNAL",
  requestType: null,
  dueAt: null,
  isConfidential: false,
  formData: null,
  originUnitId: "ou-1",
  serviceId: "svc-1",
  formVersionRef: null,
  requesterId: "user-1",
  assignedGroupId: null,
  assignedUserId: "agent-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
} satisfies TicketResponse;

const message = {
  id: "msg-1",
  ticketId: "ticket-a",
  type: "USER_REPLY",
  body: "ne radi",
  authorUserId: "user-1",
  createdAt: "2026-01-02T08:00:00.000Z",
} satisfies TicketMessageResponse;

const participant = {
  id: "part-1",
  ticketId: "ticket-a",
  userId: "agent-1",
  role: "ASSIGNEE",
  createdAt: "2026-01-02T08:00:00.000Z",
} satisfies TicketParticipantResponse;

const timeLog = {
  id: "log-1",
  ticketId: "ticket-a",
  userId: "agent-1",
  minutes: 15,
  startedAt: "2026-01-02T09:00:00.000Z",
  endedAt: "2026-01-02T09:15:00.000Z",
  note: null,
} satisfies TicketTimeLogResponse;

function applyState<T>(current: { value: T }): Dispatch<SetStateAction<T>> {
  return (action) => {
    current.value =
      typeof action === "function" ? (action as (previous: T) => T)(current.value) : action;
  };
}

function targetFor(state: ReturnType<typeof createState>) {
  return {
    ticketId: "ticket-a",
    silent: false,
    setTicket: applyState(state.ticket),
    setMessages: applyState(state.messages),
    setParticipants: applyState(state.participants),
    setTimeLogs: applyState(state.timeLogs),
    setAttachments: applyState(state.attachments),
    setAttachmentsVisible: applyState(state.attachmentsVisible),
    setTimeVisible: applyState(state.timeVisible),
    setErrorKey: applyState(state.errorKey),
    setActionError: applyState(state.actionError),
    setIsLoading: applyState(state.isLoading),
  };
}

function createState() {
  return {
    ticket: { value: null as TicketResponse | null },
    messages: { value: [] as readonly TicketMessageResponse[] },
    participants: { value: [] as readonly TicketParticipantResponse[] },
    timeLogs: { value: [] as readonly TicketTimeLogResponse[] },
    attachments: { value: [] as readonly { id: string }[] },
    attachmentsVisible: { value: false },
    timeVisible: { value: false },
    errorKey: { value: null as TicketErrorKey | null },
    actionError: { value: null as TicketErrorKey | null },
    isLoading: { value: true },
  };
}

describe("loadTicketDetail ", () => {
  beforeEach(() => {
    vi.mocked(getTicket).mockReset();
    vi.mocked(getTicket).mockResolvedValue(ticket);
    vi.mocked(listGroupInbox).mockReset();
    vi.mocked(listTicketMessages).mockReset();
    vi.mocked(listTicketMessages).mockResolvedValue([message]);
    vi.mocked(listTicketParticipants).mockReset();
    vi.mocked(listTicketParticipants).mockResolvedValue([participant]);
    vi.mocked(listTicketTimeLogs).mockReset();
    vi.mocked(listTicketTimeLogs).mockResolvedValue([timeLog]);
    vi.mocked(listTicketAttachments).mockReset();
    vi.mocked(listTicketAttachments).mockResolvedValue([]);
  });

  it("reads the panels while the conversation is still on its way", async () => {
    let releaseMessages: ((rows: TicketMessageResponse[]) => void) | undefined;
    vi.mocked(listTicketMessages).mockImplementation(
      () =>
        new Promise<TicketMessageResponse[]>((resolve) => {
          releaseMessages = resolve;
        }),
    );
    const state = createState();

    const loading = loadTicketDetail(targetFor(state));
    await Promise.resolve();

    // Ostala čitanja pokreću se dok se poruke još učitavaju, a grupni inbox
    // se više uopće ne dohvata.
    expect(listTicketTimeLogs).toHaveBeenCalledTimes(1);
    expect(listTicketAttachments).toHaveBeenCalledTimes(1);
    expect(listGroupInbox).not.toHaveBeenCalled();

    releaseMessages?.([message]);
    await loading;

    expect(state.messages.value.map((row) => row.id)).toEqual(["msg-1"]);
    expect(state.participants.value.map((row) => row.id)).toEqual(["part-1"]);
    expect(state.timeLogs.value.map((row) => row.id)).toEqual(["log-1"]);
    expect(state.timeVisible.value).toBe(true);
    expect(state.attachmentsVisible.value).toBe(true);
    expect(state.errorKey.value).toBeNull();
    expect(state.isLoading.value).toBe(false);
  });

  it("hides a panel the caller may not see without reporting a fault", async () => {
    vi.mocked(listTicketTimeLogs).mockRejectedValue(new ApiError(403, "FORBIDDEN", ""));
    const loggedErrors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const state = createState();

    await loadTicketDetail(targetFor(state));

    expect(state.timeVisible.value).toBe(false);
    expect(state.attachmentsVisible.value).toBe(true);
    expect(state.errorKey.value).toBeNull();
    expect(state.actionError.value).toBeNull();
    expect(loggedErrors).not.toHaveBeenCalled();
    loggedErrors.mockRestore();
  });

  it("reports a panel that fails for a reason other than missing access", async () => {
    vi.mocked(listTicketAttachments).mockRejectedValue(new ApiError(500, "INTERNAL", ""));
    const loggedErrors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const state = createState();

    await loadTicketDetail(targetFor(state));

    expect(state.attachmentsVisible.value).toBe(false);
    // Stranica se ipak otvara; dodatni paneli ne odlučuju o tome.
    expect(state.errorKey.value).toBeNull();
    expect(state.actionError.value).toBe("tickets.errorGeneric");
    expect(state.messages.value).toHaveLength(1);
    expect(loggedErrors).toHaveBeenCalled();
    loggedErrors.mockRestore();
  });
});
