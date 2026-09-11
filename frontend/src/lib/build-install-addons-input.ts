import type { InstallAddonItem } from "@/services/install-addons-api";

export function buildInstallAddonsInput(
  items: readonly InstallAddonItem[],
): { readonly addons: Readonly<Record<string, boolean>> } {
  return {
    addons: Object.fromEntries(items.map((item) => [item.key, item.enabled])),
  };
}
