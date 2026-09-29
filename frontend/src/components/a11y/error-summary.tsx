import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

export interface ErrorSummaryItem {
  readonly fieldId: string;
  readonly message: string;
}

interface ErrorSummaryProperties {
  readonly items: readonly ErrorSummaryItem[];
  /** Change this value (e.g. submit attempt counter) to move focus to the summary. */
  readonly focusKey?: number;
}

/**
 * Error summary for long forms (2.8 §3.2): a list of links to invalid fields,
 * announced as an alert on each failed submit.
 */
export function ErrorSummary({ items, focusKey }: ErrorSummaryProperties) {
  const { t } = useTranslation();
  const reference = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusKey !== undefined && focusKey > 0 && items.length > 0) {
      reference.current?.focus();
    }
    // Focus only when a new submit attempt fails.
  }, [focusKey]);

  if (items.length === 0) {
    return null;
  }

  return (
    <div
      ref={reference}
      tabIndex={-1}
      role="alert"
      data-testid="form-error-summary"
      className="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2.5 text-[12.5px] text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <p className="font-medium text-danger">
        {t("a11y.errorSummary.title", { count: items.length })}
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {items.map((item) => (
          <li key={item.fieldId}>
            <a
              href={`#${item.fieldId}`}
              className="text-link underline-offset-2 hover:underline"
              onClick={(event) => {
                const field = document.getElementById(item.fieldId);
                if (field !== null) {
                  event.preventDefault();
                  field.focus();
                  field.scrollIntoView?.({ block: "center" });
                }
              }}
            >
              {item.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
