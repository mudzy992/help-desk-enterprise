import { useEffect } from "react";
import { useBranding } from "@/lib/branding/branding-store";
import { useTranslation } from "react-i18next";

/**
 * Paket 2.5 (design §6): „Izvezi PDF” = the browser print dialog with a print
 * layout. The page always prints in the light Pulse palette, whatever theme is
 * active (also for Ctrl+P), and the previous theme is restored afterwards.
 */
export function useLightPrintTheme(): void {
  useEffect(() => {
    const root = document.documentElement;
    let saved: { theme: string | undefined; dark: boolean } | null = null;
    const before = () => {
      if (saved !== null) return;
      saved = { theme: root.dataset.theme, dark: root.classList.contains("dark") };
      root.dataset.theme = "pulse";
      root.classList.remove("dark");
    };
    const after = () => {
      if (saved === null) return;
      if (saved.theme === undefined) delete root.dataset.theme;
      else root.dataset.theme = saved.theme;
      root.classList.toggle("dark", saved.dark);
      saved = null;
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
      after();
    };
  }, []);
}

interface ReportPrintHeaderProperties {
  readonly title: string;
  readonly scope: string;
  readonly period: string;
  readonly generatedBy: string | null;
}

/** Only visible on paper: organisation, scope, period, time and author. */
export function ReportPrintHeader({ title, scope, period, generatedBy }: ReportPrintHeaderProperties) {
  const { t, i18n } = useTranslation();
  const branding = useBranding();
  return (
    <div className="mb-4 hidden border-b border-border pb-3 print:block" data-testid="report-print-header">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{branding.organizationName || branding.appName}</p>
      <h1 className="mt-0.5 text-[18px] font-semibold text-foreground">{title}</h1>
      <p className="mt-1 text-[12px] text-foreground">
        {t("reports.print.scope")}: {scope}
      </p>
      <p className="text-[12px] text-foreground">
        {t("reports.print.period")}: {period}
      </p>
      <p className="text-[11px] text-muted-foreground">
        {t("reports.print.generated", {
          when: new Date().toLocaleString(i18n.language),
          who: generatedBy ?? "—",
        })}
      </p>
    </div>
  );
}
