import { describe, expect, it } from "vitest";
import { mergeActionData, parseCardText } from "@/lib/teams/adaptive-card-text";

describe("parseCardText", () => {
  it("handles bold and escapes", () => {
    expect(parseCardText("**HD-1** \\*not bold\\* <b>x</b>")).toEqual([
      { text: "HD-1", bold: true },
      { text: " *not bold* <b>x</b>", bold: false },
    ]);
  });
});

describe("mergeActionData", () => {
  it("lets card data win over inputs", () => {
    expect(mergeActionData({ ticketId: "t1" }, { text: "hi", ticketId: "x" })).toEqual({ text: "hi", ticketId: "t1" });
    expect(mergeActionData(null, { a: "1" })).toEqual({ a: "1" });
  });
});
