import type { AssetTransferScenario, AssetTransferStatus } from "@/services/asset-transfers-api";

/** Paket 3.2 C9: labels and tones for transfer records (const maps keep t() keys typed). */
export const transferScenarioKeys: Readonly<Record<AssetTransferScenario, `assets.transfers.scenario.${AssetTransferScenario}`>> = {
  WAREHOUSE_TO_USER: "assets.transfers.scenario.WAREHOUSE_TO_USER",
  USER_TO_USER: "assets.transfers.scenario.USER_TO_USER",
  USER_TO_WAREHOUSE: "assets.transfers.scenario.USER_TO_WAREHOUSE",
};

export const transferStatusKeys: Readonly<Record<AssetTransferStatus, `assets.transfers.status.${AssetTransferStatus}`>> = {
  ISSUED: "assets.transfers.status.ISSUED",
  SIGNED: "assets.transfers.status.SIGNED",
  CANCELLED: "assets.transfers.status.CANCELLED",
};

export function transferStatusTone(status: AssetTransferStatus): "info" | "success" | "neutral" {
  if (status === "SIGNED") return "success";
  if (status === "ISSUED") return "info";
  return "neutral";
}

const problemKeys = {
  not_in_stock: "assets.transfers.problems.not_in_stock",
  already_assigned: "assets.transfers.problems.already_assigned",
  not_assigned: "assets.transfers.problems.not_assigned",
  different_holders: "assets.transfers.problems.different_holders",
  same_user: "assets.transfers.problems.same_user",
  receiver_required: "assets.transfers.problems.receiver_required",
  return_status: "assets.transfers.problems.return_status",
} as const;

export type TransferProblemKey = (typeof problemKeys)[keyof typeof problemKeys];

/** "code" or "code:INV-1" from the preview → i18n key + asset tag. */
export function transferProblem(raw: string): { readonly key: TransferProblemKey; readonly assetTag: string } | null {
  const [code, assetTag = ""] = raw.split(":");
  const key = (problemKeys as Readonly<Record<string, TransferProblemKey>>)[code];
  return key ? { key, assetTag } : null;
}

/** Accepted signed copies (the server checks the file signature again). */
export const signedCopyAccept = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";
export const signedCopyMaxBytes = 10 * 1024 * 1024;
