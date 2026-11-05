import { describe, expect, it } from "vitest";
import { ApiError } from "@/services/api";
import { mapTemplatesError } from "./map-templates-error";

describe("mapTemplatesError", () => {
  it("maps missing and stale response-template revisions to localized error keys", () => {
    expect(mapTemplatesError(new ApiError(400, "TEMPLATE_PRECONDITION_REQUIRED", ""))).toBe(
      "templates.errors.TEMPLATE_PRECONDITION_REQUIRED",
    );
    expect(mapTemplatesError(new ApiError(409, "TEMPLATE_VERSION_CONFLICT", ""))).toBe(
      "templates.errors.TEMPLATE_VERSION_CONFLICT",
    );
  });

  it("maps missing and stale playbook revisions to localized error keys", () => {
    expect(mapTemplatesError(new ApiError(400, "PLAYBOOK_PRECONDITION_REQUIRED", ""))).toBe(
      "templates.errors.PLAYBOOK_PRECONDITION_REQUIRED",
    );
    expect(mapTemplatesError(new ApiError(409, "PLAYBOOK_VERSION_CONFLICT", ""))).toBe(
      "templates.errors.PLAYBOOK_VERSION_CONFLICT",
    );
  });
});
