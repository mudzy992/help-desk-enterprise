import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/services/api";
import { updateChangeTemplate, type ChangeTemplateInput } from "@/services/changes-api";

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return { ...actual, apiRequest: vi.fn() };
});

const input: ChangeTemplateInput = {
  name: "Restart aplikacijskog servisa",
  description: "Kratak prekid.",
  implementationPlan: "Restart u terminu.",
  backoutPlan: "Vraćanje prethodne instance.",
  testPlan: null,
  impact: "LOW",
  likelihood: "MEDIUM",
  causesDowntime: false,
  isActive: true,
  serviceIds: ["svc-1"],
};

describe("change template conditional save (BA-changes-15)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends the revision the editor loaded as If-Match", () => {
    updateChangeTemplate("template-1", input, "2027-01-01T10:00:00.000Z");

    expect(apiRequest).toHaveBeenCalledWith("/changes/templates/template-1", {
      method: "PUT",
      headers: { "If-Match": "2027-01-01T10:00:00.000Z" },
      body: JSON.stringify(input),
    });
  });

  it("encodes the template id so a revision token cannot be dropped by a path surprise", () => {
    updateChangeTemplate("template/1", input, "2027-01-01T10:00:00.000Z");

    expect(apiRequest).toHaveBeenCalledWith(
      "/changes/templates/template%2F1",
      expect.objectContaining({ headers: { "If-Match": "2027-01-01T10:00:00.000Z" } }),
    );
  });
});
