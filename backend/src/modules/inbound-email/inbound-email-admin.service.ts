import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { loadEmailChannelConfiguration } from '../notifications/email/load-email-channel-configuration';
import { readReplyTokenSecret } from '../notifications/email/reply-token';
import { SettingsService } from '../settings/settings.service';
import {
  inboundConfigurationProblems,
  inboundMailboxKey,
  loadInboundEmailConfiguration,
} from './inbound-email-configuration';
import { createInboundMailbox } from './mailbox/create-inbound-mailbox';
import type { InboundMailboxSession } from './mailbox/inbound-mailbox';

export type InboundEmailStatusResponse = {
  readonly enabled: boolean;
  readonly provider: string;
  readonly address: string;
  readonly problems: readonly string[];
  /** R2: replies need `shared_mailbox` mode and a Reply-To address. */
  readonly replyModeReady: boolean;
  readonly replyTokenReady: boolean;
  readonly state: {
    readonly lastRunAt: string | null;
    readonly lastSuccessAt: string | null;
    readonly lastError: string | null;
    readonly lastErrorAt: string | null;
    readonly consecutiveFails: number;
  } | null;
  readonly last24h: { readonly processed: number; readonly rejected: number; readonly ignored: number; readonly failed: number };
  readonly recent: readonly {
    readonly id: string;
    readonly status: string;
    readonly reason: string | null;
    readonly fromAddress: string | null;
    readonly subject: string;
    readonly ticketId: string | null;
    readonly ticketNumber: string | null;
    readonly createdAt: string;
  }[];
};

const recentLimit = 50;

/** Paket 2.3 (R13): read-only status for admins, plus a connection test. */
@Injectable()
export class InboundEmailAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async getStatus(now = new Date()): Promise<InboundEmailStatusResponse> {
    const configuration = await loadInboundEmailConfiguration(this.settings);
    const email = await loadEmailChannelConfiguration(this.settings);
    const mailboxKey = inboundMailboxKey(configuration);
    const since = new Date(now.getTime() - 86_400_000);
    const [state, grouped, recent] = await Promise.all([
      this.prisma.inboundMailboxState.findUnique({ where: { mailboxKey } }),
      this.prisma.inboundEmail.groupBy({ by: ['status'], where: { createdAt: { gte: since } }, _count: { _all: true } }),
      this.prisma.inboundEmail.findMany({
        orderBy: { createdAt: 'desc' },
        take: recentLimit,
        select: { id: true, status: true, reason: true, fromAddress: true, subject: true, ticketId: true, createdAt: true },
      }),
    ]);
    const ticketIds = [...new Set(recent.map((row) => row.ticketId).filter((id): id is string => id !== null))];
    const tickets =
      ticketIds.length === 0
        ? []
        : await this.prisma.ticket.findMany({ where: { id: { in: ticketIds } }, select: { id: true, ticketNumber: true } });
    const numbers = new Map(tickets.map((ticket) => [ticket.id, ticket.ticketNumber]));
    const count = (status: string) => grouped.find((row) => row.status === status)?._count._all ?? 0;
    return {
      enabled: configuration.enabled,
      provider: configuration.provider,
      address: configuration.address,
      problems: inboundConfigurationProblems(configuration),
      replyModeReady: email.presentation.replyMode === 'shared_mailbox',
      replyTokenReady: readReplyTokenSecret() !== null,
      state:
        state === null
          ? null
          : {
              lastRunAt: state.lastRunAt?.toISOString() ?? null,
              lastSuccessAt: state.lastSuccessAt?.toISOString() ?? null,
              lastError: state.lastError,
              lastErrorAt: state.lastErrorAt?.toISOString() ?? null,
              consecutiveFails: state.consecutiveFails,
            },
      last24h: { processed: count('PROCESSED'), rejected: count('REJECTED'), ignored: count('IGNORED'), failed: count('FAILED') },
      recent: recent.map((row) => ({
        id: row.id,
        status: row.status,
        reason: row.reason,
        fromAddress: row.fromAddress,
        subject: row.subject,
        ticketId: row.ticketId,
        ticketNumber: row.ticketId === null ? null : (numbers.get(row.ticketId) ?? null),
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async testConnection(): Promise<{ readonly ok: boolean; readonly inboxCount?: number; readonly error?: string; readonly problems: readonly string[] }> {
    const configuration = await loadInboundEmailConfiguration(this.settings);
    const problems = inboundConfigurationProblems(configuration);
    if (problems.length > 0) return { ok: false, problems };
    let session: InboundMailboxSession | null = null;
    try {
      session = await createInboundMailbox(configuration).open();
      const items = await session.list(10);
      return { ok: true, inboxCount: items.length, problems };
    } catch (error) {
      return { ok: false, error: (error instanceof Error ? error.message : String(error)).slice(0, 300), problems };
    } finally {
      await session?.close().catch(() => undefined);
    }
  }
}
