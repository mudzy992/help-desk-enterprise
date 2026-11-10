import type { PrismaService } from '../../../common/prisma/prisma.service';
import type { ConfigReferenceIndex } from './config-package.types';

/** Natural keys of every entity a config snapshot can reference, for one environment. */
export async function loadConfigReferenceIndex(prisma: PrismaService): Promise<ConfigReferenceIndex> {
  const [units, groups, services, categories, packs, calendars, profiles, templates, playbooks, forms] =
    await Promise.all([
      prisma.organizationalUnit.findMany({ select: { id: true, ouPath: true } }),
      prisma.group.findMany({ select: { id: true, key: true } }),
      prisma.service.findMany({ select: { id: true, slug: true } }),
      prisma.serviceCategory.findMany({ select: { id: true, slug: true } }),
      prisma.policyPack.findMany({ select: { id: true, key: true } }),
      prisma.businessHoursCalendar.findMany({ select: { id: true, key: true } }),
      prisma.slaProfile.findMany({ select: { id: true, key: true } }),
      prisma.responseTemplate.findMany({ where: { ownerUserId: null }, select: { id: true, name: true } }),
      prisma.playbook.findMany({ select: { id: true, name: true } }),
      prisma.formVersion.findMany({ select: { id: true, version: true, service: { select: { slug: true } } } }),
    ]);
  return {
    organizationalUnits: units.map((unit) => ({ id: unit.id, key: unit.ouPath })),
    groups: groups.map((group) => ({ id: group.id, key: group.key })),
    services: services.map((service) => ({ id: service.id, key: service.slug })),
    serviceCategories: categories.map((category) => ({ id: category.id, key: category.slug })),
    policyPacks: packs.map((pack) => ({ id: pack.id, key: pack.key })),
    calendars: calendars.map((calendar) => ({ id: calendar.id, key: calendar.key })),
    slaProfiles: profiles.map((profile) => ({ id: profile.id, key: profile.key })),
    responseTemplates: templates.map((template) => ({ id: template.id, key: template.name })),
    playbooks: playbooks.map((playbook) => ({ id: playbook.id, key: playbook.name })),
    formVersions: forms.map((form) => ({ id: form.id, key: `${form.service.slug}@${form.version}` })),
  };
}
