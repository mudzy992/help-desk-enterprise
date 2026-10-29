import {
  assetRelationCanonicalConnectedToIndex,
  assetRelationDirectedAcyclicConstraint,
  assetRelationDirectionalUniqueIndex,
  isAssetRelationCycleConflict,
  isAssetRelationExistsConflict,
} from './asset-relation-invariants';

describe('asset relation database conflict mapping (W7.6)', () => {
  it('recognizes Prisma P2002 for the canonical symmetric-edge index', () => {
    expect(
      isAssetRelationExistsConflict({
        code: 'P2002',
        meta: { target: assetRelationCanonicalConnectedToIndex },
      }),
    ).toBe(true);
  });

  it('recognizes the existing directional unique index and its field target', () => {
    expect(
      isAssetRelationExistsConflict({
        code: '23505',
        constraint: assetRelationDirectionalUniqueIndex,
      }),
    ).toBe(true);
    expect(
      isAssetRelationExistsConflict({
        code: 'P2002',
        meta: { target: ['fromAssetId', 'toAssetId', 'kind'] },
      }),
    ).toBe(true);
  });

  it('recognizes the named Prisma/PostgreSQL directed-cycle violation', () => {
    expect(
      isAssetRelationCycleConflict({
        code: 'P2004',
        meta: {
          database_error: `check constraint violation: ${assetRelationDirectedAcyclicConstraint}`,
        },
      }),
    ).toBe(true);
    expect(
      isAssetRelationCycleConflict({
        code: '23514',
        constraint: assetRelationDirectedAcyclicConstraint,
      }),
    ).toBe(true);
    expect(
      isAssetRelationCycleConflict({
        code: 'P2004',
        meta: {
          code: '23514',
          message: `${assetRelationDirectedAcyclicConstraint}: directed asset relations must remain acyclic`,
        },
      }),
    ).toBe(true);
    expect(
      isAssetRelationCycleConflict({
        code: 'P2039',
        meta: {
          code: '23514',
          message: `${assetRelationDirectedAcyclicConstraint}: directed asset relations must remain acyclic`,
        },
      }),
    ).toBe(true);
  });

  it('does not misclassify unrelated uniqueness or check failures', () => {
    expect(isAssetRelationExistsConflict({ code: 'P2002', meta: { target: ['assetTag'] } })).toBe(
      false,
    );
    expect(
      isAssetRelationExistsConflict({
        code: 'P2003',
        meta: { target: assetRelationDirectionalUniqueIndex },
      }),
    ).toBe(false);
    expect(
      isAssetRelationCycleConflict({
        code: 'P2004',
        meta: { database_error: 'self relation is forbidden' },
      }),
    ).toBe(false);
    expect(
      isAssetRelationCycleConflict({
        code: 'P2002',
        constraint: assetRelationDirectedAcyclicConstraint,
      }),
    ).toBe(false);
  });
});
