// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KnowledgeInsightsPanel } from "@/components/knowledge-base/portal/knowledge-insights-panel";
import type { KnowledgeComment, KnowledgeInsights } from "@/services/knowledge-portal-api";
import {
  getKnowledgeInsights,
  listKnowledgeInsightComments,
} from "@/services/knowledge-portal-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { count?: number }) =>
      values?.count === undefined ? key : `${key}:${values.count}`,
    i18n: { language: "bs" },
  }),
}));
vi.mock("react-router-dom", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("@/services/knowledge-portal-api", () => ({
  getKnowledgeInsights: vi.fn(),
  listKnowledgeInsightComments: vi.fn(),
  resolveKnowledgeComment: vi.fn().mockResolvedValue(undefined),
}));

const comment = (id: string): KnowledgeComment => ({
  id,
  articleId: "article-1",
  articleTitle: "Reset VPN password",
  rating: 2,
  comment: `Nedostaje korak ${id}`,
  createdAt: "2026-09-11T12:00:00.000Z",
});

const insightsWith = (
  items: readonly KnowledgeComment[],
  hasMore: boolean,
  nextCursor: string | null,
): KnowledgeInsights => ({
  mostViewed: [],
  lowestRated: [],
  notViewed: [],
  openComments: { items, hasMore, nextCursor },
  thresholds: { minRatings: 5, notViewedDays: 90 },
});

afterEach(cleanup);

/**
 * W7.90 (`BA-knowledge-base-17`): the curator comment feed used to stop at fifty rows with no signal. The
 * panel now has to (a) say the list is a page and (b) continue it by cursor without duplicating a row.
 */
describe("KnowledgeInsightsPanel comment paging", () => {
  it("says the comment feed is a page and appends the next one by cursor", async () => {
    vi.mocked(getKnowledgeInsights).mockResolvedValue(
      insightsWith([comment("f2"), comment("f1")], true, "cursor-1"),
    );
    vi.mocked(listKnowledgeInsightComments).mockResolvedValue({
      items: [comment("f0")],
      hasMore: false,
      nextCursor: null,
    });

    render(<KnowledgeInsightsPanel />);

    await waitFor(() => expect(screen.getByText("Nedostaje korak f2")).toBeTruthy());
    expect(screen.getByText("knowledgeBase.portal.insights.commentsTruncated:2")).toBeTruthy();
    expect(screen.queryByText("Nedostaje korak f0")).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "knowledgeBase.portal.insights.loadMoreComments" }),
    );

    await waitFor(() => expect(screen.getByText("Nedostaje korak f0")).toBeTruthy());
    expect(vi.mocked(listKnowledgeInsightComments)).toHaveBeenCalledWith({ cursor: "cursor-1" });
    // Two rows from the first page plus one from the second: nothing was reloaded or duplicated.
    expect(screen.getAllByText(/Nedostaje korak/)).toHaveLength(3);
    await waitFor(() =>
      expect(screen.queryByText("knowledgeBase.portal.insights.commentsTruncated:2")).toBeNull(),
    );
  });

  it("does not offer more when the first page is the whole feed", async () => {
    vi.mocked(getKnowledgeInsights).mockResolvedValue(insightsWith([comment("f1")], false, null));

    render(<KnowledgeInsightsPanel />);

    await waitFor(() => expect(screen.getByText("Nedostaje korak f1")).toBeTruthy());
    expect(screen.queryByTestId("knowledge-insights-more-comments")).toBeNull();
  });
});
