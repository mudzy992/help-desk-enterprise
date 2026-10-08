import type { ReactNode } from "react";
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalTitle,
} from "@/components/ui/modal";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsCompactViewport } from "@/lib/ui/use-is-compact-viewport";
import { cn } from "@/lib/utils";

interface ResponsiveSurfaceProperties {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly children: ReactNode;
  /** Test id applied to the surface itself, so a spec can find the same node on both layouts. */
  readonly testId?: string;
  readonly contentClassName?: string;
}

/**
 * Paket 5.3.4 (D5): one surface, two shells — a centred dialog on desktop and a
 * bottom sheet on a phone (theme rule: `drawer/sheet umjesto dialoga` on the
 * mobile breakpoint). Both are Radix dialogs, so Escape, the focus trap and the
 * aria wiring come from the primitive instead of hand-rolled handlers.
 */
export function ResponsiveSurface({
  open,
  onOpenChange,
  title,
  description,
  children,
  testId,
  contentClassName,
}: ResponsiveSurfaceProperties) {
  const isCompact = useIsCompactViewport();

  if (isCompact) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          data-testid={testId}
          className={cn(
            "flex max-h-[92dvh] flex-col overflow-hidden rounded-t-xl p-0",
            contentClassName,
          )}
        >
          <div className="border-b border-border/70 px-4 py-3">
            <SheetTitle className="text-[14px] font-semibold leading-5 text-foreground">
              {title}
            </SheetTitle>
            {description === undefined ? null : (
              <SheetDescription className="mt-1 text-[12.5px] leading-5 text-muted-foreground">
                {description}
              </SheetDescription>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
            {children}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        data-testid={testId}
        className={cn("flex max-w-lg flex-col p-0", contentClassName)}
      >
        <div className="border-b border-border/70 px-5 py-4">
          <ModalTitle className="text-[14px] font-semibold leading-5 text-foreground">
            {title}
          </ModalTitle>
          {description === undefined ? null : (
            <ModalDescription className="mt-1 text-[12.5px] leading-5 text-muted-foreground">
              {description}
            </ModalDescription>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {children}
        </div>
      </ModalContent>
    </Modal>
  );
}
