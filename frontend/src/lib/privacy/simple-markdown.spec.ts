import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown, safeHref } from "./simple-markdown";

describe("parseMarkdown", () => {
  it("parses the blocks used by the generated notice", () => {
    const blocks = parseMarkdown("> **NACRT**\n\n# Naslov\n\nUvod\nnastavak.\n\n## Prava\n\n- jedan\n- dva\n\n1. prvi\n2. drugi");
    expect(blocks.map((block) => block.kind)).toEqual(["quote", "heading", "paragraph", "heading", "list", "list"]);
    expect(blocks[1]).toMatchObject({ kind: "heading", level: 1 });
    expect(blocks[2]).toEqual({ kind: "paragraph", children: [{ kind: "text", text: "Uvod nastavak." }] });
    expect(blocks[4]).toMatchObject({ kind: "list", ordered: false });
    expect(blocks[5]).toMatchObject({ kind: "list", ordered: true });
  });

  it("keeps escaped markers as text (values from the record cannot restructure it)", () => {
    expect(parseInline("\\# nije naslov \\*\\*x\\*\\* \\[a\\](b)")).toEqual([
      { kind: "text", text: "# nije naslov **x** [a](b)" },
    ]);
  });

  it("parses bold, italic, code and links", () => {
    expect(parseInline("**Rukovalac:** _EP_ `x` [web](https://ep.ba)")).toEqual([
      { kind: "strong", children: [{ kind: "text", text: "Rukovalac:" }] },
      { kind: "text", text: " " },
      { kind: "em", children: [{ kind: "text", text: "EP" }] },
      { kind: "text", text: " " },
      { kind: "code", text: "x" },
      { kind: "text", text: " " },
      { kind: "link", href: "https://ep.ba", children: [{ kind: "text", text: "web" }] },
    ]);
  });

  it("drops unsafe link targets but keeps their text", () => {
    expect(parseInline("[klik](javascript:alert(1))")).toEqual([{ kind: "text", text: "klik" }, { kind: "text", text: ")" }]);
    expect(safeHref("mailto:dpo@ep.ba")).toBe("mailto:dpo@ep.ba");
    expect(safeHref("data:text/html,x")).toBeNull();
  });

  it("shows HTML as plain text", () => {
    expect(parseMarkdown("<script>alert(1)</script>")).toEqual([
      { kind: "paragraph", children: [{ kind: "text", text: "<script>alert(1)</script>" }] },
    ]);
  });

  it("leaves an unmatched delimiter as text", () => {
    expect(parseInline("5 * 3 i **otvoreno")).toEqual([{ kind: "text", text: "5 * 3 i **otvoreno" }]);
  });
});
