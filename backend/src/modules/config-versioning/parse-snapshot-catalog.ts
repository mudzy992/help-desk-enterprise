import { configVersioningErrorCodes } from './config-versioning.constants';
import { ConfigVersioningError } from './config-versioning.error';
import type { ConfigSnapshot } from './config-versioning.types';
import {
  isPlainObject,
  readBoolean,
  readNumber,
  readNullableString,
  readString,
} from './read-snapshot-primitives';
import { toJsonValue } from './serialize-config-snapshot';

export function parseCatalogAndForms(
  catalogValue: unknown,
  formsValue: unknown,
): Pick<ConfigSnapshot, 'catalog' | 'forms'> {
  if (!isPlainObject(catalogValue) || !isPlainObject(formsValue)) {
    throw invalid();
  }
  if (!Array.isArray(catalogValue.services) || !Array.isArray(formsValue.versions)) {
    throw invalid();
  }
  return {
    catalog: { services: catalogValue.services.map(parseService) },
    forms: { versions: formsValue.versions.map(parseForm) },
  };
}

function parseService(value: unknown) {
  if (!isPlainObject(value)) {
    throw invalid();
  }
  const id = readString(value.id);
  const name = readString(value.name);
  const slug = readString(value.slug);
  const categoryId = readString(value.categoryId);
  const lifecycle = readString(value.lifecycle);
  const availability = readString(value.availability);
  const classification = readString(value.classification);
  const autoAssignStrategy = readString(value.autoAssignStrategy);
  const requiresApproval = readBoolean(value.requiresApproval);
  const isConfidentialDefault = readBoolean(value.isConfidentialDefault);
  const slaProfileId = readNullableString(value.slaProfileId);
  const policyPackId = readNullableString(value.policyPackId);
  if (
    id === null ||
    name === null ||
    slug === null ||
    categoryId === null ||
    lifecycle === null ||
    availability === null ||
    classification === null ||
    autoAssignStrategy === null ||
    requiresApproval === null ||
    isConfidentialDefault === null ||
    slaProfileId === undefined ||
    policyPackId === undefined
  ) {
    throw invalid();
  }
  return {
    id,
    name,
    slug,
    categoryId,
    lifecycle,
    availability,
    classification,
    requiresApproval,
    isConfidentialDefault,
    autoAssignStrategy,
    slaProfileId,
    policyPackId,
  };
}

function parseForm(value: unknown) {
  if (!isPlainObject(value)) {
    throw invalid();
  }
  const id = readString(value.id);
  const serviceId = readString(value.serviceId);
  const version = readNumber(value.version);
  const status = readString(value.status);
  if (id === null || serviceId === null || version === null || status === null) {
    throw invalid();
  }
  return {
    id,
    serviceId,
    version,
    status,
    schema: toJsonValue(value.schema ?? {}),
  };
}

function invalid(): ConfigVersioningError {
  return new ConfigVersioningError(configVersioningErrorCodes.invalidSnapshot);
}
