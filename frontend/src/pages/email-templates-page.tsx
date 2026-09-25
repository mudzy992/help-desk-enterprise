import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Warning } from "@/components/settings/email-templates-card";
import { EmailTemplatesEditor } from "@/components/settings/email-templates-editor";
import { PageHeader } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { permissionKeys } from "@/lib/session/permission-keys";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import { getEmailTemplates, type EmailTemplatesOverview } from "@/services/email-templates-api";

/**
 * Paket 1.5: full-width editor (fields + live preview side by side). The
 * settings card links here; access mirrors the settings page (admin roles),
 * saving additionally needs `settings.write`.
 */
export function EmailTemplatesPage() {
  const { t } = useTranslation();
  const { session, hasPermission } = useSessionCapabilities();
  const canWrite = session?.isSuperAdmin === true || hasPermission(permissionKeys.settingsWrite);
  const [overview, setOverview] = useState<EmailTemplatesOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setOverview(await getEmailTemplates());
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <PageHeader
        crumbs={["EP-HelpDesk", t("navigation.settings"), t("settings.emailTemplates.title")]}
        title={t("settings.emailTemplates.editorTitle")}
        subtitle={t("settings.emailTemplates.editorDescription")}
      />
      <Link
        to="/admin?tab=settings"
        className="inline-flex items-center gap-1.5 text-[12.5px] text-link hover:underline"
      >
        <ArrowLeft size={13} />
        {t("settings.emailTemplates.backToSettings")}
      </Link>
      {error !== null ? <p className="text-[12.5px] text-danger">{error}</p> : null}
      {overview === null && error === null ? (
        <PanelSkeleton label={t("settings.emailTemplates.loading")} />
      ) : null}
      {overview !== null ? (
        <>
          {!overview.delivery.publicUrlConfigured ? (
            <Warning text={t("settings.emailTemplates.publicUrlWarning")} />
          ) : null}
          <EmailTemplatesEditor overview={overview} canWrite={canWrite} onSaved={setOverview} />
        </>
      ) : null}
    </div>
  );
}
