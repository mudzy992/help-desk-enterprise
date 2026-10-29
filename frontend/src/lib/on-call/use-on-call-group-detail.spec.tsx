// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { ApiError } from "@/services/api";
import { describe, expect, it, vi } from "vitest";
import { useOnCallGroupDetail } from "./use-on-call-group-detail";

const getOnCallGroup = vi.hoisted(() => vi.fn());
vi.mock("@/services/on-call-api", () => ({ getOnCallGroup }));

const detail = (id: string) => ({
  group: { id, name: id },
  schedule: null,
  segments: [],
  current: null,
  overrides: [],
  swaps: [],
  candidates: [],
  defaultTimezone: "Europe/Sarajevo",
  canManage: true,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("useOnCallGroupDetail", () => {
  it("removes the previous scope immediately and ignores its late response", async () => {
    const first = deferred<ReturnType<typeof detail>>();
    const second = deferred<ReturnType<typeof detail>>();
    getOnCallGroup.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(
      ({ id, from }) => useOnCallGroupDetail(id, { from, to: `${from}-to` }),
      { initialProps: { id: "a", from: "one" } },
    );

    rerender({ id: "b", from: "two" });
    expect(result.current.detail).toBeNull();
    await act(async () => second.resolve(detail("b")));
    await waitFor(() => expect(result.current.detail?.group.id).toBe("b"));
    await act(async () => first.resolve(detail("a")));
    expect(result.current.detail?.group.id).toBe("b");
  });

  it("correlates an error and retries the active scope", async () => {
    getOnCallGroup
      .mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "down", "req-detail"))
      .mockResolvedValueOnce(detail("a"));
    const range = { from: "one", to: "two" };
    const { result } = renderHook(() => useOnCallGroupDetail("a", range));

    await waitFor(() => expect(result.current.error?.requestId).toBe("req-detail"));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.detail?.group.id).toBe("a"));
    expect(result.current.error).toBeNull();
  });
});
