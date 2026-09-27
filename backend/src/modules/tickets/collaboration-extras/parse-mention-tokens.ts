/**
 * Paket 2.4 (B2/B3): an internal note carries mentions as `@[Display Name](userId)`.
 * Plain `@text` is ordinary text. At most `maxMentionsPerMessage` distinct users
 * are honoured; any further token is written back as plain `@Display Name`.
 */
export const maxMentionsPerMessage = 10;

const mentionTokenPattern = /@\[([^\]\n\r]{1,120})\]\(([A-Za-z0-9_-]{8,64})\)/g;

export type MentionToken = {
  readonly userId: string;
  readonly name: string;
};

/** Distinct mentioned users in order of first appearance (capped). */
export function parseMentionTokens(body: string): readonly MentionToken[] {
  const seen = new Map<string, MentionToken>();
  for (const match of body.matchAll(mentionTokenPattern)) {
    const userId = match[2] ?? '';
    if (!seen.has(userId) && seen.size < maxMentionsPerMessage) {
      seen.set(userId, { userId, name: (match[1] ?? '').trim() });
    }
  }
  return [...seen.values()];
}

/** Keeps tokens of `keep` users; every other token becomes plain `@Name`. */
export function rewriteMentionTokens(body: string, keep: ReadonlySet<string>): string {
  return body.replace(mentionTokenPattern, (whole, name: string, userId: string) =>
    keep.has(userId) ? whole : `@${name.trim()}`,
  );
}
