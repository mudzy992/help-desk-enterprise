import type { ReactNode } from "react";

export interface PageHeaderProperties {
  readonly crumbs: readonly ReactNode[];
  readonly title: ReactNode;
  readonly subtitle?: ReactNode;
  readonly actions?: ReactNode;
  /** Optional application-level action rendered beside the page actions. */
  readonly supplement?: ReactNode;
}

/** Neutral page-heading layout. Route, branding and documentation policy belong in an adapter. */
export function PageHeader({ crumbs, title, subtitle, actions, supplement }: PageHeaderProperties) {
  return (
    <div className="mb-5">
      {crumbs.length > 0 ? (
        <nav className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted-foreground">
          {crumbs.map((crumb, index) => (
            <span key={index} className="flex items-center gap-1.5">
              {index > 0 ? <span className="text-muted-foreground">/</span> : null}
              <span className={index === crumbs.length - 1 ? "text-muted-foreground" : ""}>
                {crumb}
              </span>
            </span>
          ))}
        </nav>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-page font-semibold tracking-[-0.02em] text-foreground">{title}</h1>
          {subtitle ? (
            <p className="mt-1 max-w-2xl text-[12.5px] leading-5 text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
        </div>
        {actions || supplement ? (
          <div className="flex flex-wrap items-center gap-2">
            {actions}
            {supplement}
          </div>
        ) : null}
      </div>
    </div>
  );
}
