import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TicketActivityList } from "@/components/tickets/ticket-activity-list";
import { TicketAttachmentsPanel } from "@/components/tickets/ticket-attachments-panel";
import { TicketDetailConversation } from "@/components/tickets/ticket-detail-conversation";
import { TicketTimeTrackingPanel } from "@/components/tickets/ticket-time-tracking-panel";
import { UnderlineTabs } from "@/components/ui/tabs";
import type { ComposerAccess } from "@/lib/tickets/message-composer-access";
import type { TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import type {
  MessageType,
  TicketMessageResponse,
  TicketTimeLogResponse,
} from "@/services/tickets-collaboration-api";
import type { TicketAttachmentResponse } from "@/services/tickets-attachments-api";
import type { TicketResponse } from "@/services/tickets-api";
import type { TicketHistoryEntry } from "@/services/tickets-context-api";

type DetailTab = "chat" | "activity" | "time" | "files";

interface TicketDetailWorkspaceProperties {
  readonly ticket: TicketResponse;
  readonly messages: readonly TicketMessageResponse[];
  readonly currentUserId: string | null;
  readonly authorNames: ReadonlyMap<string, string>;
  readonly requesterName: string;
  readonly history: readonly TicketHistoryEntry[];
  readonly canViewActivity: boolean;
  readonly access: ComposerAccess;
  readonly isSending: boolean;
  readonly sendErrorKey?: TicketErrorKey | null;
  readonly canWaitForUser: boolean;
  readonly onSend: (type: MessageType, body: string) => Promise<void>;
  readonly onWaitForUser?: () => void;
  readonly timeLogs: readonly TicketTimeLogResponse[];
  readonly timeVisible: boolean;
  readonly userNames: ReadonlyMap<string, string>;
  readonly isTimeSaving: boolean;
  readonly onStartTimer: () => void;
  readonly onStopTimer: (timeLogId: string) => void;
  readonly attachments: readonly TicketAttachmentResponse[];
  readonly attachmentsVisible: boolean;
  readonly canUpload: boolean;
  readonly onUpload: (file: File) => Promise<void>;
  readonly onDownload: (attachment: TicketAttachmentResponse) => Promise<void>;
  readonly onDelete: (attachmentId: string) => Promise<void>;
}

export function TicketDetailWorkspace(props: TicketDetailWorkspaceProperties) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<DetailTab>("chat");
  const auditCount = props.messages.filter(
    (message) => message.type === "SYSTEM_EVENT" || message.type === "APPROVAL_DECISION",
  ).length;
  const tabItems = [
    { key: "chat", label: t("tickets.detail.conversation"), count: props.messages.length },
  ];
  if (props.canViewActivity) {
    tabItems.push({
      key: "activity",
      label: t("tickets.detail.activity"),
      count: auditCount + props.history.length,
    });
  }
  if (props.timeVisible) {
    tabItems.push({ key: "time", label: t("tickets.detail.time"), count: props.timeLogs.length });
  }
  if (props.attachmentsVisible) {
    tabItems.push({
      key: "files",
      label: t("tickets.detail.attachments"),
      count: props.attachments.length,
    });
  }
  return (
    <div className="min-w-0">
      <UnderlineTabs
        className="mb-3"
        active={tab}
        onChange={(key) => setTab(key as DetailTab)}
        items={tabItems}
      />
      {tab === "chat" ? (
        <TicketDetailConversation
          ticket={props.ticket}
          messages={props.messages}
          currentUserId={props.currentUserId}
          authorNames={props.authorNames}
          requesterName={props.requesterName}
          access={props.access}
          isSending={props.isSending}
          sendErrorKey={props.sendErrorKey}
          canWaitForUser={props.canWaitForUser}
          onSend={props.onSend}
          onWaitForUser={props.onWaitForUser}
          onUpload={props.canUpload ? props.onUpload : undefined}
        />
      ) : null}
      {tab === "activity" && props.canViewActivity ? (
        <TicketActivityList
          messages={props.messages}
          history={props.history}
          authorNames={props.authorNames}
        />
      ) : null}
      {tab === "time" ? (
        <TicketTimeTrackingPanel
          items={props.timeLogs}
          visible={props.timeVisible}
          currentUserId={props.currentUserId}
          userNames={props.userNames}
          isSaving={props.isTimeSaving}
          onStart={props.onStartTimer}
          onStop={props.onStopTimer}
        />
      ) : null}
      {tab === "files" ? (
        <TicketAttachmentsPanel
          items={props.attachments}
          visible={props.attachmentsVisible}
          canUpload={props.canUpload}
          onUpload={props.onUpload}
          onDownload={props.onDownload}
          onDelete={props.onDelete}
        />
      ) : null}
    </div>
  );
}
