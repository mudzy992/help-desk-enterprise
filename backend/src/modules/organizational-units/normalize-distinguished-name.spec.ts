import { normalizeDistinguishedName } from './normalize-distinguished-name';
import { OrganizationalUnitError } from './organizational-unit.error';
import { isDescendantDistinguishedName } from './is-descendant-distinguished-name';

describe('normalizeDistinguishedName', () => {
  it('canonicalizes LDAP DN attribute types and spacing', () => {
    expect(
      normalizeDistinguishedName(' ou=Korisnici , dc=epbih , dc=ba '),
    ).toBe('OU=Korisnici,DC=epbih,DC=ba');
  });

  it('rejects malformed distinguished names', () => {
    expect(() => normalizeDistinguishedName('Korisnici')).toThrow(OrganizationalUnitError);
    expect(() => normalizeDistinguishedName('OU=,DC=epbih,DC=ba')).toThrow(
      OrganizationalUnitError,
    );
    expect(() => normalizeDistinguishedName('OU=A,,DC=ba')).toThrow(OrganizationalUnitError);
  });

  it('detects descendant distinguished names', () => {
    expect(
      isDescendantDistinguishedName({
        childDistinguishedName: 'OU=Direkcija,OU=Korisnici,DC=epbih,DC=ba',
        parentDistinguishedName: 'OU=Korisnici,DC=epbih,DC=ba',
      }),
    ).toBe(true);
    expect(
      isDescendantDistinguishedName({
        childDistinguishedName: 'OU=Korisnici,DC=epbih,DC=ba',
        parentDistinguishedName: 'OU=Korisnici,DC=epbih,DC=ba',
      }),
    ).toBe(false);
  });
});
