import {
  assembleOrganizationalUnitSummaryTree,
  getOrganizationalUnitSelectionTree,
  organizationalUnitTreeSelectionSelect,
} from './get-organizational-unit-selection-tree';

/*
  W2.36 (`BA-organizational-units-06`). The selection tree is assembled from a
  four-column projection; these tests keep that projection honest and pin the
  sibling order the selectors rely on.
*/
describe('getOrganizationalUnitSelectionTree', () => {
  const rows = [
    { id: 'root', name: 'Korisnici', type: 'DIRECTORATE' as const, parentId: null },
    { id: 'a', name: 'Breza', type: 'SECTOR' as const, parentId: 'root' },
    { id: 'b', name: 'Visoko', type: 'SECTOR' as const, parentId: 'root' },
    { id: 'a1', name: 'Zenica', type: 'SERVICE' as const, parentId: 'a' },
  ];

  it('asks Prisma for exactly the four selector columns and keeps the sibling order', async () => {
    const findMany = jest.fn().mockResolvedValue(rows);
    const tree = await getOrganizationalUnitSelectionTree({
      organizationalUnit: { findMany },
    } as never);

    expect(findMany).toHaveBeenCalledWith({
      orderBy: [{ ouPath: 'asc' }, { name: 'asc' }],
      select: organizationalUnitTreeSelectionSelect,
    });
    expect(tree.map((node) => node.id)).toEqual(['root']);
    expect(tree[0]?.children.map((node) => node.id)).toEqual(['a', 'b']);
    expect(tree[0]?.children[0]?.children.map((node) => node.id)).toEqual(['a1']);
  });

  it('never carries a column that is not in the selector contract', () => {
    const tree = assembleOrganizationalUnitSummaryTree(rows);
    const keys: string[] = [];
    const walk = (nodes: readonly Record<string, unknown>[]): void => {
      for (const node of nodes) {
        keys.push(...Object.keys(node));
        walk((node.children ?? []) as readonly Record<string, unknown>[]);
      }
    };
    walk(tree as unknown as readonly Record<string, unknown>[]);
    expect(new Set(keys)).toEqual(new Set(['id', 'name', 'type', 'children']));
  });

  it('drops a row whose parent is not in the response instead of inventing a root', () => {
    const tree = assembleOrganizationalUnitSummaryTree([
      { id: 'orphan', name: 'Sirac', type: 'OFFICE', parentId: 'missing' },
      { id: 'root', name: 'Korisnici', type: 'DIRECTORATE', parentId: null },
    ]);
    expect(tree.map((node) => node.id)).toEqual(['root']);
  });
});
