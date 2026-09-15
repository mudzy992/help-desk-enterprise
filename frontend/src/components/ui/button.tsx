import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

const PRIMARY_BUTTON_CLASSES =
  "border border-primary bg-primary text-primary-foreground hover:bg-[#1D4FD8] active:bg-[#1B44BE]";
const DESTRUCTIVE_BUTTON_CLASSES =
  "border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20 active:bg-danger/25";
const SECONDARY_BUTTON_CLASSES =
  "border border-border/70 bg-elevated/60 text-foreground hover:border-border hover:bg-elevated";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium select-none transition-all duration-150 focus-visible:outline-2 focus-visible:outline-primary/70 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-[15px] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: PRIMARY_BUTTON_CLASSES,
        primary: PRIMARY_BUTTON_CLASSES,
        destructive: DESTRUCTIVE_BUTTON_CLASSES,
        danger: DESTRUCTIVE_BUTTON_CLASSES,
        outline:
          "border border-border bg-surface text-foreground hover:border-[#31405C] hover:bg-elevated active:bg-elevated",
        secondary: SECONDARY_BUTTON_CLASSES,
        subtle: SECONDARY_BUTTON_CLASSES,
        ghost:
          "border border-transparent text-muted-foreground hover:bg-elevated hover:text-foreground",
        link: "text-[#7FA8F5] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-3.5 text-[13px]",
        sm: "h-8 px-2.5 text-[12.5px]",
        xs: "h-[26px] px-2 text-[11.5px]",
        lg: "h-9 px-4 text-[13px]",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProperties
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  readonly asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProperties>(
  ({ className, variant, size, asChild = false, ...properties }, reference) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={reference}
        {...properties}
      />
    );
  },
);

Button.displayName = "Button";
