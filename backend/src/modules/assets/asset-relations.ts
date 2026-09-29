import { assetLimits, directedAssetRelationKinds, type AssetRelationKindValue } from './assets.constants';

export type RelationEdge = { readonly fromAssetId: string; readonly toAssetId: string; readonly kind: AssetRelationKindValue };

/** Loads the outgoing (or incoming) directed edges of a set of assets. */
export type EdgeLoader = (assetIds: readonly string[], direction: 'out' | 'in') => Promise<readonly RelationEdge[]>;

export function isDirectedRelation(kind: AssetRelationKindValue): boolean {
  return directedAssetRelationKinds.includes(kind);
}

/**
 * §6: adding `from -> to` (directed) closes a cycle when `from` is reachable
 * from `to` along directed edges. Breadth-first, bounded depth.
 */
export async function wouldCreateRelationCycle(
  fromAssetId: string,
  toAssetId: string,
  loadEdges: EdgeLoader,
  maxDepth: number = assetLimits.relationDepthMax,
): Promise<boolean> {
  if (fromAssetId === toAssetId) return true;
  const seen = new Set<string>([toAssetId]);
  let frontier: string[] = [toAssetId];
  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth += 1) {
    const edges = await loadEdges(frontier, 'out');
    const next: string[] = [];
    for (const edge of edges) {
      if (!isDirectedRelation(edge.kind)) continue;
      if (edge.toAssetId === fromAssetId) return true;
      if (!seen.has(edge.toAssetId)) {
        seen.add(edge.toAssetId);
        next.push(edge.toAssetId);
      }
    }
    frontier = next;
  }
  return false;
}

export type ImpactNode = { readonly assetId: string; readonly depth: number; readonly viaAssetId: string; readonly kind: AssetRelationKindValue };

/**
 * §6 impact: `in` = what depends on the asset ("what fails if it fails"),
 * `out` = what the asset depends on. Each asset appears once, at the
 * shallowest depth.
 */
export async function collectRelationImpact(
  assetId: string,
  direction: 'out' | 'in',
  loadEdges: EdgeLoader,
  maxDepth: number = assetLimits.impactDepth,
  maxNodes = 200,
): Promise<ImpactNode[]> {
  const seen = new Set<string>([assetId]);
  const result: ImpactNode[] = [];
  let frontier: string[] = [assetId];
  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth += 1) {
    const edges = await loadEdges(frontier, direction);
    const next: string[] = [];
    for (const edge of edges) {
      if (!isDirectedRelation(edge.kind)) continue;
      const other = direction === 'out' ? edge.toAssetId : edge.fromAssetId;
      const via = direction === 'out' ? edge.fromAssetId : edge.toAssetId;
      if (seen.has(other)) continue;
      seen.add(other);
      result.push({ assetId: other, depth, viaAssetId: via, kind: edge.kind });
      next.push(other);
      if (result.length >= maxNodes) return result;
    }
    frontier = next;
  }
  return result;
}
