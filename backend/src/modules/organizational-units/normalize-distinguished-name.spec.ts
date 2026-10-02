import { normalizeDistinguishedName } from './normalize-distinguished-name';
import { OrganizationalUnitError } from './organizational-unit.error';
import { isDescendantDistinguishedName } from './is-descendant-distinguished-name';

describe('normalizeDistinguishedName', () => {
  it('canonicalizes LDAP DN attribute types and spacing', () => {
    expect(
      normalizeDistinguishedName(' ou=Korisnici , dc=example , dc=com '),
    ).toBe('OU=Korisnici,DC=example,DC=com');
  });

  it('rejects malformed distinguished names', () => {
    expect(() => normalizeDistinguishedName('Korisnici')).toThrow(OrganizationalUnitError);
    expect(() => normalizeDistinguishedName('OU=,DC=example,DC=com')).toThrow(
      OrganizationalUnitError,
    );
    expect(() => normalizeDistinguishedName('OU=A,,DC=ba')).toThrow(OrganizationalUnitError);
  });

  it('detects descendant distinguished names', () => {
    expect(
      isDescendantDistinguishedName({
        childDistinguishedName: 'OU=Direkcija,OU=Korisnici,DC=example,DC=com',
        parentDistinguishedName: 'OU=Korisnici,DC=example,DC=com',
      }),
    ).toBe(true);
    expect(
      isDescendantDistinguishedName({
        childDistinguishedName: 'OU=Korisnici,DC=example,DC=com',
        parentDistinguishedName: 'OU=Korisnici,DC=example,DC=com',
      }),
    ).toBe(false);
  });
});
