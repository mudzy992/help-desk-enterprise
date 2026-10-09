import { ArrowLeft, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { setDocumentTitle } from "@/lib/a11y/document-title";
import { BrandMark } from "@/components/layout/brand-mark";
import { useBranding } from "@/lib/branding/branding-store";
import { MarkdownView } from "@/components/privacy/markdown-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { hintClassName } from "@/components/ui/control";
import { Segmented } from "@/components/ui/segmented";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useLocale } from "@/i18n/use-locale";
import { ApiError } from "@/services/api";
import { getPrivacyNotice, type PrivacyNotice } from "@/services/privacy-api";
import { readStoredSession } from "@/services/session-store";

/**
 * Paket 2.6 (§8, ZZLP čl. 15–16): the public privacy notice — reachable
 * without signing in (login page link) and from the profile menu.
 */
export function PrivacyNoticePage() {
  const { t } = useTranslation();
  const { appName } = useBranding();
  const { locale, changeLocale } = useLocale();
  const [notice, setNotice] = useState<PrivacyNotice | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "disabled" | "failed">("loading");
  const signedIn = readStoredSession() !== null;

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    getPrivacyNotice(locale)
      .then((loaded) => {
        if (cancelled) return;
        setNotice(loaded);
        setState("ready");
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setState(caught instanceof ApiError && caught.code === "PRIVACY_DISABLED" ? "disabled" : "failed");
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  useEffect(() => {
    setDocumentTitle(t("privacy.notice.title"));
  }, [t]);

  return (
    <div className="page-in min-h-screen bg-background">
      <header className="border-b border-border/70 bg-surface print:hidden">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-5 py-3">
          <Link to={signedIn ? "/" : "/login"} className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
            <BrandMark size={26} className="shadow-none" />
            {appName}
          </Link>
          <div className="flex items-center gap-2">
            <Segmented
              size="sm"
              ariaLabel={t("privacy.record.language")}
              value={locale === "en" ? "en" : "bs"}
              onChange={(value) => void changeLocale(value)}
              items={[
                { value: "bs", label: "BS" },
                { value: "en", label: "EN" },
              ]}
            />
            <Button size="sm" variant="ghost" onClick={() => window.print()} aria-label={t("privacy.record.print")}>
              <Printer size={14} />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-8" data-testid="privacy-notice-page">
        {state === "loading" ? (
          <PanelSkeleton className="mt-0" label={t("privacy.notice.title")} />
        ) : state === "ready" && notice !== null ? (
          <article data-testid="privacy-notice-content" className="rounded-lg border border-border bg-surface p-6 shadow-card print:border-0 print:p-0 print:shadow-none">
            {notice.draft ? (
              <Badge tone="warning" dot data-testid="privacy-notice-draft-badge" className="mb-3">
                {t("privacy.notice.draftBadge")}
              </Badge>
            ) : null}
            {notice.fallbackLocale ? (
              <p className={`${hintClassName} mb-3`}>{t("privacy.notice.fallbackLocale")}</p>
            ) : null}
            <MarkdownView source={notice.markdown} />
          </article>
        ) : (
          <div data-testid="privacy-notice-unavailable" data-state={state} className="rounded-lg border border-border bg-surface p-6 text-[13px] text-foreground/90">
            <h1 className="mb-2 text-[16px] font-semibold text-foreground">{t("privacy.notice.title")}</h1>
            <p>{state === "disabled" ? t("privacy.notice.unavailable") : t("privacy.notice.failed")}</p>
          </div>
        )}
        <p className="mt-6 print:hidden">
          <Link to={signedIn ? "/" : "/login"} className="inline-flex items-center gap-1.5 text-[12.5px] text-link hover:underline">
            <ArrowLeft size={13} /> {signedIn ? t("privacy.notice.backToApp") : t("privacy.notice.backToLogin")}
          </Link>
        </p>
      </main>
    </div>
  );
}
