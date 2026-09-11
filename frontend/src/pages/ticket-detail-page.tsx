import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { TicketAttachmentsPanel } from "@/components/tickets/ticket-attachments-panel";
import { TicketConversation } from "@/components/tickets/ticket-conversation";
import { TicketDetailHeader } from "@/components/tickets/ticket-detail-header";
import { TicketDetailSidebar } from "@/components/tickets/ticket-detail-sidebar";
import { TicketErrorState, TicketLoadingState } from "@/components/tickets/ticket-feedback-states";
import { TicketFormDataView } from "@/components/tickets/ticket-form-data-view";
import { TicketMessageComposer } from "@/components/tickets/ticket-message-composer";
import { TicketParticipantsPanel } from "@/components/tickets/ticket-participants-panel";
import { TicketTimeTrackingPanel } from "@/components/tickets/ticket-time-tracking-panel";
import { resolveComposerAccess } from "@/lib/tickets/message-composer-access";
import { flattenOrganizationalUnitNames } from "@/lib/tickets/ticket-display";
import { useTicketDetail } from "@/lib/tickets/use-ticket-detail";
import { useSession } from "@/lib/session/use-session";
import { listOfferedServices } from "@/services/service-catalog-api";
import { listOrganizationalUnitTree } from "@/services/organizational-units-api";

export function TicketDetailPage() {
  const { t } = useTranslation();
  const { ticketId } = useParams<{ ticketId: string }>();
  const { currentUserId } = useSession();
  const detail = useTicketDetail(ticketId);
  const [serviceName, setServiceName] = useState("");
  const [originName, setOriginName] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isTimeSaving, setIsTimeSaving] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isSavingStatus, setIsSavingStatus] = useState(false);

  useEffect(() => {
    if (detail.ticket === null) {
      return;
    }
    void listOfferedServices()
      .then((services) => {
        const match = services.find((item) => item.id === detail.ticket?.serviceId);
        setServiceName(match?.name ?? detail.ticket?.serviceId ?? "");
      })
      .catch(() => setServiceName(detail.ticket?.serviceId ?? ""));
    void listOrganizationalUnitTree()
      .then((tree) => {
        setOriginName(
          flattenOrganizationalUnitNames(tree).get(detail.ticket?.originUnitId ?? "") ??
            detail.ticket?.originUnitId ??
            "",
        );
      })
      .catch(() => setOriginName(detail.ticket?.originUnitId ?? ""));
  }, [detail.ticket]);

  if (detail.isLoading) {
    return <TicketLoadingState />;
  }
  if (detail.errorKey || detail.ticket === null) {
    return (
      <section className="max-w-[1400px]">
        <TicketErrorState
          errorKey={detail.errorKey ?? "tickets.errorNotFound"}
          onRetry={() => void detail.reload()}
        />
      </section>
    );
  }

  const ticket = detail.ticket;
  const access = resolveComposerAccess({
    ticket,
    currentUserId,
    inboxAccessible: detail.inboxAccessible,
  });
  const canManageParticipants = access !== "requester";

  return (
    <section>
      <Link
        to="/tickets"
        className="text-[11.5px] text-muted-foreground hover:text-foreground hover:underline"
      >
        {t("tickets.backToInbox")}
      </Link>
      <div className="mt-3">
        <TicketDetailHeader
          ticket={ticket}
          serviceName={serviceName}
          canChangeStatus={detail.canChangeStatus && canManageParticipants}
          claiming={isClaiming}
          savingStatus={isSavingStatus}
          onClaim={() => {
            setIsClaiming(true);
            void detail.claim().finally(() => setIsClaiming(false));
          }}
          onStatusChange={(status) => {
            setIsSavingStatus(true);
            void detail.changeStatus(status).finally(() => setIsSavingStatus(false));
          }}
        />
      </div>
      {detail.actionError ? (
        <p className="mt-3 text-[12.5px] text-danger">{t(detail.actionError)}</p>
      ) : null}
      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="grid min-w-0 gap-4">
          <section className="rounded-lg border border-border bg-surface px-4 py-3.5">
            <h3 className="text-[13.5px] font-semibold text-foreground">{t("tickets.detail.description")}</h3>
            <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed text-foreground">{ticket.description}</p>
          </section>
          <TicketFormDataView formData={ticket.formData} />
          <section className="rounded-lg border border-border bg-surface px-4 py-3.5">
            <h3 className="text-[13.5px] font-semibold text-foreground">{t("tickets.detail.conversation")}</h3>
            <div className="mt-3">
              <TicketConversation
                messages={detail.messages}
                currentUserId={currentUserId}
              />
            </div>
            <TicketMessageComposer
              access={access}
              isSending={isSending}
              onSend={async (type, body) => {
                setIsSending(true);
                try {
                  await detail.sendMessage(type, body);
                } finally {
                  setIsSending(false);
                }
              }}
            />
          </section>
          <TicketAttachmentsPanel
            items={detail.attachments}
            visible={detail.attachmentsVisible}
            canUpload={detail.attachmentsVisible}
            onUpload={detail.upload}
            onDownload={detail.download}
            onDelete={detail.removeAttachment}
          />
        </div>
        <div className="grid gap-4">
          <TicketDetailSidebar ticket={ticket} originName={originName} />
          <TicketParticipantsPanel
            items={detail.participants}
            canManage={canManageParticipants}
            onAdd={detail.addParticipant}
            onRemove={detail.removeParticipant}
          />
          <TicketTimeTrackingPanel
            items={detail.timeLogs}
            visible={detail.timeVisible}
            currentUserId={currentUserId}
            isSaving={isTimeSaving}
            onStart={() => {
              setIsTimeSaving(true);
              void detail.startTimer().finally(() => setIsTimeSaving(false));
            }}
            onStop={(timeLogId) => {
              setIsTimeSaving(true);
              void detail.stopTimer(timeLogId).finally(() => setIsTimeSaving(false));
            }}
          />
        </div>
      </div>
    </section>
  );
}
