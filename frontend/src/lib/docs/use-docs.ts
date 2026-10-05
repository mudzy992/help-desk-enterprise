import { useCallback, useEffect, useRef, useState } from "react";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import { ApiError } from "@/services/api";
import {
  getDocsNavigation,
  getDocsPage,
  searchDocs,
  type DocsLocale,
  type DocsNavigation,
  type DocsPage,
  type DocsSearchResponse,
} from "@/services/docs-api";

/**
 * Faza 3 (c): hookovi za Dokumentaciju. Bez novog state menadžera — običan
 * `useState`/`useEffect`, kao na stranici Statusa; server vraća `no-store`.
 */

export type DocsLoadError = {
  readonly key: ApiErrorKey;
  readonly requestId: string | null;
  /** HTTP status, kad ga je bilo (404 i 503 imaju poseban ekran). */
  readonly status: number | null;
  readonly code: string | null;
};

function toLoadError(caught: unknown): DocsLoadError {
  return {
    key: mapApiError(caught),
    requestId: readApiRequestId(caught),
    status: caught instanceof ApiError ? caught.status : null,
    code: caught instanceof ApiError ? caught.code : null,
  };
}

export function useDocsNavigation(locale: DocsLocale = "bs") {
  const [navigation, setNavigation] = useState<DocsNavigation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<DocsLoadError | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setNavigation(await getDocsNavigation(locale));
      setError(null);
    } catch (caught) {
      setNavigation(null);
      setError(toLoadError(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, locale]);

  return { navigation, loading, error, reload };
}

export function useDocsPage(slug: string | null, locale: DocsLocale = "bs") {
  const [page, setPage] = useState<DocsPage | null>(null);
  const [loading, setLoading] = useState(slug !== null);
  const [error, setError] = useState<DocsLoadError | null>(null);

  useEffect(() => {
    if (slug === null) {
      setPage(null);
      setLoading(false);
      setError(null);
      return;
    }
    let active = true;
    setLoading(true);
    void getDocsPage(slug, locale)
      .then((loaded) => {
        if (!active) return;
        setPage(loaded);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setPage(null);
        setError(toLoadError(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // `locale` je u zavisnostima: promjena jezika ponovo učitava stranicu.
  }, [slug, locale]);

  return { page, loading, error };
}

/** Debounce: pretraga se poziva 250 ms poslije posljednjeg otkucanog znaka. */
export function useDocsSearch(query: string) {
  const [response, setResponse] = useState<DocsSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<DocsLoadError | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResponse(null);
      setError(null);
      setLoading(false);
      return;
    }
    const current = requestId.current + 1;
    requestId.current = current;
    setLoading(true);
    const timer = setTimeout(() => {
      void searchDocs(trimmed)
        .then((result) => {
          if (requestId.current !== current) return;
          setResponse(result);
          setError(null);
        })
        .catch((caught: unknown) => {
          if (requestId.current !== current) return;
          setResponse(null);
          setError(toLoadError(caught));
        })
        .finally(() => {
          if (requestId.current === current) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
    };
  }, [query]);

  return { response, loading, error };
}
