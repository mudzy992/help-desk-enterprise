import { describe, expect, it } from "vitest";
import { detectMentionQuery, insertMentionToken, splitMentionSegments } from "@/lib/tickets/mention-tokens";

describe("mention tokens (Paket 2.4)", () => {
  it("splits a note into text and mention chips", () => {
    expect(splitMentionSegments("Hej @[Amra H](cm1user0001), pogledaj @ivan")).toEqual([
      { kind: "text", text: "Hej " },
      { kind: "mention", name: "Amra H", userId: "cm1user0001" },
      { kind: "text", text: ", pogledaj @ivan" },
    ]);
  });

  it("detects @query only at a word start", () => {
    expect(detectMentionQuery("Pitaj @am", 9)).toEqual({ start: 6, query: "am" });
    expect(detectMentionQuery("mail@am", 7)).toBeNull();
    expect(detectMentionQuery("@", 1)).toEqual({ start: 0, query: "" });
  });

  it("inserts the token with a trailing space", () => {
    const body = "Pitaj @am danas";
    const result = insertMentionToken(body, { start: 6, query: "am" }, 9, { id: "cm1user0001", displayName: "Amra H" });
    expect(result.value).toBe("Pitaj @[Amra H](cm1user0001)  danas");
    expect(result.caret).toBe(6 + "@[Amra H](cm1user0001) ".length);
  });
});
