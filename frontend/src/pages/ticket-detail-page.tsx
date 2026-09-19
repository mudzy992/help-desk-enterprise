import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { TicketDetailHeader } from "@/components/tickets/ticket-detail-header";
import { TicketDetailSideStack } from "@/components/tickets/ticket-detail-side-stack";
import { TicketDetailBlockingState } from "@/components/tickets/ticket-detail-blocking-state";
import { TicketDetailWorkspace } from "@/components/tickets/ticket-detail-workspace";
import { TicketSplitPanel } from "@/components/tickets/ticket-split-panel";
import { useDirectory } from "@/lib/directory/use-directory";
import { resolveComposerAccess } from "@/lib/tickets/message-composer-access";
import { nextTicketStatuses } from "@/lib/tickets/ticket-actions";
import { flattenOrganizationalUnitNames } from "@/lib/tickets/ticket-display";
import { ticketText } from "@/lib/tickets/ticket-text";
import { useTicketApprovals } from "@/lib/tickets/use-ticket-approvals";
import { useTicketDetail } from "@/lib/tickets/use-ticket-detail";
import { useTicketServiceName } from "@/lib/tickets/use-ticket-service-name";
import { permissionKeys, roleKeys } from "@/lib/session/permission-keys";
import { useSession } from "@/lib/session/use-session";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";

export function TicketDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { ticketId } = useParams<{ ticketId: string }>();
  const { currentUserId } = useSession();
  const { session, hasPermission, hasRole } = useSessionCapabilities();
  const detail = useTicketDetail(ticketId);
  const approvals = useTicketApprovals(ticketId);
  const directory = useDirectory();
  const serviceName = useTicketServiceName(detail.ticket);
  const [isSending, setIsSending] = useState(false);
  const [isTimeSaving, setIsTimeSaving] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [isReopening, setIsReopening] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const authorNames = useMemo(
    () => new Map(directory.users.map((user) => [user.id, user.displayName])),
    [directory.users],
  );

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
  // Staff is decided by the signed-in user's role, not by whether the group
  // inbox endpoint answered. If the session is unavailable, fall back to the
  // inbox signal instead of guessing.
  const actorIsStaff =
    session === null
      ? undefined
      : session.isSuperAdmin ||
        hasRole(roleKeys.agent) ||
        hasRole(roleKeys.admin);
  const access = resolveComposerAccess({
    ticket,
    currentUserId,
    inboxAccessible: detail.inboxAccessible,
    actorIsStaff,
  });
  const canManage = access !== "requester" && ticket.status !== "ARCHIVED";
  const originName =
    flattenOrganizationalUnitNames(directory.tree).get(ticket.originUnitId) ??
    ticket.originUnitId;
  const requesterName = authorNames.get(ticket.requesterId) ?? ticket.requesterId;
  const canWaitForUser =
    canManage && nextTicketStatuses(ticket.status).includes("WAITING_FOR_USER");
  const canAssign = canManage && (session?.isSuperAdmin === true || hasPermission(permissionKeys.ticketBulkAssign));

  return (
    <section>
      <TicketDetailHeader
        ticket={ticket}
        serviceName={serviceName}
        originName={originName}
        requesterName={requesterName}
        canChangeStatus={detail.canChangeStatus && canManage}
        canClaim={canManage}
        claiming={isClaiming}
        savingStatus={isSavingStatus}
        reopening={isReopening}
        assigning={isAssigning}
        canSplit={canManage}
        canAssign={canAssign}
        assignableUsers={directory.users}
        onClaim={() => {
          setIsClaiming(true);
          void detail.claim().finally(() => setIsClaiming(false));
        }}
        onAssignUser={(userId) => {
          setIsAssigning(true);
          void detail.assignUser(userId).finally(() => setIsAssigning(false));
        }}
        onStatusChange={(status, extras) => {
          setIsSavingStatus(true);
          void detail.changeStatus(status, extras).finally(() => setIsSavingStatus(false));
        }}
        onReopen={() => {
          setIsReopening(true);
          void detail
            .reopen()
            .then((updated) => {
              if (updated !== null && updated.id !== ticket.id) {
                navigate(`/tickets/${updated.id}`);
              }
            })
            .finally(() => setIsReopening(false));
        }}
        onSplit={() => setSplitOpen(true)}
      />
      {detail.actionError || approvals.errorKey ? (
        <p className="mt-3 text-[12.5px] text-danger">
          {ticketText(
            t,
            detail.actionError ?? approvals.errorKey ?? "tickets.errorGeneric",
          )}
        </p>
      ) : ticket.redactionWarnings && ticket.redactionWarnings.length > 0 ? (
        <p className="mt-3 text-[12.5px] text-warning">{t("tickets.redactionWarning")}</p>
      ) : null}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_330px]">
        <TicketDetailWorkspace
          ticket={ticket}
          messages={detail.messages}
          currentUserId={currentUserId}
          authorNames={authorNames}
          requesterName={requesterName}
          access={access}
          isSending={isSending}
          sendErrorKey={detail.actionError}
          canWaitForUser={canWaitForUser}
          onSend={async (type, body) => {
            setIsSending(true);
            try {
              await detail.sendMessage(type, body);
            } finally {
              setIsSending(false);
            }
          }}
          onWaitForUser={() => {
            setIsSavingStatus(true);
            void detail.changeStatus("WAITING_FOR_USER").finally(() => setIsSavingStatus(false));
          }}
          timeLogs={detail.timeLogs}
          timeVisible={detail.timeVisible}
          isTimeSaving={isTimeSaving}
          onStartTimer={() => {
            setIsTimeSaving(true);
            void detail.startTimer().finally(() => setIsTimeSaving(false));
          }}
          onStopTimer={(timeLogId) => {
            setIsTimeSaving(true);
            void detail.stopTimer(timeLogId).finally(() => setIsTimeSaving(false));
          }}
          attachments={detail.attachments}
          attachmentsVisible={detail.attachmentsVisible}
          canUpload={detail.attachmentsVisible && ticket.status !== "ARCHIVED"}
          onUpload={detail.upload}
          onDownload={detail.download}
          onDelete={detail.removeAttachment}
        />
        <TicketDetailSideStack
          ticket={ticket}
          originName={originName}
          serviceName={serviceName}
          authorNames={authorNames}
          approvals={approvals.items}
          approvalsVisible={approvals.visible}
          approvalsSaving={approvals.isSaving}
          participants={detail.participants}
          directoryUsers={directory.users}
          canManageParticipants={canManage}
          onError={detail.setActionError}
          onCsatComplete={detail.applyTicket}
          onApprove={async (approvalId, comment) => {
            if ((await approvals.approve(approvalId, comment)) !== null) {
              await detail.reload();
            }
          }}
          onReject={async (approvalId, comment) => {
            if ((await approvals.reject(approvalId, comment)) !== null) {
              await detail.reload();
            }
          }}
          onAddParticipant={detail.addParticipant}
          onRemoveParticipant={detail.removeParticipant}
        />
      </div>
      <TicketSplitPanel
        ticket={ticket}
        open={splitOpen}
        onOpenChange={setSplitOpen}
        onComplete={(children) => {
          if (children[0] !== undefined) {
            navigate(`/tickets/${children[0].id}`);
          }
        }}
        onError={detail.setActionError}
      />
    </section>
  );
}
