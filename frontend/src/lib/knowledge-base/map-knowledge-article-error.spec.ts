import { describe, expect, it } from "vitest";
import { mapKnowledgeArticleError } from "@/lib/knowledge-base/map-knowledge-article-error";
import { ApiError } from "@/services/api";

describe("mapKnowledgeArticleError", () => {
  it("maps get 404 and forbidden failures", () => {
    expect(
      mapKnowledgeArticleError(new ApiError(404, "NOT_FOUND", "missing")),
    ).toBe("knowledgeBase.errorNotFound");
    expect(
      mapKnowledgeArticleError(new ApiError(403, "FORBIDDEN", "denied")),
    ).toBe("knowledgeBase.errorForbidden");
    expect(
      mapKnowledgeArticleError(new ApiError(404, "UNKNOWN_GET", "missing")),
    ).toBe("knowledgeBase.errorNotFound");
    expect(
      mapKnowledgeArticleError(new ApiError(403, "UNKNOWN_GET", "denied")),
    ).toBe("knowledgeBase.errorForbidden");
  });

  it("maps update 404, forbidden, and missing-reason failures", () => {
    expect(
      mapKnowledgeArticleError(new ApiError(404, "NOT_FOUND", "missing")),
    ).toBe("knowledgeBase.errorNotFound");
    expect(
      mapKnowledgeArticleError(new ApiError(403, "FORBIDDEN", "denied")),
    ).toBe("knowledgeBase.errorForbidden");
    expect(
      mapKnowledgeArticleError(new ApiError(403, "ARTICLE_ARCHIVED", "closed")),
    ).toBe("knowledgeBase.errorForbidden");
    expect(
      mapKnowledgeArticleError(new ApiError(400, "REASON_REQUIRED", "reason")),
    ).toBe("knowledgeBase.errorValidation");
    expect(
      mapKnowledgeArticleError(new ApiError(400, "INVALID_TITLE", "title")),
    ).toBe("knowledgeBase.errorValidation");
    expect(
      mapKnowledgeArticleError(new ApiError(422, "VALIDATION", "body")),
    ).toBe("knowledgeBase.errorValidation");
  });

  it("maps unauthorized and unknown failures", () => {
    expect(
      mapKnowledgeArticleError(new ApiError(401, "INVALID_CREDENTIALS", "auth")),
    ).toBe("knowledgeBase.errorUnauthorized");
    expect(
      mapKnowledgeArticleError(new ApiError(500, "INTERNAL", "boom")),
    ).toBe("knowledgeBase.errorGeneric");
    expect(mapKnowledgeArticleError(new Error("offline"))).toBe(
      "knowledgeBase.errorGeneric",
    );
  });
});
