import { CreateRequestSheet } from "./privacy-request-create-sheet";
import { DeadlineBadge, RequestDetailSheet, requestTypeKey } from "./privacy-request-detail-sheet";
import { FileText, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  rowActionButtonClassName,
  tableHeadClassName,
  tableRowClassName,
  tableWrapClassName,
} from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { Segmented } from "@/components/ui/segmented";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import { localizePersonName } from "@/lib/privacy/privacy-view";
import {
  listDataSubjectRequests,
  type DataSubjectRequest,
  type DataSubjectRequestScope,
  type DataSubjectRequestStatus,
} from "@/services/privacy-api";
import { PanelIntro, useDateFormat, useUserDirectory } from "./privacy-shared";
import { ScrollRegion } from "@/components/ui/scroll-region";

const statusTones: Record<DataSubjectRequestStatus, BadgeTone> = {
  RECEIVED: "info",
  IN_PROGRESS: "primary",
  EXTENDED: "warning",
  COMPLETED: "success",
  REJECTED: "neutral",
};

const statusKey = (status: DataSubjectRequestStatus) =>
  `privacy.requests.status.${status}` as "privacy.requests.status.RECEIVED";

interface PrivacyRequestsPanelProperties {
  readonly canManage: boolean;
  readonly canAnonymize: boolean;
  /** Opens another tab prefilled for this request (export / anonymization). */
  readonly onFollowUp: (tab: "exports" | "anonymization", request: DataSubjectRequest) => void;
}

/** Paket 2.6 (§4, §11): register of data subject requests with the 30/60-day deadlines. */
export function PrivacyRequestsPanel({
  canManage,
  canAnonymize,
  onFollowUp,
}: PrivacyRequestsPanelProperties) {
  const { t, i18n } = useTranslation();
  const format = useDateFormat();
  const [scope, setScope] = useState<DataSubjectRequestScope>("open");
  const [requests, setRequests] = useState<readonly DataSubjectRequest[] | null>(null);
  const [loadError, setLoadError] = useState<{ key: ApiErrorKey; requestId: string | null } | null>(
    null,
  );
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<DataSubjectRequest | null>(null);
  const users = useUserDirectory(canManage);

  const reload = useCallback(async () => {
    try {
      setRequests(await listDataSubjectRequests(scope));
      setLoadError(null);
    } catch (caught) {
      setLoadError({ key: mapApiError(caught), requestId: readApiRequestId(caught) });
    }
  }, [scope]);

  useEffect(() => {
    setRequests(null);
    void reload();
  }, [reload]);

  const replace = (updated: DataSubjectRequest) => {
    setSelected(updated);
    void reload();
  };

  return (
    <div data-testid="privacy-requests">
      <PanelIntro
        actions={
          <>
            <Segmented
              size="sm"
              label={t("privacy.requests.scopeLabel")}
              value={scope}
              onChange={setScope}
              items={[
                { value: "open", label: t("privacy.requests.scope.open") },
                { value: "closed", label: t("privacy.requests.scope.closed") },
                { value: "all", label: t("privacy.requests.scope.all") },
              ]}
            />
            {canManage ? (
              <Button
                size="sm"
                onClick={() => setCreating(true)}
                data-testid="privacy-request-create"
              >
                <Plus size={14} /> {t("privacy.requests.create")}
              </Button>
            ) : null}
          </>
        }
      >
        {t("privacy.requests.intro")}
      </PanelIntro>

      {loadError !== null ? (
        <ApiErrorText messageKey={loadError.key} requestId={loadError.requestId} />
      ) : requests === null ? (
        <PanelSkeleton className="mt-0" label={t("privacy.tabs.requests")} />
      ) : requests.length === 0 ? (
        <EmptyState
          icon={<FileText size={18} strokeWidth={1.8} />}
          title={t("privacy.requests.emptyTitle")}
          body={t("privacy.requests.emptyBody")}
        />
      ) : (
        <ScrollRegion className={tableWrapClassName}>
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className={`${tableHeadClassName} border-b border-border/70`}>
                <th className="px-3 py-2 text-left">{t("privacy.requests.columns.type")}</th>
                <th className="px-3 py-2 text-left">{t("privacy.requests.columns.subject")}</th>
                <th className="px-3 py-2 text-left">{t("privacy.requests.columns.received")}</th>
                <th className="px-3 py-2 text-left">{t("privacy.requests.columns.deadline")}</th>
                <th className="px-3 py-2 text-left">{t("privacy.requests.columns.status")}</th>
                <th className="px-3 py-2 text-left">{t("privacy.requests.columns.handler")}</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr
                  key={request.id}
                  className={`${tableRowClassName} cursor-pointer`}
                  /* a11y-row-link: the button in the first cell is the keyboard entry. */
                  onClick={() => setSelected(request)}
                  data-testid="privacy-request-row"
                >
                  <td className="px-3 font-medium text-foreground">
                    <button
                      type="button"
                      className={rowActionButtonClassName}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelected(request);
                      }}
                    >
                      {t(requestTypeKey(request.type))}
                    </button>
                  </td>
                  <td className="max-w-[240px] truncate px-3">
                    {request.subjectUser === null
                      ? request.subjectLabel
                      : localizePersonName(request.subjectUser.displayName, i18n.language)}
                  </td>
                  <td className="px-3 text-muted-foreground">{format.date(request.receivedAt)}</td>
                  <td className="px-3">
                    <DeadlineBadge request={request} />
                  </td>
                  <td className="px-3">
                    <Badge tone={statusTones[request.status]} dot>
                      {t(statusKey(request.status))}
                    </Badge>
                  </td>
                  <td className="px-3 text-muted-foreground">
                    {request.handlerUser === null
                      ? "—"
                      : localizePersonName(request.handlerUser.displayName, i18n.language)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      )}

      <CreateRequestSheet
        open={creating}
        onOpenChange={setCreating}
        users={users}
        onCreated={(created) => {
          setCreating(false);
          replace(created);
        }}
      />
      <RequestDetailSheet
        request={selected}
        canManage={canManage}
        canAnonymize={canAnonymize}
        onClose={() => setSelected(null)}
        onChanged={replace}
        onFollowUp={(tab, request) => {
          setSelected(null);
          onFollowUp(tab, request);
        }}
      />
    </div>
  );
}
