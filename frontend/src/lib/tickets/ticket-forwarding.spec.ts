import { describe, expect, it } from "vitest";
import { ApiError } from "@/services/api";
import { mapTicketError } from "@/lib/tickets/map-ticket-error";
import { deriveActionsFromSession } from "@/lib/tickets/ticket-action-matrix";
import {
  findPreviousGroup,
  forwardReasonError,
  orderForwardTargets,
} from "@/lib/tickets/ticket-forwarding";
import type { TicketResponse } from "@/services/tickets-api";
import type { ForwardTargetGroup, ForwardTargetsResponse } from "@/services/tickets-forwarding-api";

function group(id: string, name: string, isCrossOu: boolean): ForwardTargetGroup {
  return {
    id,
    name,
    organizationalUnitId: isCrossOu ? "ou-other" : "ou-own",
    organizationalUnitName: isCrossOu ? "Direkcija" : "Zenica",
    organizationalUnitPath: null,
    isCrossOu,
    isCurrent: id === "g-current",
    memberCount: 2,
  };
}

const targets: ForwardTargetsResponse = {
  currentGroupId: "g-current",
  currentUnitId: "ou-own",
  previousGroupId: "g-prev",
  requireReason: true,
  minReasonLength: 10,
  crossOuAllowed: true,
  groups: [
    group("g-cross", "Aplikacije", true),
    group("g-prev", "Mreža", false),
    group("g-current", "Podrška", false),
    group("g-same", "Hardver", false),
  ],
};

describe("ticket forwarding helpers (package 1.1)", () => {
  it("lists the current group first (reassign), then same-OU, then other OUs", () => {
    expect(orderForwardTargets(targets).map((item) => item.id)).toEqual([
      "g-current",
      "g-same",
      "g-prev",
      "g-cross",
    ]);
  });

  it("offers the hand-back only when the previous group is an allowed target", () => {
    expect(findPreviousGroup(targets)?.id).toBe("g-prev");
    expect(findPreviousGroup({ ...targets, previousGroupId: null })).toBeNull();
    expect(findPreviousGroup({ ...targets, previousGroupId: "g-gone" })).toBeNull();
    expect(findPreviousGroup(null)).toBeNull();
  });

  it("validates the reason length like the server (whitespace collapsed)", () => {
    expect(forwardReasonError("   kratko   ", targets)).toBe(true);
    expect(forwardReasonError("Potrebna    Direkcija", targets)).toBe(false);
    expect(forwardReasonError("", { requireReason: false, minReasonLength: 10 })).toBe(false);
    expect(forwardReasonError("", targets, true)).toBe(false);
  });

  it("maps forwarding error codes to dedicated messages", () => {
    const error = (code: string, status = 403) => new ApiError(status, code, code);
    expect(mapTicketError(error("FORWARD_CROSS_OU_FORBIDDEN"))).toBe(
      "tickets.errorForwardCrossOuForbidden",
    );
    expect(mapTicketError(error("FORWARD_REASON_REQUIRED", 400))).toBe(
      "tickets.errorForwardReason",
    );
    expect(mapTicketError(error("FORWARD_SAME_GROUP", 409))).toBe("tickets.errorForwardSameGroup");
  });

  it("the session fallback offers forward only to staff in forwardable statuses", () => {
    const session = {
      currentUserId: "u1",
      isSuperAdmin: false,
      roleKeys: ["AGENT"],
      permissionKeys: [],
    };
    const ticket = (status: TicketResponse["status"]) =>
      ({ id: "t1", status, requesterId: "u2", assignedUserId: null }) as unknown as TicketResponse;
    expect(deriveActionsFromSession(ticket("IN_PROGRESS"), session).forward).toBe(true);
    expect(deriveActionsFromSession(ticket("RESOLVED"), session).forward).toBe(false);
    expect(
      deriveActionsFromSession(ticket("IN_PROGRESS"), { ...session, roleKeys: ["USER"] }).forward,
    ).toBe(false);
  });
});
