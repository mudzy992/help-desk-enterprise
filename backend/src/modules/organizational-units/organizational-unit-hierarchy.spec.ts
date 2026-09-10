import { assembleOrganizationalUnitTree } from './assemble-organizational-unit-tree';
import { buildOrganizationalUnitPath } from './build-organizational-unit-path';
import type { OrganizationalUnitRecord } from './organizational-unit.types';
import { rewriteDescendantDistinguishedName } from './rewrite-descendant-distinguished-name';
import { rewriteOrganizationalUnitPath } from './rewrite-organizational-unit-path';
import { wouldCreateCircularHierarchy } from './would-create-circular-hierarchy';

const createdAt = new Date('2026-09-10T10:00:00.000Z');

function createRecord(
  partial: Pick<OrganizationalUnitRecord, 'id' | 'name' | 'ouPath' | 'parentId'>,
): OrganizationalUnitRecord {
  return {
    type: 'DIRECTORATE',
    distinguishedName: `OU=${partial.name},DC=epbih,DC=ba`,
    company: null,
    department: null,
    createdAt,
    updatedAt: createdAt,
    ...partial,
  };
}

describe('organizational unit hierarchy helpers', () => {
  it('builds canonical application paths from parent path + name', () => {
    expect(buildOrganizationalUnitPath({ name: 'Korisnici', parentPath: null })).toBe(
      '/Korisnici',
    );
    expect(
      buildOrganizationalUnitPath({ name: 'Direkcija', parentPath: '/Korisnici' }),
    ).toBe('/Korisnici/Direkcija');
  });

  it('assembles an explicit nested tree from a flat list', () => {
    const tree = assembleOrganizationalUnitTree([
      createRecord({
        id: 'root',
        name: 'Korisnici',
        ouPath: '/Korisnici',
        parentId: null,
      }),
      createRecord({
        id: 'child',
        name: 'Direkcija',
        ouPath: '/Korisnici/Direkcija',
        parentId: 'root',
      }),
      createRecord({
        id: 'grandchild',
        name: 'IKT',
        ouPath: '/Korisnici/Direkcija/IKT',
        parentId: 'child',
      }),
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.id).toBe('root');
    expect(tree[0]?.children[0]?.id).toBe('child');
    expect(tree[0]?.children[0]?.children[0]?.id).toBe('grandchild');
  });

  it('prevents circular parent assignment', () => {
    expect(
      wouldCreateCircularHierarchy({
        organizationalUnitId: 'child',
        nextParentId: 'grandchild',
        parentIdById: new Map([
          ['root', null],
          ['child', 'root'],
          ['grandchild', 'child'],
        ]),
      }),
    ).toBe(true);
  });

  it('rewrites descendant distinguished names when an ancestor DN changes', () => {
    expect(
      rewriteDescendantDistinguishedName({
        currentDistinguishedName:
          'OU=Breza,OU=ED Zenica,OU=Korisnici,DC=epbih,DC=ba',
        oldAncestorDistinguishedName: 'OU=ED Zenica,OU=Korisnici,DC=epbih,DC=ba',
        newAncestorDistinguishedName:
          'OU=ED Zenica,OU=Direkcija,OU=Korisnici,DC=epbih,DC=ba',
      }),
    ).toBe('OU=Breza,OU=ED Zenica,OU=Direkcija,OU=Korisnici,DC=epbih,DC=ba');
  });

  it('rewrites descendant paths when an ancestor moves', () => {
    expect(
      rewriteOrganizationalUnitPath({
        currentPath: '/Korisnici/ED Zenica/Breza',
        oldAncestorPath: '/Korisnici/ED Zenica',
        newAncestorPath: '/Korisnici/ED Sarajevo',
      }),
    ).toBe('/Korisnici/ED Sarajevo/Breza');
  });
});
