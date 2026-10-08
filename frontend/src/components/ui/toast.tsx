import { AlertTriangle, Check, CheckCircle2, Copy, Info, X, XCircle } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import {
  enqueueToast,
  removeToast,
  resolveToastDuration,
  visibleToasts,
  type ToastAction,
  type ToastRecord,
  type ToastTone,
} from "@/lib/feedback/toast-queue";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api";

export type { ToastTone } from "@/lib/feedback/toast-queue";

export interface ToastInput {
  readonly tone?: ToastTone;
  readonly title: string;
  readonly description?: string;
  /** Milliseconds; `0` keeps the toast until it is dismissed. Default depends on the tone. */
  readonly duration?: number;
  /** One follow-up action ("Undo", "Open"); the toast closes after it runs. */
  readonly action?: ToastAction;
  /** The caught error: an `ApiError` contributes its request ID (copyable). */
  readonly error?: unknown;
  /** Explicit request ID when there is no error object at hand. */
  readonly requestId?: string | null;
}

interface ToastContextValue {
  /** Shows a toast and returns its id (an identical visible message is merged). */
  readonly toast: (input: ToastInput) => number;
  readonly dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let toastSequence = 0;

const TOAST_TONES: Record<ToastTone, { readonly icon: ReactNode; readonly accent: string }> = {
  info: { icon: <Info size={15} aria-hidden="true" />, accent: "text-info" },
  success: { icon: <CheckCircle2 size={15} aria-hidden="true" />, accent: "text-ok" },
  warning: { icon: <AlertTriangle size={15} aria-hidden="true" />, accent: "text-warning" },
  danger: { icon: <XCircle size={15} aria-hidden="true" />, accent: "text-danger" },
};

function readRequestId(input: ToastInput): string | undefined {
  if (input.requestId) return input.requestId;
  if (input.error instanceof ApiError && input.error.requestId) return input.error.requestId;
  return undefined;
}

/**
 * Paket 5.3.0 (D2): the one toast surface of the application.
 *
 * Discipline (`.cursor/rules/frontend-ui-ux.mdc`, Constitution §32): a toast
 * reports the outcome of a user-initiated action. Realtime updates do NOT raise
 * one, and a form's validation error stays inline next to the field.
 *
 * Behaviour: identical messages merge (×N), at most three are on screen (the
 * rest queue), timers pause while the pointer or keyboard focus is on the
 * stack, errors stay 10 s and carry a copyable request ID.
 */
export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [queue, setQueue] = useState<readonly ToastRecord[]>([]);

  const dismiss = useCallback((id: number) => {
    setQueue((previous) => removeToast(previous, id));
  }, []);

  const toast = useCallback((input: ToastInput) => {
    toastSequence += 1;
    const tone = input.tone ?? "info";
    let resolvedId = toastSequence;
    const candidate = {
      id: toastSequence,
      tone,
      title: input.title,
      description: input.description,
      requestId: readRequestId(input),
      action: input.action,
      duration: resolveToastDuration(tone, input.duration),
    };
    setQueue((previous) => {
      const next = enqueueToast(previous, candidate);
      resolvedId = next.id;
      return next.queue;
    });
    return resolvedId;
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster queue={queue} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function Toaster({
  queue,
  onDismiss,
}: {
  readonly queue: readonly ToastRecord[];
  readonly onDismiss: (id: number) => void;
}) {
  const { t } = useTranslation();
  const [isPaused, setIsPaused] = useState(false);
  const visible = visibleToasts(queue);
  const waiting = queue.length - visible.length;

  // Region stays mounted (empty) so screen readers register the live region
  // before the first message arrives.
  return (
    <section
      aria-label={t("ui.toast.region")}
      data-testid="toast-region"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsPaused(false);
      }}
      className={cn(
        "pointer-events-none fixed z-[80] flex flex-col gap-2",
        // Mobile: centred above the safe area; ≥ sm: bottom-right corner.
        "inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))]",
        "sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[22rem]",
      )}
    >
      {visible.map((record) => (
        <ToastCard key={record.id} record={record} isPaused={isPaused} onDismiss={onDismiss} />
      ))}
      {waiting > 0 ? (
        <p className="pointer-events-auto self-end rounded-md border border-border bg-popover px-2 py-0.5 text-[11px] text-muted-foreground shadow-pop tnum">
          {t("ui.toast.queued", { count: waiting })}
        </p>
      ) : null}
    </section>
  );
}

function ToastCard({
  record,
  isPaused,
  onDismiss,
}: {
  readonly record: ToastRecord;
  readonly isPaused: boolean;
  readonly onDismiss: (id: number) => void;
}) {
  const { t } = useTranslation();
  const meta = TOAST_TONES[record.tone];
  const remaining = useRef(record.duration);
  const startedAt = useRef(0);
  const [copied, setCopied] = useState(false);

  // A merged duplicate restarts the full duration.
  useEffect(() => {
    remaining.current = record.duration;
  }, [record.revision, record.duration]);

  useEffect(() => {
    if (record.duration <= 0 || isPaused) return undefined;
    startedAt.current = Date.now();
    const timer = window.setTimeout(() => onDismiss(record.id), Math.max(remaining.current, 0));
    return () => {
      window.clearTimeout(timer);
      remaining.current -= Date.now() - startedAt.current;
    };
  }, [isPaused, record.duration, record.id, record.revision, onDismiss]);

  const isUrgent = record.tone === "danger" || record.tone === "warning";

  const copyRequestId = () => {
    if (!record.requestId) return;
    void navigator.clipboard?.writeText(record.requestId).then(() => setCopied(true), () => undefined);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onDismiss(record.id);
    }
  };

  return (
    <div
      role={isUrgent ? "alert" : "status"}
      aria-live={isUrgent ? "assertive" : "polite"}
      aria-atomic="true"
      data-testid="toast"
      data-tone={record.tone}
      onKeyDown={onKeyDown}
      className="pointer-events-auto pop-in flex items-start gap-2.5 rounded-lg border border-border bg-popover px-3.5 py-3 shadow-pop"
    >
      <span className={cn("mt-0.5 shrink-0", meta.accent)}>{meta.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="break-words text-[12.5px] font-medium leading-4 text-foreground">
          {record.title}
          {record.count > 1 ? (
            <span className="ml-1.5 rounded bg-elevated px-1 text-[10.5px] font-semibold text-muted-foreground tnum" aria-label={t("ui.toast.repeated", { count: record.count })}>
              ×{record.count}
            </span>
          ) : null}
        </p>
        {record.description ? (
          <p className="mt-0.5 break-words text-[11.5px] leading-4 text-muted-foreground">{record.description}</p>
        ) : null}
        {record.requestId ? (
          <button
            type="button"
            onClick={copyRequestId}
            className="mt-1 inline-flex max-w-full items-center gap-1 rounded text-[11px] text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70"
            aria-label={t("ui.toast.copyRequestId", { requestId: record.requestId })}
          >
            {copied ? <Check size={11} aria-hidden="true" /> : <Copy size={11} aria-hidden="true" />}
            <span className="truncate font-mono">{copied ? t("ui.toast.copied") : t("errors.requestId", { requestId: record.requestId })}</span>
          </button>
        ) : null}
        {record.action ? (
          <button
            type="button"
            onClick={() => {
              record.action?.onClick();
              onDismiss(record.id);
            }}
            className="mt-1.5 rounded text-[12px] font-medium text-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70"
          >
            {record.action.label}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        aria-label={t("ui.dismiss")}
        onClick={() => onDismiss(record.id)}
        className="-mr-1 -mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-surface-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70"
      >
        <X size={13} aria-hidden="true" />
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (context === null) {
    throw new Error("useToast must be used inside a ToastProvider");
  }
  return context;
}
