import { apiRequest } from "@/services/api";

/**
 * Paket 3.2 (§14): `/assets/*`. Types mirror `backend/src/modules/assets`.
 * The server is authoritative for the module switch, permissions and the
 * unit scope; these calls only decide what the UI renders.
 */

export const assetStatuses = ["ORDERED", "IN_STOCK", "IN_USE", "IN_REPAIR", "LOST", "RETIRED", "DISPOSED"] as const;
export type AssetStatus = (typeof assetStatuses)[number];
export const assetCategories = ["HARDWARE", "SOFTWARE", "NETWORK", "INFRASTRUCTURE", "OTHER"] as const;
export type AssetCategory = (typeof assetCategories)[number];
export const assetAttributeDataTypes = ["TEXT", "NUMBER", "DATE", "BOOLEAN", "SELECT"] as const;
export type AssetAttributeDataType = (typeof assetAttributeDataTypes)[number];
export const assetRelationKinds = ["DEPENDS_ON", "INSTALLED_ON", "CONNECTED_TO", "RUNS_ON", "PART_OF"] as const;
export type AssetRelationKind = (typeof assetRelationKinds)[number];
export type AssetSource = "MANUAL" | "IMPORT" | "DIRECTORY";

export type AssetCapabilities = {
  readonly enabled: boolean;
  readonly canRead: boolean;
  readonly canManage: boolean;
  readonly canImport: boolean;
  readonly canManageLicenses: boolean;
  readonly canManageContracts: boolean;
  readonly canManageTypes: boolean;
  readonly canReadReports: boolean;
  readonly canDelete: boolean;
  readonly ticketPickerEnabled: boolean;
  readonly hasOwnAssets: boolean;
};

export type AssetTypeSummary = {
  readonly id: string;
  readonly key: string;
  readonly nameBs: string;
  readonly nameEn: string;
  readonly icon: string;
};

export type AssetAttribute = {
  readonly id: string;
  readonly key: string;
  readonly labelBs: string;
  readonly labelEn: string;
  readonly dataType: AssetAttributeDataType;
  readonly options: readonly string[];
  readonly isRequired: boolean;
  readonly isUnique: boolean;
  readonly sortOrder: number;
  readonly archivedAt: string | null;
};

export type AssetType = AssetTypeSummary & {
  readonly category: AssetCategory;
  readonly isUserSelectable: boolean;
  readonly sortOrder: number;
  readonly archivedAt: string | null;
  readonly assetCount: number;
  readonly attributes: readonly AssetAttribute[];
};

export type AssetLocation = {
  readonly id: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly code: string | null;
  readonly sortOrder: number;
  readonly archivedAt: string | null;
  readonly assetCount: number;
};

export type AssetCatalog = {
  readonly types: readonly AssetType[];
  readonly locations: readonly AssetLocation[];
  readonly iconNames: readonly string[];
};

export type AssetOptions = {
  readonly units: readonly { readonly id: string; readonly name: string; readonly path: string }[];
  readonly services: readonly { readonly id: string; readonly name: string }[];
};

export type AssetUserSummary = {
  readonly id: string;
  readonly displayName: string;
  readonly email: string;
  readonly isActive?: boolean;
};

export type AssetListItem = {
  readonly id: string;
  readonly assetTag: string;
  readonly name: string;
  readonly status: AssetStatus;
  readonly type: AssetTypeSummary;
  readonly serialNumber: string | null;
  readonly manufacturer: string | null;
  readonly model: string | null;
  readonly assignedUser: AssetUserSummary | null;
  readonly organizationalUnit: { readonly id: string; readonly name: string };
  readonly location: { readonly id: string; readonly label: string | null } | null;
  readonly warrantyEndsAt: string | null;
  readonly source: AssetSource;
  readonly missingFromDirectoryAt: string | null;
  readonly openTicketCount: number;
  readonly updatedAt: string;
};

export type AssetList = {
  readonly items: readonly AssetListItem[];
  readonly nextCursor: string | null;
  readonly total: number;
};

export type AssetListFilters = {
  readonly search?: string;
  readonly typeId?: string;
  readonly status?: readonly AssetStatus[];
  readonly organizationalUnitId?: string;
  readonly locationId?: string;
  readonly unassigned?: boolean;
  readonly warrantyWithinDays?: number;
  readonly source?: AssetSource;
  readonly cursor?: string;
  readonly limit?: number;
};

export type AssetRelationSummary = {
  readonly id: string;
  readonly assetTag: string;
  readonly name: string;
  readonly status: AssetStatus;
  readonly type: { readonly icon: string; readonly nameBs: string; readonly nameEn: string };
};

export type AssetRelation = {
  readonly id: string;
  readonly kind: AssetRelationKind;
  readonly direction: "out" | "in";
  readonly asset: AssetRelationSummary;
};

export type AssetTicketLink = {
  readonly id: string;
  readonly ticketNumber: number | string;
  readonly title: string;
  readonly status: string;
  readonly priority?: string;
  readonly createdAt: string;
  readonly linkedAt?: string;
  readonly isPrimary?: boolean;
};

export type AssetAttributeDefinition = {
  readonly key: string;
  readonly labelBs: string;
  readonly labelEn: string;
  readonly dataType: AssetAttributeDataType;
  readonly options: readonly string[];
  readonly isRequired: boolean;
  readonly archived: boolean;
};

export type AssetDetail = Omit<AssetListItem, "organizationalUnit"> & {
  readonly version: number;
  readonly organizationalUnit: { readonly id: string; readonly name: string; readonly path: string };
  readonly service: { readonly id: string; readonly name: string } | null;
  readonly assignedAt: string | null;
  readonly purchaseDate: string | null;
  readonly purchaseCost: number | null;
  readonly currency: string | null;
  readonly supplier: string | null;
  readonly notes: string | null;
  readonly externalId: string | null;
  readonly lastSeenAt: string | null;
  readonly assignmentSuggested: boolean;
  readonly retiredAt: string | null;
  readonly createdAt: string;
  readonly attributeDefinitions: readonly AssetAttributeDefinition[];
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly relations: readonly AssetRelation[];
  readonly tickets: { readonly total: number; readonly open: number; readonly recent: readonly AssetTicketLink[] };
  readonly frequentFailure: { readonly flagged: boolean; readonly count: number; readonly threshold: number; readonly days: number };
  readonly canManage: boolean;
};

export type AssetWriteInput = {
  readonly assetTag?: string | null;
  readonly typeId: string;
  readonly name: string;
  readonly status?: AssetStatus;
  readonly serialNumber?: string | null;
  readonly manufacturer?: string | null;
  readonly model?: string | null;
  readonly organizationalUnitId: string;
  readonly locationId?: string | null;
  readonly serviceId?: string | null;
  readonly purchaseDate?: string | null;
  readonly purchaseCost?: number | null;
  readonly supplier?: string | null;
  readonly warrantyEndsAt?: string | null;
  readonly notes?: string | null;
  readonly attributes?: Readonly<Record<string, unknown>>;
  readonly version?: number;
};

export type AssetHistoryItem = {
  readonly id: string;
  readonly action: string;
  readonly actorUserId: string | null;
  readonly detail: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
};

export type AssetHistory = {
  readonly items: readonly AssetHistoryItem[];
  readonly users: Readonly<Record<string, string | null>>;
  readonly nextCursor: string | null;
};

export type AssetImpactNode = {
  readonly assetId: string;
  readonly depth: number;
  readonly kind: AssetRelationKind;
  readonly asset: Omit<AssetRelationSummary, "id"> & { readonly id: string };
};

export type AssetImpact = {
  readonly dependents: { readonly items: readonly AssetImpactNode[]; readonly hidden: number };
  readonly dependencies: { readonly items: readonly AssetImpactNode[]; readonly hidden: number };
};

export type MyAsset = {
  readonly id: string;
  readonly assetTag: string;
  readonly name: string;
  readonly status: AssetStatus;
  readonly type: AssetTypeSummary;
  readonly manufacturer: string | null;
  readonly model: string | null;
  readonly location: { readonly id: string; readonly label: string | null } | null;
  readonly assignedAt: string | null;
  readonly warrantyEndsAt: string | null;
  readonly tickets: readonly AssetTicketLink[];
};

export type AssetTypeInput = {
  readonly key?: string;
  readonly nameBs: string;
  readonly nameEn: string;
  readonly icon: string;
  readonly category: AssetCategory;
  readonly isUserSelectable: boolean;
  readonly sortOrder: number;
};

export type AssetAttributeInput = {
  readonly key?: string;
  readonly labelBs: string;
  readonly labelEn: string;
  readonly dataType: AssetAttributeDataType;
  readonly options?: readonly string[];
  readonly isRequired: boolean;
  readonly isUnique: boolean;
  readonly sortOrder: number;
};

export type AssetLocationInput = {
  readonly parentId?: string | null;
  readonly name: string;
  readonly code?: string | null;
  readonly sortOrder: number;
};

export const assetQueryKeys = {
  all: ["assets"] as const,
  capabilities: ["assets", "capabilities"] as const,
  catalog: (includeArchived: boolean) => ["assets", "catalog", includeArchived] as const,
  options: ["assets", "options"] as const,
  list: (filters: AssetListFilters) => ["assets", "list", filters] as const,
  detail: (id: string) => ["assets", "detail", id] as const,
  history: (id: string) => ["assets", "history", id] as const,
  impact: (id: string) => ["assets", "impact", id] as const,
  mine: ["assets", "mine"] as const,
};

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });
const path = (id: string) => `/assets/${encodeURIComponent(id)}`;

export function buildAssetListQuery(filters: AssetListFilters): string {
  const params = new URLSearchParams();
  if (filters.search && filters.search.trim().length > 0) params.set("search", filters.search.trim());
  if (filters.typeId) params.set("typeId", filters.typeId);
  if (filters.status && filters.status.length > 0) params.set("status", filters.status.join(","));
  if (filters.organizationalUnitId) params.set("organizationalUnitId", filters.organizationalUnitId);
  if (filters.locationId) params.set("locationId", filters.locationId);
  if (filters.unassigned) params.set("unassigned", "true");
  if (filters.warrantyWithinDays !== undefined) params.set("warrantyWithinDays", String(filters.warrantyWithinDays));
  if (filters.source) params.set("source", filters.source);
  if (filters.cursor) params.set("cursor", filters.cursor);
  if (filters.limit !== undefined) params.set("limit", String(filters.limit));
  const query = params.toString();
  return query.length > 0 ? `?${query}` : "";
}

export function getAssetCapabilities(): Promise<AssetCapabilities> {
  return apiRequest<AssetCapabilities>("/assets/capabilities");
}

export function getAssetCatalog(includeArchived = false): Promise<AssetCatalog> {
  return apiRequest<AssetCatalog>(`/assets/catalog${includeArchived ? "?includeArchived=true" : ""}`);
}

export function getAssetOptions(): Promise<AssetOptions> {
  return apiRequest<AssetOptions>("/assets/options");
}

export function searchAssetUsers(search: string): Promise<{ readonly items: readonly AssetUserSummary[] }> {
  return apiRequest(`/assets/users?search=${encodeURIComponent(search)}`);
}

export function listAssets(filters: AssetListFilters): Promise<AssetList> {
  return apiRequest<AssetList>(`/assets${buildAssetListQuery(filters)}`);
}

export function lookupAssets(search: string, excludeId?: string): Promise<{ readonly items: readonly AssetListItem[] }> {
  const exclude = excludeId ? `&excludeId=${encodeURIComponent(excludeId)}` : "";
  return apiRequest(`/assets/lookup?search=${encodeURIComponent(search)}${exclude}`);
}

export function getMyAssets(): Promise<{ readonly items: readonly MyAsset[] }> {
  return apiRequest("/assets/mine");
}

export function getAsset(id: string): Promise<AssetDetail> {
  return apiRequest<AssetDetail>(path(id));
}

export function createAsset(input: AssetWriteInput): Promise<{ readonly id: string }> {
  return apiRequest("/assets", { method: "POST", ...json(input) });
}

export function updateAsset(id: string, input: AssetWriteInput): Promise<unknown> {
  return apiRequest(path(id), { method: "PUT", ...json(input) });
}

export function deleteAsset(id: string): Promise<void> {
  return apiRequest<void>(path(id), { method: "DELETE" });
}

export function changeAssetStatus(id: string, status: AssetStatus, reason?: string): Promise<unknown> {
  return apiRequest(`${path(id)}/status`, { method: "POST", ...json({ status, reason: reason || undefined }) });
}

export function assignAsset(id: string, userId: string, note?: string): Promise<unknown> {
  return apiRequest(`${path(id)}/assign`, { method: "POST", ...json({ userId, note: note || undefined }) });
}

export function unassignAsset(id: string, status: "IN_STOCK" | "IN_REPAIR", note?: string): Promise<unknown> {
  return apiRequest(`${path(id)}/unassign`, { method: "POST", ...json({ status, note: note || undefined }) });
}

export function getAssetHistory(id: string, cursor?: string): Promise<AssetHistory> {
  return apiRequest<AssetHistory>(`${path(id)}/history${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
}

export function getAssetImpact(id: string): Promise<AssetImpact> {
  return apiRequest<AssetImpact>(`${path(id)}/impact`);
}

export function addAssetRelation(id: string, toAssetId: string, kind: AssetRelationKind): Promise<{ readonly id: string }> {
  return apiRequest(`${path(id)}/relations`, { method: "POST", ...json({ toAssetId, kind }) });
}

export function removeAssetRelation(id: string, relationId: string): Promise<void> {
  return apiRequest<void>(`${path(id)}/relations/${encodeURIComponent(relationId)}`, { method: "DELETE" });
}

export function createAssetType(input: AssetTypeInput): Promise<unknown> {
  return apiRequest("/assets/catalog/types", { method: "POST", ...json(input) });
}

export function updateAssetType(id: string, input: AssetTypeInput): Promise<unknown> {
  return apiRequest(`/assets/catalog/types/${encodeURIComponent(id)}`, { method: "PUT", ...json(input) });
}

export function setAssetTypeArchived(id: string, archived: boolean): Promise<unknown> {
  return apiRequest(`/assets/catalog/types/${encodeURIComponent(id)}/archive`, { method: "POST", ...json({ archived }) });
}

export function createAssetAttribute(typeId: string, input: AssetAttributeInput): Promise<unknown> {
  return apiRequest(`/assets/catalog/types/${encodeURIComponent(typeId)}/attributes`, { method: "POST", ...json(input) });
}

export function updateAssetAttribute(id: string, input: AssetAttributeInput): Promise<unknown> {
  return apiRequest(`/assets/catalog/attributes/${encodeURIComponent(id)}`, { method: "PUT", ...json(input) });
}

export function setAssetAttributeArchived(id: string, archived: boolean): Promise<unknown> {
  return apiRequest(`/assets/catalog/attributes/${encodeURIComponent(id)}/archive`, { method: "POST", ...json({ archived }) });
}

export function createAssetLocation(input: AssetLocationInput): Promise<unknown> {
  return apiRequest("/assets/catalog/locations", { method: "POST", ...json(input) });
}

export function updateAssetLocation(id: string, input: AssetLocationInput): Promise<unknown> {
  return apiRequest(`/assets/catalog/locations/${encodeURIComponent(id)}`, { method: "PUT", ...json(input) });
}

export function setAssetLocationArchived(id: string, archived: boolean): Promise<unknown> {
  return apiRequest(`/assets/catalog/locations/${encodeURIComponent(id)}/archive`, { method: "POST", ...json({ archived }) });
}

/** Paket 3.2 (§8): the requester's own equipment for the create form. */
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

export function getTicketAssetPicker(): Promise<{ readonly enabled: boolean; readonly items: readonly TicketAssetPickerItem[] }> {
  return apiRequest("/assets/ticket-picker");
}

export function getTicketAssets(ticketId: string): Promise<TicketAssetsView> {
  return apiRequest(`/assets/tickets/${encodeURIComponent(ticketId)}`);
}

export function linkTicketAsset(ticketId: string, assetId: string, isPrimary = false): Promise<TicketAssetsView> {
  return apiRequest(`/assets/tickets/${encodeURIComponent(ticketId)}/links`, {
    method: "POST",
    ...json({ assetId, ...(isPrimary ? { isPrimary: true } : {}) }),
  });
}

export function unlinkTicketAsset(ticketId: string, assetId: string): Promise<TicketAssetsView> {
  return apiRequest(`/assets/tickets/${encodeURIComponent(ticketId)}/links/${encodeURIComponent(assetId)}`, { method: "DELETE" });
}

export function setPrimaryTicketAsset(ticketId: string, assetId: string): Promise<TicketAssetsView> {
  return apiRequest(`/assets/tickets/${encodeURIComponent(ticketId)}/links/${encodeURIComponent(assetId)}/primary`, { method: "POST" });
}
