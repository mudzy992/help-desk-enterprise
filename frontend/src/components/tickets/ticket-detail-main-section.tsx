import { TicketDetailSideStack } from "@/components/tickets/ticket-detail-side-stack";
import { TicketDetailWorkspace } from "@/components/tickets/ticket-detail-workspace";
import { TicketFormDataView } from "@/components/tickets/ticket-form-data-view";
import { TicketMergedCard } from "@/components/tickets/ticket-merged-card";
import { TicketAssetsPanel } from "@/components/assets/ticket-assets-panel";
import { TicketLinksPanel } from "@/components/tickets/ticket-links-panel";
import { TicketProblemPanel } from "@/components/problems/ticket-problem-panel";
import { TicketPlaybookPanel } from "@/components/templates/ticket-playbook-panel";
import { permissionKeys } from "@/lib/session/permission-keys";
import type { TicketDetailPageReadyModel } from "@/components/tickets/ticket-detail-page-types";

export function TicketDetailMainSection({ model }: { readonly model: TicketDetailPageReadyModel }) {
  const { ticket, actions, detail, context, approvals } = model;
  return (
    <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_330px]">
      <TicketDetailWorkspace
        ticket={ticket}
        messages={model.visibleMessages}
        currentUserId={model.currentUserId}
        authorNames={model.authorNames}
        requesterName={model.requesterName}
        history={context.history}
        publicActivity={context.publicActivity}
        historyErrorKey={context.errors.history}
        publicActivityErrorKey={context.errors.publicActivity}
        onRetryContext={context.retry}
        isStaff={actions.viewActivity}
        access={model.access}
        isSending={model.detailActions.isSending}
        sendErrorKey={detail.actionError}
        canWaitForUser={model.canWaitForUser}
        onSend={model.detailActions.sendMessage}
        onWaitForUser={model.detailActions.waitForUser}
        timeLogs={detail.timeLogs}
        timeVisible={detail.timeVisible && actions.viewActivity}
        userNames={model.authorNames}
        canTrackTime={actions.trackTime}
        timeTracking={model.timeTracking}
        attachments={detail.attachments}
        attachmentsVisible={detail.attachmentsVisible}
        attachmentsPurgedAt={ticket.privacy?.attachmentsPurgedAt ?? null}
        canUpload={detail.attachmentsVisible && actions.uploadAttachments}
        onUpload={detail.upload}
        onDownload={detail.download}
        onDelete={detail.removeAttachment}
        composerExtra={model.composerExtra}
        canWriteKnowledge={
          actions.viewActivity && model.hasPermission(permissionKeys.knowledgeArticleWrite)
        }
        composerCollaboration={model.composerCollaboration}
        composerInsertText={model.workaroundInsert}
        composerTemplates={
          actions.viewActivity && model.canUseTemplates
            ? {
                ticketId: ticket.id,
                insertRequest: model.templateInsert,
                canSavePersonal:
                  model.session?.isSuperAdmin === true ||
                  model.hasPermission(permissionKeys.ticketTemplatesPersonal),
              }
            : undefined
        }
      />
      <div className="space-y-4">
        <TicketDetailSideStack
          sections={model.detailSections}
          actionsVisible={model.actionsCardVisible}
          slots={{
            formData: (
              <TicketFormDataView
                schema={model.ticketForm?.schema ?? null}
                formData={model.ticketForm?.formData ?? ticket.formData}
              />
            ),
            playbook:
              model.canUseTemplates && actions.viewActivity ? (
                <TicketPlaybookPanel
                  controller={model.playbook}
                  onInsertTemplate={model.insertTemplate}
                />
              ) : null,
            merged: (
              <TicketMergedCard
                items={model.mergedItems}
                errorKey={model.mergedErrorKey}
                onRetry={model.retryMergedItems}
              />
            ),
            assets:
              model.session?.modules?.cmdb === true ? (
                <TicketAssetsPanel ticketId={ticket.id} versionKey={ticket.updatedAt} />
              ) : null,
            problems:
              model.isStaffView && model.session?.modules?.problems === true ? (
                <TicketProblemPanel
                  ticket={{
                    id: ticket.id,
                    ticketNumber: ticket.ticketNumber,
                    title: ticket.title,
                    priority: ticket.priority,
                  }}
                  versionKey={ticket.updatedAt}
                  onInsertWorkaround={
                    model.access !== "requester" && !ticket.mergedIntoTicketId
                      ? model.insertWorkaround
                      : undefined
                  }
                />
              ) : null,
            links:
              model.isStaffView && model.collaborationConfig.linksEnabled ? (
                <TicketLinksPanel ticketId={ticket.id} versionKey={ticket.updatedAt} />
              ) : null,
          }}
          ticket={ticket}
          originName={model.originName}
          serviceName={model.serviceName}
          authorNames={model.authorNames}
          groupNames={model.groupNames}
          slaContext={context.slaContext}
          canConfigureSla={model.hasPermission(permissionKeys.slaWrite)}
          approvals={approvals.items}
          approvalsVisible={approvals.visible}
          approvalsSaving={approvals.isSaving}
          participants={detail.participants}
          participantCandidates={model.participantCandidates}
          canManageParticipants={actions.manageParticipants}
          forwardHistoryVisible={actions.viewActivity}
          onApprove={model.onApprove}
          onReject={model.onReject}
          onAddParticipant={detail.addParticipant}
          onRemoveParticipant={detail.removeParticipant}
          canOverridePriority={actions.overridePriority}
          onEditPriority={() => model.setPriorityOpen(true)}
          priorityOverrideTitle={model.priorityOverrideTitle}
        />
      </div>
    </div>
  );
}
