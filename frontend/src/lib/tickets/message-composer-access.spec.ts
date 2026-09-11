import { describe, expect, it } from "vitest";
import {
  defaultMessageType,
  messageTypesForAccess,
  resolveComposerAccess,
} from "@/lib/tickets/message-composer-access";
import type { TicketResponse } from "@/services/tickets-api";

const ticket: TicketResponse = {
  id: "t1",
  ticketNumber: "T-000001",
  title: "VPN",
  description: "down",
  status: "ASSIGNED",
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

describe("message composer access", () => {
  it("hides staff message types from requesters without inbox access", () => {
    const access = resolveComposerAccess({
      ticket,
      currentUserId: "user-1",
      inboxAccessible: false,
    });
    expect(access).toBe("requester");
    expect(messageTypesForAccess(access)).toEqual(["USER_REPLY"]);
    expect(defaultMessageType(access)).toBe("USER_REPLY");
  });

  it("offers agent and internal types for staff", () => {
    const access = resolveComposerAccess({
      ticket,
      currentUserId: "agent-1",
      inboxAccessible: true,
    });
    expect(access).toBe("staff");
    expect(messageTypesForAccess(access)).toEqual(["AGENT_REPLY", "INTERNAL_NOTE"]);
  });
});
