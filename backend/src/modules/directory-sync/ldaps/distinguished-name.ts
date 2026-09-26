/**
 * Minimal DN handling for directory mapping. Splits on unescaped commas and
 * keeps escaped characters (`\,`) inside values. Attribute types are
 * upper-cased; values are kept as written in AD.
 */
export type DistinguishedNamePart = { readonly type: string; readonly value: string };

export function parseDistinguishedName(dn: string): DistinguishedNamePart[] {
  const parts: DistinguishedNamePart[] = [];
  let current = '';
  for (let index = 0; index < dn.length; index += 1) {
    const character = dn[index];
    if (character === '\\' && index + 1 < dn.length) {
      current += character + dn[index + 1];
      index += 1;
      continue;
    }
    if (character === ',') {
      parts.push(toPart(current));
      current = '';
      continue;
    }
    current += character;
  }
  if (current.trim().length > 0) {
    parts.push(toPart(current));
  }
  return parts;
}

function toPart(raw: string): DistinguishedNamePart {
  const separator = raw.indexOf('=');
  if (separator === -1) {
    return { type: '', value: raw.trim() };
  }
  return {
    type: raw.slice(0, separator).trim().toUpperCase(),
    value: unescapeValue(raw.slice(separator + 1).trim()),
  };
}

function unescapeValue(value: string): string {
  return value.replace(/\\([0-9a-fA-F]{2}|.)/g, (_match, escaped: string) =>
    escaped.length === 2 && /^[0-9a-fA-F]{2}$/.test(escaped)
      ? String.fromCharCode(Number.parseInt(escaped, 16))
      : escaped,
  );
}

/** Canonical comparison form: `OU=a,DC=b` with trimmed, case-folded parts. */
export function normalizeDistinguishedNameForComparison(dn: string): string {
  return parseDistinguishedName(dn)
    .map((part) => `${part.type}=${part.value.toLowerCase()}`)
    .join(',');
}

export function isDistinguishedNameWithin(dn: string, baseDn: string): boolean {
  const child = normalizeDistinguishedNameForComparison(dn);
  const base = normalizeDistinguishedNameForComparison(baseDn);
  return child === base || child.endsWith(`,${base}`);
}

/**
 * OU path used by the application (`/Korisnici/ED Zenica/Visoko`): OU values
 * from the top down. For a user DN the leading CN is skipped, so the path is
 * the user's container.
 */
export function organizationalUnitPathFromDistinguishedName(dn: string): string | null {
  const organizationalUnits = parseDistinguishedName(dn)
    .filter((part) => part.type === 'OU')
    .map((part) => part.value);
  if (organizationalUnits.length === 0) {
    return null;
  }
  return `/${organizationalUnits.reverse().join('/')}`;
}

/** DN of the container of an entry: everything after the first RDN. */
export function parentDistinguishedName(dn: string): string | null {
  const parts = parseDistinguishedName(dn);
  if (parts.length <= 1) {
    return null;
  }
  const first = dn.search(/(?<!\\),/);
  return first === -1 ? null : dn.slice(first + 1).trim();
}
