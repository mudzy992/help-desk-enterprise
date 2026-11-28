/**
 * W2.37 (BA-organizational-units-07): one RFC 4514 reader/writer for every
 * distinguished name the backend touches.
 *
 * Before this module the backend carried two different DN parsers:
 * `modules/directory-sync/ldaps/distinguished-name.ts` (split on unescaped
 * commas, unescape by regular expression) and the two normalizers used by the
 * organizational-unit and manual-catalogue APIs (`split(',')`, no escapes). A
 * super admin could therefore type `OU=Korisnici\, Inc.,DC=local` and get a
 * different answer from the LDAPS mapping path than from the API validator, and
 * a rename rewrote descendants with a plain string suffix.
 *
 * Supported subset (the grammar of RFC 4514 §3, plus the two forms every AD
 * deployment actually emits):
 *
 * - `attributeType` = descriptor (`OU`, `dc`, `cn`, ...) or numeric OID; types are
 *   canonicalised to upper case.
 * - values: escaped characters (`\,` `\+` `\"` `\\` `\<` `\>` `\;` `\=` `\ ` `\#`),
 *   hexadecimal byte escapes (`\C4`), quoted values (`"..."`, RFC 2253 legacy) and
 *   hexadecimal BER values (`#0C034F55`, kept verbatim — see the note below).
 * - multi-valued RDNs (`OU=A+CN=B`), preserved and re-serialised with `+`.
 * - UTF-8 values, so `OU=Podružnica Zenica` round-trips unchanged.
 * - insignificant spaces around separators (`OU = A , DC = local`).
 *
 * Deliberately not decoded: `#hexstring` values are stored as the hexadecimal
 * BER payload and compared by that payload. Decoding needs a BER reader, and no
 * code path in this product reads a binary-valued RDN — comparing the canonical
 * payload is deterministic and is documented as the supported subset.
 *
 * `#` values are the only case where the canonical form is not human readable;
 * everything else round-trips through `formatDistinguishedName` unchanged.
 */

const escapedCharacters = new Set(['"', '+', ',', ';', '<', '=', '>', '\\']);

const descriptorPattern = /^[A-Za-z][A-Za-z0-9-]*$/;
const numericOidPattern = /^[0-9]+(?:\.[0-9]+)*$/;
const hexPair = /^[0-9A-Fa-f]{2}$/;

export type DistinguishedNameSyntaxFailure =
  | 'EMPTY'
  | 'MISSING_SEPARATOR'
  | 'INVALID_ATTRIBUTE_TYPE'
  | 'INVALID_ESCAPE'
  | 'UNESCAPED_QUOTE'
  | 'UNTERMINATED_QUOTE'
  | 'INVALID_HEX_VALUE';

export class DistinguishedNameSyntaxError extends Error {
  public readonly reason: DistinguishedNameSyntaxFailure;

  public constructor(reason: DistinguishedNameSyntaxFailure) {
    super(`Invalid RFC 4514 distinguished name: ${reason}`);
    this.name = 'DistinguishedNameSyntaxError';
    this.reason = reason;
  }
}

export type DistinguishedNameAttributeEncoding = 'string' | 'hex';

export type DistinguishedNameAttribute = {
  /** Attribute type as written, canonicalised to upper case. */
  readonly type: string;
  /**
   * Unescaped value for `encoding: 'string'`, lower-case hexadecimal BER payload
   * for `encoding: 'hex'`.
   */
  readonly value: string;
  readonly encoding: DistinguishedNameAttributeEncoding;
};

export type DistinguishedNameRelative = {
  /** One RDN; more than one attribute means a multi-valued RDN (`A=B+C=D`). */
  readonly attributes: readonly DistinguishedNameAttribute[];
};

type StringToken = { readonly text: string; readonly escaped: boolean };

type ParsedAttribute = {
  readonly attribute: DistinguishedNameAttribute;
  readonly nextIndex: number;
};

type ParsedValue = {
  readonly value: string;
  readonly encoding: DistinguishedNameAttributeEncoding;
  readonly nextIndex: number;
};

export function parseDistinguishedName(
  value: string,
): readonly DistinguishedNameRelative[] {
  const input = value.trim();
  if (input.length === 0) {
    throw new DistinguishedNameSyntaxError('EMPTY');
  }
  const relatives: DistinguishedNameRelative[] = [];
  let cursor = 0;
  for (;;) {
    const attributes: DistinguishedNameAttribute[] = [];
    for (;;) {
      const parsed = readAttribute(input, cursor);
      attributes.push(parsed.attribute);
      cursor = skipSpaces(input, parsed.nextIndex);
      if (input[cursor] === '+') {
        cursor = skipSpaces(input, cursor + 1);
        continue;
      }
      break;
    }
    relatives.push({ attributes });
    if (cursor >= input.length) {
      return relatives;
    }
    if (input[cursor] !== ',') {
      throw new DistinguishedNameSyntaxError('MISSING_SEPARATOR');
    }
    cursor = skipSpaces(input, cursor + 1);
    if (cursor >= input.length) {
      throw new DistinguishedNameSyntaxError('MISSING_SEPARATOR');
    }
  }
}

export function formatDistinguishedName(
  relatives: readonly DistinguishedNameRelative[],
): string {
  return relatives
    .map((relative) => relative.attributes.map(formatAttribute).join('+'))
    .join(',');
}

/**
 * Canonical form used for storage and API output: attribute types upper case,
 * values re-escaped per RFC 4514, separators without surrounding spaces.
 */
export function createCanonicalDistinguishedName(value: string): string {
  return formatDistinguishedName(parseDistinguishedName(value));
}

/**
 * Case-folded comparison key shared by the manual catalogue and the LDAPS mapping
 * path, so both flows agree on whether two names denote the same entry.
 */
export function createDistinguishedNameComparisonKey(value: string): string {
  return createCanonicalDistinguishedName(value).toLowerCase();
}

export function createRelativeDistinguishedNameComparisonKey(
  relative: DistinguishedNameRelative,
): string {
  return formatDistinguishedName([relative]).toLowerCase();
}

/** Escapes a single value for use as `TYPE=<escaped>` (RFC 4514 §2.4). */
export function escapeDistinguishedNameValue(value: string): string {
  const characters = [...value];
  let output = '';
  characters.forEach((character, index) => {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint === 0) {
      output += '\\00';
      return;
    }
    if (codePoint < 0x20 || codePoint === 0x7f) {
      output += `\\${codePoint.toString(16).toUpperCase().padStart(2, '0')}`;
      return;
    }
    const isLeadingCharacter = index === 0;
    const isTrailingCharacter = index === characters.length - 1;
    const needsEscape =
      escapedCharacters.has(character) ||
      (character === ' ' && (isLeadingCharacter || isTrailingCharacter)) ||
      (character === '#' && isLeadingCharacter);
    output += needsEscape ? `\\${character}` : character;
  });
  return output;
}

/** True when both names denote the same entry (case-folded comparison). */
export function areDistinguishedNamesEqual(left: string, right: string): boolean {
  try {
    return (
      createDistinguishedNameComparisonKey(left) ===
      createDistinguishedNameComparisonKey(right)
    );
  } catch {
    return left.trim() === right.trim();
  }
}

/** True when `distinguishedName` is `base` itself or lies underneath it. */
export function isDistinguishedNameWithinBase(input: {
  readonly distinguishedName: string;
  readonly baseDistinguishedName: string;
}): boolean {
  try {
    const candidate = parseDistinguishedName(input.distinguishedName);
    const base = parseDistinguishedName(input.baseDistinguishedName);
    if (base.length > candidate.length) {
      return false;
    }
    return hasSuffix(candidate, base);
  } catch {
    return false;
  }
}

/** True only for a strict descendant (the base itself is not a descendant). */
export function isStrictDistinguishedNameDescendant(input: {
  readonly distinguishedName: string;
  readonly ancestorDistinguishedName: string;
}): boolean {
  try {
    const candidate = parseDistinguishedName(input.distinguishedName);
    const ancestor = parseDistinguishedName(input.ancestorDistinguishedName);
    if (ancestor.length >= candidate.length) {
      return false;
    }
    return hasSuffix(candidate, ancestor);
  } catch {
    return false;
  }
}

/**
 * Replaces the trailing RDNs that `oldAncestorDistinguishedName` occupies with
 * `newAncestorDistinguishedName`. Returns `null` when `currentDistinguishedName`
 * is not inside the old ancestor, so the caller decides what that means.
 */
export function rewriteDistinguishedNameAncestor(input: {
  readonly currentDistinguishedName: string;
  readonly oldAncestorDistinguishedName: string;
  readonly newAncestorDistinguishedName: string;
}): string | null {
  const current = parseDistinguishedName(input.currentDistinguishedName);
  const oldAncestor = parseDistinguishedName(input.oldAncestorDistinguishedName);
  const newAncestor = parseDistinguishedName(input.newAncestorDistinguishedName);
  if (oldAncestor.length > current.length) {
    return null;
  }
  const prefixLength = current.length - oldAncestor.length;
  const prefix = current.slice(0, prefixLength);
  if (!hasSuffix(current, oldAncestor)) {
    return null;
  }
  return formatDistinguishedName([...prefix, ...newAncestor]);
}

function hasSuffix(
  candidate: readonly DistinguishedNameRelative[],
  suffix: readonly DistinguishedNameRelative[],
): boolean {
  const offset = candidate.length - suffix.length;
  if (offset < 0) {
    return false;
  }
  return suffix.every(
    (relative, index) =>
      createRelativeDistinguishedNameComparisonKey(relative) ===
      createRelativeDistinguishedNameComparisonKey(candidate[offset + index]),
  );
}

/** `OU=<name>` for a value that may not be a valid DN on its own. */
export function formatDistinguishedNameAttribute(
  type: string,
  value: string,
): string {
  return `${type.toUpperCase()}=${escapeDistinguishedNameValue(value)}`;
}

function formatAttribute(attribute: DistinguishedNameAttribute): string {
  const type = attribute.type.toUpperCase();
  if (attribute.encoding === 'hex') {
    return `${type}=#${attribute.value.toLowerCase()}`;
  }
  return `${type}=${escapeDistinguishedNameValue(attribute.value)}`;
}

function readAttribute(text: string, start: number): ParsedAttribute {
  let cursor = start;
  while (
    cursor < text.length &&
    text[cursor] !== '=' &&
    text[cursor] !== ',' &&
    text[cursor] !== '+'
  ) {
    cursor += 1;
  }
  if (cursor >= text.length || text[cursor] !== '=') {
    throw new DistinguishedNameSyntaxError('MISSING_SEPARATOR');
  }
  const type = text.slice(start, cursor).trim();
  if (!descriptorPattern.test(type) && !numericOidPattern.test(type)) {
    throw new DistinguishedNameSyntaxError('INVALID_ATTRIBUTE_TYPE');
  }
  cursor = skipSpaces(text, cursor + 1);
  const value = readAttributeValue(text, cursor);
  return {
    attribute: {
      type: type.toUpperCase(),
      value: value.value,
      encoding: value.encoding,
    },
    nextIndex: value.nextIndex,
  };
}

function readAttributeValue(text: string, start: number): ParsedValue {
  if (text[start] === '"') {
    return readQuotedValue(text, start);
  }
  if (text[start] === '#') {
    return readHexValue(text, start);
  }
  return readStringValue(text, start);
}

function readStringValue(text: string, start: number): ParsedValue {
  const tokens: StringToken[] = [];
  const pendingBytes: number[] = [];
  const flushBytes = (): void => {
    if (pendingBytes.length === 0) {
      return;
    }
    tokens.push({
      text: Buffer.from(pendingBytes).toString('utf8'),
      escaped: true,
    });
    pendingBytes.length = 0;
  };
  let cursor = start;
  while (cursor < text.length) {
    const character = text[cursor];
    if (character === ',' || character === '+') {
      break;
    }
    if (character === '"') {
      throw new DistinguishedNameSyntaxError('UNESCAPED_QUOTE');
    }
    if (character === '\\') {
      if (cursor + 1 >= text.length) {
        throw new DistinguishedNameSyntaxError('INVALID_ESCAPE');
      }
      const pair = text.slice(cursor + 1, cursor + 3);
      if (hexPair.test(pair)) {
        pendingBytes.push(Number.parseInt(pair, 16));
        cursor += 3;
        continue;
      }
      const escaped = text[cursor + 1];
      if (!escapedCharacters.has(escaped)) {
        throw new DistinguishedNameSyntaxError('INVALID_ESCAPE');
      }
      flushBytes();
      tokens.push({ text: escaped, escaped: true });
      cursor += 2;
      continue;
    }
    flushBytes();
    tokens.push({ text: character, escaped: false });
    cursor += 1;
  }
  flushBytes();
  while (
    tokens.length > 0 &&
    !tokens[tokens.length - 1].escaped &&
    tokens[tokens.length - 1].text === ' '
  ) {
    tokens.pop();
  }
  const value = tokens.map((token) => token.text).join('');
  return { value, encoding: 'string', nextIndex: cursor };
}

function readQuotedValue(text: string, start: number): ParsedValue {
  let cursor = start + 1;
  let value = '';
  for (;;) {
    if (cursor >= text.length) {
      throw new DistinguishedNameSyntaxError('UNTERMINATED_QUOTE');
    }
    const character = text[cursor];
    if (character === '"') {
      cursor += 1;
      break;
    }
    if (character === '\\') {
      if (cursor + 1 >= text.length) {
        throw new DistinguishedNameSyntaxError('INVALID_ESCAPE');
      }
      value += text[cursor + 1];
      cursor += 2;
      continue;
    }
    value += character;
    cursor += 1;
  }
  cursor = skipSpaces(text, cursor);
  if (cursor < text.length && text[cursor] !== ',' && text[cursor] !== '+') {
    throw new DistinguishedNameSyntaxError('MISSING_SEPARATOR');
  }
  return { value, encoding: 'string', nextIndex: cursor };
}

function readHexValue(text: string, start: number): ParsedValue {
  let cursor = start + 1;
  const hexStart = cursor;
  while (cursor < text.length && text[cursor] !== ',' && text[cursor] !== '+') {
    cursor += 1;
  }
  const payload = text.slice(hexStart, cursor).trim();
  if (
    payload.length === 0 ||
    payload.length % 2 !== 0 ||
    !/^[0-9A-Fa-f]+$/.test(payload)
  ) {
    throw new DistinguishedNameSyntaxError('INVALID_HEX_VALUE');
  }
  return { value: payload.toLowerCase(), encoding: 'hex', nextIndex: cursor };
}

function skipSpaces(text: string, start: number): number {
  let cursor = start;
  while (cursor < text.length && text[cursor] === ' ') {
    cursor += 1;
  }
  return cursor;
}
