import type { LucideIcon } from "lucide-react";
import {
  AppWindow,
  Box,
  Camera,
  Cloud,
  Cpu,
  HardDrive,
  Keyboard,
  KeyRound,
  Laptop,
  Monitor,
  Phone,
  Printer,
  Router,
  Server,
  Smartphone,
  Tablet,
} from "lucide-react";
import { ApiError } from "@/services/api";
import type { AssetRelationKind, AssetStatus } from "@/services/assets-api";

/** Paket 3.2: pure helpers shared by the CMDB pages. */

export const assetErrorKeys = {
  ASSETS_DISABLED: "assets.errors.disabled",
  ASSET_NOT_FOUND: "assets.errors.notFound",
  ASSET_FORBIDDEN: "assets.errors.forbidden",
  ASSET_OUT_OF_SCOPE: "assets.errors.outOfScope",
  ASSET_INVALID: "assets.errors.invalid",
  ASSET_TAG_TAKEN: "assets.errors.tagTaken",
  ASSET_STATUS_TRANSITION: "assets.errors.statusTransition",
  ASSET_REASON_REQUIRED: "assets.errors.reasonRequired",
  ASSET_VERSION_CONFLICT: "assets.errors.versionConflict",
  ASSET_READ_ONLY: "assets.errors.readOnly",
  ASSET_ATTRIBUTE_INVALID: "assets.errors.attributeInvalid",
  ASSET_ATTRIBUTE_NOT_UNIQUE: "assets.errors.attributeNotUnique",
  ASSET_TYPE_NOT_FOUND: "assets.errors.typeNotFound",
  ASSET_TYPE_KEY_TAKEN: "assets.errors.typeKeyTaken",
  ASSET_TYPE_ARCHIVED: "assets.errors.typeArchived",
  ASSET_ATTRIBUTE_KEY_TAKEN: "assets.errors.attributeKeyTaken",
  ASSET_ATTRIBUTE_HAS_VALUES: "assets.errors.attributeHasValues",
  ASSET_LOCATION_NOT_FOUND: "assets.errors.locationNotFound",
  ASSET_LOCATION_CODE_TAKEN: "assets.errors.locationCodeTaken",
  ASSET_LOCATION_IN_USE: "assets.errors.locationInUse",
  ASSET_UNIT_NOT_FOUND: "assets.errors.unitNotFound",
  ASSET_USER_NOT_FOUND: "assets.errors.userNotFound",
  ASSET_SERVICE_NOT_FOUND: "assets.errors.serviceNotFound",
  ASSET_RELATION_EXISTS: "assets.errors.relationExists",
  ASSET_RELATION_CYCLE: "assets.errors.relationCycle",
  ASSET_RELATION_SELF: "assets.errors.relationSelf",
  ASSET_HAS_DEPENDENTS: "assets.errors.hasDependents",
  ASSET_LICENSE_NOT_FOUND: "assets.errors.licenseNotFound",
  ASSET_LICENSE_KEY_UNAVAILABLE: "assets.errors.licenseKeyUnavailable",
  ASSET_LICENSE_ASSIGNMENT_INVALID: "assets.errors.licenseAssignmentInvalid",
  ASSET_LICENSE_ASSIGNMENT_EXISTS: "assets.errors.licenseAssignmentExists",
  ASSET_CONTRACT_NOT_FOUND: "assets.errors.contractNotFound",
  ASSET_CONTRACT_ITEM_EXISTS: "assets.errors.contractItemExists",
  ASSET_IMPORT_FILE_INVALID: "assets.errors.importFileInvalid",
  ASSET_IMPORT_TOO_MANY_ROWS: "assets.errors.importTooManyRows",
  ASSET_IMPORT_FILE_TOO_LARGE: "assets.errors.importFileTooLarge",
  ASSET_IMPORT_MAPPING_INVALID: "assets.errors.importMappingInvalid",
  ASSET_IMPORT_NOT_FOUND: "assets.errors.importNotFound",
  ASSET_IMPORT_EXPIRED: "assets.errors.importExpired",
  ASSET_IMPORT_NOT_PENDING: "assets.errors.importNotPending",
  ASSET_IMPORT_HAS_ERRORS: "assets.errors.importHasErrors",
  ASSET_EXPORT_TOO_LARGE: "assets.errors.exportTooLarge",
  ASSET_DIRECTORY_SYNC_DISABLED: "assets.errors.directorySyncDisabled",
  ASSET_DIRECTORY_NOT_CONFIGURED: "assets.errors.directoryNotConfigured",
  ASSET_DIRECTORY_UNAVAILABLE: "assets.errors.directoryUnavailable",
} as const;

export type AssetErrorKey = (typeof assetErrorKeys)[keyof typeof assetErrorKeys];

export function mapAssetError(error: unknown): AssetErrorKey | null {
  if (!(error instanceof ApiError)) return null;
  return (assetErrorKeys as Readonly<Record<string, AssetErrorKey>>)[error.code] ?? null;
}

/** Server detail (field or `key:problem` list) for invalid-input errors. */
export function assetErrorDetail(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  if (error.code !== "ASSET_INVALID" && error.code !== "ASSET_ATTRIBUTE_INVALID" && error.code !== "ASSET_ATTRIBUTE_NOT_UNIQUE") {
    return null;
  }
  return error.message && error.message !== error.code ? error.message : null;
}

export const assetStatusKeys: Readonly<Record<AssetStatus, `assets.status.${AssetStatus}`>> = {
  ORDERED: "assets.status.ORDERED",
  IN_STOCK: "assets.status.IN_STOCK",
  IN_USE: "assets.status.IN_USE",
  IN_REPAIR: "assets.status.IN_REPAIR",
  LOST: "assets.status.LOST",
  RETIRED: "assets.status.RETIRED",
  DISPOSED: "assets.status.DISPOSED",
};

export type AssetTone = "neutral" | "info" | "success" | "warning" | "danger";

export function assetStatusTone(status: AssetStatus): AssetTone {
  switch (status) {
    case "IN_USE":
      return "success";
    case "IN_STOCK":
    case "ORDERED":
      return "info";
    case "IN_REPAIR":
      return "warning";
    case "LOST":
      return "danger";
    default:
      return "neutral";
  }
}

/** Mirrors backend `assetStatusTransitions` (§5); the server re-checks. */
export const assetStatusTransitions: Readonly<Record<AssetStatus, readonly AssetStatus[]>> = {
  ORDERED: ["IN_STOCK", "IN_USE", "RETIRED", "LOST"],
  IN_STOCK: ["IN_USE", "IN_REPAIR", "RETIRED", "LOST"],
  IN_USE: ["IN_STOCK", "IN_REPAIR", "RETIRED", "LOST"],
  IN_REPAIR: ["IN_STOCK", "IN_USE", "RETIRED", "LOST"],
  LOST: ["IN_STOCK", "RETIRED"],
  RETIRED: ["IN_STOCK", "DISPOSED"],
  DISPOSED: [],
};

export const assetStatusesNeedingReason: readonly AssetStatus[] = ["LOST", "RETIRED", "DISPOSED"];
export const assetAssignableStatuses: readonly AssetStatus[] = ["ORDERED", "IN_STOCK", "IN_USE", "IN_REPAIR"];

export const assetRelationKindKeys: {
  readonly [K in AssetRelationKind]: { readonly out: `assets.relations.kinds.${K}.out`; readonly in: `assets.relations.kinds.${K}.in` };
} = {
  DEPENDS_ON: { out: "assets.relations.kinds.DEPENDS_ON.out", in: "assets.relations.kinds.DEPENDS_ON.in" },
  INSTALLED_ON: { out: "assets.relations.kinds.INSTALLED_ON.out", in: "assets.relations.kinds.INSTALLED_ON.in" },
  CONNECTED_TO: { out: "assets.relations.kinds.CONNECTED_TO.out", in: "assets.relations.kinds.CONNECTED_TO.in" },
  RUNS_ON: { out: "assets.relations.kinds.RUNS_ON.out", in: "assets.relations.kinds.RUNS_ON.in" },
  PART_OF: { out: "assets.relations.kinds.PART_OF.out", in: "assets.relations.kinds.PART_OF.in" },
};

const assetIcons: Readonly<Record<string, LucideIcon>> = {
  box: Box,
  monitor: Monitor,
  laptop: Laptop,
  printer: Printer,
  smartphone: Smartphone,
  tablet: Tablet,
  router: Router,
  server: Server,
  cloud: Cloud,
  "app-window": AppWindow,
  keyboard: Keyboard,
  "hard-drive": HardDrive,
  camera: Camera,
  phone: Phone,
  "key-round": KeyRound,
  cpu: Cpu,
};

export function resolveAssetIcon(name: string): LucideIcon {
  return assetIcons[name] ?? Box;
}

/** Bosnian UI shows the Bosnian name; every other language the English one. */
export function localizedName(item: { readonly nameBs: string; readonly nameEn: string }, language: string): string {
  return language.startsWith("bs") ? item.nameBs : item.nameEn;
}

export function localizedLabel(item: { readonly labelBs: string; readonly labelEn: string }, language: string): string {
  return language.startsWith("bs") ? item.labelBs : item.labelEn;
}

/** Days until a YYYY-MM-DD date (negative when past); null when absent. */
export function daysUntil(date: string | null, now: Date = new Date()): number | null {
  if (date === null) return null;
  const target = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(target)) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - today) / 86_400_000);
}

export type WarrantyState = "none" | "expired" | "expiring" | "valid";

export function warrantyState(date: string | null, withinDays = 30, now: Date = new Date()): WarrantyState {
  const days = daysUntil(date, now);
  if (days === null) return "none";
  if (days < 0) return "expired";
  if (days <= withinDays) return "expiring";
  return "valid";
}

export function formatAssetDate(date: string | null, language: string): string {
  if (date === null) return "—";
  const parsed = new Date(date.length === 10 ? `${date}T00:00:00Z` : date);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat(language.startsWith("bs") ? "bs-BA" : "en-GB", {
    dateStyle: "medium",
    ...(date.length === 10 ? { timeZone: "UTC" } : {}),
  }).format(parsed);
}

export function formatAssetDateTime(value: string, language: string): string {
  return new Intl.DateTimeFormat(language.startsWith("bs") ? "bs-BA" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

/** Attribute value as text for read-only display. */
export function formatAttributeValue(
  value: unknown,
  dataType: string,
  language: string,
  yes: string,
  no: string,
): string {
  if (value === undefined || value === null || value === "") return "—";
  if (dataType === "BOOLEAN") return value === true ? yes : no;
  if (dataType === "DATE" && typeof value === "string") return formatAssetDate(value, language);
  if (dataType === "NUMBER" && typeof value === "number") {
    return new Intl.NumberFormat(language.startsWith("bs") ? "bs-BA" : "en-GB").format(value);
  }
  return String(value);
}

/** Mirrors backend `assetLimits.locationDepthMax` (§7). */
export const assetLocationDepthMax = 6;

export type LocationTreeRow<T extends { readonly id: string; readonly parentId: string | null; readonly name: string }> = {
  readonly location: T;
  readonly depth: number;
  readonly path: string;
};

/** Depth-first rows (parents before children, siblings in input order) with full paths. */
export function flattenLocationTree<T extends { readonly id: string; readonly parentId: string | null; readonly name: string }>(
  locations: readonly T[],
): LocationTreeRow<T>[] {
  const ids = new Set(locations.map((location) => location.id));
  const children = new Map<string | null, T[]>();
  for (const location of locations) {
    const key = location.parentId !== null && ids.has(location.parentId) ? location.parentId : null;
    children.set(key, [...(children.get(key) ?? []), location]);
  }
  const rows: LocationTreeRow<T>[] = [];
  const seen = new Set<string>();
  const visit = (parentId: string | null, depth: number, prefix: string) => {
    for (const location of children.get(parentId) ?? []) {
      if (seen.has(location.id)) continue;
      seen.add(location.id);
      const path = prefix ? `${prefix} › ${location.name}` : location.name;
      rows.push({ location, depth, path });
      visit(location.id, depth + 1, path);
    }
  };
  visit(null, 1, "");
  return rows;
}

/** Ids of the location and everything below it. */
export function locationSubtree(
  locations: readonly { readonly id: string; readonly parentId: string | null }[],
  rootId: string,
): Set<string> {
  const result = new Set<string>([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const location of locations) {
      if (location.parentId !== null && result.has(location.parentId) && !result.has(location.id)) {
        result.add(location.id);
        grew = true;
      }
    }
  }
  return result;
}

/** Levels below the location (0 for a leaf). */
export function locationHeight<T extends { readonly id: string; readonly parentId: string | null; readonly name: string }>(
  locations: readonly T[],
  id: string,
): number {
  const rows = flattenLocationTree(locations);
  const own = rows.find((row) => row.location.id === id);
  if (own === undefined) return 0;
  const subtree = locationSubtree(locations, id);
  return Math.max(0, ...rows.filter((row) => subtree.has(row.location.id)).map((row) => row.depth - own.depth));
}
