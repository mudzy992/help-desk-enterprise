import type { ServiceLifecycle } from '../../generated/prisma/enums';
import { serviceLifecycleStates } from './service-catalog.constants';
import { ServiceCatalogError } from './service-catalog.error';
import type { ServiceLifecycleConfiguration } from './service-catalog.types';

export function parseServiceLifecycleConfiguration(input: {
  readonly enabled: unknown;
  readonly allowedStatesCsv: unknown;
  readonly defaultStateOnCreate: unknown;
}): ServiceLifecycleConfiguration {
  if (typeof input.enabled !== 'boolean') {
    throw new ServiceCatalogError('LIFECYCLE_UNAVAILABLE');
  }
  const allowedStates = parseAllowedStates(input.allowedStatesCsv);
  const defaultStateOnCreate = parseLifecycleState(input.defaultStateOnCreate);
  if (!allowedStates.includes(defaultStateOnCreate)) {
    throw new ServiceCatalogError('LIFECYCLE_UNAVAILABLE');
  }
  return {
    enabled: input.enabled,
    allowedStates,
    defaultStateOnCreate,
  };
}

function parseLifecycleState(value: unknown): ServiceLifecycle {
  if (typeof value !== 'string' || !isServiceLifecycle(value)) {
    throw new ServiceCatalogError('INVALID_LIFECYCLE_STATE');
  }
  return value;
}

function parseAllowedStates(value: unknown): readonly ServiceLifecycle[] {
  if (typeof value !== 'string') {
    throw new ServiceCatalogError('LIFECYCLE_UNAVAILABLE');
  }
  const states: ServiceLifecycle[] = [];
  const seen = new Set<string>();
  for (const part of value.split(',')) {
    const token = part.trim();
    if (token.length === 0 || seen.has(token)) {
      continue;
    }
    if (!isServiceLifecycle(token)) {
      throw new ServiceCatalogError('LIFECYCLE_UNAVAILABLE');
    }
    seen.add(token);
    states.push(token);
  }
  if (states.length === 0) {
    throw new ServiceCatalogError('LIFECYCLE_UNAVAILABLE');
  }
  return states;
}

function isServiceLifecycle(value: string): value is ServiceLifecycle {
  return (serviceLifecycleStates as readonly string[]).includes(value);
}
