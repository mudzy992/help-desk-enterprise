export type CodeTokenKind = "plain" | "keyword" | "string" | "comment" | "number";

export type CodeToken = {
  readonly kind: CodeTokenKind;
  readonly text: string;
};

const codeKeywordSets: Readonly<Record<string, readonly string[]>> = {
  json: ["true", "false", "null"],
  ts: [
    "import",
    "export",
    "from",
    "const",
    "let",
    "function",
    "return",
    "type",
    "interface",
    "extends",
    "implements",
    "class",
    "new",
    "async",
    "await",
    "if",
    "else",
    "for",
    "of",
    "in",
    "null",
    "undefined",
    "true",
    "false",
    "readonly",
    "public",
    "private",
    "readonly",
  ],
  bash: [
    "sudo",
    "docker",
    "docker-compose",
    "npm",
    "npx",
    "node",
    "git",
    "cd",
    "ls",
    "cat",
    "echo",
    "export",
    "curl",
    "ssh",
    "systemctl",
    "journalctl",
    "if",
    "then",
    "fi",
    "for",
    "do",
    "done",
  ],
  sql: [
    "select",
    "from",
    "where",
    "join",
    "left",
    "right",
    "inner",
    "outer",
    "on",
    "group",
    "by",
    "order",
    "limit",
    "insert",
    "into",
    "values",
    "update",
    "set",
    "delete",
    "create",
    "table",
    "index",
    "and",
    "or",
    "not",
    "null",
    "as",
    "distinct",
    "count",
    "sum",
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
