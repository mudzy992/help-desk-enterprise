import { Component, lazy, Suspense, type ComponentType, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { isChunkLoadError, reloadForChunkError } from "@/lib/app/chunk-reload";

/**
 * Review 2026-09-25 (S11): heavy, role-gated pages (admin, reports, routing,
 * SLA, config versions, install) are split into their own chunks. The loader
 * picks the named export so page modules stay unchanged.
 *
 * A chunk that no longer exists (a redeploy while the tab was open) triggers
 * one automatic reload; if that does not help, the boundary shows a message
 * with a reload button instead of a white screen.
 */
export function lazyPage<M extends Record<string, unknown>, K extends keyof M>(
  load: () => Promise<M>,
  exportName: K,
): ComponentType {
  const Page = lazy(async () => {
    try {
      return { default: (await load())[exportName] as ComponentType };
    } catch (error) {
      if (reloadForChunkError(error)) {
        // Keep Suspense pending while the browser reloads.
        return new Promise<never>(() => undefined);
      }
      throw error;
    }
  });
  function LazyPage() {
    const { t } = useTranslation();
    return (
      <PageLoadBoundary>
        <Suspense fallback={<PanelSkeleton label={t("install.loading")} />}>
          <Page />
        </Suspense>
      </PageLoadBoundary>
    );
  }
  LazyPage.displayName = `Lazy(${String(exportName)})`;
  return LazyPage;
}

type BoundaryState = { readonly error: unknown };

class PageLoadBoundary extends Component<{ readonly children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("page_load_failed", error, info.componentStack);
  }

  render() {
    if (this.state.error === null) return this.props.children;
    return <PageLoadError stale={isChunkLoadError(this.state.error)} />;
  }
}

function PageLoadError({ stale }: { readonly stale: boolean }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="mx-auto mt-10 grid max-w-md justify-items-center gap-3 rounded-lg border border-border bg-surface p-6 text-center shadow-card">
      <p className="text-[14px] font-semibold text-foreground">
        {stale ? t("app.pageLoad.staleTitle") : t("app.pageLoad.errorTitle")}
      </p>
      <p className="text-[12.5px] text-muted-foreground">
        {stale ? t("app.pageLoad.staleBody") : t("app.pageLoad.errorBody")}
      </p>
      <Button size="sm" onClick={() => window.location.reload()}>
        <RefreshCw />
        {t("app.pageLoad.reload")}
      </Button>
    </div>
  );
}
