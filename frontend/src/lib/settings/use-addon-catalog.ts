import { useEffect, useState, useSyncExternalStore } from "react";
import { parseAddonCatalogItems } from "@/lib/settings/parse-addon-catalog-items";
import {
  getSettingsGeneration,
  subscribeSettingsGeneration,
} from "@/lib/settings/settings-realtime-store";
import type { InstallAddonItem } from "@/services/install-addons-api";
import { loadSettingsAddons } from "@/services/settings-api";

/**
 * Paket 5.3.4 (ispravka 2026-10-08): the addon card reads
 * `GET /settings/addons` — the authenticated route with the **stored** values.
 * The install wizard keeps the public `GET /install/addons`, which deliberately
 * serves the catalogue defaults after installation (5.2 finding M1 #5), so a
 * switch rendered from it could never show a switched-on addon.
 */
export function useAddonCatalog() {
  const settingsGeneration = useSyncExternalStore(
    subscribeSettingsGeneration,
    getSettingsGeneration,
    getSettingsGeneration,
  );
  const [items, setItems] = useState<readonly InstallAddonItem[] | null>(null);

  useEffect(() => {
    let isCancelled = false;
    void loadSettingsAddons()
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
