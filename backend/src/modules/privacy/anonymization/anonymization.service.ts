import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { auditLogActions, auditLogEntityTypes } from '../../audit-log/audit-log.constants';
import { recordAuditEntry } from '../../audit-log/record-audit-entry';
import { authorizationRoleKeys } from '../../authorization/authorization.constants';
import { InboundRawStore } from '../../inbound-email/inbound-raw-store';
import { TICKET_ATTACHMENT_STORAGE } from '../../tickets/attachments/attachment-storage.token';
import type { TicketAttachmentStorage } from '../../tickets/attachments/attachments.types';
import { PrivacyConfigurationLoader } from '../privacy-configuration.loader';
import {
  anonymizationBlockReasons,
  privacyErrorCodes,
  privacyLimits,
  type AnonymizationBlockReason,
  type ErasureStatus,
} from '../privacy.constants';
import { PrivacyError } from '../privacy.error';
import { evaluateAnonymizationBlockers } from './anonymization-blockers';
import { AnonymizationExecutor, type AnonymizationPreview } from './anonymization-executor';
import { redactAuditForSubject } from './audit-redaction';
import { createPseudonym, type Pseudonym } from './pseudonym';
import { scrubAssetTransferSnapshots } from '../../assets/transfers/asset-transfers.service';
import { createTextScrubber, type TextScrubber } from './text-scrubber';
import { computeTombstones, readTombstoneKey } from './tombstones';
import { PRIVACY_ERASURE_LEDGER, type ErasureLedger } from './erasure-ledger';

export const INBOUND_RAW_STORE = Symbol('PRIVACY_INBOUND_RAW_STORE');

export type AnonymizationCandidate = {
  readonly id: string;
  readonly displayName: string;
  readonly email: string;
  readonly inactiveSince: string;
  readonly deactivatedBy: 'directory' | 'admin';
  readonly requestedTickets: number;
};

export type ErasureView = {
  readonly id: string;
  readonly userId: string;
  readonly pseudonym: string;
  readonly status: ErasureStatus;
  readonly deleteOwnAttachments: boolean;
  readonly requestId: string | null;
  readonly preview: AnonymizationPreview | null;
  readonly report: Record<string, unknown> | null;
  readonly error: string | null;
  readonly requestedByUserId: string | null;
  readonly approvedByUserId: string | null;
  readonly approvalDeadline: string | null;
  readonly createdAt: string;
  readonly completedAt: string | null;
};

export type SubjectAssessment = {
  readonly userId: string;
  readonly displayName: string;
  readonly email: string;
  readonly blockers: readonly AnonymizationBlockReason[];
  readonly preview: AnonymizationPreview | null;
  readonly requireSecondApprover: boolean;
  readonly deleteOwnAttachmentsDefault: boolean;
};

const openStatuses: ErasureStatus[] = ['PENDING_APPROVAL', 'QUEUED', 'RUNNING'];
const erasureSelect = {
  id: true,
  userId: true,
  pseudonym: true,
  status: true,
  deleteOwnAttachments: true,
  requestId: true,
  preview: true,
  report: true,
  error: true,
  requestedByUserId: true,
  approvedByUserId: true,
  approvalDeadline: true,
  createdAt: true,
  completedAt: true,
} as const;

type ErasureRecord = {
  readonly id: string;
  readonly userId: string;
  readonly pseudonym: string;
  readonly status: string;
  readonly deleteOwnAttachments: boolean;
  readonly requestId: string | null;
  readonly preview: unknown;
  readonly report: unknown;
  readonly error: string | null;
  readonly requestedByUserId: string | null;
  readonly approvedByUserId: string | null;
  readonly approvalDeadline: Date | null;
  readonly createdAt: Date;
  readonly completedAt: Date | null;
};

/**
 * Paket 2.6 (§6): anonymization of former employees — shared by the API
 * (candidates, assessment) and the worker (execution).
 */
@Injectable()
export class AnonymizationService {
  private readonly logger = new Logger(AnonymizationService.name);
  private readonly executor: AnonymizationExecutor;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configurationLoader: PrivacyConfigurationLoader,
    @Inject(TICKET_ATTACHMENT_STORAGE) attachmentStorage: TicketAttachmentStorage,
    @Inject(INBOUND_RAW_STORE) inboundRawStore: InboundRawStore,
    @Optional() @Inject(PRIVACY_ERASURE_LEDGER) private readonly ledger?: ErasureLedger,
  ) {
    this.executor = new AnonymizationExecutor(prisma, attachmentStorage, inboundRawStore);
  }

  /** Deactivated at least `candidateAfterDays` ago, not anonymized, no legal hold. */
  async candidates(now: Date = new Date()): Promise<AnonymizationCandidate[]> {
    const configuration = await this.configurationLoader.load();
    const before = new Date(now.getTime() - configuration.candidateAfterDays * 86_400_000);
    const rows = await this.prisma.user.findMany({
      where: {
        isActive: false,
        anonymizedAt: null,
        legalHoldAt: null,
        OR: [
          { directoryDeactivatedAt: { lte: before } },
          { directoryDeactivatedAt: null, updatedAt: { lte: before } },
        ],
      },
      select: {
        id: true,
        displayName: true,
        email: true,
        directoryDeactivatedAt: true,
        updatedAt: true,
        _count: { select: { requestedTickets: true } },
      },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: privacyLimits.candidatesListed,
    });
    return rows.map((row) => ({
      id: row.id,
      displayName: row.displayName,
      email: row.email,
      inactiveSince: (row.directoryDeactivatedAt ?? row.updatedAt).toISOString(),
      deactivatedBy: row.directoryDeactivatedAt === null ? 'admin' : 'directory',
      requestedTickets: row._count.requestedTickets,
    }));
  }

  async blockers(userId: string, actorUserId: string | null): Promise<AnonymizationBlockReason[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        isActive: true,
        anonymizedAt: true,
        legalHoldAt: true,
        directoryObjectGuid: true,
        directoryDeactivatedAt: true,
        userRoles: { select: { role: { select: { key: true } } } },
      },
    });
    if (user === null) throw new PrivacyError(privacyErrorCodes.notFound);
    const [otherActiveAdmins, openAssignedTickets, exports, erasures] = await Promise.all([
      this.prisma.user.count({
        where: {
          id: { not: userId },
          isActive: true,
          userRoles: { some: { role: { key: { in: [authorizationRoleKeys.admin, authorizationRoleKeys.superAdmin] } } } },
        },
      }),
      this.prisma.ticket.count({
        where: { assignedUserId: userId, status: { notIn: ['RESOLVED', 'CLOSED', 'ARCHIVED'] } },
      }),
      this.prisma.privacyExport.count({ where: { subjectUserId: userId, status: { in: ['QUEUED', 'RUNNING'] } } }),
      this.prisma.privacyErasure.count({ where: { userId, status: { in: openStatuses } } }),
    ]);
    return evaluateAnonymizationBlockers({
      isActive: user.isActive,
      anonymizedAt: user.anonymizedAt,
      legalHoldAt: user.legalHoldAt,
      directoryObjectGuid: user.directoryObjectGuid,
      directoryDeactivatedAt: user.directoryDeactivatedAt,
      roleKeys: user.userRoles.map((row) => row.role.key),
      otherActiveAdmins,
      openAssignedTickets,
      exportInProgress: exports > 0,
      erasureInProgress: erasures > 0,
      isSelf: actorUserId === userId,
    });
  }

  /** §6.1 korak 3: blockers and a dry run (counts, replacements, three examples). */
  async assess(userId: string, actorUserId: string): Promise<SubjectAssessment> {
    const configuration = await this.configurationLoader.load();
    const blockers = await this.blockers(userId, actorUserId);
    const subject = await this.loadSubject(userId);
    const preview = blockers.includes(anonymizationBlockReasons.alreadyAnonymized)
      ? null
      : await this.executor.preview({
          userId,
          email: subject.email,
          replacement: previewReplacement,
          scrubber: subject.scrubberFor(previewReplacement),
          deleteOwnAttachments: false,
        });
    return {
      userId,
      displayName: subject.displayName,
      email: subject.email,
      blockers,
      preview,
      requireSecondApprover: configuration.requireSecondApprover,
      deleteOwnAttachmentsDefault: configuration.deleteOwnAttachmentsDefault,
    };
  }

  async preview(userId: string): Promise<AnonymizationPreview> {
    const subject = await this.loadSubject(userId);
    return this.executor.preview({
      userId,
      email: subject.email,
      replacement: previewReplacement,
      scrubber: subject.scrubberFor(previewReplacement),
      deleteOwnAttachments: false,
    });
  }

  /** A pseudonym tag not used by an earlier erasure (4 hex, 6 after collisions). */
  async allocatePseudonym(): Promise<Pseudonym> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = createPseudonym(attempt);
      const taken = await this.prisma.privacyErasure.count({ where: { pseudonym: candidate.displayName } });
      if (taken === 0) return candidate;
    }
    throw new Error('pseudonym_allocation_failed');
  }

  async listErasures(): Promise<ErasureView[]> {
    const rows = (await this.prisma.privacyErasure.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: privacyLimits.candidatesListed,
      select: erasureSelect,
    })) as ErasureRecord[];
    return rows.map(toErasureView);
  }

  async getErasure(id: string): Promise<ErasureView> {
    const row = (await this.prisma.privacyErasure.findUnique({ where: { id }, select: erasureSelect })) as ErasureRecord | null;
    if (row === null) throw new PrivacyError(privacyErrorCodes.notFound);
    return toErasureView(row);
  }

  /** Worker: approvals past their deadline are cancelled; forgotten or crashed jobs are resumed. */
  async maintain(now: Date = new Date()): Promise<ErasureView[]> {
    await this.prisma.privacyErasure.updateMany({
      where: { status: 'PENDING_APPROVAL', approvalDeadline: { lt: now } },
      data: { status: 'CANCELLED', error: 'approval_expired' },
    });
    const pending = await this.prisma.privacyErasure.findMany({
      where: {
        OR: [
          { status: 'QUEUED', updatedAt: { lt: new Date(now.getTime() - 5 * 60_000) } },
          { status: 'RUNNING', startedAt: { lt: new Date(now.getTime() - privacyLimits.staleJobMs) } },
        ],
      },
      select: { id: true },
      take: 5,
    });
    const finished: ErasureView[] = [];
    for (const row of pending) {
      const view = await this.execute(row.id).catch((error: unknown) => {
        this.logger.warn(`privacy_erasure_resume_failed erasure=${row.id} reason=${errorText(error)}`);
        return null;
      });
      if (view !== null) finished.push(view);
    }
    return finished;
  }

  /**
   * Worker: runs one erasure. Idempotent — a crashed run is resumed (RUNNING
   * older than 30 min is taken over). The `User` row changes last, in one
   * transaction with the tombstones and the COMPLETED status.
   */
  async execute(erasureId: string, now: Date = new Date()): Promise<ErasureView | null> {
    const claimed = await this.prisma.privacyErasure.updateMany({
      where: {
        id: erasureId,
        OR: [
          { status: 'QUEUED' },
          { status: 'RUNNING', startedAt: { lt: new Date(now.getTime() - privacyLimits.staleJobMs) } },
        ],
      },
      data: { status: 'RUNNING', startedAt: now, error: null },
    });
    if (claimed.count === 0) return null;
    const erasure = (await this.prisma.privacyErasure.findUniqueOrThrow({
      where: { id: erasureId },
      select: erasureSelect,
    })) as ErasureRecord;
    try {
      const blockers = (await this.blockers(erasure.userId, null)).filter(
        (reason) => reason !== anonymizationBlockReasons.erasureInProgress,
      );
      if (blockers.includes(anonymizationBlockReasons.alreadyAnonymized)) {
        return this.finish(erasureId, 'COMPLETED', { note: 'already_anonymized' });
      }
      if (blockers.length > 0) {
        return this.finish(erasureId, 'FAILED', null, `blocked:${blockers.join(',')}`);
      }
      const key = readTombstoneKey();
      if (key === null) return this.finish(erasureId, 'FAILED', null, 'tombstone_key_missing');

      const subject = await this.loadSubject(erasure.userId);
      const replacement = erasure.pseudonym;
      const scrubber = subject.scrubberFor(replacement);
      const { counts, pausedScheduleIds } = await this.executor.execute({
        userId: erasure.userId,
        email: subject.email,
        replacement,
        scrubber,
        deleteOwnAttachments: erasure.deleteOwnAttachments,
      });
      const scope = await this.executor.ticketScope(erasure.userId);
      const audit = await redactAuditForSubject(this.prisma, {
        userId: erasure.userId,
        email: subject.email,
        ticketIds: scope.scrub,
        scrubber,
        erasureId,
        actorUserId: erasure.requestedByUserId,
      });
      const tombstones = computeTombstones(key, {
        email: subject.email,
        directoryObjectGuid: subject.directoryObjectGuid,
        entraObjectId: subject.entraObjectId,
      });
      const report = { ...counts, auditRedacted: audit.redacted, auditSealed: audit.sealed };
      await this.finalizeUser(erasure, tombstones, report, pausedScheduleIds, now);
      await this.appendLedger(erasure, tombstones, now);
      return this.getErasure(erasureId);
    } catch (error) {
      this.logger.warn(`privacy_erasure_failed erasure=${erasureId} reason=${errorText(error)}`);
      return this.finish(erasureId, 'FAILED', null, errorText(error));
    }
  }

  private async finalizeUser(
    erasure: ErasureRecord,
    tombstones: string[],
    report: Record<string, number>,
    pausedScheduleIds: readonly string[],
    now: Date,
  ): Promise<void> {
    const tag = erasure.pseudonym.slice(erasure.pseudonym.lastIndexOf('#') + 1);
    for (let attempt = 0; ; attempt += 1) {
      const pseudonym = createPseudonym(attempt);
      try {
        await this.prisma.$transaction(async (transaction) => {
          await transaction.user.update({
            where: { id: erasure.userId },
            data: {
              email: pseudonym.email,
              displayName: erasure.pseudonym,
              isActive: false,
              anonymizedAt: now,
              localPasswordHash: null,
              mustChangePassword: false,
              passwordChangedAt: null,
              preferredLocale: null,
              keyboardShortcuts: null,
              entraObjectId: null,
              directoryObjectGuid: null,
              distinguishedName: null,
              company: null,
              department: null,
              managerUserId: null,
              directorySyncedAt: null,
              authzVersion: { increment: 1 },
            },
          });
          // Nobody reports to an anonymized person any more.
          await transaction.user.updateMany({ where: { managerUserId: erasure.userId }, data: { managerUserId: null } });
          // Paket 3.2 C9: frozen transfer records print the pseudonym; the person is no signatory any more.
          const assetTransfers = await scrubAssetTransferSnapshots(transaction, erasure.userId, erasure.pseudonym);
          await transaction.assetSignatory.deleteMany({ where: { userId: erasure.userId } });
          await transaction.privacyErasure.update({
            where: { id: erasure.id },
            data: {
              status: 'COMPLETED',
              tombstones,
              report: { ...report, assetTransfers, pausedScheduleIds: [...pausedScheduleIds] },
              completedAt: now,
              error: null,
            },
          });
          await recordAuditEntry(transaction as never, {
            action: auditLogActions.privacySubjectAnonymized,
            entityType: auditLogEntityTypes.user,
            entityId: erasure.userId,
            metadata: { erasureId: erasure.id, pseudonymTag: tag, report },
            actorUserId: erasure.requestedByUserId,
          });
        });
        return;
      } catch (error) {
        // A random e-mail collision is practically impossible; retry twice anyway.
        if (attempt >= 2 || !isUniqueViolation(error)) throw error;
      }
    }
  }

  /**
   * After the commit: a failed append is logged loudly but does not undo the
   * erasure (the DB row is the primary record; `privacy-replay --export-ledger`
   * can rebuild the file from it).
   */
  private async appendLedger(erasure: ErasureRecord, tombstones: string[], now: Date): Promise<void> {
    if (this.ledger === undefined) return;
    const deleteOwnAttachments = erasure.deleteOwnAttachments;
    await this.ledger
      .append({
        v: 1,
        erasureId: erasure.id,
        userId: erasure.userId,
        pseudonym: erasure.pseudonym,
        tombstones,
        deleteOwnAttachments,
        requestedByUserId: erasure.requestedByUserId,
        completedAt: now.toISOString(),
      })
      .catch((error: unknown) => this.logger.error(`privacy_ledger_append_failed erasure=${erasure.id} reason=${errorText(error)}`));
  }

  private async finish(
    erasureId: string,
    status: 'COMPLETED' | 'FAILED',
    report: Record<string, unknown> | null,
    error: string | null = null,
  ): Promise<ErasureView> {
    await this.prisma.privacyErasure.update({
      where: { id: erasureId },
      data: {
        status,
        error: error?.slice(0, 1000) ?? null,
        ...(report === null ? {} : { report: report as never }),
        ...(status === 'COMPLETED' ? { completedAt: new Date() } : {}),
      },
    });
    return this.getErasure(erasureId);
  }

  private async loadSubject(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        displayName: true,
        email: true,
        distinguishedName: true,
        directoryObjectGuid: true,
        entraObjectId: true,
      },
    });
    if (user === null) throw new PrivacyError(privacyErrorCodes.notFound);
    const manual = await this.prisma.manualDirectoryUser.findMany({
      where: { email: { equals: user.email, mode: 'insensitive' } },
      select: { login: true },
    });
    const identifiers = {
      displayName: user.displayName,
      email: user.email,
      distinguishedName: user.distinguishedName,
      logins: manual.map((row) => row.login),
    };
    return {
      ...user,
      scrubberFor: (replacement: string): TextScrubber => createTextScrubber(identifiers, replacement),
    };
  }
}

/** Placeholder shown in preview examples (the real tag is allocated on request). */
export const previewReplacement = 'Bivši korisnik #····';

export function toErasureView(row: ErasureRecord): ErasureView {
  return {
    id: row.id,
    userId: row.userId,
    pseudonym: row.pseudonym,
    status: row.status as ErasureStatus,
    deleteOwnAttachments: row.deleteOwnAttachments,
    requestId: row.requestId,
    preview: (row.preview as AnonymizationPreview | null) ?? null,
    report: (row.report as Record<string, unknown> | null) ?? null,
    error: row.error,
    requestedByUserId: row.requestedByUserId,
    approvedByUserId: row.approvedByUserId,
    approvalDeadline: row.approvalDeadline?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
