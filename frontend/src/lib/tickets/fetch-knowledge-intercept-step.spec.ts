import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchKnowledgeInterceptStep } from "@/lib/tickets/fetch-knowledge-intercept-step";
import { ApiError } from "@/services/api";
import { interceptKnowledgeArticles } from "@/services/knowledge-base-api";

vi.mock("@/services/knowledge-base-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/knowledge-base-api")>();
  return { ...actual, interceptKnowledgeArticles: vi.fn() };
});

const suggestion = {
  id: "article-1",
  title: "Resetovanje VPN profila",
  slug: "resetovanje-vpn-profila",
  bodyPreview: "Koraci za resetovanje profila.",
  isStale: false,
  score: 0.82,
  viewerFeedback: null,
};

describe("fetchKnowledgeInterceptStep ", () => {
  afterEach(() => {
    vi.mocked(interceptKnowledgeArticles).mockReset();
  });

  it("hands the suggestions to the wizard when the knowledge base answers", async () => {
    vi.mocked(interceptKnowledgeArticles).mockResolvedValue({ articles: [suggestion] });

    const step = await fetchKnowledgeInterceptStep({ serviceId: "svc-1", query: "vpn" });

    expect(step).toEqual({ kind: "suggestions", articles: [suggestion] });
  });

  it("lets the wizard continue when the knowledge base is down", async () => {
    vi.mocked(interceptKnowledgeArticles).mockRejectedValue(
      new ApiError(500, "INTERCEPT_FAILED", ""),
    );
    const loggedErrors = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const step = await fetchKnowledgeInterceptStep({ serviceId: "svc-1", query: "vpn" });

    // Ne baca izuzetak: pad neobaveznog prijedloga ne smije spriječiti kreiranje tiketa.
    expect(step).toEqual({ kind: "unavailable" });
    expect(loggedErrors).toHaveBeenCalled();
    loggedErrors.mockRestore();
  });
});
