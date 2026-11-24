/*
  W1.7 (`BA-xcut-20`): one redaction contract for everything this process writes
  to a log sink.

  The audit finding was that the API had no central log redaction and no
  exception sanitizer: a dependency error message (`PrismaClientKnownRequestError`,
  a Redis `ECONNREFUSED` banner, a failing HTTP client) was interpolated into a
  warning line verbatim, and a 5xx filter wrote `exception.stack` as-is. Any of
  those can carry a connection string with a password, an `Authorization` header,
  a session cookie or a bearer token that the dependency echoed back.

  Two jobs here, both pure and synchronous:

    1. strip characters that could break a line-oriented log sink,
    2. replace recognised secrets with `[redacted]`,
    3. bound the result so a 10 MB payload cannot become a 10 MB log line.

  Redaction is deliberately *conservative about false negatives and honest about
  false positives*: a value is replaced only when its key or shape is known
  (`password=`, `Bearer …`, `postgres://user:pw@…`, JWT, well-known API key
  prefixes). It never tries to guess whether some random 20-character word is a
  secret, because guessing turns logs into noise and still misses real secrets.
*/

export const logMaxTextLength = 2_000;
/** Stack traces are legitimately longer than a message, but still bounded. */
export const logMaxStackLength = 4_000;
export const logRedactedPlaceholder = '[redacted]';
export const logTruncatedMarker = '…[truncated]';

/**
 * Sensitive keys, in `key=value`, `key: value`, `"key": "value"` and
 * `key => value` shapes. The key list is the vocabulary every ecosystem uses;
 * `cookie`/`set-cookie` are included because an echoed request header carries a
 * session.
 */
const secretKeyValuePattern =
  /(\b(?:password|passwd|pwd|secret|client[-_]?secret|token|access[-_]?token|refresh[-_]?token|id[-_]?token|api[-_]?key|apikey|x-api-key|authorization|auth[-_]?header|cookie|set-cookie|session[-_]?id|private[-_]?key)["']?\s*(?:=>|[:=])\s*)("[^"]*"|'[^']*'|(?!bearer\b|basic\b)[^[\s,;&)\]}]+)/giu;

/** `Authorization: Bearer <token>` / `Basic <base64>` even without the key name. */
const bearerPattern = /\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{4,}/giu;

/**
 * Credentials embedded in a URL. The user name is kept (it identifies the
 * account that failed) and only the password is replaced.
 */
const urlCredentialsPattern =
  /\b([a-z][a-z0-9+.-]*:\/\/)([^:/?#\s@]*):([^@\s/?#]+)@/giu;

/** JSON Web Tokens, which are recognisable without any key name. */
const jwtPattern = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/gu;

/** Vendor-prefixed API keys. */
const prefixedKeyPattern =
  /\b(?:sk-[A-Za-z0-9]{16,}|gh[pousr]_[A-Za-z0-9]{16,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b/gu;

export function redactLogText(text: string): string {
  const singleLine = stripControlCharacters(text);
  return singleLine
    // A scheme first, so `Authorization: Bearer <token>` keeps the word and loses the token.
    .replace(bearerPattern, (_match, scheme: string) => `${scheme} ${logRedactedPlaceholder}`)
    .replace(urlCredentialsPattern, (_match, scheme: string, user: string) =>
      `${scheme}${user}:${logRedactedPlaceholder}@`,
    )
    .replace(secretKeyValuePattern, (_match, key: string, value: string) =>
      `${key}${quoteOf(value)}${logRedactedPlaceholder}${quoteOf(value)}`,
    )
    .replace(jwtPattern, logRedactedPlaceholder)
    .replace(prefixedKeyPattern, logRedactedPlaceholder);
}

/** JSON and `key: 'value'` shapes keep their quoting, so the line stays parseable. */
function quoteOf(value: string): '' | '\'' | '"' {
  if (value.startsWith('"')) return '"';
  if (value.startsWith('\'')) return '\'';
  return '';
}

/** Redaction plus the length bound; the only text function the logger calls. */
export function redactAndBoundLogText(
  text: string,
  maxLength: number = logMaxTextLength,
): string {
  const redacted = redactLogText(text);
  if (redacted.length <= maxLength) {
    return redacted;
  }
  return `${redacted.slice(0, maxLength)}${logTruncatedMarker}(+${redacted.length - maxLength})`;
}

/**
 * Line-oriented sinks (container logs, JSON collectors) must not receive raw
 * control characters: a lone `\r` rewrites the visible line and `\u0000` can
 * truncate a JSON field in some collectors. Newlines and tabs are kept because
 * stack traces legitimately contain them.
 */
function stripControlCharacters(text: string): string {
  let output = '';
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (code === 0x0a || code === 0x09 || code >= 0x20) {
      output += character;
    }
  }
  return output;
}
