// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listUsersSummaryPage, type UserSummary } from "@/services/users-api";
import { useTeamsUserSearch } from "./use-teams-user-search";

vi.mock("@/services/users-api", () => ({ listUsersSummaryPage: vi.fn() }));
const listPage = vi.mocked(listUsersSummaryPage);
const user = (id: string): UserSummary =>
  ({ id, displayName: id, email: `${id}@example.test`, isActive: true }) as UserSummary;

describe("useTeamsUserSearch", () => {
  afterEach(cleanup);
  beforeEach(() => vi.clearAllMocks());

  it("debounces server-side searches and keeps active results only", async () => {
    listPage.mockResolvedValue({
      items: [user("ana"), { ...user("inactive"), isActive: false }],
      total: 2,
    });
    const { result, rerender } = renderHook(({ query }) => useTeamsUserSearch(query), {
      initialProps: { query: "a" },
    });
    rerender({ query: "ana" });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(listPage).toHaveBeenCalledTimes(1);
    expect(listPage).toHaveBeenCalledWith({
      take: 50,
      skip: 0,
      query: "ana",
    });
    expect(result.current.users.map(({ id }) => id)).toEqual(["ana"]);
  });

  it("loads another bounded page and appends unique users", async () => {
    listPage
      .mockResolvedValueOnce({ items: [user("u1")], total: 2 })
      .mockResolvedValueOnce({ items: [user("u2")], total: 2 });
    const { result } = renderHook(() => useTeamsUserSearch(""));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => result.current.loadMore());
    await waitFor(() => expect(result.current.loadingMore).toBe(false));
    expect(listPage).toHaveBeenLastCalledWith({
      take: 50,
      skip: 1,
      query: "",
    });
    expect(result.current.users.map(({ id }) => id)).toEqual(["u1", "u2"]);
  });
});
