import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { ActionFeedback } from "@/lib/feedback/use-action-feedback";

interface ActionFeedbackBannerProperties {
  readonly feedback: ActionFeedback | null;
  readonly onDismiss: () => void;
}

const toneClassNames: Record<ActionFeedback["tone"], string> = {
  success: "border-success/35 bg-success/10 text-success",
  info: "border-primary/35 bg-primary/10 text-[#7FA8F5]",
  warning: "border-warning/35 bg-warning/10 text-warning",
  error: "border-danger/35 bg-danger/10 text-danger",
};

const toneIcons: Record<ActionFeedback["tone"], typeof CheckCircle2> = {
  success: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
  error: XCircle,
};

/**
 * Renders whatever `useActionFeedback` currently holds. Sits above the
 * content it describes and never replaces it — an error here still leaves
 * the list/panel intact (Constitution §30). Intentionally the only consumer
 * of the seam's state; F7 swaps this component out for the toast stack
 * without changing `notify()` call sites.
 */
export function ActionFeedbackBanner({ feedback, onDismiss }: ActionFeedbackBannerProperties) {
  const { t } = useTranslation();
  if (feedback === null) {
    return null;
  }
  const Icon = toneIcons[feedback.tone];
  const role = feedback.tone === "error" || feedback.tone === "warning" ? "alert" : "status";
  return (
    <div
      role={role}
      aria-live={role === "alert" ? "assertive" : "polite"}
      className={cn(
        "mb-3 flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-[12.5px] leading-5",
        toneClassNames[feedback.tone],
      )}
    >
      <Icon size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        {t(feedback.key as never, (feedback.params ?? {}) as never) as unknown as string}
      </p>
      {feedback.action ? (
        <button
          type="button"
          onClick={feedback.action.onClick}
          className="shrink-0 font-medium underline-offset-2 hover:underline"
        >
          {feedback.action.label}
        </button>
      ) : null}
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t("feedback.dismiss")}
        className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100"
      >
        <X size={13} aria-hidden="true" />
      </button>
    </div>
  );
}
