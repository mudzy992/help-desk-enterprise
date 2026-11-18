import { useTranslation } from "react-i18next";
import { hintClassName } from "@/components/ui/control";

/**
 * BA-problems-17: a bounded list is a window, and the screen says so instead of
 * letting the reader believe the list is complete. `total` is shown when the
 * server counts the real number (linked tickets); otherwise only the window size
 * is stated, because that is all we know for certain.
 */
export function ListTruncationNote({
  count,
  total,
  testId,
}: {
  readonly count: number;
  readonly total?: number;
  readonly testId?: string;
}) {
  const { t } = useTranslation();
  return (
    <p className={hintClassName} data-testid={testId ?? "list-truncation-note"}>
      {total === undefined
        ? t("problems.lists.capped", { count })
        : t("problems.lists.cappedOfTotal", { count, total })}
    </p>
  );
}
