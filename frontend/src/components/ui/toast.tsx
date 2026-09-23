import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import type { BadgeTone } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type ToastTone = Extract<BadgeTone, "info" | "success" | "warning" | "danger">;

export interface ToastInput {
  readonly tone?: ToastTone;
  readonly title: string;
  readonly description?: string;
  /** Milliseconds; `0` keeps the toast until it is dismissed. */
  readonly duration?: number;
}

interface ToastRecord extends Required<Omit<ToastInput, "description">> {
  readonly id: number;
  readonly description?: string;
}

interface ToastContextValue {
  readonly toast: (input: ToastInput) => void;
  readonly dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 5000;

let toastSequence = 0;

const TOAST_TONES: Record<ToastTone, { readonly icon: ReactNode; readonly className: string }> = {
  info: { icon: <Info size={15} />, className: "text-info" },
  success: { icon: <CheckCircle2 size={15} />, className: "text-ok" },
  warning: { icon: <AlertTriangle size={15} />, className: "text-warning" },
  danger: { icon: <XCircle size={15} />, className: "text-danger" },
};

/**
 * Discrete, non-blocking confirmations. Realtime updates deliberately do NOT
 * raise a toast (see `.cursor/rules/frontend-ui-ux.mdc`) — this surface is for
 * the outcome of a user-initiated action.
 */
export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly ToastRecord[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((previous) => previous.filter((record) => record.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      toastSequence += 1;
      const record: ToastRecord = {
        id: toastSequence,
        tone: input.tone ?? "info",
        title: input.title,
        description: input.description,
        duration: input.duration ?? DEFAULT_DURATION,
      };
      setToasts((previous) => [...previous, record]);
    },
    [],
  );

  useEffect(() => {
    for (const record of toasts) {
      if (record.duration <= 0 || timers.current.has(record.id)) {
        continue;
      }
      timers.current.set(
        record.id,
        setTimeout(() => dismiss(record.id), record.duration),
      );
    }
  }, [toasts, dismiss]);

  useEffect(() => {
    const scheduled = timers.current;
    return () => {
      for (const timer of scheduled.values()) {
        clearTimeout(timer);
      }
      scheduled.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function Toaster({
  toasts,
  onDismiss,
}: {
  readonly toasts: readonly ToastRecord[];
  readonly onDismiss: (id: number) => void;
}) {
  const { t } = useTranslation();

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
    >
      {toasts.map((record) => {
        const meta = TOAST_TONES[record.tone];
        return (
          <div
            key={record.id}
            role="status"
            className="pointer-events-auto pop-in flex items-start gap-2.5 rounded-lg border border-border bg-popover px-3.5 py-3 shadow-pop"
          >
            <span className={cn("mt-0.5 shrink-0", meta.className)}>{meta.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-medium leading-4 text-foreground">
                {record.title}
              </p>
              {record.description ? (
                <p className="mt-0.5 text-[11.5px] leading-4 text-muted-foreground">
                  {record.description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              aria-label={t("ui.dismiss")}
              onClick={() => onDismiss(record.id)}
              className="-mr-0.5 shrink-0 rounded-md p-1 text-muted-foreground transition-colors duration-150 hover:bg-surface-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
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
