/** PostgreSQL's normalized unique-value index is the final BA-assets-05 guard. */
export const assetUniqueAttributeValueConstraint = 'AssetUniqueAttributeValue_attributeId_canonicalValue_key';

/**
 * Prisma usually reports a unique-index violation as P2002 with either the
 * index name or its participating fields. The pg adapter can also surface the
 * native 23505 code and constraint name, so recognize both without confusing
 * assetTag or unrelated domain constraints with a custom-attribute conflict.
 */
export function isUniqueAssetAttributeValueConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const known = error as {
    readonly code?: unknown;
    readonly constraint?: unknown;
    readonly message?: unknown;
    readonly meta?: unknown;
  };
  if (known.code !== 'P2002' && known.code !== '23505') return false;

  const meta = typeof known.meta === 'object' && known.meta !== null ? (known.meta as { readonly target?: unknown }) : null;
  const target = meta?.target;
  const targetText = Array.isArray(target) ? target.map(String).join('.') : String(target ?? '');
  const details = [targetText, known.constraint, known.message]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();

  return (
    details.includes(assetUniqueAttributeValueConstraint.toLowerCase()) ||
    (details.includes('attributeid') && details.includes('canonicalvalue'))
  );
}
