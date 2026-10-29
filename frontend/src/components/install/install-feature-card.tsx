import { Check, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

/*
  Install wizard v2 (F3): the shared feature card. One shape for every „what is
  in this package / what does this add-on do“ decision, so the package picker
  (F3), the add-ons step (F4), the Full sections (F5) and the final screen (F6)
  look like the same product.

  Three states, and the card never fakes a fourth:
  - `switch` — the operator may turn it on or off;
  - `locked` — it is part of the package, with the reason next to it;
  - `included` — it comes with the package and this wizard has nothing to ask.
  A dependency (`requires`) wins over the switch: an add-on that needs SMTP shows
  a disabled switch and the reason instead of a control that cannot work.
*/

export type InstallFeatureCardProperties = {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly description?: string;
  readonly badges?: readonly string[];
  readonly control?: "switch" | "locked" | "included";
  readonly checked?: boolean;
  /** Shown next to a disabled switch; the switch is dead as soon as it is set. */
  readonly disabledReason?: string;
  /** Freezes the switch while the step is saving (`disabledReason` unexplained). */
  readonly isDisabled?: boolean;
  readonly onCheckedChange?: (checked: boolean) => void;
  readonly footer?: ReactNode;
  readonly isRecommended?: boolean;
  readonly className?: string;
};

export function InstallFeatureCard({
  icon: Icon,
  title,
  description,
  badges = [],
  control = "included",
  checked = false,
  disabledReason,
  isDisabled = false,
  onCheckedChange,
  footer,
  isRecommended = false,
  className,
}: InstallFeatureCardProperties) {
  const { t } = useTranslation();
  const isSwitchDisabled = control === "switch" && (disabledReason !== undefined || isDisabled);
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface p-3.5 shadow-card",
        isRecommended && "border-primary/40",
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-link">
          <Icon size={15} strokeWidth={2.1} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold tracking-[-0.01em] text-foreground">{title}</p>
          {description !== undefined ? (
            <p className="mt-1 text-[12px] leading-5 text-muted-foreground">{description}</p>
          ) : null}
          {badges.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {badges.map((badge) => (
                <li
                  key={badge}
                  className="rounded-md border border-border bg-elevated px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground"
                >
                  {badge}
                </li>
              ))}
            </ul>
          ) : null}
          {disabledReason !== undefined ? (
            <p className="mt-2 text-[11.5px] text-warning">{disabledReason}</p>
          ) : null}
        </div>
        {control === "switch" ? (
          <Switch
            checked={checked}
            disabled={isSwitchDisabled}
            onCheckedChange={onCheckedChange}
            aria-label={title}
          />
        ) : control === "locked" ? (
          <span className="shrink-0 rounded-md border border-border bg-elevated px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground">
            {t("install.feature.locked")}
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-1 text-[10.5px] font-medium text-ok">
            <Check size={12} strokeWidth={2.6} aria-hidden="true" />
            {t("install.feature.included")}
          </span>
        )}
      </div>
      {footer === undefined ? null : <div className="mt-3">{footer}</div>}
    </div>
  );
}
