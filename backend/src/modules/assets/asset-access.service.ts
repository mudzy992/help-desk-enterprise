import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { permissionKeys } from '../authorization/authorization.constants';
import { settingKeys } from '../settings/setting-keys';
import { SettingsService } from '../settings/settings.service';
import { AssetError, assetErrorCodes } from './assets.constants';
import {
  isPathInScope,
  resolveAssetScope,
  viewerHasPermission,
  type AssetScope,
  type AssetViewer,
} from './asset-viewer';

export type AssetCapabilities = {
  readonly enabled: boolean;
  readonly canRead: boolean;
  readonly canManage: boolean;
  readonly canImport: boolean;
  readonly canManageLicenses: boolean;
  readonly canManageContracts: boolean;
  readonly canManageTypes: boolean;
  readonly canReadReports: boolean;
  readonly canDelete: boolean;
  readonly ticketPickerEnabled: boolean;
  /** C9c: `private.assets.locations.enabled`. */
  readonly locationsEnabled: boolean;
  /** The viewer has equipment assigned ("My equipment" in the menu). */
  readonly hasOwnAssets: boolean;
};

/**
 * Paket 3.2 (§2, §14, §15): the addon switch, settings and the unit scope of
 * the viewer. Every asset service goes through here, so "module off" and
 * "out of scope" behave the same everywhere.
 */
@Injectable()
export class AssetAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async readSetting<T>(key: string, fallback: T): Promise<T> {
    try {
      const value = await this.settings.getSetting(key);
      return value === undefined || value === null ? fallback : (value as T);
    } catch {
      return fallback;
    }
  }

  async isEnabled(): Promise<boolean> {
    return (await this.readSetting<unknown>(settingKeys.privateAddonsCmdb, false)) === true;
  }

  /** C9c: locations are optional; stored values are kept while switched off. */
  async locationsEnabled(): Promise<boolean> {
    return (await this.readSetting<unknown>(settingKeys.privateAssetsLocationsEnabled, false)) === true;
  }

  async requireEnabled(): Promise<void> {
    if (!(await this.isEnabled())) throw new AssetError(assetErrorCodes.disabled);
  }

  async homeUnitPath(viewer: AssetViewer): Promise<string | null> {
    if (viewer.homeOrganizationalUnitId === null) return null;
    const unit = await this.prisma.organizationalUnit.findUnique({
      where: { id: viewer.homeOrganizationalUnitId },
      select: { ouPath: true },
    });
    return unit?.ouPath ?? null;
  }

  async scope(viewer: AssetViewer, permission: string): Promise<AssetScope> {
    return resolveAssetScope(viewer, permission, await this.homeUnitPath(viewer));
  }

  /** Module on + permission held; returns the unit scope of that permission. */
  async require(viewer: AssetViewer, permission: string): Promise<AssetScope> {
    await this.requireEnabled();
    if (!viewerHasPermission(viewer, permission)) throw new AssetError(assetErrorCodes.forbidden);
    return this.scope(viewer, permission);
  }

  /** The unit must exist and be inside the scope (writes into a unit). */
  async requireUnitInScope(scope: AssetScope, organizationalUnitId: string): Promise<{ id: string; ouPath: string; name: string }> {
    const unit = await this.prisma.organizationalUnit.findUnique({
      where: { id: organizationalUnitId },
      select: { id: true, ouPath: true, name: true },
    });
    if (unit === null) throw new AssetError(assetErrorCodes.unitNotFound);
    if (!isPathInScope(scope, unit.ouPath)) throw new AssetError(assetErrorCodes.outOfScope);
    return unit;
  }

  async capabilities(viewer: AssetViewer): Promise<AssetCapabilities> {
    const enabled = await this.isEnabled();
    const has = (permission: string) => enabled && viewerHasPermission(viewer, permission);
    const hasOwnAssets =
      enabled &&
      (await this.prisma.asset.count({ where: { assignedUserId: viewer.userId, status: { in: ['IN_USE', 'IN_REPAIR'] } } })) > 0;
    const ticketPickerEnabled =
      enabled && (await this.readSetting<unknown>(settingKeys.privateAssetsTicketPickerEnabled, true)) === true;
    const locationsEnabled = enabled && (await this.locationsEnabled());
    return {
      enabled,
      canRead: has(permissionKeys.assetRead),
      canManage: has(permissionKeys.assetManage),
      canImport: has(permissionKeys.assetImport),
      canManageLicenses: has(permissionKeys.assetLicenseManage),
      canManageContracts: has(permissionKeys.assetContractManage),
      canManageTypes: has(permissionKeys.assetTypeManage),
      canReadReports: has(permissionKeys.assetReportRead),
      canDelete: enabled && viewer.isSuperAdmin,
      ticketPickerEnabled,
      locationsEnabled,
      hasOwnAssets,
    };
  }
}
