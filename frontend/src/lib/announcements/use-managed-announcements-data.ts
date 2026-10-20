import { useCallback, useEffect, useRef, useState } from "react";
import { createLatestRequestGuard } from "@/lib/async/latest-request-guard";
import { mapAnnouncementError } from "@/lib/announcements/announcement-view";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import {
  getAnnouncementOptions,
  listManagedAnnouncements,
  type AnnouncementList,
  type AnnouncementOptions,
} from "@/services/announcements-api";

export type AnnouncementQueryError = {
  readonly key: ApiErrorKey | NonNullable<ReturnType<typeof mapAnnouncementError>>;
  readonly requestId: string | null;
};

const queryError = (error: unknown): AnnouncementQueryError => ({
  key: mapAnnouncementError(error) ?? mapApiError(error),
  requestId: readApiRequestId(error),
});

export function useManagedAnnouncementsData() {
  const [list, setList] = useState<AnnouncementList | null>(null);
  const [options, setOptions] = useState<AnnouncementOptions | null>(null);
  const [listError, setListError] = useState<AnnouncementQueryError | null>(null);
  const [optionsError, setOptionsError] = useState<AnnouncementQueryError | null>(null);
  const [pending, setPending] = useState({ list: false, options: false });
  const guards = useRef({
    list: createLatestRequestGuard(),
    options: createLatestRequestGuard(),
  });

  const loadList = useCallback(async () => {
    const request = guards.current.list.begin();
    setPending((value) => ({ ...value, list: true }));
    try {
      const loaded = await listManagedAnnouncements();
      if (!guards.current.list.isCurrent(request)) return;
      setList(loaded);
      setListError(null);
    } catch (error) {
      if (guards.current.list.isCurrent(request)) setListError(queryError(error));
    } finally {
      if (guards.current.list.isCurrent(request)) {
        setPending((value) => ({ ...value, list: false }));
      }
    }
  }, []);

  const loadOptions = useCallback(async () => {
    const request = guards.current.options.begin();
    setPending((value) => ({ ...value, options: true }));
    try {
      const loaded = await getAnnouncementOptions();
      if (!guards.current.options.isCurrent(request)) return;
      setOptions(loaded);
      setOptionsError(null);
    } catch (error) {
      if (guards.current.options.isCurrent(request)) setOptionsError(queryError(error));
    } finally {
      if (guards.current.options.isCurrent(request)) {
        setPending((value) => ({ ...value, options: false }));
      }
    }
  }, []);

  const reload = useCallback(() => {
    void loadList();
    void loadOptions();
  }, [loadList, loadOptions]);

  useEffect(() => {
    reload();
    const currentGuards = guards.current;
    return () => {
      currentGuards.list.cancel();
      currentGuards.options.cancel();
    };
  }, [reload]);

  return {
    list,
    options,
    listError,
    optionsError,
    pending,
    reload,
    reloadList: loadList,
    reloadOptions: loadOptions,
  };
}
