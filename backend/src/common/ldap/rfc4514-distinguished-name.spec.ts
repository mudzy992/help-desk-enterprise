import {
  createCanonicalDistinguishedName,
  createDistinguishedNameComparisonKey,
  DistinguishedNameSyntaxError,
  escapeDistinguishedNameValue,
  formatDistinguishedName,
  formatDistinguishedNameAttribute,
  parseDistinguishedName,
} from './rfc4514-distinguished-name';

function expectSyntaxFailure(
  value: string,
  reason: string,
): void {
  try {
    parseDistinguishedName(value);
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(DistinguishedNameSyntaxError);
    expect((error as DistinguishedNameSyntaxError).reason).toBe(reason);
    return;
  }
  throw new Error(`Expected ${value} to fail with ${reason}`);
}

describe('rfc4514 distinguished name', () => {
  it('keeps escaped separators inside a value (BA-organizational-units-07 fixture)', () => {
    const parsed = parseDistinguishedName('OU=Korisnici\\, Inc.,DC=local');

    expect(parsed).toEqual([
      { attributes: [{ type: 'OU', value: 'Korisnici, Inc.', encoding: 'string' }] },
      { attributes: [{ type: 'DC', value: 'local', encoding: 'string' }] },
    ]);
    expect(createCanonicalDistinguishedName('OU=Korisnici\\, Inc.,DC=local')).toBe(
      'OU=Korisnici\\, Inc.,DC=local',
    );
  });

  it('reads escaped plus, backslash, equals and hexadecimal byte escapes', () => {
    const parsed = parseDistinguishedName(
      'CN=a\\+b\\\\c\\=d\\C4\\8D,OU=Korisnici,DC=local',
    );

    expect(parsed[0].attributes[0]).toEqual({
      type: 'CN',
      value: 'a+b\\c=dč',
      encoding: 'string',
    });
  });

  it('round-trips unicode values unchanged', () => {
    const input = 'OU=Podružnica Zenica,OU=Korisnici,DC=local';

    expect(createCanonicalDistinguishedName(input)).toBe(input);
    expect(parseDistinguishedName(input)[0].attributes[0].value).toBe(
      'Podružnica Zenica',
    );
  });

  it('canonicalises attribute types, spacing and multi-valued RDNs', () => {
    expect(
      createCanonicalDistinguishedName(' ou = Korisnici , dc = local '),
    ).toBe('OU=Korisnici,DC=local');
    expect(createCanonicalDistinguishedName('cn=A + ou=B, dc=local')).toBe(
      'CN=A+OU=B,DC=local',
    );
    expect(parseDistinguishedName('CN=A+OU=B,DC=local')[0].attributes).toHaveLength(2);
  });

  it('accepts quoted and hexadecimal BER values, keeping the BER payload verbatim', () => {
    expect(parseDistinguishedName('OU="Korisnici, Inc.",DC=local')[0].attributes[0]).toEqual({
      type: 'OU',
      value: 'Korisnici, Inc.',
      encoding: 'string',
    });
    expect(createCanonicalDistinguishedName('OU=#0C0B4B6F7269736E696369,DC=local')).toBe(
      'OU=#0c0b4b6f7269736e696369,DC=local',
    );
  });

  it('folds case only in the comparison key, never in the stored form', () => {
    const upper = createDistinguishedNameComparisonKey('OU=Korisnici,DC=local');
    const lower = createDistinguishedNameComparisonKey('ou=KORISNICI,dc=LOCAL');

    expect(upper).toBe(lower);
    expect(createCanonicalDistinguishedName('ou=Korisnici,dc=local')).toBe(
      'OU=Korisnici,DC=local',
    );
  });

  it('escapes values that would otherwise split or change the name', () => {
    expect(escapeDistinguishedNameValue('Korisnici, Inc.')).toBe('Korisnici\\, Inc.');
    expect(escapeDistinguishedNameValue(' leading')).toBe('\\ leading');
    expect(escapeDistinguishedNameValue('trailing ')).toBe('trailing\\ ');
    expect(escapeDistinguishedNameValue('#hash')).toBe('\\#hash');
    expect(escapeDistinguishedNameValue('a+b=c;d<e>f"g\\h')).toBe(
      'a\\+b\\=c\\;d\\<e\\>f\\"g\\\\h',
    );
    expect(formatDistinguishedNameAttribute('ou', 'Korisnici, Inc.')).toBe(
      'OU=Korisnici\\, Inc.',
    );
    expect(
      formatDistinguishedName([
        { attributes: [{ type: 'ou', value: 'Korisnici, Inc.', encoding: 'string' }] },
      ]),
    ).toBe('OU=Korisnici\\, Inc.');
  });

  it('rejects malformed names with a machine-readable reason', () => {
    expectSyntaxFailure('', 'EMPTY');
    expectSyntaxFailure('   ', 'EMPTY');
    expectSyntaxFailure('Korisnici', 'MISSING_SEPARATOR');
    expectSyntaxFailure('OU=A,,DC=local', 'MISSING_SEPARATOR');
    expectSyntaxFailure('OU=A\\', 'INVALID_ESCAPE');
    expectSyntaxFailure('OU=A\\q,DC=local', 'INVALID_ESCAPE');
    expectSyntaxFailure('OU="A,DC=local', 'UNTERMINATED_QUOTE');
    expectSyntaxFailure('OU=A"B,DC=local', 'UNESCAPED_QUOTE');
    expectSyntaxFailure('=A,DC=local', 'INVALID_ATTRIBUTE_TYPE');
    expectSyntaxFailure('1OU=A,DC=local', 'INVALID_ATTRIBUTE_TYPE');
    expectSyntaxFailure('OU=#0C0,DC=local', 'INVALID_HEX_VALUE');
    expectSyntaxFailure('OU=#0C0G,DC=local', 'INVALID_HEX_VALUE');
  });

  it('allows an empty value at parser level so callers can own that rule', () => {
    expect(parseDistinguishedName('OU=,DC=local')[0].attributes[0]).toEqual({
      type: 'OU',
      value: '',
      encoding: 'string',
    });
  });
});
