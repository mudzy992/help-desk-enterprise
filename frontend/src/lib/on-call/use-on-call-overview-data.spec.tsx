// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { ApiError } from "@/services/api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOnCallOverviewData } from "./use-on-call-overview-data";

const api = vi.hoisted(() => ({
  getOnCallOverview: vi.fn(),
  getOnCallMe: vi.fn(),
  listOnCallSwaps: vi.fn(),
}));

vi.mock("@/services/on-call-api", () => api);

const overview = (name: string) => ({
  canManage: true,
  groups: [
    {
      groupId: name,
      groupName: name,
      hasSchedule: true,
      isActive: true,
      timezone: "Europe/Sarajevo",
      current: null,
    },
  ],
});
const me = { enabled: true, current: [], next: null };
const swaps = { swaps: [] };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("useOnCallOverviewData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getOnCallOverview.mockResolvedValue(overview("initial"));
    api.getOnCallMe.mockResolvedValue(me);
    api.listOnCallSwaps.mockResolvedValue(swaps);
  });

  it("keeps successful sources when another source fails and recovers it locally", async () => {
    api.getOnCallMe.mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "down", "req-me"));
    const { result } = renderHook(() => useOnCallOverviewData());

    await waitFor(() => expect(result.current.overview?.groups[0]?.groupId).toBe("initial"));
    expect(result.current.meError?.requestId).toBe("req-me");
    expect(result.current.swaps).toEqual([]);

    api.getOnCallMe.mockResolvedValueOnce(me);
    await act(async () => result.current.reloadMe());
    expect(result.current.me).toEqual(me);
    expect(result.current.meError).toBeNull();
  });

  it("commits only the latest overlapping overview refresh", async () => {
    const older = deferred<ReturnType<typeof overview>>();
    const newer = deferred<ReturnType<typeof overview>>();
    api.getOnCallOverview
      .mockResolvedValueOnce(overview("initial"))
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    const { result } = renderHook(() => useOnCallOverviewData());
    await waitFor(() => expect(result.current.overview?.groups[0]?.groupId).toBe("initial"));

    act(() => {
      void result.current.reloadOverview();
      void result.current.reloadOverview();
    });
    await act(async () => newer.resolve(overview("newer")));
    await waitFor(() => expect(result.current.overview?.groups[0]?.groupId).toBe("newer"));
    await act(async () => older.resolve(overview("older")));
    expect(result.current.overview?.groups[0]?.groupId).toBe("newer");
  });
});
