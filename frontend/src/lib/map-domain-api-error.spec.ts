import { describe, expect, it } from "vitest";
import { ApiError } from "@/services/api";
import { mapDomainApiError } from "@/lib/map-domain-api-error";

describe("mapDomainApiError", () => {
  const contract = {
    fallback: "generic",
    codes: { SPECIAL: "special" },
    statuses: { 403: "forbidden" },
  } as const;
  it("prioritizes a code, then status, then fallback", () => {
    expect(mapDomainApiError(new ApiError(403, "SPECIAL", ""), contract)).toBe("special");
    expect(mapDomainApiError(new ApiError(403, "OTHER", ""), contract)).toBe("forbidden");
    expect(mapDomainApiError(new Error("offline"), contract)).toBe("generic");
  });
});
