import type { TicketPriority } from '../../../generated/prisma/enums';
import type { JsonValue } from '../../change-log/change-log.types';
import type { SettingValue } from '../../settings/settings.types';
import { configPackageFormat, configPackageFormatVersion } from './config-package.constants';
import type { ConfigPackage, PortableConfig } from './config-package.types';

export class ConfigPackageFormatError extends Error {
  constructor(readonly path: string) {
    super(`Invalid config package at ${path}`);
  }
}

const priorities = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

type Obj = Record<string, unknown>;
const isObject = (value: unknown): value is Obj =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function obj(value: unknown, path: string): Obj {
  if (!isObject(value)) throw new ConfigPackageFormatError(path);
  return value;
}
function arr(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new ConfigPackageFormatError(path);
  return value;
}
function str(value: unknown, path: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && value.trim() === '')) throw new ConfigPackageFormatError(path);
  return value;
}
function nstr(value: unknown, path: string): string | null {
  return value === null ? null : str(value, path, true);
}
function bool(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new ConfigPackageFormatError(path);
  return value;
}
function int(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new ConfigPackageFormatError(path);
  return value;
}
function priority(value: unknown, path: string): TicketPriority {
  if (typeof value !== 'string' || !priorities.has(value)) throw new ConfigPackageFormatError(path);
  return value as TicketPriority;
}
function list<T>(value: unknown, path: string, item: (entry: Obj, path: string) => T): T[] {
  return arr(value, path).map((entry, position) => item(obj(entry, `${path}[${position}]`), `${path}[${position}]`));
}

function parseContent(value: unknown): PortableConfig {
  const content = obj(value, 'content');
  const settingsRaw = obj(content.settings, 'content.settings');
  const settings: Record<string, SettingValue> = {};
  for (const [key, setting] of Object.entries(settingsRaw)) {
    settings[key] = setting as SettingValue;
  }
  const routing = obj(content.routing, 'content.routing');
  const sla = obj(content.sla, 'content.sla');
  const catalog = obj(content.catalog, 'content.catalog');
  const forms = obj(content.forms, 'content.forms');
  const templates = content.templates === null ? null : obj(content.templates, 'content.templates');
  return {
    scopes: arr(content.scopes, 'content.scopes').map((scope, i) => str(scope, `content.scopes[${i}]`)),
    settings,
    routing: {
      rules: list(routing.rules, 'content.routing.rules', (e, p) => ({
        originUnit: str(e.originUnit, `${p}.originUnit`),
        service: str(e.service, `${p}.service`),
        group: str(e.group, `${p}.group`),
      })),
    },
    sla: {
      calendars: list(sla.calendars, 'content.sla.calendars', (e, p) => ({
        key: str(e.key, `${p}.key`),
        name: str(e.name, `${p}.name`),
        timezone: str(e.timezone, `${p}.timezone`),
        weeklyHours: (e.weeklyHours ?? null) as JsonValue,
        isActive: bool(e.isActive, `${p}.isActive`),
        holidays: list(e.holidays, `${p}.holidays`, (h, hp) => ({
          date: str(h.date, `${hp}.date`),
          name: str(h.name, `${hp}.name`, true),
        })),
      })),
      profiles: list(sla.profiles, 'content.sla.profiles', (e, p) => ({
        key: str(e.key, `${p}.key`),
        name: str(e.name, `${p}.name`),
        description: nstr(e.description, `${p}.description`),
        calendar: str(e.calendar, `${p}.calendar`),
        isActive: bool(e.isActive, `${p}.isActive`),
      })),
      rules: list(sla.rules, 'content.sla.rules', (e, p) => ({
        profile: str(e.profile, `${p}.profile`),
        priority: priority(e.priority, `${p}.priority`),
        responseMinutes: int(e.responseMinutes, `${p}.responseMinutes`),
        resolutionMinutes: int(e.resolutionMinutes, `${p}.resolutionMinutes`),
        evaluationOrder: int(e.evaluationOrder, `${p}.evaluationOrder`),
        organizationalUnit: nstr(e.organizationalUnit, `${p}.organizationalUnit`),
        service: nstr(e.service, `${p}.service`),
      })),
      escalations: list(sla.escalations, 'content.sla.escalations', (e, p) => ({
        profile: str(e.profile, `${p}.profile`),
        triggerOffsetMinutes: int(e.triggerOffsetMinutes, `${p}.triggerOffsetMinutes`),
        targetGroup: nstr(e.targetGroup, `${p}.targetGroup`),
      })),
      priorityMatrix: list(sla.priorityMatrix, 'content.sla.priorityMatrix', (e, p) => ({
        impact: str(e.impact, `${p}.impact`),
        urgency: str(e.urgency, `${p}.urgency`),
        priority: priority(e.priority, `${p}.priority`),
      })),
    },
    catalog: {
      services: list(catalog.services, 'content.catalog.services', (e, p) => ({
        slug: str(e.slug, `${p}.slug`),
        name: str(e.name, `${p}.name`),
        category: str(e.category, `${p}.category`),
        lifecycle: str(e.lifecycle, `${p}.lifecycle`),
        availability: str(e.availability, `${p}.availability`),
        classification: str(e.classification, `${p}.classification`),
        requiresApproval: bool(e.requiresApproval, `${p}.requiresApproval`),
        isConfidentialDefault: bool(e.isConfidentialDefault, `${p}.isConfidentialDefault`),
        autoAssignStrategy: str(e.autoAssignStrategy, `${p}.autoAssignStrategy`),
        slaProfile: nstr(e.slaProfile, `${p}.slaProfile`),
        policyPack: nstr(e.policyPack, `${p}.policyPack`),
      })),
    },
    forms: {
      versions: list(forms.versions, 'content.forms.versions', (e, p) => ({
        service: str(e.service, `${p}.service`),
        version: int(e.version, `${p}.version`),
        schema: (e.schema ?? null) as JsonValue,
        status: str(e.status, `${p}.status`),
      })),
    },
    templates:
      templates === null
        ? null
        : {
            responseTemplates: list(templates.responseTemplates, 'content.templates.responseTemplates', (e, p) => ({
              name: str(e.name, `${p}.name`),
              bodyBs: str(e.bodyBs, `${p}.bodyBs`, true),
              bodyEn: nstr(e.bodyEn, `${p}.bodyEn`),
              kind: str(e.kind, `${p}.kind`),
              tags: arr(e.tags, `${p}.tags`).map((tag, i) => str(tag, `${p}.tags[${i}]`)),
              isActive: bool(e.isActive, `${p}.isActive`),
              deletedAt: nstr(e.deletedAt, `${p}.deletedAt`),
            })),
            playbooks: list(templates.playbooks, 'content.templates.playbooks', (e, p) => ({
              name: str(e.name, `${p}.name`),
              description: nstr(e.description, `${p}.description`),
              isActive: bool(e.isActive, `${p}.isActive`),
              deletedAt: nstr(e.deletedAt, `${p}.deletedAt`),
            })),
          },
  };
}

/** Strict structural parse of an uploaded package; integrity is checked separately. */
export function parseConfigPackage(value: unknown): ConfigPackage {
  const root = obj(value, '$');
  if (root.format !== configPackageFormat) throw new ConfigPackageFormatError('format');
  if (root.formatVersion !== configPackageFormatVersion) throw new ConfigPackageFormatError('formatVersion');
  const signature = root.signature === null || root.signature === undefined ? null : str(root.signature, 'signature');
  if (signature !== null && !/^[0-9a-f]{64}$/.test(signature)) throw new ConfigPackageFormatError('signature');
  const checksum = str(root.checksum, 'checksum');
  if (!/^[0-9a-f]{64}$/.test(checksum)) throw new ConfigPackageFormatError('checksum');
  return {
    format: configPackageFormat,
    formatVersion: configPackageFormatVersion,
    appVersion: str(root.appVersion, 'appVersion', true),
    sourceEnvironment: str(root.sourceEnvironment, 'sourceEnvironment', true),
    sourceVersion: int(root.sourceVersion, 'sourceVersion'),
    exportedAt: str(root.exportedAt, 'exportedAt'),
    includesEnvironmentBound: bool(root.includesEnvironmentBound, 'includesEnvironmentBound'),
    content: parseContent(root.content),
    checksum,
    signature,
  };
}
