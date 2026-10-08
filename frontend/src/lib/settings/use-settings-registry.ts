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
  updateSettings,
  type SettingRegistryEntry,
  type SettingsWriteResponse,
} from "@/services/settings-api";

export type SettingsSaveInput = {
  readonly key: string;
  readonly value: string | number | boolean;
  readonly reason: string;
  /**
   * Paket 5.3.3 (D7): the administrator confirmed the list of dependent keys
   * that a switch-off resets. Without it the server refuses such a write.
   */
  readonly resetDependents?: boolean;
};

/**
 * Paket 5.3.4: both endpoints answer with what actually changed, and the screen
 * needs that answer to tell the administrator which dependent keys were reset.
 */
export type SettingsSaver = (
  input: SettingsSaveInput,
) => Promise<SettingsWriteResponse>;

export type SettingsSaveManyInput = {
  readonly entries: readonly {
    readonly key: string;
    readonly value: string | number | boolean;
  }[];
  readonly reason: string;
  readonly resetDependents?: boolean;
};

export type SettingsSaverMany = (
  input: SettingsSaveManyInput,
) => Promise<SettingsWriteResponse>;

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

  const save = useCallback(async (input: SettingsSaveInput): Promise<SettingsWriteResponse> => {
    setPendingKey(input.key);
    setErrorKey(null);
    try {
      const response = await updateSetting(input);
      bumpSettingsGeneration();
      await reload();
      return response;
    } catch (error) {
      setErrorKey(mapApiError(error));
      throw error;
    } finally {
      setPendingKey(null);
    }
  }, [reload]);

  /** Paket 4.1: one request, one reload - the card never re-renders mid-save. */
  const saveMany = useCallback(
    async (input: SettingsSaveManyInput): Promise<SettingsWriteResponse> => {
      setPendingKey(input.entries[0]?.key ?? null);
      setErrorKey(null);
      try {
        const response = await updateSettings(input);
        bumpSettingsGeneration();
        await reload();
        return response;
      } catch (error) {
        setErrorKey(mapApiError(error));
        throw error;
      } finally {
        setPendingKey(null);
      }
    },
    [reload],
  );

  return {
    entries,
    isLoading,
    pendingKey,
    errorKey,
    reload,
    save,
    saveMany,
  };
}
