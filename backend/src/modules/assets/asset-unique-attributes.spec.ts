import { assetUniqueAttributeValueConstraint, isUniqueAssetAttributeValueConflict } from './asset-unique-attributes';

describe('asset unique-attribute database conflict classifier (W7.5)', () => {
  it('recognises Prisma P2002 by the named PostgreSQL canonical-value index', () => {
    expect(
      isUniqueAssetAttributeValueConflict({ code: 'P2002', meta: { target: assetUniqueAttributeValueConstraint } }),
    ).toBe(true);
  });

  it('recognises Prisma P2002 field targets for the canonical constraint', () => {
    expect(isUniqueAssetAttributeValueConflict({ code: 'P2002', meta: { target: ['attributeId', 'canonicalValue'] } })).toBe(true);
  });

  it('recognises a native PostgreSQL 23505 constraint name', () => {
    expect(isUniqueAssetAttributeValueConflict({ code: '23505', constraint: assetUniqueAttributeValueConstraint })).toBe(true);
  });

  it('does not misclassify asset-tag or unrelated uniqueness failures', () => {
    expect(isUniqueAssetAttributeValueConflict({ code: 'P2002', meta: { target: ['assetTag'] } })).toBe(false);
    expect(isUniqueAssetAttributeValueConflict({ code: 'P2002', meta: { target: ['typeId', 'key'] } })).toBe(false);
    expect(isUniqueAssetAttributeValueConflict({ code: 'P2003', meta: { target: assetUniqueAttributeValueConstraint } })).toBe(false);
  });
});
