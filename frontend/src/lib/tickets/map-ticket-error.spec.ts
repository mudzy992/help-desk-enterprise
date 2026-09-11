import { describe, expect, it } from "vitest";
import { mapTicketError } from "@/lib/tickets/map-ticket-error";
import { ApiError } from "@/services/api";

describe("mapTicketError", () => {
  it("reports a missing active form version as its own actionable message", () => {
    expect(mapTicketError(new ApiError(400, "FORM_VERSION_REQUIRED", ""))).toBe(
      "tickets.errorFormVersionMissing",
    );
    expect(
      mapTicketError(new ApiError(400, "FORM_VERSION_NOT_ACTIVE", "")),
    ).toBe("tickets.errorFormVersionMissing");
  });

  it("maps the permission and conflict statuses the workspace relies on", () => {
    expect(mapTicketError(new ApiError(401, "INVALID_CREDENTIALS", ""))).toBe(
      "tickets.errorUnauthorized",
    );
    expect(mapTicketError(new ApiError(403, "FORBIDDEN", ""))).toBe(
      "tickets.errorForbidden",
    );
    expect(mapTicketError(new ApiError(404, "NOT_FOUND", ""))).toBe(
      "tickets.errorNotFound",
    );
    expect(mapTicketError(new ApiError(409, "OVERLAPPING_TIMER", ""))).toBe(
      "tickets.errorConflict",
    );
    expect(mapTicketError(new ApiError(422, "INVALID_TITLE", ""))).toBe(
      "tickets.errorValidation",
    );
    expect(mapTicketError(new ApiError(500, "INTERNAL", ""))).toBe(
      "tickets.errorGeneric",
    );
  });
});
