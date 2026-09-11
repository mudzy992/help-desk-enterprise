import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { TicketAttachmentsPanel } from "@/components/tickets/ticket-attachments-panel";
import { TicketDetailConversation } from "@/components/tickets/ticket-detail-conversation";
import { TicketDetailHeader } from "@/components/tickets/ticket-detail-header";
import { TicketDetailSideStack } from "@/components/tickets/ticket-detail-side-stack";
import { TicketDetailBlockingState } from "@/components/tickets/ticket-detail-blocking-state";
import { TicketFormDataView } from "@/components/tickets/ticket-form-data-view";
import { useDirectory } from "@/lib/directory/use-directory";
import { resolveComposerAccess } from "@/lib/tickets/message-composer-access";
import { flattenOrganizationalUnitNames } from "@/lib/tickets/ticket-display";
import { useTicketApprovals } from "@/lib/tickets/use-ticket-approvals";
import { useTicketDetail } from "@/lib/tickets/use-ticket-detail";
import { useSession } from "@/lib/session/use-session";
import { listOfferedServices } from "@/services/service-catalog-api";

export function TicketDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { ticketId } = useParams<{ ticketId: string }>();
  const { currentUserId } = useSession();
  const detail = useTicketDetail(ticketId);
  const approvals = useTicketApprovals(ticketId);
  const directory = useDirectory();
  const [serviceName, setServiceName] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isTimeSaving, setIsTimeSaving] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [isReopening, setIsReopening] = useState(false);

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
  }, [detail.ticket]);

  if (detail.isLoading || detail.ticket === null) {
    return (
      <TicketDetailBlockingState
        isLoading={detail.isLoading}
        errorKey={detail.errorKey}
        ticketId={ticketId}
        onReload={() => void detail.reload()}
      />
    );
  }

  const ticket = detail.ticket;
  const access = resolveComposerAccess({
    ticket,
    currentUserId,
    inboxAccessible: detail.inboxAccessible,
  });
  const canManageParticipants = access !== "requester";
  const originName =
    flattenOrganizationalUnitNames(directory.tree).get(ticket.originUnitId) ??
    ticket.originUnitId;

  return (
    <section>
      <Link
        to="/tickets"
        className="text-[11.5px] text-[#7FA8F5] hover:underline"
      >
        {t("tickets.backToInbox")}
      </Link>
      <div className="mt-3">
        <TicketDetailHeader
          ticket={ticket}
          serviceName={serviceName}
          canChangeStatus={detail.canChangeStatus && canManageParticipants && ticket.status !== "ARCHIVED"}
          claiming={isClaiming}
          savingStatus={isSavingStatus}
          reopening={isReopening}
          onClaim={() => {
            setIsClaiming(true);
            void detail.claim().finally(() => setIsClaiming(false));
          }}
          onStatusChange={(status, extras) => {
            setIsSavingStatus(true);
            void detail.changeStatus(status, extras).finally(() => setIsSavingStatus(false));
          }}
          onReopen={() => {
            setIsReopening(true);
            void detail.reopen()
              .then((updated) => {
                if (updated !== null && updated.id !== ticket.id) {
                  navigate(`/tickets/${updated.id}`);
                }
              })
              .finally(() => setIsReopening(false));
          }}
        />
      </div>
      {detail.actionError || approvals.errorKey ? (
        <p className="mt-3 text-[12.5px] text-danger">
          {t(detail.actionError ?? approvals.errorKey ?? "tickets.errorGeneric")}
        </p>
      ) : ticket.redactionWarnings && ticket.redactionWarnings.length > 0 ? (
        <p className="mt-3 text-[12.5px] text-warning">
          {t("tickets.redactionWarning")}
        </p>
      ) : null}
      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="grid min-w-0 gap-4">
          <section className="rounded-lg border border-border bg-surface">
            <h3 className="border-b border-border/70 px-4 pb-3 pt-3.5 text-[13.5px] font-semibold text-foreground">
              {t("tickets.detail.description")}
            </h3>
            <p className="px-4 py-3.5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-foreground">
              {ticket.description}
            </p>
          </section>
          <TicketFormDataView formData={ticket.formData} />
          <TicketDetailConversation
            ticket={ticket}
            messages={detail.messages}
            currentUserId={currentUserId}
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
          <TicketAttachmentsPanel
            items={detail.attachments}
            visible={detail.attachmentsVisible}
            canUpload={detail.attachmentsVisible && ticket.status !== "ARCHIVED"}
            onUpload={detail.upload}
            onDownload={detail.download}
            onDelete={detail.removeAttachment}
          />
        </div>
        <TicketDetailSideStack
            ticket={ticket}
            originName={originName}
            canSplit={canManageParticipants && ticket.status !== "ARCHIVED"}
            approvals={approvals.items}
            approvalsVisible={approvals.visible}
            approvalsSaving={approvals.isSaving}
            participants={detail.participants}
            directoryUsers={directory.users}
            canManageParticipants={canManageParticipants && ticket.status !== "ARCHIVED"}
            timeLogs={detail.timeLogs}
            timeVisible={detail.timeVisible}
            currentUserId={currentUserId}
            isTimeSaving={isTimeSaving}
            onSplitComplete={(children) => {
              if (children[0] !== undefined) {
                navigate(`/tickets/${children[0].id}`);
              }
            }}
            onError={detail.setActionError}
            onCsatComplete={detail.applyTicket}
            onApprove={async (approvalId, comment) => {
              const updated = await approvals.approve(approvalId, comment);
              if (updated !== null) {
                await detail.reload();
              }
            }}
            onReject={async (approvalId, comment) => {
              const updated = await approvals.reject(approvalId, comment);
              if (updated !== null) {
                await detail.reload();
              }
            }}
            onAddParticipant={detail.addParticipant}
            onRemoveParticipant={detail.removeParticipant}
            onStartTimer={() => {
              setIsTimeSaving(true);
              void detail.startTimer().finally(() => setIsTimeSaving(false));
            }}
            onStopTimer={(timeLogId) => {
              setIsTimeSaving(true);
              void detail.stopTimer(timeLogId).finally(() => setIsTimeSaving(false));
            }}
          />
      </div>
    </section>
  );
}
