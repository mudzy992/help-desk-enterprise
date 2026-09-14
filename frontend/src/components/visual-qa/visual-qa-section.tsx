import type { ReactNode } from "react";

interface VisualQaSectionProperties {
  readonly title: string;
  readonly children: ReactNode;
}

export function VisualQaSection({ title, children }: VisualQaSectionProperties) {
  return (
    <section className="space-y-3">
      <h2 className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}
