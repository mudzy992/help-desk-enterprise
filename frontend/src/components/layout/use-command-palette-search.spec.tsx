// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchHeaderSources, type HeaderSearchGroups } from "./header-search-match";
import { commandPaletteSearchDelayMs, useCommandPaletteSearch } from "./use-command-palette-search";

vi.mock("./header-search-match", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./header-search-match")>();
  return { ...actual, searchHeaderSources: vi.fn() };
});

const search = vi.mocked(searchHeaderSources);
const groups = (id: string): HeaderSearchGroups => ({
  tickets: [{ id, kind: "ticket", title: id, subtitle: "", href: `/tickets/${id}` }],
  articles: [],
  users: [],
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
