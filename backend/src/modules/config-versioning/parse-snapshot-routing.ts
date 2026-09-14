import { configVersioningErrorCodes } from './config-versioning.constants';
import { ConfigVersioningError } from './config-versioning.error';
import type { ConfigSnapshot } from './config-versioning.types';
import {
  isPlainObject,
  readBoolean,
  readString,
} from './read-snapshot-primitives';

export function parseRoutingAndReferences(
  routingValue: unknown,
  referencesValue: unknown,
): Pick<ConfigSnapshot, 'routing' | 'references'> {
  if (!isPlainObject(routingValue) || !isPlainObject(referencesValue)) {
    throw invalid();
  }
  const configuration = routingValue.configuration;
  if (!isPlainObject(configuration)) {
    throw invalid();
  }
  const unroutedQueueEnabled = readBoolean(configuration.unroutedQueueEnabled);
  const unroutedQueueOwnerRole = readString(configuration.unroutedQueueOwnerRole);
  if (unroutedQueueEnabled === null || unroutedQueueOwnerRole === null) {
    throw invalid();
  }
  if (!Array.isArray(routingValue.rules)) {
    throw invalid();
  }
  return {
    routing: {
      configuration: { unroutedQueueEnabled, unroutedQueueOwnerRole },
      rules: routingValue.rules.map(parseRoutingRule),
    },
    references: {
      organizationalUnits: parseUnits(referencesValue.organizationalUnits),
      groups: parseGroups(referencesValue.groups),
    },
  };
}

function parseRoutingRule(value: unknown) {
  if (!isPlainObject(value)) {
    throw invalid();
  }
  const id = readString(value.id);
  const originUnitId = readString(value.originUnitId);
  const serviceId = readString(value.serviceId);
  const groupId = readString(value.groupId);
  if (
    id === null ||
    originUnitId === null ||
    serviceId === null ||
    groupId === null
  ) {
    throw invalid();
  }
  return { id, originUnitId, serviceId, groupId };
}

function parseUnits(value: unknown) {
  if (!Array.isArray(value)) {
    throw invalid();
  }
  return value.map((entry) => {
    if (!isPlainObject(entry)) {
      throw invalid();
    }
    const id = readString(entry.id);
    const ouPath = readString(entry.ouPath);
    if (id === null || ouPath === null) {
      throw invalid();
    }
    if (entry.parentId !== null && typeof entry.parentId !== 'string') {
      throw invalid();
    }
    return { id, parentId: entry.parentId as string | null, ouPath };
  });
}

function parseGroups(value: unknown) {
  if (!Array.isArray(value)) {
    throw invalid();
  }
  return value.map((entry) => {
    if (!isPlainObject(entry)) {
      throw invalid();
    }
    const id = readString(entry.id);
    if (id === null) {
      throw invalid();
    }
    return { id };
  });
}

function invalid(): ConfigVersioningError {
  return new ConfigVersioningError(configVersioningErrorCodes.invalidSnapshot);
}
