import { useCallback, useEffect, useRef, useState } from "react";
import { describeTeamsError, type TeamsErrorDetails } from "@/lib/teams/map-teams-error";
import { listUsersSummaryPage, type UserSummary } from "@/services/users-api";

const pageSize = 50;
const searchDelayMs = 250;

export function useTeamsUserSearch(query: string): {
  readonly users: readonly UserSummary[];
  readonly hasMore: boolean;
  readonly loading: boolean;
  readonly loadingMore: boolean;
  readonly error: TeamsErrorDetails | null;
  readonly loadMore: () => void;
} {
  const [users, setUsers] = useState<readonly UserSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loadedCount, setLoadedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<TeamsErrorDetails | null>(null);
  const requestVersion = useRef(0);
  const normalizedQuery = query.trim();

  useEffect(() => {
    const version = ++requestVersion.current;
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    const timeout = window.setTimeout(() => {
      void listUsersSummaryPage({
        take: pageSize,
        skip: 0,
        query: normalizedQuery,
      })
        .then((page) => {
          if (requestVersion.current !== version) return;
          setUsers(page.items.filter((user) => user.isActive));
          setLoadedCount(page.items.length);
          setTotal(page.total);
        })
        .catch((cause: unknown) => {
          if (requestVersion.current !== version) return;
          setUsers([]);
          setLoadedCount(0);
          setTotal(0);
          setError(describeTeamsError(cause));
        })
        .finally(() => {
          if (requestVersion.current === version) setLoading(false);
        });
    }, searchDelayMs);
    return () => window.clearTimeout(timeout);
  }, [normalizedQuery]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || loadedCount >= total) return;
    const version = requestVersion.current;
    setLoadingMore(true);
    setError(null);
    void listUsersSummaryPage({
      take: pageSize,
      skip: loadedCount,
      query: normalizedQuery,
    })
      .then((page) => {
        if (requestVersion.current !== version) return;
        setUsers((current) => [
          ...current,
          ...page.items.filter(
            (item) => item.isActive && !current.some((existing) => existing.id === item.id),
          ),
        ]);
        setLoadedCount((current) => current + page.items.length);
        setTotal(page.total);
      })
      .catch((cause: unknown) => {
        if (requestVersion.current === version) setError(describeTeamsError(cause));
      })
      .finally(() => {
        if (requestVersion.current === version) setLoadingMore(false);
      });
  }, [loadedCount, loading, loadingMore, normalizedQuery, total]);

  return { users, hasMore: loadedCount < total, loading, loadingMore, error, loadMore };
}
