import { jsonBody } from "./http";
import type { AssetStatus } from "./types";
import { apiRequest } from "@/services/api";

export type TicketAssetPickerItem = {
  readonly id: string;
  readonly assetTag: string;
  readonly name: string;
  readonly typeName: string;
  readonly typeNameEn: string;
  readonly typeIcon: string;
};

export type TicketAssetItem = {
  readonly assetId: string;
  readonly assetTag: string;
  readonly name: string;
  readonly typeName: string;
  readonly typeNameEn: string;
  readonly typeIcon: string;
  /** Empty for the requester (internal lifecycle status). */
  readonly status: AssetStatus | "";
  readonly isPrimary: boolean;
  readonly linkedAt: string;
  readonly canOpen: boolean;
};

export type TicketAssetsView = {
  readonly enabled: boolean;
  readonly canEdit: boolean;
  readonly items: readonly TicketAssetItem[];
};

export const ticketAssetQueryKeys = {
  picker: ["assets", "ticket-picker"] as const,
  ticket: (ticketId: string) => ["assets", "ticket", ticketId] as const,
};

export function getTicketAssetPicker(): Promise<{
  readonly enabled: boolean;
  readonly items: readonly TicketAssetPickerItem[];
}> {
  return apiRequest("/assets/ticket-picker");
}

export function getTicketAssets(ticketId: string): Promise<TicketAssetsView> {
  return apiRequest(`/assets/tickets/${encodeURIComponent(ticketId)}`);
}

export function linkTicketAsset(
  ticketId: string,
  assetId: string,
  isPrimary = false,
): Promise<TicketAssetsView> {
  return apiRequest(`/assets/tickets/${encodeURIComponent(ticketId)}/links`, {
    method: "POST",
    ...jsonBody({ assetId, ...(isPrimary ? { isPrimary: true } : {}) }),
  });
}

export function unlinkTicketAsset(ticketId: string, assetId: string): Promise<TicketAssetsView> {
  return apiRequest(
    `/assets/tickets/${encodeURIComponent(ticketId)}/links/${encodeURIComponent(assetId)}`,
    { method: "DELETE" },
  );
}

export function setPrimaryTicketAsset(
  ticketId: string,
  assetId: string,
): Promise<TicketAssetsView> {
  return apiRequest(
    `/assets/tickets/${encodeURIComponent(ticketId)}/links/${encodeURIComponent(assetId)}/primary`,
    { method: "POST" },
  );
}

// ------------------------------------------------------------ licences and contracts (requirement, requirement)
