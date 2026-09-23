import { Check, Minus } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useRef,
  type ForwardedRef,
  type InputHTMLAttributes,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/*
  Pulse checkbox.

  A real `<input type="checkbox">` stays underneath for form semantics and
  accessibility, but it is restyled with `appearance-none` — `accent-color`
  cannot be tokenised and would be the only hard-coded colour in the module.
  The tick is a sibling icon driven by `peer-checked`, so state changes animate
  without JavaScript and keyboard focus keeps its own ring.
*/

function assignReference(
  reference: ForwardedRef<HTMLInputElement>,
  value: HTMLInputElement | null,
) {
  if (typeof reference === "function") {
    reference(value);
    return;
  }
  if (reference !== null) {
    (reference as MutableRefObject<HTMLInputElement | null>).current = value;
  }
}

export interface CheckboxProperties
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  readonly label?: ReactNode;
  /** Mixed state — used by the "select all" control in list headers. */
  readonly indeterminate?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProperties>(
  ({ className, label, indeterminate = false, ...properties }, reference) => {
    const inputReference = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
      if (inputReference.current !== null) {
        inputReference.current.indeterminate = indeterminate;
      }
    }, [indeterminate]);

    return (
      <label
        className={cn(
          "inline-flex select-none items-center gap-2",
          properties.disabled === true ? "cursor-not-allowed" : "cursor-pointer",
          className,
        )}
      >
        <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
          <input
            ref={(node) => {
              inputReference.current = node;
              assignReference(reference, node);
            }}
            type="checkbox"
            className="peer size-4 cursor-pointer appearance-none rounded-[5px] border border-line-strong bg-surface transition-colors duration-150 checked:border-primary checked:bg-primary hover:border-primary/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70 disabled:cursor-not-allowed disabled:opacity-45"
            {...properties}
          />
          {indeterminate ? (
            <Minus
              size={11}
              strokeWidth={3}
              className="pointer-events-none absolute text-primary-foreground"
              aria-hidden="true"
            />
          ) : (
            <Check
              size={11}
              strokeWidth={3}
              className="pointer-events-none absolute scale-50 text-primary-foreground opacity-0 transition-all duration-150 peer-checked:scale-100 peer-checked:opacity-100"
              aria-hidden="true"
            />
          )}
        </span>
        {label === undefined ? null : (
          <span className="text-[12.5px] leading-4 text-foreground">{label}</span>
        )}
      </label>
    );
  },
);

Checkbox.displayName = "Checkbox";
