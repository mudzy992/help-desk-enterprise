import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
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
  const pendingCounts = useRef(new Map<string, number>());
  const [writeErrorKey, setWriteErrorKey] = useState<ApiErrorKey | null>(null);
  const [writeRequestId, setWriteRequestId] = useState<string | null>(null);
  const observedGeneration = useRef(settingsGeneration);

  const beginPending = useCallback((keys: readonly string[]) => {
    for (const key of new Set(keys)) {
      pendingCounts.current.set(key, (pendingCounts.current.get(key) ?? 0) + 1);
    }
    setPendingKeys(new Set(pendingCounts.current.keys()));
  }, []);

  const endPending = useCallback((keys: readonly string[]) => {
    for (const key of new Set(keys)) {
      const count = pendingCounts.current.get(key) ?? 0;
      if (count <= 1) pendingCounts.current.delete(key);
      else pendingCounts.current.set(key, count - 1);
    }
    setPendingKeys(new Set(pendingCounts.current.keys()));
  }, []);

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
      beginPending([input.key]);
      setWriteErrorKey(null);
      setWriteRequestId(null);
      try {
        const response = await updateSetting(input);
        await invalidate();
        return response;
      } catch (error) {
        setWriteErrorKey(mapApiError(error));
        setWriteRequestId(readApiRequestId(error));
        throw error;
      } finally {
        endPending([input.key]);
      }
    },
    [beginPending, endPending, invalidate],
  );

  const saveMany = useCallback(
    async (input: SettingsSaveManyInput): Promise<SettingsWriteResponse> => {
      const keys = input.entries.map((entry) => entry.key);
      beginPending(keys);
      setWriteErrorKey(null);
      setWriteRequestId(null);
      try {
        const response = await updateSettings(input);
        await invalidate();
        return response;
      } catch (error) {
        setWriteErrorKey(mapApiError(error));
        setWriteRequestId(readApiRequestId(error));
        throw error;
      } finally {
        endPending(keys);
      }
    },
    [beginPending, endPending, invalidate],
  );

  const entries = query.data ?? [];
  const errorKey = useMemo(
    () => writeErrorKey ?? (query.error === null ? null : mapApiError(query.error)),
    [query.error, writeErrorKey],
  );
  const requestId =
    writeErrorKey !== null
      ? writeRequestId
      : query.error === null
        ? null
        : readApiRequestId(query.error);

  return {
    entries,
    isLoading: query.isLoading,
    isRefreshing: query.isFetching && !query.isLoading,
    pendingKeys,
    errorKey,
    requestId,
    reload: async () => {
      setWriteErrorKey(null);
      setWriteRequestId(null);
      await query.refetch();
    },
    save,
    saveMany,
  };
}
