import {
  calloutLabels,
  isTableSeparator,
  parseInline,
  splitTableRow,
  type BlockNode,
  type InlineNode,
} from "@/lib/privacy/markdown-inline";

export {
  parseInline,
  safeHref,
  safeImageSrc,
  type BlockNode,
  type CalloutTone,
  type InlineNode,
} from "@/lib/privacy/markdown-inline";
export { highlightCode, type CodeToken, type CodeTokenKind } from "@/lib/privacy/markdown-code-highlighter";

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
      blocks.push({
        kind: "heading",
        level: heading[1].length as 1 | 2 | 3,
        children: parseInline(heading[2].trim()),
      });
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
