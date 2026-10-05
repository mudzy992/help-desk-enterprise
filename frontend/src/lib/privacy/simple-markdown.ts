/**
 * Paket 2.6 (§8): a deliberately small Markdown parser for the privacy notice.
 * It produces a plain tree that React renders as elements, never HTML, so an
 * admin-entered notice cannot inject markup or scripts. Supported: `#`–`###`
 * headings, paragraphs, `-`/`*` and `1.` lists, `>` quotes, `**bold**`,
 * `*italic*`/`_italic_`, `` `code` ``, `[text](url)` (http, https, mailto
 * only) and backslash escapes. Anything else is shown as text.
 *
 * Faza 3 (c): extended for the Docs module with tables, fenced code blocks
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
  | { readonly kind: "heading"; readonly level: 1 | 2 | 3; readonly children: readonly InlineNode[] }
  | { readonly kind: "paragraph"; readonly children: readonly InlineNode[] }
  | { readonly kind: "list"; readonly ordered: boolean; readonly items: readonly (readonly InlineNode[])[] }
  | { readonly kind: "quote"; readonly children: readonly BlockNode[] }
  | {
      readonly kind: "table";
      readonly header: readonly (readonly InlineNode[])[];
      readonly rows: readonly (readonly (readonly InlineNode[])[])[];
    }
  | { readonly kind: "codeBlock"; readonly language: string | null; readonly text: string }
  | { readonly kind: "callout"; readonly tone: CalloutTone; readonly children: readonly BlockNode[] };

const escapable = "\\`*_[]()<>#|+-.!~";

/** Callout labels recognised at the start of a quote (Faza 3 §7.1). */
const calloutLabels: ReadonlyArray<{ readonly pattern: RegExp; readonly tone: CalloutTone }> = [
  { pattern: /^\*\*(Upozorenje|Važno|Pazi):\*\*/i, tone: "warning" },
  { pattern: /^\*\*(Savjet|Preporuka):\*\*/i, tone: "success" },
  { pattern: /^\*\*(Namjena|Napomena|Info|Bilješka):\*\*/i, tone: "info" },
];

export function safeHref(url: string): string | null {
  const trimmed = url.trim();
  if (/^(https?:\/\/|mailto:)/i.test(trimmed)) return trimmed;
  // Faza 3 (dopuna): internoj ruti dokumentacije vjerujemo — `MarkdownView` je
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

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function isTableSeparator(line: string): boolean {
  const cells = splitTableRow(line);
  return (
    cells.length > 0 &&
    line.trim().startsWith("|") &&
    cells.every((cell) => /^:?-{2,}:?$/.test(cell))
  );
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
    const fence = /^```\s*([A-Za-z0-9+#-]*)\s*$/.exec(line);
    if (fence !== null) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        body.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({
        kind: "codeBlock",
        language: fence[1].length > 0 ? fence[1].toLowerCase() : null,
        text: body.join("\n"),
      });
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading !== null) {
      blocks.push({ kind: "heading", level: heading[1].length as 1 | 2 | 3, children: parseInline(heading[2].trim()) });
      index += 1;
      continue;
    }
    if (
      line.trim().startsWith("|") &&
      index + 1 < lines.length &&
      isTableSeparator(lines[index + 1])
    ) {
      const header = splitTableRow(line).map((cell) => parseInline(cell));
      const rows: InlineNode[][][] = [];
      index += 2;
      while (index < lines.length && lines[index].trim().startsWith("|")) {
        rows.push(splitTableRow(lines[index]).map((cell) => parseInline(cell)));
        index += 1;
      }
      blocks.push({ kind: "table", header, rows });
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quoted: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoted.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      const first = quoted.find((entry) => entry.trim().length > 0)?.trim() ?? "";
      const label = calloutLabels.find((entry) => entry.pattern.test(first));
      const children = parseMarkdown(quoted.join("\n"));
      blocks.push(
        label === undefined
          ? { kind: "quote", children }
          : { kind: "callout", tone: label.tone, children },
      );
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
      !/^```/.test(lines[index]) &&
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

export type CodeTokenKind = "plain" | "keyword" | "string" | "comment" | "number";

export type CodeToken = {
  readonly kind: CodeTokenKind;
  readonly text: string;
};

const codeKeywordSets: Readonly<Record<string, readonly string[]>> = {
  json: ["true", "false", "null"],
  ts: [
    "import", "export", "from", "const", "let", "function", "return", "type", "interface",
    "extends", "implements", "class", "new", "async", "await", "if", "else", "for", "of", "in",
    "null", "undefined", "true", "false", "readonly", "public", "private", "readonly",
  ],
  bash: [
    "sudo", "docker", "docker-compose", "npm", "npx", "node", "git", "cd", "ls", "cat", "echo",
    "export", "curl", "ssh", "systemctl", "journalctl", "if", "then", "fi", "for", "do", "done",
  ],
  sql: [
    "select", "from", "where", "join", "left", "right", "inner", "outer", "on", "group", "by",
    "order", "limit", "insert", "into", "values", "update", "set", "delete", "create", "table",
    "index", "and", "or", "not", "null", "as", "distinct", "count", "sum",
  ],
};

/**
 * A deliberately small highlighter: comments, strings and numbers are always
 * marked, keywords only when the language is known. It never emits HTML — the
 * view renders the tokens as React elements.
 */
export function highlightCode(text: string, language: string | null): CodeToken[] {
  const keywords = language === null ? [] : (codeKeywordSets[language] ?? []);
  const tokens: CodeToken[] = [];
  const commentPattern = language === "sql" ? "--[^\\n]*" : "(?://|#)[^\\n]*";
  const pattern = new RegExp(
    `"(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|${commentPattern}|\\b\\d+(?:\\.\\d+)?\\b|\\b[A-Za-z_][A-Za-z0-9_]*\\b`,
    "g",
  );
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > cursor) tokens.push({ kind: "plain", text: text.slice(cursor, start) });
    const value = match[0];
    const kind: CodeTokenKind = /^["']/.test(value)
      ? "string"
      : value.startsWith("//") || value.startsWith("#") || value.startsWith("--")
        ? "comment"
        : /^\d/.test(value)
          ? "number"
          : keywords.includes(value.toLowerCase())
            ? "keyword"
            : "plain";
    tokens.push({ kind, text: value });
    cursor = start + value.length;
  }
  if (cursor < text.length) tokens.push({ kind: "plain", text: text.slice(cursor) });
  return tokens;
}
