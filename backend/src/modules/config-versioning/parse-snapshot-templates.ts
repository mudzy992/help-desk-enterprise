import { configVersioningErrorCodes } from './config-versioning.constants';
import { ConfigVersioningError } from './config-versioning.error';
import type {
  ConfigPlaybookSnapshot,
  ConfigResponseTemplateSnapshot,
  ConfigSnapshot,
} from './config-versioning.types';
import { isPlainObject, readBoolean, readNullableString, readString } from './read-snapshot-primitives';

/** Package 1.4 — optional `templates` section of a config snapshot. */
export function parseTemplatesSection(value: unknown): NonNullable<ConfigSnapshot['templates']> {
  if (!isPlainObject(value) || !Array.isArray(value.responseTemplates) || !Array.isArray(value.playbooks)) {
    throw invalid();
  }
  return {
    responseTemplates: value.responseTemplates.map(parseTemplate),
    playbooks: value.playbooks.map(parsePlaybook),
  };
}

function parseTemplate(value: unknown): ConfigResponseTemplateSnapshot {
  if (!isPlainObject(value)) {
    throw invalid();
  }
  const id = readString(value.id);
  const name = readString(value.name);
  const bodyBs = readString(value.bodyBs);
  const bodyEn = readNullableString(value.bodyEn);
  const kind = readString(value.kind);
  const isActive = readBoolean(value.isActive);
  const deletedAt = readNullableString(value.deletedAt);
  const tags = value.tags;
  if (
    id === null ||
    name === null ||
    bodyBs === null ||
    bodyEn === undefined ||
    kind === null ||
    isActive === null ||
    deletedAt === undefined ||
    !Array.isArray(tags) ||
    tags.some((tag) => typeof tag !== 'string')
  ) {
    throw invalid();
  }
  return { id, name, bodyBs, bodyEn, kind, tags: tags as string[], isActive, deletedAt };
}

function parsePlaybook(value: unknown): ConfigPlaybookSnapshot {
  if (!isPlainObject(value)) {
    throw invalid();
  }
  const id = readString(value.id);
  const name = readString(value.name);
  const description = readNullableString(value.description);
  const isActive = readBoolean(value.isActive);
  const deletedAt = readNullableString(value.deletedAt);
  if (id === null || name === null || description === undefined || isActive === null || deletedAt === undefined) {
    throw invalid();
  }
  return { id, name, description, isActive, deletedAt };
}

function invalid(): ConfigVersioningError {
  return new ConfigVersioningError(configVersioningErrorCodes.invalidSnapshot);
}
