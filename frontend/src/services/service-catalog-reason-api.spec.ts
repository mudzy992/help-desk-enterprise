import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/services/api";
import { activateServiceFormVersion, createServiceForm } from "@/services/service-catalog-api";
import { createServiceFormVersion, updateServiceFormVersion } from "@/services/service-forms-api";

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return { ...actual, apiRequest: vi.fn() };
});

const schema = { schemaVersion: 1 as const, fields: [] };

describe("service catalog audit-reason API contract", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends caller reasons on form create, version create/update, and activation", () => {
    createServiceForm("service-1", schema, "Initial form for intake");
    createServiceFormVersion("service-1", schema, "Add the requested field");
    updateServiceFormVersion("service-1", "version-2", schema, "Clarify required data");
    activateServiceFormVersion("service-1", "version-2", "Approved by service owner");

    expect(apiRequest).toHaveBeenNthCalledWith(
      1,
      "/services/service-1/form",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ schema, reason: "Initial form for intake" }),
      }),
    );
    expect(apiRequest).toHaveBeenNthCalledWith(
      2,
      "/services/service-1/form/versions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ schema, reason: "Add the requested field" }),
      }),
    );
    expect(apiRequest).toHaveBeenNthCalledWith(
      3,
      "/services/service-1/form/versions/version-2",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ schema, reason: "Clarify required data" }),
      }),
    );
    expect(apiRequest).toHaveBeenNthCalledWith(
      4,
      "/services/service-1/form/versions/version-2/activate",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ reason: "Approved by service owner" }),
      }),
    );
  });
});
