import { describe, expect, it } from "vitest";
import { ApiError } from "@/services/api";
import { mapSlaError } from "@/lib/sla/map-sla-error";

describe("mapSlaError", () => {
  it("maps reason, duplicate, overlap, and in-use codes", () => {
    expect(mapSlaError(new ApiError(400, "REASON_REQUIRED", "x"))).toBe("sla.errorReason");
    expect(mapSlaError(new ApiError(409, "DUPLICATE_RULE", "x"))).toBe("sla.errorDuplicate");
    expect(mapSlaError(new ApiError(400, "OVERLAPPING_INTERVALS", "x"))).toBe("sla.errorOverlap");
    expect(mapSlaError(new ApiError(409, "CALENDAR_IN_USE", "x"))).toBe("sla.errorInUse");
    expect(mapSlaError(new ApiError(401, "INVALID_CREDENTIALS", "x"))).toBe(
      "sla.errorUnauthorized",
    );
  });
});
