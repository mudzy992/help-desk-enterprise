import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { DocsHelpButton } from "@/components/docs/docs-help-button";
import { PageHeader as PageHeaderLayout } from "@/components/ui/page-header";
import { useBranding } from "@/lib/branding/branding-store";
import { docsTargetForPath } from "@/lib/docs/docs-slug";

/** Placeholder crumb resolved by the application adapter to the configured product name. */
export const brandCrumb = "\u0000brand";

interface PageHeaderProperties {
  readonly crumbs: readonly string[];
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
      crumbs={crumbs.map((crumb) => (crumb === brandCrumb ? appName : crumb))}
      title={title}
      subtitle={subtitle}
      actions={actions}
      supplement={hasDocsHelp ? <DocsHelpButton /> : undefined}
    />
  );
}
