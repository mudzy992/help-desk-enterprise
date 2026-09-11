import {
  filterSlaProfiles,
  throwDuplicateSlaKey,
  type ProfileCreateData,
} from './in-memory-sla-store';
import type { SlaProfileRecord, SlaRuleRecord } from './sla.types';

export function createInMemoryProfileDelegate(
  profiles: Map<string, SlaProfileRecord>,
  rules: Map<string, SlaRuleRecord>,
  nextId: (prefix: string) => string,
  now: () => Date,
) {
  return {
    findUnique: async ({ where }: { where: { id: string } }) =>
      profiles.get(where.id) ?? null,
    findMany: async ({
      where,
    }: {
      where?: { calendarId?: string; isActive?: boolean };
    } = {}) =>
      filterSlaProfiles([...profiles.values()], where).sort((left, right) =>
        left.name.localeCompare(right.name),
      ),
    count: async ({
      where,
    }: {
      where: { calendarId?: string; isActive?: boolean };
    }) => filterSlaProfiles([...profiles.values()], where).length,
    create: async ({ data }: { data: ProfileCreateData }) => {
      for (const existing of profiles.values()) {
        if (existing.key === data.key) {
          throwDuplicateSlaKey();
        }
      }
      const created: SlaProfileRecord = {
        id: nextId('pro'),
        ...data,
        createdAt: now(),
        updatedAt: now(),
      };
      profiles.set(created.id, created);
      return created;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Omit<ProfileCreateData, 'key'>;
    }) => {
      const current = profiles.get(where.id);
      if (current === undefined) {
        return null;
      }
      const updated: SlaProfileRecord = { ...current, ...data, updatedAt: now() };
      profiles.set(where.id, updated);
      return updated;
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const current = profiles.get(where.id);
      for (const [ruleId, rule] of rules) {
        if (rule.slaProfileId === where.id) {
          rules.delete(ruleId);
        }
      }
      profiles.delete(where.id);
      return current ?? null;
    },
  };
}
