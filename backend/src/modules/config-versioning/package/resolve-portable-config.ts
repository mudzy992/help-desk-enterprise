import type { SettingValue } from '../../settings/settings.types';
import { routingConfigurationFromSettings } from '../serialize-config-snapshot';
import type {
  ConfigRoutingRuleSnapshot,
  ConfigSlaEscalationSnapshot,
  ConfigSlaRuleSnapshot,
  ConfigSnapshot,
} from '../config-versioning.types';
import {
  isEnvironmentBoundSetting,
  mappableReferenceKinds,
  type ConfigPackageReferenceKind,
} from './config-package.constants';
import type {
  ConfigPackageMappings,
  ConfigPackageResolutionItem,
  ConfigReferenceIndex,
  PortableConfig,
} from './config-package.types';

export type PortableConfigResolution = {
  readonly items: readonly ConfigPackageResolutionItem[];
  readonly settings: {
    readonly applied: readonly string[];
    readonly skippedEnvironmentBound: readonly string[];
    readonly skippedUnknown: readonly string[];
  };
  readonly created: { readonly calendars: readonly string[]; readonly slaProfiles: readonly string[] };
  readonly skipped: {
    readonly services: readonly string[];
    readonly formVersions: readonly string[];
    readonly responseTemplates: readonly string[];
    readonly playbooks: readonly string[];
  };
  readonly blockingCount: number;
  /** Null while anything blocks. */
  readonly snapshot: ConfigSnapshot | null;
};

type Entry = { readonly id: string; readonly key: string };

class ReferenceResolver {
  private readonly items = new Map<string, ConfigPackageResolutionItem & { usedBy: string[] }>();

  constructor(
    private readonly index: ConfigReferenceIndex,
    private readonly mappings: ConfigPackageMappings,
  ) {}

  private entries(kind: ConfigPackageReferenceKind): readonly Entry[] {
    switch (kind) {
      case 'organizationalUnit':
        return this.index.organizationalUnits;
      case 'group':
        return this.index.groups;
      case 'service':
        return this.index.services;
      case 'serviceCategory':
        return this.index.serviceCategories;
      case 'policyPack':
        return this.index.policyPacks;
      case 'formVersion':
        return this.index.formVersions;
      case 'responseTemplate':
        return this.index.responseTemplates;
      case 'playbook':
        return this.index.playbooks;
      case 'slaProfile':
        return this.index.slaProfiles;
      case 'calendar':
        return this.index.calendars;
    }
  }

  /** Returns the local id or null; records the outcome for the report. */
  resolve(kind: ConfigPackageReferenceKind, key: string, usedBy: string, blocking: boolean): string | null {
    const id = `${kind}\u0000${key}`;
    const existing = this.items.get(id);
    if (existing !== undefined) {
      if (!existing.usedBy.includes(usedBy)) existing.usedBy.push(usedBy);
      if (blocking && !existing.blocking && existing.localId === null) {
        this.items.set(id, { ...existing, blocking: true });
      }
      return existing.localId;
    }
    const entries = this.entries(kind);
    const matches = entries.filter((entry) => entry.key === key);
    let item: ConfigPackageResolutionItem & { usedBy: string[] };
    const mapped = mappableReferenceKinds.includes(kind) ? this.mappings[kind]?.[key] : undefined;
    if (mapped !== undefined && entries.some((entry) => entry.id === mapped)) {
      item = { kind, key, status: 'mapped', localId: mapped, blocking: false, usedBy: [usedBy] };
    } else if (matches.length === 1) {
      item = { kind, key, status: 'resolved', localId: matches[0]!.id, blocking: false, usedBy: [usedBy] };
    } else {
      item = {
        kind,
        key,
        status: matches.length > 1 ? 'ambiguous' : 'missing',
        localId: null,
        blocking,
        usedBy: [usedBy],
      };
    }
    this.items.set(id, item);
    return item.localId;
  }

  /** A key that neither the package nor the target defines (SLA profile/calendar). */
  missing(kind: ConfigPackageReferenceKind, key: string, usedBy: string): void {
    const id = `${kind}\u0000${key}`;
    const existing = this.items.get(id);
    if (existing !== undefined) {
      if (!existing.usedBy.includes(usedBy)) existing.usedBy.push(usedBy);
      return;
    }
    this.items.set(id, { kind, key, status: 'missing', localId: null, blocking: true, usedBy: [usedBy] });
  }

  report(): ConfigPackageResolutionItem[] {
    return [...this.items.values()]
      .map((item) => ({ ...item, usedBy: [...item.usedBy].sort() }))
      .sort((left, right) =>
        left.kind === right.kind ? left.key.localeCompare(right.key) : left.kind.localeCompare(right.kind),
      );
  }
}

/**
 * Portable content (natural keys) + the target's live snapshot → a DRAFT
 * snapshot in target ids. Pure. Nothing organisational is ever created: a
 * missing OU/group/service/category/policy pack referenced by routing, SLA or
 * the catalog blocks until it is mapped; rows that only *describe* a missing
 * entity (a service's own fields, its form versions, a template) are skipped.
 * SLA calendars and profiles are configuration and are created when absent.
 * Target rows that match semantically keep their id, so the diff stays small.
 */
export function resolvePortableConfig(input: {
  readonly content: PortableConfig;
  readonly target: ConfigSnapshot;
  readonly index: ConfigReferenceIndex;
  readonly mappings: ConfigPackageMappings;
  readonly applyEnvironmentBound: boolean;
  readonly isKnownSetting: (key: string) => boolean;
  readonly isSecret: (key: string) => boolean;
  readonly newId: () => string;
  readonly capturedAt: string;
}): PortableConfigResolution {
  const { content, target, index } = input;
  const resolver = new ReferenceResolver(index, input.mappings);

  // Settings: overlay onto the target's current values.
  const settings: Record<string, SettingValue> = { ...target.settings };
  const applied: string[] = [];
  const skippedEnvironmentBound: string[] = [];
  const skippedUnknown: string[] = [];
  for (const [key, value] of Object.entries(content.settings)) {
    if (!input.isKnownSetting(key) || input.isSecret(key)) {
      skippedUnknown.push(key);
    } else if (isEnvironmentBoundSetting(key) && !input.applyEnvironmentBound) {
      skippedEnvironmentBound.push(key);
    } else {
      settings[key] = value;
      applied.push(key);
    }
  }

  // SLA calendars and profiles (created when absent).
  const createdCalendars: string[] = [];
  const createdProfiles: string[] = [];
  const calendarIds = new Map(index.calendars.map((entry) => [entry.key, entry.id]));
  const calendars = [...target.sla.calendars];
  for (const calendar of content.sla.calendars) {
    const existingId = calendarIds.get(calendar.key);
    const id = existingId ?? input.newId();
    if (existingId === undefined) {
      createdCalendars.push(calendar.key);
      calendarIds.set(calendar.key, id);
    }
    const next = { id, ...calendar, holidays: [...calendar.holidays] };
    const position = calendars.findIndex((item) => item.id === id);
    if (position >= 0) calendars[position] = next;
    else calendars.push(next);
  }
  const profileIds = new Map(index.slaProfiles.map((entry) => [entry.key, entry.id]));
  const profiles = [...target.sla.profiles];
  content.sla.profiles.forEach((profile, position) => {
    const calendarId = calendarIds.get(profile.calendar);
    if (calendarId === undefined) {
      resolver.missing('calendar', profile.calendar, `sla.profiles[${position}]`);
      return;
    }
    const existingId = profileIds.get(profile.key);
    const id = existingId ?? input.newId();
    if (existingId === undefined) {
      createdProfiles.push(profile.key);
      profileIds.set(profile.key, id);
    }
    const next = {
      id,
      key: profile.key,
      name: profile.name,
      description: profile.description,
      calendarId,
      isActive: profile.isActive,
    };
    const existingPosition = profiles.findIndex((item) => item.id === id);
    if (existingPosition >= 0) profiles[existingPosition] = next;
    else profiles.push(next);
  });
  const profileId = (key: string, usedBy: string): string | null => {
    const id = profileIds.get(key);
    if (id === undefined) resolver.missing('slaProfile', key, usedBy);
    return id ?? null;
  };

  const routingRules: ConfigRoutingRuleSnapshot[] = [];
  content.routing.rules.forEach((rule, position) => {
    const path = `routing.rules[${position}]`;
    const originUnitId = resolver.resolve('organizationalUnit', rule.originUnit, path, true);
    const serviceId = resolver.resolve('service', rule.service, path, true);
    const groupId = resolver.resolve('group', rule.group, path, true);
    if (originUnitId === null || serviceId === null || groupId === null) return;
    const existing = target.routing.rules.find(
      (item) => item.originUnitId === originUnitId && item.serviceId === serviceId,
    );
    routingRules.push({ id: existing?.id ?? input.newId(), originUnitId, serviceId, groupId });
  });

  const slaRules: ConfigSlaRuleSnapshot[] = [];
  content.sla.rules.forEach((rule, position) => {
    const path = `sla.rules[${position}]`;
    const slaProfileId = profileId(rule.profile, path);
    const organizationalUnitId =
      rule.organizationalUnit === null
        ? null
        : resolver.resolve('organizationalUnit', rule.organizationalUnit, path, true);
    const serviceId = rule.service === null ? null : resolver.resolve('service', rule.service, path, true);
    if (
      slaProfileId === null ||
      (rule.organizationalUnit !== null && organizationalUnitId === null) ||
      (rule.service !== null && serviceId === null)
    ) {
      return;
    }
    const existing = target.sla.rules.find(
      (item) =>
        item.slaProfileId === slaProfileId &&
        item.priority === rule.priority &&
        item.organizationalUnitId === organizationalUnitId &&
        item.serviceId === serviceId &&
        !slaRules.some((taken) => taken.id === item.id),
    );
    slaRules.push({
      id: existing?.id ?? input.newId(),
      slaProfileId,
      priority: rule.priority,
      responseMinutes: rule.responseMinutes,
      resolutionMinutes: rule.resolutionMinutes,
      evaluationOrder: rule.evaluationOrder,
      organizationalUnitId,
      serviceId,
    });
  });

  const escalations: ConfigSlaEscalationSnapshot[] = [];
  content.sla.escalations.forEach((rule, position) => {
    const path = `sla.escalations[${position}]`;
    const slaProfileId = profileId(rule.profile, path);
    const targetGroupId =
      rule.targetGroup === null ? null : resolver.resolve('group', rule.targetGroup, path, true);
    if (slaProfileId === null || (rule.targetGroup !== null && targetGroupId === null)) return;
    const existing = target.sla.escalations.find(
      (item) =>
        item.slaProfileId === slaProfileId &&
        item.triggerOffsetMinutes === rule.triggerOffsetMinutes &&
        item.targetGroupId === targetGroupId &&
        !escalations.some((taken) => taken.id === item.id),
    );
    escalations.push({
      id: existing?.id ?? input.newId(),
      slaProfileId,
      triggerOffsetMinutes: rule.triggerOffsetMinutes,
      targetGroupId,
      ...(rule.targetOnCall === true && targetGroupId !== null ? { targetOnCall: true } : {}),
    });
  });

  const priorityMatrix = content.sla.priorityMatrix.map((rule) => ({
    id:
      target.sla.priorityMatrix.find((item) => item.impact === rule.impact && item.urgency === rule.urgency)?.id ??
      input.newId(),
    ...rule,
  }));

  // Catalog: overlay only services that exist on the target.
  const skippedServices: string[] = [];
  const services = target.catalog.services.map((service) => ({ ...service }));
  content.catalog.services.forEach((item, position) => {
    const path = `catalog.services[${position}]`;
    const localId = index.services.find((entry) => entry.key === item.slug)?.id
      ?? input.mappings.service?.[item.slug];
    const current = services.find((service) => service.id === localId);
    if (current === undefined) {
      skippedServices.push(item.slug);
      return;
    }
    const categoryId = resolver.resolve('serviceCategory', item.category, path, true);
    const policyPackId =
      item.policyPack === null ? null : resolver.resolve('policyPack', item.policyPack, path, true);
    const slaProfileId = item.slaProfile === null ? null : profileId(item.slaProfile, path);
    if (
      categoryId === null ||
      (item.policyPack !== null && policyPackId === null) ||
      (item.slaProfile !== null && slaProfileId === null)
    ) {
      return;
    }
    Object.assign(current, {
      name: item.name,
      categoryId,
      lifecycle: item.lifecycle,
      availability: item.availability,
      classification: item.classification,
      requiresApproval: item.requiresApproval,
      isConfidentialDefault: item.isConfidentialDefault,
      autoAssignStrategy: item.autoAssignStrategy,
      slaProfileId,
      policyPackId,
    });
  });

  const skippedForms: string[] = [];
  const forms = target.forms.versions.map((form) => ({ ...form }));
  content.forms.versions.forEach((form) => {
    const key = `${form.service}@${form.version}`;
    const localId = index.formVersions.find((entry) => entry.key === key)?.id;
    const current = forms.find((item) => item.id === localId);
    if (current === undefined) {
      skippedForms.push(key);
      return;
    }
    current.schema = form.schema;
    current.status = form.status;
  });

  const skippedTemplates: string[] = [];
  const skippedPlaybooks: string[] = [];
  let templates = target.templates;
  if (content.templates !== null && target.templates !== undefined) {
    const responseTemplates = target.templates.responseTemplates.map((item) => ({ ...item }));
    content.templates.responseTemplates.forEach((template, position) => {
      const localId = resolver.resolve('responseTemplate', template.name, `templates.responseTemplates[${position}]`, false);
      const current = responseTemplates.find((item) => item.id === localId);
      if (current === undefined) {
        skippedTemplates.push(template.name);
        return;
      }
      Object.assign(current, { ...template, tags: [...template.tags] });
    });
    const playbooks = target.templates.playbooks.map((item) => ({ ...item }));
    content.templates.playbooks.forEach((playbook, position) => {
      const localId = resolver.resolve('playbook', playbook.name, `templates.playbooks[${position}]`, false);
      const current = playbooks.find((item) => item.id === localId);
      if (current === undefined) {
        skippedPlaybooks.push(playbook.name);
        return;
      }
      Object.assign(current, playbook);
    });
    templates = { responseTemplates, playbooks };
  }

  const items = resolver.report();
  const blockingCount = items.filter((item) => item.blocking).length;
  const snapshot: ConfigSnapshot | null =
    blockingCount > 0
      ? null
      : {
          schemaVersion: 1,
          capturedAt: input.capturedAt,
          scopes: target.scopes,
          rollbackOfVersion: null,
          settings,
          routing: { rules: routingRules, configuration: routingConfigurationFromSettings(settings) },
          sla: { calendars, profiles, rules: slaRules, escalations, priorityMatrix },
          catalog: { services },
          forms: { versions: forms },
          references: target.references,
          ...(templates === undefined ? {} : { templates }),
        };
  return {
    items,
    settings: { applied: applied.sort(), skippedEnvironmentBound: skippedEnvironmentBound.sort(), skippedUnknown: skippedUnknown.sort() },
    created: { calendars: createdCalendars, slaProfiles: createdProfiles },
    skipped: {
      services: skippedServices,
      formVersions: skippedForms,
      responseTemplates: skippedTemplates,
      playbooks: skippedPlaybooks,
    },
    blockingCount,
    snapshot,
  };
}
