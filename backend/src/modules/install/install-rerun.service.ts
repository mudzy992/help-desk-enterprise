import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { settingKeys } from '../settings/setting-keys';
import { SETTINGS_REGISTRY } from '../settings/settings.registry-token';
import type { SettingsRegistry } from '../settings/settings.types';
import { SettingsService } from '../settings/settings.service';
import { findInstallSuperAdmin } from './find-install-super-admin';
import { installRerunConstants } from './install-rerun.constants';
import { InstallSetupService } from './install-setup.service';
import type { InstallRerunRequest, InstallRerunResult } from './install-rerun.types';
import { isInstallSetupComplete } from './is-install-setup-complete';
import { mapInstallRerunError } from './map-install-rerun-error';
import { assertInstallRerunAllowed } from './read-install-rerun-allowed';
import {
  planInstallRerunClears,
  resolveInstallRerunKeys,
  type InstallRerunClear,
} from './plan-install-rerun';

/**
 * Owner decision 6: `POST /install/restart` is the ops-only way back into the
 * wizard. It writes only keys the wizard itself owns, through the same settings
 * service as every other writer (validation, change log, cache invalidation) and
 * under the reason `install_wizard_rerun`, so the change log says what was
 * reopened — and, when a founder account exists, who is named as the actor.
 *
 * The call is idempotent: on a system that is already open it changes nothing and
 * reports `alreadyOpen`, which is what a deploy script wants.
 */
@Injectable()
export class InstallRerunService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SETTINGS_REGISTRY) private readonly registry: SettingsRegistry,
    private readonly settingsService: SettingsService,
    private readonly installSetupService: InstallSetupService,
  ) {}

  async restart(request: InstallRerunRequest = {}): Promise<InstallRerunResult> {
    try {
      // Owner decision 6: the environment switch is the first gate — the route is
      // never reachable „by accident“ from a deployment that did not opt in.
      assertInstallRerunAllowed();
      return await this.execute(request);
    } catch (error) {
      throw mapInstallRerunError(error);
    }
  }

  private async execute(request: InstallRerunRequest): Promise<InstallRerunResult> {
    const includeStepMarkers = request.includeStepMarkers === true;
    const currentByKey = await this.readCurrentValues(
      resolveInstallRerunKeys({ includeStepMarkers }),
    );
    const completedAt = currentByKey.get(settingKeys.privateInstallCompletedAt);
    const isCompleted = isInstallSetupComplete(completedAt);
    const clears = planInstallRerunClears({
      registry: this.registry,
      currentByKey,
      includeStepMarkers,
    });
    if (clears.length > 0) {
      await this.clear(clears);
    }
    const status = await this.installSetupService.getStatus();
    return {
      restarted: isCompleted,
      alreadyOpen: !isCompleted,
      includeStepMarkers,
      previousCompletedAt: isCompleted && typeof completedAt === 'string' ? completedAt : null,
      clearedKeys: clears.map((clear) => clear.definition.key),
      // `nextStep` is optional on the status (a finished installation does not
      // need it); when the status omits it the wizard is at the final screen.
      nextStep: status.nextStep ?? 'complete',
    };
  }

  /** The values as the settings service hands them out (defaults filled in). */
  private async readCurrentValues(keys: readonly string[]): Promise<ReadonlyMap<string, unknown>> {
    const currentByKey = new Map<string, unknown>();
    for (const key of keys) {
      currentByKey.set(key, await this.settingsService.getSetting(key));
    }
    return currentByKey;
  }

  private async clear(clears: readonly InstallRerunClear[]): Promise<void> {
    const superAdmin = await findInstallSuperAdmin(this.prisma);
    await this.settingsService.setSettingValues(
      clears.map((clear) => ({
        key: clear.definition.key,
        value: clear.value,
      })),
      {
        reason: installRerunConstants.changeLogReason,
        // Ops acts without a session; the founder account is the closest
        // attribution the change log can carry (`null` means "the server").
        actorUserId: superAdmin?.id ?? null,
      },
    );
  }
}
