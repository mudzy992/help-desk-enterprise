import { TicketApprovalsPanel } from "@/components/tickets/ticket-approvals-panel";
import { TicketCsatPanel } from "@/components/tickets/ticket-csat-panel";
import { TicketDetailSidebar } from "@/components/tickets/ticket-detail-sidebar";
import { TicketParticipantsPanel } from "@/components/tickets/ticket-participants-panel";
import { TicketSplitPanel } from "@/components/tickets/ticket-split-panel";
import { TicketTimeTrackingPanel } from "@/components/tickets/ticket-time-tracking-panel";
import type { DirectoryUser } from "@/lib/directory/use-directory";
import type { TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import type { TicketApprovalResponse } from "@/services/tickets-approvals-api";
import type { TicketResponse } from "@/services/tickets-api";
import type {
  ParticipantRole,
  TicketParticipantResponse,
  TicketTimeLogResponse,
} from "@/services/tickets-collaboration-api";

interface TicketDetailSideStackProperties {
  readonly ticket: TicketResponse;
  readonly originName: string;
  readonly canSplit: boolean;
  readonly approvals: readonly TicketApprovalResponse[];
  readonly approvalsVisible: boolean;
  readonly approvalsSaving: boolean;
  readonly participants: readonly TicketParticipantResponse[];
  readonly directoryUsers: readonly DirectoryUser[];
  readonly canManageParticipants: boolean;
  readonly timeLogs: readonly TicketTimeLogResponse[];
  readonly timeVisible: boolean;
  readonly currentUserId: string | null;
  readonly isTimeSaving: boolean;
  readonly onSplitComplete: (children: readonly TicketResponse[]) => void;
  readonly onError: (key: TicketErrorKey) => void;
  readonly onCsatComplete: (ticket: TicketResponse) => void;
  readonly onApprove: (approvalId: string, comment: string) => Promise<void>;
  readonly onReject: (approvalId: string, comment: string) => Promise<void>;
  readonly onAddParticipant: (role: ParticipantRole, userId: string) => Promise<void>;
  readonly onRemoveParticipant: (participantId: string) => Promise<void>;
  readonly onStartTimer: () => void;
  readonly onStopTimer: (timeLogId: string) => void;
}

export function TicketDetailSideStack(props: TicketDetailSideStackProperties) {
  return (
    <div className="grid gap-4">
      <TicketDetailSidebar ticket={props.ticket} originName={props.originName} />
      <TicketCsatPanel
        ticket={props.ticket}
        onComplete={props.onCsatComplete}
        onError={props.onError}
      />
      <TicketSplitPanel
        ticket={props.ticket}
        visible={props.canSplit}
        onComplete={props.onSplitComplete}
        onError={props.onError}
      />
      <TicketApprovalsPanel
        items={props.approvals}
        visible={props.approvalsVisible}
        isSaving={props.approvalsSaving}
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
      <TicketTimeTrackingPanel
        items={props.timeLogs}
        visible={props.timeVisible}
        currentUserId={props.currentUserId}
        isSaving={props.isTimeSaving}
        onStart={props.onStartTimer}
        onStop={props.onStopTimer}
      />
    </div>
  );
}
