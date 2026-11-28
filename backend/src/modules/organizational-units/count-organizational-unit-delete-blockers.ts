import type { PrismaService } from '../../common/prisma/prisma.service';
import type { OrganizationalUnitDeleteBlocker } from './organizational-unit-delete.types';

/**
 * W2.37b: the manual-only catalogue mirrors the OU tree. Deleting a tree unit
 * used to leave its catalogue row behind, which then blocked re-creating the
 * same path (`DUPLICATE_PATH`) and kept the unit visible as a parent on a screen
 * that reads the tree. The catalogue is therefore part of the delete preflight:
 *
 * - `directoryChildren` — catalogue rows under this path that describe units the
 *   tree does not have (a stale mirror); they must be cleaned before the tree
 *   row can go, exactly like real children;
 * - `directoryUsers` / `directoryGroups` — directory entries mapped to the path or
 *   anything below it; deleting the unit would orphan them.
 *
 * Counting is done by path, not by the catalogue's external id: the id is a hash
 * of the path, and a stale row may have been written from the other flow.
 */
export async function countOrganizationalUnitDeleteBlockers(
  prisma: PrismaService,
  unit: { readonly id: string; readonly ouPath: string },
): Promise<readonly OrganizationalUnitDeleteBlocker[]> {
  const descendantPathPrefix = `${unit.ouPath}/`;
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
    directoryChildren,
    directoryUsers,
    directoryGroups,
  ] = await Promise.all([
    prisma.organizationalUnit.count({ where: { parentId: unit.id } }),
    prisma.user.count({ where: { organizationalUnitId: unit.id } }),
    prisma.group.count({ where: { organizationalUnitId: unit.id } }),
    prisma.asset.count({ where: { organizationalUnitId: unit.id } }),
    prisma.assetContract.count({ where: { organizationalUnitId: unit.id } }),
    prisma.softwareLicense.count({ where: { organizationalUnitId: unit.id } }),
    prisma.assetSignatory.count({ where: { organizationalUnitId: unit.id } }),
    prisma.changeRequest.count({ where: { organizationalUnitId: unit.id } }),
    prisma.knowledgeArticle.count({ where: { organizationalUnitId: unit.id } }),
    prisma.knowledgeInterceptResolution.count({
      where: { organizationalUnitId: unit.id },
    }),
    prisma.problem.count({ where: { organizationalUnitId: unit.id } }),
    prisma.routingRule.count({ where: { originUnitId: unit.id } }),
    prisma.slaRule.count({ where: { organizationalUnitId: unit.id } }),
    prisma.reportSchedule.count({ where: { organizationalUnitId: unit.id } }),
    prisma.ticket.count({ where: { originUnitId: unit.id } }),
    prisma.manualDirectoryOrganizationalUnit.count({
      where: { organizationalUnitPath: { startsWith: descendantPathPrefix } },
    }),
    prisma.manualDirectoryUser.count({
      where: {
        OR: [
          { organizationalUnitPath: unit.ouPath },
          { organizationalUnitPath: { startsWith: descendantPathPrefix } },
        ],
      },
    }),
    prisma.manualDirectoryGroup.count({
      where: {
        OR: [
          { organizationalUnitPath: unit.ouPath },
          { organizationalUnitPath: { startsWith: descendantPathPrefix } },
        ],
      },
    }),
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
    { kind: 'directoryChildren', count: directoryChildren },
    { kind: 'directoryUsers', count: directoryUsers },
    { kind: 'directoryGroups', count: directoryGroups },
  ];
  return blockers.filter((blocker) => blocker.count > 0);
}
