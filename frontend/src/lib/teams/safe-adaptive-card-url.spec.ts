import { describe, expect, it } from "vitest";
import { safeAdaptiveCardUrl } from "./safe-adaptive-card-url";

describe("safeAdaptiveCardUrl", () => {
  it("allows explicit HTTP and HTTPS links", () => {
    expect(safeAdaptiveCardUrl("https://example.com/path")).toBe("https://example.com/path");
    expect(safeAdaptiveCardUrl(" http://example.com ")).toBe("http://example.com/");
  });

  it.each(["javascript:alert(1)", "data:text/html,x", "/relative", "", null])(
    "rejects unsafe URL %s",
    (value) => expect(safeAdaptiveCardUrl(value)).toBeNull(),
  );
});
