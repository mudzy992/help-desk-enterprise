import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { TicketAttachmentsPanel } from "@/components/tickets/ticket-attachments-panel";
import { TicketConversation } from "@/components/tickets/ticket-conversation";
import { TicketDetailHeader } from "@/components/tickets/ticket-detail-header";
import { TicketDetailSideStack } from "@/components/tickets/ticket-detail-side-stack";
import { TicketDetailBlockingState } from "@/components/tickets/ticket-detail-blocking-state";
import { TicketFormDataView } from "@/components/tickets/ticket-form-data-view";
import { TicketMessageComposer } from "@/components/tickets/ticket-message-composer";
import { resolveComposerAccess } from "@/lib/tickets/message-composer-access";
import { flattenOrganizationalUnitNames } from "@/lib/tickets/ticket-display";
import { useTicketApprovals } from "@/lib/tickets/use-ticket-approvals";
import { useTicketDetail } from "@/lib/tickets/use-ticket-detail";
import { useSession } from "@/lib/session/use-session";
import { listOfferedServices } from "@/services/service-catalog-api";
import { listOrganizationalUnitTree } from "@/services/organizational-units-api";

export function TicketDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { ticketId } = useParams<{ ticketId: string }>();
  const { currentUserId } = useSession();
  const detail = useTicketDetail(ticketId);
  const approvals = useTicketApprovals(ticketId);
  const [serviceName, setServiceName] = useState("");
  const [originName, setOriginName] = useState("");
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
              <TicketConversation messages={detail.messages} currentUserId={currentUserId} />
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
        <TicketDetailSideStack
            ticket={ticket}
            originName={originName}
            canSplit={canManageParticipants}
            approvals={approvals.items}
            approvalsVisible={approvals.visible}
            approvalsSaving={approvals.isSaving}
            participants={detail.participants}
            canManageParticipants={canManageParticipants}
            timeLogs={detail.timeLogs}
            timeVisible={detail.timeVisible}
            currentUserId={currentUserId}
            isTimeSaving={isTimeSaving}
            onSplitComplete={(children) => {
              if (children[0] !== undefined) {
                navigate(`/tickets/${children[0].id}`);
              }
            }}
            onSplitError={detail.setActionError}
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
