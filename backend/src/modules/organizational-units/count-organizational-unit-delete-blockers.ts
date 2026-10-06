import type { PrismaService } from '../../common/prisma/prisma.service';
import type { OrganizationalUnitDeleteBlocker } from './organizational-unit-delete.types';

export async function countOrganizationalUnitDeleteBlockers(
  prisma: PrismaService,
  organizationalUnitId: string,
): Promise<readonly OrganizationalUnitDeleteBlocker[]> {
  const [
    children,
    mappedUsers,
    groups,
    assets,
    assetContracts,
    softwareLicenses,
    assetSignatories,
    changeRequests,
    knowledgeArticles,
    knowledgeInterceptResolutions,
    problems,
    routingRules,
    slaRules,
    reportSchedules,
    tickets,
  ] = await Promise.all([
    prisma.organizationalUnit.count({ where: { parentId: organizationalUnitId } }),
    prisma.user.count({ where: { organizationalUnitId } }),
    prisma.group.count({ where: { organizationalUnitId } }),
    prisma.asset.count({ where: { organizationalUnitId } }),
    prisma.assetContract.count({ where: { organizationalUnitId } }),
    prisma.softwareLicense.count({ where: { organizationalUnitId } }),
    prisma.assetSignatory.count({ where: { organizationalUnitId } }),
    prisma.changeRequest.count({ where: { organizationalUnitId } }),
    prisma.knowledgeArticle.count({ where: { organizationalUnitId } }),
    prisma.knowledgeInterceptResolution.count({ where: { organizationalUnitId } }),
    prisma.problem.count({ where: { organizationalUnitId } }),
    prisma.routingRule.count({ where: { originUnitId: organizationalUnitId } }),
    prisma.slaRule.count({ where: { organizationalUnitId } }),
    prisma.reportSchedule.count({ where: { organizationalUnitId } }),
    prisma.ticket.count({ where: { originUnitId: organizationalUnitId } }),
  ]);

  const blockers: readonly OrganizationalUnitDeleteBlocker[] = [
    { kind: 'children', count: children },
    { kind: 'mappedUsers', count: mappedUsers },
    { kind: 'groups', count: groups },
    { kind: 'assets', count: assets },
    { kind: 'assetContracts', count: assetContracts },
    { kind: 'softwareLicenses', count: softwareLicenses },
    { kind: 'assetSignatories', count: assetSignatories },
    { kind: 'changeRequests', count: changeRequests },
    { kind: 'knowledgeArticles', count: knowledgeArticles },
    { kind: 'knowledgeInterceptResolutions', count: knowledgeInterceptResolutions },
    { kind: 'problems', count: problems },
    { kind: 'routingRules', count: routingRules },
    { kind: 'slaRules', count: slaRules },
    { kind: 'reportSchedules', count: reportSchedules },
    { kind: 'tickets', count: tickets },
  ];
  return blockers.filter((blocker) => blocker.count > 0);
}
