import type { ReactNode } from "react";

export function Kbd({ children }: { readonly children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-elevated px-1 text-[10.5px] font-medium text-muted-foreground tnum shadow-card">
      {children}
    </kbd>
  );
}
