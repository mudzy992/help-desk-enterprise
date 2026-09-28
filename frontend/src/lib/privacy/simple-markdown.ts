/**
 * Paket 2.6 (§8): a deliberately small Markdown parser for the privacy notice.
 * It produces a plain tree that React renders as elements, never HTML, so an
 * admin-entered notice cannot inject markup or scripts. Supported: `#`–`###`
 * headings, paragraphs, `-`/`*` and `1.` lists, `>` quotes, `**bold**`,
 * `*italic*`/`_italic_`, `` `code` ``, `[text](url)` (http, https, mailto
 * only) and backslash escapes. Anything else is shown as text.
 */

export type InlineNode =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "strong" | "em"; readonly children: readonly InlineNode[] }
  | { readonly kind: "code"; readonly text: string }
  | { readonly kind: "link"; readonly href: string; readonly children: readonly InlineNode[] };

export type BlockNode =
  | { readonly kind: "heading"; readonly level: 1 | 2 | 3; readonly children: readonly InlineNode[] }
  | { readonly kind: "paragraph"; readonly children: readonly InlineNode[] }
  | { readonly kind: "list"; readonly ordered: boolean; readonly items: readonly (readonly InlineNode[])[] }
  | { readonly kind: "quote"; readonly children: readonly BlockNode[] };

const escapable = "\\`*_[]()<>#|+-.!~";

export function safeHref(url: string): string | null {
  const trimmed = url.trim();
  return /^(https?:\/\/|mailto:)/i.test(trimmed) ? trimmed : null;
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

export function parseMarkdown(source: string): BlockNode[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: BlockNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line.trim().length === 0) {
      index += 1;
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading !== null) {
      blocks.push({ kind: "heading", level: heading[1].length as 1 | 2 | 3, children: parseInline(heading[2].trim()) });
      index += 1;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quoted: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoted.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ kind: "quote", children: parseMarkdown(quoted.join("\n")) });
      continue;
    }
    const bullet = /^\s*[-*]\s+/;
    const numbered = /^\s*\d+[.)]\s+/;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line);
      const marker = ordered ? numbered : bullet;
      const items: InlineNode[][] = [];
      while (index < lines.length && marker.test(lines[index])) {
        items.push(parseInline(lines[index].replace(marker, "").trim()));
        index += 1;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }
    const paragraph: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim().length > 0 &&
      !/^(#{1,3})\s+/.test(lines[index]) &&
      !/^>\s?/.test(lines[index]) &&
      !bullet.test(lines[index]) &&
      !numbered.test(lines[index])
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ kind: "paragraph", children: parseInline(paragraph.join(" ")) });
  }
  return blocks;
}
