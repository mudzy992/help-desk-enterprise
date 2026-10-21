// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/services/api";
import { usePartialResource } from "@/lib/async/use-partial-resource";

const mapError = () => "errors.generic" as const;

describe("usePartialResource", () => {
  it("distinguishes initial failure from an empty successful response and retries", async () => {
    const load = vi
      .fn<() => Promise<readonly string[]>>()
      .mockRejectedValueOnce(new ApiError(503, "DOWN", "Unavailable", "request-1"))
      .mockResolvedValueOnce([]);
    const { result } = renderHook(() => usePartialResource({ load, mapError }));

    await waitFor(() => expect(result.current.errorKey).toBe("errors.generic"));
    expect(result.current.data).toBeNull();
    expect(result.current.requestId).toBe("request-1");

    await act(() => result.current.retry());
    expect(result.current.data).toEqual([]);
    expect(result.current.errorKey).toBeNull();
  });

  it("retains stale data when a refresh fails", async () => {
    const load = vi
      .fn<() => Promise<readonly string[]>>()
      .mockResolvedValueOnce(["saved"])
      .mockRejectedValueOnce(new ApiError(503, "DOWN", "Unavailable", "request-2"));
    const { result } = renderHook(() => usePartialResource({ load, mapError }));

    await waitFor(() => expect(result.current.data).toEqual(["saved"]));
    await act(() => result.current.retry());

    expect(result.current.data).toEqual(["saved"]);
    expect(result.current.errorKey).toBe("errors.generic");
    expect(result.current.requestId).toBe("request-2");
  });
});
