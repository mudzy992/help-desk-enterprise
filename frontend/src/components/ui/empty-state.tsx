import { Inbox } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProperties {
  readonly icon?: ReactNode;
  readonly title: string;
  readonly body?: string;
  readonly action?: ReactNode;
}

export function EmptyState({ icon, title, body, action }: EmptyStateProperties) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-surface-hover text-muted-foreground shadow-card">
        {icon ?? <Inbox size={18} strokeWidth={1.8} />}
      </div>
      <p className="text-[13px] font-medium text-foreground">{title}</p>
      {body ? (
        <p className="max-w-sm text-[12px] leading-5 text-muted-foreground">{body}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
