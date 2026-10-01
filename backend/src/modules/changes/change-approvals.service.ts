import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { auditLogActions, auditLogEntityTypes } from '../audit-log/audit-log.constants';
import type { AuditLogTransactionalClient } from '../audit-log/audit-log.types';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import { permissionKeys } from '../authorization/authorization.constants';
import { ChangeAccessService, type ChangeViewer } from './change-access.service';
import { computeChangeQuorum, evaluateChangeVotes } from './change-cab';
import { ChangeNotifier } from './change-notifier';
import { ChangeScheduleService } from './change-schedule.service';
import type { ChangeVoteDto } from './changes.dto';
import { ChangeError, changeErrorCodes, changeEventActions, changeLimits } from './changes.constants';
import { ChangesService } from './changes.service';
import { loadCabVoterIds } from './load-cab-voters';

const userSelect = { id: true, displayName: true, email: true } as const;

/**
 * Paket 3.4 (§8): CAB votes. Members of the change's CAB group with
 * change.approve vote once per round; the requester never votes; one
 * rejection rejects, the quorum approves and schedules the change.
 */
@Injectable()
export class ChangeApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ChangeAccessService,
    private readonly changes: ChangesService,
    private readonly schedule: ChangeScheduleService,
    @Optional() private readonly notifier?: ChangeNotifier,
  ) {}

  /** Voters of a change: CAB members with change.approve, without the requester. */
  async eligibleVoters(cabGroupId: string | null, requesterUserId: string | null): Promise<string[]> {
    if (cabGroupId === null) return [];
    return (await loadCabVoterIds(this.prisma, cabGroupId)).filter((id) => id !== requesterUserId);
  }

  async overview(viewer: ChangeViewer, id: string) {
    const scope = await this.access.require(viewer, permissionKeys.changeRead);
    const change = await this.changes.loadInScope(id, scope, viewer);
    const configuration = await this.access.configuration();
    const [eligible, votes] = await Promise.all([
      this.eligibleVoters(change.cabGroupId, change.requesterUserId),
      this.prisma.changeApproval.findMany({
        where: { changeId: id },
        select: { id: true, round: true, decision: true, comment: true, decidedAt: true, approverUserId: true, approver: { select: userSelect } },
        orderBy: [{ round: 'desc' }, { decidedAt: 'asc' }],
        take: 500,
      }),
    ]);
    const current = votes.filter((vote) => vote.round === change.approvalRound);
    const quorum = computeChangeQuorum(change.type, configuration, eligible.length);
    const voters = eligible.length === 0 ? [] : await this.prisma.user.findMany({ where: { id: { in: eligible } }, select: userSelect, orderBy: { displayName: 'asc' } });
    const votedIds = new Set(current.map((vote) => vote.approverUserId));
    const isMember = await this.access.isCabMember(viewer, change.cabGroupId);
    return {
      round: change.approvalRound,
      quorum,
      approvals: current.filter((vote) => vote.decision === 'APPROVED').length,
      cabGroup: change.cabGroup,
      voters: voters.map((voter) => ({ ...voter, voted: votedIds.has(voter.id) })),
      votes: votes.map((vote) => ({
        id: vote.id,
        round: vote.round,
        decision: vote.decision,
        comment: vote.comment,
        decidedAt: vote.decidedAt.toISOString(),
        approver: vote.approver,
      })),
      canVote: change.status === 'AUTHORIZATION' && isMember && change.requesterUserId !== viewer.userId && !votedIds.has(viewer.userId),
      isRequester: change.requesterUserId === viewer.userId,
    };
  }

  async vote(viewer: ChangeViewer, id: string, input: ChangeVoteDto) {
    const scope = await this.access.require(viewer, permissionKeys.changeApprove);
    const change = await this.changes.loadInScope(id, scope, viewer);
    const configuration = await this.access.configuration();
    if (change.status !== 'AUTHORIZATION') throw new ChangeError(changeErrorCodes.notInAuthorization);
    if (input.version !== change.version) throw new ChangeError(changeErrorCodes.versionConflict);
    if (change.requesterUserId === viewer.userId) throw new ChangeError(changeErrorCodes.notApprover, 'requester');
    if (!(await this.access.isCabMember(viewer, change.cabGroupId))) throw new ChangeError(changeErrorCodes.notApprover);
    const comment = input.comment?.trim() || null;
    if (input.decision === 'REJECTED' && (comment === null || comment.length < changeLimits.reasonMin)) {
      throw new ChangeError(changeErrorCodes.reasonRequired);
    }
    const eligible = await this.eligibleVoters(change.cabGroupId, change.requesterUserId);
    const quorum = computeChangeQuorum(change.type, configuration, eligible.length);
    const round = change.approvalRound;
    const now = new Date();

    const outcome = await this.prisma.$transaction(async (transaction) => {
      try {
        await transaction.changeApproval.create({
          data: { changeId: id, round, approverUserId: viewer.userId, decision: input.decision, comment },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ChangeError(changeErrorCodes.alreadyVoted);
        throw error;
      }
      const votes = await transaction.changeApproval.findMany({
        where: { changeId: id, round },
        select: { approverUserId: true, decision: true },
      });
      const result = evaluateChangeVotes(votes, quorum);
      const target = result === 'APPROVED' ? 'SCHEDULED' : result === 'REJECTED' ? 'REJECTED' : null;
      const updated = await transaction.changeRequest.updateMany({
        where: { id, version: change.version, status: 'AUTHORIZATION' },
        data: {
          ...(target === null ? {} : { status: target }),
          ...(target === 'SCHEDULED' ? { authorizedAt: now } : {}),
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) throw new ChangeError(changeErrorCodes.versionConflict);
      await transaction.changeEvent.create({
        data: {
          changeId: id,
          action: changeEventActions.approval,
          actorUserId: viewer.userId,
          detail: { round, decision: input.decision, comment, approvals: votes.filter((vote) => vote.decision === 'APPROVED').length, quorum } as never,
        },
      });
      if (target !== null) {
        await transaction.changeEvent.create({
          data: { changeId: id, action: changeEventActions.status, actorUserId: viewer.userId, detail: { from: 'AUTHORIZATION', to: target, action: 'cab', round } as never },
        });
      }
      await recordAuditEntry(transaction as unknown as AuditLogTransactionalClient, {
        action: auditLogActions.changeApprovalRecorded,
        entityType: auditLogEntityTypes.change,
        entityId: id,
        metadata: { round, decision: input.decision, result } as never,
        actorUserId: viewer.userId,
      });
      return result;
    });
    if (outcome === 'APPROVED') await this.schedule.syncDowntime(id, viewer.userId);
    if (outcome !== 'PENDING') {
      const notifier = this.notifier;
      if (notifier !== undefined) notifier.run('decided', () => notifier.decided(id, outcome, round, viewer.userId));
    }
    return this.changes.get(viewer, id);
  }
}
