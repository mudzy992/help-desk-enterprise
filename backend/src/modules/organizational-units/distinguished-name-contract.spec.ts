import { isDescendantDistinguishedName } from './is-descendant-distinguished-name';
import { normalizeDistinguishedName } from './normalize-distinguished-name';
import { rewriteDescendantDistinguishedName } from './rewrite-descendant-distinguished-name';
import { organizationalUnitConstants } from './organizational-unit.constants';
import { OrganizationalUnitError } from './organizational-unit.error';

describe('W2.37 RFC 4514 distinguished-name contract', () => {
  describe('normalizeDistinguishedName', () => {
    it('keeps escaped separators instead of splitting the name', () => {
      expect(normalizeDistinguishedName('OU=Korisnici\\, Inc.,DC=local')).toBe(
        'OU=Korisnici\\, Inc.,DC=local',
      );
      expect(normalizeDistinguishedName('ou="Korisnici, Inc.", dc=local')).toBe(
        'OU=Korisnici\\, Inc.,DC=local',
      );
    });

    it('accepts escaped plus, backslash and hexadecimal UTF-8 bytes', () => {
      expect(normalizeDistinguishedName('cn=A\\+B\\\\C,OU=Korisnici,DC=local')).toBe(
        'CN=A\\+B\\\\C,OU=Korisnici,DC=local',
      );
      expect(normalizeDistinguishedName('OU=Podru\\C4\\8Dnica,DC=local')).toBe(
        'OU=Područnica,DC=local',
      );
    });

    it('accepts multi-valued RDNs and keeps them multi-valued', () => {
      expect(normalizeDistinguishedName('CN=A+OU=B,DC=local')).toBe(
        'CN=A+OU=B,DC=local',
      );
    });

    it('refuses values that cannot also be an ouPath segment or a known type', () => {
      expect(() => normalizeDistinguishedName('OU=A/B,DC=local')).toThrow(
        OrganizationalUnitError,
      );
      expect(() => normalizeDistinguishedName('OU=,DC=local')).toThrow(
        OrganizationalUnitError,
      );
      expect(() => normalizeDistinguishedName('OU=Korisnici,DC=local,UU=A')).toThrow(
        OrganizationalUnitError,
      );
    });

    it('measures the limit after escaping as well', () => {
      const name = 'a'.repeat(
        organizationalUnitConstants.maximumDistinguishedNameLength,
      );
      expect(() => normalizeDistinguishedName(`OU=${name},DC=local`)).toThrow(
        OrganizationalUnitError,
      );
      const escapingGrowth = 'a'.repeat(
        organizationalUnitConstants.maximumDistinguishedNameLength - 20,
      );
      expect(() => normalizeDistinguishedName(`OU=${escapingGrowth},,DC=local`)).toThrow(
        OrganizationalUnitError,
      );
    });
  });

  describe('isDescendantDistinguishedName', () => {
    it('matches through a parent whose own value contains an escaped comma', () => {
      expect(
        isDescendantDistinguishedName({
          childDistinguishedName: 'OU=Visoko,OU=Korisnici\\, Inc.,DC=local',
          parentDistinguishedName: 'OU=Korisnici\\, Inc.,DC=local',
        }),
      ).toBe(true);
      expect(
        isDescendantDistinguishedName({
          childDistinguishedName: 'OU=Visoko,OU=Korisnici,DC=local',
          parentDistinguishedName: 'OU=Korisnici\\, Inc.,DC=local',
        }),
      ).toBe(false);
    });

    it('compares case-insensitively and ignores insignificant spaces', () => {
      expect(
        isDescendantDistinguishedName({
          childDistinguishedName: 'OU=Visoko,OU=Korisnici,DC=local',
          parentDistinguishedName: 'ou=korisnici, dc=LOCAL',
        }),
      ).toBe(true);
    });

    it('is false for the name itself and for malformed input', () => {
      expect(
        isDescendantDistinguishedName({
          childDistinguishedName: 'OU=Korisnici,DC=local',
          parentDistinguishedName: 'OU=Korisnici,DC=local',
        }),
      ).toBe(false);
      expect(
        isDescendantDistinguishedName({
          childDistinguishedName: 'OU=Korisnici,DC=local',
          parentDistinguishedName: 'not a dn',
        }),
      ).toBe(false);
    });
  });

  describe('rewriteDescendantDistinguishedName', () => {
    it('rewrites on RDN boundaries, not on the first comma', () => {
      expect(
        rewriteDescendantDistinguishedName({
          currentDistinguishedName: 'OU=Visoko,OU=Korisnici\\, Inc.,DC=local',
          oldAncestorDistinguishedName: 'OU=Korisnici\\, Inc.,DC=local',
          newAncestorDistinguishedName: 'OU=Korisnici\\, Inc.,DC=example,DC=local',
        }),
      ).toBe('OU=Visoko,OU=Korisnici\\, Inc.,DC=example,DC=local');
    });

    it('rewrites the ancestor itself', () => {
      expect(
        rewriteDescendantDistinguishedName({
          currentDistinguishedName: 'OU=Korisnici,DC=local',
          oldAncestorDistinguishedName: 'OU=Korisnici,DC=local',
          newAncestorDistinguishedName: 'OU=Kadrovi,DC=local',
        }),
      ).toBe('OU=Kadrovi,DC=local');
    });

    it('leaves an unrelated name untouched', () => {
      expect(
        rewriteDescendantDistinguishedName({
          currentDistinguishedName: 'OU=Grupe,DC=local',
          oldAncestorDistinguishedName: 'OU=Korisnici,DC=local',
          newAncestorDistinguishedName: 'OU=Kadrovi,DC=local',
        }),
      ).toBe('OU=Grupe,DC=local');
    });

    it('refuses a rewrite that crosses the documented length limit', () => {
      const longName = 'a'.repeat(
        organizationalUnitConstants.maximumDistinguishedNameLength - 40,
      );
      expect(() =>
        rewriteDescendantDistinguishedName({
          currentDistinguishedName: `OU=Visoko,OU=${longName},DC=local`,
          oldAncestorDistinguishedName: `OU=${longName},DC=local`,
          newAncestorDistinguishedName: `OU=${longName}${'b'.repeat(30)},DC=local`,
        }),
      ).toThrow(OrganizationalUnitError);
    });
  });
});
