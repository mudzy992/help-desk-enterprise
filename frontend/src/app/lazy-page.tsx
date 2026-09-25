import { lazy, Suspense, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { PanelSkeleton } from "@/components/ui/skeleton";

/**
 * Review 2026-09-25 (S11): heavy, role-gated pages (admin, reports, routing,
 * SLA, config versions, install) are split into their own chunks. The loader
 * picks the named export so page modules stay unchanged.
 */
export function lazyPage<M extends Record<string, unknown>, K extends keyof M>(
  load: () => Promise<M>,
  exportName: K,
): ComponentType {
  const Page = lazy(async () => ({ default: (await load())[exportName] as ComponentType }));
  function LazyPage() {
    const { t } = useTranslation();
    return (
      <Suspense fallback={<PanelSkeleton label={t("install.loading")} />}>
        <Page />
      </Suspense>
    );
  }
  LazyPage.displayName = `Lazy(${String(exportName)})`;
  return LazyPage;
}
