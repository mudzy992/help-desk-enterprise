import { isDirectoryDistinguishedNameWithinBase } from './is-directory-distinguished-name-within-base';
import { isForestRootDistinguishedName } from './is-forest-root-distinguished-name';
import {
  buildManualDirectoryOrganizationalUnitDistinguishedName,
  defaultManualDirectoryCatalogRootDistinguishedName,
  rewriteManualDirectoryRootDistinguishedName,
} from './manual-directory-organizational-unit-path';
import { normalizeDirectoryDistinguishedName } from './normalize-directory-distinguished-name';
import { DirectorySyncError } from './directory-sync.error';

describe('W2.37 directory-sync distinguished-name contract', () => {
  it('normalizes a scope DN with escapes, unicode, quotes and multi-valued RDNs', () => {
    expect(normalizeDirectoryDistinguishedName('ou=Korisnici\\, Inc., dc=local')).toBe(
      'OU=Korisnici\\, Inc.,DC=local',
    );
    expect(normalizeDirectoryDistinguishedName('OU="Korisnici, Inc.",DC=local')).toBe(
      'OU=Korisnici\\, Inc.,DC=local',
    );
    expect(normalizeDirectoryDistinguishedName('OU=Podružnica Zenica,DC=local')).toBe(
      'OU=Podružnica Zenica,DC=local',
    );
    expect(normalizeDirectoryDistinguishedName('CN=A+OU=B,DC=local')).toBe(
      'CN=A+OU=B,DC=local',
    );
  });

  it('still refuses what the read scope cannot express', () => {
    expect(() => normalizeDirectoryDistinguishedName('OU=A/B,DC=local')).toThrow(
      DirectorySyncError,
    );
    expect(() => normalizeDirectoryDistinguishedName('OU=,DC=local')).toThrow(
      DirectorySyncError,
    );
    expect(() => normalizeDirectoryDistinguishedName('OU=Korisnici,DC=local,XX=A')).toThrow(
      DirectorySyncError,
    );
    expect(() => normalizeDirectoryDistinguishedName('Korisnici')).toThrow(
      DirectorySyncError,
    );
  });

  it('decides "within base" on RDN boundaries and folds case', () => {
    expect(
      isDirectoryDistinguishedNameWithinBase({
        distinguishedName: 'OU=Visoko,OU=Korisnici\\, Inc.,DC=local',
        baseDistinguishedName: 'ou=korisnici\\, inc.,dc=LOCAL',
      }),
    ).toBe(true);
    expect(
      isDirectoryDistinguishedNameWithinBase({
        distinguishedName: 'OU=Korisnici,DC=local',
        baseDistinguishedName: 'OU=Korisnici,DC=local',
      }),
    ).toBe(true);
    expect(
      isDirectoryDistinguishedNameWithinBase({
        distinguishedName: 'OU=Korisnici,DC=localnext',
        baseDistinguishedName: 'OU=Korisnici,DC=local',
      }),
    ).toBe(false);
    expect(
      isDirectoryDistinguishedNameWithinBase({
        distinguishedName: 'not a dn',
        baseDistinguishedName: 'OU=Korisnici,DC=local',
      }),
    ).toBe(false);
  });

  it('classifies the forest root per RDN', () => {
    expect(isForestRootDistinguishedName('DC=example,DC=com')).toBe(true);
    expect(isForestRootDistinguishedName('dc=LOCAL, dc=BA')).toBe(true);
    expect(isForestRootDistinguishedName('OU=Korisnici,DC=local')).toBe(false);
    expect(isForestRootDistinguishedName('CN=A+DC=local')).toBe(false);
    expect(isForestRootDistinguishedName('DC=local,OU=A')).toBe(false);
    expect(isForestRootDistinguishedName('DC=,DC=local')).toBe(false);
  });

  it('builds catalogue DNs with escaped names and an RDN-aware root rewrite', () => {
    expect(
      buildManualDirectoryOrganizationalUnitDistinguishedName(
        'OU=Korisnici,DC=local',
        'Prodaja',
        defaultManualDirectoryCatalogRootDistinguishedName,
      ),
    ).toBe('OU=Prodaja,OU=Korisnici,DC=local');
    expect(
      buildManualDirectoryOrganizationalUnitDistinguishedName(
        'OU=Korisnici\\, Inc.,DC=local',
        'Prodaja, jug',
        defaultManualDirectoryCatalogRootDistinguishedName,
      ),
    ).toBe('OU=Prodaja\\, jug,OU=Korisnici\\, Inc.,DC=local');
    expect(
      rewriteManualDirectoryRootDistinguishedName(
        'OU=Korisnici\\, Inc.,DC=local',
        'Kadrovi',
      ),
    ).toBe('OU=Kadrovi,DC=local');
    expect(
      buildManualDirectoryOrganizationalUnitDistinguishedName(
        null,
        'Kadrovi',
        defaultManualDirectoryCatalogRootDistinguishedName,
      ),
    ).toBe('OU=Kadrovi,DC=example,DC=com');
  });
});
