import type { AssetContractLink, AssetLicenseLink } from "./commercial-types";
import type { CursorPageMetadata } from "@/services/cursor-page";

export const assetStatuses = [
  "ORDERED",
  "IN_STOCK",
  "IN_USE",
  "IN_REPAIR",
  "LOST",
  "RETIRED",
  "DISPOSED",
] as const;
export type AssetStatus = (typeof assetStatuses)[number];
export const assetCategories = [
  "HARDWARE",
  "SOFTWARE",
  "NETWORK",
  "INFRASTRUCTURE",
  "OTHER",
] as const;
export type AssetCategory = (typeof assetCategories)[number];
export const assetAttributeDataTypes = ["TEXT", "NUMBER", "DATE", "BOOLEAN", "SELECT"] as const;
export type AssetAttributeDataType = (typeof assetAttributeDataTypes)[number];
export const assetRelationKinds = [
  "DEPENDS_ON",
  "INSTALLED_ON",
  "CONNECTED_TO",
  "RUNS_ON",
  "PART_OF",
] as const;
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
  /** C9c: `private.assets.locations.enabled`. */
  readonly locationsEnabled: boolean;
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
  /** C9b: handler group for tickets about this type. */
  readonly routingGroupId: string | null;
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
  /** C9b: handler groups (only for asset.type.manage). */
  readonly groups?: readonly { readonly id: string; readonly name: string }[];
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
  readonly organizationalUnit: {
    readonly id: string;
    readonly name: string;
    readonly path: string;
  };
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
  readonly organizationalUnit: {
    readonly id: string;
    readonly name: string;
    readonly path: string;
    readonly pathLabel: string;
  };
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
  readonly relationHiddenCount: number;
  readonly tickets: {
    readonly total: number;
    readonly open: number;
    readonly recent: readonly AssetTicketLink[];
  };
  readonly frequentFailure: {
    readonly flagged: boolean;
    readonly count: number;
    readonly threshold: number;
    readonly days: number;
  };
  readonly canManage: boolean;
  readonly licenses?: readonly AssetLicenseLink[];
  readonly licensesPage?: CursorPageMetadata;
  readonly contracts?: readonly AssetContractLink[];
  readonly contractsPage?: CursorPageMetadata;
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
};

export type AssetUpdateInput = AssetWriteInput & { readonly version: number };

export type AssetHistoryItem = {
  readonly id: string;
  readonly assetId: string;
  readonly assetTag: string;
  readonly retainedAfterAssetDelete: boolean;
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
  readonly organizationalUnit: {
    readonly id: string;
    readonly name: string;
    readonly path: string;
  };
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
  readonly routingGroupId: string | null;
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
  overview: ["assets", "overview"] as const,
};
