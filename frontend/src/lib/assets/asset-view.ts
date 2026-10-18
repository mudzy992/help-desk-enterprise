import { dateTimeFormatter } from "@/lib/date-time-formatter";
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
import type { AssetRelationKind, AssetStatus } from "@/services/assets-api";

/** pure helpers shared by the CMDB pages. */

export * from "@/lib/assets/asset-errors";

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
export const assetAssignableStatuses: readonly AssetStatus[] = [
  "ORDERED",
  "IN_STOCK",
  "IN_USE",
  "IN_REPAIR",
];

export const assetRelationKindKeys: {
  readonly [K in AssetRelationKind]: {
    readonly out: `assets.relations.kinds.${K}.out`;
    readonly in: `assets.relations.kinds.${K}.in`;
  };
} = {
  DEPENDS_ON: {
    out: "assets.relations.kinds.DEPENDS_ON.out",
    in: "assets.relations.kinds.DEPENDS_ON.in",
  },
  INSTALLED_ON: {
    out: "assets.relations.kinds.INSTALLED_ON.out",
    in: "assets.relations.kinds.INSTALLED_ON.in",
  },
  CONNECTED_TO: {
    out: "assets.relations.kinds.CONNECTED_TO.out",
    in: "assets.relations.kinds.CONNECTED_TO.in",
  },
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
export function localizedName(
  item: { readonly nameBs: string; readonly nameEn: string },
  language: string,
): string {
  return language.startsWith("bs") ? item.nameBs : item.nameEn;
}

export function localizedLabel(
  item: { readonly labelBs: string; readonly labelEn: string },
  language: string,
): string {
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

export function warrantyState(
  date: string | null,
  withinDays = 30,
  now: Date = new Date(),
): WarrantyState {
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
  // Explicit fields, not `dateStyle`: without Bosnian CLDR data a browser
  // renders "bs-BA" medium as "2026 M10 5" (same fix as announcements).
  return dateTimeFormatter(language.startsWith("bs") ? "bs-BA" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(date.length === 10 ? { timeZone: "UTC" } : {}),
  }).format(parsed);
}

export function formatAssetDateTime(value: string, language: string): string {
  return dateTimeFormatter(language.startsWith("bs") ? "bs-BA" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
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

export * from "@/lib/assets/asset-location-tree";
