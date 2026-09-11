import { describe, expect, it } from "vitest";
import { knowledgeLifecycleOptions } from "@/lib/knowledge-base/knowledge-lifecycle-actions";

describe("knowledgeLifecycleOptions", () => {
  it("offers only the transitions the backend accepts for each status", () => {
    expect(knowledgeLifecycleOptions("DRAFT", true).map((o) => o.action)).toEqual([
      "submit-review",
    ]);
    expect(
      knowledgeLifecycleOptions("IN_REVIEW", true).map((o) => o.action),
    ).toEqual(["approve-review", "reject-review", "publish"]);
    expect(
      knowledgeLifecycleOptions("PUBLISHED", true).map((o) => o.action),
    ).toEqual(["approve-review", "submit-review", "archive"]);
    expect(knowledgeLifecycleOptions("ARCHIVED", true)).toEqual([]);
  });

  it("offers nothing without the managing permission", () => {
    expect(knowledgeLifecycleOptions("DRAFT", false)).toEqual([]);
    expect(knowledgeLifecycleOptions("PUBLISHED", false)).toEqual([]);
  });
});
