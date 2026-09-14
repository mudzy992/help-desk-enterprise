import { TicketSlaPanel } from "@/components/tickets/ticket-sla-panel";
import { TicketApprovalsPanel } from "@/components/tickets/ticket-approvals-panel";
import { TicketCsatPanel } from "@/components/tickets/ticket-csat-panel";
import { TicketDetailSidebar } from "@/components/tickets/ticket-detail-sidebar";
import { TicketFormDataView } from "@/components/tickets/ticket-form-data-view";
import { TicketParticipantsPanel } from "@/components/tickets/ticket-participants-panel";
import type { DirectoryUser } from "@/lib/directory/use-directory";
import type { TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import type { TicketApprovalResponse } from "@/services/tickets-approvals-api";
import type { TicketResponse } from "@/services/tickets-api";
import type {
  ParticipantRole,
  TicketParticipantResponse,
} from "@/services/tickets-collaboration-api";

interface TicketDetailSideStackProperties {
  readonly ticket: TicketResponse;
  readonly originName: string;
  readonly serviceName: string;
  readonly authorNames: ReadonlyMap<string, string>;
  readonly approvals: readonly TicketApprovalResponse[];
  readonly approvalsVisible: boolean;
  readonly approvalsSaving: boolean;
  readonly participants: readonly TicketParticipantResponse[];
  readonly directoryUsers: readonly DirectoryUser[];
  readonly canManageParticipants: boolean;
  readonly onError: (key: TicketErrorKey) => void;
  readonly onCsatComplete: (ticket: TicketResponse) => void;
  readonly onApprove: (approvalId: string, comment: string) => Promise<void>;
  readonly onReject: (approvalId: string, comment: string) => Promise<void>;
  readonly onAddParticipant: (role: ParticipantRole, userId: string) => Promise<void>;
  readonly onRemoveParticipant: (participantId: string) => Promise<void>;
}

export function TicketDetailSideStack(props: TicketDetailSideStackProperties) {
  return (
    <div className="space-y-4">
      <TicketSlaPanel ticket={props.ticket} />
      <TicketDetailSidebar
        ticket={props.ticket}
        originName={props.originName}
        serviceName={props.serviceName}
        authorNames={props.authorNames}
      />
      <TicketFormDataView formData={props.ticket.formData} />
      <TicketApprovalsPanel
        items={props.approvals}
        visible={props.approvalsVisible}
        isSaving={props.approvalsSaving}
        authorNames={props.authorNames}
        onApprove={props.onApprove}
        onReject={props.onReject}
      />
      <TicketParticipantsPanel
        items={props.participants}
        canManage={props.canManageParticipants}
        directoryUsers={props.directoryUsers}
        onAdd={props.onAddParticipant}
        onRemove={props.onRemoveParticipant}
      />
      <TicketCsatPanel
        ticket={props.ticket}
        onComplete={props.onCsatComplete}
        onError={props.onError}
      />
    </div>
  );
}
