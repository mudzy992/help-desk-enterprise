import type { ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";

interface SlaEditDrawerProperties {
  readonly open: boolean;
  readonly title: string;
  readonly description: string;
  readonly onOpenChange: (open: boolean) => void;
  readonly children: ReactNode;
}

export function SlaEditDrawer({
  open,
  title,
  description,
  onOpenChange,
  children,
}: SlaEditDrawerProperties) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-lg flex-col p-0">
        <div className="border-b border-border/70 px-5 py-4">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
            {description}
          </SheetDescription>
        </div>
        {open ? (
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
