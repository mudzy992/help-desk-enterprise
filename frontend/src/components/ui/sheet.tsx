import * as SheetPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { type ComponentPropsWithoutRef, type ElementRef, forwardRef } from "react";
import { useTranslation } from "react-i18next";
import { floatingShadowClassName } from "@/components/ui/control";
import { cn } from "@/lib/utils";

export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;
export const SheetPortal = SheetPrimitive.Portal;
export const SheetTitle = SheetPrimitive.Title;
export const SheetDescription = SheetPrimitive.Description;

export const SheetOverlay = forwardRef<
  ElementRef<typeof SheetPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...properties }, reference) => (
  <SheetPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...properties}
    ref={reference}
  />
));
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

const sheetVariants = cva(
  `fixed z-50 gap-4 bg-surface ${floatingShadowClassName} transition ease-in-out data-[state=closed]:duration-200 data-[state=open]:duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out`,
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b border-border data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 border-t border-border data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-[270px] border-r border-border data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
        right:
          "inset-y-0 right-0 h-full w-full max-w-lg border-l border-border data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
      },
    },
    defaultVariants: {
      side: "right",
    },
  },
);

interface SheetContentProperties
  extends ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {}

export const SheetContent = forwardRef<
  ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProperties
>(({ side = "right", className, children, ...properties }, reference) => {
  const { t } = useTranslation();
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        ref={reference}
        className={cn(sheetVariants({ side }), className)}
        {...properties}
      >
        {children}
        <SheetPrimitive.Close className="absolute right-2 top-3.5 rounded-md p-1.5 text-muted-foreground transition-colors duration-150 hover:bg-elevated hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary/70">
          <X className="h-4 w-4" />
          <span className="sr-only">{t("shell.close")}</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  );
});
SheetContent.displayName = SheetPrimitive.Content.displayName;
