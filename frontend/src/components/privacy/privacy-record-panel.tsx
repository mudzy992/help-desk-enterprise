import { AlertTriangle, ExternalLink, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import { getProcessingRecord, type ProcessingRecord } from "@/services/privacy-api";
import { PanelIntro, useDateFormat } from "./privacy-shared";

const missingKey = (field: string) =>
  `privacy.record.missingFields.${field}` as "privacy.record.missingFields.name";

/**
 * Paket 2.6 (§8, §11): record of processing activities, generated from the
 * live configuration; printed or saved as PDF through the browser (as 2.5).
 */
export function PrivacyRecordPanel({ generatedBy }: { readonly generatedBy: string | null }) {
  const { t, i18n } = useTranslation();
  const format = useDateFormat();
  const [locale, setLocale] = useState<"bs" | "en">(i18n.language.startsWith("en") ? "en" : "bs");
  const [record, setRecord] = useState<ProcessingRecord | null>(null);
  const [error, setError] = useState<{ key: ApiErrorKey; requestId: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRecord(null);
    setError(null);
    getProcessingRecord(locale)
      .then((loaded) => !cancelled && setRecord(loaded))
      .catch(
        (caught: unknown) =>
          !cancelled && setError({ key: mapApiError(caught), requestId: readApiRequestId(caught) }),
      );
    return () => {
      cancelled = true;
    };
  }, [locale]);

  if (error !== null) return <ApiErrorText messageKey={error.key} requestId={error.requestId} />;

  return (
    <div data-testid="privacy-record">
      <div className="print:hidden">
        <PanelIntro
          actions={
            <>
              <Segmented
                size="sm"
                ariaLabel={t("privacy.record.language")}
                value={locale}
                onChange={setLocale}
                items={[
                  { value: "bs", label: "BS" },
                  { value: "en", label: "EN" },
                ]}
              />
              <Button size="sm" variant="outline" asChild>
                <Link to="/privacy-notice" target="_blank" rel="noopener">
                  <ExternalLink size={14} /> {t("privacy.record.openNotice")}
                </Link>
              </Button>
              <Button size="sm" variant="outline" disabled={record === null} onClick={() => window.print()} data-testid="privacy-record-print">
                <Printer size={14} /> {t("privacy.record.print")}
              </Button>
            </>
          }
        >
          {t("privacy.record.intro")}
        </PanelIntro>
      </div>

      {record === null ? (
        <PanelSkeleton className="mt-0" label={t("privacy.tabs.record")} />
      ) : (
        <article className="max-w-4xl rounded-lg border border-border bg-surface p-6 shadow-card print:border-0 print:p-0 print:shadow-none">
          {record.missing.length > 0 ? (
            <div
              className="mb-5 flex gap-2 rounded-md border border-warning/30 bg-warning/6 px-3 py-2.5 text-[12.5px] print:hidden"
              data-testid="privacy-record-missing"
            >
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
              <div>
                <p className="font-medium text-foreground">{t("privacy.record.missingTitle")}</p>
                <p className="text-foreground/90">
                  {record.missing.map((field) => t(missingKey(field), { defaultValue: field })).join(", ")}.{" "}
                  <Link to="/admin?tab=settings" className="text-link hover:underline">
                    {t("privacy.record.missingAction")}
                  </Link>
                </p>
              </div>
            </div>
          ) : null}
          <header className="mb-5 border-b border-border pb-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">EP-HelpDesk</p>
            <h2 className="mt-0.5 text-[18px] font-semibold text-foreground">{record.title}</h2>
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              {t("privacy.record.generated", { when: format.dateTime(record.generatedAt), who: generatedBy ?? "—" })}
            </p>
          </header>
          <div className="flex flex-col gap-5">
            {record.sections.map((section, index) => (
              <section key={section.key} className="break-inside-avoid">
                <h3 className="mb-2 text-[13.5px] font-semibold text-foreground">
                  {index + 1}. {section.title}
                </h3>
                <dl className="grid gap-x-4 gap-y-1.5 text-[12.5px] sm:grid-cols-[minmax(0,34%)_1fr]">
                  {section.rows.map((row) => (
                    <div key={row.label} className="contents">
                      <dt className="text-muted-foreground">{row.label}</dt>
                      <dd className="whitespace-pre-wrap break-words text-foreground">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </article>
      )}
    </div>
  );
}
