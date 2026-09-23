import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface WizardStep {
  readonly key: string;
  readonly label: string;
  readonly icon?: ReactNode;
}

interface WizardStepperProperties {
  readonly steps: readonly WizardStep[];
  readonly activeIndex: number;
}

export function WizardStepper({ steps, activeIndex }: WizardStepperProperties) {
  return (
    <ol className="mb-6 flex items-center gap-0">
      {steps.map((step, index) => {
        const isComplete = index < activeIndex;
        const isActive = index === activeIndex;
        return (
          <li
            key={step.key}
            className={cn(
              "flex items-center",
              index < steps.length - 1 ? "min-w-0 flex-1" : "flex-none",
            )}
          >
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold transition-all duration-150",
                  isComplete && "border-success/35 bg-success/10 text-ok",
                  isActive && "border-primary bg-primary text-primary-foreground shadow-glow",
                  !isComplete &&
                    !isActive &&
                    "border-border bg-surface-hover text-muted-foreground",
                )}
              >
                {isComplete ? (
                  <Check size={13} strokeWidth={2.4} />
                ) : step.icon !== undefined ? (
                  step.icon
                ) : (
                  <span>{index + 1}</span>
                )}
              </span>
              <span
                className={cn(
                  "whitespace-nowrap text-[12.5px] font-medium",
                  isActive
                    ? "text-foreground"
                    : isComplete
                      ? "text-foreground/80"
                      : "text-muted-foreground/70",
                )}
              >
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 ? (
              <span
                className={cn(
                  "mx-3 h-px min-w-4 flex-1",
                  isComplete ? "bg-success/40" : "bg-border",
                )}
                aria-hidden="true"
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
