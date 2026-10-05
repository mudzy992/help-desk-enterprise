import { describe, expect, it } from "vitest";
import { highlightCode, parseInline, parseMarkdown, safeHref } from "./simple-markdown";

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
    expect(parseInline("**Rukovalac:** _Org_ `x` [web](https://example.com)")).toEqual([
      { kind: "strong", children: [{ kind: "text", text: "Rukovalac:" }] },
      { kind: "text", text: " " },
      { kind: "em", children: [{ kind: "text", text: "Org" }] },
      { kind: "text", text: " " },
      { kind: "code", text: "x" },
      { kind: "text", text: " " },
      { kind: "link", href: "https://example.com", children: [{ kind: "text", text: "web" }] },
    ]);
  });

  it("drops unsafe link targets but keeps their text", () => {
    expect(parseInline("[klik](javascript:alert(1))")).toEqual([{ kind: "text", text: "klik" }, { kind: "text", text: ")" }]);
    expect(safeHref("mailto:dpo@example.com")).toBe("mailto:dpo@example.com");
    expect(safeHref("data:text/html,x")).toBeNull();
  });

  it("allows internal docs routes (clickable guides) but nothing else relative", () => {
    expect(safeHref("/docs/posta")).toBe("/docs/posta");
    expect(safeHref("/docs/realtime-i-obavjestenja#poznata-ogranicenja")).toBe(
      "/docs/realtime-i-obavjestenja#poznata-ogranicenja",
    );
    expect(parseInline("[Pošta](/docs/posta)")).toEqual([
      { kind: "link", href: "/docs/posta", children: [{ kind: "text", text: "Pošta" }] },
    ]);
    // Relativna .md veza se prevodi u rutu još u ogledalu (generator), pa ovdje
    // ostaje odbijena; tako isto i sve što izlazi iz /docs/ prostora.
    expect(safeHref("posta.md")).toBeNull();
    expect(safeHref("/docs/../secrets")).toBeNull();
    expect(safeHref("/docs/posta?x=1")).toBeNull();
    expect(safeHref("/admin/users")).toBeNull();
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

describe("Faza 3 (c): tabele, kod, callouti i slike", () => {
  it("parses a markdown table with a separator row", () => {
    const blocks = parseMarkdown("| Polje | Obavezno |\n|---|---|\n| Naslov | da |\n| Opis | ne |");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: "table" });
    if (blocks[0].kind !== "table") throw new Error("expected table");
    expect(blocks[0].header.map((cell) => cell[0])).toEqual([
      { kind: "text", text: "Polje" },
      { kind: "text", text: "Obavezno" },
    ]);
    expect(blocks[0].rows).toHaveLength(2);
  });

  it("keeps a pipe line as a paragraph when there is no separator", () => {
    expect(parseMarkdown("| nije | tabela |").map((block) => block.kind)).toEqual(["paragraph"]);
  });

  it("parses a fenced code block with its language", () => {
    const blocks = parseMarkdown("```json\n{ \"a\": 1 }\n```");
    expect(blocks).toEqual([{ kind: "codeBlock", language: "json", text: '{ "a": 1 }' }]);
  });

  it("turns labelled quotes into callouts and leaves other quotes alone", () => {
    expect(parseMarkdown("> **Napomena:** nešto").map((block) => block.kind)).toEqual(["callout"]);
    expect(parseMarkdown("> **Napomena:** nešto")[0]).toMatchObject({ tone: "info" });
    expect(parseMarkdown("> **Upozorenje:** pazi")[0]).toMatchObject({ tone: "warning" });
    expect(parseMarkdown("> **NACRT**\n> tekst")[0]).toMatchObject({ kind: "quote" });
  });

  it("accepts relative images and refuses schemes or absolute paths", () => {
    expect(parseInline("![šema](assets/sema.png)")).toEqual([
      { kind: "image", src: "assets/sema.png", alt: "šema" },
    ]);
    expect(parseInline("![x](https://example.com/x.png)")).toEqual([{ kind: "text", text: "x" }]);
    expect(parseInline("![x](/etc/passwd)")).toEqual([{ kind: "text", text: "x" }]);
    expect(parseInline("![x](../docs/plans/raw.md)")).toEqual([{ kind: "text", text: "x" }]);
  });

  it("highlights strings, comments, numbers and known keywords", () => {
    const tokens = highlightCode('const a = 1; // komentar\n"tekst"', "ts");
    expect(tokens.filter((token) => token.kind === "keyword").map((token) => token.text)).toEqual(["const"]);
    expect(tokens.some((token) => token.kind === "comment" && token.text.includes("komentar"))).toBe(true);
    expect(tokens.some((token) => token.kind === "string" && token.text === '"tekst"')).toBe(true);
    expect(tokens.some((token) => token.kind === "number" && token.text === "1")).toBe(true);
  });
});
