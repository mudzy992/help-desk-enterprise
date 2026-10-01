import { describe, expect, it } from "vitest";
import { ApiError } from "@/services/api";
import { highestSeverity, mapProblemError, problemStatusTone, suggestProblemDraft } from "./problem-view";

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
});
