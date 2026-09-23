import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Seam for action-level feedback (task 1 of F2, `04-FAZNI-PLAN` §F2).
 *
 * This is deliberately not a toast: F7 owns the real notification stack
 * (`ToastProvider`, dedupe, `notification.created`). Until then, call sites
 * use this hook and `<ActionFeedbackBanner>` so a claim/save/etc. always has
 * a visible, contextual result (Constitution §30) without ever replacing the
 * surrounding list or panel with an error screen. When F7 lands, `notify`
 * keeps its signature and only the rendering swaps to `toast.*`.
 */
export type ActionFeedbackTone = "success" | "info" | "warning" | "error";

export type ActionFeedbackAction = {
  readonly label: string;
  readonly onClick: () => void;
};

export type ActionFeedback = {
  readonly id: number;
  readonly tone: ActionFeedbackTone;
  /** i18n key (e.g. an existing `TicketErrorKey` or a `tickets.*Success` key). */
  readonly key: string;
  readonly params?: Record<string, string | number>;
  readonly action?: ActionFeedbackAction;
};

export type NotifyOptions = {
  readonly params?: Record<string, string | number>;
  readonly action?: ActionFeedbackAction;
  /** Defaults to 4s for success/info/warning, 6s for error; 0 disables auto-dismiss. */
  readonly durationMs?: number;
};

const defaultDurationMs: Record<ActionFeedbackTone, number> = {
  success: 4000,
  info: 4000,
  warning: 5000,
  error: 6000,
};

export interface ActionFeedbackController {
  readonly feedback: ActionFeedback | null;
  readonly notify: (
    tone: ActionFeedbackTone,
    key: string,
    options?: NotifyOptions,
  ) => void;
  readonly dismiss: () => void;
}

export function useActionFeedback(): ActionFeedbackController {
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const nextId = useRef(0);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearTimer();
    setFeedback(null);
  }, [clearTimer]);

  const notify = useCallback(
    (tone: ActionFeedbackTone, key: string, options?: NotifyOptions) => {
      clearTimer();
      nextId.current += 1;
      const id = nextId.current;
      setFeedback({ id, tone, key, params: options?.params, action: options?.action });
      const duration = options?.durationMs ?? defaultDurationMs[tone];
      if (duration > 0) {
        timeoutRef.current = window.setTimeout(() => {
          setFeedback((current) => (current?.id === id ? null : current));
          timeoutRef.current = null;
        }, duration);
      }
    },
    [clearTimer],
  );

  useEffect(() => clearTimer, [clearTimer]);

  return { feedback, notify, dismiss };
}
