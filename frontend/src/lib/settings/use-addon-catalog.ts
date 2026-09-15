import { useEffect, useState, useSyncExternalStore } from "react";
import { parseAddonCatalogItems } from "@/lib/settings/parse-addon-catalog-items";
import {
  getSettingsGeneration,
  subscribeSettingsGeneration,
} from "@/lib/settings/settings-realtime-store";
import {
  loadInstallAddons,
  type InstallAddonItem,
} from "@/services/install-addons-api";

export function useAddonCatalog() {
  const settingsGeneration = useSyncExternalStore(
    subscribeSettingsGeneration,
    getSettingsGeneration,
    getSettingsGeneration,
  );
  const [items, setItems] = useState<readonly InstallAddonItem[] | null>(null);

  useEffect(() => {
    let isCancelled = false;
    void loadInstallAddons()
      .then((status) => {
        if (!isCancelled) {
          setItems(parseAddonCatalogItems(status));
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setItems([]);
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [settingsGeneration]);

  return {
    isLoading: items === null,
    items: items ?? [],
  };
}
