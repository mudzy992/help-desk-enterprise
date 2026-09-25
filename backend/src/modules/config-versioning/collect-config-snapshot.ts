import { PrismaService } from '../../common/prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import {
  mergeSettingRecords,
  routingConfigurationFromSettings,
  toFormVersionSnapshot,
  toIsoDate,
  toJsonValue,
  toServiceSnapshot,
} from './serialize-config-snapshot';
import type { ConfigSnapshot } from './config-versioning.types';

export async function collectConfigSnapshot(
  prisma: PrismaService,
  settingsService: SettingsService,
  scopes: readonly string[],
  capturedAt = new Date().toISOString(),
): Promise<ConfigSnapshot> {
  const [publicSettings, privateSettings] = await Promise.all([
    settingsService.getPublicSettings(),
    settingsService.getPrivateSettings(),
  ]);
  const settings = mergeSettingRecords(publicSettings, privateSettings);
  const [rules, calendars, profiles, slaRules, escalations, matrix, services, forms, units, groups] =
    await Promise.all([
      prisma.routingRule.findMany({
        orderBy: [{ serviceId: 'asc' }, { originUnitId: 'asc' }],
      }),
      prisma.businessHoursCalendar.findMany({
        include: { holidays: { orderBy: { date: 'asc' } } },
        orderBy: { name: 'asc' },
      }),
      prisma.slaProfile.findMany({ orderBy: { name: 'asc' } }),
      prisma.slaRule.findMany({ orderBy: { evaluationOrder: 'asc' } }),
      prisma.slaEscalationRule.findMany(),
      prisma.priorityMatrixRule.findMany(),
      prisma.service.findMany({ orderBy: { name: 'asc' } }),
      prisma.formVersion.findMany({
        orderBy: [{ serviceId: 'asc' }, { version: 'asc' }],
      }),
      prisma.organizationalUnit.findMany({
        select: { id: true, parentId: true, ouPath: true },
        orderBy: { ouPath: 'asc' },
      }),
      prisma.group.findMany({ select: { id: true }, orderBy: { id: 'asc' } }),
    ]);
  const [responseTemplates, playbooks] = await Promise.all([
    prisma.responseTemplate.findMany({
      where: { ownerUserId: null },
      select: {
        id: true,
        name: true,
        bodyBs: true,
        bodyEn: true,
        kind: true,
        tags: true,
        isActive: true,
        deletedAt: true,
      },
      orderBy: { id: 'asc' },
    }),
    prisma.playbook.findMany({
      select: { id: true, name: true, description: true, isActive: true, deletedAt: true },
      orderBy: { id: 'asc' },
    }),
  ]);
  return {
    schemaVersion: 1,
    capturedAt,
    scopes,
    rollbackOfVersion: null,
    settings,
    routing: {
      rules: rules.map((rule) => ({
        id: rule.id,
        originUnitId: rule.originUnitId,
        serviceId: rule.serviceId,
        groupId: rule.groupId,
      })),
      configuration: routingConfigurationFromSettings(settings),
    },
    sla: {
      calendars: calendars.map((calendar) => ({
        id: calendar.id,
        key: calendar.key,
        name: calendar.name,
        timezone: calendar.timezone,
        weeklyHours: toJsonValue(calendar.weeklyHours),
        isActive: calendar.isActive,
        holidays: calendar.holidays.map((holiday) => ({
          date: toIsoDate(holiday.date),
          name: holiday.name,
        })),
      })),
      profiles: profiles.map((profile) => ({
        id: profile.id,
        key: profile.key,
        name: profile.name,
        description: profile.description,
        calendarId: profile.calendarId,
        isActive: profile.isActive,
      })),
      rules: slaRules.map((rule) => ({
        id: rule.id,
        slaProfileId: rule.slaProfileId,
        priority: rule.priority,
        responseMinutes: rule.responseMinutes,
        resolutionMinutes: rule.resolutionMinutes,
        evaluationOrder: rule.evaluationOrder,
        organizationalUnitId: rule.organizationalUnitId,
        serviceId: rule.serviceId,
      })),
      escalations: escalations.map((rule) => ({
        id: rule.id,
        slaProfileId: rule.slaProfileId,
        triggerOffsetMinutes: rule.triggerOffsetMinutes,
        targetGroupId: rule.targetGroupId,
      })),
      priorityMatrix: matrix.map((rule) => ({
        id: rule.id,
        impact: rule.impact,
        urgency: rule.urgency,
        priority: rule.priority,
      })),
    },
    catalog: {
      services: services.map(toServiceSnapshot),
    },
    forms: {
      versions: forms.map(toFormVersionSnapshot),
    },
    references: {
      organizationalUnits: units,
      groups,
    },
    templates: {
      responseTemplates: responseTemplates.map((template) => ({
        ...template,
        deletedAt: template.deletedAt?.toISOString() ?? null,
      })),
      playbooks: playbooks.map((playbook) => ({
        ...playbook,
        deletedAt: playbook.deletedAt?.toISOString() ?? null,
      })),
    },
  };
}
