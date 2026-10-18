/**
 * a deliberately small Markdown parser for the privacy notice.
 * It produces a plain tree that React renders as elements, never HTML, so an
 * admin-entered notice cannot inject markup or scripts. Supported: `#`–`###`
 * headings, paragraphs, `-`/`*` and `1.` lists, `>` quotes, `**bold**`,
 * `*italic*`/`_italic_`, `` `code` ``, `[text](url)` (http, https, mailto
 * only) and backslash escapes. Anything else is shown as text.
 *
 * extended for the Docs module with tables, fenced code blocks
 * (` ```json ` …), images (`![alt](putanja)`) and callouts (`> **Napomena:**`).
 * The extensions are additive — the privacy notice renders exactly as before.
 */

export type InlineNode =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "strong" | "em"; readonly children: readonly InlineNode[] }
  | { readonly kind: "code"; readonly text: string }
  | { readonly kind: "link"; readonly href: string; readonly children: readonly InlineNode[] }
  | { readonly kind: "image"; readonly src: string; readonly alt: string };

export type CalloutTone = "info" | "warning" | "success";

export type BlockNode =
  | {
      readonly kind: "heading";
      readonly level: 1 | 2 | 3;
      readonly children: readonly InlineNode[];
    }
  | { readonly kind: "paragraph"; readonly children: readonly InlineNode[] }
  | {
      readonly kind: "list";
      readonly ordered: boolean;
      readonly items: readonly (readonly InlineNode[])[];
    }
  | { readonly kind: "quote"; readonly children: readonly BlockNode[] }
  | {
      readonly kind: "table";
      readonly header: readonly (readonly InlineNode[])[];
      readonly rows: readonly (readonly (readonly InlineNode[])[])[];
    }
  | { readonly kind: "codeBlock"; readonly language: string | null; readonly text: string }
  | {
      readonly kind: "callout";
      readonly tone: CalloutTone;
      readonly children: readonly BlockNode[];
    };

const escapable = "\\`*_[]()<>#|+-.!~";

/** Callout labels recognised at the start of a quote (§7.1). */
export const calloutLabels: ReadonlyArray<{
  readonly pattern: RegExp;
  readonly tone: CalloutTone;
}> = [
  { pattern: /^\*\*(Upozorenje|Važno|Pazi):\*\*/i, tone: "warning" },
  { pattern: /^\*\*(Savjet|Preporuka):\*\*/i, tone: "success" },
  { pattern: /^\*\*(Namjena|Napomena|Info|Bilješka):\*\*/i, tone: "info" },
];

export function safeHref(url: string): string | null {
  const trimmed = url.trim();
  if (/^(https?:\/\/|mailto:)/i.test(trimmed)) return trimmed;
  // internoj ruti dokumentacije vjerujemo — `MarkdownView` je
  // prikazuje kroz router, pa vodič može uputiti na drugu stranicu vodiča.
  return /^\/docs\/[a-z0-9-]+(#[a-z0-9-]+)?$/.test(trimmed) ? trimmed : null;
}

/**
 * Relative image path inside the docs mirror; schemes, absolute paths and
 * `..` are rejected (they would point outside the published content).
 */
export function safeImageSrc(url: string): string | null {
  const trimmed = url.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;
  if (trimmed.startsWith("/") || trimmed.startsWith("..")) return null;
  if (trimmed.includes("//") || trimmed.includes("\\")) return null;
  return /^[A-Za-z0-9._/-]+$/.test(trimmed) ? trimmed : null;
}

/** Inline parser: a single left-to-right scan with explicit delimiters. */
export function parseInline(source: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let text = "";
  const flush = () => {
    if (text.length > 0) nodes.push({ kind: "text", text });
    text = "";
  };
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === "\\" && index + 1 < source.length && escapable.includes(source[index + 1])) {
      text += source[index + 1];
      index += 2;
      continue;
    }
    if (char === "`") {
      const end = source.indexOf("`", index + 1);
      if (end > index + 1) {
        flush();
        nodes.push({ kind: "code", text: source.slice(index + 1, end) });
        index = end + 1;
        continue;
      }
    }
    if (char === "!" && source[index + 1] === "[") {
      const close = findClosing(source, "]", index + 2);
      if (close !== -1 && source[close + 1] === "(") {
        const end = source.indexOf(")", close + 2);
        if (end !== -1) {
          const src = safeImageSrc(source.slice(close + 2, end));
          const alt = source.slice(index + 2, close);
          flush();
          if (src !== null) nodes.push({ kind: "image", src, alt });
          else nodes.push({ kind: "text", text: alt });
          index = end + 1;
          continue;
        }
      }
    }
    if (char === "*" && source[index + 1] === "*") {
      const end = findClosing(source, "**", index + 2);
      if (end !== -1) {
        flush();
        nodes.push({ kind: "strong", children: parseInline(source.slice(index + 2, end)) });
        index = end + 2;
        continue;
      }
    }
    if ((char === "*" || char === "_") && source[index + 1] !== char && source[index + 1] !== " ") {
      const end = findClosing(source, char, index + 1);
      if (end !== -1 && end > index + 1) {
        flush();
        nodes.push({ kind: "em", children: parseInline(source.slice(index + 1, end)) });
        index = end + 1;
        continue;
      }
    }
    if (char === "[") {
      const close = findClosing(source, "]", index + 1);
      if (close !== -1 && source[close + 1] === "(") {
        const end = source.indexOf(")", close + 2);
        if (end !== -1) {
          const href = safeHref(source.slice(close + 2, end));
          const label = parseInline(source.slice(index + 1, close));
          flush();
          if (href === null) nodes.push(...label);
          else nodes.push({ kind: "link", href, children: label });
          index = end + 1;
          continue;
        }
      }
    }
    text += char;
    index += 1;
  }
  flush();
  return nodes;
}

/** Next unescaped occurrence of `delimiter` at or after `from`, or -1. */
function findClosing(source: string, delimiter: string, from: number): number {
  for (let index = from; index <= source.length - delimiter.length; index += 1) {
    if (source[index] === "\\") {
      index += 1;
      continue;
    }
    if (source.startsWith(delimiter, index)) return index;
  }
  return -1;
}

export function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

export function isTableSeparator(line: string): boolean {
  const cells = splitTableRow(line);
  return (
    cells.length > 0 &&
    line.trim().startsWith("|") &&
    cells.every((cell) => /^:?-{2,}:?$/.test(cell))
  );
}
