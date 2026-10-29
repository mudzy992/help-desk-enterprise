import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SlaConfigurationLoader } from './sla-configuration.loader';
import { computeSlaNextDueAt } from './compute-sla-next-due-at';
import { loadBusinessHoursCalendar } from './load-business-hours-calendar';
import { loadSlaEscalationRules } from './load-sla-escalation-rules';
import { persistTicketSlaState } from './persist-ticket-sla-state';
import { recomputeTicketSlaTargets } from './recompute-ticket-sla-targets';
import { recordSlaChange, changeLogActions } from './record-sla-change';
import { resolveMatchingSlaRule } from './resolve-matching-sla-rule';
import { createSlaConfigurationSnapshot } from './sla-configuration-snapshot';
import { SlaError } from './sla.error';
import { toTicketSlaStateSnapshot } from './to-ticket-sla-state-snapshot';
import { withTicketSlaWriteLock } from './with-ticket-sla-write-lock';
import type { SlaRuleRecord } from './sla.types';
import type { TicketSlaStateRecord, TicketSlaTicketRef } from './ticket-sla.types';

const maximumBatchSize = 100;

type MigrationInput = {
  readonly slaProfileId: string;
  readonly cursor?: string;
  readonly take?: number;
};

type MigrationPreview = {
  readonly profileId: string;
  readonly scanned: number;
  readonly drifted: number;
  readonly unresolved: number;
  readonly unchanged: number;
  readonly candidateStateIds: readonly string[];
  readonly targetVersions: readonly (readonly [string, string | null])[];
  readonly nextCursor: string | null;
  readonly previewToken: string;
};

type Candidate = {
  readonly id: string;
  readonly ticketId: string;
  readonly configurationVersion: string | null;
  readonly ticket: TicketSlaTicketRef;
};

@Injectable()
export class SlaTimerConfigurationMigrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configurationLoader: SlaConfigurationLoader,
  ) {}

  async preview(input: MigrationInput): Promise<MigrationPreview> {
    return previewSlaTimerConfigurationMigration(this.prisma, input);
  }

  async apply(
    input: MigrationInput & { readonly previewToken: string; readonly reason: string; readonly actorUserId: string | null },
  ): Promise<MigrationPreview & { readonly migrated: number }> {
    const preview = await this.preview(input);
    if (preview.previewToken !== input.previewToken) {
      throw new SlaError('STALE_WRITE');
    }
    const configuration = await this.configurationLoader.load();
    let migrated = 0;
    const expectedVersions = new Map(preview.targetVersions);
    const appliedAt = new Date();
    for (const stateId of preview.candidateStateIds) {
      const changed = await withTicketSlaWriteLock(this.prisma, await ticketIdForState(this.prisma, stateId), async (client) => {
        const state = await client.ticketSlaState.findUnique({ where: { id: stateId }, include: { ticket: true } });
        if (state === null || state.resolutionCompletedAt !== null || state.slaProfileId !== input.slaProfileId) return false;
        const before = state as unknown as TicketSlaStateRecord;
        const calendar = await loadCurrentCalendar(client, input.slaProfileId);
        if (calendar === null) return false;
        const recomputed = await recomputeTicketSlaTargets(client, before, state.ticket as unknown as TicketSlaTicketRef, calendar, appliedAt);
        if (recomputed.configurationVersion !== expectedVersions.get(stateId)) throw new SlaError('STALE_WRITE');
        if (recomputed.configurationVersion === before.configurationVersion) return false;
        const rules = await loadSlaEscalationRules(client, recomputed.slaProfileId);
        const next = {
          ...recomputed,
          nextDueAt: computeSlaNextDueAt({ state: recomputed, rules, calendar, configuration }),
        };
        const persisted = await persistTicketSlaState(client, next);
        await recordSlaChange(client, {
          action: changeLogActions.update,
          entityType: 'ticket_sla_configuration',
          entityId: persisted.id,
          reason: input.reason,
          before: toTicketSlaStateSnapshot(before),
          after: toTicketSlaStateSnapshot(persisted),
          actorUserId: input.actorUserId,
        });
        return true;
      });
      if (changed) migrated += 1;
    }
    return { ...preview, migrated };
  }
}

export async function previewSlaTimerConfigurationMigration(
  prisma: PrismaService,
  input: MigrationInput,
): Promise<MigrationPreview> {
  const take = Math.min(Math.max(input.take ?? maximumBatchSize, 1), maximumBatchSize);
  const rows = await prisma.ticketSlaState.findMany({
    where: { slaProfileId: input.slaProfileId, resolutionCompletedAt: null },
    orderBy: { id: 'asc' },
    take: take + 1,
    ...(input.cursor === undefined ? {} : { cursor: { id: input.cursor }, skip: 1 }),
    include: { ticket: true },
  }) as unknown as Candidate[];
  const page = rows.slice(0, take);
  const calendar = await loadCurrentCalendar(prisma, input.slaProfileId);
  const rules = await prisma.slaRule.findMany({ where: { slaProfileId: input.slaProfileId } }) as SlaRuleRecord[];
  const candidateStateIds: string[] = [];
  const targetVersions: Array<readonly [string, string | null]> = [];
  let unresolved = 0;
  let unchanged = 0;
  for (const state of page) {
    const version = calendar === null ? null : resolveVersion(rules, state.ticket, calendar);
    targetVersions.push([state.id, version]);
    if (version === null) unresolved += 1;
    else if (version === state.configurationVersion) unchanged += 1;
    else candidateStateIds.push(state.id);
  }
  const nextCursor = rows.length > take ? page.at(-1)?.id ?? null : null;
  const tokenPayload = {
    profileId: input.slaProfileId,
    cursor: input.cursor ?? null,
    take,
    rows: page.map((row) => [row.id, row.configurationVersion]),
    targetVersions,
    candidates: candidateStateIds,
  };
  return {
    profileId: input.slaProfileId,
    scanned: page.length,
    drifted: candidateStateIds.length,
    unresolved,
    unchanged,
    candidateStateIds,
    targetVersions,
    nextCursor,
    previewToken: createHash('sha256').update(JSON.stringify(tokenPayload)).digest('hex'),
  };
}

async function loadCurrentCalendar(prisma: PrismaService, profileId: string) {
  const profile = await prisma.slaProfile.findUnique({ where: { id: profileId }, select: { calendarId: true } });
  return profile === null ? null : loadBusinessHoursCalendar(prisma, profile.calendarId);
}

function resolveVersion(rules: readonly SlaRuleRecord[], ticket: TicketSlaTicketRef, calendar: NonNullable<Awaited<ReturnType<typeof loadCurrentCalendar>>>): string | null {
  const matching = resolveMatchingSlaRule(rules, {
    priority: ticket.priority,
    serviceId: ticket.serviceId,
    organizationalUnitId: ticket.originUnitId,
  });
  return matching === null ? null : createSlaConfigurationSnapshot(matching, calendar).version;
}

async function ticketIdForState(prisma: PrismaService, stateId: string): Promise<string> {
  const state = await prisma.ticketSlaState.findUnique({ where: { id: stateId }, select: { ticketId: true } });
  if (state === null) throw new SlaError('STATE_NOT_FOUND');
  return state.ticketId;
}
