import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { PrivacyAnonymizationPanel } from "@/components/privacy/privacy-anonymization-panel";
import { PrivacyExportsPanel } from "@/components/privacy/privacy-exports-panel";
import { PrivacyLegalHoldsPanel } from "@/components/privacy/privacy-legal-holds-panel";
import { PrivacyRecordPanel } from "@/components/privacy/privacy-record-panel";
import { PrivacyNoticeEditor } from "@/components/privacy/privacy-notice-editor";
import { PrivacyRequestsPanel } from "@/components/privacy/privacy-requests-panel";
import { PrivacyRetentionPanel } from "@/components/privacy/privacy-retention-panel";
import { PageHeader, brandCrumb } from "@/components/ui/page-header";
import { UnderlineTabs } from "@/components/ui/tabs";
import { readPrivacyTab, visiblePrivacyTabs, type PrivacyTab } from "@/lib/privacy/privacy-view";
import { canOpenAdminArea } from "@/lib/session/route-access";
import { permissionKeys } from "@/lib/session/permission-keys";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";

/**
 * Paket 2.6 (§11): Administracija → Privatnost. Deep links:
 * `?tab=exports&subject=<userId>&request=<requestId>` and
 * `?tab=anonymization&user=<userId>&request=<requestId>` (from a request or a
 * user profile) prefill the form once, then the parameters are dropped.
 */
export function PrivacyPage() {
  const { t } = useTranslation();
  const capabilities = useSessionCapabilities();
  const { session, hasPermission } = capabilities;
  const isSuperAdmin = session?.isSuperAdmin === true;
  const access = useMemo(
    () => ({
      canManage: isSuperAdmin || hasPermission(permissionKeys.privacyManage),
      canAnonymize: isSuperAdmin || hasPermission(permissionKeys.privacyAnonymize),
    }),
    [hasPermission, isSuperAdmin],
  );
  const canChangeHolds = canOpenAdminArea(capabilities);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = readPrivacyTab(searchParams.get("tab"), access);

  const changeTab = (next: string) => setSearchParams({ tab: next }, { replace: true });
  const consumePrefill = useCallback(
    () => setSearchParams((current) => ({ tab: current.get("tab") ?? tab }), { replace: true }),
    [setSearchParams, tab],
  );

  const labels: Record<PrivacyTab, string> = {
    requests: t("privacy.tabs.requests"),
    anonymization: t("privacy.tabs.anonymization"),
    exports: t("privacy.tabs.exports"),
    retention: t("privacy.tabs.retention"),
    holds: t("privacy.tabs.holds"),
    notice: t("privacy.tabs.notice"),
    record: t("privacy.tabs.record"),
  };

  return (
    <section data-testid="privacy-page">
      <div className="print:hidden">
        <PageHeader
          crumbs={[brandCrumb, t("navigation.sections.administration"), t("navigation.privacy")]}
          title={t("privacy.title")}
          subtitle={t("privacy.intro")}
        />
        <UnderlineTabs
          className="mb-4"
          items={visiblePrivacyTabs(access).map((key) => ({ key, label: labels[key] }))}
          active={tab}
          onChange={changeTab}
        />
      </div>
      {tab === "requests" ? (
        <PrivacyRequestsPanel
          canManage={access.canManage}
          canAnonymize={access.canAnonymize}
          onFollowUp={(target, request) =>
            setSearchParams(
              {
                tab: target,
                [target === "exports" ? "subject" : "user"]: request.subjectUser?.id ?? "",
                request: request.id,
              },
              { replace: true },
            )
          }
        />
      ) : tab === "anonymization" ? (
        <PrivacyAnonymizationPanel
          initialUserId={searchParams.get("user")}
          requestId={searchParams.get("request")}
          onPrefillConsumed={consumePrefill}
        />
      ) : tab === "exports" ? (
        <PrivacyExportsPanel
          initialSubjectId={searchParams.get("subject")}
          requestId={searchParams.get("request")}
          onPrefillConsumed={consumePrefill}
        />
      ) : tab === "retention" ? (
        <PrivacyRetentionPanel canManage={access.canManage} />
      ) : tab === "holds" ? (
        <PrivacyLegalHoldsPanel canChange={canChangeHolds} />
      ) : tab === "notice" ? (
        <PrivacyNoticeEditor />
      ) : (
        <PrivacyRecordPanel generatedBy={session?.principal.displayName ?? null} />
      )}
    </section>
  );
}
