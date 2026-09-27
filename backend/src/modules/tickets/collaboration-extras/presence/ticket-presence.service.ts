import { Inject, Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { redisTokens } from '../../../../common/redis/redis.tokens';
import {
  AgentCollaborationConfigurationLoader,
  type AgentCollaborationConfiguration,
} from '../agent-collaboration-configuration.loader';
import { buildPresencePayloads } from './build-presence-payloads';
import { TicketPresenceStore, type PresenceRedisClient } from './ticket-presence.store';
import type {
  PresenceUpdateInput,
  RequesterPresencePayload,
  StaffPresencePayload,
} from './ticket-presence.types';

const configurationMemoMs = 10_000;

/**
 * Paket 2.4 (A) — transient "viewing / typing" state. No database writes, no
 * audit (A5). The gateway authorises (room membership) and rate-limits; this
 * service stores and shapes the payloads.
 */
@Injectable()
export class TicketPresenceService {
  private readonly store: TicketPresenceStore;
  private readonly names = new Map<string, { name: string; at: number }>();
  private memo: { value: AgentCollaborationConfiguration; at: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configurationLoader: AgentCollaborationConfigurationLoader,
    @Optional() @Inject(redisTokens.client) redis?: PresenceRedisClient,
  ) {
    this.store = new TicketPresenceStore(redis ?? null);
  }

  async configuration(): Promise<AgentCollaborationConfiguration> {
    const now = Date.now();
    if (this.memo !== null && now - this.memo.at < configurationMemoMs) {
      return this.memo.value;
    }
    const value = await this.configurationLoader.load();
    this.memo = { value, at: now };
    return value;
  }

  /** Applies one update and returns what each room should receive (null = disabled). */
  async update(
    input: PresenceUpdateInput,
    actor: { readonly userId: string; readonly role: 'staff' | 'requester' },
  ): Promise<{ staff: StaffPresencePayload; requester: RequesterPresencePayload } | null> {
    const configuration = await this.configuration();
    if (!configuration.presenceEnabled) {
      return null;
    }
    if (input.state === 'leave') {
      await this.store.remove(input.ticketId, actor.userId);
    } else {
      await this.store.upsert(input.ticketId, {
        userId: actor.userId,
        name: await this.displayName(actor.userId),
        role: actor.role,
        // A requester never "types internally"; their channel is always public.
        state: input.state,
        channel: actor.role === 'staff' ? input.channel : 'public',
        at: Date.now(),
      });
    }
    return buildPresencePayloads(input.ticketId, await this.store.list(input.ticketId), {
      showToRequester: configuration.presenceShowToRequester,
    });
  }

  private async displayName(userId: string): Promise<string> {
    const cached = this.names.get(userId);
    if (cached !== undefined && Date.now() - cached.at < 10 * 60_000) {
      return cached.name;
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true },
    });
    const name = user?.displayName ?? '';
    this.names.set(userId, { name, at: Date.now() });
    return name;
  }
}
