import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import {
  type ComponentPropsWithoutRef,
  type ElementRef,
  forwardRef,
} from "react";
import { floatingPanelClassName } from "@/components/ui/control";
import { cn } from "@/lib/utils";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;

export const DropdownMenuContent = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 6, ...properties }, reference) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={reference}
      sideOffset={sideOffset}
      className={cn(floatingPanelClassName, "z-50 min-w-[14rem] p-0", className)}
      {...properties}
    />
  </DropdownMenuPrimitive.Portal>
));
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

export const DropdownMenuLabel = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Label>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>
>(({ className, ...properties }, reference) => (
  <DropdownMenuPrimitive.Label
    ref={reference}
    className={cn(
      "px-3.5 pb-1 pt-2.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground",
      className,
    )}
    {...properties}
  />
));
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName;

export const DropdownMenuItem = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Item>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>
>(({ className, ...properties }, reference) => (
  <DropdownMenuPrimitive.Item
    ref={reference}
    className={cn(
      "flex cursor-pointer items-center gap-2 px-3.5 py-2 text-[12.5px] text-foreground/90 outline-none transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-primary/70",
      "focus:bg-surface-hover data-[highlighted]:bg-surface-hover",
      "data-[disabled]:pointer-events-none data-[disabled]:opacity-45",
      className,
    )}
    {...properties}
  />
));
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

export const DropdownMenuSeparator = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...properties }, reference) => (
  <DropdownMenuPrimitive.Separator
    ref={reference}
    className={cn("h-px bg-border/60", className)}
    {...properties}
  />
));
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;
