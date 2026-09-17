import {
  Building2,
  GitBranch,
  Landmark,
  Layers,
  Store,
  type LucideIcon,
} from "lucide-react";

export const organizationalUnitTypes = [
  "DIRECTORATE",
  "BRANCH",
  "OFFICE",
  "SECTOR",
  "SERVICE",
] as const;

export type OrganizationalUnitType = (typeof organizationalUnitTypes)[number];

export function isOrganizationalUnitType(
  value: string | null | undefined,
): value is OrganizationalUnitType {
  return (
    value !== null &&
    value !== undefined &&
    (organizationalUnitTypes as readonly string[]).includes(value)
  );
}

export function resolveOrganizationalUnitTypeIcon(
  type: string | null | undefined,
): LucideIcon {
  switch (type) {
    case "DIRECTORATE":
      return Landmark;
    case "BRANCH":
      return GitBranch;
    case "OFFICE":
      return Store;
    case "SECTOR":
      return Layers;
    case "SERVICE":
      return Building2;
    default:
      return Building2;
  }
}

export function defaultOrganizationalUnitTypeForParent(
  parentExternalId: string,
): OrganizationalUnitType {
  return parentExternalId.trim().length === 0 ? "DIRECTORATE" : "BRANCH";
}
