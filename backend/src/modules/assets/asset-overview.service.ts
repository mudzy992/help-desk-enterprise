import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { permissionKeys } from '../authorization/authorization.constants';
import {
  overAllocatedLicenses,
  rankAssetsByTickets,
  selectExpiring,
  selectHolderProblems,
} from '../reports/packs/build-asset-reports';
import { loadAssetReportData } from '../reports/packs/load-asset-report-data';
import { settingKeys } from '../settings/setting-keys';
import { AssetAccessService } from './asset-access.service';
import { unitScopeWhere, type AssetViewer } from './asset-viewer';

export const assetOverviewLimits = {
  expiringDays: 30,
  ticketWindowDays: 90,
  topAssets: 5,
  listItems: 10,
} as const;

/**
 * Paket 3.2 C9b: the asset manager overview (`asset.report.read`, unit
 * scope). The cards reuse the pure builders of the CMDB report packs, so the
 * overview and the reports never disagree.
 */
@Injectable()
export class AssetOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AssetAccessService,
  ) {}

  async overview(viewer: AssetViewer, now: Date = new Date()) {
    const scope = await this.access.require(viewer, permissionKeys.assetReportRead);
    const unitWhere = unitScopeWhere(scope);
    const unitIds =
      unitWhere === null
        ? null
        : (await this.prisma.organizationalUnit.findMany({ where: unitWhere, select: { id: true } })).map((unit) => unit.id);
    const localeSetting = await this.access.readSetting<unknown>(settingKeys.privateI18nDefaultLocale, 'bs');
    const locale = typeof localeSetting === 'string' && localeSetting.toLowerCase().startsWith('en') ? 'en' : 'bs';
    const window = { from: new Date(now.getTime() - assetOverviewLimits.ticketWindowDays * 86_400_000), to: now };
    const assetScope = unitIds === null ? {} : { organizationalUnitId: { in: unitIds } };
    const [data, statusGroups, suggested, missing] = await Promise.all([
      loadAssetReportData(this.prisma, {
        unitIds,
        parts: new Set(['expiring', 'licenses', 'ticketLinks', 'holders']),
        window,
        now,
        locale,
        horizonDays: assetOverviewLimits.expiringDays,
      }),
      this.prisma.asset.groupBy({ by: ['status'], where: assetScope, _count: { _all: true } }),
      this.prisma.asset.count({ where: { ...assetScope, assignmentSuggested: true, assignedUserId: { not: null } } }),
      this.prisma.asset.count({ where: { ...assetScope, missingFromDirectoryAt: { not: null }, status: { notIn: ['DISPOSED', 'RETIRED'] } } }),
    ]);
    const expiring = selectExpiring(data, assetOverviewLimits.expiringDays);
    const holders = selectHolderProblems(data);
    const over = overAllocatedLicenses(data);
    return {
      generatedAt: now.toISOString(),
      byStatus: statusGroups
        .map((group) => ({ status: group.status, count: group._count._all }))
        .sort((left, right) => right.count - left.count),
      expiring: {
        days: assetOverviewLimits.expiringDays,
        total: expiring.length,
        items: expiring.slice(0, assetOverviewLimits.listItems).map((item) => ({
          kind: item.kind,
          name: item.name,
          reference: item.reference,
          unitName: item.unitName,
          endsAt: item.endsAt.toISOString().slice(0, 10),
        })),
      },
      overAllocatedLicenses: {
        total: over.length,
        items: over.slice(0, assetOverviewLimits.listItems).map((license) => ({
          productName: license.productName,
          unitName: license.unitName,
          seats: license.seats,
          used: license.used,
        })),
      },
      topAssets: {
        days: assetOverviewLimits.ticketWindowDays,
        items: rankAssetsByTickets(data, assetOverviewLimits.topAssets),
      },
      directory: { suggested, missing },
      holders: {
        total: holders.length,
        items: holders.slice(0, assetOverviewLimits.listItems).map((holder) => ({
          assetTag: holder.assetTag,
          assetName: holder.assetName,
          holderName: holder.holderName,
          reason: holder.reason,
          holderUnitName: holder.holderUnitName,
          assetUnitName: holder.assetUnitName,
        })),
      },
    };
  }
}
