import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/services/api";
import { listIntegrationJobs } from "@/services/integration-queue-api";

vi.mock("@/services/api", () => ({ apiRequest: vi.fn() }));

const requestMock = vi.mocked(apiRequest);

describe("integration queue API cursor contract", () => {
  beforeEach(() => {
    requestMock.mockReset();
  });

  it("requests the first 50-row page for a selected status", async () => {
    const page = { items: [], nextCursor: "job-50" };
    requestMock.mockResolvedValue(page as never);

    await expect(listIntegrationJobs("FAILED")).resolves.toEqual(page);
    expect(requestMock).toHaveBeenCalledWith("/integration-jobs?status=FAILED");
  });

  it("sends the opaque cursor for the next page", async () => {
    const page = { items: [], nextCursor: null };
    requestMock.mockResolvedValue(page as never);

    await expect(listIntegrationJobs("DLQ", "next-page-id")).resolves.toEqual(page);
    expect(requestMock).toHaveBeenCalledWith(
      "/integration-jobs?status=DLQ&cursor=next-page-id",
    );
  });
});
