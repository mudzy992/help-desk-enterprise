import { configVersioningErrorCodes } from './config-versioning.constants';
import { ConfigVersioningError } from './config-versioning.error';
import type {
  ConfigPlaybookScopeSnapshot,
  ConfigPlaybookSnapshot,
  ConfigPlaybookStepSnapshot,
  ConfigResponseTemplateSnapshot,
  ConfigTemplateScopeSnapshot,
  ConfigSnapshot,
} from './config-versioning.types';
import {
  normalizeName,
  normalizeResponseTemplateInput,
} from '../templates/normalize-template-input';
import { normalizePlaybookInput } from '../templates/playbooks/normalize-playbook-input';
import { templateLimits } from '../templates/templates.constants';
import {
  isPlainObject,
  readBoolean,
  readNumber,
  readNullableString,
  readString,
} from './read-snapshot-primitives';

const responseTemplateKinds = new Set(['REPLY', 'INTERNAL', 'ANY']);
const playbookStepKeyPattern = /^[A-Za-z0-9_-]{1,64}$/u;

/** Optional only for snapshots created before the complete-template snapshot change. */
export function parseTemplatesSection(value: unknown): NonNullable<ConfigSnapshot['templates']> {
  if (!isPlainObject(value) || !Array.isArray(value.responseTemplates) || !Array.isArray(value.playbooks)) {
    throw invalid();
  }
  const responseTemplates = value.responseTemplates.map(parseTemplate);
  const playbooks = value.playbooks.map(parsePlaybook);
  assertUniqueIds(responseTemplates.map(({ id }) => id));
  assertUniqueIds(playbooks.map(({ id }) => id));
  assertUniqueLiveNames(responseTemplates, playbooks);
  return { responseTemplates, playbooks };
}

function parseTemplate(value: unknown): ConfigResponseTemplateSnapshot {
  if (!isPlainObject(value)) {
    throw invalid();
  }
  const id = readNonEmptyString(value.id);
  const name = readNonEmptyString(value.name);
  const bodyBs = readString(value.bodyBs);
  const bodyEn = readNullableString(value.bodyEn);
  const kind = readString(value.kind);
  const isActive = readBoolean(value.isActive);
  const deletedAt = parseDeletedAt(value.deletedAt);
  const tags = parseStringArray(value.tags);
  const scope = value.scope === undefined ? undefined : parseTemplateScope(value.scope);
  if (
    id === null ||
    name === null ||
    bodyBs === null ||
    bodyEn === undefined ||
    kind === null ||
    !responseTemplateKinds.has(kind) ||
    isActive === null ||
    deletedAt === undefined ||
    tags === undefined ||
    (deletedAt !== null && isActive)
  ) {
    throw invalid();
  }
  try {
    const normalized = normalizeResponseTemplateInput({
      name,
      bodyBs,
      bodyEn,
      kind: kind as ConfigResponseTemplateSnapshot['kind'],
      tags,
      isActive,
      ...(scope === undefined
        ? {}
        : {
            serviceIds: scope.serviceIds,
            categoryIds: scope.categoryIds,
            groupIds: scope.groupIds,
          }),
    });
    if (
      normalized.name !== name ||
      normalized.bodyBs !== bodyBs ||
      normalized.bodyEn !== bodyEn ||
      !sameArray(normalized.tags, tags) ||
      (scope !== undefined &&
        (!sameArray(normalized.scope.serviceIds, scope.serviceIds) ||
          !sameArray(normalized.scope.categoryIds, scope.categoryIds) ||
          !sameArray(normalized.scope.groupIds, scope.groupIds)))
    ) {
      throw invalid();
    }
  } catch {
    throw invalid();
  }
  return {
    id,
    name,
    bodyBs,
    bodyEn,
    kind: kind as ConfigResponseTemplateSnapshot['kind'],
    tags,
    isActive,
    deletedAt,
    ...(scope === undefined ? {} : { scope }),
  };
}

function parsePlaybook(value: unknown): ConfigPlaybookSnapshot {
  if (!isPlainObject(value)) {
    throw invalid();
  }
  const id = readNonEmptyString(value.id);
  const name = readNonEmptyString(value.name);
  const description = readNullableString(value.description);
  const isActive = readBoolean(value.isActive);
  const deletedAt = parseDeletedAt(value.deletedAt);
  const parsedVersion = value.version === undefined ? undefined : readNumber(value.version);
  const version = parsedVersion === null ? undefined : parsedVersion;
  const scope = value.scope === undefined ? undefined : parsePlaybookScope(value.scope);
  const steps = value.steps === undefined ? undefined : parsePlaybookSteps(value.steps);
  if (
    id === null ||
    name === null ||
    description === undefined ||
    isActive === null ||
    deletedAt === undefined ||
    (value.version !== undefined &&
      (version === undefined || !Number.isSafeInteger(version) || version < 1)) ||
    (value.steps !== undefined && steps === undefined) ||
    (deletedAt !== null && isActive)
  ) {
    throw invalid();
  }

  try {
    if (steps !== undefined) {
      const normalized = normalizePlaybookInput({
        name,
        description,
        isActive,
        ...(scope === undefined
          ? {}
          : { serviceIds: scope.serviceIds, categoryIds: scope.categoryIds }),
        steps: steps.map(({ position: _position, ...step }) => step),
      });
      if (
        normalized.name !== name ||
        normalized.description !== description ||
        !sameArray(normalized.serviceIds, scope?.serviceIds ?? []) ||
        !sameArray(normalized.categoryIds, scope?.categoryIds ?? []) ||
        normalized.steps.length !== steps.length ||
        normalized.steps.some((step, index) => !samePlaybookStep(step, steps[index]!))
      ) {
        throw invalid();
      }
    } else {
      if (normalizeName(name, 'PLAYBOOK_NAME_INVALID') !== name) throw invalid();
      if (scope !== undefined) {
        const normalizedScope = normalizePlaybookInput({
          name,
          description,
          isActive,
          serviceIds: scope.serviceIds,
          categoryIds: scope.categoryIds,
          steps: [{ stepKey: 'validation-placeholder', title: 'Validation placeholder' }],
        });
        if (
          !sameArray(normalizedScope.serviceIds, scope.serviceIds) ||
          !sameArray(normalizedScope.categoryIds, scope.categoryIds)
        ) {
          throw invalid();
        }
      }
    }
  } catch {
    throw invalid();
  }

  return {
    id,
    name,
    description,
    isActive,
    deletedAt,
    ...(version === undefined ? {} : { version }),
    ...(scope === undefined ? {} : { scope }),
    ...(steps === undefined ? {} : { steps }),
  };
}

function parseTemplateScope(value: unknown): ConfigTemplateScopeSnapshot {
  if (!isPlainObject(value)) throw invalid();
  const serviceIds = parseIds(value.serviceIds);
  const categoryIds = parseIds(value.categoryIds);
  const groupIds = parseIds(value.groupIds);
  if (serviceIds === undefined || categoryIds === undefined || groupIds === undefined) throw invalid();
  return { serviceIds, categoryIds, groupIds };
}

function parsePlaybookScope(value: unknown): ConfigPlaybookScopeSnapshot {
  if (!isPlainObject(value)) throw invalid();
  const serviceIds = parseIds(value.serviceIds);
  const categoryIds = parseIds(value.categoryIds);
  if (serviceIds === undefined || categoryIds === undefined) throw invalid();
  return { serviceIds, categoryIds };
}

function parseIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length > templateLimits.scopeItemsMax) return undefined;
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const id = readNonEmptyString(entry);
    if (id === null || seen.has(id)) return undefined;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function parseStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length > templateLimits.tagsMax) return undefined;
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.length === 0 || entry.length > templateLimits.tagMax || seen.has(entry)) {
      return undefined;
    }
    seen.add(entry);
    tags.push(entry);
  }
  return tags;
}

function parsePlaybookSteps(value: unknown): ConfigPlaybookStepSnapshot[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > templateLimits.stepsMax) return undefined;
  const keys = new Set<string>();
  const steps: ConfigPlaybookStepSnapshot[] = [];
  for (const [index, entry] of value.entries()) {
    if (!isPlainObject(entry)) return undefined;
    const stepKey = readNonEmptyString(entry.stepKey);
    const position = readNumber(entry.position);
    const title = readNonEmptyString(entry.title);
    const instructions = readNullableString(entry.instructions);
    const required = readBoolean(entry.required);
    const knowledgeArticleId = readNullableId(entry.knowledgeArticleId);
    const responseTemplateId = readNullableId(entry.responseTemplateId);
    if (
      stepKey === null ||
      !playbookStepKeyPattern.test(stepKey) ||
      keys.has(stepKey) ||
      position !== index ||
      title === null ||
      instructions === undefined ||
      required === null ||
      knowledgeArticleId === undefined ||
      responseTemplateId === undefined ||
      title.length > templateLimits.stepTitleMax ||
      (instructions !== null && instructions.length > templateLimits.stepInstructionsMax)
    ) {
      return undefined;
    }
    keys.add(stepKey);
    steps.push({
      stepKey,
      position,
      title,
      instructions,
      required,
      knowledgeArticleId,
      responseTemplateId,
    });
  }
  return steps;
}

function parseDeletedAt(value: unknown): string | null | undefined {
  const date = readNullableString(value);
  if (date === undefined) return undefined;
  if (date === null) return null;
  return Number.isFinite(Date.parse(date)) ? date : undefined;
}

function readNonEmptyString(value: unknown): string | null {
  const result = readString(value);
  return result !== null && result.trim() === result && result.length > 0 ? result : null;
}

function readNullableId(value: unknown): string | null | undefined {
  const result = readNullableString(value);
  if (result === null) return null;
  return result !== undefined && result.trim() === result && result.length > 0 ? result : undefined;
}

function assertUniqueIds(values: readonly string[]): void {
  if (new Set(values).size !== values.length) throw invalid();
}

function assertUniqueLiveNames(
  responseTemplates: readonly ConfigResponseTemplateSnapshot[],
  playbooks: readonly ConfigPlaybookSnapshot[],
): void {
  for (const rows of [responseTemplates, playbooks]) {
    const names = new Set<string>();
    for (const row of rows) {
      if (row.deletedAt !== null) continue;
      const key = row.name.toLocaleLowerCase('en');
      if (names.has(key)) throw invalid();
      names.add(key);
    }
  }
}

function sameArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function samePlaybookStep(
  left: { readonly stepKey: string; readonly position: number; readonly title: string; readonly instructions: string | null; readonly required: boolean; readonly knowledgeArticleId: string | null; readonly responseTemplateId: string | null },
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

function invalid(): ConfigVersioningError {
  return new ConfigVersioningError(configVersioningErrorCodes.invalidSnapshot);
}
