import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface WizardStep {
  readonly key: string;
  readonly label: string;
}

interface WizardStepperProperties {
  readonly steps: readonly WizardStep[];
  readonly activeIndex: number;
}

export function WizardStepper({ steps, activeIndex }: WizardStepperProperties) {
  return (
    <ol className="mb-5 flex flex-wrap items-center gap-2">
      {steps.map((step, index) => {
        const isComplete = index < activeIndex;
        const isActive = index === activeIndex;
        return (
          <li key={step.key} className="flex items-center gap-2">
            {index > 0 ? (
              <span className="mx-1 h-px w-6 bg-border" aria-hidden="true" />
            ) : null}
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-md border text-[11px] font-semibold tnum",
                isComplete &&
                  "border-success/40 bg-success/10 text-[#4ADE80]",
                isActive && "border-primary bg-primary text-primary-foreground",
                !isComplete &&
                  !isActive &&
                  "border-border bg-elevated/60 text-muted-foreground",
              )}
            >
              {isComplete ? <Check size={12} strokeWidth={2.4} /> : index + 1}
            </span>
            <span
              className={cn(
                "text-[12.5px] font-medium",
                isActive ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
