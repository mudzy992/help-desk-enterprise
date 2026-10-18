import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/toast";
import type { ComposerCollaborationOptions } from "@/lib/tickets/message-composer-contracts";
import { useDirectory } from "@/lib/directory/use-directory";
import { useSession } from "@/lib/session/use-session";
import { permissionKeys } from "@/lib/session/permission-keys";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import { collidingTypist } from "@/lib/tickets/presence-view";
import {
  flattenOrganizationalUnitNames,
  formatTicketTimestamp,
} from "@/lib/tickets/ticket-display";
import { filterVisibleMessages } from "@/lib/tickets/filter-visible-messages";
import { findLastPriorityOverride } from "@/lib/tickets/describe-ticket-activity";
import { resolveTicketActionView } from "@/lib/tickets/ticket-action-matrix";
import { nextTicketStatuses } from "@/lib/tickets/ticket-actions";
import { ticketRequesterName } from "@/lib/tickets/ticket-names";
import { useTicketApprovals } from "@/lib/tickets/use-ticket-approvals";
import { useTicketContext, type TicketContextRevision } from "@/lib/tickets/use-ticket-context";
import { useTicketDetail } from "@/lib/tickets/use-ticket-detail";
import { useTicketDetailActions } from "@/lib/tickets/use-ticket-detail-actions";
import { useTicketForm } from "@/lib/tickets/use-ticket-form";
import { useTicketDetailSections } from "@/lib/tickets/use-detail-sections";
import { useTicketServiceName } from "@/lib/tickets/use-ticket-service-name";
import { useTicketTimeTracking } from "@/lib/time-tracking/use-ticket-time-tracking";
import { useTicketPlaybook } from "@/lib/templates/use-ticket-playbook";
import { useAgentCollaborationConfiguration } from "@/lib/tickets/use-agent-collaboration";
import { useTicketPresence } from "@/lib/tickets/use-ticket-presence";
import { useTicketMergedItems } from "@/lib/tickets/use-ticket-merged-items";
import type { TicketResponse } from "@/services/tickets-api";

export function useTicketDetailPageModel() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { ticketId } = useParams<{ ticketId: string }>();
  const { currentUserId } = useSession();
  const { session, hasPermission } = useSessionCapabilities();
  const detail = useTicketDetail(ticketId);
  const ticketForm = useTicketForm(ticketId);
  const approvals = useTicketApprovals(ticketId);
  const timeTracking = useTicketTimeTracking({
    ticketId,
    setTimeLogs: detail.setTimeLogs,
    canManage: hasPermission(permissionKeys.ticketTimeManage),
  });
  const directory = useDirectory();
  const serviceName = useTicketServiceName(detail.ticket);
  const [splitOpen, setSplitOpen] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [alsoToMerged, setAlsoToMerged] = useState(true);
  const [templateInsert, setTemplateInsert] = useState<{
    readonly templateId: string;
    readonly name: string;
    readonly nonce: number;
  } | null>(null);
  const [workaroundInsert, setWorkaroundInsert] = useState<{
    readonly text: string;
    readonly nonce: number;
  } | null>(null);
  const { toast } = useToast();
  const canUseTemplates =
    session !== null &&
    (session.isSuperAdmin === true || hasPermission(permissionKeys.ticketTemplatesUse));
  const playbook = useTicketPlaybook(ticketId, canUseTemplates, detail.ticket?.updatedAt);
  const contextRevision: TicketContextRevision = {
    ticketUpdatedAt: detail.ticket?.updatedAt ?? "",
    messageCount: detail.messages.length,
    participantCount: detail.participants.length,
    timeLogCount: detail.timeLogs.length,
    attachmentCount: detail.attachments.length,
    approvalCount: approvals.items.length,
  };
  const context = useTicketContext(ticketId, contextRevision);
  const authorNames = useMemo(() => {
    const names = new Map(context.userNames);
    const current = detail.ticket;
    if (current !== null) {
      if (current.requesterName) names.set(current.requesterId, current.requesterName);
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

  const loadedTicketId = detail.ticket?.id ?? null;
  const ticketUpdatedAt = detail.ticket?.updatedAt ?? "";
  const hasActivityAccess = context.actions?.viewActivity ?? false;
  const merged = useTicketMergedItems(loadedTicketId, ticketUpdatedAt, hasActivityAccess);
  const mergedItems = merged.items;
  const mergedErrorKey = merged.errorKey;
  const retryMergedItems = merged.retry;
  const detailActions = useTicketDetailActions({
    detail,
    ticket: detail.ticket,
    playbook,
    navigate,
    mergedCount: mergedItems.length,
    alsoToMerged,
  });

  const participantCandidates = useMemo(() => {
    const merged = new Map<string, { readonly id: string; readonly displayName: string }>();
    for (const person of [
      ...(context.candidates?.watchers ?? []),
      ...(context.candidates?.assignees ?? []),
    ]) {
      merged.set(person.id, person);
    }
    return [...merged.values()].sort((left, right) =>
      left.displayName.localeCompare(right.displayName),
    );
  }, [context.candidates]);
  const collaborationConfig = useAgentCollaborationConfiguration();
  const presence = useTicketPresence({
    ticketId,
    currentUserId,
    enabled: collaborationConfig.presenceEnabled && detail.ticket !== null,
  });
  const lastForeignPublicId = useMemo(() => {
    for (let index = detail.messages.length - 1; index >= 0; index -= 1) {
      const message = detail.messages[index];
      if (
        message !== undefined &&
        (message.type === "USER_REPLY" || message.type === "AGENT_REPLY") &&
        message.authorUserId !== currentUserId
      ) {
        return message.id;
      }
    }
    return null;
  }, [detail.messages, currentUserId]);
  const draftBaselineRef = useRef<string | null | undefined>(undefined);
  const computedSectionDefaults = useMemo(
    () => ({ approvals: approvals.items.some((item) => item.status === "PENDING") }),
    [approvals.items],
  );
  const detailSections = useTicketDetailSections(computedSectionDefaults);

  const ticket = detail.ticket;
  const actions =
    ticket === null
      ? null
      : resolveTicketActionView({
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
  const access = actions?.composerAccess ?? "requester";
  const visibleMessages = filterVisibleMessages(detail.messages, access !== "requester");
  const originName =
    ticket === null
      ? ""
      : (flattenOrganizationalUnitNames(directory.tree).get(ticket.originUnitId) ??
        t("tickets.detail.unknownOrigin"));
  const requesterName =
    ticket === null
      ? ""
      : (ticketRequesterName(ticket, authorNames) ?? t("tickets.detail.unknownUser"));
  const lastOverride = ticket?.priorityOverridden
    ? findLastPriorityOverride(detail.messages)
    : null;
  const priorityOverrideTitle =
    lastOverride === null
      ? undefined
      : [
          lastOverride.authorUserId === null
            ? null
            : (authorNames.get(lastOverride.authorUserId) ?? null),
          formatTicketTimestamp(lastOverride.at, i18n.language),
          lastOverride.reason,
        ]
          .filter((part): part is string => part !== null && part.length > 0)
          .join(" · ");
  const composerExtra =
    ticket !== null && mergedItems.length > 0 ? (
      <Checkbox
        checked={alsoToMerged}
        onChange={(event) => setAlsoToMerged(event.target.checked)}
        data-testid="ticket-also-to-merged"
        label={t("tickets.merge.alsoToMerged", { count: mergedItems.length })}
      />
    ) : undefined;
  const isStaffView = actions?.viewActivity === true;
  const composerCollaboration: ComposerCollaborationOptions | null =
    ticket === null
      ? null
      : {
          ticketId: ticket.id,
          mentionsEnabled: isStaffView && collaborationConfig.mentionsEnabled,
          onTyping: (channel) => {
            presence.reportTyping(channel);
            if (channel === "public") {
              if (draftBaselineRef.current === undefined) {
                draftBaselineRef.current = lastForeignPublicId;
              }
            } else {
              draftBaselineRef.current = undefined;
            }
          },
          confirmBeforePublicSend: () => {
            if (!isStaffView || !collaborationConfig.collisionWarningEnabled) return null;
            const typist = collidingTypist(presence.view);
            if (typist !== null)
              return t("tickets.collaboration.collision.typing", { name: typist.name });
            const baseline = draftBaselineRef.current;
            return baseline !== undefined && lastForeignPublicId !== baseline
              ? t("tickets.collaboration.collision.newReply")
              : null;
          },
        };
  const canWaitForUser =
    actions?.waitForUser === true &&
    ticket !== null &&
    nextTicketStatuses(ticket.status).includes("WAITING_FOR_USER");
  const actionsCardVisible =
    (canUseTemplates && actions?.viewActivity === true) ||
    (approvals.visible && approvals.items.length > 0);
  const contextErrorKey =
    context.errors.people ??
    context.errors.actions ??
    context.errors.sla ??
    context.errors.candidates;

  const insertTemplate = useCallback((templateId: string, name: string) => {
    setTemplateInsert((current) => ({
      templateId,
      name,
      nonce: (current?.nonce ?? 0) + 1,
    }));
  }, []);
  const insertWorkaround = useCallback((text: string) => {
    setWorkaroundInsert((current) => ({ text, nonce: (current?.nonce ?? 0) + 1 }));
  }, []);
  const onUnmerged = useCallback(
    (updated: TicketResponse) => {
      detail.applyTicket(updated);
      void detail.reload();
    },
    [detail],
  );
  const onForwardComplete = useCallback(
    (updated: TicketResponse, isReassign: boolean) => {
      toast({
        tone: "success",
        title: isReassign
          ? t("tickets.forward.reassignDone", { name: updated.assignedUserName ?? "" })
          : t("tickets.forward.done", { name: updated.assignedGroupName ?? "" }),
      });
      void detail.reload();
    },
    [detail, t, toast],
  );
  const onPriorityComplete = useCallback(
    (updated: TicketResponse) => {
      detail.applyTicket(updated);
      toast({ tone: "success", title: t("tickets.priority.done") });
      void detail.reload();
    },
    [detail, t, toast],
  );
  const onMergeComplete = useCallback(
    (updated: TicketResponse) => {
      toast({
        tone: "success",
        title: t("tickets.merge.done", { number: updated.mergedIntoTicketNumber ?? "" }),
      });
      void detail.reload();
    },
    [detail, t, toast],
  );
  const onSplitComplete = useCallback(
    (children: readonly TicketResponse[]) => {
      if (children[0] !== undefined) navigate(`/tickets/${children[0].id}`);
    },
    [navigate],
  );
  const onApprove = useCallback(
    async (approvalId: string, comment: string) => {
      if ((await approvals.approve(approvalId, comment)) !== null) await detail.reload();
    },
    [approvals, detail],
  );
  const onReject = useCallback(
    async (approvalId: string, comment: string) => {
      if ((await approvals.reject(approvalId, comment)) !== null) await detail.reload();
    },
    [approvals, detail],
  );

  return {
    t,
    navigate,
    ticketId,
    currentUserId,
    session,
    hasPermission,
    detail,
    ticket,
    ticketForm,
    approvals,
    timeTracking,
    directory,
    serviceName,
    context,
    contextErrorKey,
    authorNames,
    groupNames,
    participantCandidates,
    detailSections,
    detailActions,
    actions,
    access,
    visibleMessages,
    originName,
    requesterName,
    priorityOverrideTitle,
    composerExtra,
    isStaffView,
    composerCollaboration,
    canWaitForUser,
    actionsCardVisible,
    canUseTemplates,
    playbook,
    collaborationConfig,
    presence,
    mergedItems,
    mergedErrorKey,
    retryMergedItems,
    alsoToMerged,
    setAlsoToMerged,
    templateInsert,
    workaroundInsert,
    insertTemplate,
    insertWorkaround,
    splitOpen,
    setSplitOpen,
    forwardOpen,
    setForwardOpen,
    priorityOpen,
    setPriorityOpen,
    mergeOpen,
    setMergeOpen,
    onUnmerged,
    onForwardComplete,
    onPriorityComplete,
    onMergeComplete,
    onSplitComplete,
    onApprove,
    onReject,
  };
}
