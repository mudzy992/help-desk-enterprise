/**
 * Paket 2.6 (§6.3): replaces exact occurrences of a person's identifiers in
 * free text. Case-insensitive, Unicode NFC, word boundaries for names. A
 * first name alone is never replaced (too many false positives — documented
 * limitation).
 */
export type ScrubIdentifiers = {
  readonly displayName: string;
  readonly email: string;
  readonly distinguishedName?: string | null;
  readonly logins?: readonly (string | null | undefined)[];
};

export type TextScrubber = {
  /** Returns the replaced text and the number of replacements. */
  scrub(text: string): { readonly text: string; readonly count: number };
  /** Walks JSON values and scrubs every string (keys stay). */
  scrubJson<T>(value: T): { readonly value: T; readonly count: number };
};

const letter = '[\\p{L}\\p{N}_]';
const emailChar = '[\\p{L}\\p{N}._%+-]';
/** After an address: no address character — a sentence-ending dot is fine. */
const emailEnd = '(?![\\p{L}\\p{N}_%+-]|@|\\.[\\p{L}\\p{N}])';

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function nfc(value: string): string {
  return value.normalize('NFC');
}

/** Whitespace in names matches any run of whitespace. */
function namePattern(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map(escape)
    .join('\\s+');
}

export function nameVariants(displayName: string): string[] {
  const tokens = nfc(displayName).trim().split(/\s+/).filter(Boolean);
  const full = tokens.join(' ');
  // A single short token (e.g. "Amra") is a first name: never replaced.
  if (tokens.length < 2 && full.length < 6) return [];
  const variants = [full];
  if (tokens.length >= 2) {
    // "Prezime Ime" (last token first) and, for three tokens, the first two swapped with the last.
    variants.push([tokens[tokens.length - 1], ...tokens.slice(0, -1)].join(' '));
  }
  return [...new Set(variants)];
}

export function createTextScrubber(identifiers: ScrubIdentifiers, replacement: string): TextScrubber {
  const patterns: string[] = [];
  const email = nfc(identifiers.email).trim();
  if (email.includes('@')) {
    patterns.push(`(?<!${emailChar})${escape(email)}${emailEnd}`);
    const local = email.slice(0, email.indexOf('@'));
    if (local.length >= 5) patterns.push(`(?<!${emailChar})${escape(local)}${emailEnd}`);
  }
  const dn = identifiers.distinguishedName?.trim();
  if (dn) patterns.push(escape(nfc(dn)));
  for (const login of identifiers.logins ?? []) {
    const value = login?.trim();
    if (value && value.length >= 4) {
      // DOMAIN\login and plain login.
      patterns.push(`(?<!${emailChar})(?:[\\p{L}\\p{N}-]+\\\\)?${escape(nfc(value))}${emailEnd}`);
    }
  }
  for (const variant of nameVariants(identifiers.displayName)) {
    patterns.push(`(?<!${letter})${namePattern(variant)}(?!${letter})`);
  }
  // Longest first, so an e-mail wins over its local part.
  patterns.sort((a, b) => b.length - a.length);
  const regex = patterns.length === 0 ? null : new RegExp(patterns.join('|'), 'giu');

  const scrub = (text: string) => {
    if (regex === null || text.length === 0) return { text, count: 0 };
    let count = 0;
    const result = nfc(text).replace(regex, () => {
      count += 1;
      return replacement;
    });
    return count === 0 ? { text, count: 0 } : { text: result, count };
  };

  const scrubJson = <T>(value: T): { value: T; count: number } => {
    let count = 0;
    const walk = (node: unknown): unknown => {
      if (typeof node === 'string') {
        const scrubbed = scrub(node);
        count += scrubbed.count;
        return scrubbed.text;
      }
      if (Array.isArray(node)) return node.map(walk);
      if (node !== null && typeof node === 'object' && !(node instanceof Date)) {
        return Object.fromEntries(Object.entries(node as Record<string, unknown>).map(([key, child]) => [key, walk(child)]));
      }
      return node;
    };
    const walked = walk(value) as T;
    return { value: count === 0 ? value : walked, count };
  };

  return { scrub, scrubJson };
}

/** Up to ~60 characters around the first replacement — contains only the pseudonym. */
export function replacementExample(scrubbedText: string, replacement: string): string | null {
  const index = scrubbedText.indexOf(replacement);
  if (index < 0) return null;
  const start = Math.max(0, index - 30);
  const end = Math.min(scrubbedText.length, index + replacement.length + 30);
  return `${start > 0 ? '…' : ''}${scrubbedText.slice(start, end).replace(/\s+/g, ' ')}${end < scrubbedText.length ? '…' : ''}`;
}
