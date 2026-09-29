import { describe, expect, it } from "vitest";
import { formatDocumentTitle, resolveProductName } from "./document-title";

describe("document title", () => {
  it("takes the product name from the static title before the dash", () => {
    expect(resolveProductName("EP-HelpDesk — Enterprise servisni centar")).toBe("EP-HelpDesk");
    expect(resolveProductName("Desk")).toBe("Desk");
  });

  it("joins page parts with the product name last", () => {
    expect(formatDocumentTitle(["HD-2026-000123", " Pisač  ne radi "], "Desk")).toBe(
      "HD-2026-000123 · Pisač ne radi · Desk",
    );
  });

  it("drops empty parts and a duplicated product name", () => {
    expect(formatDocumentTitle(["", null, "Desk"], "Desk")).toBe("Desk");
  });
});
