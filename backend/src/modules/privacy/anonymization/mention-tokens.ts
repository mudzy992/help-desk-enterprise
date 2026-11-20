import { nameVariants, type ScrubIdentifiers } from './text-scrubber';

/**
 * BA-changes-17 (parity with W7.34): the strings worth searching for during an
 * anonymisation. The list is exactly the identifier set the scrubber can
 * replace, with the same length thresholds, so "the scrubber can change this
 * row" and "this row is a candidate" stay the same set.
 *
 * Shared by the problem and change selection so the two cannot drift apart: a
 * person named in somebody else's record is selected the same way in both.
 */
export function mentionTokens(identifiers: ScrubIdentifiers): readonly string[] {
  const tokens = new Set<string>();
  const email = identifiers.email?.trim();
  if (email !== undefined && email.includes('@')) {
    tokens.add(email);
    const local = email.slice(0, email.indexOf('@'));
    if (local.length >= 5) tokens.add(local);
  }
  const dn = identifiers.distinguishedName?.trim();
  if (dn !== undefined && dn.length > 0) tokens.add(dn);
  for (const login of identifiers.logins ?? []) {
    const value = login?.trim();
    if (value !== undefined && value.length >= 4) tokens.add(value);
  }
  for (const variant of nameVariants(identifiers.displayName ?? '')) tokens.add(variant);
  return [...tokens];
}
