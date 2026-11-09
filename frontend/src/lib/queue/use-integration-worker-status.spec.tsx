// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getIntegrationWorkerStatus } from "@/services/integration-queue-api";
import { useIntegrationWorkerStatus } from "./use-integration-worker-status";

vi.mock("@/services/integration-queue-api", () => ({ getIntegrationWorkerStatus: vi.fn() }));
const getStatus = vi.mocked(getIntegrationWorkerStatus);

describe("integration worker status", () => {
  beforeEach(() => {
    getStatus.mockReset();
  });
  afterEach(cleanup);

  it("keeps process liveness separate from a dispatchable backlog", async () => {
    getStatus.mockResolvedValue({
      status: "active",
      lastHeartbeatAt: null,
      dispatchableBacklog: { status: "available", oldestCreatedAt: "2026-01-01T00:00:00.000Z" },
    });
    const { result } = renderHook(() => useIntegrationWorkerStatus(true));
    await waitFor(() => expect(result.current.status).toBe("active"));
    expect(result.current.backlog).toEqual({
      status: "available",
      oldestCreatedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("does not interpret an unavailable observation as an empty backlog", async () => {
    getStatus.mockRejectedValue(new Error("unavailable"));
    const { result } = renderHook(() => useIntegrationWorkerStatus(true));
    await waitFor(() => expect(result.current.isRefreshing).toBe(false));
    expect(result.current.backlog).toEqual({ status: "unknown", oldestCreatedAt: null });
  });
});
