import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { auditLogActions, auditLogEntityTypes } from '../../audit-log/audit-log.constants';
import { recordAuditEntry } from '../../audit-log/record-audit-entry';
import type { PrivacyActor } from '../privacy-actor';
import { PrivacyConfigurationLoader } from '../privacy-configuration.loader';
import { PrivacyIdentityConfirmer } from '../privacy-identity-confirmer';
import {
  anonymizationBlockReasons,
  privacyErrorCodes,
  privacyJobs,
  privacyLimits,
  privacyQueueName,
} from '../privacy.constants';
import { PrivacyError } from '../privacy.error';
import { AnonymizationService, type ErasureView } from './anonymization.service';
import { readTombstoneKey } from './tombstones';

/**
 * Paket 2.6 (§6.1): request, four-eyes approval and cancellation (API side).
 * The worker executes (`anonymize-user` job, id `anonymize-user-<erasureId>`).
 */
@Injectable()
export class AnonymizationRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly anonymization: AnonymizationService,
    private readonly identityConfirmer: PrivacyIdentityConfirmer,
    private readonly configurationLoader: PrivacyConfigurationLoader,
    @InjectQueue(privacyQueueName) private readonly queue: Queue,
  ) {}

  async request(
    userId: string,
    input: { readonly confirmEmail: string; readonly code?: string; readonly deleteOwnAttachments?: boolean; readonly requestId?: string },
    actor: PrivacyActor,
    now: Date = new Date(),
  ): Promise<ErasureView> {
    const actorId = actor.principal.subjectId;
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (user === null) throw new PrivacyError(privacyErrorCodes.notFound);
    const blockers = await this.anonymization.blockers(userId, actorId);
    if (blockers.length > 0) throw new PrivacyError(privacyErrorCodes.anonymizationBlocked, { reasons: blockers });
    if (readTombstoneKey() === null) {
      throw new PrivacyError(privacyErrorCodes.anonymizationBlocked, { reasons: ['tombstone_key_missing'] });
    }
    if (input.confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
      throw new PrivacyError(privacyErrorCodes.confirmationMismatch);
    }
    if (input.requestId !== undefined) {
      const linked = await this.prisma.dataSubjectRequest.count({ where: { id: input.requestId } });
      if (linked === 0) throw new PrivacyError(privacyErrorCodes.invalidInput, { field: 'requestId' });
    }
    const method = await this.identityConfirmer.confirm(actor, input.code, now);
    const configuration = await this.configurationLoader.load();
    const preview = await this.anonymization.preview(userId);
    const pseudonym = await this.anonymization.allocatePseudonym();
    const needsApproval = configuration.requireSecondApprover;
    const deleteOwnAttachments = input.deleteOwnAttachments ?? configuration.deleteOwnAttachmentsDefault;

    const erasureId = await this.prisma.$transaction(async (transaction) => {
      // Serialises concurrent requests for the same user (double click, two admins).
      await transaction.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      const open = await transaction.privacyErasure.count({
        where: { userId, status: { in: ['PENDING_APPROVAL', 'QUEUED', 'RUNNING'] } },
      });
      if (open > 0) {
        throw new PrivacyError(privacyErrorCodes.anonymizationBlocked, {
          reasons: [anonymizationBlockReasons.erasureInProgress],
        });
      }
      const created = await transaction.privacyErasure.create({
        data: {
          userId,
          pseudonym: pseudonym.displayName,
          status: needsApproval ? 'PENDING_APPROVAL' : 'QUEUED',
          deleteOwnAttachments,
          requestId: input.requestId ?? null,
          preview: preview as never,
          requestedByUserId: actorId,
          approvalDeadline: needsApproval
            ? new Date(now.getTime() + privacyLimits.approvalWindowDays * 86_400_000)
            : null,
        },
        select: { id: true },
      });
      await recordAuditEntry(transaction as never, {
        action: auditLogActions.privacyErasureRequested,
        entityType: auditLogEntityTypes.privacyErasure,
        entityId: created.id,
        // No name or e-mail: this entry must survive the anonymization unchanged.
        metadata: { userId, needsApproval, deleteOwnAttachments, identity: method, requestId: input.requestId ?? null },
        actorUserId: actorId,
        requestId: actor.requestId,
      });
      return created.id;
    });
    if (!needsApproval) await this.enqueue(erasureId);
    return this.anonymization.getErasure(erasureId);
  }

  async approve(erasureId: string, code: string | undefined, actor: PrivacyActor, now: Date = new Date()): Promise<ErasureView> {
    const actorId = actor.principal.subjectId;
    const erasure = await this.prisma.privacyErasure.findUnique({
      where: { id: erasureId },
      select: { id: true, userId: true, status: true, requestedByUserId: true, approvalDeadline: true },
    });
    if (erasure === null) throw new PrivacyError(privacyErrorCodes.notFound);
    if (erasure.status !== 'PENDING_APPROVAL' || (erasure.approvalDeadline !== null && erasure.approvalDeadline < now)) {
      throw new PrivacyError(privacyErrorCodes.invalidTransition);
    }
    if (erasure.requestedByUserId === actorId) throw new PrivacyError(privacyErrorCodes.approverMustDiffer);
    const blockers = (await this.anonymization.blockers(erasure.userId, actorId)).filter(
      (reason) => reason !== anonymizationBlockReasons.erasureInProgress,
    );
    if (blockers.length > 0) throw new PrivacyError(privacyErrorCodes.anonymizationBlocked, { reasons: blockers });
    const method = await this.identityConfirmer.confirm(actor, code, now);
    await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.privacyErasure.updateMany({
        where: { id: erasureId, status: 'PENDING_APPROVAL' },
        data: { status: 'QUEUED', approvedByUserId: actorId },
      });
      if (updated.count === 0) throw new PrivacyError(privacyErrorCodes.invalidTransition);
      await recordAuditEntry(transaction as never, {
        action: auditLogActions.privacyErasureApproved,
        entityType: auditLogEntityTypes.privacyErasure,
        entityId: erasureId,
        metadata: { userId: erasure.userId, identity: method },
        actorUserId: actorId,
        requestId: actor.requestId,
      });
    });
    await this.enqueue(erasureId);
    return this.anonymization.getErasure(erasureId);
  }

  /** Before execution starts (PENDING_APPROVAL or QUEUED). */
  async cancel(erasureId: string, actor: PrivacyActor): Promise<ErasureView> {
    await this.prisma.$transaction(async (transaction) => {
      const erasure = await transaction.privacyErasure.findUnique({ where: { id: erasureId }, select: { userId: true } });
      if (erasure === null) throw new PrivacyError(privacyErrorCodes.notFound);
      const updated = await transaction.privacyErasure.updateMany({
        where: { id: erasureId, status: { in: ['PENDING_APPROVAL', 'QUEUED'] } },
        data: { status: 'CANCELLED', error: 'cancelled' },
      });
      if (updated.count === 0) throw new PrivacyError(privacyErrorCodes.invalidTransition);
      await recordAuditEntry(transaction as never, {
        action: auditLogActions.privacyErasureCancelled,
        entityType: auditLogEntityTypes.privacyErasure,
        entityId: erasureId,
        metadata: { userId: erasure.userId },
        actorUserId: actor.principal.subjectId,
        requestId: actor.requestId,
      });
    });
    // A queued job becomes a no-op (the claim needs QUEUED); removing it is best effort.
    await this.queue.remove(`${privacyJobs.anonymize}-${erasureId}`).catch(() => undefined);
    return this.anonymization.getErasure(erasureId);
  }

  private async enqueue(erasureId: string): Promise<void> {
    await this.queue.add(
      privacyJobs.anonymize,
      { erasureId },
      { jobId: `${privacyJobs.anonymize}-${erasureId}`, attempts: 1, removeOnComplete: true, removeOnFail: { count: 20 } },
    );
  }
}
