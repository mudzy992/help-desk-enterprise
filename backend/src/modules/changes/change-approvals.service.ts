import { Injectable, Optional } from '@nestjs/common';
import { TransactionalOutboxService } from '../../common/outbox/transactional-outbox.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { auditLogActions, auditLogEntityTypes } from '../audit-log/audit-log.constants';
import type { AuditLogTransactionalClient } from '../audit-log/audit-log.types';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import { permissionKeys } from '../authorization/authorization.constants';
import { ChangeAccessService, type ChangeViewer } from './change-access.service';
import { enqueueChangeDowntimeSync } from './change-downtime-outbox';
import { computeChangeQuorum, evaluateChangeVotes } from './change-cab';
import { changeVoterSnapshotOf, countSnapshotVotes, type ChangeVoterSnapshot } from './change-voter-snapshot';
import { ChangeNotifier } from './change-notifier';
import type { ChangeVoteDto } from './changes.dto';
import { ChangeError, changeErrorCodes, changeEventActions, changeLimits } from './changes.constants';
import { ChangesService } from './changes.service';
import { loadCabVoterIds } from './load-cab-voters';
import { changeListLimits, changeListLimit, changeOverFetch, changePage } from './change-pagination';

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
    private readonly outbox: TransactionalOutboxService,
    @Optional() private readonly notifier?: ChangeNotifier,
  ) {}

  /** Voters of a change: CAB members with change.approve, without the requester. */
  async eligibleVoters(cabGroupId: string | null, requesterUserId: string | null): Promise<string[]> {
    if (cabGroupId === null) return [];
    return (await loadCabVoterIds(this.prisma, cabGroupId)).filter((id) => id !== requesterUserId);
  }

  /**
   * BA-changes-06 (W7.47): the voter set and quorum the round was opened with.
   * Read from the `status` event that entered AUTHORIZATION; a round opened
   * before this release (or an event written by an older replica) falls back to
   * the live membership rule, so an in-flight round is never blocked.
   */
  async voterSnapshot(
    change: { readonly id: string; readonly approvalRound: number; readonly cabGroupId: string | null; readonly requesterUserId: string | null; readonly type: Parameters<typeof computeChangeQuorum>[0] },
    configuration: Parameters<typeof computeChangeQuorum>[1],
  ): Promise<{ readonly snapshot: ChangeVoterSnapshot; readonly frozen: boolean }> {
    const events = await this.prisma.changeEvent.findMany({
      where: { changeId: change.id, action: changeEventActions.status },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: changeLimits.voterSnapshotEvents,
      select: { detail: true },
    });
    for (const event of events) {
      const snapshot = changeVoterSnapshotOf(event.detail);
      if (snapshot !== null && snapshot.round === change.approvalRound) return { snapshot, frozen: true };
    }
    const voters = await this.eligibleVoters(change.cabGroupId, change.requesterUserId);
    return {
      snapshot: { round: change.approvalRound, voters, quorum: computeChangeQuorum(change.type, configuration, voters.length) },
      frozen: false,
    };
  }

  /**
   * BA-changes-18 (W7.76): the round on the screen and the record behind it.
   *
   * The current round is never paged — it holds at most one vote per voter and
   * the voter set is capped by `cabVotersMax` — because quorum, "who still has
   * to vote" and the redaction notice all describe *this* round. Earlier rounds
   * are, and they used to be cut at 500 across all rounds: a change that ran
   * through a few rejections lost its oldest votes without any hint. They are
   * now a cursor page (`history`), and the current round no longer competes with
   * them for the same 500 rows.
   */
  async overview(
    viewer: ChangeViewer,
    id: string,
    page: { readonly limit?: number; readonly cursor?: string } = {},
  ) {
    const scope = await this.access.require(viewer, permissionKeys.changeRead);
    const change = await this.changes.loadInScope(id, scope, viewer);
    const configuration = await this.access.configuration();
    // BA-changes-06: the panel shows the round's frozen set, not today's CAB,
    // and a frozen round does not pay for the live roster query at all.
    const { snapshot, frozen } = await this.voterSnapshot(change, configuration);
    const limit = changeListLimit(page.limit, changeListLimits.approvals);
    const voteSelect = { id: true, round: true, decision: true, comment: true, decidedAt: true, approverUserId: true, approver: { select: userSelect } } as const;
    const [current, historyRows, commentCount] = await Promise.all([
      this.prisma.changeApproval.findMany({
        where: { changeId: id, round: change.approvalRound },
        select: voteSelect,
        orderBy: [{ decidedAt: 'asc' }, { id: 'asc' }],
        // One row past the cap: a round wider than the voter ceiling is a
        // configuration problem and has to show up as one.
        take: changeLimits.cabVotersMax + 1,
      }),
      this.prisma.changeApproval.findMany({
        where: { changeId: id, round: { not: change.approvalRound } },
        select: voteSelect,
        orderBy: [{ round: 'desc' }, { decidedAt: 'asc' }, { id: 'asc' }],
        take: changeOverFetch(limit),
        ...(page.cursor === undefined ? {} : { cursor: { id: page.cursor }, skip: 1 }),
      }),
      this.prisma.changeApproval.count({ where: { changeId: id, comment: { not: null } } }),
    ]);
    const eligible = frozen ? snapshot.voters : await this.eligibleVoters(change.cabGroupId, change.requesterUserId);
    const quorum = frozen ? snapshot.quorum : computeChangeQuorum(change.type, configuration, eligible.length);
    const eligibleIds = eligible;
    const currentPage = current.slice(0, changeLimits.cabVotersMax);
    const counted = frozen ? countSnapshotVotes(currentPage, snapshot) : currentPage;
    const history = changePage(historyRows, limit);
    // W7.70: the projection reads at most the same number of voters the round may hold.
    const voters = eligibleIds.length === 0 ? [] : await this.prisma.user.findMany({ where: { id: { in: [...eligibleIds] } }, select: userSelect, orderBy: { displayName: 'asc' }, take: changeLimits.cabVotersMax });
    const votedIds = new Set(currentPage.map((vote) => vote.approverUserId));
    const isMember = await this.access.isCabMember(viewer, change.cabGroupId);
    // W7.65: vote comments are deliberation inside the CAB, not part of the
    // lifecycle record a requester, owner or non-voting member needs. Full
    // readers, voters and the author of a comment keep seeing it.
    const level = await this.changes.detailLevelFor(viewer, change, scope);
    const canReadComments = level === 'full' || level === 'voter';
    // Counted in SQL: with paging, "some comment exists" can no longer be read
    // off the page the viewer happens to be on.
    const commentsRedacted = !canReadComments && commentCount > 0;
    return {
      round: change.approvalRound,
      quorum,
      /** True when the round runs on the frozen W7.47 voter set. */
      frozen,
      approvals: counted.filter((vote) => vote.decision === 'APPROVED').length,
      cabGroup: change.cabGroup,
      voters: voters.map((voter) => ({ ...voter, voted: votedIds.has(voter.id) })),
      commentsRedacted,
      /** Votes of the round above, complete unless the CAB exceeds the voter cap. */
      votes: currentPage.map((vote) => this.toVote(vote, canReadComments, viewer.userId)),
      /** True only for a CAB group wider than `cabVotersMax`: a config error. */
      votesTruncated: current.length > currentPage.length,
      /** Votes of earlier rounds, newest round first; `hasMore` says if any are cut. */
      history: {
        items: history.items.map((vote) => this.toVote(vote, canReadComments, viewer.userId)),
        hasMore: history.hasMore,
        nextCursor: history.nextCursor,
      },
      canVote:
        change.status === 'AUTHORIZATION' &&
        isMember &&
        eligibleIds.includes(viewer.userId) &&
        change.requesterUserId !== viewer.userId &&
        !votedIds.has(viewer.userId),
      isRequester: change.requesterUserId === viewer.userId,
    };
  }

  /** W7.65: a vote comment is CAB deliberation, not lifecycle record. */
  private toVote(
    vote: { readonly id: string; readonly round: number; readonly decision: string; readonly comment: string | null; readonly decidedAt: Date; readonly approverUserId: string | null; readonly approver: unknown },
    canReadComments: boolean,
    viewerId: string,
  ) {
    return {
      id: vote.id,
      round: vote.round,
      decision: vote.decision,
      comment: canReadComments || vote.approverUserId === viewerId ? vote.comment : null,
      decidedAt: vote.decidedAt.toISOString(),
      approver: vote.approver,
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
    // BA-changes-06: only the round's frozen voter set may vote, and the
    // quorum is the one the round was opened with.
    const { snapshot } = await this.voterSnapshot(change, configuration);
    if (!snapshot.voters.includes(viewer.userId)) throw new ChangeError(changeErrorCodes.notApprover);
    const quorum = snapshot.quorum;
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
      const recorded = await transaction.changeApproval.findMany({
        where: { changeId: id, round },
        select: { approverUserId: true, decision: true },
      });
      // A vote from outside the frozen set never decides this round.
      const votes = countSnapshotVotes(recorded, snapshot);
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
        organizationalUnitId: change.organizationalUnitId,
      });
      if (target !== null) {
        await enqueueChangeDowntimeSync(this.outbox, transaction, { changeId: id, version: change.version + 1, actorUserId: viewer.userId });
      }
      return result;
    });
    if (outcome !== 'PENDING') {
      const notifier = this.notifier;
      if (notifier !== undefined) notifier.run('decided', () => notifier.decided(id, outcome, round, viewer.userId));
    }
    return this.changes.get(viewer, id);
  }
}
