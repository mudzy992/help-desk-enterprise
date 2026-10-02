import type { ReactNode } from "react";
import { useBranding } from "@/lib/branding/branding-store";

/** Paket 4.1: placeholder crumb replaced by the configured product name. */
export const brandCrumb = "\u0000brand";

interface PageHeaderProperties {
  readonly crumbs: readonly string[];
  readonly title: ReactNode;
  readonly subtitle?: ReactNode;
  readonly actions?: ReactNode;
}

export function PageHeader({
  crumbs,
  title,
  subtitle,
  actions,
}: PageHeaderProperties) {
  const { appName } = useBranding();
  return (
    <div className="mb-5">
      {crumbs.length > 0 ? (
        <nav className="mb-1.5 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
          {crumbs.map((crumb, index) => (
            <span key={`${crumb}-${index}`} className="flex items-center gap-1.5">
              {index > 0 ? <span className="text-muted-foreground">/</span> : null}
              <span className={index === crumbs.length - 1 ? "text-muted-foreground" : ""}>
                {crumb === brandCrumb ? appName : crumb}
              </span>
            </span>
          ))}
        </nav>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-page font-semibold tracking-[-0.02em] text-foreground">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-1 max-w-2xl text-[12.5px] leading-5 text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
