// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTicketContext, type TicketContextRevision } from "@/lib/tickets/use-ticket-context";
import { reportClientError } from "@/lib/app/client-logger";
import {
  getTicketAllowedActions,
  getTicketCandidates,
  getTicketHistory,
  getTicketPeople,
  getTicketPublicActivity,
  getTicketSlaContext,
} from "@/services/tickets-context-api";
import type { TicketAllowedActions } from "@/services/tickets-context-api";

vi.mock("@/services/tickets-context-api", () => ({
  getTicketAllowedActions: vi.fn(),
  getTicketCandidates: vi.fn(),
  getTicketHistory: vi.fn(),
  getTicketPeople: vi.fn(),
  getTicketPublicActivity: vi.fn(),
  getTicketSlaContext: vi.fn(),
}));

vi.mock("@/lib/app/client-logger", () => ({
  reportClientError: vi.fn(),
}));

const revision: TicketContextRevision = {
  ticketUpdatedAt: "2026-10-14T10:00:00.000Z",
  messageCount: 1,
  participantCount: 0,
  timeLogCount: 0,
  attachmentCount: 0,
  approvalCount: 0,
};

const actions: TicketAllowedActions = {
  composerAccess: "staff",
  claim: false,
  changeStatus: true,
  split: false,
  forward: false,
  overridePriority: false,
  merge: false,
  unmerge: false,
  requestRemote: false,
  addInternalNote: true,
  waitForUser: false,
  manageParticipants: false,
  trackTime: false,
  uploadAttachments: false,
  viewActivity: true,
  reopen: { enabled: false, eligible: false, createsNewTicket: false, windowEndsAt: null },
};

describe("useTicketContext activity errors", () => {
  beforeEach(() => {
    vi.mocked(getTicketPeople).mockReset().mockResolvedValue({ users: [], groups: [] });
    vi.mocked(getTicketAllowedActions).mockReset().mockResolvedValue(actions);
    vi.mocked(getTicketSlaContext).mockReset().mockResolvedValue({
      profileName: null,
      calendarName: null,
      unavailableReason: null,
    });
    vi.mocked(getTicketHistory)
      .mockReset()
      .mockRejectedValueOnce(new Error("temporarily offline"))
      .mockResolvedValue([]);
    vi.mocked(getTicketPublicActivity).mockReset();
    vi.mocked(getTicketCandidates).mockReset();
    vi.mocked(reportClientError).mockReset();
  });

  afterEach(cleanup);

  it("reports a non-access history failure and exposes a retry", async () => {
    const { result } = renderHook(() => useTicketContext("ticket-1", revision));

    await waitFor(() => expect(result.current.errors.history).toBe("tickets.errorGeneric"));
    expect(result.current.history).toEqual([]);
    expect(reportClientError).toHaveBeenCalledWith("ticket_history_failed", expect.any(Error));

    await act(async () => result.current.retry());
    await waitFor(() => expect(getTicketHistory).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.errors.history).toBeNull());
    expect(result.current.history).toEqual([]);
  });
});
