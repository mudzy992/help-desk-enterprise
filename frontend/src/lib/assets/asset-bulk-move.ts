import type { AssetStatus, AssetUserSummary } from "@/services/assets-api";

/** Mirrors backend `assetTransferLimits.itemsMax` (one transfer record). */
export const assetBulkMoveMax = 50;

export type BulkMoveItem = {
  readonly id: string;
  readonly status: AssetStatus;
  readonly assignedUser: AssetUserSummary | null;
};

export type BulkMovePlan =
  | { readonly kind: "none" }
  | { readonly kind: "too_many" }
  | { readonly kind: "mixed" }
  | { readonly kind: "warehouse"; readonly ids: readonly string[] }
  | { readonly kind: "holder"; readonly ids: readonly string[]; readonly holder: AssetUserSummary };

const stockStatuses = new Set<AssetStatus>(["ORDERED", "IN_STOCK", "IN_REPAIR"]);

/**
 * Paket 3.2 C9b: which move the register selection allows. One transfer
 * record covers equipment from the warehouse, or equipment of one holder;
 * anything else would be refused by the server (`different_holders`,
 * `already_assigned`, `not_in_stock`), so the UI says so up front.
 */
export function planBulkMove(items: readonly BulkMoveItem[]): BulkMovePlan {
  if (items.length === 0) return { kind: "none" };
  if (items.length > assetBulkMoveMax) return { kind: "too_many" };
  const ids = items.map((item) => item.id);
  if (items.every((item) => item.assignedUser === null && stockStatuses.has(item.status))) return { kind: "warehouse", ids };
  const holderIds = new Set(items.map((item) => item.assignedUser?.id ?? null));
  const first = items[0].assignedUser;
  if (holderIds.size === 1 && first !== null) return { kind: "holder", ids, holder: first };
  return { kind: "mixed" };
}
