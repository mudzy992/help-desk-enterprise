// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchHeaderSources, type HeaderSearchGroups } from "./header-search-match";
import { ApiError } from "@/services/api";
import {
  commandPaletteSearchDelayMs,
  countCommandPaletteQueryCharacters,
  normalizeCommandPaletteQuery,
  useCommandPaletteSearch,
} from "./use-command-palette-search";

vi.mock("./header-search-match", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./header-search-match")>();
  return { ...actual, searchHeaderSources: vi.fn() };
});

const search = vi.mocked(searchHeaderSources);
const groups = (id: string, articlesIncomplete = false): HeaderSearchGroups => ({
  tickets: [{ id, kind: "ticket", title: id, subtitle: "", href: `/tickets/${id}` }],
  articles: [],
  users: [],
  articlesIncomplete,
});

describe("useCommandPaletteSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("debounces remote search and ignores queries shorter than two characters", async () => {
    search.mockResolvedValue(groups("result"));
    const { result, rerender } = renderHook(({ query }) => useCommandPaletteSearch(true, query), {
      initialProps: { query: "a" },
    });
    await act(async () => vi.advanceTimersByTimeAsync(commandPaletteSearchDelayMs));
    expect(search).not.toHaveBeenCalled();

    rerender({ query: "ab" });
    await act(async () => vi.advanceTimersByTimeAsync(commandPaletteSearchDelayMs - 1));
    expect(search).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(search).toHaveBeenCalledTimes(1);
    expect(result.current.groups.tickets[0]?.id).toBe("result");
  });

  it("does not spend a request on a query the API would refuse", async () => {
    search.mockResolvedValue(groups("result"));
    // W7.56: padding, zero-width characters and a single emoji all count as
    // fewer than two characters after normalization.
    const { rerender } = renderHook(({ query }) => useCommandPaletteSearch(true, query), {
      initialProps: { query: "  " },
    });
    await act(async () => vi.advanceTimersByTimeAsync(commandPaletteSearchDelayMs));
    expect(search).not.toHaveBeenCalled();

    rerender({ query: "\u200b\u200ba" });
    await act(async () => vi.advanceTimersByTimeAsync(commandPaletteSearchDelayMs));
    expect(search).not.toHaveBeenCalled();

    rerender({ query: "\ud83d\udc4d" });
    await act(async () => vi.advanceTimersByTimeAsync(commandPaletteSearchDelayMs));
    expect(search).not.toHaveBeenCalled();
  });

  it("sends the NFKC-normalized needle", async () => {
    search.mockResolvedValue(groups("result"));
    renderHook(({ query }) => useCommandPaletteSearch(true, query), {
      initialProps: { query: "  \uff36\uff30\uff2e\u00a0" },
    });
    await act(async () => vi.advanceTimersByTimeAsync(commandPaletteSearchDelayMs));
    expect(search).toHaveBeenCalledWith("VPN", expect.anything());
    expect(normalizeCommandPaletteQuery(" \uff36\uff30\uff2e ")).toBe("VPN");
    expect(countCommandPaletteQueryCharacters("\ud83d\udc4d")).toBe(1);
    expect(countCommandPaletteQueryCharacters("\ud83d\udc4d\ud83d\udc4d")).toBe(2);
  });

  it("distinguishes a spent request budget from an empty result", async () => {
    // W7.59 (BA-search-05): a 429 is the server's budget answer, not "nothing
    // matched"; the palette must be able to say so.
    search.mockRejectedValueOnce(
      new ApiError(429, "TOO_MANY_SEARCH_REQUESTS", "Too many search requests"),
    );
    const first = renderHook(({ query }) => useCommandPaletteSearch(true, query), {
      initialProps: { query: "vpn" },
    });
    await act(async () => vi.advanceTimersByTimeAsync(commandPaletteSearchDelayMs));
    expect(first.result.current.isRateLimited).toBe(true);
    expect(first.result.current.groups.tickets).toEqual([]);

    // The next successful answer clears it again.
    search.mockResolvedValueOnce(groups("result"));
    first.rerender({ query: "vpn pristup" });
    await act(async () => vi.advanceTimersByTimeAsync(commandPaletteSearchDelayMs));
    expect(first.result.current.isRateLimited).toBe(false);
    expect(first.result.current.groups.tickets[0]?.id).toBe("result");
  });

  it("does not call every other failure a rate limit", async () => {
    search.mockRejectedValueOnce(new Error("network down"));
    const { result } = renderHook(({ query }) => useCommandPaletteSearch(true, query), {
      initialProps: { query: "vpn" },
    });
    await act(async () => vi.advanceTimersByTimeAsync(commandPaletteSearchDelayMs));
    expect(result.current.isRateLimited).toBe(false);
    expect(result.current.groups.tickets).toEqual([]);
  });

  it("keeps the incomplete article flag the server sent", async () => {
    // W7.57 (BA-search-03): the hook applies the groups verbatim, so the flag
    // that tells the palette "this is only a prefix" survives the debounce.
    search.mockResolvedValue(groups("result", true));
    const { result } = renderHook(({ query }) => useCommandPaletteSearch(true, query), {
      initialProps: { query: "vpn" },
    });
    await act(async () => vi.advanceTimersByTimeAsync(commandPaletteSearchDelayMs));
    expect(result.current.groups.articlesIncomplete).toBe(true);
  });

  it("aborts the previous request and never applies its stale response", async () => {
    let resolveFirst!: (value: HeaderSearchGroups) => void;
    let resolveSecond!: (value: HeaderSearchGroups) => void;
    search
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockImplementationOnce(() => new Promise((resolve) => (resolveSecond = resolve)));
    const { result, rerender } = renderHook(({ query }) => useCommandPaletteSearch(true, query), {
      initialProps: { query: "first" },
    });
    await act(async () => vi.advanceTimersByTimeAsync(commandPaletteSearchDelayMs));
    const firstSignal = search.mock.calls[0]?.[1];

    rerender({ query: "second" });
    expect(firstSignal?.aborted).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(commandPaletteSearchDelayMs));
    await act(async () => resolveFirst(groups("stale")));
    expect(result.current.groups.tickets).toEqual([]);
    await act(async () => resolveSecond(groups("fresh")));
    expect(result.current.groups.tickets[0]?.id).toBe("fresh");
  });
});
