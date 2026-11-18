import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { auditLogActions, auditLogEntityTypes } from '../audit-log/audit-log.constants';
import type { AuditLogTransactionalClient } from '../audit-log/audit-log.types';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import { permissionKeys } from '../authorization/authorization.constants';
import { eligibleProblemOwnerWhere } from './problem-owner-eligibility';
import { ProblemAccessService, type ProblemViewer } from './problem-access.service';
import { problemHandoffOccurrence } from './problem-notice-occurrence';
import { ProblemNotifier } from './problem-notifier';
import { ProblemsService } from './problems.service';
import {
  ProblemError,
  problemErrorCodes,
  problemEventActions,
  problemFinalStatuses,
  problemLimits,
} from './problems.constants';
import type { ProblemHandoffDecisionDto, ProblemHandoffDto } from './problems.dto';

const userSelect = { id: true, displayName: true, email: true } as const;

const handoffSelect = {
  id: true,
  status: true,
  problemId: true,
  reason: true,
  decisionReason: true,
  decidedAt: true,
  createdAt: true,
  fromGroup: { select: { id: true, name: true } },
  toGroup: { select: { id: true, name: true } },
  fromOrganizationalUnit: { select: { id: true, name: true } },
  toOrganizationalUnit: { select: { id: true, name: true } },
  requestedBy: { select: userSelect },
  decidedBy: { select: userSelect },
} satisfies Prisma.ProblemHandoffSelect;

export type ProblemHandoffRow = Prisma.ProblemHandoffGetPayload<{ select: typeof handoffSelect }>;

export type ProblemHandoffView = {
  readonly id: string;
  readonly status: string;
  readonly problemId: string;
  readonly reason: string;
  readonly decisionReason: string | null;
  readonly fromGroup: { readonly id: string; readonly name: string } | null;
  readonly toGroup: { readonly id: string; readonly name: string };
  readonly fromOrganizationalUnit: { readonly id: string; readonly name: string };
  readonly toOrganizationalUnit: { readonly id: string; readonly name: string };
  readonly requestedBy: { readonly id: string; readonly displayName: string; readonly email: string } | null;
  readonly decidedBy: { readonly id: string; readonly displayName: string; readonly email: string } | null;
  readonly decidedAt: string | null;
  readonly createdAt: string;
};

export function toProblemHandoffView(row: ProblemHandoffRow): ProblemHandoffView {
  return {
    id: row.id,
    status: row.status,
    problemId: row.problemId,
    reason: row.reason,
    decisionReason: row.decisionReason,
    fromGroup: row.fromGroup,
    toGroup: row.toGroup,
    fromOrganizationalUnit: row.fromOrganizationalUnit,
    toOrganizationalUnit: row.toOrganizationalUnit,
    requestedBy: row.requestedBy,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

type HandoffTarget = {
  readonly id: string;
  readonly name: string;
  readonly isProblemGroup: boolean;
  readonly organizationalUnitId: string;
};

/**
 * W7.28 / BA-problems-10: a problem changes its group only through a recorded
 * handoff. Before this service `PATCH /problems/:id` checked authority over the
 * *current* group only, so a manager of the old group could push the problem
 * into any problem group — with the owner reset — and nobody on the receiving
 * side ever agreed to take it.
 *
 * The rule now:
 * - a group change is always a handoff command, never a plain field update;
 * - the requester must run the current group, hold the manage scope over the
 *   target group's unit and keep the target unit readable;
 * - if the requester also runs the *target* group, the transfer is immediate
 *   (accepted in the same transaction, `autoAccepted` in the audit);
 * - otherwise the problem keeps its group, unit and scope until a manager of
 *   the target group accepts it, and the target group is notified meanwhile;
 * - an accepted transfer moves the problem into the target group's unit, so a
 *   problem always lives in the unit of the group that runs it. A plain
 *   `PATCH` may still move the unit, but only inside the current group's tree;
 *   anything else is a handoff as well;
 * - a problem in a final status cannot be handed over, and reaching a final
 *   status cancels a pending request (see `ProblemsService.changeStatus`).
 */
@Injectable()
export class ProblemHandoffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProblemAccessService,
    private readonly problems: ProblemsService,
    @Optional() private readonly notifier?: ProblemNotifier,
  ) {}

  private notify(label: string, operation: (notifier: ProblemNotifier) => Promise<unknown>): void {
    const notifier = this.notifier;
    if (notifier !== undefined) notifier.run(label, () => operation(notifier));
  }

  /** Recent handoffs of one problem; the pending one is also on the problem detail. */
  async list(viewer: ProblemViewer, problemId: string) {
    await this.access.require(viewer, permissionKeys.problemRead);
    await this.problems.get(viewer, problemId);
    const rows = await this.prisma.problemHandoff.findMany({
      where: { problemId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: problemLimits.handoffHistoryMax,
      select: handoffSelect,
    });
    return { items: rows.map(toProblemHandoffView) };
  }

  async request(viewer: ProblemViewer, problemId: string, input: ProblemHandoffDto) {
    const scope = await this.access.require(viewer, permissionKeys.problemManage);
    const readScope = await this.access.require(viewer, permissionKeys.problemRead);
    const problem = await this.problems.get(viewer, problemId);
    await this.access.requireUnitInScope(scope, problem.organizationalUnit.id);
    await this.access.requireGroupAuthority(viewer, permissionKeys.problemManage, problem.group?.id ?? null);
    if ((problemFinalStatuses as readonly string[]).includes(problem.status)) {
      throw new ProblemError(problemErrorCodes.finalStatus);
    }
    const target = await this.loadTargetGroup(input.toGroupId);
    if (target.id === problem.group?.id) throw new ProblemError(problemErrorCodes.handoffSameGroup);
    // The receiving unit must be inside the requester's manage scope and stay readable for them.
    await this.access.requireUnitInScope(scope, target.organizationalUnitId);
    await this.access.requireUnitInScope(readScope, target.organizationalUnitId);
    const pending = await this.prisma.problemHandoff.count({ where: { problemId, status: 'PENDING' } });
    if (pending > 0) throw new ProblemError(problemErrorCodes.handoffPending);
    // Running the target group as well makes the transfer your own decision.
    const autoAccept = await this.access.hasGroupAuthority(viewer, permissionKeys.problemManage, target.id);
    const reason = input.reason.trim();
    const now = new Date();

    let handoffId: string;
    try {
      handoffId = await this.prisma.$transaction(async (transaction) => {
        // The problem cannot move while this command runs: the same group, the same version, not final.
        const current = await transaction.problem.findFirst({
          where: { id: problemId },
          select: { status: true, groupId: true, version: true, ownerUserId: true },
        });
        if (current === null) throw new ProblemError(problemErrorCodes.notFound);
        if (current.version !== problem.version || current.groupId !== (problem.group?.id ?? null)) {
          throw new ProblemError(problemErrorCodes.handoffConflict);
        }
        if ((problemFinalStatuses as readonly string[]).includes(current.status)) {
          throw new ProblemError(problemErrorCodes.finalStatus);
        }
        if (!autoAccept) {
          const created = await transaction.problemHandoff.create({
            data: {
              problemId,
              status: 'PENDING',
              fromGroupId: current.groupId,
              toGroupId: target.id,
              fromOrganizationalUnitId: problem.organizationalUnit.id,
              toOrganizationalUnitId: target.organizationalUnitId,
              reason,
              requestedByUserId: viewer.userId,
            },
            select: { id: true },
          });
          await transaction.problemEvent.create({
            data: {
              problemId,
              action: problemEventActions.handoffRequested,
              actorUserId: viewer.userId,
              detail: { handoffId: created.id, fromGroupId: current.groupId, toGroupId: target.id, toGroup: target.name, reason } as never,
            },
          });
          await recordAuditEntry(transaction as unknown as AuditLogTransactionalClient, {
            action: auditLogActions.problemHandoffRequested,
            entityType: auditLogEntityTypes.problem,
            entityId: problemId,
            organizationalUnitId: problem.organizationalUnit.id,
            metadata: { handoffId: created.id, fromGroupId: current.groupId, toGroupId: target.id, reason } as never,
            actorUserId: viewer.userId,
          });
          return created.id;
        }
        // The requester runs both groups: record the request and its acceptance together.
        const ownerUserId = await this.resolveOwner(transaction, current.ownerUserId, target.id, viewer.userId, current.status);
        const created = await transaction.problemHandoff.create({
          data: {
            problemId,
            status: 'ACCEPTED',
            fromGroupId: current.groupId,
            toGroupId: target.id,
            fromOrganizationalUnitId: problem.organizationalUnit.id,
            toOrganizationalUnitId: target.organizationalUnitId,
            reason,
            requestedByUserId: viewer.userId,
            decidedByUserId: viewer.userId,
            decidedAt: now,
          },
          select: { id: true },
        });
        const moved = await transaction.problem.updateMany({
          where: { id: problemId, version: current.version, groupId: current.groupId },
          data: {
            groupId: target.id,
            organizationalUnitId: target.organizationalUnitId,
            ownerUserId,
            version: { increment: 1 },
          },
        });
        if (moved.count === 0) throw new ProblemError(problemErrorCodes.handoffConflict);
        await transaction.problemEvent.create({
          data: {
            problemId,
            action: problemEventActions.handoffAccepted,
            actorUserId: viewer.userId,
            detail: {
              handoffId: created.id,
              fromGroupId: current.groupId,
              toGroupId: target.id,
              toGroup: target.name,
              autoAccepted: true,
            } as never,
          },
        });
        await recordAuditEntry(transaction as unknown as AuditLogTransactionalClient, {
          action: auditLogActions.problemHandoffAccepted,
          entityType: auditLogEntityTypes.problem,
          entityId: problemId,
          organizationalUnitId: target.organizationalUnitId,
          metadata: { handoffId: created.id, fromGroupId: current.groupId, toGroupId: target.id, autoAccepted: true } as never,
          actorUserId: viewer.userId,
        });
        return created.id;
      });
    } catch (error) {
      // A concurrent request won the single-pending fence.
      if (typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002') {
        throw new ProblemError(problemErrorCodes.handoffPending);
      }
      throw error;
    }
    if (autoAccept) {
      this.notify('handoff-accepted', (notifier) => notifier.groupAssigned(problemId, viewer.userId, problemHandoffOccurrence(handoffId)));
    } else {
      this.notify('handoff-requested', (notifier) => notifier.handoffRequested(problemId, handoffId, target.id, viewer.userId));
    }
    return this.result(viewer, problemId, handoffId);
  }

  async accept(viewer: ProblemViewer, problemId: string, handoffId: string) {
    const scope = await this.access.require(viewer, permissionKeys.problemManage);
    // Reading the problem first keeps the same not-found answer as the detail.
    await this.problems.get(viewer, problemId);
    const handoff = await this.loadPending(problemId, handoffId);
    // Only the receiving side decides.
    await this.access.requireGroupAuthority(viewer, permissionKeys.problemManage, handoff.toGroupId);
    await this.access.requireUnitInScope(scope, handoff.toOrganizationalUnitId);
    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.problem.findFirst({
        where: { id: problemId },
        select: { status: true, groupId: true, version: true, ownerUserId: true },
      });
      if (current === null) throw new ProblemError(problemErrorCodes.notFound);
      if ((problemFinalStatuses as readonly string[]).includes(current.status)) {
        throw new ProblemError(problemErrorCodes.finalStatus);
      }
      if (current.groupId !== handoff.fromGroupId) throw new ProblemError(problemErrorCodes.handoffConflict);
      const ownerUserId = await this.resolveOwner(transaction, current.ownerUserId, handoff.toGroupId, viewer.userId, current.status);
      const decided = await transaction.problemHandoff.updateMany({
        where: { id: handoffId, status: 'PENDING' },
        data: { status: 'ACCEPTED', decidedByUserId: viewer.userId, decidedAt: now },
      });
      if (decided.count === 0) throw new ProblemError(problemErrorCodes.handoffNotFound);
      const moved = await transaction.problem.updateMany({
        where: { id: problemId, version: current.version, groupId: current.groupId },
        data: {
          groupId: handoff.toGroupId,
          organizationalUnitId: handoff.toOrganizationalUnitId,
          ownerUserId,
          version: { increment: 1 },
        },
      });
      if (moved.count === 0) throw new ProblemError(problemErrorCodes.handoffConflict);
      await transaction.problemEvent.create({
        data: {
          problemId,
          action: problemEventActions.handoffAccepted,
          actorUserId: viewer.userId,
          detail: { handoffId, fromGroupId: handoff.fromGroupId, toGroupId: handoff.toGroupId } as never,
        },
      });
      await recordAuditEntry(transaction as unknown as AuditLogTransactionalClient, {
        action: auditLogActions.problemHandoffAccepted,
        entityType: auditLogEntityTypes.problem,
        entityId: problemId,
        organizationalUnitId: handoff.toOrganizationalUnitId,
        metadata: { handoffId, fromGroupId: handoff.fromGroupId, toGroupId: handoff.toGroupId } as never,
        actorUserId: viewer.userId,
      });
    });
    this.notify('handoff-accepted', (notifier) => notifier.groupAssigned(problemId, viewer.userId, problemHandoffOccurrence(handoffId)));
    this.notify('handoff-decided', (notifier) => notifier.handoffDecided(problemId, handoffId, handoff.requestedByUserId, viewer.userId));
    return this.result(viewer, problemId, handoffId);
  }

  async reject(viewer: ProblemViewer, problemId: string, handoffId: string, input: ProblemHandoffDecisionDto) {
    const scope = await this.access.require(viewer, permissionKeys.problemManage);
    await this.problems.get(viewer, problemId);
    const handoff = await this.loadPending(problemId, handoffId);
    await this.access.requireGroupAuthority(viewer, permissionKeys.problemManage, handoff.toGroupId);
    await this.access.requireUnitInScope(scope, handoff.toOrganizationalUnitId);
    const reason = (input.reason ?? '').trim();
    await this.decide(viewer, problemId, handoff, 'REJECTED', reason, auditLogActions.problemHandoffRejected, problemEventActions.handoffRejected);
    this.notify('handoff-decided', (notifier) => notifier.handoffDecided(problemId, handoffId, handoff.requestedByUserId, viewer.userId));
    return this.result(viewer, problemId, handoffId);
  }

  /** The requester or a manager of the group that still holds the problem. */
  async cancel(viewer: ProblemViewer, problemId: string, handoffId: string, input: ProblemHandoffDecisionDto) {
    await this.access.require(viewer, permissionKeys.problemManage);
    const problem = await this.problems.get(viewer, problemId);
    const handoff = await this.loadPending(problemId, handoffId);
    const requester = handoff.requestedByUserId === viewer.userId;
    if (!requester) {
      await this.access.requireGroupAuthority(viewer, permissionKeys.problemManage, problem.group?.id ?? null);
    }
    const reason = (input.reason ?? '').trim() === '' ? 'handoff_cancelled' : (input.reason ?? '').trim();
    await this.decide(viewer, problemId, handoff, 'CANCELLED', reason, auditLogActions.problemHandoffCancelled, problemEventActions.handoffCancelled);
    return this.result(viewer, problemId, handoffId);
  }

  private async decide(
    viewer: ProblemViewer,
    problemId: string,
    handoff: { id: string; fromGroupId: string | null; toGroupId: string; fromOrganizationalUnitId: string },
    status: 'REJECTED' | 'CANCELLED',
    reason: string,
    auditAction: (typeof auditLogActions)[keyof typeof auditLogActions],
    eventAction: string,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      const decided = await transaction.problemHandoff.updateMany({
        where: { id: handoff.id, status: 'PENDING' },
        data: { status, decidedByUserId: viewer.userId, decidedAt: now, decisionReason: reason },
      });
      if (decided.count === 0) throw new ProblemError(problemErrorCodes.handoffNotFound);
      await transaction.problemEvent.create({
        data: {
          problemId,
          action: eventAction,
          actorUserId: viewer.userId,
          detail: { handoffId: handoff.id, fromGroupId: handoff.fromGroupId, toGroupId: handoff.toGroupId, reason } as never,
        },
      });
      await recordAuditEntry(transaction as unknown as AuditLogTransactionalClient, {
        action: auditAction,
        entityType: auditLogEntityTypes.problem,
        entityId: problemId,
        organizationalUnitId: handoff.fromOrganizationalUnitId,
        metadata: { handoffId: handoff.id, fromGroupId: handoff.fromGroupId, toGroupId: handoff.toGroupId } as never,
        actorUserId: viewer.userId,
      });
    });
  }

  private async result(viewer: ProblemViewer, problemId: string, handoffId: string) {
    const [handoff, problem] = await Promise.all([
      this.prisma.problemHandoff.findUniqueOrThrow({ where: { id: handoffId }, select: handoffSelect }),
      this.problems.get(viewer, problemId),
    ]);
    return { handoff: toProblemHandoffView(handoff), problem };
  }

  private async loadPending(problemId: string, handoffId: string) {
    const handoff = await this.prisma.problemHandoff.findFirst({
      where: { id: handoffId, problemId, status: 'PENDING' },
      select: { id: true, status: true, fromGroupId: true, toGroupId: true, fromOrganizationalUnitId: true, toOrganizationalUnitId: true, requestedByUserId: true },
    });
    if (handoff === null) throw new ProblemError(problemErrorCodes.handoffNotFound);
    return handoff;
  }

  private async loadTargetGroup(groupId: string): Promise<HandoffTarget> {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { id: true, name: true, isProblemGroup: true, organizationalUnitId: true },
    });
    if (group === null) throw new ProblemError(problemErrorCodes.groupNotFound);
    if (!group.isProblemGroup) throw new ProblemError(problemErrorCodes.notProblemGroup);
    return group;
  }

  /**
   * The receiving group needs an owner from its own group: the current owner
   * stays when eligible, otherwise the manager who accepts takes the problem.
   * A problem under investigation may not end up without an owner (§5).
   */
  private async resolveOwner(
    client: Prisma.TransactionClient,
    currentOwnerUserId: string | null,
    groupId: string,
    acceptingUserId: string,
    status: string,
  ): Promise<string | null> {
    // W7.33 (BA-problems-15): the receiving unit decides who may own the problem —
    // a manager whose grant stops at another unit tree is not eligible here.
    const target = await client.group.findUnique({
      where: { id: groupId },
      select: { organizationalUnit: { select: { ouPath: true } } },
    });
    if (target === null) throw new ProblemError(problemErrorCodes.groupNotFound);
    const ownerWhere = eligibleProblemOwnerWhere({ groupId, unitPath: target.organizationalUnit.ouPath });
    const eligible = async (userId: string): Promise<boolean> =>
      (await client.user.count({ where: { id: userId, ...ownerWhere } })) > 0;
    if (currentOwnerUserId !== null && (await eligible(currentOwnerUserId))) return currentOwnerUserId;
    if (await eligible(acceptingUserId)) return acceptingUserId;
    if (status === 'NEW') return null;
    throw new ProblemError(problemErrorCodes.requirementMissing, 'owner');
  }

}
