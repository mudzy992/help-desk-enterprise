// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: "bs" }, t: (key: string) => key }),
}));

const fetchNextPage = vi.fn();
let infinite: Record<string, unknown> = {};

vi.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: () => infinite,
}));

const { ChangeHistoryPanel } = await import("@/components/changes/change-history-panel");

function event(id: string, action: string) {
  return {
    id,
    action,
    actor: { id: "user-1", displayName: "Ana", email: "ana@example.test" },
    detail: {},
    createdAt: "2030-01-01T10:00:00.000Z",
  };
}

function state(pages: readonly unknown[], hasNextPage: boolean) {
  infinite = {
    data: { pages },
    isLoading: false,
    error: null,
    hasNextPage,
    isFetchingNextPage: false,
    fetchNextPage,
  };
}

describe("ChangeHistoryPanel paging (BA-changes-18)", () => {
  afterEach(() => {
    cleanup();
    fetchNextPage.mockClear();
  });

  it("offers older events only while the server reports more", () => {
    state([{ items: [event("evt-1", "created")], hasMore: true, nextCursor: "evt-1" }], true);
    render(<ChangeHistoryPanel changeId="change-1" versionKey={1} />);

    fireEvent.click(screen.getByTestId("change-history-more"));

    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("hides the button once the timeline is exhausted", () => {
    state([{ items: [event("evt-1", "created")], hasMore: false, nextCursor: null }], false);
    render(<ChangeHistoryPanel changeId="change-1" versionKey={1} />);

    expect(screen.queryByTestId("change-history-more")).toBeNull();
  });

  it("renders every page it has loaded, newest page appended below", () => {
    state(
      [
        { items: [event("evt-2", "updated")], hasMore: true, nextCursor: "evt-2" },
        { items: [event("evt-1", "created")], hasMore: false, nextCursor: null },
      ],
      false,
    );
    render(<ChangeHistoryPanel changeId="change-1" versionKey={1} />);

    // Both pages are on screen; the header is a third string that also starts
    // with `changes.history`, so assert on the two event lines themselves.
    expect(screen.getByText("changes.history.created")).toBeTruthy();
    expect(screen.getByText("changes.history.updated")).toBeTruthy();
    expect(screen.queryByTestId("change-history-more")).toBeNull();
  });
});
