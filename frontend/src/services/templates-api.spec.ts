import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/services/api";
import {
  deletePlaybook,
  deleteResponseTemplate,
  updateResponseTemplate,
} from "@/services/templates-api";

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return { ...actual, apiRequest: vi.fn() };
});

describe("template definition revision requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiRequest).mockResolvedValue({} as never);
  });

  it("sends the loaded response-template revision on updates", async () => {
    const input = {
      name: "Updated template",
      bodyBs: "Updated body",
      kind: "REPLY" as const,
      expectedUpdatedAt: "2026-01-02T03:04:05.000Z",
    };
    await updateResponseTemplate("personal", "template-1", input);

    expect(apiRequest).toHaveBeenCalledWith("/response-templates/mine/template-1", {
      method: "PUT",
      body: JSON.stringify(input),
    });
  });

  it("sends response-template delete preconditions for shared and personal rows", async () => {
    const expectedUpdatedAt = "2026-01-02T03:04:05.000Z";
    await deleteResponseTemplate("shared", "shared-1", {
      expectedUpdatedAt,
      reason: "No longer needed",
    });
    await deleteResponseTemplate("personal", "personal-1", { expectedUpdatedAt });

    expect(apiRequest).toHaveBeenNthCalledWith(1, "/response-templates/shared-1", {
      method: "DELETE",
      body: JSON.stringify({ expectedUpdatedAt, reason: "No longer needed" }),
    });
    expect(apiRequest).toHaveBeenNthCalledWith(2, "/response-templates/mine/personal-1", {
      method: "DELETE",
      body: JSON.stringify({ expectedUpdatedAt }),
    });
  });

  it("sends the loaded playbook revision with its delete reason", async () => {
    const input = {
      reason: "Playbook retired",
      expectedUpdatedAt: "2026-01-02T03:04:05.000Z",
    };
    await deletePlaybook("playbook-1", input);

    expect(apiRequest).toHaveBeenCalledWith("/playbooks/playbook-1", {
      method: "DELETE",
      body: JSON.stringify(input),
    });
  });
});
