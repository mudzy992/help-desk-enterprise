import { ChevronDown, ChevronUp } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { DetailSectionsProvider } from "@/components/ui/detail-section";
import { TicketApprovalsPanel } from "@/components/tickets/ticket-approvals-panel";
import { TicketDetailSidebar } from "@/components/tickets/ticket-detail-sidebar";
import { TicketForwardHistoryPanel } from "@/components/tickets/ticket-forward-history-panel";
import { TicketParticipantsPanel } from "@/components/tickets/ticket-participants-panel";
import { TicketSlaPanel } from "@/components/tickets/ticket-sla-panel";
import { TicketIncidentsPanel } from "@/components/status/ticket-incidents-panel";
import type { useTicketDetailSections } from "@/lib/tickets/use-detail-sections";
import type {
  ParticipantRole,
  TicketParticipantResponse,
} from "@/services/tickets-collaboration-api";
import type { TicketApprovalResponse } from "@/services/tickets-approvals-api";
import type { TicketResponse } from "@/services/tickets-api";
import type { TicketSlaContextResponse } from "@/services/tickets-context-api";

/*
  Paket 4.2 (dio B): the ticket detail rail.

  The right column used to stack up to 13 cards of equal weight, so the panels
  read constantly drowned in the ones read occasionally. The rail is now three
  cards — Summary / Actions / Related and flow — whose sections can be collapsed
  one by one, and that choice is remembered per user (`useTicketDetailSections`).

  Nothing is removed; every panel of the old column is still rendered, only the
  grouping, order and default openness change. The panels the page itself used to
  render (playbook, merged, assets, problems, links) come in as `slots`, so the
  rail owns the grouping while the page keeps the module/permission gates.
*/

interface TicketDetailRailSlots {
  /** "Podaci forme" — part of Summary. */
  readonly formData: ReactNode;
  /** Playbook — part of Actions; `null` when templates are not available. */
  readonly playbook: ReactNode;
  readonly merged: ReactNode;
  readonly assets: ReactNode;
  readonly problems: ReactNode;
  readonly links: ReactNode;
}

interface TicketDetailSideStackProperties {
  readonly sections: ReturnType<typeof useTicketDetailSections>;
  readonly slots: TicketDetailRailSlots;
  /** The Actions card only exists when something in it asks for action. */
  readonly actionsVisible: boolean;
  readonly canOverridePriority?: boolean;
  readonly onEditPriority?: () => void;
  readonly priorityOverrideTitle?: string;
  readonly ticket: TicketResponse;
  readonly originName: string;
  readonly serviceName: string;
  readonly authorNames: ReadonlyMap<string, string>;
  readonly groupNames: ReadonlyMap<string, string>;
  readonly slaContext: TicketSlaContextResponse | null;
  readonly canConfigureSla: boolean;
  readonly approvals: readonly TicketApprovalResponse[];
  readonly approvalsVisible: boolean;
  readonly approvalsSaving: boolean;
  readonly participants: readonly TicketParticipantResponse[];
  readonly participantCandidates: readonly { readonly id: string; readonly displayName: string }[];
  readonly canManageParticipants: boolean;
  readonly forwardHistoryVisible: boolean;
  readonly onApprove: (approvalId: string, comment: string) => Promise<void>;
  readonly onReject: (approvalId: string, comment: string) => Promise<void>;
  readonly onAddParticipant: (role: ParticipantRole, userId: string) => Promise<void>;
  readonly onRemoveParticipant: (participantId: string) => Promise<void>;
}

function RailCard({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <Card className="fade-in">
      <CardHeader as="h3" title={title} className="pb-2.5 pt-3" />
      <div>{children}</div>
    </Card>
  );
}

export function TicketDetailSideStack(props: TicketDetailSideStackProperties) {
  const { t } = useTranslation();
  const { sections, slots } = props;

  return (
    <DetailSectionsProvider store={sections}>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[13px] font-semibold text-foreground">{t("tickets.detail.title")}</h2>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => sections.setAll(!sections.allOpen)}
            data-testid="ticket-detail-sections-toggle"
          >
            {sections.allOpen ? (
              <ChevronUp size={12} aria-hidden="true" />
            ) : (
              <ChevronDown size={12} aria-hidden="true" />
            )}
            {sections.allOpen ? t("tickets.detail.collapseAll") : t("tickets.detail.expandAll")}
          </Button>
        </div>

        <RailCard title={t("tickets.detail.cards.summary")}>
          <TicketSlaPanel
            key={props.ticket.id}
            ticket={props.ticket}
            context={props.slaContext}
            canConfigure={props.canConfigureSla}
          />
          <TicketDetailSidebar
            ticket={props.ticket}
            originName={props.originName}
            serviceName={props.serviceName}
            authorNames={props.authorNames}
            groupNames={props.groupNames}
            canOverridePriority={props.canOverridePriority}
            onEditPriority={props.onEditPriority}
            priorityOverrideTitle={props.priorityOverrideTitle}
          />
          {slots.formData}
        </RailCard>

        {props.actionsVisible ? (
          <RailCard title={t("tickets.detail.cards.actions")}>
            {slots.playbook}
            <TicketApprovalsPanel
              items={props.approvals}
              visible={props.approvalsVisible}
              isSaving={props.approvalsSaving}
              authorNames={props.authorNames}
              onApprove={props.onApprove}
              onReject={props.onReject}
            />
          </RailCard>
        ) : null}

        <RailCard title={t("tickets.detail.cards.related")}>
          {slots.merged}
          {slots.assets}
          {slots.problems}
          {slots.links}
          <TicketIncidentsPanel
            ticketId={props.ticket.id}
            serviceId={props.ticket.serviceId}
            versionKey={props.ticket.updatedAt}
          />
          <TicketForwardHistoryPanel
            ticketId={props.ticket.id}
            versionKey={props.ticket.updatedAt}
            visible={props.forwardHistoryVisible}
          />
          <TicketParticipantsPanel
            items={props.participants}
            canManage={props.canManageParticipants}
            directoryUsers={props.participantCandidates}
            userNames={props.authorNames}
            groupNames={props.groupNames}
            onAdd={props.onAddParticipant}
            onRemove={props.onRemoveParticipant}
          />
        </RailCard>
      </div>
    </DetailSectionsProvider>
  );
}
