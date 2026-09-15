import type {
  InstallAddonItem,
  InstallAddonsStatus,
} from "@/services/install-addons-api";

export function parseAddonCatalogItems(
  payload: unknown,
): readonly InstallAddonItem[] {
  if (!isAddonCatalogStatus(payload)) {
    return [];
  }
  return payload.addons.items.filter(isAddonCatalogItem);
}

function isAddonCatalogStatus(
  payload: unknown,
): payload is InstallAddonsStatus {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }
  const addons = (payload as InstallAddonsStatus).addons;
  return (
    typeof addons === "object" &&
    addons !== null &&
    Array.isArray(addons.items)
  );
}

function isAddonCatalogItem(value: unknown): value is InstallAddonItem {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return (
    typeof item.key === "string" &&
    item.key.length > 0 &&
    typeof item.enabled === "boolean" &&
    typeof item.defaultEnabled === "boolean" &&
    typeof item.canEnable === "boolean"
  );
}
