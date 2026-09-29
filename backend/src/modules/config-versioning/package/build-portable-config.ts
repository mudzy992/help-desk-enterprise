import type { SettingValue } from '../../settings/settings.types';
import type { ConfigSnapshot } from '../config-versioning.types';
import { isEnvironmentBoundSetting } from './config-package.constants';
import type { ConfigReferenceIndex, PortableConfig } from './config-package.types';

export class PortableConfigBuildError extends Error {
  constructor(readonly missing: readonly string[]) {
    super(`Source references without a natural key: ${missing.join(', ')}`);
  }
}

function keyLookup(entries: readonly { readonly id: string; readonly key: string }[]) {
  return new Map(entries.map((entry) => [entry.id, entry.key]));
}

/**
 * Snapshot (local ids) → portable content (natural keys). Pure. Secrets are
 * dropped by `isSecret`; environment-bound settings unless explicitly included.
 * A dangling id on the source side is a data error and aborts the export.
 */
export function buildPortableConfig(
  snapshot: ConfigSnapshot,
  index: ConfigReferenceIndex,
  options: {
    readonly includeEnvironmentBound: boolean;
    readonly isSecret: (key: string) => boolean;
  },
): PortableConfig {
  const missing = new Set<string>();
  const lookup = (map: Map<string, string>, kind: string) => (id: string): string => {
    const key = map.get(id);
    if (key === undefined) {
      missing.add(`${kind}:${id}`);
      return '';
    }
    return key;
  };
  const optional = (resolve: (id: string) => string) => (id: string | null) => (id === null ? null : resolve(id));
  const ou = lookup(keyLookup(index.organizationalUnits), 'organizationalUnit');
  const group = lookup(keyLookup(index.groups), 'group');
  const service = lookup(keyLookup(index.services), 'service');
  const category = lookup(keyLookup(index.serviceCategories), 'serviceCategory');
  const policyPack = lookup(keyLookup(index.policyPacks), 'policyPack');
  const calendarKeys = new Map(snapshot.sla.calendars.map((calendar) => [calendar.id, calendar.key]));
  const profileKeys = new Map(snapshot.sla.profiles.map((profile) => [profile.id, profile.key]));
  const calendar = lookup(calendarKeys, 'calendar');
  const profile = lookup(profileKeys, 'slaProfile');

  const settings: Record<string, SettingValue> = {};
  for (const [key, value] of Object.entries(snapshot.settings)) {
    if (options.isSecret(key)) continue;
    if (!options.includeEnvironmentBound && isEnvironmentBoundSetting(key)) continue;
    settings[key] = value;
  }

  const content: PortableConfig = {
    scopes: [...snapshot.scopes],
    settings,
    routing: {
      rules: snapshot.routing.rules.map((rule) => ({
        originUnit: ou(rule.originUnitId),
        service: service(rule.serviceId),
        group: group(rule.groupId),
      })),
    },
    sla: {
      calendars: snapshot.sla.calendars.map(({ id: _id, ...rest }) => rest),
      profiles: snapshot.sla.profiles.map((item) => ({
        key: item.key,
        name: item.name,
        description: item.description,
        calendar: calendar(item.calendarId),
        isActive: item.isActive,
      })),
      rules: snapshot.sla.rules.map((rule) => ({
        profile: profile(rule.slaProfileId),
        priority: rule.priority,
        responseMinutes: rule.responseMinutes,
        resolutionMinutes: rule.resolutionMinutes,
        evaluationOrder: rule.evaluationOrder,
        organizationalUnit: optional(ou)(rule.organizationalUnitId),
        service: optional(service)(rule.serviceId),
      })),
      escalations: snapshot.sla.escalations.map((rule) => ({
        profile: profile(rule.slaProfileId),
        triggerOffsetMinutes: rule.triggerOffsetMinutes,
        targetGroup: optional(group)(rule.targetGroupId),
      })),
      priorityMatrix: snapshot.sla.priorityMatrix.map(({ impact, urgency, priority }) => ({ impact, urgency, priority })),
    },
    catalog: {
      services: snapshot.catalog.services.map((item) => ({
        slug: item.slug,
        name: item.name,
        category: category(item.categoryId),
        lifecycle: item.lifecycle,
        availability: item.availability,
        classification: item.classification,
        requiresApproval: item.requiresApproval,
        isConfidentialDefault: item.isConfidentialDefault,
        autoAssignStrategy: item.autoAssignStrategy,
        slaProfile: optional(profile)(item.slaProfileId),
        policyPack: optional(policyPack)(item.policyPackId),
      })),
    },
    forms: {
      versions: snapshot.forms.versions.map((form) => ({
        service: service(form.serviceId),
        version: form.version,
        schema: form.schema,
        status: form.status,
      })),
    },
    templates:
      snapshot.templates === undefined
        ? null
        : {
            responseTemplates: snapshot.templates.responseTemplates.map(({ id: _id, ...rest }) => ({
              ...rest,
              tags: [...rest.tags],
            })),
            playbooks: snapshot.templates.playbooks.map(({ id: _id, ...rest }) => rest),
          },
  };
  if (missing.size > 0) {
    throw new PortableConfigBuildError([...missing].sort());
  }
  return content;
}
