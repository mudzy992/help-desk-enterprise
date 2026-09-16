import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { mapApiError, type ApiErrorKey } from "@/lib/map-api-error";
import {
  bumpSettingsGeneration,
  getSettingsGeneration,
  subscribeSettingsGeneration,
} from "@/lib/settings/settings-realtime-store";
import {
  getSettingsRegistry,
  updateSetting,
  type SettingRegistryEntry,
} from "@/services/settings-api";

export type SettingsSaveInput = {
  readonly key: string;
  readonly value: string | number | boolean;
  readonly reason: string;
};

export function useSettingsRegistry() {
  const settingsGeneration = useSyncExternalStore(
    subscribeSettingsGeneration,
    getSettingsGeneration,
    getSettingsGeneration,
  );
  const [entries, setEntries] = useState<readonly SettingRegistryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<ApiErrorKey | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setErrorKey(null);
    try {
      setEntries(await getSettingsRegistry());
    } catch (error) {
      setErrorKey(mapApiError(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, settingsGeneration]);

  const save = useCallback(async (input: SettingsSaveInput) => {
    setPendingKey(input.key);
    setErrorKey(null);
    try {
      await updateSetting(input);
      bumpSettingsGeneration();
      await reload();
    } catch (error) {
      setErrorKey(mapApiError(error));
      throw error;
    } finally {
      setPendingKey(null);
    }
  }, [reload]);

  return {
    entries,
    isLoading,
    pendingKey,
    errorKey,
    reload,
    save,
  };
}
