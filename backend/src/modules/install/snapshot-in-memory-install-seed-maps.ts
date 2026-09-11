import type { InMemoryOrganizationalUnit } from '../organizational-units/create-in-memory-organizational-unit-prisma';
import {
  emptyServiceDependents,
  type ServiceDependents,
} from '../service-catalog/in-memory-service-catalog-store';
import type {
  ServiceCategoryRecord,
  ServiceRecord,
} from '../service-catalog/service-catalog.types';
import type { RoutingRuleRecord } from '../routing/routing.types';
import type { InMemoryInstallSeedGroup } from './create-in-memory-install-seed-group-delegate';

export type InMemoryInstallSeedChangeLog = {
  entityType: string;
  entityId: string;
  reason: string;
  diff: object;
  actorUserId: string | null;
};

export type InMemoryInstallSeedMaps = {
  units: Map<string, InMemoryOrganizationalUnit>;
  groups: Map<string, InMemoryInstallSeedGroup>;
  categories: Map<string, ServiceCategoryRecord>;
  services: Map<string, ServiceRecord>;
  dependents: Map<string, ServiceDependents>;
  rules: Map<string, RoutingRuleRecord>;
  changeLogs: InMemoryInstallSeedChangeLog[];
};

export function snapshotInstallSeedMaps(input: InMemoryInstallSeedMaps) {
  return {
    units: new Map(input.units),
    groups: new Map(
      [...input.groups.entries()].map(([id, group]) => [id, { ...group }]),
    ),
    categories: new Map(input.categories),
    services: new Map(input.services),
    dependents: new Map(
      [...input.dependents.entries()].map(([id, item]) => [
        id,
        { ...emptyServiceDependents(), ...item },
      ]),
    ),
    rules: new Map(input.rules),
    changeLogs: [...input.changeLogs],
  };
}

export function restoreInstallSeedMaps(
  snapshot: ReturnType<typeof snapshotInstallSeedMaps>,
  target: InMemoryInstallSeedMaps,
): void {
  replaceMap(target.units, snapshot.units);
  replaceMap(target.groups, snapshot.groups);
  replaceMap(target.categories, snapshot.categories);
  replaceMap(target.services, snapshot.services);
  replaceMap(target.dependents, snapshot.dependents);
  replaceMap(target.rules, snapshot.rules);
  target.changeLogs.splice(0, target.changeLogs.length, ...snapshot.changeLogs);
}

function replaceMap<K, V>(target: Map<K, V>, source: Map<K, V>): void {
  target.clear();
  for (const [key, value] of source) {
    target.set(key, value);
  }
}
