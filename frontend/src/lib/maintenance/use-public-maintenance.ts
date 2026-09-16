import { useEffect, useState } from "react";
import {
  getSettingsGeneration,
  subscribeSettingsGeneration,
} from "@/lib/settings/settings-realtime-store";
import {
  parsePublicMaintenance,
  type PublicMaintenanceState,
} from "@/lib/maintenance/parse-public-maintenance";
import { getPublicSettings } from "@/services/settings-api";

const emptyMaintenance: PublicMaintenanceState = {
  enabled: false,
  message: "",
  fromAt: "",
  toAt: "",
  scope: "both",
  affectedServiceTokens: [],
};

export function usePublicMaintenance(): {
  readonly maintenance: PublicMaintenanceState;
  readonly isLoading: boolean;
} {
  const [maintenance, setMaintenance] =
    useState<PublicMaintenanceState>(emptyMaintenance);
  const [isLoading, setIsLoading] = useState(true);
  const [generation, setGeneration] = useState(getSettingsGeneration);

  useEffect(() => {
    return subscribeSettingsGeneration(() => {
      setGeneration(getSettingsGeneration());
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    void getPublicSettings()
      .then((snapshot) => {
        if (!cancelled) {
          setMaintenance(parsePublicMaintenance(snapshot));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMaintenance(emptyMaintenance);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [generation]);

  return { maintenance, isLoading };
}
