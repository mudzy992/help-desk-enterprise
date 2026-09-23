import * as SwitchPrimitive from "@radix-ui/react-switch";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import { cn } from "@/lib/utils";

/*
  Track contrast is the thing that breaks in a light theme: an `elevated`
  track is invisible on a white card. `border` reads as a real track in every
  theme, and the thumb keeps a hairline shadow so it stays separable.
*/
export const Switch = forwardRef<
  ElementRef<typeof SwitchPrimitive.Root>,
  ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...properties }, reference) => (
  <SwitchPrimitive.Root
    className={cn(
      "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-150",
      "data-[state=checked]:border-primary data-[state=checked]:bg-primary",
      "data-[state=unchecked]:border-border data-[state=unchecked]:bg-border",
      "disabled:cursor-not-allowed disabled:opacity-45",
      className,
    )}
    {...properties}
    ref={reference}
  >
    <SwitchPrimitive.Thumb className="pointer-events-none block size-3.5 rounded-full bg-white shadow-sm transition-transform duration-150 data-[state=checked]:translate-x-[18px] data-[state=unchecked]:translate-x-[3px]" />
  </SwitchPrimitive.Root>
));

Switch.displayName = SwitchPrimitive.Root.displayName;
