import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { mapApiError, type ApiErrorKey } from "@/lib/map-api-error";
import { queryKeys } from "@/lib/query/query-keys";
import {
  getSettingsGeneration,
  subscribeSettingsGeneration,
} from "@/lib/settings/settings-realtime-store";
import {
  getSettingsRegistry,
  updateSetting,
  updateSettings,
  type SettingsWriteResponse,
} from "@/services/settings-api";

export type SettingsSaveInput = {
  readonly key: string;
  readonly value: string | number | boolean;
  readonly reason: string;
  readonly resetDependents?: boolean;
};

export type SettingsSaver = (input: SettingsSaveInput) => Promise<SettingsWriteResponse>;

export type SettingsSaveManyInput = {
  readonly entries: readonly {
    readonly key: string;
    readonly value: string | number | boolean;
  }[];
  readonly reason: string;
  readonly resetDependents?: boolean;
};

export type SettingsSaverMany = (input: SettingsSaveManyInput) => Promise<SettingsWriteResponse>;

export function useSettingsRegistry() {
  const queryClient = useQueryClient();
  const settingsGeneration = useSyncExternalStore(
    subscribeSettingsGeneration,
    getSettingsGeneration,
    getSettingsGeneration,
  );
  const query = useQuery({
    queryKey: queryKeys.settingsRegistry,
    queryFn: getSettingsRegistry,
  });
  const [pendingKeys, setPendingKeys] = useState<ReadonlySet<string>>(new Set());
  const [writeErrorKey, setWriteErrorKey] = useState<ApiErrorKey | null>(null);
  const observedGeneration = useRef(settingsGeneration);

  useEffect(() => {
    if (settingsGeneration === observedGeneration.current) return;
    observedGeneration.current = settingsGeneration;
    void queryClient.invalidateQueries({ queryKey: queryKeys.settingsRegistry });
  }, [queryClient, settingsGeneration]);

  const invalidate = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.settingsRegistry });
  }, [queryClient]);

  const save = useCallback(
    async (input: SettingsSaveInput): Promise<SettingsWriteResponse> => {
      setPendingKeys(new Set([input.key]));
      setWriteErrorKey(null);
      try {
        const response = await updateSetting(input);
        await invalidate();
        return response;
      } catch (error) {
        setWriteErrorKey(mapApiError(error));
        throw error;
      } finally {
        setPendingKeys(new Set());
      }
    },
    [invalidate],
  );

  const saveMany = useCallback(
    async (input: SettingsSaveManyInput): Promise<SettingsWriteResponse> => {
      setPendingKeys(new Set(input.entries.map((entry) => entry.key)));
      setWriteErrorKey(null);
      try {
        const response = await updateSettings(input);
        await invalidate();
        return response;
      } catch (error) {
        setWriteErrorKey(mapApiError(error));
        throw error;
      } finally {
        setPendingKeys(new Set());
      }
    },
    [invalidate],
  );

  const entries = query.data ?? [];
  const errorKey = useMemo(
    () => writeErrorKey ?? (query.error === null ? null : mapApiError(query.error)),
    [query.error, writeErrorKey],
  );
  const pendingKey = pendingKeys.values().next().value ?? null;

  return {
    entries,
    isLoading: query.isLoading,
    pendingKey,
    pendingKeys,
    errorKey,
    reload: async () => {
      await query.refetch();
    },
    save,
    saveMany,
  };
}
