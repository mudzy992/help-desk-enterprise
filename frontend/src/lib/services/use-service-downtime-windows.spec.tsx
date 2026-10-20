// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/services/api";
import { useServiceDowntimeWindows } from "./use-service-downtime-windows";

const api = vi.hoisted(() => ({ listServiceDowntimeWindows: vi.fn() }));
vi.mock("@/services/service-downtime-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/service-downtime-api")>()),
  listServiceDowntimeWindows: api.listServiceDowntimeWindows,
}));

function wrapper({ children }: { readonly children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

function windowFor(serviceId: string) {
  return {
    id: `window-${serviceId}`,
    serviceId,
    startsAt: "2026-10-20T10:00:00.000Z",
    endsAt: "2026-10-20T11:00:00.000Z",
    message: serviceId,
    phase: "UPCOMING" as const,
    isActive: false,
    isUpcoming: true,
    isExpired: false,
    createdAt: "2026-10-20T09:00:00.000Z",
    updatedAt: "2026-10-20T09:00:00.000Z",
  };
}

describe("useServiceDowntimeWindows", () => {
  beforeEach(() => api.listServiceDowntimeWindows.mockReset());

  it("keeps each service response in its own identity scope during an A to B race", async () => {
    let resolveA!: (value: readonly ReturnType<typeof windowFor>[]) => void;
    const pendingA = new Promise<readonly ReturnType<typeof windowFor>[]>((resolve) => {
      resolveA = resolve;
    });
    api.listServiceDowntimeWindows.mockImplementation((serviceId: string) =>
      serviceId === "a" ? pendingA : Promise.resolve([windowFor("b")]),
    );
    const { result, rerender } = renderHook(({ id }) => useServiceDowntimeWindows(id), {
      wrapper,
      initialProps: { id: "a" },
    });
    rerender({ id: "b" });
    await waitFor(() => expect(result.current.windows[0]?.serviceId).toBe("b"));
    await act(async () => resolveA([windowFor("a")]));
    expect(result.current.serviceId).toBe("b");
    expect(result.current.windows[0]?.serviceId).toBe("b");
  });

  it("retains stale windows and exposes the refresh request id", async () => {
    api.listServiceDowntimeWindows.mockResolvedValueOnce([windowFor("a")]);
    const { result } = renderHook(() => useServiceDowntimeWindows("a"), { wrapper });
    await waitFor(() => expect(result.current.windows).toHaveLength(1));
    api.listServiceDowntimeWindows.mockRejectedValueOnce(
      new ApiError(503, "UNAVAILABLE", "offline", "req-downtime"),
    );
    await act(async () => result.current.reload());
    expect(result.current.windows).toHaveLength(1);
    await waitFor(() => expect(result.current.requestId).toBe("req-downtime"));
  });
});
