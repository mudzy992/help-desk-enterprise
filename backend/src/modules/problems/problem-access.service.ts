import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { readPrincipalContext, type AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { permissionKeys } from '../authorization/authorization.constants';
import {
  assetViewerFromContext,
  isPathInScope,
  resolveAssetScope,
  viewerHasPermission,
  type AssetScope,
  type AssetViewer,
} from '../assets/asset-viewer';
import { problemDefaults, parseRootCauseCategories } from '../settings/definitions/problem-settings';
import { settingKeys } from '../settings/setting-keys';
import { SettingsService } from '../settings/settings.service';
import { ProblemError, problemErrorCodes } from './problems.constants';

/** Same grant/scope model as the CMDB, restricted to `problem.*` permissions. */
export type ProblemViewer = AssetViewer;
export type ProblemScope = AssetScope;

export function problemViewerOf(request: AuthenticatedHttpRequest, userId: string): ProblemViewer {
  return assetViewerFromContext(readPrincipalContext(request), userId, 'problem.');
}

export type ProblemConfiguration = {
  readonly numberPrefix: string;
  readonly rootCauseCategories: readonly string[];
  readonly requireWorkaroundForKnownError: boolean;
  readonly autoCloseDays: number;
  readonly bulkResolveMax: number;
  readonly targetEnabled: boolean;
};

export type ProblemCapabilities = {
  readonly enabled: boolean;
  readonly canRead: boolean;
  readonly canManage: boolean;
  readonly canClose: boolean;
  readonly configuration: ProblemConfiguration | null;
};

/**
 * Paket 3.3 (§12, §13): addon switch, settings and unit scope. Routes carry no
 * @RequirePermissions (the global check rejects unit-bound grants on routes
 * without a unit scope), so every rule is enforced here.
 */
@Injectable()
export class ProblemAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  private async readSetting<T>(key: string, fallback: T): Promise<T> {
    try {
      const value = await this.settings.getSetting(key);
      return value === undefined || value === null ? fallback : (value as T);
    } catch {
      return fallback;
    }
  }

  async isEnabled(): Promise<boolean> {
    return (await this.readSetting<unknown>(settingKeys.privateAddonsProblems, false)) === true;
  }

  async configuration(): Promise<ProblemConfiguration> {
    const [prefix, categories, requireWorkaround, autoClose, bulkMax, target] = await Promise.all([
      this.readSetting<unknown>(settingKeys.privateProblemsNumberPrefix, problemDefaults.numberPrefix),
      this.readSetting<unknown>(settingKeys.privateProblemsRootCauseCategories, problemDefaults.rootCauseCategories),
      this.readSetting<unknown>(settingKeys.privateProblemsRequireWorkaroundForKnownError, problemDefaults.requireWorkaroundForKnownError),
      this.readSetting<unknown>(settingKeys.privateProblemsAutoCloseDays, problemDefaults.autoCloseDays),
      this.readSetting<unknown>(settingKeys.privateProblemsBulkResolveMax, problemDefaults.bulkResolveMax),
      this.readSetting<unknown>(settingKeys.privateProblemsTargetEnabled, problemDefaults.targetEnabled),
    ]);
    const integer = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isInteger(value) ? value : fallback);
    return {
      numberPrefix: typeof prefix === 'string' ? prefix : problemDefaults.numberPrefix,
      rootCauseCategories: parseRootCauseCategories(categories) ?? parseRootCauseCategories(problemDefaults.rootCauseCategories) ?? [],
      requireWorkaroundForKnownError: requireWorkaround === true,
      autoCloseDays: integer(autoClose, problemDefaults.autoCloseDays),
      bulkResolveMax: integer(bulkMax, problemDefaults.bulkResolveMax),
      targetEnabled: target === true,
    };
  }

  async requireEnabled(): Promise<void> {
    if (!(await this.isEnabled())) throw new ProblemError(problemErrorCodes.disabled);
  }

  async homeUnitPath(viewer: ProblemViewer): Promise<string | null> {
    if (viewer.homeOrganizationalUnitId === null) return null;
    const unit = await this.prisma.organizationalUnit.findUnique({
      where: { id: viewer.homeOrganizationalUnitId },
      select: { ouPath: true },
    });
    return unit?.ouPath ?? null;
  }

  /** Module on + permission held; returns the unit scope of that permission. */
  async require(viewer: ProblemViewer, permission: string): Promise<ProblemScope> {
    await this.requireEnabled();
    if (!viewerHasPermission(viewer, permission)) throw new ProblemError(problemErrorCodes.forbidden);
    return resolveAssetScope(viewer, permission, await this.homeUnitPath(viewer));
  }

  hasPermission(viewer: ProblemViewer, permission: string): boolean {
    return viewerHasPermission(viewer, permission);
  }

  async scopeOf(viewer: ProblemViewer, permission: string): Promise<ProblemScope> {
    return resolveAssetScope(viewer, permission, await this.homeUnitPath(viewer));
  }

  /** The unit must exist and be inside the scope (writes into a unit). */
  async requireUnitInScope(scope: ProblemScope, organizationalUnitId: string): Promise<{ id: string; ouPath: string; name: string }> {
    const unit = await this.prisma.organizationalUnit.findUnique({
      where: { id: organizationalUnitId },
      select: { id: true, ouPath: true, name: true },
    });
    if (unit === null) throw new ProblemError(problemErrorCodes.unitNotFound);
    if (!isPathInScope(scope, unit.ouPath)) throw new ProblemError(problemErrorCodes.outOfScope);
    return unit;
  }

  async capabilities(viewer: ProblemViewer): Promise<ProblemCapabilities> {
    const enabled = await this.isEnabled();
    const has = (permission: string) => enabled && viewerHasPermission(viewer, permission);
    const canRead = has(permissionKeys.problemRead);
    return {
      enabled,
      canRead,
      canManage: canRead && has(permissionKeys.problemManage),
      canClose: canRead && has(permissionKeys.problemClose),
      configuration: canRead ? await this.configuration() : null,
    };
  }
}
