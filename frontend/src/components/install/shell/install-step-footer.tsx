import { ArrowLeft, ArrowRight, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

/*
  Install wizard v2 — „Aurora“: one footer for every step — „Nazad“, „Podesi
  kasnije“ and „Nastavi“.

  The step itself owns its primary action (each form has its own „Sačuvaj“
  button), so this footer never saves anything: it moves through the wizard and
  it defers, and „Podesi kasnije“ only appears for a step the registry marks
  `skippable` (`skippable` comes from the status endpoint, not from a list
  copied into the UI). Every control here is `type="button"` — the step's own
  submit button has to stay the first `form button[type="submit"]` on the page
  (the E2E harness clicks exactly that).
*/

export function InstallStepFooter({
  canGoBack,
  onBack,
  isDeferred,
  canDefer,
  isDeferring,
  onDefer,
  onUndoDefer,
  onContinue,
  isContinueVisible,
}: {
  readonly canGoBack: boolean;
  readonly onBack: () => void;
  readonly isDeferred: boolean;
  readonly canDefer: boolean;
  readonly isDeferring: boolean;
  readonly onDefer: () => void;
  readonly onUndoDefer: () => void;
  readonly onContinue: () => void;
  readonly isContinueVisible: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="mt-7 flex flex-wrap items-center gap-2 border-t border-border pt-4">
      {canGoBack ? (
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft size={14} strokeWidth={2.2} />
          {t("install.shell.back")}
        </Button>
      ) : null}

      <span className="ml-auto flex items-center gap-2">
        {canDefer ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isDeferring}
            onClick={isDeferred ? onUndoDefer : onDefer}
          >
            <Clock size={14} strokeWidth={2.2} />
            {isDeferred ? t("install.step.undoSkip") : t("install.shell.later")}
          </Button>
        ) : null}
        {isContinueVisible ? (
          <Button type="button" size="sm" onClick={onContinue}>
            {t("install.shell.continue")}
            <ArrowRight size={14} strokeWidth={2.2} />
          </Button>
        ) : null}
      </span>
    </div>
  );
}
