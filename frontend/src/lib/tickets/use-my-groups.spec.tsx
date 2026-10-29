// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMyGroups } from "@/lib/tickets/use-my-groups";
import { reportClientError } from "@/lib/app/client-logger";
import { listMyGroups } from "@/services/groups-api";

vi.mock("@/lib/app/client-logger", () => ({ reportClientError: vi.fn() }));
vi.mock("@/services/groups-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/groups-api")>();
  return { ...actual, listMyGroups: vi.fn() };
});

afterEach(cleanup);

describe("useMyGroups", () => {
  it("surfaces membership read failures and retries the group list", async () => {
    vi.mocked(listMyGroups).mockRejectedValueOnce(new Error("membership list unavailable"));
    const { result } = renderHook(() => useMyGroups());

    await waitFor(() => expect(result.current.errorKey).toBe("tickets.errorGeneric"));
    expect(result.current.groups).toEqual([]);
    expect(reportClientError).toHaveBeenCalledWith(
      "ticket_group_memberships_failed",
      expect.any(Error),
    );

    vi.mocked(listMyGroups).mockResolvedValueOnce([]);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.errorKey).toBeNull());
  });
});
