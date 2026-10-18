import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { AdminModuleReadOnlyBanner } from "@/components/admin/admin-module-read-only-banner";
import { EmailTemplatesEditor } from "@/components/settings/email-templates-editor";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { Warning } from "@/components/ui/warning";
import { PageHeader, brandCrumb } from "@/components/layout/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import {
  adminReadOnlyModuleKeys,
  useAdminModuleReadOnly,
} from "@/lib/settings/use-admin-module-read-only";
import { canWriteSettings } from "@/lib/session/admin-access";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import { getEmailTemplates, type EmailTemplatesOverview } from "@/services/email-templates-api";

/** Full-width fields and server-rendered preview for notification templates. */
export function EmailTemplatesPage() {
  const { t } = useTranslation();
  const capabilities = useSessionCapabilities();
  const readOnly = useAdminModuleReadOnly(adminReadOnlyModuleKeys.settings);
  const canWrite = canWriteSettings(capabilities) && !readOnly.isLocked;
  const [overview, setOverview] = useState<EmailTemplatesOverview | null>(null);
  const [errorKey, setErrorKey] = useState<ApiErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setOverview(await getEmailTemplates());
      setErrorKey(null);
      setRequestId(null);
    } catch (loadError) {
      setErrorKey(mapApiError(loadError));
      setRequestId(readApiRequestId(loadError));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <PageHeader
        crumbs={[brandCrumb, t("navigation.settings"), t("settings.emailTemplates.title")]}
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
      <AdminModuleReadOnlyBanner visible={readOnly.isLocked} />
      {errorKey !== null ? (
        <div className="space-y-2">
          <ApiErrorText messageKey={errorKey} requestId={requestId} />
          <Button type="button" size="sm" variant="outline" onClick={() => void load()}>
            {t("ui.retry")}
          </Button>
        </div>
      ) : null}
      {overview === null && errorKey === null ? (
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
