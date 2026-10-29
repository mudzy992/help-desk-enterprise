import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TicketForwardPanel } from "@/components/tickets/ticket-forward-panel";
import { TicketMergePanel } from "@/components/tickets/ticket-merge-panel";
import { TicketPriorityPanel } from "@/components/tickets/ticket-priority-panel";
import { TicketSplitPanel } from "@/components/tickets/ticket-split-panel";
import type { TicketDetailPageReadyModel } from "@/components/tickets/ticket-detail-page-types";

export function TicketDetailActionPanels({
  model,
}: {
  readonly model: TicketDetailPageReadyModel;
}) {
  const { t, ticket, detail, detailActions } = model;
  return (
    <>
      <ConfirmDialog
        open={detailActions.playbookWarning !== null}
        onOpenChange={(open) => {
          if (!open) detailActions.setPlaybookWarning(null);
        }}
        title={t("templates.resolveWarn.title")}
        description={t("templates.resolveWarn.body", {
          name: model.playbook.view?.playbook?.name ?? "",
        })}
        confirmLabel={t("templates.resolveWarn.confirm")}
        onConfirm={detailActions.confirmPlaybookWarning}
      >
        <ul
          className="mb-2 list-disc space-y-1 pl-5 text-[12.5px] text-foreground"
          data-testid="playbook-resolve-warning"
        >
          {detailActions.playbookWarning?.steps.map((title) => (
            <li key={title}>{title}</li>
          ))}
        </ul>
      </ConfirmDialog>
      <TicketForwardPanel
        ticket={ticket}
        open={model.forwardOpen}
        onOpenChange={model.setForwardOpen}
        onComplete={model.onForwardComplete}
      />
      <TicketPriorityPanel
        ticket={ticket}
        open={model.priorityOpen}
        onOpenChange={model.setPriorityOpen}
        onComplete={model.onPriorityComplete}
      />
      <TicketMergePanel
        ticket={ticket}
        open={model.mergeOpen}
        onOpenChange={model.setMergeOpen}
        onComplete={model.onMergeComplete}
      />
      <TicketSplitPanel
        ticket={ticket}
        open={model.splitOpen}
        onOpenChange={model.setSplitOpen}
        onComplete={model.onSplitComplete}
        onError={detail.setActionError}
      />
    </>
  );
}
