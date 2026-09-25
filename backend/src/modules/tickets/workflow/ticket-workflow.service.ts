import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TicketApprovalsConfigurationLoader } from '../approvals/ticket-approvals-configuration.loader';
import { TicketArchiveConfigurationLoader } from '../archive/ticket-archive-configuration.loader';
import { TicketCloseCodesConfigurationLoader } from '../close-codes/ticket-close-codes-configuration.loader';
import { TicketReopenConfigurationLoader } from '../reopen/ticket-reopen-configuration.loader';
import { TicketRequiredFieldsConfigurationLoader } from '../required-fields/ticket-required-fields-configuration.loader';
import { UnroutedQueueConfigurationLoader } from '../unrouted/unrouted-queue-configuration.loader';
import { WaitingForUserConfigurationLoader } from '../waiting-for-user/waiting-for-user-configuration.loader';
import {
  ticketWorkflowTransitions,
  workflowStatusPhases,
  type WorkflowPhase,
  type WorkflowTransition,
} from './ticket-workflow-definition';

export type TicketWorkflowParameters = {
  readonly closeCodes: { readonly enabled: boolean; readonly requireOnResolve: boolean } | null;
  readonly requiredFields: { readonly enabled: boolean; readonly globalCount: number } | null;
  readonly reopen: { readonly enabled: boolean; readonly windowDays: number } | null;
  readonly waitingForUser: {
    readonly enabled: boolean;
    readonly reminderAfterDays: number;
    readonly autoCloseAfterDays: number;
  } | null;
  readonly approvals: { readonly enabled: boolean } | null;
  readonly archive: { readonly enabled: boolean; readonly afterClosedDays: number } | null;
  readonly unrouted: {
    readonly enabled: boolean;
    readonly ownerRole: string;
    readonly cleanupSlaHours: number;
    readonly weeklyDigest: boolean;
    readonly targetGroup: { readonly id: string; readonly name: string } | null;
    /** Setting points at a group that no longer exists (U1 degrade). */
    readonly targetGroupMissing: boolean;
  };
};

export type TicketWorkflowResponse = {
  readonly statuses: readonly { readonly status: string; readonly phase: WorkflowPhase }[];
  readonly transitions: readonly WorkflowTransition[];
  readonly parameters: TicketWorkflowParameters;
  readonly editable: false;
};

/** Package 1.7 (W2): the status flow plus the live values of its guards. */
@Injectable()
export class TicketWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly closeCodes: TicketCloseCodesConfigurationLoader,
    private readonly requiredFields: TicketRequiredFieldsConfigurationLoader,
    private readonly reopen: TicketReopenConfigurationLoader,
    private readonly waitingForUser: WaitingForUserConfigurationLoader,
    private readonly approvals: TicketApprovalsConfigurationLoader,
    private readonly archive: TicketArchiveConfigurationLoader,
    private readonly unrouted: UnroutedQueueConfigurationLoader,
  ) {}

  async describe(): Promise<TicketWorkflowResponse> {
    // A single unavailable setting must not blank the whole screen.
    const safe = <T>(promise: Promise<T>) => promise.catch(() => null);
    const [closeCodes, requiredFields, reopen, waiting, approvals, archive, unrouted] =
      await Promise.all([
        safe(this.closeCodes.load()),
        safe(this.requiredFields.load()),
        safe(this.reopen.load()),
        safe(this.waitingForUser.load()),
        safe(this.approvals.load()),
        safe(this.archive.load()),
        this.unrouted.load(),
      ]);
    const targetGroup =
      unrouted.targetGroupId === null
        ? null
        : await this.prisma.group.findUnique({
            where: { id: unrouted.targetGroupId },
            select: { id: true, name: true },
          });
    return {
      statuses: Object.entries(workflowStatusPhases).map(([status, phase]) => ({
        status,
        phase,
      })),
      transitions: ticketWorkflowTransitions,
      parameters: {
        closeCodes: closeCodes && {
          enabled: closeCodes.enabled,
          requireOnResolve: closeCodes.requireOnResolve,
        },
        requiredFields: requiredFields && {
          enabled: requiredFields.enabled,
          globalCount: requiredFields.globalRequiredOnResolve.length,
        },
        reopen: reopen && { enabled: reopen.enabled, windowDays: reopen.windowDays },
        waitingForUser: waiting && {
          enabled: waiting.enabled,
          reminderAfterDays: waiting.reminderAfterDays,
          autoCloseAfterDays: waiting.autoCloseAfterDays,
        },
        approvals: approvals && { enabled: approvals.enabled },
        archive: archive && {
          enabled: archive.enabled,
          afterClosedDays: archive.afterClosedDays,
        },
        unrouted: {
          enabled: unrouted.enabled,
          ownerRole: unrouted.ownerRole,
          cleanupSlaHours: unrouted.cleanupSlaHours,
          weeklyDigest: unrouted.weeklyDigest,
          targetGroup: targetGroup ?? null,
          targetGroupMissing: unrouted.targetGroupId !== null && targetGroup === null,
        },
      },
      editable: false,
    };
  }
}
