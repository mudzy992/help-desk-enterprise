import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import type { ResponseTemplateKind } from '../../generated/prisma/enums';
import { permissionKeys } from '../authorization/authorization.constants';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { changeLogActions } from '../change-log/change-log.constants';
import { SettingsService } from '../settings/settings.service';
import { loadAccessibleTicket } from '../tickets/load-accessible-ticket';
import { TicketAccessPolicyBinder } from '../tickets/ticket-access-policy-binder';
import { buildTemplateVariables, sampleTemplateVariables } from './build-template-variables';
import {
  normalizeReason,
  normalizeResponseTemplateInput,
  type NormalizedResponseTemplate,
  type ResponseTemplateInput,
} from './normalize-template-input';
import { recordTemplatesChange } from './record-templates-change';
import { extractPlaceholders, fillTemplate, findUnknownPlaceholders } from './template-placeholders';
import {
  canManageSharedScope,
  hasPermission,
  scoreTemplateScope,
  type TemplateScope,
  type TicketScopeFacts,
} from './template-scope';
import {
  templateChangeLogEntityTypes,
  templateLimits,
  type ResponseTemplateVariable,
  type TemplateLocale,
} from './templates.constants';
import { TemplatesConfigurationLoader } from './templates-configuration.loader';
import { loadTemplateEnvironment, resolveTemplateLocale } from './templates-environment';
import { TemplatesError } from './templates.error';

const templateInclude = {
  services: { select: { serviceId: true } },
  categories: { select: { categoryId: true } },
  groups: { select: { groupId: true } },
} as const;

type TemplateRow = Prisma.ResponseTemplateGetPayload<{ include: typeof templateInclude }>;

export type ResponseTemplateOwnership = 'shared' | 'personal';

export type ResponseTemplateResponse = {
  readonly id: string;
  readonly name: string;
  readonly bodyBs: string;
  readonly bodyEn: string | null;
  readonly kind: ResponseTemplateKind;
  readonly tags: readonly string[];
  readonly isActive: boolean;
  readonly ownership: ResponseTemplateOwnership;
  readonly serviceIds: readonly string[];
  readonly categoryIds: readonly string[];
  readonly groupIds: readonly string[];
  readonly variables: readonly string[];
  readonly usageCount: number;
  readonly lastUsedAt: string | null;
  readonly updatedAt: string;
  readonly canEdit: boolean;
};

export type ResponseTemplatePickerItem = {
  readonly id: string;
  readonly name: string;
  readonly kind: ResponseTemplateKind;
  readonly tags: readonly string[];
  readonly ownership: ResponseTemplateOwnership;
  /** 3 service, 2 category, 1 group, 0 global, -1 scoped elsewhere. */
  readonly scopeMatch: number;
  readonly usageCount: number;
  readonly preview: string;
  readonly hasEnglish: boolean;
};

export type RenderedTemplate = {
  readonly templateId: string | null;
  readonly text: string;
  readonly locale: TemplateLocale;
  readonly missing: readonly ResponseTemplateVariable[];
  readonly unknown: readonly string[];
};

type Actor = { readonly actorUserId: string };

/** Package 1.4 (T1–T6): response templates. */
@Injectable()
export class ResponseTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly accessPolicies: TicketAccessPolicyBinder,
    private readonly settingsService: SettingsService,
    private readonly configurationLoader: TemplatesConfigurationLoader,
  ) {}

  // ---------------------------------------------------------------- picker

  async listForPicker(
    query: { ticketId?: string; kind?: 'REPLY' | 'INTERNAL'; q?: string; all?: boolean },
    actor: Actor,
  ): Promise<readonly ResponseTemplatePickerItem[]> {
    const context = await this.requireUse(actor);
    const facts =
      query.ticketId === undefined ? null : (await this.loadTicket(query.ticketId, actor)).facts;
    const search = query.q?.trim() ?? '';
    const rows = await this.prisma.responseTemplate.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        OR: [{ ownerUserId: null }, { ownerUserId: context.subjectId }],
        ...(query.kind === undefined ? {} : { kind: { in: [query.kind, 'ANY'] } }),
        ...(search.length === 0
          ? {}
          : {
              AND: [
                {
                  OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { bodyBs: { contains: search, mode: 'insensitive' } },
                    { bodyEn: { contains: search, mode: 'insensitive' } },
                    { tags: { has: search.toLocaleLowerCase('bs') } },
                  ],
                },
              ],
            }),
      },
      include: templateInclude,
      take: 500,
    });
    const items = rows
      .map((row) => ({ row, score: scoreTemplateScope(toScope(row), facts) }))
      .filter((entry) => query.all === true || entry.score >= 0)
      .sort((a, b) => rankOf(b) - rankOf(a) || b.row.usageCount - a.row.usageCount || a.row.name.localeCompare(b.row.name, 'bs'))
      .slice(0, templateLimits.pickerLimit);
    return items.map(({ row, score }) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      tags: row.tags,
      ownership: row.ownerUserId === null ? 'shared' : 'personal',
      scopeMatch: score,
      usageCount: row.usageCount,
      preview: row.bodyBs.slice(0, 200),
      hasEnglish: row.bodyEn !== null,
    }));
  }

  async render(
    ticketId: string,
    templateId: string,
    locale: TemplateLocale | undefined,
    actor: Actor,
  ): Promise<RenderedTemplate> {
    const context = await this.requireUse(actor);
    const template = await this.prisma.responseTemplate.findFirst({
      where: {
        id: templateId,
        deletedAt: null,
        OR: [{ ownerUserId: null }, { ownerUserId: context.subjectId }],
      },
    });
    if (template === null) {
      throw new TemplatesError('TEMPLATE_NOT_FOUND');
    }
    const { ticket } = await this.loadTicket(ticketId, actor);
    const requester = await this.prisma.user.findUnique({
      where: { id: ticket.requesterId },
      select: { preferredLocale: true },
    });
    const usedLocale = await resolveTemplateLocale(this.settingsService, locale, requester?.preferredLocale);
    const body = usedLocale === 'en' ? (template.bodyEn ?? template.bodyBs) : template.bodyBs;
    const values = await buildTemplateVariables({
      prisma: this.prisma,
      ticket,
      agentUserId: actor.actorUserId,
      locale: usedLocale,
      environment: await loadTemplateEnvironment(this.settingsService),
    });
    const filled = fillTemplate(body, values);
    return { templateId: template.id, text: filled.text, locale: usedLocale, missing: filled.missing, unknown: [] };
  }

  /** Editor live preview: never throws on unknown variables, reports them. */
  async preview(
    input: { body: string; locale?: TemplateLocale; ticketId?: string },
    actor: Actor,
  ): Promise<RenderedTemplate> {
    const context = await this.loadContext(actor);
    if (
      !hasPermission(context, permissionKeys.ticketTemplatesManage) &&
      !hasPermission(context, permissionKeys.ticketTemplatesPersonal)
    ) {
      throw new TemplatesError('FORBIDDEN');
    }
    const locale = input.locale ?? 'bs';
    const environment = await loadTemplateEnvironment(this.settingsService);
    const values =
      input.ticketId === undefined
        ? sampleTemplateVariables(locale, environment)
        : await buildTemplateVariables({
            prisma: this.prisma,
            ticket: (await this.loadTicket(input.ticketId, actor)).ticket,
            agentUserId: actor.actorUserId,
            locale,
            environment,
          });
    const body = input.body.slice(0, templateLimits.bodyMax);
    const filled = fillTemplate(body, values);
    return {
      templateId: null,
      text: filled.text,
      locale,
      missing: filled.missing,
      unknown: findUnknownPlaceholders(body),
    };
  }

  // ----------------------------------------------------------- management

  async listManaged(
    query: { ownership?: 'shared' | 'mine'; q?: string; serviceId?: string; state?: 'active' | 'inactive' | 'all' },
    actor: Actor,
  ): Promise<readonly ResponseTemplateResponse[]> {
    await this.requireTemplatesEnabled();
    const context = await this.loadContext(actor);
    const mine = query.ownership === 'mine';
    if (!hasPermission(context, mine ? permissionKeys.ticketTemplatesPersonal : permissionKeys.ticketTemplatesManage)) {
      throw new TemplatesError('FORBIDDEN');
    }
    const search = query.q?.trim() ?? '';
    const state = query.state ?? 'all';
    const rows = await this.prisma.responseTemplate.findMany({
      where: {
        deletedAt: null,
        ownerUserId: mine ? context.subjectId : null,
        ...(state === 'all' ? {} : { isActive: state === 'active' }),
        ...(query.serviceId === undefined ? {} : { services: { some: { serviceId: query.serviceId } } }),
        ...(search.length === 0
          ? {}
          : {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { bodyBs: { contains: search, mode: 'insensitive' } },
                { tags: { has: search.toLocaleLowerCase('bs') } },
              ],
            }),
      },
      include: templateInclude,
      orderBy: { name: 'asc' },
      take: 1000,
    });
    return rows.map((row) => this.toResponse(row, context));
  }

  async get(templateId: string, actor: Actor): Promise<ResponseTemplateResponse> {
    await this.requireTemplatesEnabled();
    const context = await this.loadContext(actor);
    const row = await this.loadVisibleForManagement(templateId, context);
    return this.toResponse(row, context);
  }

  async create(
    ownership: ResponseTemplateOwnership,
    body: ResponseTemplateInput & { reason?: string },
    actor: Actor,
  ): Promise<ResponseTemplateResponse> {
    await this.requireTemplatesEnabled();
    const context = await this.loadContext(actor);
    const normalized = normalizeResponseTemplateInput(body);
    const shared = ownership === 'shared';
    this.assertCanWrite(context, shared, normalized.scope);
    const reason = shared ? normalizeReason(body.reason) : 'personal_template';
    await this.assertScopeExists(normalized.scope);
    await this.assertNameFree(normalized.name, shared ? null : context.subjectId, null);
    const created = await this.prisma.$transaction(async (transaction) => {
      const tx = transaction as PrismaService;
      const row = await tx.responseTemplate.create({
        data: {
          ...toColumns(normalized),
          ownerUserId: shared ? null : context.subjectId,
          createdById: context.subjectId,
          updatedById: context.subjectId,
          ...scopeCreate(normalized.scope),
        },
        include: templateInclude,
      });
      await recordTemplatesChange(tx, {
        entityType: templateChangeLogEntityTypes.responseTemplate,
        entityId: row.id,
        action: changeLogActions.create,
        reason,
        before: null,
        after: toSnapshot(row),
        actorUserId: context.subjectId,
      });
      return row;
    });
    return this.toResponse(created, context);
  }

  async update(
    ownership: ResponseTemplateOwnership,
    templateId: string,
    body: ResponseTemplateInput & { reason?: string },
    actor: Actor,
  ): Promise<ResponseTemplateResponse> {
    await this.requireTemplatesEnabled();
    const context = await this.loadContext(actor);
    const current = await this.loadVisibleForManagement(templateId, context, ownership);
    const shared = current.ownerUserId === null;
    const normalized = normalizeResponseTemplateInput(body);
    // Both the old and the new scope must be the admin's (no "moving out").
    this.assertCanWrite(context, shared, toScope(current));
    this.assertCanWrite(context, shared, normalized.scope);
    const reason = shared ? normalizeReason(body.reason) : 'personal_template';
    await this.assertScopeExists(normalized.scope);
    await this.assertNameFree(normalized.name, current.ownerUserId, current.id);
    const updated = await this.prisma.$transaction(async (transaction) => {
      const tx = transaction as PrismaService;
      await Promise.all([
        tx.responseTemplateService.deleteMany({ where: { templateId } }),
        tx.responseTemplateCategory.deleteMany({ where: { templateId } }),
        tx.responseTemplateGroup.deleteMany({ where: { templateId } }),
      ]);
      const row = await tx.responseTemplate.update({
        where: { id: templateId },
        data: {
          ...toColumns(normalized),
          updatedById: context.subjectId,
          ...scopeCreate(normalized.scope),
        },
        include: templateInclude,
      });
      await recordTemplatesChange(tx, {
        entityType: templateChangeLogEntityTypes.responseTemplate,
        entityId: row.id,
        action: changeLogActions.update,
        reason,
        before: toSnapshot(current),
        after: toSnapshot(row),
        actorUserId: context.subjectId,
      });
      return row;
    });
    return this.toResponse(updated, context);
  }

  /** A3: soft delete — sent messages and playbook steps keep their link. */
  async remove(
    ownership: ResponseTemplateOwnership,
    templateId: string,
    reasonInput: string | undefined,
    actor: Actor,
  ): Promise<{ readonly id: string }> {
    await this.requireTemplatesEnabled();
    const context = await this.loadContext(actor);
    const current = await this.loadVisibleForManagement(templateId, context, ownership);
    const shared = current.ownerUserId === null;
    this.assertCanWrite(context, shared, toScope(current));
    const reason = shared ? normalizeReason(reasonInput) : 'personal_template';
    await this.prisma.$transaction(async (transaction) => {
      const tx = transaction as PrismaService;
      await tx.responseTemplate.update({
        where: { id: templateId },
        data: { deletedAt: new Date(), isActive: false, updatedById: context.subjectId },
      });
      await recordTemplatesChange(tx, {
        entityType: templateChangeLogEntityTypes.responseTemplate,
        entityId: templateId,
        action: changeLogActions.delete,
        reason,
        before: toSnapshot(current),
        after: null,
        actorUserId: context.subjectId,
      });
    });
    return { id: templateId };
  }

  // -------------------------------------------------------------- helpers

  private async requireTemplatesEnabled(): Promise<void> {
    if (!(await this.configurationLoader.load()).templatesEnabled) {
      throw new TemplatesError('TEMPLATES_DISABLED');
    }
  }

  private async loadContext(actor: Actor): Promise<AuthorizationContext> {
    const context = await this.authorizationContextLoader.loadBySubjectId(actor.actorUserId);
    if (context === null) {
      throw new TemplatesError('FORBIDDEN');
    }
    return context;
  }

  private async requireUse(actor: Actor): Promise<AuthorizationContext> {
    await this.requireTemplatesEnabled();
    const context = await this.loadContext(actor);
    if (!hasPermission(context, permissionKeys.ticketTemplatesUse)) {
      throw new TemplatesError('FORBIDDEN');
    }
    return context;
  }

  private async loadTicket(ticketId: string, actor: Actor) {
    const gated = await this.accessPolicies.bind({ actorUserId: actor.actorUserId });
    const { ticket, access } = await loadAccessibleTicket(
      this.prisma,
      this.authorizationContextLoader,
      ticketId,
      gated,
    );
    if (access.visibility !== 'staff') {
      throw new TemplatesError('FORBIDDEN');
    }
    const service = await this.prisma.service.findUnique({
      where: { id: ticket.serviceId },
      select: { categoryId: true },
    });
    const facts: TicketScopeFacts = {
      serviceId: ticket.serviceId,
      categoryId: service?.categoryId ?? null,
      assignedGroupId: ticket.assignedGroupId,
    };
    return { ticket, facts };
  }

  private async loadVisibleForManagement(
    templateId: string,
    context: AuthorizationContext,
    ownership?: ResponseTemplateOwnership,
  ): Promise<TemplateRow> {
    const row = await this.prisma.responseTemplate.findFirst({
      where: { id: templateId, deletedAt: null },
      include: templateInclude,
    });
    if (row === null) {
      throw new TemplatesError('TEMPLATE_NOT_FOUND');
    }
    const visible =
      row.ownerUserId === null
        ? hasPermission(context, permissionKeys.ticketTemplatesManage)
        : row.ownerUserId === context.subjectId;
    const pathMatches =
      ownership === undefined || (ownership === 'shared') === (row.ownerUserId === null);
    if (!visible || !pathMatches) {
      // Someone else's personal template does not exist for the caller.
      throw new TemplatesError('TEMPLATE_NOT_FOUND');
    }
    return row;
  }

  private assertCanWrite(context: AuthorizationContext, shared: boolean, scope: TemplateScope): void {
    if (!shared) {
      if (!hasPermission(context, permissionKeys.ticketTemplatesPersonal)) {
        throw new TemplatesError('FORBIDDEN');
      }
      return;
    }
    if (!hasPermission(context, permissionKeys.ticketTemplatesManage)) {
      throw new TemplatesError('FORBIDDEN');
    }
    if (!canManageSharedScope(context, scope)) {
      throw new TemplatesError('TEMPLATE_SCOPE_FORBIDDEN');
    }
  }

  private async assertScopeExists(scope: TemplateScope): Promise<void> {
    const [services, categories, groups] = await Promise.all([
      scope.serviceIds.length === 0 ? 0 : this.prisma.service.count({ where: { id: { in: [...scope.serviceIds] } } }),
      scope.categoryIds.length === 0
        ? 0
        : this.prisma.serviceCategory.count({ where: { id: { in: [...scope.categoryIds] } } }),
      scope.groupIds.length === 0 ? 0 : this.prisma.group.count({ where: { id: { in: [...scope.groupIds] } } }),
    ]);
    if (
      services !== scope.serviceIds.length ||
      categories !== scope.categoryIds.length ||
      groups !== scope.groupIds.length
    ) {
      throw new TemplatesError('TEMPLATE_SCOPE_INVALID');
    }
  }

  private async assertNameFree(name: string, ownerUserId: string | null, exceptId: string | null): Promise<void> {
    const clash = await this.prisma.responseTemplate.findFirst({
      where: {
        deletedAt: null,
        ownerUserId,
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId === null ? {} : { id: { not: exceptId } }),
      },
      select: { id: true },
    });
    if (clash !== null) {
      throw new TemplatesError('TEMPLATE_NAME_TAKEN');
    }
  }

  private toResponse(row: TemplateRow, context: AuthorizationContext): ResponseTemplateResponse {
    const scope = toScope(row);
    const shared = row.ownerUserId === null;
    return {
      id: row.id,
      name: row.name,
      bodyBs: row.bodyBs,
      bodyEn: row.bodyEn,
      kind: row.kind,
      tags: row.tags,
      isActive: row.isActive,
      ownership: shared ? 'shared' : 'personal',
      serviceIds: scope.serviceIds,
      categoryIds: scope.categoryIds,
      groupIds: scope.groupIds,
      variables: [...new Set([...extractPlaceholders(row.bodyBs), ...extractPlaceholders(row.bodyEn ?? '')])],
      usageCount: row.usageCount,
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
      canEdit: shared
        ? hasPermission(context, permissionKeys.ticketTemplatesManage) && canManageSharedScope(context, scope)
        : row.ownerUserId === context.subjectId,
    };
  }
}

/** T5: scope match first; on equal match shared before personal. */
function rankOf(entry: { row: TemplateRow; score: number }): number {
  return entry.score * 2 + (entry.row.ownerUserId === null ? 1 : 0);
}

function toScope(row: TemplateRow): TemplateScope {
  return {
    serviceIds: row.services.map((entry) => entry.serviceId).sort(),
    categoryIds: row.categories.map((entry) => entry.categoryId).sort(),
    groupIds: row.groups.map((entry) => entry.groupId).sort(),
  };
}

function toColumns(normalized: NormalizedResponseTemplate) {
  return {
    name: normalized.name,
    bodyBs: normalized.bodyBs,
    bodyEn: normalized.bodyEn,
    kind: normalized.kind,
    tags: [...normalized.tags],
    isActive: normalized.isActive,
  };
}

function scopeCreate(scope: TemplateScope) {
  return {
    services: { create: scope.serviceIds.map((serviceId) => ({ serviceId })) },
    categories: { create: scope.categoryIds.map((categoryId) => ({ categoryId })) },
    groups: { create: scope.groupIds.map((groupId) => ({ groupId })) },
  };
}

export function toSnapshot(row: TemplateRow) {
  const scope = toScope(row);
  return {
    id: row.id,
    name: row.name,
    bodyBs: row.bodyBs,
    bodyEn: row.bodyEn,
    kind: row.kind,
    tags: row.tags,
    isActive: row.isActive,
    ownerUserId: row.ownerUserId,
    ...scope,
  };
}
