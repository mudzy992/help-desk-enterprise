/*
  Secret rotation (after 2.6): an explicitly configured key may be written as
  plain text (>= 16 characters, used as UTF-8 bytes — the historic format) or
  as "base64:<bytes>". The base64 form lets an operator *pin* a key that was so
  far derived from MFA_ENCRYPTION_KEY to the exact same bytes (see
  `node dist/src/cli/secrets.js pins`), so MFA_ENCRYPTION_KEY can later be
  rotated without silently changing the reply-token, tombstone or export keys.
*/
export const base64SecretPrefix = 'base64:';
export const minimumExplicitSecretLength = 16;

export type ExplicitSecret = { readonly bytes: Buffer; readonly pinned: boolean };

/** null = not configured (or too short) → caller falls back to derivation. */
export function readExplicitSecret(raw: string | undefined): ExplicitSecret | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith(base64SecretPrefix)) {
    const bytes = Buffer.from(trimmed.slice(base64SecretPrefix.length), 'base64');
    return bytes.length >= minimumExplicitSecretLength ? { bytes, pinned: true } : null;
  }
  return trimmed.length >= minimumExplicitSecretLength ? { bytes: Buffer.from(trimmed, 'utf8'), pinned: false } : null;
}

export function formatPinnedSecret(bytes: Buffer): string {
  return `${base64SecretPrefix}${bytes.toString('base64')}`;
}
