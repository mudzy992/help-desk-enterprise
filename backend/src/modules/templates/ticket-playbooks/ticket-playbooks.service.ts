import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { permissionKeys } from '../../authorization/authorization.constants';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { changeLogActions } from '../../change-log/change-log.constants';
import { ticketSystemEventActions } from '../../tickets/collaboration.constants';
import type { TicketPersistedMessageSink } from '../../tickets/collaboration.types';
import { insertSystemTicketEvent } from '../../tickets/insert-system-ticket-event';
import { loadAccessibleTicket } from '../../tickets/load-accessible-ticket';
import { publishPersistedTicketMessages } from '../../tickets/publish-persisted-ticket-messages';
import { TicketAccessPolicyBinder } from '../../tickets/ticket-access-policy-binder';
import { TicketRealtimeHub } from '../../tickets/ticket-realtime.hub';
import type { TicketRecord } from '../../tickets/tickets.types';
import { normalizeReason } from '../normalize-template-input';
import { recordTemplatesChange } from '../record-templates-change';
import { hasPermission } from '../template-scope';
import { templateChangeLogEntityTypes, type PlaybookRequiredStepsMode } from '../templates.constants';
import { TemplatesConfigurationLoader } from '../templates-configuration.loader';
import { TemplatesError } from '../templates.error';
import { playbookInclude } from '../playbooks/playbooks.service';
import {
  computePlaybookProgress,
  keysKeptOnUpgrade,
  parseStepSnapshots,
  rankApplicablePlaybooks,
  toStepSnapshots,
  type PlaybookProgress,
  type PlaybookStepSnapshot,
} from './ticket-playbook-snapshot';
import { attachPlaybookToTicket, loadPlaybookCandidates } from './attach-playbook-to-ticket';

type Actor = { readonly actorUserId: string };

type PersonRef = { readonly id: string; readonly displayName: string } | null;

export type TicketPlaybookView = {
  readonly enabled: boolean;
  readonly mode: PlaybookRequiredStepsMode;
  readonly readOnly: boolean;
  readonly playbook: null | {
    readonly id: string;
    readonly playbookId: string;
    readonly name: string;
    readonly version: number;
    readonly latestVersion: number | null;
    readonly autoAttached: boolean;
    readonly attachedBy: PersonRef;
    readonly attachedAt: string;
    readonly steps: readonly (PlaybookStepSnapshot & {
      readonly checked: boolean;
      readonly checkedBy: PersonRef;
      readonly checkedAt: string | null;
      readonly knowledgeArticleTitle: string | null;
      readonly knowledgeArticleSlug: string | null;
      readonly responseTemplateName: string | null;
    })[];
    readonly progress: PlaybookProgress;
  };
  readonly available: readonly { readonly id: string; readonly name: string; readonly match: 'service' | 'category' | 'other' }[];
};

const readOnlyStatuses = new Set(['CLOSED', 'ARCHIVED']);

/** Package 1.4 (P2–P5): the playbook checklist of one ticket. */
@Injectable()
export class TicketPlaybooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly accessPolicies: TicketAccessPolicyBinder,
    private readonly realtimeHub: TicketRealtimeHub,
    private readonly configurationLoader: TemplatesConfigurationLoader,
  ) {}

  async get(ticketId: string, actor: Actor): Promise<TicketPlaybookView> {
    const configuration = await this.configurationLoader.load();
    if (!configuration.playbooksEnabled) {
      return { enabled: false, mode: configuration.requiredStepsOnResolve, readOnly: true, playbook: null, available: [] };
    }
    const { ticket } = await this.loadTicket(ticketId, actor, false);
    return this.buildView(ticket, configuration.requiredStepsOnResolve);
  }

  async attach(ticketId: string, playbookId: string, actor: Actor): Promise<TicketPlaybookView> {
    const configuration = await this.requireEnabled();
    const { ticket } = await this.loadTicket(ticketId, actor, true);
    const messages: TicketPersistedMessageSink = [];
    await attachPlaybookToTicket({
      prisma: this.prisma,
      ticket,
      playbookId,
      actorUserId: actor.actorUserId,
      autoAttached: false,
      messages,
    });
    publishPersistedTicketMessages(this.realtimeHub, ticket, messages);
    return this.buildView(ticket, configuration.requiredStepsOnResolve);
  }

  async detach(ticketId: string, reasonInput: string | undefined, actor: Actor): Promise<TicketPlaybookView> {
    const configuration = await this.requireEnabled();
    const { ticket } = await this.loadTicket(ticketId, actor, true);
    const reason = normalizeReason(reasonInput);
    const current = await this.loadActive(ticket.id);
    const messages: TicketPersistedMessageSink = [];
    await this.prisma.$transaction(async (transaction) => {
      const tx = transaction as PrismaService;
      const detached = await tx.ticketPlaybook.updateMany({
        where: { id: current.id, detachedAt: null },
        data: { detachedAt: new Date(), detachedById: actor.actorUserId, detachReason: reason },
      });
      if (detached.count === 0) {
        throw new TemplatesError('TICKET_PLAYBOOK_NOT_FOUND');
      }
      await recordTemplatesChange(tx, {
        entityType: templateChangeLogEntityTypes.ticketPlaybook,
        entityId: current.id,
        action: changeLogActions.delete,
        reason,
        before: { ticketId: ticket.id, playbookId: current.playbookId, version: current.playbookVersion },
        after: null,
        actorUserId: actor.actorUserId,
      });
      messages.push(
        await insertSystemTicketEvent(tx, {
          ticketId: ticket.id,
          action: ticketSystemEventActions.playbookDetached,
          actorUserId: actor.actorUserId,
          detail: reason,
        }),
      );
    });
    publishPersistedTicketMessages(this.realtimeHub, ticket, messages);
    return this.buildView(ticket, configuration.requiredStepsOnResolve);
  }

  async upgrade(ticketId: string, actor: Actor): Promise<TicketPlaybookView> {
    const configuration = await this.requireEnabled();
    const { ticket } = await this.loadTicket(ticketId, actor, true);
    const current = await this.loadActive(ticket.id);
    const latest = await this.prisma.playbook.findFirst({
      where: { id: current.playbookId, deletedAt: null, isActive: true },
      include: playbookInclude,
    });
    if (latest === null) {
      throw new TemplatesError('TICKET_PLAYBOOK_NOT_APPLICABLE');
    }
    if (latest.version <= current.playbookVersion) {
      throw new TemplatesError('TICKET_PLAYBOOK_UP_TO_DATE');
    }
    const nextSteps = toStepSnapshots(latest.steps);
    const kept = keysKeptOnUpgrade(
      current.steps.map((step) => step.stepKey),
      nextSteps,
    );
    const messages: TicketPersistedMessageSink = [];
    await this.prisma.$transaction(async (transaction) => {
      const tx = transaction as PrismaService;
      await tx.ticketPlaybookStep.deleteMany({
        where: { ticketPlaybookId: current.id, stepKey: { notIn: [...kept] } },
      });
      await tx.ticketPlaybook.update({
        where: { id: current.id },
        data: {
          playbookVersion: latest.version,
          playbookName: latest.name,
          stepsSnapshot: nextSteps as unknown as object,
        },
      });
      await recordTemplatesChange(tx, {
        entityType: templateChangeLogEntityTypes.ticketPlaybook,
        entityId: current.id,
        action: changeLogActions.update,
        reason: 'playbook_upgrade',
        before: { version: current.playbookVersion, steps: parseStepSnapshots(current.stepsSnapshot) },
        after: { version: latest.version, steps: nextSteps },
        actorUserId: actor.actorUserId,
      });
      messages.push(
        await insertSystemTicketEvent(tx, {
          ticketId: ticket.id,
          action: ticketSystemEventActions.playbookUpgraded,
          actorUserId: actor.actorUserId,
          detail: `${current.playbookVersion}:${latest.version}:${sanitize(latest.name)}`,
        }),
      );
    });
    publishPersistedTicketMessages(this.realtimeHub, ticket, messages);
    return this.buildView(ticket, configuration.requiredStepsOnResolve);
  }

  async setStep(ticketId: string, stepKey: string, checked: boolean, actor: Actor): Promise<TicketPlaybookView> {
    const configuration = await this.requireEnabled();
    const { ticket } = await this.loadTicket(ticketId, actor, true);
    const current = await this.loadActive(ticket.id);
    const steps = parseStepSnapshots(current.stepsSnapshot);
    const step = steps.find((candidate) => candidate.stepKey === stepKey);
    if (step === undefined) {
      throw new TemplatesError('TICKET_PLAYBOOK_STEP_NOT_FOUND');
    }
    const wasChecked = current.steps.some((row) => row.stepKey === stepKey);
    if (wasChecked === checked) {
      // Idempotent: a double click or a second agent doing the same.
      return this.buildView(ticket, configuration.requiredStepsOnResolve);
    }
    const messages: TicketPersistedMessageSink = [];
    await this.prisma.$transaction(async (transaction) => {
      const tx = transaction as PrismaService;
      if (checked) {
        await tx.ticketPlaybookStep.upsert({
          where: { ticketPlaybookId_stepKey: { ticketPlaybookId: current.id, stepKey } },
          create: { ticketPlaybookId: current.id, stepKey, checkedById: actor.actorUserId, checkedAt: new Date() },
          update: {},
        });
      } else {
        await tx.ticketPlaybookStep.deleteMany({ where: { ticketPlaybookId: current.id, stepKey } });
      }
      await recordTemplatesChange(tx, {
        entityType: templateChangeLogEntityTypes.ticketPlaybook,
        entityId: current.id,
        action: changeLogActions.update,
        reason: checked ? 'playbook_step_checked' : 'playbook_step_unchecked',
        before: { stepKey, checked: !checked },
        after: { stepKey, checked },
        actorUserId: actor.actorUserId,
      });
      const position = steps.indexOf(step) + 1;
      messages.push(
        await insertSystemTicketEvent(tx, {
          ticketId: ticket.id,
          action: checked ? ticketSystemEventActions.playbookStepChecked : ticketSystemEventActions.playbookStepUnchecked,
          actorUserId: actor.actorUserId,
          detail: `${position}:${sanitize(step.title)}`,
        }),
      );
      if (checked) {
        const checkedKeys = new Set([...current.steps.map((row) => row.stepKey), stepKey]);
        if (computePlaybookProgress(steps, checkedKeys).complete) {
          messages.push(
            await insertSystemTicketEvent(tx, {
              ticketId: ticket.id,
              action: ticketSystemEventActions.playbookCompleted,
              actorUserId: actor.actorUserId,
              detail: sanitize(current.playbookName),
            }),
          );
        }
      }
    });
    publishPersistedTicketMessages(this.realtimeHub, ticket, messages);
    return this.buildView(ticket, configuration.requiredStepsOnResolve);
  }

  // ------------------------------------------------------------- helpers

  private async requireEnabled() {
    const configuration = await this.configurationLoader.load();
    if (!configuration.playbooksEnabled) {
      throw new TemplatesError('PLAYBOOKS_DISABLED');
    }
    return configuration;
  }

  private async loadTicket(ticketId: string, actor: Actor, write: boolean): Promise<{ ticket: TicketRecord }> {
    const gated = await this.accessPolicies.bind({ actorUserId: actor.actorUserId });
    const { ticket, access } = await loadAccessibleTicket(
      this.prisma,
      this.authorizationContextLoader,
      ticketId,
      gated,
      { writable: write },
    );
    const context = await this.authorizationContextLoader.loadBySubjectId(actor.actorUserId);
    if (
      access.visibility !== 'staff' ||
      context === null ||
      !hasPermission(context, permissionKeys.ticketTemplatesUse)
    ) {
      throw new TemplatesError('FORBIDDEN');
    }
    if (write && isReadOnly(ticket)) {
      throw new TemplatesError('TICKET_PLAYBOOK_READ_ONLY');
    }
    return { ticket };
  }

  private async loadActive(ticketId: string) {
    const current = await this.prisma.ticketPlaybook.findFirst({
      where: { ticketId, detachedAt: null },
      include: { steps: true },
      orderBy: { createdAt: 'desc' },
    });
    if (current === null) {
      throw new TemplatesError('TICKET_PLAYBOOK_NOT_FOUND');
    }
    return current;
  }

  private async buildView(ticket: TicketRecord, mode: PlaybookRequiredStepsMode): Promise<TicketPlaybookView> {
    const readOnly = isReadOnly(ticket);
    const current = await this.prisma.ticketPlaybook.findFirst({
      where: { ticketId: ticket.id, detachedAt: null },
      include: { steps: true, playbook: { select: { version: true, isActive: true, deletedAt: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const service = await this.prisma.service.findUnique({
      where: { id: ticket.serviceId },
      select: { categoryId: true },
    });
    const candidates = current === null && !readOnly ? await loadPlaybookCandidates(this.prisma) : [];
    const ranked = rankApplicablePlaybooks(candidates, {
      serviceId: ticket.serviceId,
      categoryId: service?.categoryId ?? null,
    });
    const rankedIds = new Set(ranked.map((entry) => entry.id));
    const available = [
      ...ranked.map((entry) => ({ id: entry.id, name: entry.name, match: entry.match })),
      ...candidates
        .filter((entry) => !rankedIds.has(entry.id))
        .sort((a, b) => a.name.localeCompare(b.name, 'bs'))
        .map((entry) => ({ id: entry.id, name: entry.name, match: 'other' as const })),
    ];
    if (current === null) {
      return { enabled: true, mode, readOnly, playbook: null, available };
    }
    const steps = parseStepSnapshots(current.stepsSnapshot);
    const checkedByKey = new Map(current.steps.map((row) => [row.stepKey, row]));
    const userIds = [
      ...new Set(
        [current.attachedById, ...current.steps.map((row) => row.checkedById)].filter(
          (id): id is string => typeof id === 'string',
        ),
      ),
    ];
    const articleIds = steps.flatMap((step) => (step.knowledgeArticleId === null ? [] : [step.knowledgeArticleId]));
    const templateIds = steps.flatMap((step) => (step.responseTemplateId === null ? [] : [step.responseTemplateId]));
    const [users, articles, templates] = await Promise.all([
      userIds.length === 0
        ? []
        : this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true } }),
      articleIds.length === 0
        ? []
        : this.prisma.knowledgeArticle.findMany({
            where: { id: { in: articleIds } },
            select: { id: true, title: true, slug: true },
          }),
      templateIds.length === 0
        ? []
        : this.prisma.responseTemplate.findMany({
            where: { id: { in: templateIds }, deletedAt: null, isActive: true },
            select: { id: true, name: true },
          }),
    ]);
    const person = (id: string | null): PersonRef => {
      if (id === null) return null;
      const user = users.find((candidate) => candidate.id === id);
      return user === undefined ? null : { id: user.id, displayName: user.displayName };
    };
    const latestAvailable =
      current.playbook.deletedAt === null && current.playbook.isActive ? current.playbook.version : null;
    return {
      enabled: true,
      mode,
      readOnly,
      available: [],
      playbook: {
        id: current.id,
        playbookId: current.playbookId,
        name: current.playbookName,
        version: current.playbookVersion,
        latestVersion: latestAvailable,
        autoAttached: current.autoAttached,
        attachedBy: person(current.attachedById),
        attachedAt: current.createdAt.toISOString(),
        steps: steps.map((step) => {
          const row = checkedByKey.get(step.stepKey);
          const article = articles.find((candidate) => candidate.id === step.knowledgeArticleId);
          const template = templates.find((candidate) => candidate.id === step.responseTemplateId);
          return {
            ...step,
            checked: row !== undefined,
            checkedBy: row === undefined ? null : person(row.checkedById),
            checkedAt: row?.checkedAt.toISOString() ?? null,
            knowledgeArticleTitle: article?.title ?? null,
            knowledgeArticleSlug: article?.slug ?? null,
            responseTemplateId: template === undefined ? null : step.responseTemplateId,
            responseTemplateName: template?.name ?? null,
          };
        }),
        progress: computePlaybookProgress(steps, new Set(checkedByKey.keys())),
      },
    };
  }
}

function isReadOnly(ticket: Pick<TicketRecord, 'status' | 'mergedIntoTicketId'>): boolean {
  return readOnlyStatuses.has(ticket.status) || ticket.mergedIntoTicketId !== null;
}

/** System event details are `a:b:c`; titles must not break the format. */
export function sanitize(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}
