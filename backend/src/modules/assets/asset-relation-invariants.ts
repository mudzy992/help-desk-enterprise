/** Database conflict names installed by migration 20271027230000. */
export const assetRelationCanonicalConnectedToIndex = 'AssetRelation_connected_to_canonical_key';
export const assetRelationDirectedAcyclicConstraint = 'AssetRelation_directed_acyclic';
export const assetRelationDirectionalUniqueIndex = 'AssetRelation_fromAssetId_toAssetId_kind_key';

type ErrorShape = {
  readonly code?: unknown;
  readonly constraint?: unknown;
  readonly message?: unknown;
  readonly meta?: unknown;
};

function errorDetails(error: ErrorShape): string {
  const meta =
    typeof error.meta === 'object' && error.meta !== null
      ? (error.meta as Record<string, unknown>)
      : null;
  const target = meta?.target;
  const targetText = Array.isArray(target) ? target.map(String).join('.') : String(target ?? '');
  const metaText = meta === null ? '' : JSON.stringify(meta);
  return [targetText, error.constraint, error.message, metaText]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
}

function asErrorShape(error: unknown): ErrorShape | null {
  return typeof error === 'object' && error !== null ? (error as ErrorShape) : null;
}

/** Recognize only AssetRelation endpoint/kind unique conflicts, not arbitrary P2002 errors. */
export function isAssetRelationExistsConflict(error: unknown): boolean {
  const shape = asErrorShape(error);
  if (shape === null || (shape.code !== 'P2002' && shape.code !== '23505')) return false;
  const details = errorDetails(shape);
  return (
    details.includes(assetRelationCanonicalConnectedToIndex.toLowerCase()) ||
    details.includes(assetRelationDirectionalUniqueIndex.toLowerCase()) ||
    (details.includes('fromassetid') && details.includes('toassetid') && details.includes('kind'))
  );
}

/** Recognize the named PostgreSQL graph CHECK-style error used by the trigger. */
export function isAssetRelationCycleConflict(error: unknown): boolean {
  const shape = asErrorShape(error);
  if (shape === null || !['P2004', 'P2010', '23514'].includes(String(shape.code))) return false;
  return errorDetails(shape).includes(assetRelationDirectedAcyclicConstraint.toLowerCase());
}
