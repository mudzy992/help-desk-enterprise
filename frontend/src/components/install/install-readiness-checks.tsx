import { CircleCheck, CircleMinus, CircleX } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { installReadinessMessageKey } from "@/lib/install/install-readiness-copy";
import { isKnownInstallStepKey } from "@/lib/install/install-wizard-order";
import { cn } from "@/lib/utils";
import type { InstallReadinessCheck, InstallReadinessStatus } from "@/services/install-profile-api";
import type { InstallStepKey } from "@/services/install-step-key";

/*
  Install wizard v2 (F6.1): the readiness answers as a list. Shared by the
  provisioning screen and the refusal a finish can come back with, so the two
  never word the same check differently.

  The list is static on purpose: the icons are the backend's answer, not an
  animation, and `aria-live="polite"` reads a re-check to a screen reader without
  the screen moving on its own.
*/

const statusIcons: Record<InstallReadinessStatus, typeof CircleX> = {
  ok: CircleCheck,
  missing: CircleX,
  skipped: CircleMinus,
};

export function InstallReadinessList({
  checks,
  onFixStep,
}: {
  readonly checks: readonly InstallReadinessCheck[];
  readonly onFixStep: (stepKey: InstallStepKey) => void;
}) {
  return (
    <ul className="grid gap-2" aria-live="polite">
      {checks.map((check) => (
        <InstallReadinessRow key={check.key} check={check} onFixStep={onFixStep} />
      ))}
    </ul>
  );
}

function InstallReadinessRow({
  check,
  onFixStep,
}: {
  readonly check: InstallReadinessCheck;
  readonly onFixStep: (stepKey: InstallStepKey) => void;
}) {
  const { t } = useTranslation();
  const Icon = statusIcons[check.status] ?? CircleX;
  const messageKey = installReadinessMessageKey(check.key);
  // F6.1: a red check that no step can answer (the system roles) keeps its line
  // and loses its button — a link that goes nowhere is worse than none.
  const rawStepKey = check.status === "missing" ? (check.stepKey ?? null) : null;
  const stepKey = rawStepKey !== null && isKnownInstallStepKey(rawStepKey) ? rawStepKey : null;
  const statusWordKey =
    check.status === "missing"
      ? "install.provisioning.missing"
      : check.status === "ok"
        ? "install.provisioning.ok"
        : "install.provisioning.deferred";
  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-lg border px-3 py-2.5",
        check.status === "missing" ? "border-danger/40 bg-danger/5" : "border-border bg-surface",
      )}
    >
      <Icon
        aria-hidden="true"
        size={15}
        strokeWidth={2.2}
        className={cn(
          "shrink-0",
          check.status === "ok"
            ? "text-ok"
            : check.status === "missing"
              ? "text-danger"
              : "text-muted-foreground",
        )}
      />
      {/* The icon carries the status visually; a screen reader gets the word. */}
      <span className="sr-only">{`${t(statusWordKey)}: `}</span>
      <span className="min-w-0 flex-1 text-[12.5px] leading-5 text-foreground">
        {messageKey === null ? check.key : t(messageKey)}
      </span>
      {stepKey === null ? null : (
        <Button type="button" variant="outline" size="sm" onClick={() => onFixStep(stepKey)}>
          {t("install.provisioning.goToStep")}
        </Button>
      )}
    </li>
  );
}

/** The checks behind a refused finish, in the wording the readiness check uses. */
export function MissingChecksList({ checkKeys }: { readonly checkKeys: readonly string[] }) {
  const { t } = useTranslation();
  if (checkKeys.length === 0) return null;
  return (
    <ul className="list-disc space-y-0.5 pl-4 text-[12px] leading-5 text-muted-foreground">
      {checkKeys.map((checkKey) => {
        const messageKey = installReadinessMessageKey(checkKey);
        return <li key={checkKey}>{messageKey === null ? checkKey : t(messageKey)}</li>;
      })}
    </ul>
  );
}
