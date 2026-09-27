/*
  Paket 2.4 (B2): an internal note stores a mention as `@[Display Name](userId)`;
  the conversation renders it as a chip. The same pattern as the backend parser.
*/
const mentionTokenPattern = /@\[([^\]\n\r]{1,120})\]\(([A-Za-z0-9_-]{8,64})\)/g;

export type MessageSegment =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "mention"; readonly name: string; readonly userId: string };

export function splitMentionSegments(body: string): readonly MessageSegment[] {
  const segments: MessageSegment[] = [];
  let last = 0;
  for (const match of body.matchAll(mentionTokenPattern)) {
    const index = match.index ?? 0;
    if (index > last) segments.push({ kind: "text", text: body.slice(last, index) });
    segments.push({ kind: "mention", name: (match[1] ?? "").trim(), userId: match[2] ?? "" });
    last = index + match[0].length;
  }
  if (last < body.length) segments.push({ kind: "text", text: body.slice(last) });
  return segments;
}

export type MentionQuery = { readonly start: number; readonly query: string };

/** `@query` immediately before the caret (start of text or after whitespace), else null. */
export function detectMentionQuery(body: string, caret: number): MentionQuery | null {
  const before = body.slice(0, caret);
  const match = /(^|\s)@([^\s@[\]()]{0,40})$/u.exec(before);
  if (match === null) return null;
  return { start: caret - (match[2] ?? "").length - 1, query: match[2] ?? "" };
}

/** Replaces `@query` (from `start` to `caret`) with the token and a trailing space. */
export function insertMentionToken(
  body: string,
  mention: MentionQuery,
  caret: number,
  candidate: { readonly id: string; readonly displayName: string },
): { readonly value: string; readonly caret: number } {
  const name = candidate.displayName.replace(/[[\]\n\r]/g, " ").trim() || candidate.id;
  const token = `@[${name}](${candidate.id}) `;
  const value = body.slice(0, mention.start) + token + body.slice(caret);
  return { value, caret: mention.start + token.length };
}
