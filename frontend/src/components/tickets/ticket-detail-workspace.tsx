import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TicketAttachmentsPanel } from "@/components/tickets/ticket-attachments-panel";
import { TicketConversation } from "@/components/tickets/ticket-conversation";
import { TicketDetailConversation } from "@/components/tickets/ticket-detail-conversation";
import { TicketTimeTrackingPanel } from "@/components/tickets/ticket-time-tracking-panel";
import { Card, CardHeader } from "@/components/ui/card";
import { UnderlineTabs } from "@/components/ui/tabs";
import type { ComposerAccess } from "@/lib/tickets/message-composer-access";
import type {
  MessageType,
  TicketMessageResponse,
  TicketTimeLogResponse,
} from "@/services/tickets-collaboration-api";
import type { TicketAttachmentResponse } from "@/services/tickets-attachments-api";
import type { TicketResponse } from "@/services/tickets-api";

type DetailTab = "chat" | "activity" | "time" | "files";

interface TicketDetailWorkspaceProperties {
  readonly ticket: TicketResponse;
  readonly messages: readonly TicketMessageResponse[];
  readonly currentUserId: string | null;
  readonly authorNames: ReadonlyMap<string, string>;
  readonly requesterName: string;
  readonly access: ComposerAccess;
  readonly isSending: boolean;
  readonly canWaitForUser: boolean;
  readonly onSend: (type: MessageType, body: string) => Promise<void>;
  readonly onWaitForUser?: () => void;
  readonly timeLogs: readonly TicketTimeLogResponse[];
  readonly timeVisible: boolean;
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
    { key: "activity", label: t("tickets.detail.activity"), count: auditCount },
  ];
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
          canWaitForUser={props.canWaitForUser}
          onSend={props.onSend}
          onWaitForUser={props.onWaitForUser}
          onUpload={props.canUpload ? props.onUpload : undefined}
        />
      ) : null}
      {tab === "activity" ? (
        <Card>
          <CardHeader title={t("tickets.detail.activity")} />
          <div className="px-4 py-3">
            <TicketConversation
              messages={props.messages}
              currentUserId={props.currentUserId}
              authorNames={props.authorNames}
              systemOnly
            />
          </div>
        </Card>
      ) : null}
      {tab === "time" ? (
        <TicketTimeTrackingPanel
          items={props.timeLogs}
          visible={props.timeVisible}
          currentUserId={props.currentUserId}
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
