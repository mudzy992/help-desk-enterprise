import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { DocsHelpButton } from "@/components/docs/docs-help-button";
import { PageHeader as PageHeaderLayout } from "@/components/ui/page-header";
import { useBranding } from "@/lib/branding/branding-store";
import { docsTargetForPath } from "@/lib/docs/docs-slug";

export type PageHeaderCrumb = string | { readonly kind: "brand" };

/** Explicit application-brand crumb; unlike the old string sentinel it cannot collide with content. */
export const brandCrumb = { kind: "brand" } as const satisfies PageHeaderCrumb;

export function resolvePageHeaderCrumbs(
  crumbs: readonly PageHeaderCrumb[],
  appName: string,
): readonly string[] {
  return crumbs.map((crumb) => (typeof crumb === "string" ? crumb : appName));
}

interface PageHeaderProperties {
  readonly crumbs: readonly PageHeaderCrumb[];
  readonly title: ReactNode;
  readonly subtitle?: ReactNode;
  readonly actions?: ReactNode;
}

/** Application adapter that supplies branding, route context and contextual documentation help. */
export function PageHeader({ crumbs, title, subtitle, actions }: PageHeaderProperties) {
  const { appName } = useBranding();
  const { pathname } = useLocation();
  const hasDocsHelp = !pathname.startsWith("/docs") && docsTargetForPath(pathname) !== null;

  return (
    <PageHeaderLayout
      crumbs={resolvePageHeaderCrumbs(crumbs, appName)}
      title={title}
      subtitle={subtitle}
      actions={actions}
      supplement={hasDocsHelp ? <DocsHelpButton /> : undefined}
    />
  );
}
