import { filterOrganizationalUnitTree } from './filter-organizational-unit-tree';
import type { OrganizationalUnitRecord } from './organizational-unit.types';

/*
  W2.9 (`BA-organizational-units-01`): the tree a scoped ADMIN receives must not
  name the units it may not touch, and must still be renderable.
*/
const record = (
  id: string,
  ouPath: string,
  parentId: string | null,
): OrganizationalUnitRecord => ({
  id,
  ouPath,
  parentId,
  name: ouPath.split('/').filter(Boolean).pop() ?? ouPath,
  type: 'SERVICE',
  distinguishedName: `OU=${id}`,
  company: null,
  department: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

describe('filterOrganizationalUnitTree (W2.9)', () => {
  const root = record('root', '/root', null);
  const branchA = record('a', '/root/a', 'root');
  const childOfA = record('a-child', '/root/a/child', 'a');
  const branchB = record('b', '/root/b', 'root');
  const records = [root, branchA, childOfA, branchB];

  it('keeps only the units inside the scope', () => {
    const visible = filterOrganizationalUnitTree(
      records,
      (unit) => unit.ouPath === '/root/a' || unit.ouPath.startsWith('/root/a/'),
    );
    expect(visible.map((unit) => unit.id)).toEqual(['a', 'a-child']);
  });

  it('promotes a visible subtree to roots instead of leaking the hidden parent', () => {
    const visible = filterOrganizationalUnitTree(records, (unit) => unit.id !== 'root');
    expect(visible.find((unit) => unit.id === 'a')?.parentId).toBeNull();
    expect(visible.find((unit) => unit.id === 'b')?.parentId).toBeNull();
    expect(visible.find((unit) => unit.id === 'a-child')?.parentId).toBe('a');
  });

  it('returns everything when the caller is global', () => {
    expect(filterOrganizationalUnitTree(records, () => true)).toHaveLength(4);
  });

  it('returns nothing when nothing is covered', () => {
    expect(filterOrganizationalUnitTree(records, () => false)).toEqual([]);
  });

  it('does not mutate the input records', () => {
    const input = records.map((unit) => ({ ...unit }));
    filterOrganizationalUnitTree(input, (unit) => unit.id !== 'root');
    expect(input.find((unit) => unit.id === 'a')?.parentId).toBe('root');
  });
});
