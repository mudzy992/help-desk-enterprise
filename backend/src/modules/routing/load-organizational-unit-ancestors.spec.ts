import { RoutingError } from './routing.error';
import {
  loadOrganizationalUnitAncestors,
  maximumRoutingAncestorDepth,
} from './load-organizational-unit-ancestors';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('loadOrganizationalUnitAncestors', () => {
  it('reads only the actual ancestor chain and never scans unrelated OU rows', async () => {
    const units = new Map([
      ['leaf', { id: 'leaf', parentId: 'child', ouPath: '/Root/Child/Leaf' }],
      ['child', { id: 'child', parentId: 'root', ouPath: '/Root/Child' }],
      ['root', { id: 'root', parentId: null, ouPath: '/Root' }],
    ]);
    const findUnique = jest.fn(async ({ where }: { where: { id: string } }) =>
      units.get(where.id) ?? null,
    );
    const findMany = jest.fn(() => {
      throw new Error('full OU scan must not be used');
    });
    const prisma = { organizationalUnit: { findUnique, findMany } } as never;

    await expect(loadOrganizationalUnitAncestors(prisma, 'leaf')).resolves.toEqual([
      units.get('leaf'),
      units.get('child'),
      units.get('root'),
    ]);
    expect(findUnique).toHaveBeenCalledTimes(3);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('keeps query count equal to chain depth regardless of unrelated OU cardinality', async () => {
    const chainDepth = 12;
    const units = new Map<string, { id: string; parentId: string | null; ouPath: string }>();
    for (let index = 0; index < chainDepth; index += 1) {
      const id = `chain-${index}`;
      units.set(id, {
        id,
        parentId: index + 1 < chainDepth ? `chain-${index + 1}` : null,
        ouPath: `/Chain/${index}`,
      });
    }
    // These 10,000 records model unrelated cardinality. findUnique never touches
    // them because traversal follows parentId only.
    for (let index = 0; index < 10_000; index += 1) {
      units.set(`unrelated-${index}`, {
        id: `unrelated-${index}`,
        parentId: null,
        ouPath: `/Unrelated/${index}`,
      });
    }
    const findUnique = jest.fn(async ({ where }: { where: { id: string } }) =>
      units.get(where.id) ?? null,
    );

    const result = await loadOrganizationalUnitAncestors(
      { organizationalUnit: { findUnique } } as never,
      'chain-0',
    );

    expect(result).toHaveLength(chainDepth);
    expect(findUnique).toHaveBeenCalledTimes(chainDepth);
  });

  it('rejects an unknown origin without scanning the table', async () => {
    const findUnique = jest.fn(async () => null);
    await expect(loadOrganizationalUnitAncestors(
      { organizationalUnit: { findUnique } } as never,
      'missing',
    )).rejects.toMatchObject({ code: 'ORIGIN_UNIT_NOT_FOUND' });
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the ancestor depth budget is exhausted', async () => {
    const findUnique = jest.fn(async ({ where }: { where: { id: string } }) => {
      const index = Number(where.id.slice('unit-'.length));
      return {
        id: where.id,
        parentId: `unit-${index + 1}`,
        ouPath: `/Deep/${index}`,
      };
    });

    await expect(loadOrganizationalUnitAncestors(
      { organizationalUnit: { findUnique } } as never,
      'unit-0',
    )).rejects.toEqual(
      new RoutingError('UNAVAILABLE', 'ROUTING_ANCESTOR_DEPTH_EXCEEDED'),
    );
    expect(findUnique).toHaveBeenCalledTimes(maximumRoutingAncestorDepth);
  });
});
