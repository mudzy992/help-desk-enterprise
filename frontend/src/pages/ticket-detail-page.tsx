import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/toast";
import { TicketDetailHeader } from "@/components/tickets/ticket-detail-header";
import { TicketDetailSideStack } from "@/components/tickets/ticket-detail-side-stack";
import { TicketDetailBlockingState } from "@/components/tickets/ticket-detail-blocking-state";
import { TicketDetailWorkspace } from "@/components/tickets/ticket-detail-workspace";
import { TicketForwardPanel } from "@/components/tickets/ticket-forward-panel";
import { TicketSplitPanel } from "@/components/tickets/ticket-split-panel";
import { useDirectory } from "@/lib/directory/use-directory";
import { filterVisibleMessages } from "@/lib/tickets/filter-visible-messages";
import { resolveTicketActionView } from "@/lib/tickets/ticket-action-matrix";
import { nextTicketStatuses } from "@/lib/tickets/ticket-actions";
import { flattenOrganizationalUnitNames } from "@/lib/tickets/ticket-display";
import { ticketRequesterName } from "@/lib/tickets/ticket-names";
import { ticketText } from "@/lib/tickets/ticket-text";
import { useTicketApprovals } from "@/lib/tickets/use-ticket-approvals";
import { useTicketContext } from "@/lib/tickets/use-ticket-context";
import { useTicketDetail } from "@/lib/tickets/use-ticket-detail";
import { useTicketServiceName } from "@/lib/tickets/use-ticket-service-name";
import { permissionKeys } from "@/lib/session/permission-keys";
import { useSession } from "@/lib/session/use-session";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";

export function TicketDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { ticketId } = useParams<{ ticketId: string }>();
  const { currentUserId } = useSession();
  const { session, hasPermission } = useSessionCapabilities();
  const detail = useTicketDetail(ticketId);
  const approvals = useTicketApprovals(ticketId);
  const directory = useDirectory();
  const serviceName = useTicketServiceName(detail.ticket);
  const [isSending, setIsSending] = useState(false);
  const [isTimeSaving, setIsTimeSaving] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [isReopening, setIsReopening] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const { toast } = useToast();
  const versionKey = [
    detail.ticket?.updatedAt ?? "",
    detail.messages.length,
    detail.participants.length,
    detail.timeLogs.length,
    detail.attachments.length,
    approvals.items.length,
  ].join("|");
  const context = useTicketContext(ticketId, versionKey);
  const authorNames = useMemo(() => {
    const names = new Map(context.userNames);
    const current = detail.ticket;
    if (current !== null) {
      if (current.requesterName) {
        names.set(current.requesterId, current.requesterName);
      }
      if (current.assignedUserId !== null && current.assignedUserName) {
        names.set(current.assignedUserId, current.assignedUserName);
      }
    }
    return names;
  }, [context.userNames, detail.ticket]);
  const groupNames = useMemo(() => {
    const names = new Map(context.groupNames);
    const current = detail.ticket;
    if (current !== null && current.assignedGroupId !== null && current.assignedGroupName) {
      names.set(current.assignedGroupId, current.assignedGroupName);
    }
    return names;
  }, [context.groupNames, detail.ticket]);
  const candidates = context.candidates;
  const participantCandidates = useMemo(() => {
    const merged = new Map<string, { readonly id: string; readonly displayName: string }>();
    for (const person of [...(candidates?.watchers ?? []), ...(candidates?.assignees ?? [])]) {
      merged.set(person.id, person);
    }
    return [...merged.values()].sort((left, right) =>
      left.displayName.localeCompare(right.displayName),
    );
  }, [candidates]);

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
  // What the person may do comes from the server (scope, permission and group
  // membership evaluated together); the role-based fallback only covers the
  // moment before that answer arrives.
  const actions = resolveTicketActionView({
    allowed: context.actions,
    ticket,
    session:
      session === null
        ? null
        : {
            currentUserId,
            isSuperAdmin: session.isSuperAdmin,
            roleKeys: session.roleKeys,
            permissionKeys: session.permissionKeys,
          },
  });
  const access = actions.composerAccess;
  const visibleMessages = filterVisibleMessages(detail.messages, access !== "requester");
  const originName =
    flattenOrganizationalUnitNames(directory.tree).get(ticket.originUnitId) ??
    t("tickets.detail.unknownOrigin");
  const requesterName =
    ticketRequesterName(ticket, authorNames) ?? t("tickets.detail.unknownUser");
  const canWaitForUser =
    actions.waitForUser && nextTicketStatuses(ticket.status).includes("WAITING_FOR_USER");

  return (
    <section>
      <TicketDetailHeader
        ticket={ticket}
        serviceName={serviceName}
        originName={originName}
        requesterName={requesterName}
        canChangeStatus={detail.canChangeStatus && actions.changeStatus}
        canClaim={actions.claim}
        canRequestRemote={actions.requestRemote}
        claiming={isClaiming}
        savingStatus={isSavingStatus}
        reopening={isReopening}
        canSplit={actions.split}
        canForward={actions.forward}
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
        onForward={() => setForwardOpen(true)}
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
          messages={visibleMessages}
          currentUserId={currentUserId}
          authorNames={authorNames}
          requesterName={requesterName}
          history={context.history}
          publicActivity={context.publicActivity}
          isStaff={actions.viewActivity}
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
          timeVisible={detail.timeVisible && actions.trackTime}
          userNames={authorNames}
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
          canUpload={detail.attachmentsVisible && actions.uploadAttachments}
          onUpload={detail.upload}
          onDownload={detail.download}
          onDelete={detail.removeAttachment}
        />
        <TicketDetailSideStack
          ticket={ticket}
          originName={originName}
          serviceName={serviceName}
          authorNames={authorNames}
          groupNames={groupNames}
          slaContext={context.slaContext}
          canConfigureSla={hasPermission(permissionKeys.slaWrite)}
          approvals={approvals.items}
          approvalsVisible={approvals.visible}
          approvalsSaving={approvals.isSaving}
          participants={detail.participants}
          participantCandidates={participantCandidates}
          canManageParticipants={actions.manageParticipants}
          forwardHistoryVisible={actions.viewActivity}
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
      <TicketForwardPanel
        ticket={ticket}
        open={forwardOpen}
        onOpenChange={setForwardOpen}
        onComplete={(updated, isReassign) => {
          toast({
            tone: "success",
            title: isReassign
              ? ticketText(t, "tickets.forward.reassignDone", {
                  name: updated.assignedUserName ?? "",
                })
              : ticketText(t, "tickets.forward.done", {
                  name: updated.assignedGroupName ?? "",
                }),
          });
          // After a cross-OU forward the actor may no longer see the ticket;
          // the reload then shows the regular "no access" state.
          void detail.reload();
        }}
      />
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
