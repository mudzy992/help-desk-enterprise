// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChangeApprovals, ChangeDetail } from "@/services/changes-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: "bs" }, t: (key: string) => key }),
}));

const fetchNextPage = vi.fn();
let infinite: Record<string, unknown> = {};

vi.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: () => infinite,
}));

const { ChangeApprovalsPanel } = await import("@/components/changes/change-approvals-panel");

function vote(id: string, round: number) {
  return {
    id,
    round,
    decision: "APPROVED" as const,
    comment: null,
    decidedAt: "2030-01-01T10:00:00.000Z",
    approver: { id: `user-${id}`, displayName: `Član ${id}`, email: `${id}@example.test` },
  };
}

function overview(overrides: Partial<ChangeApprovals> = {}): ChangeApprovals {
  return {
    round: 2,
    quorum: 1,
    frozen: true,
    approvals: 1,
    cabGroup: { id: "cab-1", name: "CAB" },
    voters: [],
    votes: [vote("v2", 2)],
    canVote: false,
    isRequester: false,
    ...overrides,
  };
}

function state(pages: readonly ChangeApprovals[], hasNextPage: boolean) {
  infinite = {
    data: { pages },
    isLoading: false,
    error: null,
    hasNextPage,
    isFetchingNextPage: false,
    fetchNextPage,
  };
}

const change = {
  id: "change-1",
  type: "NORMAL",
  status: "AUTHORIZATION",
  version: 3,
} as ChangeDetail;

describe("ChangeApprovalsPanel paging (BA-changes-18)", () => {
  afterEach(() => {
    cleanup();
    fetchNextPage.mockClear();
  });

  it("shows the current round and offers earlier rounds while more exist", () => {
    state(
      [overview({ history: { items: [vote("v1", 1)], hasMore: true, nextCursor: "v1" } })],
      true,
    );
    render(<ChangeApprovalsPanel change={change} onVoted={() => undefined} />);

    // Both rounds are on screen, and only the current round is in the round card.
    expect(screen.getAllByText("Član v2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Član v1").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId("change-approvals-more"));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("hides the earlier-rounds button once every round is loaded", () => {
    state([overview({ history: { items: [], hasMore: false, nextCursor: null } })], false);
    render(<ChangeApprovalsPanel change={change} onVoted={() => undefined} />);

    expect(screen.queryByTestId("change-approvals-more")).toBeNull();
  });

  it("warns when a CAB group is wider than the voter ceiling", () => {
    state(
      [
        overview({
          votesTruncated: true,
          history: { items: [], hasMore: false, nextCursor: null },
        }),
      ],
      false,
    );
    render(<ChangeApprovalsPanel change={change} onVoted={() => undefined} />);

    expect(screen.getByTestId("change-approvals-truncated").textContent).toBe(
      "changes.approvals.votesTruncated",
    );
  });

  it("still reads earlier rounds from `votes` on a server without `history`", () => {
    // Before W7.76 one list held every round; the panel must not lose those rows
    // while the browser talks to an older backend.
    state([overview({ votes: [vote("v2", 2), vote("v1", 1)] })], false);
    render(<ChangeApprovalsPanel change={change} onVoted={() => undefined} />);

    expect(screen.getAllByText("Član v1").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("change-approvals-more")).toBeNull();
  });
});
