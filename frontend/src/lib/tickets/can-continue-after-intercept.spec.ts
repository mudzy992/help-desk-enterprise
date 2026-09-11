import { describe, expect, it } from "vitest";
import { canContinueAfterKnowledgeIntercept } from "@/lib/tickets/can-continue-after-intercept";

describe("KB intercept continue", () => {
  it("allows ticket create when intercept returns no articles", () => {
    expect(canContinueAfterKnowledgeIntercept([])).toBe(true);
    expect(
      canContinueAfterKnowledgeIntercept([
        {
          id: "a1",
          title: "VPN",
          slug: "vpn",
          bodyPreview: "reset",
          isStale: false,
          score: 1,
          viewerFeedback: null,
        },
      ]),
    ).toBe(true);
  });
});
