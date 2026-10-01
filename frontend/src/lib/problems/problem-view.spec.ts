import { describe, expect, it } from "vitest";
import { ApiError } from "@/services/api";
import {
  highestSeverity,
  mapProblemError,
  problemHistoryText,
  problemStatusTone,
  rootCauseLabel,
  suggestProblemDraft,
  transitionLabelKey,
  transitionNeedsReason,
} from "./problem-view";

describe("problem-view", () => {
  it("picks the highest severity, defaulting to MEDIUM", () => {
    expect(highestSeverity([])).toBe("MEDIUM");
    expect(highestSeverity(["LOW"])).toBe("MEDIUM");
    expect(highestSeverity(["LOW", "HIGH", "MEDIUM"])).toBe("HIGH");
    expect(highestSeverity(["CRITICAL", "HIGH"])).toBe("CRITICAL");
  });

  it("suggests a draft from the selected tickets", () => {
    expect(
      suggestProblemDraft(
        [
          { ticketNumber: "T-000001", title: "Printer offline" },
          { ticketNumber: "T-000002", title: "Cannot print" },
        ],
        "Linked tickets:",
      ),
    ).toEqual({ title: "Printer offline", description: "Linked tickets: T-000001, T-000002" });
    expect(suggestProblemDraft([], "Linked tickets:")).toEqual({ title: "", description: "" });
  });

  it("maps known error codes only", () => {
    expect(mapProblemError(new ApiError(409, "PROBLEM_TICKET_IN_OTHER_PROBLEM", "x"))).toBe("problems.errors.ticketInOtherProblem");
    expect(mapProblemError(new ApiError(500, "SOMETHING", "x"))).toBeNull();
    expect(mapProblemError(new Error("x"))).toBeNull();
  });

  it("gives open statuses a coloured tone and final ones neutral", () => {
    expect(problemStatusTone("KNOWN_ERROR")).toBe("warning");
    expect(problemStatusTone("CLOSED")).toBe("neutral");
  });

  it("maps a missing requirement to its field", () => {
    expect(mapProblemError(new ApiError(409, "PROBLEM_REQUIREMENT_MISSING", "rootCause"))).toBe("problems.errors.requirement.rootCause");
    expect(mapProblemError(new ApiError(409, "PROBLEM_REQUIREMENT_MISSING", "other"))).toBe("problems.errors.requirementMissing");
  });

  it("mirrors the reason rule and transition labels", () => {
    expect(transitionNeedsReason("INVESTIGATING", "CANCELLED")).toBe(true);
    expect(transitionNeedsReason("RESOLVED", "INVESTIGATING")).toBe(true);
    expect(transitionNeedsReason("KNOWN_ERROR", "INVESTIGATING")).toBe(false);
    expect(transitionLabelKey("NEW", "INVESTIGATING")).toBe("problems.transition.start");
    expect(transitionLabelKey("RESOLVED", "INVESTIGATING")).toBe("problems.transition.reopen");
    expect(transitionLabelKey("INVESTIGATING", "KNOWN_ERROR")).toBe("problems.transition.KNOWN_ERROR");
  });

  it("labels root-cause categories and history lines", () => {
    const t = (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key);
    expect(rootCauseLabel(t, "network")).toBe("problems.rootCause.network");
    expect(rootCauseLabel(t, "custom-key")).toBe("custom-key");
    expect(rootCauseLabel(t, null)).toBe("—");
    expect(problemHistoryText(t, "updated", { changes: { title: {} }, textChanged: ["rootCause"] })).toBe(
      'problems.history.updated:{"fields":"problems.fields.title, problems.fields.rootCause"}',
    );
    expect(problemHistoryText(t, "ticket_linked", { ticketNumber: "T-000001" })).toBe('problems.history.ticketLinked:{"ticket":"T-000001"}');
    expect(problemHistoryText(t, "knowledge_article", { title: "Printer" })).toBe('problems.history.knowledgeArticle:{"title":"Printer"}');
    expect(problemHistoryText(t, "tickets_resolved", { resolved: 3, skipped: 1, failed: 0 })).toBe(
      'problems.history.ticketsResolved:{"resolved":3,"skipped":1,"failed":0}',
    );
  });
});
