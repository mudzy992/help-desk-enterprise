import { describe, expect, it } from "vitest";
import {
  appendProblemWhyDraft,
  cleanProblemWhyDrafts,
  createProblemWhyDrafts,
  removeProblemWhyDraft,
  updateProblemWhyDraft,
} from "@/lib/problems/problem-analysis-draft";

const ids = (...values: string[]) => {
  let index = 0;
  return () => values[index++]!;
};

describe("problem analysis draft", () => {
  it("assigns stable client ids and preserves sibling identity after middle removal", () => {
    const drafts = createProblemWhyDrafts(
      [
        { question: "one", answer: "1" },
        { question: "two", answer: "2" },
        { question: "three", answer: "3" },
      ],
      ids("a", "b", "c"),
    );
    expect(removeProblemWhyDraft(drafts, "b").map((item) => item.clientId)).toEqual(["a", "c"]);
  });
  it("updates by identity rather than current index", () => {
    const drafts = createProblemWhyDrafts(
      [
        { question: "one", answer: "" },
        { question: "two", answer: "" },
      ],
      ids("a", "b"),
    );
    expect(updateProblemWhyDraft(drafts, "b", { answer: "kept" })[1]).toMatchObject({
      clientId: "b",
      question: "two",
      answer: "kept",
    });
  });
  it("appends a fresh stable row", () => {
    expect(appendProblemWhyDraft([], "Why?", ids("new"))).toEqual([
      { clientId: "new", question: "Why?", answer: "" },
    ]);
  });
  it("trims and removes empty API rows without leaking client ids", () => {
    expect(
      cleanProblemWhyDrafts([
        { clientId: "a", question: " why ", answer: " because " },
        { clientId: "b", question: " ", answer: "" },
      ]),
    ).toEqual([{ question: "why", answer: "because" }]);
  });
});
