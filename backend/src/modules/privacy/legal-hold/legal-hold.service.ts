import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { auditLogActions, auditLogEntityTypes } from '../../audit-log/audit-log.constants';
import { recordAuditEntry } from '../../audit-log/record-audit-entry';
import type { PrivacyActor } from '../privacy-actor';
import { privacyErrorCodes } from '../privacy.constants';
import { PrivacyError } from '../privacy.error';

export type LegalHoldTarget = 'ticket' | 'user';

export type LegalHoldView = {
  readonly target: LegalHoldTarget;
  readonly id: string;
  /** Ticket number or the user's display name. */
  readonly label: string;
  readonly heldAt: string;
  readonly reason: string | null;
};

const listLimit = 500;

/**
 * Paket 2.6 (§7.4): a legal hold blocks retention of a ticket (all
 * categories; a held requester protects all of their tickets) and the
 * anonymization of a user. Setting and clearing need a reason and are audited.
 */
@Injectable()
export class LegalHoldService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<LegalHoldView[]> {
    const [tickets, users] = await Promise.all([
      this.prisma.ticket.findMany({
        where: { legalHoldAt: { not: null } },
        select: { id: true, ticketNumber: true, legalHoldAt: true, legalHoldReason: true },
        orderBy: { legalHoldAt: 'desc' },
        take: listLimit,
      }),
      this.prisma.user.findMany({
        where: { legalHoldAt: { not: null } },
        select: { id: true, displayName: true, legalHoldAt: true, legalHoldReason: true },
        orderBy: { legalHoldAt: 'desc' },
        take: listLimit,
      }),
    ]);
    return [
      ...tickets.map((row) => ({
        target: 'ticket' as const,
        id: row.id,
        label: row.ticketNumber,
        heldAt: row.legalHoldAt!.toISOString(),
        reason: row.legalHoldReason,
      })),
      ...users.map((row) => ({
        target: 'user' as const,
        id: row.id,
        label: row.displayName,
        heldAt: row.legalHoldAt!.toISOString(),
        reason: row.legalHoldReason,
      })),
    ];
  }

  async set(target: LegalHoldTarget, id: string, reason: string, actor: PrivacyActor, now = new Date()): Promise<LegalHoldView> {
    return this.change(target, id, actor, now, { reason });
  }

  async clear(target: LegalHoldTarget, id: string, reason: string, actor: PrivacyActor, now = new Date()): Promise<void> {
    await this.change(target, id, actor, now, { clearReason: reason });
  }

  private async change(
    target: LegalHoldTarget,
    id: string,
    actor: PrivacyActor,
    now: Date,
    input: { readonly reason?: string; readonly clearReason?: string },
  ): Promise<LegalHoldView> {
    const setting = input.reason !== undefined;
    return this.prisma.$transaction(async (transaction) => {
      let view: LegalHoldView;
      let organizationalUnitId: string | null = null;
      if (target === 'ticket') {
        const ticket = await transaction.ticket.findUnique({
          where: { id },
          select: { id: true, ticketNumber: true, legalHoldAt: true, originUnitId: true, contentRedactedAt: true },
        });
        if (ticket === null) throw new PrivacyError(privacyErrorCodes.notFound);
        if (setting === (ticket.legalHoldAt !== null)) throw new PrivacyError(privacyErrorCodes.invalidTransition);
        await transaction.ticket.update({
          where: { id },
          data: setting
            ? { legalHoldAt: now, legalHoldReason: input.reason, legalHoldById: actor.principal.subjectId }
            : { legalHoldAt: null, legalHoldReason: null, legalHoldById: null },
        });
        organizationalUnitId = ticket.originUnitId;
        view = { target, id, label: ticket.ticketNumber, heldAt: now.toISOString(), reason: input.reason ?? null };
      } else {
        const user = await transaction.user.findUnique({
          where: { id },
          select: { id: true, displayName: true, legalHoldAt: true, anonymizedAt: true },
        });
        if (user === null) throw new PrivacyError(privacyErrorCodes.notFound);
        if (setting && user.anonymizedAt !== null) throw new PrivacyError(privacyErrorCodes.invalidTransition);
        if (setting === (user.legalHoldAt !== null)) throw new PrivacyError(privacyErrorCodes.invalidTransition);
        await transaction.user.update({
          where: { id },
          data: setting ? { legalHoldAt: now, legalHoldReason: input.reason } : { legalHoldAt: null, legalHoldReason: null },
        });
        view = { target, id, label: user.displayName, heldAt: now.toISOString(), reason: input.reason ?? null };
      }
      await recordAuditEntry(transaction as never, {
        action: setting ? auditLogActions.privacyLegalHoldSet : auditLogActions.privacyLegalHoldCleared,
        entityType: target === 'ticket' ? auditLogEntityTypes.ticket : auditLogEntityTypes.user,
        entityId: id,
        // The reason is the admin's own text about a case; it stays in the audit trail.
        metadata: { target, reason: (input.reason ?? input.clearReason ?? '').slice(0, 500) },
        actorUserId: actor.principal.subjectId,
        requestId: actor.requestId,
        organizationalUnitId,
      });
      return view;
    });
  }
}
