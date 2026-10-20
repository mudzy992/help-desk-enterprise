import { useCallback, useEffect, useMemo, useState } from "react";
import { mapApiError, readApiRequestId } from "@/lib/map-api-error";
import { getOnCallGroup, type OnCallGroupDetail } from "@/services/on-call-api";
import type { OnCallQueryError } from "./use-on-call-overview-data";

export function useOnCallGroupDetail(
  groupId: string | null,
  range: { readonly from: string; readonly to: string },
) {
  const scope = useMemo(
    () => (groupId === null ? null : `${groupId}:${range.from}:${range.to}`),
    [groupId, range.from, range.to],
  );
  const [snapshot, setSnapshot] = useState<{
    readonly scope: string;
    readonly data: OnCallGroupDetail;
  } | null>(null);
  const [error, setError] = useState<OnCallQueryError | null>(null);
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    setSnapshot(null);
    setError(null);
    if (groupId === null || scope === null) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    getOnCallGroup(groupId, { from: range.from, to: range.to })
      .then((data) => {
        if (!active) return;
        setSnapshot({ scope, data });
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError({
          key: mapApiError(caught),
          requestId: readApiRequestId(caught),
          disabled: false,
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [groupId, range.from, range.to, revision, scope]);

  const retry = useCallback(() => setRevision((value) => value + 1), []);
  const detail = snapshot?.scope === scope ? snapshot.data : null;

  return { detail, error, loading, retry };
}
