import { useCallback, useEffect, useRef, useState } from "react";
import { createLatestRequestGuard } from "@/lib/async/latest-request-guard";
import { isOnCallDisabledError } from "@/lib/on-call/on-call-view";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import {
  getOnCallMe,
  getOnCallOverview,
  listOnCallSwaps,
  type OnCallMe,
  type OnCallOverview,
  type OnCallSwapView,
} from "@/services/on-call-api";

export type OnCallQueryError = {
  readonly key: ApiErrorKey;
  readonly requestId: string | null;
  readonly disabled: boolean;
};

const queryError = (error: unknown): OnCallQueryError => ({
  key: mapApiError(error),
  requestId: readApiRequestId(error),
  disabled: isOnCallDisabledError(error),
});

export function useOnCallOverviewData() {
  const [overview, setOverview] = useState<OnCallOverview | null>(null);
  const [me, setMe] = useState<OnCallMe | null>(null);
  const [swaps, setSwaps] = useState<readonly OnCallSwapView[]>([]);
  const [overviewError, setOverviewError] = useState<OnCallQueryError | null>(null);
  const [meError, setMeError] = useState<OnCallQueryError | null>(null);
  const [swapsError, setSwapsError] = useState<OnCallQueryError | null>(null);
  const [pending, setPending] = useState({ overview: false, me: false, swaps: false });
  const guards = useRef({
    overview: createLatestRequestGuard(),
    me: createLatestRequestGuard(),
    swaps: createLatestRequestGuard(),
  });

  const loadOverview = useCallback(async () => {
    const request = guards.current.overview.begin();
    setPending((value) => ({ ...value, overview: true }));
    try {
      const loaded = await getOnCallOverview();
      if (!guards.current.overview.isCurrent(request)) return;
      setOverview(loaded);
      setOverviewError(null);
    } catch (error) {
      if (guards.current.overview.isCurrent(request)) setOverviewError(queryError(error));
    } finally {
      if (guards.current.overview.isCurrent(request)) {
        setPending((value) => ({ ...value, overview: false }));
      }
    }
  }, []);

  const loadMe = useCallback(async () => {
    const request = guards.current.me.begin();
    setPending((value) => ({ ...value, me: true }));
    try {
      const loaded = await getOnCallMe();
      if (!guards.current.me.isCurrent(request)) return;
      setMe(loaded);
      setMeError(null);
    } catch (error) {
      if (guards.current.me.isCurrent(request)) setMeError(queryError(error));
    } finally {
      if (guards.current.me.isCurrent(request)) {
        setPending((value) => ({ ...value, me: false }));
      }
    }
  }, []);

  const loadSwaps = useCallback(async () => {
    const request = guards.current.swaps.begin();
    setPending((value) => ({ ...value, swaps: true }));
    try {
      const loaded = await listOnCallSwaps();
      if (!guards.current.swaps.isCurrent(request)) return;
      setSwaps(loaded.swaps);
      setSwapsError(null);
    } catch (error) {
      if (guards.current.swaps.isCurrent(request)) setSwapsError(queryError(error));
    } finally {
      if (guards.current.swaps.isCurrent(request)) {
        setPending((value) => ({ ...value, swaps: false }));
      }
    }
  }, []);

  const reloadAll = useCallback(() => {
    void loadOverview();
    void loadMe();
    void loadSwaps();
  }, [loadMe, loadOverview, loadSwaps]);

  useEffect(() => {
    reloadAll();
    const currentGuards = guards.current;
    return () => {
      currentGuards.overview.cancel();
      currentGuards.me.cancel();
      currentGuards.swaps.cancel();
    };
  }, [reloadAll]);

  return {
    overview,
    me,
    swaps,
    overviewError,
    meError,
    swapsError,
    pending,
    refreshing: pending.overview || pending.me || pending.swaps,
    reloadAll,
    reloadOverview: loadOverview,
    reloadMe: loadMe,
    reloadSwaps: loadSwaps,
  };
}
