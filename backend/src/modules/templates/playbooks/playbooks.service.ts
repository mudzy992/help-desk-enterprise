import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { Prisma } from '../../../generated/prisma/client';
import { permissionKeys } from '../../authorization/authorization.constants';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import type { AuthorizationContext } from '../../authorization/authorization.types';
import { changeLogActions } from '../../change-log/change-log.constants';
import { normalizeReason } from '../normalize-template-input';
import { recordTemplatesChange } from '../record-templates-change';
import { canManageSharedScope, hasPermission, type TemplateScope } from '../template-scope';
import { templateChangeLogEntityTypes } from '../templates.constants';
import { TemplatesConfigurationLoader } from '../templates-configuration.loader';
import { TemplatesError } from '../templates.error';
import {
  normalizePlaybookInput,
  stepsChanged,
  type NormalizedPlaybook,
  type PlaybookInput,
} from './normalize-playbook-input';

export const playbookInclude = {
  steps: { orderBy: { position: 'asc' } },
  services: { select: { serviceId: true } },
  categories: { select: { categoryId: true } },
} as const;

export type PlaybookRow = Prisma.PlaybookGetPayload<{ include: typeof playbookInclude }>;

export type PlaybookResponse = {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly isActive: boolean;
  readonly version: number;
  readonly serviceIds: readonly string[];
  readonly categoryIds: readonly string[];
  readonly steps: readonly {
    readonly stepKey: string;
    readonly title: string;
    readonly instructions: string | null;
    readonly required: boolean;
    readonly knowledgeArticleId: string | null;
    readonly responseTemplateId: string | null;
  }[];
  readonly activeTicketCount: number;
  readonly updatedAt: string;
  readonly canEdit: boolean;
};

type Actor = { readonly actorUserId: string };

/** Package 1.4 (P1, A1–A3): shared playbooks. */
@Injectable()
export class PlaybooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly configurationLoader: TemplatesConfigurationLoader,
  ) {}

  async list(
    query: { q?: string; serviceId?: string; state?: 'active' | 'inactive' | 'all' },
    actor: Actor,
  ): Promise<readonly PlaybookResponse[]> {
    const context = await this.requireManage(actor);
    const search = query.q?.trim() ?? '';
    const state = query.state ?? 'all';
    const rows = await this.prisma.playbook.findMany({
      where: {
        deletedAt: null,
        ...(state === 'all' ? {} : { isActive: state === 'active' }),
        ...(query.serviceId === undefined ? {} : { services: { some: { serviceId: query.serviceId } } }),
        ...(search.length === 0 ? {} : { name: { contains: search, mode: 'insensitive' } }),
      },
      include: playbookInclude,
      orderBy: { name: 'asc' },
      take: 1000,
    });
    const counts = await this.countActiveTickets(rows.map((row) => row.id));
    return rows.map((row) => this.toResponse(row, context, counts.get(row.id) ?? 0));
  }

  async get(playbookId: string, actor: Actor): Promise<PlaybookResponse> {
    const context = await this.requireManage(actor);
    const row = await this.load(playbookId);
    const counts = await this.countActiveTickets([row.id]);
    return this.toResponse(row, context, counts.get(row.id) ?? 0);
  }

  async create(body: PlaybookInput & { reason?: string }, actor: Actor): Promise<PlaybookResponse> {
    const context = await this.requireManage(actor);
    const normalized = normalizePlaybookInput(body);
    this.assertScope(context, normalized);
    const reason = normalizeReason(body.reason);
    await this.assertReferences(normalized);
    await this.assertNameFree(normalized.name, null);
    const created = await this.prisma.$transaction(async (transaction) => {
      const tx = transaction as PrismaService;
      const row = await tx.playbook.create({
        data: {
          name: normalized.name,
          description: normalized.description,
          isActive: normalized.isActive,
          createdById: context.subjectId,
          updatedById: context.subjectId,
          services: { create: normalized.serviceIds.map((serviceId) => ({ serviceId })) },
          categories: { create: normalized.categoryIds.map((categoryId) => ({ categoryId })) },
          steps: { create: normalized.steps.map((step) => ({ ...step })) },
        },
        include: playbookInclude,
      });
      await recordTemplatesChange(tx, {
        entityType: templateChangeLogEntityTypes.playbook,
        entityId: row.id,
        action: changeLogActions.create,
        reason,
        before: null,
        after: toPlaybookSnapshot(row),
        actorUserId: context.subjectId,
      });
      return row;
    });
    return this.toResponse(created, context, 0);
  }

  async update(playbookId: string, body: PlaybookInput & { reason?: string }, actor: Actor): Promise<PlaybookResponse> {
    const context = await this.requireManage(actor);
    const current = await this.load(playbookId);
    const normalized = normalizePlaybookInput(body);
    this.assertScope(context, { serviceIds: toServiceIds(current), categoryIds: toCategoryIds(current) });
    this.assertScope(context, normalized);
    const reason = normalizeReason(body.reason);
    await this.assertReferences(normalized);
    await this.assertNameFree(normalized.name, current.id);
    const bump = stepsChanged(current.steps, normalized.steps);
    const keys = normalized.steps.map((step) => step.stepKey);
    const updated = await this.prisma.$transaction(async (transaction) => {
      const tx = transaction as PrismaService;
      await tx.playbookService.deleteMany({ where: { playbookId } });
      await tx.playbookCategory.deleteMany({ where: { playbookId } });
      await tx.playbookStep.deleteMany({ where: { playbookId, stepKey: { notIn: keys } } });
      for (const step of normalized.steps) {
        await tx.playbookStep.upsert({
          where: { playbookId_stepKey: { playbookId, stepKey: step.stepKey } },
          create: { ...step, playbookId },
          update: { ...step },
        });
      }
      const row = await tx.playbook.update({
        where: { id: playbookId },
        data: {
          name: normalized.name,
          description: normalized.description,
          isActive: normalized.isActive,
          updatedById: context.subjectId,
          ...(bump ? { version: { increment: 1 } } : {}),
          services: { create: normalized.serviceIds.map((serviceId) => ({ serviceId })) },
          categories: { create: normalized.categoryIds.map((categoryId) => ({ categoryId })) },
        },
        include: playbookInclude,
      });
      await recordTemplatesChange(tx, {
        entityType: templateChangeLogEntityTypes.playbook,
        entityId: row.id,
        action: changeLogActions.update,
        reason,
        before: toPlaybookSnapshot(current),
        after: toPlaybookSnapshot(row),
        actorUserId: context.subjectId,
      });
      return row;
    });
    const counts = await this.countActiveTickets([updated.id]);
    return this.toResponse(updated, context, counts.get(updated.id) ?? 0);
  }

  /** Soft delete: running checklists keep their copy of the steps (P2). */
  async remove(playbookId: string, reasonInput: string | undefined, actor: Actor): Promise<{ readonly id: string }> {
    const context = await this.requireManage(actor);
    const current = await this.load(playbookId);
    this.assertScope(context, { serviceIds: toServiceIds(current), categoryIds: toCategoryIds(current) });
    const reason = normalizeReason(reasonInput);
    await this.prisma.$transaction(async (transaction) => {
      const tx = transaction as PrismaService;
      await tx.playbook.update({
        where: { id: playbookId },
        data: { deletedAt: new Date(), isActive: false, updatedById: context.subjectId },
      });
      await recordTemplatesChange(tx, {
        entityType: templateChangeLogEntityTypes.playbook,
        entityId: playbookId,
        action: changeLogActions.delete,
        reason,
        before: toPlaybookSnapshot(current),
        after: null,
        actorUserId: context.subjectId,
      });
    });
    return { id: playbookId };
  }

  private async requireManage(actor: Actor): Promise<AuthorizationContext> {
    if (!(await this.configurationLoader.load()).playbooksEnabled) {
      throw new TemplatesError('PLAYBOOKS_DISABLED');
    }
    const context = await this.authorizationContextLoader.loadBySubjectId(actor.actorUserId);
    if (context === null || !hasPermission(context, permissionKeys.ticketTemplatesManage)) {
      throw new TemplatesError('FORBIDDEN');
    }
    return context;
  }

  private async load(playbookId: string): Promise<PlaybookRow> {
    const row = await this.prisma.playbook.findFirst({
      where: { id: playbookId, deletedAt: null },
      include: playbookInclude,
    });
    if (row === null) {
      throw new TemplatesError('PLAYBOOK_NOT_FOUND');
    }
    return row;
  }

  private assertScope(
    context: AuthorizationContext,
    scope: Pick<NormalizedPlaybook, 'serviceIds' | 'categoryIds'>,
  ): void {
    const templateScope: TemplateScope = { serviceIds: scope.serviceIds, categoryIds: scope.categoryIds, groupIds: [] };
    if (!canManageSharedScope(context, templateScope)) {
      throw new TemplatesError('TEMPLATE_SCOPE_FORBIDDEN');
    }
  }

  private async assertReferences(normalized: NormalizedPlaybook): Promise<void> {
    const articleIds = [...new Set(normalized.steps.flatMap((step) => (step.knowledgeArticleId === null ? [] : [step.knowledgeArticleId])))];
    const templateIds = [...new Set(normalized.steps.flatMap((step) => (step.responseTemplateId === null ? [] : [step.responseTemplateId])))];
    const [services, categories, articles, templates] = await Promise.all([
      normalized.serviceIds.length === 0 ? 0 : this.prisma.service.count({ where: { id: { in: [...normalized.serviceIds] } } }),
      normalized.categoryIds.length === 0
        ? 0
        : this.prisma.serviceCategory.count({ where: { id: { in: [...normalized.categoryIds] } } }),
      articleIds.length === 0 ? 0 : this.prisma.knowledgeArticle.count({ where: { id: { in: articleIds } } }),
      templateIds.length === 0
        ? 0
        : this.prisma.responseTemplate.count({
            // Only shared templates: a step is seen by every agent.
            where: { id: { in: templateIds }, ownerUserId: null, deletedAt: null },
          }),
    ]);
    if (services !== normalized.serviceIds.length || categories !== normalized.categoryIds.length) {
      throw new TemplatesError('TEMPLATE_SCOPE_INVALID');
    }
    if (articles !== articleIds.length || templates !== templateIds.length) {
      throw new TemplatesError('PLAYBOOK_REFERENCE_INVALID');
    }
  }

  private async assertNameFree(name: string, exceptId: string | null): Promise<void> {
    const clash = await this.prisma.playbook.findFirst({
      where: {
        deletedAt: null,
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId === null ? {} : { id: { not: exceptId } }),
      },
      select: { id: true },
    });
    if (clash !== null) {
      throw new TemplatesError('PLAYBOOK_NAME_TAKEN');
    }
  }

  private async countActiveTickets(playbookIds: readonly string[]): Promise<Map<string, number>> {
    if (playbookIds.length === 0) return new Map();
    const groups = await this.prisma.ticketPlaybook.groupBy({
      by: ['playbookId'],
      where: { playbookId: { in: [...playbookIds] }, detachedAt: null },
      _count: { _all: true },
    });
    return new Map(groups.map((group) => [group.playbookId, group._count._all]));
  }

  private toResponse(row: PlaybookRow, context: AuthorizationContext, activeTicketCount: number): PlaybookResponse {
    const serviceIds = toServiceIds(row);
    const categoryIds = toCategoryIds(row);
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      isActive: row.isActive,
      version: row.version,
      serviceIds,
      categoryIds,
      steps: row.steps.map((step) => ({
        stepKey: step.stepKey,
        title: step.title,
        instructions: step.instructions,
        required: step.required,
        knowledgeArticleId: step.knowledgeArticleId,
        responseTemplateId: step.responseTemplateId,
      })),
      activeTicketCount,
      updatedAt: row.updatedAt.toISOString(),
      canEdit: canManageSharedScope(context, { serviceIds, categoryIds, groupIds: [] }),
    };
  }
}

function toServiceIds(row: PlaybookRow): string[] {
  return row.services.map((entry) => entry.serviceId).sort();
}

function toCategoryIds(row: PlaybookRow): string[] {
  return row.categories.map((entry) => entry.categoryId).sort();
}

export function toPlaybookSnapshot(row: PlaybookRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isActive: row.isActive,
    version: row.version,
    serviceIds: toServiceIds(row),
    categoryIds: toCategoryIds(row),
    steps: row.steps.map((step) => ({
      stepKey: step.stepKey,
      position: step.position,
      title: step.title,
      instructions: step.instructions,
      required: step.required,
      knowledgeArticleId: step.knowledgeArticleId,
      responseTemplateId: step.responseTemplateId,
    })),
  };
}
