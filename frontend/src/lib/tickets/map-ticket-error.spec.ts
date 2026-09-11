import { describe, expect, it } from "vitest";
import { mapTicketError } from "@/lib/tickets/map-ticket-error";
import { ApiError } from "@/services/api";

describe("mapTicketError", () => {
  it("maps authorization, not found, and validation failures", () => {
    expect(mapTicketError(new ApiError(401, "INVALID_CREDENTIALS", "no"))).toBe(
      "tickets.errorUnauthorized",
    );
    expect(mapTicketError(new ApiError(403, "FORBIDDEN", "no"))).toBe(
      "tickets.errorForbidden",
    );
    expect(mapTicketError(new ApiError(403, "STATUS_CHANGE_FORBIDDEN", "no"))).toBe(
      "tickets.errorStatusForbidden",
    );
    expect(mapTicketError(new ApiError(404, "NOT_FOUND", "no"))).toBe(
      "tickets.errorNotFound",
    );
    expect(mapTicketError(new ApiError(400, "INVALID_TITLE", "no"))).toBe(
      "tickets.errorValidation",
    );
    expect(mapTicketError(new ApiError(400, "REQUIRED_FIELDS_MISSING", "no"))).toBe(
      "tickets.errorRequiredFields",
    );
    expect(mapTicketError(new ApiError(400, "REDACTION_BLOCKED", "no"))).toBe(
      "tickets.errorRedactionBlocked",
    );
    expect(mapTicketError(new ApiError(409, "DUPLICATE_TICKET_BLOCKED", "no"))).toBe(
      "tickets.errorDuplicateTicket",
    );
    expect(
      mapTicketError(new ApiError(400, "BULK_BROADCAST_CONFIRMATION_REQUIRED", "no")),
    ).toBe("tickets.errorBulkBroadcastConfirm");
    expect(
      mapTicketError(new ApiError(403, "CONFIDENTIAL_ACCESS_DENIED", "no")),
    ).toBe("tickets.errorConfidentialBreakGlass");
    expect(
      mapTicketError(new ApiError(400, "BREAK_GLASS_REASON_REQUIRED", "no")),
    ).toBe("tickets.errorBreakGlassReason");
    expect(mapTicketError(new Error("network"))).toBe("tickets.errorGeneric");
  });
});
