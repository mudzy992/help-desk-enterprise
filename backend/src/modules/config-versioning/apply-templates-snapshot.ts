import type { Prisma } from '../../generated/prisma/client';
import type { ResponseTemplateKind } from '../../generated/prisma/enums';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { changeLogActions } from '../change-log/change-log.constants';
import { recordTemplatesChange } from '../templates/record-templates-change';
import { normalizeName, normalizeMultiline, normalizeResponseTemplateInput } from '../templates/normalize-template-input';
import { normalizePlaybookInput, stepsChanged } from '../templates/playbooks/normalize-playbook-input';
import { templateChangeLogEntityTypes } from '../templates/templates.constants';
import { configVersioningErrorCodes } from './config-versioning.constants';
import { ConfigVersioningError } from './config-versioning.error';
import type {
  ConfigPlaybookSnapshot,
  ConfigPlaybookStepSnapshot,
  ConfigResponseTemplateSnapshot,
  ConfigSnapshot,
  ConfigValidationIssue,
} from './config-versioning.types';

const responseTemplateInclude = {
  services: { select: { serviceId: true } },
  categories: { select: { categoryId: true } },
  groups: { select: { groupId: true } },
} as const;

const playbookInclude = {
  services: { select: { serviceId: true } },
  categories: { select: { categoryId: true } },
  steps: {
    orderBy: [{ position: 'asc' }, { stepKey: 'asc' }] as Prisma.PlaybookStepOrderByWithRelationInput[],
  },
} as const satisfies Prisma.PlaybookInclude;

type ResponseTemplateRow = Prisma.ResponseTemplateGetPayload<{
  include: typeof responseTemplateInclude;
}>;
type PlaybookRow = Prisma.PlaybookGetPayload<{ include: typeof playbookInclude }>;
type AuditContext = { readonly reason: string; readonly actorUserId: string | null };

/**
 * Applies shared template/playbook definitions in the activation transaction.
 * Missing resource rows are not recreated, personal templates are never read
 * for writes, and legacy header-only snapshots leave scope/steps untouched.
 */
export async function applyTemplatesSnapshot(
  transaction: Prisma.TransactionClient,
  snapshot: ConfigSnapshot,
  audit: AuditContext,
): Promise<ConfigSnapshot['templates']> {
  const section = snapshot.templates;
  if (section === undefined) return undefined;

  const templateIds = [...new Set(section.responseTemplates.map(({ id }) => id))];
  const playbookIds = [...new Set(section.playbooks.map(({ id }) => id))];
  const [templateRows, playbookRows, liveTemplateNames, livePlaybookNames] = await Promise.all([
    templateIds.length === 0
      ? Promise.resolve([] as ResponseTemplateRow[])
      : transaction.responseTemplate.findMany({
          where: { id: { in: templateIds }, ownerUserId: null },
          include: responseTemplateInclude,
        }),
    playbookIds.length === 0
      ? Promise.resolve([] as PlaybookRow[])
      : transaction.playbook.findMany({
          where: { id: { in: playbookIds } },
          include: playbookInclude,
        }),
    templateIds.length === 0
      ? Promise.resolve([] as Array<{ id: string; name: string }>)
      : transaction.responseTemplate.findMany({
          where: { ownerUserId: null, deletedAt: null },
          select: { id: true, name: true },
        }),
    playbookIds.length === 0
      ? Promise.resolve([] as Array<{ id: string; name: string }>)
      : transaction.playbook.findMany({
          where: { deletedAt: null },
          select: { id: true, name: true },
        }),
  ]);

  const templatesById = new Map(templateRows.map((row) => [row.id, row]));
  const playbooksById = new Map(playbookRows.map((row) => [row.id, row]));
  const applicableTemplates = section.responseTemplates.filter((row) => templatesById.has(row.id));
  const applicablePlaybooks = section.playbooks.filter((row) => playbooksById.has(row.id));
  const issues: ConfigValidationIssue[] = [];

  validateNames(
    applicableTemplates,
    liveTemplateNames,
    'template_name_conflict',
    'templates.responseTemplates',
    issues,
  );
  validateNames(
    applicablePlaybooks,
    livePlaybookNames,
    'playbook_name_conflict',
    'templates.playbooks',
    issues,
  );

  const desiredScope = collectScopeReferences(applicableTemplates, applicablePlaybooks);
  await validateReferences(transaction, desiredScope, applicablePlaybooks, applicableTemplates, playbooksById, issues);
  validateTemplateDefinitions(applicableTemplates, issues);
  validatePlaybookDefinitions(applicablePlaybooks, playbooksById, issues);
  if (issues.length > 0) throw invariantViolation(deduplicateIssues(issues));

  const appliedTemplates = new Map<string, ConfigResponseTemplateSnapshot>();
  for (const desired of section.responseTemplates) {
    const current = templatesById.get(desired.id);
    if (current === undefined) continue;
    const normalized = normalizeResponseTemplateInput({
      name: desired.name,
      bodyBs: desired.bodyBs,
      bodyEn: desired.bodyEn,
      kind: desired.kind as ResponseTemplateKind,
      tags: desired.tags,
      isActive: desired.isActive,
      ...(desired.scope === undefined
        ? {}
        : {
            serviceIds: desired.scope.serviceIds,
            categoryIds: desired.scope.categoryIds,
            groupIds: desired.scope.groupIds,
          }),
    });
    const before = toResponseTemplateAuditSnapshot(current);
    const update = await transaction.responseTemplate.updateMany({
      where: { id: desired.id, ownerUserId: null },
      data: {
        name: normalized.name,
        bodyBs: normalized.bodyBs,
        bodyEn: normalized.bodyEn,
        kind: normalized.kind,
        tags: [...normalized.tags],
        isActive: desired.isActive,
        deletedAt: toDate(desired.deletedAt),
        updatedById: audit.actorUserId,
      },
    });
    if (update.count !== 1) {
      throw invariantViolation([issue('template_target_changed', `templates.responseTemplates.${desired.id}`)]);
    }
    if (desired.scope !== undefined) {
      await replaceResponseTemplateScope(transaction, desired.id, normalized.scope);
    }
    const updated = await transaction.responseTemplate.findUnique({
      where: { id: desired.id },
      include: responseTemplateInclude,
    });
    if (updated === null || updated.ownerUserId !== null) {
      throw invariantViolation([issue('template_target_changed', `templates.responseTemplates.${desired.id}`)]);
    }
    await recordTemplatesChange(transaction as unknown as PrismaService, {
      entityType: templateChangeLogEntityTypes.responseTemplate,
      entityId: updated.id,
      action: changeLogActions.update,
      reason: audit.reason,
      actorUserId: audit.actorUserId,
      before,
      after: toResponseTemplateAuditSnapshot(updated),
    });
    appliedTemplates.set(updated.id, toResponseTemplateSnapshot(updated));
  }

  const appliedPlaybooks = new Map<string, ConfigPlaybookSnapshot>();
  for (const desired of section.playbooks) {
    const current = playbooksById.get(desired.id);
    if (current === undefined) continue;
    const before = toPlaybookAuditSnapshot(current);
    const stepsChangedInDefinition = desired.steps !== undefined && stepsChanged(
      current.steps.map(stripPosition),
      desired.steps.map(stripPosition),
    );
    const update = await transaction.playbook.updateMany({
      where: { id: desired.id },
      data: {
        name: desired.name,
        description: desired.description,
        isActive: desired.isActive,
        deletedAt: toDate(desired.deletedAt),
        updatedById: audit.actorUserId,
        ...(stepsChangedInDefinition ? { version: { increment: 1 } } : {}),
      },
    });
    if (update.count !== 1) {
      throw invariantViolation([issue('playbook_target_changed', `templates.playbooks.${desired.id}`)]);
    }
    if (desired.scope !== undefined) {
      await replacePlaybookScope(transaction, desired.id, desired.scope);
    }
    if (desired.steps !== undefined) {
      await replacePlaybookSteps(transaction, desired.id, desired.steps);
    }
    const updated = await transaction.playbook.findUnique({
      where: { id: desired.id },
      include: playbookInclude,
    });
    if (updated === null) {
      throw invariantViolation([issue('playbook_target_changed', `templates.playbooks.${desired.id}`)]);
    }
    await recordTemplatesChange(transaction as unknown as PrismaService, {
      entityType: templateChangeLogEntityTypes.playbook,
      entityId: updated.id,
      action: changeLogActions.update,
      reason: audit.reason,
      actorUserId: audit.actorUserId,
      before,
      after: toPlaybookAuditSnapshot(updated),
    });
    appliedPlaybooks.set(updated.id, toPlaybookSnapshot(updated));
  }

  return {
    responseTemplates: section.responseTemplates.map((row) => appliedTemplates.get(row.id) ?? row),
    playbooks: section.playbooks.map((row) => appliedPlaybooks.get(row.id) ?? row),
  };
}

async function validateReferences(
  transaction: Prisma.TransactionClient,
  scope: { readonly serviceIds: readonly string[]; readonly categoryIds: readonly string[]; readonly groupIds: readonly string[] },
  playbooks: readonly ConfigPlaybookSnapshot[],
  templates: readonly ConfigResponseTemplateSnapshot[],
  playbooksById: ReadonlyMap<string, PlaybookRow>,
  issues: ConfigValidationIssue[],
): Promise<void> {
  const steps = playbooks.flatMap((playbook) => playbook.steps ?? []);
  const [serviceCount, categoryCount, groupCount, articleCount, referencedTemplates] = await Promise.all([
    scope.serviceIds.length === 0
      ? Promise.resolve(0)
      : transaction.service.count({ where: { id: { in: [...scope.serviceIds] } } }),
    scope.categoryIds.length === 0
      ? Promise.resolve(0)
      : transaction.serviceCategory.count({ where: { id: { in: [...scope.categoryIds] } } }),
    scope.groupIds.length === 0
      ? Promise.resolve(0)
      : transaction.group.count({ where: { id: { in: [...scope.groupIds] } } }),
    uniqueIds(steps.flatMap((step) => step.knowledgeArticleId === null ? [] : [step.knowledgeArticleId])).length === 0
      ? Promise.resolve(0)
      : transaction.knowledgeArticle.count({
          where: {
            id: {
              in: uniqueIds(steps.flatMap((step) => step.knowledgeArticleId === null ? [] : [step.knowledgeArticleId])),
            },
          },
        }),
    uniqueIds(steps.flatMap((step) => step.responseTemplateId === null ? [] : [step.responseTemplateId])).length === 0
      ? Promise.resolve([] as Array<{ id: string; ownerUserId: string | null; deletedAt: Date | null }>)
      : transaction.responseTemplate.findMany({
          where: {
            id: {
              in: uniqueIds(steps.flatMap((step) => step.responseTemplateId === null ? [] : [step.responseTemplateId])),
            },
          },
          select: { id: true, ownerUserId: true, deletedAt: true },
        }),
  ]);

  if (serviceCount !== scope.serviceIds.length) issues.push(issue('service_scope_missing', 'templates.scope.services'));
  if (categoryCount !== scope.categoryIds.length) issues.push(issue('category_scope_missing', 'templates.scope.categories'));
  if (groupCount !== scope.groupIds.length) issues.push(issue('group_scope_missing', 'templates.scope.groups'));
  const articleIds = uniqueIds(steps.flatMap((step) => step.knowledgeArticleId === null ? [] : [step.knowledgeArticleId]));
  if (articleCount !== articleIds.length) issues.push(issue('knowledge_article_missing', 'templates.playbooks.steps.knowledgeArticleId'));

  const referencedTemplateById = new Map(referencedTemplates.map((row) => [row.id, row]));
  const desiredTemplateById = new Map(templates.map((row) => [row.id, row]));
  for (const playbook of playbooks) {
    if (playbook.steps === undefined) continue;
    const current = playbooksById.get(playbook.id);
    if (current === undefined) continue;
    const existingStepIds = new Map(current.steps.map((step) => [step.stepKey, step.responseTemplateId]));
    for (const [index, step] of playbook.steps.entries()) {
      const id = step.responseTemplateId;
      if (id === null) continue;
      const currentReference = referencedTemplateById.get(id);
      const snapshotReference = desiredTemplateById.get(id);
      const finalOwner = currentReference?.ownerUserId;
      const finalDeletedAt = snapshotReference === undefined
        ? currentReference?.deletedAt
        : toDate(snapshotReference.deletedAt);
      const legacyUnchangedReference = existingStepIds.get(step.stepKey) === id;
      if (
        currentReference === undefined ||
        finalOwner !== null ||
        (finalDeletedAt !== null && !legacyUnchangedReference)
      ) {
        issues.push(issue('playbook_response_template_invalid', `templates.playbooks.${playbook.id}.steps[${index}].responseTemplateId`));
      }
    }
  }

}

function validateTemplateDefinitions(
  templates: readonly ConfigResponseTemplateSnapshot[],
  issues: ConfigValidationIssue[],
): void {
  for (const template of templates) {
    if (
      !['REPLY', 'INTERNAL', 'ANY'].includes(template.kind) ||
      (template.deletedAt !== null &&
        (!Number.isFinite(Date.parse(template.deletedAt)) || template.isActive))
    ) {
      issues.push(issue('template_definition_invalid', `templates.responseTemplates.${template.id}`));
      continue;
    }
    try {
      const normalized = normalizeResponseTemplateInput({
        name: template.name,
        bodyBs: template.bodyBs,
        bodyEn: template.bodyEn,
        kind: template.kind as ResponseTemplateKind,
        tags: template.tags,
        isActive: template.isActive,
        ...(template.scope === undefined
          ? {}
          : {
              serviceIds: template.scope.serviceIds,
              categoryIds: template.scope.categoryIds,
              groupIds: template.scope.groupIds,
            }),
      });
      if (
        normalized.name !== template.name ||
        normalized.bodyBs !== template.bodyBs ||
        normalized.bodyEn !== template.bodyEn ||
        !sameArray(normalized.tags, template.tags) ||
        (template.scope !== undefined &&
          (!sameArray(normalized.scope.serviceIds, template.scope.serviceIds) ||
            !sameArray(normalized.scope.categoryIds, template.scope.categoryIds) ||
            !sameArray(normalized.scope.groupIds, template.scope.groupIds)))
      ) {
        issues.push(issue('template_definition_invalid', `templates.responseTemplates.${template.id}`));
      }
    } catch {
      issues.push(issue('template_definition_invalid', `templates.responseTemplates.${template.id}`));
    }
  }
}

function validatePlaybookDefinitions(
  playbooks: readonly ConfigPlaybookSnapshot[],
  playbooksById: ReadonlyMap<string, PlaybookRow>,
  issues: ConfigValidationIssue[],
): void {
  for (const playbook of playbooks) {
    const current = playbooksById.get(playbook.id);
    if (current === undefined) continue;
    if (
      (playbook.version !== undefined &&
        (!Number.isSafeInteger(playbook.version) || playbook.version < 1)) ||
      (playbook.deletedAt !== null &&
        (!Number.isFinite(Date.parse(playbook.deletedAt)) || playbook.isActive))
    ) {
      issues.push(issue('playbook_definition_invalid', `templates.playbooks.${playbook.id}`));
      continue;
    }
    try {
      const normalizedName = normalizeName(playbook.name, 'PLAYBOOK_NAME_INVALID');
      const normalizedDescription = normalizeMultiline(playbook.description);
      if (
        normalizedName !== playbook.name ||
        (normalizedDescription.length === 0 ? null : normalizedDescription) !== playbook.description
      ) {
        issues.push(issue('playbook_definition_invalid', `templates.playbooks.${playbook.id}`));
        continue;
      }
      const normalized = normalizePlaybookInput({
        name: playbook.name,
        description: playbook.description,
        isActive: playbook.isActive,
        serviceIds: playbook.scope?.serviceIds ?? current.services.map(({ serviceId }) => serviceId),
        categoryIds: playbook.scope?.categoryIds ?? current.categories.map(({ categoryId }) => categoryId),
        steps: (playbook.steps ?? current.steps).map(({ position: _position, ...step }) => step),
      });
      if (
        playbook.scope !== undefined &&
        (!sameArray(normalized.serviceIds, playbook.scope.serviceIds) ||
          !sameArray(normalized.categoryIds, playbook.scope.categoryIds))
      ) {
        issues.push(issue('playbook_scope_invalid', `templates.playbooks.${playbook.id}.scope`));
      }
      if (
        playbook.steps !== undefined &&
        (normalized.steps.length !== playbook.steps.length ||
          normalized.steps.some((step, index) => !sameStep(step, playbook.steps![index]!)))
      ) {
        issues.push(issue('playbook_steps_invalid', `templates.playbooks.${playbook.id}.steps`));
      }
    } catch {
      issues.push(issue('playbook_definition_invalid', `templates.playbooks.${playbook.id}`));
    }
  }
}

function collectScopeReferences(
  templates: readonly ConfigResponseTemplateSnapshot[],
  playbooks: readonly ConfigPlaybookSnapshot[],
): { readonly serviceIds: readonly string[]; readonly categoryIds: readonly string[]; readonly groupIds: readonly string[] } {
  return {
    serviceIds: uniqueIds([
      ...templates.flatMap((item) => item.scope?.serviceIds ?? []),
      ...playbooks.flatMap((item) => item.scope?.serviceIds ?? []),
    ]),
    categoryIds: uniqueIds([
      ...templates.flatMap((item) => item.scope?.categoryIds ?? []),
      ...playbooks.flatMap((item) => item.scope?.categoryIds ?? []),
    ]),
    groupIds: uniqueIds(templates.flatMap((item) => item.scope?.groupIds ?? [])),
  };
}

async function replaceResponseTemplateScope(
  transaction: Prisma.TransactionClient,
  templateId: string,
  scope: { readonly serviceIds: readonly string[]; readonly categoryIds: readonly string[]; readonly groupIds: readonly string[] },
): Promise<void> {
  await transaction.responseTemplateService.deleteMany({ where: { templateId } });
  await transaction.responseTemplateCategory.deleteMany({ where: { templateId } });
  await transaction.responseTemplateGroup.deleteMany({ where: { templateId } });
  if (scope.serviceIds.length > 0) {
    await transaction.responseTemplateService.createMany({
      data: scope.serviceIds.map((serviceId) => ({ templateId, serviceId })),
    });
  }
  if (scope.categoryIds.length > 0) {
    await transaction.responseTemplateCategory.createMany({
      data: scope.categoryIds.map((categoryId) => ({ templateId, categoryId })),
    });
  }
  if (scope.groupIds.length > 0) {
    await transaction.responseTemplateGroup.createMany({
      data: scope.groupIds.map((groupId) => ({ templateId, groupId })),
    });
  }
}

async function replacePlaybookScope(
  transaction: Prisma.TransactionClient,
  playbookId: string,
  scope: NonNullable<ConfigPlaybookSnapshot['scope']>,
): Promise<void> {
  await transaction.playbookService.deleteMany({ where: { playbookId } });
  await transaction.playbookCategory.deleteMany({ where: { playbookId } });
  if (scope.serviceIds.length > 0) {
    await transaction.playbookService.createMany({
      data: scope.serviceIds.map((serviceId) => ({ playbookId, serviceId })),
    });
  }
  if (scope.categoryIds.length > 0) {
    await transaction.playbookCategory.createMany({
      data: scope.categoryIds.map((categoryId) => ({ playbookId, categoryId })),
    });
  }
}

async function replacePlaybookSteps(
  transaction: Prisma.TransactionClient,
  playbookId: string,
  steps: readonly ConfigPlaybookStepSnapshot[],
): Promise<void> {
  const stepKeys = steps.map(({ stepKey }) => stepKey);
  await transaction.playbookStep.deleteMany({
    where: { playbookId, stepKey: { notIn: stepKeys } },
  });
  for (const step of steps) {
    const data = {
      position: step.position,
      title: step.title,
      instructions: step.instructions,
      required: step.required,
      knowledgeArticleId: step.knowledgeArticleId,
      responseTemplateId: step.responseTemplateId,
    };
    await transaction.playbookStep.upsert({
      where: { playbookId_stepKey: { playbookId, stepKey: step.stepKey } },
      create: { ...data, playbookId, stepKey: step.stepKey },
      update: data,
    });
  }
}

function validateNames<T extends { readonly id: string; readonly name: string; readonly deletedAt: string | null }>(
  desired: readonly T[],
  existing: readonly { readonly id: string; readonly name: string }[],
  code: string,
  path: string,
  issues: ConfigValidationIssue[],
): void {
  const desiredIds = new Set(desired.map(({ id }) => id));
  const usedNames = new Set(
    existing.filter(({ id }) => !desiredIds.has(id)).map(({ name }) => name.toLocaleLowerCase('en')),
  );
  for (const [index, item] of desired.entries()) {
    if (item.deletedAt !== null) continue;
    const key = item.name.toLocaleLowerCase('en');
    if (usedNames.has(key)) issues.push(issue(code, `${path}[${index}].name`));
    usedNames.add(key);
  }
}

function toResponseTemplateSnapshot(row: ResponseTemplateRow): ConfigResponseTemplateSnapshot {
  return {
    id: row.id,
    name: row.name,
    bodyBs: row.bodyBs,
    bodyEn: row.bodyEn,
    kind: row.kind,
    tags: [...row.tags],
    isActive: row.isActive,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    scope: {
      serviceIds: row.services.map(({ serviceId }) => serviceId).sort(),
      categoryIds: row.categories.map(({ categoryId }) => categoryId).sort(),
      groupIds: row.groups.map(({ groupId }) => groupId).sort(),
    },
  };
}

function toResponseTemplateAuditSnapshot(row: ResponseTemplateRow) {
  return { ...toResponseTemplateSnapshot(row), ownerUserId: row.ownerUserId };
}

function toPlaybookSnapshot(row: PlaybookRow): ConfigPlaybookSnapshot {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isActive: row.isActive,
    version: row.version,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    scope: {
      serviceIds: row.services.map(({ serviceId }) => serviceId).sort(),
      categoryIds: row.categories.map(({ categoryId }) => categoryId).sort(),
    },
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

function toPlaybookAuditSnapshot(row: PlaybookRow) {
  return toPlaybookSnapshot(row);
}

function stripPosition(step: ConfigPlaybookStepSnapshot) {
  const { position: _position, ...rest } = step;
  return rest;
}

function sameStep(
  left: ReturnType<typeof normalizePlaybookInput>['steps'][number],
  right: ConfigPlaybookStepSnapshot,
): boolean {
  return (
    left.stepKey === right.stepKey &&
    left.position === right.position &&
    left.title === right.title &&
    left.instructions === right.instructions &&
    left.required === right.required &&
    left.knowledgeArticleId === right.knowledgeArticleId &&
    left.responseTemplateId === right.responseTemplateId
  );
}

function sameArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function uniqueIds(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function toDate(value: string | null): Date | null {
  return value === null ? null : new Date(value);
}

function issue(code: string, path: string): ConfigValidationIssue {
  return { code, path, message: code };
}

function invariantViolation(issues: readonly ConfigValidationIssue[]): ConfigVersioningError {
  return new ConfigVersioningError(configVersioningErrorCodes.templatesInvariantViolation, issues);
}

function deduplicateIssues(issues: readonly ConfigValidationIssue[]): ConfigValidationIssue[] {
  const seen = new Set<string>();
  return issues.filter((entry) => {
    const key = `${entry.code}\u0000${entry.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
