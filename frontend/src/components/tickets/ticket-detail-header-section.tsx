import { Button } from "@/components/ui/button";
import { TicketDetailHeader } from "@/components/tickets/ticket-detail-header";
import { TicketCollaborationBar } from "@/components/tickets/ticket-collaboration-bar";
import { TicketCsatPanel } from "@/components/tickets/ticket-csat-panel";
import { TicketMergedBanner } from "@/components/tickets/ticket-merged-banner";
import { TicketNavigationShortcuts } from "@/components/shortcuts/ticket-navigation-shortcuts";
import type { TicketDetailPageReadyModel } from "@/components/tickets/ticket-detail-page-types";

export function TicketDetailHeaderSection({
  model,
}: {
  readonly model: TicketDetailPageReadyModel;
}) {
  const { t, ticket, actions, detail, approvals, detailActions } = model;
  return (
    <>
      <TicketNavigationShortcuts ticketId={ticket.id} isStaff={model.isStaffView} />
      <TicketDetailHeader
        ticket={ticket}
        serviceName={model.serviceName}
        originName={model.originName}
        requesterName={model.requesterName}
        canChangeStatus={detail.canChangeStatus && actions.changeStatus}
        canClaim={actions.claim}
        canRequestRemote={actions.requestRemote}
        claiming={detailActions.isClaiming}
        savingStatus={detailActions.isSavingStatus}
        reopening={detailActions.isReopening}
        canSplit={actions.split}
        canForward={actions.forward}
        onClaim={() => void detailActions.claim()}
        onStatusChange={detailActions.changeStatus}
        onReopen={() => void detailActions.reopen()}
        onSplit={() => model.setSplitOpen(true)}
        onForward={() => model.setForwardOpen(true)}
        canMerge={actions.merge}
        onMerge={() => model.setMergeOpen(true)}
      />
      <TicketCollaborationBar
        ticketId={ticket.id}
        isStaff={model.isStaffView}
        presence={model.presence.view}
        presenceEnabled={model.collaborationConfig.presenceEnabled}
        canFollow={model.isStaffView && model.collaborationConfig.followersEnabled}
      />
      <TicketMergedBanner
        ticket={ticket}
        canUnmerge={actions.unmerge}
        onUnmerged={model.onUnmerged}
      />
      {detail.actionError || approvals.errorKey || model.contextErrorKey ? (
        <div
          className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-danger"
          role="alert"
        >
          <span>
            {t(
              detail.actionError ??
                approvals.errorKey ??
                model.contextErrorKey ??
                "tickets.errorGeneric",
            )}
          </span>
          {detail.actionError !== null ? (
            <Button type="button" size="xs" variant="outline" onClick={() => void detail.reload()}>
              {t("tickets.retry")}
            </Button>
          ) : null}
          {model.contextErrorKey !== null ? (
            <Button type="button" size="xs" variant="outline" onClick={model.context.retry}>
              {t("tickets.retry")}
            </Button>
          ) : null}
        </div>
      ) : ticket.redactionWarnings && ticket.redactionWarnings.length > 0 ? (
        <p className="mt-3 text-[12.5px] text-warning">{t("tickets.redactionWarning")}</p>
      ) : null}
      <TicketCsatPanel
        className="mt-4"
        ticket={ticket}
        onComplete={detail.applyTicket}
        onError={detail.setActionError}
      />
    </>
  );
}
